// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/ErrorHandlingControllerAdvice.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { EntityNotFoundException } from '../../../domain/model/Exceptions.js'
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'
import { MaxUploadSizeExceededException } from '../../../port/servlet.js'
import { HttpStatus, MethodArgumentNotValidException, controllerAdvice, exceptionArg } from '../../../port/spring-web.js'
import type { ProblemDetail } from '../../../port/spring-web-dispatcher.js'
import { ConstraintViolationException } from '../../../port/validation-engine.js'

export class ErrorHandlingControllerAdvice {
  // @ExceptionHandler(ConstraintViolationException::class)
  // @ResponseStatus(HttpStatus.BAD_REQUEST)
  onConstraintValidationException(e: ConstraintViolationException): ValidationErrorResponse {
    return new ValidationErrorResponse({
      violations: [...e.constraintViolations].map((it) => new Violation({ fieldName: it.propertyPath.toString(), message: it.message })),
    })
  }

  // @ExceptionHandler(MethodArgumentNotValidException::class)
  // @ResponseStatus(HttpStatus.BAD_REQUEST)
  onMethodArgumentNotValidException(e: MethodArgumentNotValidException): ValidationErrorResponse {
    return new ValidationErrorResponse({
      violations: e.bindingResult.fieldErrors.map((it) => new Violation({ fieldName: it.field, message: it.defaultMessage })),
    })
  }

  // @ExceptionHandler(EntityNotFoundException::class)
  // @ResponseStatus(HttpStatus.NOT_FOUND)
  handleEntityNotFound(): void {}

  // @ExceptionHandler(MaxUploadSizeExceededException::class)
  handleMaxUploadSizeExceededException(e: MaxUploadSizeExceededException): ProblemDetail {
    return e.body
  }
}

type ValidationErrorResponseParams = {
  violations?: Violation[]
}

export class ValidationErrorResponse extends DataClass<ValidationErrorResponseParams> {
  readonly violations: Violation[]

  constructor({ violations = [] }: ValidationErrorResponseParams = {}) {
    super()
    this.violations = violations
  }
}

type ViolationParams = {
  fieldName?: string | null
  message?: string | null
}

export class Violation extends DataClass<ViolationParams> {
  readonly fieldName: string | null
  readonly message: string | null

  constructor({ fieldName = null, message = null }: ViolationParams = {}) {
    super()
    this.fieldName = fieldName
    this.message = message
  }
}

jsonProperties(ValidationErrorResponse, { violations: { list: { class: Violation } } })
jsonProperties(Violation, { fieldName: { nullable: 'String' }, message: { nullable: 'String' } })

// @RestControllerAdvice
// PORT: déclaré après ValidationErrorResponse (type de retour des @ExceptionHandler, lu pour le document OpenAPI)
controllerAdvice(ErrorHandlingControllerAdvice, {
  exceptionHandlers: {
    onConstraintValidationException: { exceptions: [ConstraintViolationException], responseStatus: HttpStatus.BAD_REQUEST, returns: { class: ValidationErrorResponse } },
    onMethodArgumentNotValidException: { exceptions: [MethodArgumentNotValidException], responseStatus: HttpStatus.BAD_REQUEST, returns: { class: ValidationErrorResponse } },
    handleEntityNotFound: { exceptions: [EntityNotFoundException], responseStatus: HttpStatus.NOT_FOUND, args: [] },
    handleMaxUploadSizeExceededException: { exceptions: [MaxUploadSizeExceededException], args: [exceptionArg()] },
  },
})
