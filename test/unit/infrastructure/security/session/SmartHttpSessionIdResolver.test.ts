// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/session/SmartHttpSessionIdResolverOracleTest.kt
import { SmartHttpSessionIdResolver } from '../../../../../src/infrastructure/security/session/SmartHttpSessionIdResolver.js'
import { DefaultCookieSerializer } from '../../../../../src/port/spring-session.js'
import { oracle } from '../../../oracle.js'
import { describeResponse, request, response } from '../../../web-oracle.js'

const { func, kase } = oracle('infrastructure/security/session/SmartHttpSessionIdResolver')

const serializer = new DefaultCookieSerializer()
serializer.setCookieName('KOMGA-SESSION')
const resolver = new SmartHttpSessionIdResolver('X-Auth-Token', serializer)

// "session-1" and "session-2" in base64
const b64one = 'c2Vzc2lvbi0x'
const b64two = 'c2Vzc2lvbi0y'

function set(sessionId: string, headers: [string, string][] = [], scheme = 'http'): unknown[] {
  const res = response()
  resolver.setSessionId(request({ uri: '/api/v1/login', headers, scheme, port: scheme === 'https' ? 443 : 80 }), res, sessionId)
  return describeResponse(res)
}

function expire(headers: [string, string][] = []): unknown[] {
  const res = response()
  resolver.expireSession(request({ uri: '/api/logout', headers }), res)
  return describeResponse(res)
}

func('resolveSessionIds', () => {
  kase('nothing', () => resolver.resolveSessionIds(request()))
  kase('header', () => resolver.resolveSessionIds(request({ headers: [['X-Auth-Token', 'abc']] })))
  kase('header name case', () => resolver.resolveSessionIds(request({ headers: [['x-auth-token', 'abc']] })))
  kase('empty header', () => resolver.resolveSessionIds(request({ headers: [['X-Auth-Token', '']] })))
  kase('two headers', () => resolver.resolveSessionIds(request({ headers: [['X-Auth-Token', 'a'], ['X-Auth-Token', 'b']] })))
  kase('cookie', () => resolver.resolveSessionIds(request({ headers: [['Cookie', `KOMGA-SESSION=${b64one}`]] })))
  kase('two cookies', () => resolver.resolveSessionIds(request({ headers: [['Cookie', `KOMGA-SESSION=${b64one}; other=x; KOMGA-SESSION=${b64two}`]] })))
  kase('cookie not base64', () => resolver.resolveSessionIds(request({ headers: [['Cookie', 'KOMGA-SESSION=not*base64']] })))
  kase('cookie plain value', () => resolver.resolveSessionIds(request({ headers: [['Cookie', 'KOMGA-SESSION=abcd']] })))
  kase('cookie of another name', () => resolver.resolveSessionIds(request({ headers: [['Cookie', `SESSION=${b64one}`]] })))
  kase('header wins over cookie', () => resolver.resolveSessionIds(request({ headers: [['X-Auth-Token', 'h'], ['Cookie', `KOMGA-SESSION=${b64one}`]] })))
  kase('quoted cookie', () => resolver.resolveSessionIds(request({ headers: [['Cookie', `KOMGA-SESSION="${b64one}"`]] })))
})

func('setSessionId', () => {
  kase('cookie', () => set('session-1'))
  kase('cookie over https', () => set('session-1', [], 'https'))
  kase('cookie, same id already requested', () => set('session-1', [['Cookie', `KOMGA-SESSION=${b64one}`]]))
  kase('header', () => set('session-1', [['X-Auth-Token', 'old']]))
  kase('header, same id', () => set('session-1', [['X-Auth-Token', 'session-1']]))
  kase('unicode id cookie', () => set('sessiön-漫'))
})

func('expireSession', () => {
  kase('cookie', () => expire())
  kase('header', () => expire([['X-Auth-Token', 'abc']]))
})

func('getResolver', () => {
  kase('cookie resolver without header', () => set('x')[2])
  kase('header resolver with header', () => set('x', [['X-Auth-Token', 'y']])[2])
})
