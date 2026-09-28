// Flux oauth2Login (authorization code, OIDC) de bout en bout contre un fournisseur OIDC simulé :
// redirection /oauth2/authorization/{id}, retour /login/oauth2/code/{id}, services utilisateur de Komga
// (logique de KomgaOAuth2UserServiceConfiguration.oidcUserService), erreurs ERR_10xx, journal de connexion.
// Ce fichier n'a pas de jumeau Kotlin.
import { generateKeyPairSync, sign } from 'node:crypto'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { KomgaUserRepository } from '../../../src/domain/persistence/KomgaUserRepository.js'
import { AuthenticationActivityRepository } from '../../../src/domain/persistence/AuthenticationActivityRepository.js'
import { KomgaPrincipal } from '../../../src/infrastructure/security/KomgaPrincipal.js'
import {
  DefaultOAuth2UserService,
  InMemoryClientRegistrationRepository,
  OAuth2AuthenticationException,
  type OAuth2User,
  type OAuth2UserRequest,
  OAuth2UserService,
  type OidcUser,
  type OidcUserRequest,
  OidcUserService,
} from '../../../src/port/spring-security-oauth2.js'
import type { ApplicationContext } from '../../../src/port/spring.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { type TsServer, mirrorFilterChains, opdsEntryPointStub, send, startServer } from './harness.js'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const b64url = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
function jwt(payload: Record<string, unknown>): string {
  const input = `${b64url({ alg: 'RS256', typ: 'JWT', kid: 'k1' })}.${b64url(payload)}`
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
}

type Grant = { nonce: string; email: string; emailVerified: boolean | null; badNonce?: boolean }

