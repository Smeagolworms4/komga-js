// Miroir de FakeIdentityProvider (oracle/infrastructure/security/oauth2/OAuthSupport.kt) : fournisseur d'identité local
// qui répond à chaque chemin avec un statut et un corps JSON configurés, et enregistre les requêtes (méthode, chemin,
// en-tête Authorization).
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { ClientRegistration, OAuth2AccessToken, OAuth2AuthenticationException, type OAuth2User, OAuth2UserRequest, ProviderDetails } from '../../../../../src/port/spring-security-oauth2.js'

export class FakeIdentityProvider {
  readonly requests: unknown[][] = []
  readonly responses = new Map<string, [number, string]>()
  private server: Server | null = null
  base = ''

  async start(): Promise<void> {
    if (this.server !== null) return
    this.server = createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      this.requests.push([req.method, path, req.headers.authorization ?? null])
      const [status, body] = this.responses.get(path) ?? [404, '{}']
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(body)
    })
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  async stop(): Promise<void> {
    const s = this.server
    this.server = null
    if (s !== null) await new Promise<void>((resolve) => s.close(() => resolve()))
  }

  drain(): unknown[][] {
    return this.requests.splice(0)
  }

  clean(s: string | null | undefined): string | null {
    return s === null || s === undefined ? null : s.replaceAll(this.base, '<idp>')
  }

  registration(id: string, userInfoPath: string | null, userNameAttribute: string, ...scopes: string[]): ClientRegistration {
    return new ClientRegistration(
      id,
      'client',
      'secret',
      'client_secret_basic',
      'authorization_code',
      '{baseUrl}/login/oauth2/code/{registrationId}',
      new Set(scopes),
      new ProviderDetails(`${this.base}/authorize`, `${this.base}/token`, { uri: userInfoPath === null ? '' : `${this.base}${userInfoPath}`, authenticationMethod: 'header', userNameAttributeName: userNameAttribute }, '', null, {}),
      id,
    )
  }

  accessToken(...scopes: string[]): OAuth2AccessToken {
    return new OAuth2AccessToken('access-token', new Set(scopes))
  }

  request(registration: ClientRegistration): OAuth2UserRequest {
    return new OAuth2UserRequest(registration, this.accessToken(...registration.scopes))
  }

  describe(u: OAuth2User): unknown[] {
    return [
      u.getName(),
      Object.entries(u.getAttributes())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, v === null || v === undefined ? null : String(v)]),
      [...u.getAuthorities()].map((it) => it.getAuthority()).sort(),
      u instanceof KomgaPrincipal ? [u.user.email, u.user.id.length] : null,
    ]
  }

  describeError(e: unknown): unknown[] {
    // PORT: message absent (null) côté Kotlin = message vide côté TS
    return [(e as Error).name, e instanceof OAuth2AuthenticationException ? e.error.errorCode : null, this.clean((e as Error).message || null)]
  }
}
