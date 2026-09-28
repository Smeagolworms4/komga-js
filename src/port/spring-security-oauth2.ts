// Support de portage : Spring Security OAuth2 Client 6.5 (oauth2Login) et l'auto-configuration Spring Boot
// (spring.security.oauth2.client.*), tels qu'utilisés par Komga :
// - ClientRegistration / InMemoryClientRegistrationRepository construits depuis les propriétés (CommonOAuth2Provider :
//   google, github, facebook ; issuer-uri → découverte OIDC), ordre d'itération d'une ConcurrentHashMap Java
// - flux « authorization code » : /oauth2/authorization/{registrationId} (state, nonce haché pour OIDC, PKCE pour un
//   client public, requête mémorisée en session) puis /login/oauth2/code/{registrationId} (échange du code, jeton
//   d'identité OIDC, userService / oidcUserService, session, événements), via le paquet `openid-client`
// - OAuth2User / OidcUser / DefaultOAuth2UserService / OidcUserService, OAuth2AuthenticationException
// PORT: les appels réseau (découverte, jeton, userinfo) sont asynchrones : OAuth2UserService.loadUser renvoie une Promise.
// PORT: la découverte OIDC (issuer-uri) est faite au premier usage et non au démarrage.
// PORT: la signature du jeton d'identité reçu du point de terminaison de jeton n'est pas vérifiée par openid-client
// (échange direct en TLS, OIDC Core 3.1.3.7) ; les autres contrôles (iss, aud, exp, iat, nonce) le sont.
// Ce fichier n'a pas de jumeau Kotlin.
import * as client from 'openid-client'
import { createHash, randomBytes } from 'node:crypto'
import { IllegalArgumentException, IllegalStateException } from './kotlin.js'
import { KotlinLogging } from './logging.js'
import { PathPatternParser } from './path-pattern.js'
import type { Filter, FilterChain, HttpServletRequest, HttpServletResponse } from './servlet.js'
import { type ApplicationContext, configuration, type Environment } from './spring.js'
import {
  AbstractAuthenticationToken,
  type AnyClass,
  type Authentication,
  type AuthenticationDetailsSource,
  AuthenticationException,
  AuthenticationProvider,
  AuthenticationTrustResolver,
  type GrantedAuthority,
  InteractiveAuthenticationSuccessEvent,
  InternalAuthenticationServiceException,
  ProviderManager,
  SecurityContextHolder,
  SimpleGrantedAuthority,
  WebAuthenticationDetailsSource,
  isAssignableFrom,
} from './spring-security.js'
import {
  AndRequestMatcher,
  type AuthenticationFailureHandler,
  AUTHENTICATION_EXCEPTION,
  DefaultRedirectStrategy,
  FILTER_ORDER,
  HttpSecurity,
  type HttpSecurityBuildContext,
  LoginUrlAuthenticationEntryPoint,
  MediaTypeRequestMatcher,
  NegatedRequestMatcher,
  RequestHeaderRequestMatcher,
  type RequestMatcher,
  SavedRequestAwareAuthenticationSuccessHandler,
  registerFilterOrder,
} from './spring-security-web.js'
import { ParsedMediaType } from './media-type.js'

const logger = KotlinLogging.logger('org.springframework.security.oauth2.client')

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

/** `OAuth2Error` */
export class OAuth2Error {
  constructor(
    readonly errorCode: string,
    readonly description: string | null = null,
    readonly uri: string | null = null,
  ) {}
  toString(): string {
    return `[${this.errorCode}] ${this.description ?? ''}`
  }
}

/** `OAuth2AuthenticationException` */
export class OAuth2AuthenticationException extends AuthenticationException {
  readonly error: OAuth2Error
  // PORT: surcharges (errorCode) / (OAuth2Error) / (OAuth2Error, message) / (OAuth2Error, cause) fusionnées
  constructor(error: OAuth2Error | string, message?: string | null, cause?: unknown) {
    const e = typeof error === 'string' ? new OAuth2Error(error) : error
    super(message ?? e.description, cause)
    this.error = e
  }
}

// ---------------------------------------------------------------------------
// ClientRegistration
// ---------------------------------------------------------------------------

export type ClientAuthenticationMethod = 'client_secret_basic' | 'client_secret_post' | 'none'

export class ClientRegistration {
  constructor(
    readonly registrationId: string,
    readonly clientId: string,
    readonly clientSecret: string,
    readonly clientAuthenticationMethod: ClientAuthenticationMethod,
    readonly authorizationGrantType: string,
    readonly redirectUri: string,
    readonly scopes: Set<string>,
    readonly providerDetails: ProviderDetails,
    readonly clientName: string,
  ) {}
}

export class ProviderDetails {
  constructor(
    public authorizationUri: string,
    public tokenUri: string,
    public userInfoEndpoint: { uri: string; authenticationMethod: string; userNameAttributeName: string },
    public jwkSetUri: string,
    public issuerUri: string | null,
    public configurationMetadata: Record<string, unknown>,
  ) {}
}

/** `InMemoryClientRegistrationRepository` (itérable, ordre d'une ConcurrentHashMap Java) */
export class InMemoryClientRegistrationRepository implements Iterable<ClientRegistration> {
  private readonly registrations: Map<string, ClientRegistration>

  constructor(registrations: ClientRegistration[]) {
    if (registrations.length === 0) throw new IllegalArgumentException('registrations cannot be empty')
    const ordered = javaConcurrentHashMapOrder(registrations.map((r) => r.registrationId))
    const byId = new Map(registrations.map((r) => [r.registrationId, r]))
    this.registrations = new Map(ordered.map((id) => [id, byId.get(id) as ClientRegistration]))
  }

  findByRegistrationId(registrationId: string): ClientRegistration | null {
    return this.registrations.get(registrationId) ?? null
  }

  [Symbol.iterator](): Iterator<ClientRegistration> {
    return this.registrations.values()
  }

  /** `map { }` Kotlin sur l'Iterable */
  map<T>(fn: (it: ClientRegistration) => T): T[] {
    return [...this].map(fn)
  }
}

function javaStringHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (31 * h + s.charCodeAt(i)) | 0
  return h
}

/**
 * Ordre d'itération du dépôt de Spring Boot : les registrations viennent d'une HashMap (asClientRegistrations) et sont
 * ajoutées une à une dans une ConcurrentHashMap (createRegistrationsMap) : ordre des seaux, puis d'insertion.
 */
export function javaConcurrentHashMapOrder(keys: string[]): string[] {
  const hashOrder = (ks: string[], n: number) =>
    ks
      .map((k, i) => {
        const h = javaStringHash(k)
        return { k, i, b: (h ^ (h >>> 16)) & 0x7fffffff & (n - 1) }
      })
      .sort((a, b) => a.b - b.b || a.i - b.i)
      .map((x) => x.k)
  const size = keys.length
  // HashMap source (capacité 16, facteur de charge 0.75)
  let hm = 16
  while (size > hm * 0.75) hm <<= 1
  // ConcurrentHashMap remplie par put : agrandie quand la taille atteint 0.75 * n
  let n = 16
  while (size >= n * 0.75) n <<= 1
  return hashOrder(hashOrder(keys, hm), n)
}

/** `CommonOAuth2Provider` */
const COMMON_PROVIDERS: Record<string, Partial<{
  scope: string[]
  authorizationUri: string
  tokenUri: string
  jwkSetUri: string
  issuerUri: string
  userInfoUri: string
  userNameAttribute: string
  clientName: string
  clientAuthenticationMethod: ClientAuthenticationMethod
}>> = {
  google: {
    scope: ['openid', 'profile', 'email'],
    authorizationUri: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUri: 'https://www.googleapis.com/oauth2/v4/token',
    jwkSetUri: 'https://www.googleapis.com/oauth2/v3/certs',
    issuerUri: 'https://accounts.google.com',
    userInfoUri: 'https://www.googleapis.com/oauth2/v3/userinfo',
    userNameAttribute: 'sub',
    clientName: 'Google',
    clientAuthenticationMethod: 'client_secret_basic',
  },
  github: {
    scope: ['read:user'],
    authorizationUri: 'https://github.com/login/oauth/authorize',
    tokenUri: 'https://github.com/login/oauth/access_token',
    userInfoUri: 'https://api.github.com/user',
    userNameAttribute: 'id',
    clientName: 'GitHub',
    clientAuthenticationMethod: 'client_secret_basic',
  },
  facebook: {
    scope: ['public_profile', 'email'],
    authorizationUri: 'https://www.facebook.com/v2.8/dialog/oauth',
    tokenUri: 'https://graph.facebook.com/v2.8/oauth/access_token',
    userInfoUri: 'https://graph.facebook.com/me?fields=id,name,email',
    userNameAttribute: 'id',
    clientName: 'Facebook',
    clientAuthenticationMethod: 'client_secret_post',
  },
}

/** `OAuth2ClientPropertiesMapper.asClientRegistrations()` (spring.security.oauth2.client.*) */
export function clientRegistrationsFromEnvironment(env: Environment): ClientRegistration[] {
  const regPrefix = 'spring.security.oauth2.client.registration.'
  const provPrefix = 'spring.security.oauth2.client.provider.'
  const ids = new Set(env.keysUnder('spring.security.oauth2.client.registration').map((k) => k.slice(regPrefix.length).split('.')[0] as string))
  const out: ClientRegistration[] = []
  for (const id of ids) {
    const r = (k: string) => env.getProperty(`${regPrefix}${id}.${k}`)
    const clientId = r('client-id')
    if (clientId === null || clientId.trim().length === 0) throw new IllegalStateException('Client id must not be empty.')
    const providerId = r('provider') ?? id
    const p = (k: string) => env.getProperty(`${provPrefix}${providerId}.${k}`)
    const common = COMMON_PROVIDERS[providerId.toLowerCase()] ?? null
    const issuerUri = p('issuer-uri') ?? common?.issuerUri ?? null
    const hasProviderProps = env.keysUnder(`${provPrefix}${providerId}`).length > 0
    if (common === null && !hasProviderProps && r('provider') === null) throw new IllegalStateException(`Provider ID must be specified for client registration '${id}'`)
    if (common === null && !hasProviderProps) throw new IllegalStateException(`Unknown provider ID '${providerId}'`)
    const scopeProp = r('scope')
    const fromIssuer = p('issuer-uri') !== null
    const scopes = scopeProp !== null ? scopeProp.split(',').map((s) => s.trim()).filter((s) => s.length) : (common?.scope ?? (fromIssuer ? ['openid'] : []))
    const method = (r('client-authentication-method') as ClientAuthenticationMethod | null) ?? common?.clientAuthenticationMethod ?? 'client_secret_basic'
    out.push(
      new ClientRegistration(
        id,
        clientId,
        r('client-secret') ?? '',
        method,
        r('authorization-grant-type') ?? 'authorization_code',
        r('redirect-uri') ?? '{baseUrl}/{action}/oauth2/code/{registrationId}',
        new Set(scopes),
        new ProviderDetails(
          p('authorization-uri') ?? common?.authorizationUri ?? '',
          p('token-uri') ?? common?.tokenUri ?? '',
          {
            uri: p('user-info-uri') ?? common?.userInfoUri ?? '',
            authenticationMethod: p('user-info-authentication-method') ?? 'header',
            userNameAttributeName: p('user-name-attribute') ?? common?.userNameAttribute ?? (fromIssuer ? 'sub' : ''),
          },
          p('jwk-set-uri') ?? common?.jwkSetUri ?? '',
          issuerUri,
          {},
        ),
        r('client-name') ?? common?.clientName ?? (fromIssuer ? (issuerUri as string) : id),
      ),
    )
  }
  return out
}

