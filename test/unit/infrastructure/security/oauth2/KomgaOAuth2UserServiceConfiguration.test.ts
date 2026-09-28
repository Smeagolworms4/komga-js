// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/oauth2/KomgaOAuth2UserServiceConfigurationOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import type { KomgaUserLifecycle } from '../../../../../src/domain/service/KomgaUserLifecycle.js'
import { KomgaProperties } from '../../../../../src/infrastructure/configuration/KomgaProperties.js'
import { KomgaOAuth2UserServiceConfiguration } from '../../../../../src/infrastructure/security/oauth2/KomgaOAuth2UserServiceConfiguration.js'
import { OidcIdToken, OidcUserRequest } from '../../../../../src/port/spring-security-oauth2.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { FakeIdentityProvider } from './support.js'

const { func, kase } = oracle('infrastructure/security/oauth2/KomgaOAuth2UserServiceConfiguration')

const db = new OracleDb()
const idp = new FakeIdentityProvider()
const created: string[] = []
// PORT: faux KomgaUserLifecycle (mockk côté Kotlin)
const lifecycle = {
  createUser: (u: KomgaUser) => {
    created.push(u.email)
    return u
  },
} as unknown as KomgaUserLifecycle
const properties = new KomgaProperties()
const config = new KomgaOAuth2UserServiceConfiguration(db.komgaUserDao, lifecycle, properties)

async function attempt(block: () => unknown): Promise<unknown> {
  try {
    return await block()
  } catch (e) {
    return idp.describeError(e)
  }
}

async function oauth2(id: string, ...scopes: string[]): Promise<unknown> {
  await idp.start()
  const r = await attempt(async () => idp.describe(await config.oauth2UserService().loadUser(idp.request(idp.registration(id, '/user', 'login', ...scopes)))))
  return [r, idp.drain(), created.splice(0)]
}

const idToken = (claims: Record<string, unknown> = {}) => new OidcIdToken('id-token', { sub: 'sub-1', ...claims })

async function oidc(token: OidcIdToken, userInfo: string | null, ...scopes: string[]): Promise<unknown> {
  await idp.start()
  const r = await attempt(async () => {
    const registration = idp.registration('oidc', userInfo, 'sub', ...scopes)
    return idp.describe(await config.oidcUserService().loadUser(new OidcUserRequest(registration, idp.accessToken(...scopes), token)))
  })
  return [r, idp.drain(), created.splice(0)]
}

// PORT: méthode privée appelée par réflexion côté Kotlin
const tryCreateNewUser = (email: string) => (config as unknown as { tryCreateNewUser(e: string): KomgaUser }).tryCreateNewUser(email)

func('oauth2UserService', () => {
  kase('setup', () => db.komgaUserDao.insert(new KomgaUser({ email: 'Existing@Example.org', password: 'pw', id: 'U1', createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) })))
  kase('existing user', () => {
    idp.responses.set('/user', [200, '{"login":"u","email":"existing@example.org"}'])
    return oauth2('keycloak', 'profile')
  })
  kase('no email', () => {
    idp.responses.set('/user', [200, '{"login":"u"}'])
    return oauth2('keycloak', 'profile')
  })
  kase('unknown user, creation disabled', () => {
    idp.responses.set('/user', [200, '{"login":"u","email":"new@example.org"}'])
    return oauth2('keycloak')
  })
  kase('unknown user, creation enabled', () => {
    properties.oauth2AccountCreation = true
    return oauth2('KeyCloak')
  })
  kase('github delegate', () => {
    idp.responses.set('/user', [200, '{"login":"u","email":null}'])
    idp.responses.set('/user/emails', [200, '[{"email":"existing@example.org","verified":true,"primary":true}]'])
    return oauth2('GitHub', 'user:email')
  })
  kase('user info failure', () => {
    idp.responses.set('/user', [500, '{}'])
    return oauth2('other')
  })
})

func('oidcUserService', () => {
  kase('email in id token, verified', () => oidc(idToken({ email: 'existing@example.org', email_verified: true }), null, 'openid'))
  kase('email not verified', () => oidc(idToken({ email: 'existing@example.org', email_verified: false }), null, 'openid'))
  kase('verification missing', () => oidc(idToken({ email: 'existing@example.org' }), null, 'openid'))
  kase('verification disabled', () => {
    properties.oidcEmailVerification = false
    return oidc(idToken({ email: 'existing@example.org' }), null, 'openid')
  })
  kase('no email', () => oidc(idToken(), null, 'openid'))
  kase('user info endpoint', () => {
    idp.responses.set('/userinfo', [200, '{"sub":"sub-1","email":"new-oidc@example.org","name":"N"}'])
    return oidc(idToken(), '/userinfo', 'openid', 'email')
  })
  kase('user info subject mismatch', () => {
    idp.responses.set('/userinfo', [200, '{"sub":"other","email":"x@example.org"}'])
    return oidc(idToken(), '/userinfo', 'openid', 'email')
  })
  kase('user info not requested for other scopes', () => oidc(idToken({ email: 'existing@example.org' }), '/userinfo', 'openid', 'custom'))
  kase('creation disabled', () => {
    properties.oauth2AccountCreation = false
    return oidc(idToken({ email: 'unknown@example.org' }), null, 'openid')
  })
})

func('tryCreateNewUser', () => {
  kase('disabled', () => attempt(() => tryCreateNewUser('a@b.c')))
  kase('enabled', () => {
    properties.oauth2AccountCreation = true
    const it = tryCreateNewUser('a@b.c')
    return [it.email, it.password.length, created.splice(0)]
  })
  kase('stop', () => idp.stop())
})
