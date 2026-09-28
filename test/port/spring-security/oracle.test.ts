// Tests du support Spring Security / Spring Session contre des valeurs produites par les vraies classes Spring
// (tools/jshell-komga.sh, classpath de Komga : BCryptPasswordEncoder, Sha512DigestUtils, TokenBasedRememberMeServices,
// DefaultCookieSerializer, ConcurrentHashMap). Ce fichier n'a pas de jumeau Kotlin.
import { describe, expect, it } from 'vitest'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../src/domain/model/UserRoles.js'
import { KomgaPrincipal } from '../../../src/infrastructure/security/KomgaPrincipal.js'
import { Cookie, HttpServletRequest, HttpServletResponse } from '../../../src/port/servlet.js'
import {
  AccessDeniedException,
  AnonymousAuthenticationToken,
  BCryptPasswordEncoder,
  SecurityContext,
  SecurityContextHolder,
  SimpleGrantedAuthority,
  Sha512DigestUtils,
  UserDetailsService,
  UsernamePasswordAuthenticationToken,
  checkPreAuthorize,
  evaluateSecurityExpression,
} from '../../../src/port/spring-security.js'
import { javaConcurrentHashMapOrder } from '../../../src/port/spring-security-oauth2.js'
import { EndpointRequest, HealthEndpoint, PathPatternRequestMatcher, StrictHttpFirewall, TokenBasedRememberMeServices, javaUrlDecode, javaUrlEncode } from '../../../src/port/spring-security-web.js'
import {
  CaffeineIndexedSessionRepository,
  CookieValue,
  DefaultCookieSerializer,
  FindByIndexNameSessionRepository,
  MapSession,
  SpringSessionBackedSessionRegistry,
  javaBase64Decode,
  rfc1123,
} from '../../../src/port/spring-session.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

function fakeRequest(path: string, headers: Record<string, string> = {}, method = 'GET'): HttpServletRequest {
  const raw = { method, url: path, headers: { host: 'localhost:25600', ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) }, socket: { remoteAddress: '127.0.0.1' } }
  return new HttpServletRequest(raw as unknown as IncomingMessage, Buffer.alloc(0))
}

function fakeResponse(): HttpServletResponse {
  return new HttpServletResponse({ headersSent: false, setHeader() {}, end() {} } as unknown as ServerResponse)
}

describe('BCryptPasswordEncoder', () => {
  const encoder = new BCryptPasswordEncoder()
  // empreintes produites par org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
  const spring: [string, string][] = [
    ['secret', '$2a$10$Y565kuHJq49ZmzGdfDc9u.UgkgWsUp47jNNzjExAFEcALzwdRelSC'],
    ['userpass', '$2a$10$mBWQoCOWFRiOGerGAKa8xuJKYF/c2aXuMtHburDpw37sVQo4KGbFy'],
    ['', '$2a$10$byu6kbn3ZCklXtoVzecg3.5ohBOmhHkETmvbWdfFeDE337FfpFGS2'],
    ['pâssé€😀', '$2a$10$c9nSfqZEiNMcxHzfazcC2.3dkqKfR36Gczs4T306B3Us7R88P5SP6'],
    ['a'.repeat(72), '$2a$10$NdyyABe1b5guOuvhdjzu6.4xTNUI/kVjO9qGu6Ilehl4kr5Iu5b1u'],
  ]

  it('matches hashes produced by Spring', () => {
    for (const [raw, hash] of spring) {
      expect(encoder.matches(raw, hash), raw).toBe(true)
      expect(encoder.matches(`${raw}x`, hash), raw).toBe(raw.length === 72)
    }
  })

  it('ignores bytes beyond 72 like BCrypt.checkpw', () => {
    expect(encoder.matches('a'.repeat(73), spring[4]?.[1] as string)).toBe(true)
  })

  it('encodes as $2a$10$ and verifies its own hashes', () => {
    const h = encoder.encode('secret')
    expect(h).toMatch(/^\$2a\$10\$[./A-Za-z0-9]{53}$/)
    expect(encoder.matches('secret', h)).toBe(true)
    expect(encoder.matches('Secret', h)).toBe(false)
  })

  it('refuses passwords longer than 72 bytes', () => {
    expect(() => encoder.encode('a'.repeat(73))).toThrow('password cannot be more than 72 bytes')
  })

  it('does not match non BCrypt hashes', () => {
    expect(encoder.matches('x', 'notbcrypt')).toBe(false)
    expect(encoder.matches('x', '')).toBe(false)
    expect(encoder.matches('x', null)).toBe(false)
  })
})

