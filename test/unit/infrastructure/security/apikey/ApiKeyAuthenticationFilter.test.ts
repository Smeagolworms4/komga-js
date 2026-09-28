// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/apikey/ApiKeyAuthenticationFilterOracleTest.kt
import type { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { ApiKeyAuthenticationFilter } from '../../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationFilter.js'
import { ApiKeyAuthenticationProvider } from '../../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationProvider.js'
import { ApiKeyAuthenticationToken } from '../../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationToken.js'
import { HeaderApiKeyAuthenticationConverter } from '../../../../../src/infrastructure/security/apikey/HeaderApiKeyAuthenticationConverter.js'
import {
  AnonymousAuthenticationToken,
  type Authentication,
  ProviderManager,
  SecurityContext,
  SecurityContextHolder,
  SimpleGrantedAuthority,
  UsernamePasswordAuthenticationToken,
} from '../../../../../src/port/spring-security.js'
import { RequestAttributeSecurityContextRepository } from '../../../../../src/port/spring-security-web.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { describeAuthentication, request, response } from '../../../web-oracle.js'
import { detailsSource, hasher, populate, tokenEncoder } from './support.js'

const { func, kase } = oracle('infrastructure/security/apikey/ApiKeyAuthenticationFilter')

const db = new OracleDb()
const filter = new ApiKeyAuthenticationFilter(
  new ProviderManager(new ApiKeyAuthenticationProvider(db.komgaUserDao)),
  new HeaderApiKeyAuthenticationConverter('X-API-Key', hasher, tokenEncoder, detailsSource),
)

function describe(a: Authentication | null): unknown[] | null {
  if (a === null) return null
  const p = a.principal as KomgaPrincipal | null
  return [...describeAuthentication(a)!, (typeof p === 'object' && p !== null && 'apiKey' in p ? p.apiKey?.id : null) ?? null]
}

const roles = [new SimpleGrantedAuthority('ROLE_USER')]

const masked = (key: string) => hasher.computeHashOfString(key)

async function run(key: string | null, existing: Authentication | null = null): Promise<unknown[]> {
  SecurityContextHolder.clearContext()
  if (existing !== null) SecurityContextHolder.getContext().authentication = existing
  const req = request({ uri: '/api/v1/books', headers: key === null ? [] : [['X-API-Key', key]] })
  const res = response()
  const seen: unknown[] = []
  try {
    await filter.doFilter(req, res, {
      async doFilter() {
        seen.push(describe(SecurityContextHolder.getContext().authentication))
      },
    })
    const saved = req.getAttribute(RequestAttributeSecurityContextRepository.DEFAULT_REQUEST_ATTR_NAME) as SecurityContext | null
    return [seen, saved === null ? null : describe(saved.authentication), res.status]
  } finally {
    SecurityContextHolder.clearContext()
  }
}

func('doFilterInternal', () => {
  kase('populate', () => populate(db))
  kase('no key', () => run(null))
  kase('valid key', () => run('key-one'))
  kase('valid admin key', () => run('admin-key'))
  kase('invalid key', () => run('wrong'))
  kase('empty key', () => run(''))
})

func('unsuccessfulAuthentication', () => {
  kase('clears an existing authentication', () => run('wrong', UsernamePasswordAuthenticationToken.authenticated('someone', null, roles)))
})

func('successfulAuthentication', () => {
  kase('replaces an existing authentication of another user', () => run('key-two', UsernamePasswordAuthenticationToken.authenticated('someone', null, roles)))
})

func('authenticationIsRequired', () => {
  kase('same api key authentication already present', () => run('key-one', ApiKeyAuthenticationToken.authenticated(masked('key-one'), null, roles)))
  kase('same name but not authenticated', () => run('key-one', ApiKeyAuthenticationToken.unauthenticated(masked('key-one'), null)))
  kase('same name, password authentication', () => run('key-one', UsernamePasswordAuthenticationToken.authenticated(masked('key-one'), null, roles)))
  kase('same name, anonymous', () => run('key-one', new AnonymousAuthenticationToken('k', masked('key-one'), roles)))
  kase('other name, api key authentication', () => run('key-one', ApiKeyAuthenticationToken.authenticated('other', null, roles)))
  kase('invalid key with same api key authentication present', () => run('wrong', ApiKeyAuthenticationToken.authenticated(masked('wrong'), null, roles)))
})