describe('oauth2Login', () => {
  let provider: Server
  let issuer = ''
  let ctx: ApplicationContext
  let ts: TsServer
  const grants = new Map<string, Grant>()
  const UA = `komgajs-oauth2/${Date.now()}`

  beforeAll(async () => {
    provider = createServer((req, res) => {
      const url = new URL(req.url ?? '/', issuer)
      const json = (o: unknown, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      if (url.pathname === '/.well-known/openid-configuration')
        return json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          userinfo_endpoint: `${issuer}/userinfo`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          scopes_supported: ['openid', 'email', 'profile'],
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
        })
      if (url.pathname === '/token') {
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const form = new URLSearchParams(Buffer.concat(chunks).toString())
          expect(req.headers.authorization).toBe(`Basic ${Buffer.from('komga:s3cret').toString('base64')}`)
          const g = grants.get(form.get('code') ?? '')
          if (!g) return json({ error: 'invalid_grant', error_description: 'unknown code' }, 400)
          const now = Math.floor(Date.now() / 1000)
          json({
            access_token: `at-${form.get('code')}`,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid email profile',
            id_token: jwt({ iss: issuer, sub: g.email, aud: 'komga', iat: now, exp: now + 300, nonce: g.badNonce ? 'wrong' : g.nonce }),
          })
        })
        return
      }
      if (url.pathname === '/userinfo') {
        const code = (req.headers.authorization ?? '').replace('Bearer at-', '')
        const g = grants.get(code) as Grant
        const info: Record<string, unknown> = { sub: g.email, email: g.email }
        if (g.emailVerified !== null) info.email_verified = g.emailVerified
        return json(info)
      }
      json({ error: 'not_found' }, 404)
    })
    await new Promise<void>((r) => provider.listen(0, '127.0.0.1', () => r()))
    issuer = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`

    ctx = springBootTest({
      spring: {
        security: {
          oauth2: {
            client: {
              registration: { test: { 'client-id': 'komga', 'client-secret': 's3cret', 'client-name': 'Test IdP', scope: 'openid,email,profile', provider: 'test' } },
              provider: { test: { 'issuer-uri': issuer } },
            },
          },
        },
      },
    })
    const userRepository = ctx.getBean(KomgaUserRepository)
    userRepository.insert(new KomgaUser({ email: 'oidc@example.org', password: 'x' }))
    // logique de KomgaOAuth2UserServiceConfiguration (sans création de compte : komga.oauth2-account-creation=false)
    const tryCreateNewUser = (): KomgaUser => {
      throw new OAuth2AuthenticationException('ERR_1025')
    }
    const oauth2UserService = new OAuth2UserService<OAuth2UserRequest, OAuth2User>(async (userRequest) => {
      const oAuth2User = await new DefaultOAuth2UserService().loadUser(userRequest)
      const email = oAuth2User.getAttribute<string>('email')
      if (email === null) throw new OAuth2AuthenticationException('ERR_1024')
      return new KomgaPrincipal(userRepository.findByEmailIgnoreCaseOrNull(email) ?? tryCreateNewUser(), { oAuth2User })
    })
    const oidcUserService = new OAuth2UserService<OidcUserRequest, OidcUser>(async (userRequest) => {
      const oidcUser = await new OidcUserService().loadUser(userRequest)
      if (oidcUser.email === null) throw new OAuth2AuthenticationException('ERR_1028')
      if (oidcUser.emailVerified === null) throw new OAuth2AuthenticationException('ERR_1027')
      if (oidcUser.emailVerified === false) throw new OAuth2AuthenticationException('ERR_1026')
      return new KomgaPrincipal(userRepository.findByEmailIgnoreCaseOrNull(oidcUser.email) ?? tryCreateNewUser(), { oAuth2User: oidcUser })
    })
    ts = await startServer(
      ctx,
      mirrorFilterChains(ctx, {
        rememberMeKey: 'k',
        rememberMeDays: 365,
        opdsAuthenticationEntryPoint: opdsEntryPointStub(() => ({})),
        oauth2: { oauth2UserService, oidcUserService },
      }),
    )
  }, 60_000)

  afterAll(async () => {
    await ts?.close()
    await new Promise<void>((r) => provider.close(() => r()))
    closeContext(ctx)
  })

  const cookieOf = (setCookie: string[] | undefined) => /KOMGA-SESSION=([^;]+)/.exec((setCookie ?? []).join('\n'))?.[1] ?? null

  async function authorize(code: string, grant: Omit<Grant, 'nonce'>): Promise<{ session: string; state: string }> {
    const r = await send(ts.base, 'GET', '/oauth2/authorization/test', { 'User-Agent': UA })
    expect(r.status).toBe(302)
    const location = new URL(r.headers.location as string)
    expect(`${location.origin}${location.pathname}`).toBe(`${issuer}/authorize`)
    const p = location.searchParams
    expect([...p.keys()]).toEqual(['response_type', 'client_id', 'scope', 'state', 'redirect_uri', 'nonce'])
    expect(p.get('response_type')).toBe('code')
    expect(p.get('client_id')).toBe('komga')
    expect(p.get('scope')).toBe('openid email profile')
    expect(p.get('redirect_uri')).toBe(`${ts.base}/login/oauth2/code/test`)
    expect(p.get('state')).toMatch(/^[A-Za-z0-9_-]{43}=$/)
    expect(p.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    grants.set(code, { ...grant, nonce: p.get('nonce') as string })
    return { session: cookieOf(r.headers['set-cookie']) as string, state: p.get('state') as string }
  }

  it('client registration repository from spring.security.oauth2.client properties', () => {
    const repo = ctx.getBean(InMemoryClientRegistrationRepository)
    expect(repo.map((it) => [it.registrationId, it.clientName])).toEqual([['test', 'Test IdP']])
  })

  it('logs in with OIDC, changes the session id and records the activity', async () => {
    const { session, state } = await authorize('c1', { email: 'oidc@example.org', emailVerified: true })
    const r = await send(ts.base, 'GET', `/login/oauth2/code/test?code=c1&state=${encodeURIComponent(state)}`, { Cookie: `KOMGA-SESSION=${session}`, 'User-Agent': UA })
    expect(r.status).toBe(302)
    expect(r.headers.location).toBe('/?server_redirect=Y')
    const newSession = cookieOf(r.headers['set-cookie'])
    expect(newSession).not.toBeNull()
    expect(newSession).not.toBe(session)
    const me = await send(ts.base, 'GET', '/api/v2/users/me', { Cookie: `KOMGA-SESSION=${newSession}` })
    expect(me.status).toBe(200)
    expect(JSON.parse(me.body)).toEqual({ email: 'oidc@example.org' })
    const user = ctx.getBean(KomgaUserRepository).findByEmailIgnoreCaseOrNull('oidc@example.org') as KomgaUser
    const activity = ctx.getBean(AuthenticationActivityRepository).findMostRecentByUser(user, null)
    expect(activity?.source).toBe('OAuth2:Test IdP')
    expect(activity?.success).toBe(true)
    expect(activity?.userAgent).toBe(UA)
  })

  it('unknown user without account creation fails with ERR_1025', async () => {
    const { session, state } = await authorize('c2', { email: 'nobody@example.org', emailVerified: true })
    const r = await send(ts.base, 'GET', `/login/oauth2/code/test?code=c2&state=${encodeURIComponent(state)}`, { Cookie: `KOMGA-SESSION=${session}` })
    expect(r.status).toBe(302)
    expect(r.headers.location).toBe('/login?server_redirect=Y&error=ERR_1025')
  })

  it('unverified email fails with ERR_1026, missing verification with ERR_1027', async () => {
    const a = await authorize('c3', { email: 'oidc@example.org', emailVerified: false })
    const r1 = await send(ts.base, 'GET', `/login/oauth2/code/test?code=c3&state=${encodeURIComponent(a.state)}`, { Cookie: `KOMGA-SESSION=${a.session}` })
    expect(r1.headers.location).toBe('/login?server_redirect=Y&error=ERR_1026')
    const b = await authorize('c4', { email: 'oidc@example.org', emailVerified: null })
    const r2 = await send(ts.base, 'GET', `/login/oauth2/code/test?code=c4&state=${encodeURIComponent(b.state)}`, { Cookie: `KOMGA-SESSION=${b.session}` })
    expect(r2.headers.location).toBe('/login?server_redirect=Y&error=ERR_1027')
  })

  it('authorization request not found without the session', async () => {
    const { state } = await authorize('c5', { email: 'oidc@example.org', emailVerified: true })
    const r = await send(ts.base, 'GET', `/login/oauth2/code/test?code=c5&state=${encodeURIComponent(state)}`)
    expect(r.headers.location).toBe('/login?server_redirect=Y&error=authorization_request_not_found')
  })

  it('provider error and invalid nonce', async () => {
    const a = await authorize('c6', { email: 'oidc@example.org', emailVerified: true })
    const r1 = await send(ts.base, 'GET', `/login/oauth2/code/test?error=access_denied&state=${encodeURIComponent(a.state)}`, { Cookie: `KOMGA-SESSION=${a.session}` })
    expect(r1.headers.location).toBe('/login?server_redirect=Y&error=access_denied')
    const b = await authorize('c7', { email: 'oidc@example.org', emailVerified: true, badNonce: true })
    const r2 = await send(ts.base, 'GET', `/login/oauth2/code/test?code=c7&state=${encodeURIComponent(b.state)}`, { Cookie: `KOMGA-SESSION=${b.session}` })
    expect(r2.headers.location).toBe('/login?server_redirect=Y&error=invalid_nonce')
  })

  it('invalid request without state', async () => {
    const r = await send(ts.base, 'GET', '/login/oauth2/code/test?code=x')
    expect(r.headers.location).toBe('/login?server_redirect=Y&error=invalid_request')
  })

  it('unknown registration id', async () => {
    const r = await send(ts.base, 'GET', '/oauth2/authorization/unknown')
    expect(r.status).toBe(500)
  })

  it('browser requests are redirected to the login page, api clients get the basic challenge', async () => {
    const r1 = await send(ts.base, 'GET', '/api/v1/series', { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' })
    expect(r1.status).toBe(302)
    expect(r1.headers.location).toBe(`${ts.base}/login`)
    const r2 = await send(ts.base, 'GET', '/api/v1/series', { Accept: '*/*' })
    expect(r2.status).toBe(401)
    expect(r2.headers['www-authenticate']).toBe('Basic realm="Realm"')
  })
})