/** Bean InMemoryClientRegistrationRepository : absent s'il n'y a aucune registration (ClientsConfiguredCondition) */
export class OAuth2ClientRegistrationRepositoryConfiguration {
  clientRegistrationRepository(ctx: ApplicationContext): InMemoryClientRegistrationRepository {
    return new InMemoryClientRegistrationRepository(clientRegistrationsFromEnvironment(ctx.environment))
  }
}

configuration(OAuth2ClientRegistrationRepositoryConfiguration, {
  beans: [
    {
      method: 'clientRegistrationRepository',
      type: InMemoryClientRegistrationRepository,
      inject: [{ expression: (ctx) => ctx }],
      condition: (env) => env.keysUnder('spring.security.oauth2.client.registration').length > 0,
    },
  ],
})

// ---------------------------------------------------------------------------
// Utilisateurs
// ---------------------------------------------------------------------------

/** `OAuth2User` */
export interface OAuth2User {
  getName(): string
  getAttributes(): Record<string, unknown>
  getAuthorities(): Iterable<GrantedAuthority>
  /** méthode par défaut `getAttribute(name)` */
  getAttribute<A = unknown>(name: string): A | null
}

/** `OidcIdToken` */
export class OidcIdToken {
  constructor(
    readonly tokenValue: string,
    readonly claims: Record<string, unknown>,
  ) {}
  get subject(): string | null {
    return (this.claims.sub as string | undefined) ?? null
  }
  get nonce(): string | null {
    return (this.claims.nonce as string | undefined) ?? null
  }
}

/** `OidcUserInfo` */
export class OidcUserInfo {
  constructor(readonly claims: Record<string, unknown>) {}
  get subject(): string | null {
    return (this.claims.sub as string | undefined) ?? null
  }
}

/** `OidcUser` (les accesseurs de StandardClaimAccessor utilisés par Komga : email, emailVerified) */
export interface OidcUser extends OAuth2User {
  getClaims(): Record<string, unknown>
  getUserInfo(): OidcUserInfo | null
  getIdToken(): OidcIdToken | null
  readonly email: string | null
  readonly emailVerified: boolean | null
}

/** `ClaimAccessor.getClaimAsBoolean` */
export function claimAsBoolean(claims: Record<string, unknown>, name: string): boolean | null {
  const v = claims[name]
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase()
  if (s === 'true') return true
  if (s === 'false') return false
  throw new IllegalArgumentException(`Unable to convert claim '${name}' of type '${typeof v}' to Boolean.`)
}

/** `ClaimAccessor.getClaimAsString` */
export function claimAsString(claims: Record<string, unknown>, name: string): string | null {
  const v = claims[name]
  return v === undefined || v === null ? null : String(v)
}

export class OAuth2UserAuthority implements GrantedAuthority {
  constructor(
    readonly attributes: Record<string, unknown>,
    readonly userNameAttributeName: string | null = null,
    readonly authority = 'OAUTH2_USER',
  ) {}
  getAuthority(): string {
    return this.authority
  }
}

export class OidcUserAuthority extends OAuth2UserAuthority {
  constructor(
    readonly idToken: OidcIdToken,
    readonly userInfo: OidcUserInfo | null,
    userNameAttributeName: string | null = 'sub',
  ) {
    super({ ...idToken.claims, ...(userInfo?.claims ?? {}) }, userNameAttributeName, 'OIDC_USER')
  }
}

/** `DefaultOAuth2User` */
export class DefaultOAuth2User implements OAuth2User {
  private readonly authorities: GrantedAuthority[]
  constructor(
    authorities: Iterable<GrantedAuthority>,
    private readonly attributes: Record<string, unknown>,
    private readonly nameAttributeKey: string,
  ) {
    if (!(nameAttributeKey in attributes)) throw new IllegalArgumentException(`Missing attribute '${nameAttributeKey}' in attributes`)
    this.authorities = [...authorities]
  }
  getName(): string {
    return String(this.attributes[this.nameAttributeKey])
  }
  getAttributes(): Record<string, unknown> {
    return this.attributes
  }
  getAuthorities(): GrantedAuthority[] {
    return this.authorities
  }
  getAttribute<A = unknown>(name: string): A | null {
    return (this.attributes[name] as A | undefined) ?? null
  }
}

/** `DefaultOidcUser` */
export class DefaultOidcUser extends DefaultOAuth2User implements OidcUser {
  constructor(
    authorities: Iterable<GrantedAuthority>,
    private readonly idToken: OidcIdToken,
    private readonly userInfo: OidcUserInfo | null = null,
    nameAttributeKey = 'sub',
  ) {
    super(authorities, { ...idToken.claims, ...(userInfo?.claims ?? {}) }, nameAttributeKey)
  }
  getClaims(): Record<string, unknown> {
    return this.getAttributes()
  }
  getUserInfo(): OidcUserInfo | null {
    return this.userInfo
  }
  getIdToken(): OidcIdToken {
    return this.idToken
  }
  get email(): string | null {
    return claimAsString(this.getClaims(), 'email')
  }
  get emailVerified(): boolean | null {
    return claimAsBoolean(this.getClaims(), 'email_verified')
  }
}

/** `OAuth2AccessToken` */
export class OAuth2AccessToken {
  constructor(
    readonly tokenValue: string,
    readonly scopes: Set<string>,
    readonly tokenType = 'Bearer',
  ) {}
}

/** `OAuth2UserRequest` */
export class OAuth2UserRequest {
  constructor(
    readonly clientRegistration: ClientRegistration,
    readonly accessToken: OAuth2AccessToken,
    readonly additionalParameters: Record<string, unknown> = {},
  ) {}
}

/** `OidcUserRequest` */
export class OidcUserRequest extends OAuth2UserRequest {
  constructor(
    clientRegistration: ClientRegistration,
    accessToken: OAuth2AccessToken,
    readonly idToken: OidcIdToken,
    additionalParameters: Record<string, unknown> = {},
  ) {
    super(clientRegistration, accessToken, additionalParameters)
  }
}

/**
 * `OAuth2UserService<R, U>` (interface fonctionnelle ; classe : jeton d'injection, beans distingués par nom).
 * PORT: `loadUser` asynchrone (requêtes HTTP).
 */
