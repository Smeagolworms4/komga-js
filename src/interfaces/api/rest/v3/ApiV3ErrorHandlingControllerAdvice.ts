// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/v3/ApiV3ErrorHandlingControllerAdvice.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { type HttpHeaders, HttpStatus, type MethodArgumentNotValidException, type ResponseEntity, type WebRequest, controllerAdvice, exceptionArg } from '../../../../port/spring-web.js'
import { ProblemDetail } from '../../../../port/spring-web-dispatcher.js'
import { ResponseEntityExceptionHandler, responseEntityExceptionHandlers } from '../../../../port/spring-web-exception-handler.js'
import { ConstraintViolationException } from '../../../../port/validation-engine.js'

/**
 * Applies strictly to controllers in the `v3` subpackage.
 * Emits RFC 9457 ProblemDetail error responses.
 */
export class ApiV3ErrorHandlingControllerAdvice extends ResponseEntityExceptionHandler {
  protected override handleMethodArgumentNotValid(ex: MethodArgumentNotValidException, headers: HttpHeaders, status: HttpStatus | number, request: WebRequest): ResponseEntity<unknown> | null {
    const body = ex.updateAndGetBody(this.messageSource, null)
    const violations = ex.bindingResult.fieldErrors.map((it) => new Violation({ field: it.field, message: it.defaultMessage }))
    body.setProperty('violations', violations)
    return this.handleExceptionInternal(ex, body, headers, status, request)
  }

  // @ExceptionHandler(ConstraintViolationException::class)
  onConstraintValidationException(e: ConstraintViolationException): ProblemDetail {
    const problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, 'Validation failed for parameter constraints.')
    const violations = [...e.constraintViolations].map((it) => {
      // PORT: propertyPath.toString().substringAfterLast('.')
      const path = it.propertyPath.toString()
      return new Violation({ field: path.slice(path.lastIndexOf('.') + 1), message: it.message })
    })
    problemDetail.setProperty('violations', violations)
    return problemDetail
  }
}

type ViolationParams = {
  field?: string | null
  message?: string | null
}

export class Violation extends DataClass<ViolationParams> {
  readonly field: string | null
  readonly message: string | null

  constructor({ field = null, message = null }: ViolationParams = {}) {
    super()
    this.field = field
    this.message = message
  }
}

jsonProperties(Violation, { field: { nullable: 'String' }, message: { nullable: 'String' } })

// @RestControllerAdvice(basePackages = ["org.gotson.komga.interfaces.api.rest.v3"])
controllerAdvice(ApiV3ErrorHandlingControllerAdvice, {
  basePackages: ['org.gotson.komga.interfaces.api.rest.v3'],
  exceptionHandlers: {
    ...responseEntityExceptionHandlers,
    onConstraintValidationException: { exceptions: [ConstraintViolationException], args: [exceptionArg()], returns: { class: ProblemDetail } },
  },
})
