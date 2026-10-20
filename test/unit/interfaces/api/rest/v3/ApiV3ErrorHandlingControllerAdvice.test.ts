// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/v3/ApiV3ErrorHandlingControllerAdviceOracleTest.kt
import { PasswordUpdateDto } from '../../../../../../src/interfaces/api/rest/dto/PasswordUpdateDto.js'
import { ApiV3ErrorHandlingControllerAdvice } from '../../../../../../src/interfaces/api/rest/v3/ApiV3ErrorHandlingControllerAdvice.js'
import type { ProblemDetail } from '../../../../../../src/port/spring-web-dispatcher.js'
import { ServletWebRequest } from '../../../../../../src/port/spring-web-filter.js'
import { MethodArgumentNotValidException, MethodArgumentTypeMismatchException, MissingServletRequestParameterException } from '../../../../../../src/port/spring-web.js'
import { ConstraintViolationException, validate } from '../../../../../../src/port/validation-engine.js'
import { oracle } from '../../../../oracle.js'
import { describeEntity, request, response } from '../../../../web-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/v3/ApiV3ErrorHandlingControllerAdvice')

const advice = new ApiV3ErrorHandlingControllerAdvice()
const notValid = (...errors: [string, string | null][]) =>
  new MethodArgumentNotValidException(errors.map(([field, message]) => ({ field, message: message as string, rejectedValue: 'rejected' })), [], 'passwordUpdateDto')
const problem = (p: ProblemDetail | null) => (p === null ? null : [p.type, p.title, p.status, p.detail, p.instance, p.properties])

function handle(ex: Error): unknown {
  const r = advice.handleException(ex, new ServletWebRequest(request({ uri: '/api/v3/notable-entities' }), response()))
  if (r === null) return null
  const d = describeEntity(r)
  return [d[0], d[1], problem(r.body as ProblemDetail | null)]
}

func('handleMethodArgumentNotValid', () => {
  kase('no error', () => handle(notValid()))
  kase('errors in order', () => handle(notValid(['password', 'must not be blank'], ['other', null])))
})
func('onConstraintValidationException', () => {
  kase('no violation', () => problem(advice.onConstraintValidationException(new ConstraintViolationException(new Set()))))
  kase('one violation', () => problem(advice.onConstraintValidationException(new ConstraintViolationException(validate(new PasswordUpdateDto({ password: '' }))))))
})
func('handleException', () => {
  kase('type mismatch', () =>
    handle(
      new MethodArgumentTypeMismatchException("Method parameter 'unpaged': Failed to convert value of type 'java.lang.String' to required type 'boolean'", 'unpaged', 'abc'),
    ),
  )
  kase('missing parameter', () => handle(new MissingServletRequestParameterException("Required request parameter 'search' for method parameter type String is not present")))
})