export class OAuth2UserService<R extends OAuth2UserRequest = OAuth2UserRequest, U extends OAuth2User = OAuth2User> {
  constructor(readonly loadUserFn: (userRequest: R) => Promise<U>) {}
  loadUser(userRequest: R): Promise<U> {
    return this.loadUserFn(userRequest)
  }
}

/** `DefaultOAuth2UserService` */
export class DefaultOAuth2UserService extends OAuth2UserService<OAuth2UserRequest, OAuth2User> {
  constructor() {
    super((r) => this.load(r))
  }

  // PORT: méthode redéfinissable (GithubOAuth2UserService) : loadUser appelle load
  override loadUser(userRequest: OAuth2UserRequest | null): Promise<OAuth2User> {
    return this.load(userRequest as OAuth2UserRequest)
  }

  protected async load(userRequest: OAuth2UserRequest): Promise<OAuth2User> {
    if (userRequest === null || userRequest === undefined) throw new IllegalArgumentException('userRequest cannot be null')
    const endpoint = userRequest.clientRegistration.providerDetails.userInfoEndpoint
    if (!endpoint.uri) throw new OAuth2AuthenticationException(new OAuth2Error('missing_user_info_uri', `Missing required UserInfo Uri in UserInfoEndpoint for Client Registration: ${userRequest.clientRegistration.registrationId}`))
    const userNameAttributeName = endpoint.userNameAttributeName
    if (!userNameAttributeName)
      throw new OAuth2AuthenticationException(
        new OAuth2Error('missing_user_name_attribute', `Missing required "user name" attribute name in UserInfoEndpoint for Client Registration: ${userRequest.clientRegistration.registrationId}`),
      )
    let attributes: Record<string, unknown>
    try {
      const form = endpoint.authenticationMethod === 'form'
      const res = await fetch(endpoint.uri, {
        method: form ? 'POST' : 'GET',
        headers: form
          ? { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
          : { Accept: 'application/json', Authorization: `Bearer ${userRequest.accessToken.tokenValue}` },
        body: form ? new URLSearchParams({ access_token: userRequest.accessToken.tokenValue }) : undefined,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new OAuth2AuthenticationException(
          new OAuth2Error('invalid_user_info_response', `An error occurred while attempting to retrieve the UserInfo Resource: Error details: [UserInfo Uri: ${endpoint.uri}, Http Status: ${res.status}, Error Code: , Error Description: ${text}]`),
        )
      }
      attributes = (await res.json()) as Record<string, unknown>
    } catch (e) {
      if (e instanceof OAuth2AuthenticationException) throw e
      throw new OAuth2AuthenticationException(
        new OAuth2Error('invalid_user_info_response', `An error occurred while attempting to retrieve the UserInfo Resource: ${(e as Error).message}`),
        null,
        e,
      )
    }
    const authorities: GrantedAuthority[] = [new OAuth2UserAuthority(attributes, userNameAttributeName)]
    for (const authority of userRequest.accessToken.scopes) authorities.push(new SimpleGrantedAuthority(`SCOPE_${authority}`))
    return new DefaultOAuth2User(authorities, attributes, userNameAttributeName)
  }
}

const ACCESSIBLE_SCOPES = new Set(['profile', 'email', 'address', 'phone'])

/** `OidcUserService` */
export class OidcUserService extends OAuth2UserService<OidcUserRequest, OidcUser> {
  private readonly oauth2UserService = new DefaultOAuth2UserService()

  constructor() {
    super((r) => this.load(r))
  }

  override loadUser(userRequest: OidcUserRequest): Promise<OidcUser> {
    return this.load(userRequest)
  }

  private async load(userRequest: OidcUserRequest): Promise<OidcUser> {
    let userInfo: OidcUserInfo | null = null
    if (this.shouldRetrieveUserInfo(userRequest)) {
      const oauth2User = await this.oauth2UserService.loadUser(userRequest)
      userInfo = new OidcUserInfo(oauth2User.getAttributes())
      if (userInfo.subject === null) throw new OAuth2AuthenticationException(new OAuth2Error('invalid_user_info_response'))
      if (userInfo.subject !== userRequest.idToken.subject) throw new OAuth2AuthenticationException(new OAuth2Error('invalid_user_info_response'))
    }
    const authorities: GrantedAuthority[] = [new OidcUserAuthority(userRequest.idToken, userInfo)]
    for (const s of userRequest.accessToken.scopes) authorities.push(new SimpleGrantedAuthority(`SCOPE_${s}`))
    const userNameAttributeName = userRequest.clientRegistration.providerDetails.userInfoEndpoint.userNameAttributeName
    return userNameAttributeName
      ? new DefaultOidcUser(authorities, userRequest.idToken, userInfo, userNameAttributeName)
      : new DefaultOidcUser(authorities, userRequest.idToken, userInfo)
  }

  private shouldRetrieveUserInfo(userRequest: OidcUserRequest): boolean {
    const providerDetails = userRequest.clientRegistration.providerDetails
    if (!providerDetails.userInfoEndpoint.uri) return false
    if (userRequest.clientRegistration.authorizationGrantType === 'authorization_code') {
      const scopes = userRequest.accessToken.scopes
      return ACCESSIBLE_SCOPES.size === 0 || scopes.size === 0 || [...scopes].some((s) => ACCESSIBLE_SCOPES.has(s))
    }
    return false
  }
}

// ---------------------------------------------------------------------------
// Jetons d'authentification
// ---------------------------------------------------------------------------

/** `OAuth2AuthorizationRequest` (mémorisée en session) */
export class OAuth2AuthorizationRequest {
  constructor(
    readonly authorizationUri: string,
    readonly clientId: string,
    readonly redirectUri: string,
    readonly scopes: Set<string>,
    readonly state: string,
    readonly additionalParameters: Record<string, string>,
    readonly attributes: Record<string, string>,
    readonly authorizationRequestUri: string,
  ) {}
}

export class OAuth2AuthorizationExchange {
  constructor(
    readonly authorizationRequest: OAuth2AuthorizationRequest,
    readonly authorizationResponse: { code: string | null; state: string | null; error: OAuth2Error | null; redirectUri: string; query: string },
  ) {}
}

/** `OAuth2LoginAuthenticationToken` */
export class OAuth2LoginAuthenticationToken extends AbstractAuthenticationToken {
  private thePrincipal: OAuth2User | null = null
  accessToken: OAuth2AccessToken | null = null

  constructor(
    readonly clientRegistration: ClientRegistration,
    readonly authorizationExchange: OAuth2AuthorizationExchange,
    principal: OAuth2User | null = null,
    authorities: Iterable<GrantedAuthority> | null = null,
    accessToken: OAuth2AccessToken | null = null,
  ) {
    super(authorities)
    if (principal !== null) {
      this.thePrincipal = principal
      this.accessToken = accessToken
      this.setAuthenticated(true)
    }
  }

  get principal(): unknown {
    return this.thePrincipal
  }

  get credentials(): unknown {
    return ''
  }
}

/** `OAuth2AuthenticationToken` */
export class OAuth2AuthenticationToken extends AbstractAuthenticationToken {
  constructor(
    private readonly thePrincipal: OAuth2User,
    authorities: Iterable<GrantedAuthority>,
    readonly authorizedClientRegistrationId: string,
  ) {
    super(authorities)
    this.setAuthenticated(true)
  }
  get principal(): unknown {
    return this.thePrincipal
  }
  get credentials(): unknown {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Échange du code (openid-client)
// ---------------------------------------------------------------------------

const configurations = new WeakMap<ClientRegistration, Promise<client.Configuration>>()

async function configurationOf(registration: ClientRegistration): Promise<client.Configuration> {
  let c = configurations.get(registration)
  if (!c) {
    c = (async () => {
      const auth =
        registration.clientAuthenticationMethod === 'client_secret_post'
          ? client.ClientSecretPost(registration.clientSecret)
          : registration.clientAuthenticationMethod === 'none'
            ? client.None()
            : client.ClientSecretBasic(registration.clientSecret)
      const pd = registration.providerDetails
      if (pd.issuerUri !== null && (!pd.authorizationUri || !pd.tokenUri)) {
        const config = await client.discovery(new URL(pd.issuerUri), registration.clientId, registration.clientSecret || undefined, auth, {
          execute: [client.allowInsecureRequests],
        })
        const md = config.serverMetadata()
        pd.authorizationUri = pd.authorizationUri || (md.authorization_endpoint ?? '')
        pd.tokenUri = pd.tokenUri || (md.token_endpoint ?? '')
        pd.userInfoEndpoint.uri = pd.userInfoEndpoint.uri || (md.userinfo_endpoint ?? '')
        pd.jwkSetUri = pd.jwkSetUri || (md.jwks_uri ?? '')
        pd.configurationMetadata = { ...md }
        return config
      }
      const config = new client.Configuration(
        {
          issuer: pd.issuerUri ?? new URL(pd.authorizationUri).origin,
          authorization_endpoint: pd.authorizationUri,
          token_endpoint: pd.tokenUri,
          userinfo_endpoint: pd.userInfoEndpoint.uri || undefined,
          jwks_uri: pd.jwkSetUri || undefined,
        },
        registration.clientId,
        registration.clientSecret || undefined,
        auth,
      )
      client.allowInsecureRequests(config)
      return config
    })()
    c.catch(() => configurations.delete(registration))
    configurations.set(registration, c)
  }
  return c
}

/** `Base64StringKeyGenerator(Base64.getUrlEncoder().withoutPadding(), 96)` */
function secureKey(): string {
  return randomBytes(96).toString('base64url')
}

function s256(value: string): string {
  return createHash('sha256').update(value, 'ascii').digest('base64url')
}

/** Fournisseurs (OAuth2LoginAuthenticationProvider / OidcAuthorizationCodeAuthenticationProvider) */
class OAuth2LoginProvider extends AuthenticationProvider {
  constructor(
    private readonly oidc: boolean,
    private readonly userService: OAuth2UserService<OAuth2UserRequest, OAuth2User>,
    private readonly oidcUserService: OAuth2UserService<OidcUserRequest, OidcUser>,
  ) {
    super()
  }

  supports(authentication: AnyClass): boolean {
    return isAssignableFrom(OAuth2LoginAuthenticationToken, authentication)
  }

  authenticate(): Authentication | null {
    throw new IllegalStateException('OAuth2 login authentication is asynchronous: use authenticateAsync')
  }

  async authenticateAsync(authentication: OAuth2LoginAuthenticationToken): Promise<Authentication | null> {
    const exchange = authentication.authorizationExchange
    const request = exchange.authorizationRequest
    const isOidc = request.scopes.has('openid')
    if (isOidc !== this.oidc) return null
    const response = exchange.authorizationResponse
    if (response.error !== null) throw new OAuth2AuthenticationException(response.error, response.error.toString())
    if (response.state !== request.state) throw new OAuth2AuthenticationException(new OAuth2Error('invalid_state_parameter'))
    const registration = authentication.clientRegistration
    const config = await configurationOf(registration)
    let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>
    try {
      tokens = await client.authorizationCodeGrant(
        config,
        new URL(`${request.redirectUri}?${response.query}`),
        {
          expectedState: request.state,
          pkceCodeVerifier: request.attributes.code_verifier,
          expectedNonce: isOidc ? request.additionalParameters.nonce : undefined,
          idTokenExpected: isOidc,
        },
      )
    } catch (e) {
      throw this.toAuthenticationException(e, isOidc, registration)
    }
    const scopes = tokens.scope ? new Set(tokens.scope.split(' ').filter((s) => s.length)) : new Set(registration.scopes)
    const accessToken = new OAuth2AccessToken(tokens.access_token, scopes)
    const additionalParameters: Record<string, unknown> = { ...tokens }
    let user: OAuth2User
    if (isOidc) {
      if (!tokens.id_token)
        throw new OAuth2AuthenticationException(new OAuth2Error('invalid_id_token', `Missing (required) ID Token in Token Response for Client Registration: ${registration.registrationId}`))
      const idToken = new OidcIdToken(tokens.id_token, { ...(tokens.claims() ?? {}) })
      user = await this.oidcUserService.loadUser(new OidcUserRequest(registration, accessToken, idToken, additionalParameters))
    } else {
      user = await this.userService.loadUser(new OAuth2UserRequest(registration, accessToken, additionalParameters))
    }
    const result = new OAuth2LoginAuthenticationToken(registration, exchange, user, [...user.getAuthorities()], accessToken)
    result.details = authentication.details
    return result
  }

  private toAuthenticationException(e: unknown, isOidc: boolean, registration: ClientRegistration): AuthenticationException {
    if (e instanceof AuthenticationException) return e
    const err = e as { error?: string; error_description?: string; message?: string; code?: string }
    if (typeof err.error === 'string') return new OAuth2AuthenticationException(new OAuth2Error(err.error, err.error_description ?? null), null, e)
    // messages de toute la chaîne des causes (openid-client enveloppe les erreurs d'oauth4webapi)
    let message = err.message ?? String(e)
    for (let c = (e as { cause?: unknown }).cause, i = 0; c !== undefined && c !== null && i < 5; c = (c as { cause?: unknown }).cause, i++)
      message += ` ${c instanceof Error ? c.message : JSON.stringify(c)}`
    if (isOidc && /nonce/i.test(message)) return new OAuth2AuthenticationException(new OAuth2Error('invalid_nonce', `Invalid nonce: ${message}`), null, e)
    if (isOidc && /id_token|ID Token|JWT|claim/i.test(message))
      return new OAuth2AuthenticationException(
        new OAuth2Error('invalid_id_token', `An error occurred while attempting to decode the Jwt: ${message}`),
        null,
        e,
      )
    logger.debug(() => `Token request for ${registration.registrationId} failed: ${message}`)
    return new OAuth2AuthenticationException(new OAuth2Error('invalid_token_response', `An error occurred while attempting to retrieve the OAuth 2.0 Access Token Response: ${message}`), null, e)
  }
}

// ---------------------------------------------------------------------------
// Filtres
// ---------------------------------------------------------------------------

const AUTHORIZATION_REQUEST_ATTR = 'org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizationRequestRepository.AUTHORIZATION_REQUEST'
const AUTHORIZATION_REQUEST_BASE_URI = '/oauth2/authorization'
const DEFAULT_FILTER_PROCESSES_URI = '/login/oauth2/code/*'

function baseUrl(request: HttpServletRequest): string {
  const scheme = request.scheme
  const port = request.serverPort
  const includePort = !((scheme === 'http' && port === 80) || (scheme === 'https' && port === 443))
  return `${scheme}://${request.serverName}${includePort ? `:${port}` : ''}${request.contextPath}`
}

/** `OAuth2AuthorizationRequestRedirectFilter` + DefaultOAuth2AuthorizationRequestResolver */
export class OAuth2AuthorizationRequestRedirectFilter implements Filter {
  private readonly matcher = PathPatternParser.defaultInstance.parse(`${AUTHORIZATION_REQUEST_BASE_URI}/{registrationId}`)
  private readonly redirectStrategy = new DefaultRedirectStrategy()

  constructor(private readonly clientRegistrationRepository: InMemoryClientRegistrationRepository) {}

  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    const vars = this.matcher.matchAndExtract(request.servletPath)
    if (vars !== null) {
      try {
        const registrationId = vars.get('registrationId') as string
        const clientRegistration = this.clientRegistrationRepository.findByRegistrationId(registrationId)
        if (clientRegistration === null) throw new IllegalArgumentException(`Invalid Client Registration with Id: ${registrationId}`)
        const authorizationRequest = await this.resolve(request, clientRegistration)
        // HttpSessionOAuth2AuthorizationRequestRepository.saveAuthorizationRequest
        request.getSession()?.setAttribute(AUTHORIZATION_REQUEST_ATTR, authorizationRequest)
        this.redirectStrategy.sendRedirect(request, response, authorizationRequest.authorizationRequestUri)
      } catch (ex) {
        logger.error(() => `Authorization Request failed: ${(ex as Error).message}`)
        response.sendError(500, 'Internal Server Error')
      }
      return
    }
    await chain.doFilter(request, response)
  }

  private async resolve(request: HttpServletRequest, clientRegistration: ClientRegistration): Promise<OAuth2AuthorizationRequest> {
    if (clientRegistration.authorizationGrantType !== 'authorization_code')
      throw new IllegalArgumentException(`Invalid Authorization Grant Type (${clientRegistration.authorizationGrantType}) for Client Registration with Id: ${clientRegistration.registrationId}`)
    const config = await configurationOf(clientRegistration)
    const redirectUri = clientRegistration.redirectUri
      .replace('{baseUrl}', baseUrl(request))
      .replace('{action}', 'login')
      .replace('{registrationId}', clientRegistration.registrationId)
      .replace('{baseScheme}', request.scheme)
      .replace('{baseHost}', request.serverName)
      .replace('{basePath}', request.contextPath)
    // Base64StringKeyGenerator(Base64.getUrlEncoder()) : 32 octets, avec remplissage
    const state = randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    const additionalParameters: Record<string, string> = {}
    const attributes: Record<string, string> = { registration_id: clientRegistration.registrationId }
    if (clientRegistration.scopes.has('openid')) {
      const nonce = secureKey()
      attributes.nonce = nonce
      additionalParameters.nonce = s256(nonce)
    }
    if (clientRegistration.clientAuthenticationMethod === 'none') {
      const codeVerifier = secureKey()
      attributes.code_verifier = codeVerifier
      additionalParameters.code_challenge = s256(codeVerifier)
      additionalParameters.code_challenge_method = 'S256'
    }
    const params: Record<string, string> = {
      response_type: 'code',
      client_id: clientRegistration.clientId,
      scope: [...clientRegistration.scopes].join(' '),
      state,
      redirect_uri: redirectUri,
      ...additionalParameters,
    }
    const url = client.buildAuthorizationUrl(config, params).toString()
    return new OAuth2AuthorizationRequest(
      clientRegistration.providerDetails.authorizationUri,
      clientRegistration.clientId,
      redirectUri,
      new Set(clientRegistration.scopes),
      state,
      additionalParameters,
      attributes,
      url,
    )
  }
}

/** `OAuth2LoginAuthenticationFilter` (AbstractAuthenticationProcessingFilter) */
export class OAuth2LoginAuthenticationFilter implements Filter {
  private readonly matcher = PathPatternParser.defaultInstance.parse(DEFAULT_FILTER_PROCESSES_URI)

  constructor(
    private readonly clientRegistrationRepository: InMemoryClientRegistrationRepository,
    private readonly providers: OAuth2LoginProvider[],
    private readonly authenticationManager: ProviderManager,
    private readonly ctx: HttpSecurityBuildContext,
    private readonly authenticationDetailsSource: AuthenticationDetailsSource,
    private readonly successHandler: SavedRequestAwareAuthenticationSuccessHandler,
    private readonly failureHandler: AuthenticationFailureHandler,
  ) {}

  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    if (!this.matcher.matches(request.servletPath)) {
      await chain.doFilter(request, response)
      return
    }
    let authenticationResult: Authentication
    try {
      authenticationResult = await this.attemptAuthentication(request)
      this.ctx.sessionAuthenticationStrategy.onAuthentication(authenticationResult, request, response)
    } catch (ex) {
      if (!(ex instanceof AuthenticationException)) throw ex
      SecurityContextHolder.clearContext()
      this.ctx.rememberMeServices.loginFail(request, response)
      await this.failureHandler.onAuthenticationFailure(request, response, ex)
      return
    }
    const context = SecurityContextHolder.createEmptyContext()
    context.authentication = authenticationResult
    SecurityContextHolder.setContext(context)
    this.ctx.securityContextRepository.saveContext(context, request, response)
    this.ctx.rememberMeServices.loginSuccess(request, response, authenticationResult)
    this.ctx.eventPublisher?.publishEvent(new InteractiveAuthenticationSuccessEvent(authenticationResult, OAuth2LoginAuthenticationFilter))
    await this.successHandler.onAuthenticationSuccess(request, response)
  }

  private async attemptAuthentication(request: HttpServletRequest): Promise<Authentication> {
    const code = request.getParameter('code')
    const state = request.getParameter('state')
    const error = request.getParameter('error')
    if (!((code !== null && state !== null) || (error !== null && state !== null))) {
      const oauth2Error = new OAuth2Error('invalid_request')
      throw new OAuth2AuthenticationException(oauth2Error, oauth2Error.toString())
    }
    // HttpSessionOAuth2AuthorizationRequestRepository.removeAuthorizationRequest
    const session = request.getSession(false)
    const saved = session !== null ? session.getAttribute(AUTHORIZATION_REQUEST_ATTR) : null
    const authorizationRequest = saved instanceof OAuth2AuthorizationRequest && saved.state === state ? saved : null
    if (authorizationRequest === null) {
      const oauth2Error = new OAuth2Error('authorization_request_not_found')
      throw new OAuth2AuthenticationException(oauth2Error, oauth2Error.toString())
    }
    session?.removeAttribute(AUTHORIZATION_REQUEST_ATTR)
    const registrationId = authorizationRequest.attributes.registration_id as string
    const clientRegistration = this.clientRegistrationRepository.findByRegistrationId(registrationId)
    if (clientRegistration === null) {
      const oauth2Error = new OAuth2Error('client_registration_not_found', `Client Registration not found with Id: ${registrationId}`)
      throw new OAuth2AuthenticationException(oauth2Error, oauth2Error.toString())
    }
    const redirectUri = request.requestURL
    const exchange = new OAuth2AuthorizationExchange(authorizationRequest, {
      code,
      state,
      error: error !== null ? new OAuth2Error(error, request.getParameter('error_description'), request.getParameter('error_uri')) : null,
      redirectUri,
      query: request.queryString ?? '',
    })
    const authenticationDetails = this.authenticationDetailsSource.buildDetails(request)
    const authenticationRequest = new OAuth2LoginAuthenticationToken(clientRegistration, exchange)
    authenticationRequest.details = authenticationDetails
    const authenticationResult = (await this.authenticate(authenticationRequest)) as OAuth2LoginAuthenticationToken
    const principal = authenticationResult.principal as OAuth2User
    const oauth2Authentication = new OAuth2AuthenticationToken(principal, authenticationResult.authorities, clientRegistration.registrationId)
    oauth2Authentication.details = authenticationDetails
    return oauth2Authentication
  }

  /** ProviderManager.authenticate en version asynchrone (mêmes événements) */
  private async authenticate(authentication: OAuth2LoginAuthenticationToken): Promise<Authentication> {
    const publisher = this.authenticationManager.getAuthenticationEventPublisher()
    let lastException: AuthenticationException | null = null
    for (const provider of this.providers) {
      try {
        const result = await provider.authenticateAsync(authentication)
        if (result !== null) {
          publisher.publishAuthenticationSuccess(result)
          return result
        }
      } catch (ex) {
        if (ex instanceof InternalAuthenticationServiceException) {
          publisher.publishAuthenticationFailure(ex, authentication)
          throw ex
        }
        if (ex instanceof AuthenticationException) lastException = ex
        else throw new InternalAuthenticationServiceException((ex as Error).message, ex)
      }
    }
    const e = lastException ?? new OAuth2AuthenticationException(new OAuth2Error('server_error', 'No AuthenticationProvider found'))
    publisher.publishAuthenticationFailure(e, authentication)
    throw e
  }
}

registerFilterOrder(OAuth2AuthorizationRequestRedirectFilter, FILTER_ORDER.OAuth2AuthorizationRequestRedirectFilter)
registerFilterOrder(OAuth2LoginAuthenticationFilter, FILTER_ORDER.OAuth2LoginAuthenticationFilter)

// ---------------------------------------------------------------------------
// OAuth2LoginConfigurer
// ---------------------------------------------------------------------------

export class UserInfoEndpointConfig {
  service: OAuth2UserService<OAuth2UserRequest, OAuth2User> | null = null
  oidcService: OAuth2UserService<OidcUserRequest, OidcUser> | null = null
  userService(s: OAuth2UserService<OAuth2UserRequest, OAuth2User>): this {
    this.service = s
    return this
  }
  oidcUserService(s: OAuth2UserService<OidcUserRequest, OidcUser>): this {
    this.oidcService = s
    return this
  }
}

export class RedirectionEndpointConfig {
  base: string | null = null
  baseUri(uri: string): this {
    this.base = uri
    return this
  }
}

/** `OAuth2LoginConfigurer` */
export class OAuth2LoginConfigurer {
  readonly userInfo = new UserInfoEndpointConfig()
  readonly redirection = new RedirectionEndpointConfig()
  private detailsSource: AuthenticationDetailsSource = new WebAuthenticationDetailsSource()
  private loginPageUrl: string | null = null
  private defaultSuccess: { url: string; always: boolean } | null = null
  private failure: AuthenticationFailureHandler | null = null

  userInfoEndpoint(c: (it: UserInfoEndpointConfig) => void): this {
    c(this.userInfo)
    return this
  }
  authenticationDetailsSource(s: AuthenticationDetailsSource): this {
    this.detailsSource = s
    return this
  }
  loginPage(url: string): this {
    this.loginPageUrl = url
    return this
  }
  defaultSuccessUrl(url: string, alwaysUse = false): this {
    this.defaultSuccess = { url, always: alwaysUse }
    return this
  }
  // PORT: AuthenticationFailureHandler (interface fonctionnelle) : objet ou lambda
  failureHandler(h: AuthenticationFailureHandler | AuthenticationFailureHandler['onAuthenticationFailure']): this {
    this.failure = typeof h === 'function' ? { onAuthenticationFailure: h } : h
    return this
  }
  redirectionEndpoint(c: (it: RedirectionEndpointConfig) => void): this {
    c(this.redirection)
    return this
  }

  /** Contribution à HttpSecurity.build() */
  apply(http: HttpSecurity): void {
    const ctx = http.applicationContext
    if (ctx === null) throw new IllegalStateException('oauth2Login requires an ApplicationContext')
    const repository = ctx.getBean(InMemoryClientRegistrationRepository)
    const userService = this.userInfo.service ?? new DefaultOAuth2UserService()
    const oidcUserService = this.userInfo.oidcService ?? new OidcUserService()
    const providers = [new OAuth2LoginProvider(false, userService, oidcUserService), new OAuth2LoginProvider(true, userService, oidcUserService)]
    const loginPage = this.loginPageUrl ?? '/login'
    // AbstractAuthenticationFilterConfigurer.getAuthenticationEntryPointMatcher
    const mediaMatcher = new MediaTypeRequestMatcher(
      new ParsedMediaType('application', 'xhtml+xml'),
      new ParsedMediaType('image', '*'),
      ParsedMediaType.TEXT_HTML,
      ParsedMediaType.TEXT_PLAIN,
    ).setIgnoredMediaTypes([ParsedMediaType.ALL])
    const entryPointMatcher: RequestMatcher = new AndRequestMatcher(new NegatedRequestMatcher(new RequestHeaderRequestMatcher('X-Requested-With', 'XMLHttpRequest')), mediaMatcher)
    const successHandler = new SavedRequestAwareAuthenticationSuccessHandler()
    if (this.defaultSuccess !== null) {
      successHandler.defaultTargetUrl = this.defaultSuccess.url
      successHandler.alwaysUseDefaultTargetUrl = this.defaultSuccess.always
    }
    const failureHandler: AuthenticationFailureHandler = this.failure ?? {
      onAuthenticationFailure: (request, response, exception) => {
        request.getSession()?.setAttribute(AUTHENTICATION_EXCEPTION, exception)
        new DefaultRedirectStrategy().sendRedirect(request, response, `${loginPage}?error`)
      },
    }
    const detailsSource = this.detailsSource
    http.with({
      entryPoint: [entryPointMatcher, new LoginUrlAuthenticationEntryPoint(loginPage)],
      filters: (b) => [
        { filter: new OAuth2AuthorizationRequestRedirectFilter(repository), order: FILTER_ORDER.OAuth2AuthorizationRequestRedirectFilter },
        {
          filter: new OAuth2LoginAuthenticationFilter(repository, providers, b.authenticationManager, b, detailsSource, successHandler, failureHandler),
          order: FILTER_ORDER.OAuth2LoginAuthenticationFilter,
        },
      ],
    })
  }
}

/** `http.oauth2Login { }` */
export function oauth2Login(http: HttpSecurity, c: (it: OAuth2LoginConfigurer) => void): HttpSecurity {
  const configurer = new OAuth2LoginConfigurer()
  c(configurer)
  configurer.apply(http)
  return http
}

declare module './spring-security-web.js' {
  interface HttpSecurity {
    /** `oauth2Login(Customizer)` (ajouté par spring-security-oauth2.ts) */
    oauth2Login(c: (it: OAuth2LoginConfigurer) => void): HttpSecurity
  }
}

HttpSecurity.prototype.oauth2Login = function (this: HttpSecurity, c: (it: OAuth2LoginConfigurer) => void): HttpSecurity {
  return oauth2Login(this, c)
}

/** Principal courant authentifié par OAuth2 ? */
export function isOAuth2Authenticated(a: Authentication | null): boolean {
  return a instanceof OAuth2AuthenticationToken && AuthenticationTrustResolver.isAuthenticated(a)
}