describe('Sha512DigestUtils', () => {
  it('shaHex matches Spring', () => {
    expect(Sha512DigestUtils.shaHex('618a943a7c284beb884aff259b93eb67')).toBe(
      '844c0ab9595c923a5e88ab9dbe94d3cd8dbfdd23964da4f1f8b3ff9fc364e6b77c2aeef692b9c864dca44465a50070f7c3a835a57edf03e9ce9bdebe3f153b78',
    )
  })
})

describe('TokenBasedRememberMeServices', () => {
  const principal = new KomgaPrincipal(new KomgaUser({ email: 'admin@example.org', password: '$2a$10$hash', roles: new Set([UserRoles.ADMIN]) }))
  const uds = new (class extends UserDetailsService {
    loadUserByUsername() {
      return principal
    }
  })()
  const services = new TokenBasedRememberMeServices('mykey', uds)

  it('signature and cookie encoding match Spring', () => {
    const sig = services.makeTokenSignature(1822131621715, 'admin@example.org', '$2a$10$hash')
    expect(sig).toBe('bcd35e1a7ae2c0716dfe40bc2475ce335672cb8fe3a949e08f7130a58905d1e9')
    expect(services.encode(['admin@example.org', '1822131621715', 'SHA256', sig])).toBe(
      'YWRtaW4lNDBleGFtcGxlLm9yZzoxODIyMTMxNjIxNzE1OlNIQTI1NjpiY2QzNWUxYTdhZTJjMDcxNmRmZTQwYmMyNDc1Y2UzMzU2NzJjYjhmZTNhOTQ5ZTA4ZjcxMzBhNTg5MDVkMWU5',
    )
    expect(services.encode(['é:ü a+b', '1', 'SHA256', 'x'])).toBe('JUMzJUE5JTNBJUMzJUJDK2ElMkJiOjE6U0hBMjU2Ong')
  })

  it('decodes cookies like Spring', () => {
    expect(services.decode('JUMzJUE5JTNBJUMzJUJDK2ElMkJiOjE6U0hBMjU2Ong')).toEqual(['é:ü a+b', '1', 'SHA256', 'x'])
    expect(services.decode('YWJjOmRlZg')).toEqual(['abc', 'def'])
  })

  it('logs in with a valid cookie and refuses a tampered one', () => {
    const expiry = Date.now() + 60_000
    const sig = services.makeTokenSignature(expiry, 'admin@example.org', '$2a$10$hash')
    const good = services.encode(['admin@example.org', String(expiry), 'SHA256', sig])
    const auth = services.autoLogin(fakeRequest('/api/v1/series', { cookie: `remember-me=${good}` }), fakeResponse())
    expect(auth?.principal).toBe(principal)
    const bad = services.encode(['admin@example.org', String(expiry), 'SHA256', sig.replace(/^./, '0')])
    const res = fakeResponse()
    expect(services.autoLogin(fakeRequest('/api/v1/series', { cookie: `remember-me=${bad}` }), res)).toBeNull()
    expect(res.getHeaders('Set-Cookie')).toEqual(['remember-me=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:10 GMT; Path=/'])
  })

  it('java URL encoding', () => {
    expect(javaUrlEncode('a b~*._-é@')).toBe('a+b%7E*._-%C3%A9%40')
    expect(javaUrlDecode('a+b%7E*._-%C3%A9%40')).toBe('a b~*._-é@')
  })
})

