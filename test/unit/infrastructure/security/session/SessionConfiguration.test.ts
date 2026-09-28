// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/session/SessionConfigurationOracleTest.kt
import { Duration } from '@js-joda/core'
import { SessionConfiguration } from '../../../../../src/infrastructure/security/session/SessionConfiguration.js'
import type { ApplicationContext } from '../../../../../src/port/spring.js'
import { SecurityContext, UsernamePasswordAuthenticationToken } from '../../../../../src/port/spring-security.js'
import {
  CaffeineIndexedSessionRepository,
  type CookieSerializer,
  CookieValue,
  FindByIndexNameSessionRepository,
  ServerProperties,
} from '../../../../../src/port/spring-session.js'
import { afterAll } from 'vitest'
import { oracle } from '../../../oracle.js'
import { describeResponse, request, response } from '../../../web-oracle.js'

const { func, kase } = oracle('infrastructure/security/session/SessionConfiguration')

const config = new SessionConfiguration()

function writeCookie(serializer: CookieSerializer, value: string): unknown[] {
  const res = response()
  serializer.writeCookieValue(new CookieValue(request({ uri: '/api/v1/users/me' }), res, value))
  return describeResponse(res)
}

// PORT: ServerProperties construit depuis l'environnement (valeur par défaut 30m si absent)
function serverProperties(timeout: string | null): ServerProperties {
  return new ServerProperties({ environment: { getProperty: (k: string, d?: string) => (k === 'server.servlet.session.timeout' && timeout !== null ? timeout : (d ?? null)) } } as unknown as ApplicationContext)
}

function repository(timeout: Duration | null): unknown {
  const repo = new CaffeineIndexedSessionRepository()
  config.customizeSessionRepository(serverProperties(timeout === null ? null : `${timeout.toMillis()}ms`)).customize(repo)
  return repo.createSession().maxInactiveInterval
}

func('sessionCookieName', () => {
  kase('name', () => config.sessionCookieName())
})

func('sessionHeaderName', () => {
  kase('name', () => config.sessionHeaderName())
})

func('cookieSerializer', () => {
  kase('write cookie', () => writeCookie(config.cookieSerializer('KOMGA-SESSION'), 'session-1'))
  kase('write empty cookie', () => writeCookie(config.cookieSerializer('KOMGA-SESSION'), ''))
  kase('other name', () => writeCookie(config.cookieSerializer('OTHER'), 'v'))
  kase('read cookie', () => config.cookieSerializer('KOMGA-SESSION').readCookieValues(request({ headers: [['Cookie', 'KOMGA-SESSION=c2Vzc2lvbi0x']] })))
})

func('httpSessionIdResolver', () => {
  const resolver = config.httpSessionIdResolver('X-Auth-Token', config.cookieSerializer('KOMGA-SESSION'))
  kase('class', () => resolver.constructor.name)
  kase('header', () => resolver.resolveSessionIds(request({ headers: [['X-Auth-Token', 'abc']] })))
  kase('cookie', () => resolver.resolveSessionIds(request({ headers: [['Cookie', 'KOMGA-SESSION=c2Vzc2lvbi0x']] })))
})

func('customizeSessionRepository', () => {
  kase('default timeout', () => repository(null))
  kase('1 day', () => repository(Duration.ofDays(1)))
  kase('90 seconds', () => repository(Duration.ofSeconds(90)))
  kase('sub-second', () => repository(Duration.ofMillis(1500)))
})

func('sessionRegistry', () => {
  const repo = new CaffeineIndexedSessionRepository()
  repo.init()
  afterAll(() => repo.destroy())
  const registry = config.sessionRegistry(repo)
  const session = (principal: string) => {
    const s = repo.createSession()
    s.setAttribute(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME, principal)
    return s
  }
  kase('class', () => registry.constructor.name)
  kase('sessions of a principal', () => {
    repo.save(session('user@example.org'))
    repo.save(session('user@example.org'))
    repo.save(session('other@example.org'))
    return [registry.getAllSessions('user@example.org', false).length, registry.getAllSessions('other@example.org', true).length, registry.getAllSessions('nobody', true).length]
  })
  kase('session information', () => {
    const s = session('x@example.org')
    repo.save(s)
    const it = registry.getSessionInformation(s.id)
    return it === null ? null : [it.principal, it.sessionId === s.id, it.isExpired()]
  })
  kase('expire now', () => {
    const s = session('y@example.org')
    repo.save(s)
    registry.getSessionInformation(s.id)!.expireNow()
    return [registry.getAllSessions('y@example.org', false).length, registry.getAllSessions('y@example.org', true).length, registry.getSessionInformation(s.id)!.isExpired()]
  })
  kase('unknown session', () => registry.getSessionInformation('unknown'))
  kase('security context principal', () => {
    const s = repo.createSession()
    s.setAttribute('SPRING_SECURITY_CONTEXT', new SecurityContext())
    repo.save(s)
    return registry.getSessionInformation(s.id)?.principal ?? null
  })
  kase('indexed by security context', () => {
    const s = repo.createSession()
    s.setAttribute('SPRING_SECURITY_CONTEXT', new SecurityContext(UsernamePasswordAuthenticationToken.authenticated('ctx@example.org', null, [])))
    repo.save(s)
    return [registry.getAllSessions('ctx@example.org', false).map((it) => it.principal), registry.getSessionInformation(s.id)?.principal ?? null]
  })
  kase('all principals', () => registry.getAllPrincipals())
})
