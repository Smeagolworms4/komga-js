// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/LoginControllerOracleTest.kt
import { LoginController } from '../../../../../src/interfaces/api/rest/LoginController.js'
import type { HttpServletRequest, HttpServletResponse, HttpSession } from '../../../../../src/port/servlet.js'
import { CookieSerializer, type CookieValue } from '../../../../../src/port/spring-session.js'
import { oracle } from '../../../oracle.js'
import { Calls } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/LoginController')

const calls = new Calls()

/** Enregistre les valeurs de cookie écrites (même faux côté Kotlin) */
class FakeSerializer extends CookieSerializer {
  writeCookieValue(cookieValue: CookieValue): void {
    calls.add('writeCookieValue', cookieValue.cookieValue, cookieValue.cookieMaxAge)
  }
  readCookieValues(): string[] {
    return []
  }
}
const controller = new LoginController(new FakeSerializer())
const request = {} as HttpServletRequest
const response = {} as HttpServletResponse
const session = (id: string) => ({ id }) as HttpSession

func('convertHeaderSessionToCookie', () => {
  kase('session id', () => {
    controller.convertHeaderSessionToCookie(request, response, session('SESSION-1'))
    return calls.take()
  })
  kase('other session', () => [controller.convertHeaderSessionToCookie(request, response, session('abc-def')), calls.take()])
})
