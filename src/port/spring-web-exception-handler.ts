// Support de portage : org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler (Spring 6.2),
// classe de base d'un @ControllerAdvice qui répond aux exceptions de Spring MVC par un ProblemDetail (RFC 9457).
// Ce fichier n'a pas de jumeau Kotlin.
// Une sous-classe s'enregistre avec `controllerAdvice(X, { exceptionHandlers: { ...responseEntityExceptionHandlers, ... } })`.
import { MaxUploadSizeExceededException } from './servlet.js'
import {
  HandlerMethodValidationException,
  HttpHeaders,
  HttpMediaTypeNotAcceptableException,
  HttpMediaTypeNotSupportedException,
  HttpMessageNotReadableException,
  HttpRequestMethodNotSupportedException,
  type HttpStatus,
  MethodArgumentNotValidException,
  MethodArgumentTypeMismatchException,
  MissingServletRequestParameterException,
  NoResourceFoundException,
  ResponseEntity,
  ResponseStatusException,
  ServletRequestBindingException,
  type WebRequest,
  exceptionArg,
  webRequest,
} from './spring-web.js'
import {
  AsyncRequestTimeoutException,
  HttpMessageNotWritableException,
  MethodArgumentConversionNotSupportedException,
  MissingPathVariableException,
  MissingServletRequestPartException,
  NoHandlerFoundException,
  ProblemDetail,
  errorResponseOf,
} from './spring-web-dispatcher.js'

// `ErrorResponse.updateAndGetBody` de MethodArgumentNotValidException (corps par défaut : 400, « Invalid request content. »)
declare module './spring-web.js' {
  interface MethodArgumentNotValidException {
    updateAndGetBody(messageSource: unknown, locale: unknown): ProblemDetail
  }
}
MethodArgumentNotValidException.prototype.updateAndGetBody = function (): ProblemDetail {
  return ProblemDetail.forStatusAndDetail(400, 'Invalid request content.')
}

/** Exceptions de `@ExceptionHandler` sur `handleException` */
const HANDLED_EXCEPTIONS = [
  HttpRequestMethodNotSupportedException,
  HttpMediaTypeNotSupportedException,
  HttpMediaTypeNotAcceptableException,
  MissingPathVariableException,
  MissingServletRequestParameterException,
  MissingServletRequestPartException,
  ServletRequestBindingException,
  MethodArgumentNotValidException,
  HandlerMethodValidationException,
  NoHandlerFoundException,
  NoResourceFoundException,
  AsyncRequestTimeoutException,
  ResponseStatusException,
  MaxUploadSizeExceededException,
  MethodArgumentConversionNotSupportedException,
  MethodArgumentTypeMismatchException,
  HttpMessageNotReadableException,
  HttpMessageNotWritableException,
]

/** nom du paramètre d'un message « Required request parameter 'x' for method parameter type ... » */
function quotedName(message: string): string {
  return /'([^']*)'/.exec(message)?.[1] ?? ''
}

export abstract class ResponseEntityExceptionHandler {
  /** `getMessageSource()` : aucun MessageSource (détails par défaut) */
  protected readonly messageSource: unknown = null

  /** `@ExceptionHandler(...)` : traitement des exceptions standard de Spring MVC */
  handleException(ex: unknown, request: WebRequest): ResponseEntity<unknown> | null {
    const headers = new HttpHeaders()
    const info = errorResponseOf(ex)
    for (const [k, v] of info?.headers ?? []) headers.add(k, v)
    const problem = (status: number, detail: string | null) => this.handleExceptionInternal(ex, ProblemDetail.forStatusAndDetail(status, detail), headers, status, request)
    if (ex instanceof HttpRequestMethodNotSupportedException) return problem(405, info?.detail ?? null)
    if (ex instanceof HttpMediaTypeNotSupportedException) return problem(415, info?.detail ?? null)
    if (ex instanceof HttpMediaTypeNotAcceptableException) return problem(406, info?.detail ?? null)
    if (ex instanceof MissingPathVariableException) return problem(500, `Required path variable '${quotedName(ex.message)}' is not present.`)
    if (ex instanceof MissingServletRequestParameterException) return problem(400, `Required parameter '${quotedName(ex.message)}' is not present.`)
    if (ex instanceof MissingServletRequestPartException) return problem(400, `Required part '${quotedName(ex.message)}' is not present.`)
    if (ex instanceof ServletRequestBindingException) return problem(400, ex.message)
    if (ex instanceof MethodArgumentNotValidException) return this.handleMethodArgumentNotValid(ex, headers, 400, request)
    if (ex instanceof HandlerMethodValidationException) return problem(400, 'Validation failure')
    if (ex instanceof NoHandlerFoundException) return problem(404, `No endpoint ${ex.httpMethod} ${ex.requestURL}.`)
    if (ex instanceof NoResourceFoundException) return problem(404, info?.detail ?? ex.message)
    if (ex instanceof AsyncRequestTimeoutException) return problem(503, null)
    if (ex instanceof ResponseStatusException) {
      for (const [k, vs] of (ex as unknown as { headers?: HttpHeaders }).headers?.entries ?? []) for (const v of vs) headers.add(k, v)
      return problem(ex.status.value, ex.reason)
    }
    if (ex instanceof MaxUploadSizeExceededException) return this.handleExceptionInternal(ex, ex.body, headers, 413, request)
    if (ex instanceof MethodArgumentConversionNotSupportedException) return problem(500, ex.message)
    if (ex instanceof MethodArgumentTypeMismatchException) return problem(400, `Failed to convert '${ex.propertyName ?? ''}' with value: '${String(ex.value)}'`)
    if (ex instanceof HttpMessageNotReadableException) return problem(400, 'Failed to read request')
    if (ex instanceof HttpMessageNotWritableException) return problem(500, 'Failed to write request')
    // Unknown exception, typically a wrapper with a common MVC exception as cause
    // (since @ExceptionHandler type declarations also match nested causes):
    // We only deal with top-level MVC exceptions here, so let's rethrow the given
    // exception for further processing through the HandlerExceptionResolver chain.
    throw ex
  }

  protected handleMethodArgumentNotValid(ex: MethodArgumentNotValidException, headers: HttpHeaders, status: HttpStatus | number, request: WebRequest): ResponseEntity<unknown> | null {
    return this.handleExceptionInternal(ex, null, headers, status, request)
  }

  protected handleExceptionInternal(ex: unknown, body: unknown, headers: HttpHeaders, statusCode: HttpStatus | number, request: WebRequest): ResponseEntity<unknown> | null {
    if (body === null && ex instanceof MethodArgumentNotValidException) body = ex.updateAndGetBody(this.messageSource, null)
    // WebUtils.ERROR_EXCEPTION_ATTRIBUTE pour une erreur 500
    if ((typeof statusCode === 'number' ? statusCode : statusCode.value) === 500) request.request.setAttribute('jakarta.servlet.error.exception', ex)
    return new ResponseEntity(body, headers, statusCode)
  }
}

/** `@ExceptionHandler` hérité de ResponseEntityExceptionHandler, à ajouter aux handlers de la sous-classe */
export const responseEntityExceptionHandlers = {
  handleException: { exceptions: HANDLED_EXCEPTIONS, args: [exceptionArg(), webRequest()] },
}
