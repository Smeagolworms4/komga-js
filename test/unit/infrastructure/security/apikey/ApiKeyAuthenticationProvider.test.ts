// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/apikey/ApiKeyAuthenticationProviderOracleTest.kt
import type { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { ApiKeyAuthenticationProvider } from '../../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationProvider.js'
import { ApiKeyAuthenticationToken } from '../../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationToken.js'
import {
  AnonymousAuthenticationToken,
  type Authentication,
  RememberMeAuthenticationToken,
  UsernamePasswordAuthenticationToken,
} from '../../../../../src/port/spring-security.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { describeAuthentication, request } from '../../../web-oracle.js'
import { describeDetails, detailsSource, hasher, populate, tokenEncoder } from './support.js'

const { func, kase } = oracle('infrastructure/security/apikey/ApiKeyAuthenticationProvider')

const db = new OracleDb()
const provider = new ApiKeyAuthenticationProvider(db.komgaUserDao)

function token(key: string, userAgent = 'agent'): ApiKeyAuthenticationToken {
  const t = ApiKeyAuthenticationToken.unauthenticated(hasher.computeHashOfString(key), tokenEncoder.encode(key))
  t.details = detailsSource.buildDetails(request({ headers: [['User-Agent', userAgent]] }))
  return t
}

function describe(a: Authentication | null): unknown[] | null {
  if (a === null) return null
  const p = a.principal as KomgaPrincipal
  return [...describeAuthentication(a)!, p.user.id, p.apiKey?.id ?? null, p.apiKey?.comment ?? null, p.getName(), describeDetails(a.details)]
}

// PORT: méthodes protégées appelées par réflexion côté Kotlin
const call = (name: string, ...args: unknown[]): unknown => (provider as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!.apply(provider, args)

func('retrieveUser', () => {
  kase('populate', () => populate(db))
  kase('known key', () => {
    const p = call('retrieveUser', 'masked', token('key-one')) as KomgaPrincipal
    return [p.user.id, p.apiKey?.id ?? null, p.getName(), p.getUsername(), p.getAuthorities().map((it) => it.getAuthority()).sort()]
  })
  kase('second key of the same user', () => (call('retrieveUser', 'masked', token('key-two')) as KomgaPrincipal).apiKey?.comment ?? null)
  kase('unknown key', () => call('retrieveUser', 'masked', token('nope')))
  kase('raw key is not accepted', () => call('retrieveUser', 'masked', ApiKeyAuthenticationToken.unauthenticated('masked', 'key-one')))
})

func('additionalAuthenticationChecks', () => {
  // PORT: Method.invoke d'une méthode void renvoie null côté Kotlin
  kase('no-op', () => call('additionalAuthenticationChecks', null, null) ?? null)
})

func('createSuccessAuthentication', () => {
  kase('from principal', () => {
    const principal = call('retrieveUser', 'masked', token('admin-key'))
    return describe(call('createSuccessAuthentication', principal, token('admin-key', 'Browser'), principal) as Authentication)
  })
  kase('null authentication', () => {
    const principal = call('retrieveUser', 'masked', token('admin-key'))
    return describeAuthentication(call('createSuccessAuthentication', principal, null, principal) as Authentication)
  })
})

func('supports', () => {
  kase('ApiKeyAuthenticationToken', () => provider.supports(ApiKeyAuthenticationToken))
  kase('UsernamePasswordAuthenticationToken', () => provider.supports(UsernamePasswordAuthenticationToken))
  kase('AnonymousAuthenticationToken', () => provider.supports(AnonymousAuthenticationToken))
  kase('RememberMeAuthenticationToken', () => provider.supports(RememberMeAuthenticationToken))
})

func('createSuccessAuthentication', () => {
  kase('authenticate known key', () => describe(provider.authenticate(token('key-one'))))
  kase('authenticate admin key', () => describe(provider.authenticate(token('admin-key', 'Mozilla'))))
  kase('authenticate unknown key', () => provider.authenticate(token('unknown')))
  kase('authenticate empty key', () => provider.authenticate(token('')))
})
