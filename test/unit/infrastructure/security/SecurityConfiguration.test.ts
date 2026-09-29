// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/SecurityConfigurationOracleTest.kt
import { KomgaPrincipal } from '../../../../src/infrastructure/security/KomgaPrincipal.js'
import { KomgaUserDetailsService } from '../../../../src/infrastructure/security/KomgaUserDetailsService.js'
import { OpdsAuthenticationEntryPoint } from '../../../../src/infrastructure/security/OpdsAuthenticationEntryPoint.js'
import { SecurityConfiguration } from '../../../../src/infrastructure/security/SecurityConfiguration.js'
import { ApiKeyAuthenticationProvider } from '../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationProvider.js'
import { ApiKeyAuthenticationToken } from '../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationToken.js'
import type { Filter, HttpServletRequest } from '../../../../src/port/servlet.js'
import { type Authentication, AuthenticationEventPublisher, type AuthenticationException, SecurityContextHolder } from '../../../../src/port/spring-security.js'
import type { OAuth2UserService } from '../../../../src/port/spring-security-oauth2.js'
import { CaffeineIndexedSessionRepository, SpringSessionBackedSessionRegistry } from '../../../../src/port/spring-session.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { describeAuthentication, mapper, request, response } from '../../web-oracle.js'
import { InterfacesServices } from '../../interfaces/services.js'
import { detailsSource, hasher, populate, tokenEncoder } from './apikey/support.js'

const { func, kase } = oracle('infrastructure/security/SecurityConfiguration')

const db = new OracleDb()
const services = new InterfacesServices(db)
const events: unknown[][] = []
const publisher = new (class extends AuthenticationEventPublisher {
  publishAuthenticationSuccess(authentication: Authentication): void {
    events.push(['success', authentication.constructor.name, authentication.name])
  }
  publishAuthenticationFailure(exception: AuthenticationException, authentication: Authentication): void {
    events.push(['failure', exception.name, exception.message, authentication.constructor.name])
  }
})()
let instance: SecurityConfiguration | null = null
const config = (): SecurityConfiguration =>
  (instance ??= new SecurityConfiguration(
    services.settings,
    new KomgaUserDetailsService(db.komgaUserDao),
    new ApiKeyAuthenticationProvider(db.komgaUserDao),
    {} as OAuth2UserService,
    {} as OAuth2UserService as never,
    'KOMGA-SESSION',
    detailsSource,
    new SpringSessionBackedSessionRegistry(new CaffeineIndexedSessionRepository()),
    new OpdsAuthenticationEntryPoint(services.opdsGenerator, mapper()),
    publisher,
    tokenEncoder,
    hasher,
    null,
  ))

async function run(filter: Filter, uri: string, ...headers: [string, string][]): Promise<unknown[]> {
  SecurityContextHolder.clearContext()
  const res = response()
  const seen: unknown[] = []
  try {
    await filter.doFilter(request({ uri, headers }), res, {
      async doFilter(_req: HttpServletRequest) {
        const it = SecurityContextHolder.getContext().authentication
        seen.push(it === null ? null : [...describeAuthentication(it)!, it.principal instanceof KomgaPrincipal ? (it.principal.apiKey?.id ?? null) : null])
      },
    })
    return [seen, res.status, events.splice(0)]
  } finally {
    SecurityContextHolder.clearContext()
  }
}

func('koboAuthenticationFilter', () => {
  kase('populate', () => populate(db))
  kase('class', () => config().koboAuthenticationFilter().constructor.name)
  kase('valid key in path', () => run(config().koboAuthenticationFilter(), '/kobo/key-one/v1/library/sync'))
  kase('invalid key in path', () => run(config().koboAuthenticationFilter(), '/kobo/wrong/v1/library/sync'))
  kase('header is ignored', () => run(config().koboAuthenticationFilter(), '/api/v1/books', ['X-API-Key', 'key-one']))
})

func('kosyncAuthenticationFilter', () => {
  kase('valid key in header', () => run(config().kosyncAuthenticationFilter(), '/koreader/syncs/progress', ['X-Auth-User', 'key-two']))
  kase('invalid key', () => run(config().kosyncAuthenticationFilter(), '/koreader/syncs/progress', ['X-Auth-User', 'nope']))
  kase('no header', () => run(config().kosyncAuthenticationFilter(), '/koreader/syncs/progress'))
})

func('restAuthenticationFilter', () => {
  kase('valid key', () => run(config().restAuthenticationFilter(), '/api/v1/books', ['X-API-Key', 'admin-key']))
  kase('invalid key', () => run(config().restAuthenticationFilter(), '/api/v1/books', ['X-API-Key', 'nope']))
  kase('other header', () => run(config().restAuthenticationFilter(), '/api/v1/books', ['X-Auth-User', 'admin-key']))
})

func('apiKeyAuthenticationProvider', () => {
  kase('authenticate', async () => {
    const m = config().apiKeyAuthenticationProvider()
    const auth = await m.authenticate(ApiKeyAuthenticationToken.unauthenticated(hasher.computeHashOfString('key-one'), tokenEncoder.encode('key-one')))
    return [m.constructor.name, describeAuthentication(auth), events.splice(0)]
  })
  kase('failure', async () => {
    try {
      return await config().apiKeyAuthenticationProvider().authenticate(ApiKeyAuthenticationToken.unauthenticated('x', 'y'))
    } catch (e) {
      return [(e as Error).name, (e as Error).message, events.splice(0)]
    }
  })
})