describe('Spring Session', () => {
  it('cookie serializer writes cookies like DefaultCookieSerializer', () => {
    const serializer = new DefaultCookieSerializer()
    serializer.setCookieName('KOMGA-SESSION')
    const req = fakeRequest('/api/v1/series')
    const res = fakeResponse()
    serializer.writeCookieValue(new CookieValue(req, res, 'ab3117fc-cd4d-4738-86fc-0b71a9cd8fff'))
    serializer.writeCookieValue(new CookieValue(req, res, ''))
    expect(res.getHeaders('Set-Cookie')).toEqual([
      'KOMGA-SESSION=YWIzMTE3ZmMtY2Q0ZC00NzM4LTg2ZmMtMGI3MWE5Y2Q4ZmZm; Path=/; HttpOnly; SameSite=Lax',
      'KOMGA-SESSION=; Max-Age=0; Expires=Thu, 1 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax',
    ])
    expect(serializer.readCookieValues(fakeRequest('/', { cookie: 'KOMGA-SESSION=YWIzMTE3ZmMtY2Q0ZC00NzM4LTg2ZmMtMGI3MWE5Y2Q4ZmZm; KOMGA-SESSION=!!' }))).toEqual([
      'ab3117fc-cd4d-4738-86fc-0b71a9cd8fff',
    ])
  })

  it('RFC 1123 dates like DateTimeFormatter.RFC_1123_DATE_TIME', () => {
    expect(rfc1123(0)).toBe('Thu, 1 Jan 1970 00:00:00 GMT')
    expect(rfc1123(1822131621715)).toBe('Tue, 28 Sep 2027 11:40:21 GMT')
  })

  it('strict base64 decoding', () => {
    expect(javaBase64Decode('YWJj')).toBe('abc')
    expect(javaBase64Decode('YWI')).toBe('ab')
    expect(javaBase64Decode('YW-j')).toBeNull()
  })

  it('session ids are random UUIDs', () => {
    expect(new MapSession().id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('sessions are indexed by principal name and can be expired through the registry', () => {
    const repo = new CaffeineIndexedSessionRepository()
    repo.setDefaultMaxInactiveInterval(604800)
    const s = repo.createSession()
    expect(s.maxInactiveInterval).toBe(604800)
    const principal = new KomgaPrincipal(new KomgaUser({ email: 'user@example.org', password: 'x' }))
    s.setAttribute('SPRING_SECURITY_CONTEXT', new SecurityContext(new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities())))
    repo.save(s)
    expect([...repo.findByPrincipalName('user@example.org').keys()]).toEqual([s.id])
    expect(repo.findByIndexNameAndIndexValue(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME, 'other').size).toBe(0)
    const registry = new SpringSessionBackedSessionRegistry(repo)
    const infos = registry.getAllSessions(principal, false)
    expect(infos.map((it) => it.sessionId)).toEqual([s.id])
    infos.forEach((it) => it.expireNow())
    expect(registry.getSessionInformation(s.id)?.isExpired()).toBe(true)
    expect(registry.getAllSessions(principal, false)).toEqual([])
    expect(registry.getAllSessions(principal, true).length).toBe(1)
    // expiration par inactivité
    const old = repo.findById(s.id)
    if (old) old.lastAccessedTime = Date.now() - 604801 * 1000
    expect(repo.findById(s.id)).toBeNull()
    repo.destroy()
  })
})

describe('method security', () => {
  const principal = new KomgaPrincipal(new KomgaUser({ email: 'user@example.org', password: 'x', roles: new Set([UserRoles.PAGE_STREAMING]), id: 'U1' }))
  const admin = new KomgaPrincipal(new KomgaUser({ email: 'admin@example.org', password: 'x', roles: new Set([UserRoles.ADMIN]), id: 'A1' }))
  const auth = (p: KomgaPrincipal) => new UsernamePasswordAuthenticationToken(p, '', p.getAuthorities())

  it('evaluates the expressions used by Komga', () => {
    expect(evaluateSecurityExpression("hasRole('ADMIN')", auth(admin))).toBe(true)
    expect(evaluateSecurityExpression("hasRole('ADMIN')", auth(principal))).toBe(false)
    expect(evaluateSecurityExpression("hasRole('PAGE_STREAMING')", auth(principal))).toBe(true)
    expect(evaluateSecurityExpression("hasRole('ADMIN') and #principal.user.id != #id", auth(admin), { principal: admin, id: 'A1' })).toBe(false)
    expect(evaluateSecurityExpression("hasRole('ADMIN') and #principal.user.id != #id", auth(admin), { principal: admin, id: 'U1' })).toBe(true)
    expect(evaluateSecurityExpression("hasRole('ADMIN') or #principal.user.id == #id", auth(principal), { principal, id: 'U1' })).toBe(true)
    expect(evaluateSecurityExpression("hasRole('ADMIN') or #principal.user.id == #id", auth(principal), { principal, id: 'A1' })).toBe(false)
    expect(evaluateSecurityExpression('isAuthenticated()', new AnonymousAuthenticationToken('k', 'anonymousUser', [new SimpleGrantedAuthority('ROLE_ANONYMOUS')]))).toBe(false)
    expect(evaluateSecurityExpression("hasAnyRole('ADMIN', 'PAGE_STREAMING') && !isAnonymous()", auth(principal))).toBe(true)
  })

  it('checkPreAuthorize throws AccessDeniedException from the current security context', () => {
    SecurityContextHolder.runWithContext(new SecurityContext(auth(principal)), () => {
      expect(() => checkPreAuthorize("hasRole('ADMIN')")).toThrow(AccessDeniedException)
      expect(() => checkPreAuthorize("hasRole('PAGE_STREAMING')")).not.toThrow()
    })
  })
})

describe('request matching and firewall', () => {
  it('path patterns like the MVC request matcher', () => {
    const m = new PathPatternRequestMatcher('/api/**')
    expect(m.matches(fakeRequest('/api'))).toBe(true)
    expect(m.matches(fakeRequest('/api/v1/series'))).toBe(true)
    expect(m.matches(fakeRequest('/apix'))).toBe(false)
    const r = new PathPatternRequestMatcher('/api/v1/books/{bookId}/resource/**')
    expect(r.matches(fakeRequest('/api/v1/books/0A/resource/OEBPS/font.ttf'))).toBe(true)
    expect(new PathPatternRequestMatcher('/api/v1/claim').matches(fakeRequest('/api/v1/claim/'))).toBe(false)
  })

  it('actuator endpoints', () => {
    expect(EndpointRequest.toAnyEndpoint().matches(fakeRequest('/actuator'))).toBe(true)
    expect(EndpointRequest.toAnyEndpoint().matches(fakeRequest('/actuator/nonexist'))).toBe(false)
    expect(EndpointRequest.to(HealthEndpoint).matches(fakeRequest('/actuator/health/liveness'))).toBe(true)
    expect(EndpointRequest.to(HealthEndpoint).matches(fakeRequest('/actuator/info'))).toBe(false)
  })

  it('strict firewall', () => {
    const f = new StrictHttpFirewall()
    expect(() => f.check(fakeRequest('/api/v1/series?x=%2F'))).not.toThrow()
    for (const p of ['/a;b', '/a//b', '/a/%2e%2e/b', '/a/../b', '/a%25', '/a%2Fb']) expect(() => f.check(fakeRequest(p)), p).toThrow()
    expect(() => f.check(fakeRequest('/a', {}, 'TRACE'))).toThrow()
  })
})

describe('OAuth2 client registrations', () => {
  it('iteration order of the registration repository matches Spring Boot', () => {
    expect(javaConcurrentHashMapOrder(['google', 'github'])).toEqual(['github', 'google'])
    expect(javaConcurrentHashMapOrder(['github', 'google', 'keycloak', 'authelia', 'authentik', 'facebook', 'okta'])).toEqual([
      'authentik',
      'authelia',
      'github',
      'keycloak',
      'facebook',
      'google',
      'okta',
    ])
    expect(javaConcurrentHashMapOrder(['komga-oidc', 'pocket-id', 'zitadel'])).toEqual(['pocket-id', 'komga-oidc', 'zitadel'])
    const letters = 'abcdefghijklmn'.split('')
    expect(javaConcurrentHashMapOrder(letters)).toEqual(letters)
  })
})

// Cookie de port/servlet.ts (format Tomcat) utilisé par remember-me
describe('servlet cookies', () => {
  it('Set-Cookie order is preserved between addCookie and addHeader', () => {
    const res = fakeResponse()
    const c = new Cookie('komga-remember-me', 'v')
    c.path = '/'
    res.addCookie(c)
    res.addHeader('Set-Cookie', 'KOMGA-SESSION=x')
    expect(res.getHeaders('Set-Cookie')).toEqual(['komga-remember-me=v; Path=/', 'KOMGA-SESSION=x'])
  })
})
