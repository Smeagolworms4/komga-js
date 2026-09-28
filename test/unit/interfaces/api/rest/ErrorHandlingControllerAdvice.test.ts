// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/ErrorHandlingControllerAdviceOracleTest.kt
import { ErrorHandlingControllerAdvice } from '../../../../../src/interfaces/api/rest/ErrorHandlingControllerAdvice.js'
import { PasswordUpdateDto } from '../../../../../src/interfaces/api/rest/dto/PasswordUpdateDto.js'
import { MaxUploadSizeExceededException } from '../../../../../src/port/servlet.js'
import '../../../../../src/port/spring-web-dispatcher.js'
import { MethodArgumentNotValidException } from '../../../../../src/port/spring-web.js'
import { ConstraintViolationException, validate } from '../../../../../src/port/validation-engine.js'
import { oracle } from '../../../oracle.js'

const { func, kase } = oracle('interfaces/api/rest/ErrorHandlingControllerAdvice')

const advice = new ErrorHandlingControllerAdvice()
const notValid = (...errors: [string, string | null][]) =>
  new MethodArgumentNotValidException(errors.map(([field, message]) => ({ field, message: message as string, rejectedValue: 'rejected' })), [], 'passwordUpdateDto')
const problem = (e: MaxUploadSizeExceededException) => {
  const it = advice.handleMaxUploadSizeExceededException(e)
  return [it.type, it.title, it.status, it.detail, it.instance, it.properties]
}

func('onConstraintValidationException', () => {
  kase('no violation', () => advice.onConstraintValidationException(new ConstraintViolationException(new Set())))
  kase('one violation', () => advice.onConstraintValidationException(new ConstraintViolationException(validate(new PasswordUpdateDto({ password: '' })))))
})
func('onMethodArgumentNotValidException', () => {
  kase('no error', () => advice.onMethodArgumentNotValidException(notValid()))
  kase('errors in order', () => advice.onMethodArgumentNotValidException(notValid(['password', 'must not be blank'], ['other', null])))
})
func('handleEntityNotFound', () => {
  kase('unit', () => advice.handleEntityNotFound())
})
func('handleMaxUploadSizeExceededException', () => {
  kase('known size', () => problem(new MaxUploadSizeExceededException('Maximum upload size of 1024 bytes exceeded')))
  kase('unknown size', () => problem(new MaxUploadSizeExceededException('Maximum upload size exceeded')))
})
