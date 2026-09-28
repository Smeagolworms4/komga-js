// Support de portage : Spring Security 6.5 web (spring-security-web / spring-security-config) utilisé par Komga.
// - HttpSecurity : le sous-ensemble du DSL employé par SecurityConfiguration.kt, en style « lambda » (Java) et en
//   style Kotlin `http { }` (HttpSecurity.invoke) ; build() assemble les filtres dans l'ordre de FilterOrderRegistration
// - filtres : SecurityContextHolderFilter, HeaderWriterFilter, CorsFilter, LogoutFilter, ConcurrentSessionFilter,
//   BasicAuthenticationFilter, RequestCacheAwareFilter, RememberMeAuthenticationFilter, AnonymousAuthenticationFilter,
//   SessionManagementFilter, ExceptionTranslationFilter, AuthorizationFilter (+ filtres OAuth2 de spring-security-oauth2.ts)
// - FilterChainProxy (pare-feu StrictHttpFirewall, chaînes SecurityFilterChain ordonnées par @Order), enregistré
//   comme FilterRegistrationBean `springSecurityFilterChain` à l'ordre -100 (SecurityFilterAutoConfiguration)
// - TokenBasedRememberMeServices : format et signature SHA-256 des cookies identiques à Spring (cookies interchangeables)
//
// CONTRAT avec le dispatcher MVC : à la fin de la chaîne de sécurité (juste avant la servlet), si l'utilisateur est
// authentifié (non anonyme), `request.userPrincipal` = l'Authentication et l'attribut de requête `komga.principal`
// (constante PRINCIPAL_ATTRIBUTE) = `authentication.principal` (le KomgaPrincipal), pour résoudre
// `authenticationPrincipal()` et `principal()`. Le SecurityContext reste aussi lisible par
// `SecurityContextHolder.getContext()` pendant tout le traitement (AsyncLocalStorage). Le dispatcher doit laisser
// remonter AccessDeniedException / AuthenticationException (voir checkPreAuthorize dans spring-security.ts).
// Ce fichier n'a pas de jumeau Kotlin.
import { randomUUID } from 'node:crypto'
import { Exception, IllegalArgumentException, IllegalStateException, UnsupportedOperationException } from './kotlin.js'
import { KotlinLogging } from './logging.js'
import { ParsedMediaType, sortBySpecificity } from './media-type.js'
import { PathPatternParser, type PathPattern } from './path-pattern.js'
import { Cookie, FilterRegistrationBean, type Filter, type FilterChain, type HttpServletRequest, type HttpServletResponse, type HttpSession } from './servlet.js'
import { type ApplicationContext, ApplicationEventPublisher, type Dependency, configuration } from './spring.js'
import { type CorsConfiguration, type CorsConfigurationSource, CorsFilter } from './spring-web-cors.js'
import { OncePerRequestFilter, setFilterDispatcherTypes } from './spring-web-filter.js'
import { HandlerMapping, setPreAuthorizeEvaluator } from './spring-web-dispatcher.js'
import {
  AccessDeniedException,
  AnonymousAuthenticationToken,
  type AnyClass,
  type Authentication,
  AuthenticationCredentialsNotFoundException,
  type AuthenticationDetailsSource,
  AuthenticationEventPublisher,
  AuthenticationException,
  type AuthenticationManager,
  AuthenticationTrustResolver,
  AuthorizationDeniedException,
  BadCredentialsException,
  CookieTheftException,
  DaoAuthenticationProvider,
  InsufficientAuthenticationException,
  InteractiveAuthenticationSuccessEvent,
  InvalidCookieException,
  LogoutSuccessEvent,
  PasswordEncoder,
  ProviderManager,
  RememberMeAuthenticationProvider,
  RememberMeAuthenticationToken,
  SecurityContext,
  SecurityContextHolder,
  type SecurityContextHolderStrategy,
  SessionAuthenticationException,
  SessionFixationProtectionEvent,
  SimpleGrantedAuthority,
  UsernameNotFoundException,
  UsernamePasswordAuthenticationToken,
  type UserDetails,
  UserDetailsService,
  WebAuthenticationDetailsSource,
  checkAccountStatus,
  evaluateSecurityExpression,
  constantTimeEquals,
  digestHex,
  isUserDetails,
  AccountStatusException,
  RememberMeAuthenticationException,
  AuthenticationProvider,
} from './spring-security.js'
import { type SessionRegistry, changeSessionId, isRequestedSessionIdValid, requestedSessionIdOf } from './spring-session.js'

/** Attribut de requête portant le principal authentifié (contrat avec le dispatcher MVC) */
export const PRINCIPAL_ATTRIBUTE = 'komga.principal'

const logger = KotlinLogging.logger('org.springframework.security.web.FilterChainProxy')

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Chemin dans l'application, brut (non décodé), sans le context-path */
function pathWithinApplication(request: HttpServletRequest): string {
  const uri = rawRequestUri(request)
  return request.contextPath && uri.startsWith(request.contextPath) ? uri.slice(request.contextPath.length) || '/' : uri
}

/** `request.getRequestURI()` de Tomcat : chemin brut, non décodé, non normalisé */
export function rawRequestUri(request: HttpServletRequest): string {
  const raw = request.raw?.url
  if (typeof raw === 'string') {
    const q = raw.indexOf('?')
    const p = q < 0 ? raw : raw.slice(0, q)
    // requête en forme absolue (proxy) : ne garder que le chemin
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) {
      try {
        return new URL(p).pathname
      } catch {
        return p
      }
    }
    return p
  }
  return request.requestURI
}

/** `java.net.URLEncoder.encode(s, UTF_8)` */
export function javaUrlEncode(s: string): string {
  let out = ''
  for (const b of Buffer.from(s, 'utf8')) {
    const c = String.fromCharCode(b)
    if (/[A-Za-z0-9.\-*_]/.test(c)) out += c
    else if (c === ' ') out += '+'
    else out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/** `java.net.URLDecoder.decode(s, UTF_8)` */
export function javaUrlDecode(s: string): string {
  const bytes: number[] = []
  let out = ''
  const flush = () => {
    if (bytes.length) {
      out += Buffer.from(bytes).toString('utf8')
      bytes.length = 0
    }
  }
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string
    if (c === '%') {
      const hex = s.slice(i + 1, i + 3)
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new IllegalArgumentException(`URLDecoder: Illegal hex characters in escape (%) pattern`)
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      flush()
      out += c === '+' ? ' ' : c
    }
  }
  flush()
  return out
}

/** `UrlUtils.buildFullRequestUrl(request)` */
function buildFullRequestUrl(request: HttpServletRequest): string {
  const q = request.queryString
  return `${request.requestURL}${q ? `?${q}` : ''}`
}

/** `UrlUtils.isAbsoluteUrl` */
function isAbsoluteUrl(url: string): boolean {
  return /^[a-z0-9.+-]+:\/\/.*/i.test(url)
}

/** `DefaultRedirectStrategy` (contextRelative = false) */
export class DefaultRedirectStrategy {
  sendRedirect(request: HttpServletRequest, response: HttpServletResponse, url: string): void {
    const redirectUrl = isAbsoluteUrl(url) ? url : request.contextPath + url
    response.sendRedirect(redirectUrl)
  }
}

// ---------------------------------------------------------------------------
// RequestMatcher
// ---------------------------------------------------------------------------

export interface RequestMatcher {
  matches(request: HttpServletRequest): boolean
}

export const AnyRequestMatcher = {
  INSTANCE: {
    matches: (): boolean => true,
    toString: (): string => 'any request',
  } as RequestMatcher,
}

/**
 * `PathPatternRequestMatcher` (et MvcRequestMatcher, utilisé par `requestMatchers(String...)` en présence de Spring MVC :
 * même sémantique PathPattern sur le chemin dans l'application, sensible à la casse, sans séparateur final optionnel).
 */
export class PathPatternRequestMatcher implements RequestMatcher {
  private readonly pattern: PathPattern

  constructor(
    readonly patternString: string,
    private readonly method: string | null = null,
  ) {
    this.pattern = PathPatternParser.defaultInstance.parse(PathPatternParser.defaultInstance.initFullPathPattern(patternString))
  }

  static withDefaults(): { matcher(methodOrPattern: string, pattern?: string): PathPatternRequestMatcher } {
    return {
      matcher: (methodOrPattern: string, pattern?: string) =>
        pattern === undefined ? new PathPatternRequestMatcher(methodOrPattern) : new PathPatternRequestMatcher(pattern, methodOrPattern),
    }
  }

  matches(request: HttpServletRequest): boolean {
    if (this.method !== null && request.method !== this.method) return false
    try {
      return this.pattern.matches(pathWithinApplication(request))
    } catch {
      return false
    }
  }

  toString(): string {
    return `PathPattern [${this.method !== null ? `${this.method} ` : ''}${this.patternString}]`
  }
}

/** `AntPathRequestMatcher` (sous-ensemble : motifs sans `**` au milieu, comparés comme PathPattern) */
export class AntPathRequestMatcher extends PathPatternRequestMatcher {}

export class NegatedRequestMatcher implements RequestMatcher {
  constructor(private readonly matcher: RequestMatcher) {}
  matches(request: HttpServletRequest): boolean {
    return !this.matcher.matches(request)
  }
}

export class AndRequestMatcher implements RequestMatcher {
  private readonly matchers: RequestMatcher[]
  constructor(...matchers: (RequestMatcher | RequestMatcher[])[]) {
    this.matchers = matchers.flat()
  }
  matches(request: HttpServletRequest): boolean {
    return this.matchers.every((m) => m.matches(request))
  }
}

export class OrRequestMatcher implements RequestMatcher {
  private readonly matchers: RequestMatcher[]
  constructor(...matchers: (RequestMatcher | RequestMatcher[])[]) {
    this.matchers = matchers.flat()
  }
  matches(request: HttpServletRequest): boolean {
    return this.matchers.some((m) => m.matches(request))
  }
}

export class RequestHeaderRequestMatcher implements RequestMatcher {
  constructor(
    private readonly expectedHeaderName: string,
    private readonly expectedHeaderValue: string | null = null,
  ) {}
  matches(request: HttpServletRequest): boolean {
    const actual = request.getHeader(this.expectedHeaderName)
    if (this.expectedHeaderValue === null) return actual !== null
    return this.expectedHeaderValue === actual
  }
}

/** `MediaTypeRequestMatcher` avec HeaderContentNegotiationStrategy (tri MimeTypeUtils.sortBySpecificity) */
export class MediaTypeRequestMatcher implements RequestMatcher {
  private readonly matchingMediaTypes: ParsedMediaType[]
  useEquals = false
  ignoredMediaTypes: ParsedMediaType[] = []

  constructor(...matchingMediaTypes: ParsedMediaType[]) {
    this.matchingMediaTypes = matchingMediaTypes
  }

  setUseEquals(v: boolean): this {
    this.useEquals = v
    return this
  }

  setIgnoredMediaTypes(v: ParsedMediaType[]): this {
    this.ignoredMediaTypes = v
    return this
  }

  matches(request: HttpServletRequest): boolean {
    let httpRequestMediaTypes: ParsedMediaType[]
    try {
      const accept = request.getHeaders('Accept')
      httpRequestMediaTypes = accept.length === 0 ? [] : ParsedMediaType.parseList(accept)
      sortBySpecificity(httpRequestMediaTypes)
      if (httpRequestMediaTypes.length === 0) httpRequestMediaTypes = [ParsedMediaType.ALL]
    } catch {
      return false
    }
    for (const httpRequestMediaType of httpRequestMediaTypes) {
      if (this.shouldIgnore(httpRequestMediaType)) continue
      if (this.useEquals) return this.matchingMediaTypes.some((m) => m.equalsTypeAndSubtype(httpRequestMediaType) && sameParams(m, httpRequestMediaType))
      for (const matchingMediaType of this.matchingMediaTypes) if (matchingMediaType.isCompatibleWith(httpRequestMediaType)) return true
    }
    return false
  }

  private shouldIgnore(t: ParsedMediaType): boolean {
    return this.ignoredMediaTypes.some((ignored) => t.includes(ignored))
  }
}

function sameParams(a: ParsedMediaType, b: ParsedMediaType): boolean {
  if (a.parameters.size !== b.parameters.size) return false
  for (const [k, v] of a.parameters) if (b.parameters.get(k) !== v) return false
  return true
}

const MT = {
  ALL: ParsedMediaType.ALL,
  APPLICATION_ATOM_XML: new ParsedMediaType('application', 'atom+xml'),
  APPLICATION_FORM_URLENCODED: new ParsedMediaType('application', 'x-www-form-urlencoded'),
  APPLICATION_JSON: ParsedMediaType.APPLICATION_JSON,
  APPLICATION_OCTET_STREAM: ParsedMediaType.APPLICATION_OCTET_STREAM,
  APPLICATION_XML: new ParsedMediaType('application', 'xml'),
  MULTIPART_FORM_DATA: new ParsedMediaType('multipart', 'form-data'),
  TEXT_XML: new ParsedMediaType('text', 'xml'),
  TEXT_HTML: ParsedMediaType.TEXT_HTML,
  TEXT_PLAIN: ParsedMediaType.TEXT_PLAIN,
  TEXT_EVENT_STREAM: new ParsedMediaType('text', 'event-stream'),
  APPLICATION_XHTML_XML: new ParsedMediaType('application', 'xhtml+xml'),
  IMAGE_ALL: new ParsedMediaType('image', '*'),
}

const X_REQUESTED_WITH = new RequestHeaderRequestMatcher('X-Requested-With', 'XMLHttpRequest')

// ---------------------------------------------------------------------------
// Actuator : EndpointRequest
// ---------------------------------------------------------------------------

/** Jeton de `org.springframework.boot.actuate.health.HealthEndpoint` (identifiant d'endpoint `health`) */
export class HealthEndpoint {
  static readonly ENDPOINT_ID = 'health'
}

/** Endpoints exposés (management.endpoints.web.exposure.include = "*"), relevés sur Komga 1.27.1 */
const exposedEndpoints = new Set([
  'beans',
  'caches',
  'conditions',
  'configprops',
  'env',
  'flyway',
  'health',
  'httpexchanges',
  'info',
  'logfile',
  'loggers',
  'mappings',
  'metrics',
  'sbom',
  'scheduledtasks',
  'sessions',
  'shutdown',
  'threaddump',
])

/** Ajoute / retire un endpoint exposé (portage de l'actuator) */
export function registerActuatorEndpoint(id: string, exposed = true): void {
  if (exposed) exposedEndpoints.add(id)
  else exposedEndpoints.delete(id)
}

let actuatorBasePath = '/actuator'
export function setActuatorBasePath(p: string): void {
  actuatorBasePath = p
}

/** `org.springframework.boot.actuate.autoconfigure.security.servlet.EndpointRequest` */
export const EndpointRequest = {
  /** endpoints exposés + page de liens (`/actuator`) */
  toAnyEndpoint(): RequestMatcher {
    return {
      matches(request: HttpServletRequest): boolean {
        const p = pathWithinApplication(request)
        if (p === actuatorBasePath || p === `${actuatorBasePath}/`) return true
        for (const id of exposedEndpoints) {
          const base = `${actuatorBasePath}/${id}`
          if (p === base || p === `${base}/` || p.startsWith(`${base}/`)) return true
        }
        return false
      },
    }
  },
  /** endpoints donnés (classe portant ENDPOINT_ID, ou identifiant) */
  to(...endpoints: ({ ENDPOINT_ID: string } | string)[]): RequestMatcher {
    const ids = endpoints.map((e) => (typeof e === 'string' ? e : e.ENDPOINT_ID))
    return {
      matches(request: HttpServletRequest): boolean {
        const p = pathWithinApplication(request)
        for (const id of ids) {
          if (!exposedEndpoints.has(id)) continue
          const base = `${actuatorBasePath}/${id}`
          if (p === base || p === `${base}/` || p.startsWith(`${base}/`)) return true
        }
        return false
      },
    }
  },
}

// ---------------------------------------------------------------------------
// Pare-feu (StrictHttpFirewall)
// ---------------------------------------------------------------------------

export class RequestRejectedException extends Exception {}

const ALLOWED_METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'])
const ENCODED_BLOCKLIST = [
  ';', '%3b', '%3B', '%2f', '%2F', '//', '%2f%2f', '%2f%2F', '%2F%2f', '%2F%2F', '\\', '%5c', '%5C', '\0', '%00', '\n', '%0a', '%0A', '\r', '%0d', '%0D',
  ' ', ' ', '%2e', '%2E', '%25',
]
const DECODED_BLOCKLIST = [';', '//', '\\', '\0', '\n', '\r', ' ', ' ', '%']

function isNormalized(path: string): boolean {
  for (let i = path.length; i > 0; ) {
    const slashIndex = path.lastIndexOf('/', i - 1)
    const gap = i - slashIndex
    if (gap === 2 && path.charAt(slashIndex + 1) === '.') return false
    if (gap === 3 && path.charAt(slashIndex + 1) === '.' && path.charAt(slashIndex + 2) === '.') return false
    i = slashIndex
  }
  return true
}

/** `StrictHttpFirewall` (réglages par défaut) */
export class StrictHttpFirewall {
  check(request: HttpServletRequest): void {
    if (!ALLOWED_METHODS.has(request.method))
      throw new RequestRejectedException(`The request was rejected because the HTTP method "${request.method}" was not included within the list of allowed HTTP methods ${[...ALLOWED_METHODS]}`)
    const uri = rawRequestUri(request)
    for (const forbidden of ENCODED_BLOCKLIST)
      if (uri.includes(forbidden) || request.contextPath.includes(forbidden))
        throw new RequestRejectedException(`The request was rejected because the URL contained a potentially malicious String "${forbidden}"`)
    const servletPath = request.servletPath
    for (const forbidden of DECODED_BLOCKLIST)
      if (servletPath.includes(forbidden)) throw new RequestRejectedException(`The request was rejected because the URL contained a potentially malicious String "${forbidden}"`)
    if (!isNormalized(uri) || !isNormalized(request.contextPath) || !isNormalized(servletPath))
      throw new RequestRejectedException('The request was rejected because the URL was not normalized.')
    for (let i = 0; i < uri.length; i++) {
      const c = uri.charCodeAt(i)
      if (c < 0x20 || c > 0x7e)
        throw new RequestRejectedException(`The requestURI was rejected because it can only contain printable ASCII characters.`)
    }
  }
}

// ---------------------------------------------------------------------------
// Dépôts du SecurityContext
// ---------------------------------------------------------------------------

export interface DeferredSecurityContext {
  get(): SecurityContext
  isGenerated(): boolean
}

export interface SecurityContextRepository {
  loadDeferredContext(request: HttpServletRequest): DeferredSecurityContext
  saveContext(context: SecurityContext, request: HttpServletRequest, response: HttpServletResponse): void
  containsContext(request: HttpServletRequest): boolean
}

function isEmptyContext(c: SecurityContext): boolean {
  return c.authentication === null
}

/** `HttpSessionSecurityContextRepository` (attribut de session SPRING_SECURITY_CONTEXT, sauvegarde immédiate) */
export class HttpSessionSecurityContextRepository implements SecurityContextRepository {
  static readonly SPRING_SECURITY_CONTEXT_KEY = 'SPRING_SECURITY_CONTEXT'
  allowSessionCreation = true

  loadDeferredContext(request: HttpServletRequest): DeferredSecurityContext {
    let loaded: SecurityContext | null | undefined
    const load = () => {
      if (loaded === undefined) {
        const session = request.getSession(false)
        const c = session !== null ? session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY) : null
        loaded = c instanceof SecurityContext ? c : null
      }
      return loaded
    }
    let generated: SecurityContext | null = null
    return {
      get: () => load() ?? (generated ??= SecurityContextHolder.createEmptyContext()),
      isGenerated: () => load() === null,
    }
  }

  saveContext(context: SecurityContext, request: HttpServletRequest, _response: HttpServletResponse): void {
    if (isEmptyContext(context)) {
      const session = request.getSession(false)
      if (session !== null) session.removeAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)
    } else {
      const session = request.getSession(this.allowSessionCreation)
      if (session !== null) session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context)
    }
  }

  containsContext(request: HttpServletRequest): boolean {
    const session = request.getSession(false)
    if (session === null) return false
    return session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY) !== null
  }
}

/** `RequestAttributeSecurityContextRepository` */
export class RequestAttributeSecurityContextRepository implements SecurityContextRepository {
  static readonly DEFAULT_REQUEST_ATTR_NAME = 'org.springframework.security.web.context.RequestAttributeSecurityContextRepository.SPRING_SECURITY_CONTEXT'

  loadDeferredContext(request: HttpServletRequest): DeferredSecurityContext {
    const get = () => {
      const c = request.getAttribute(RequestAttributeSecurityContextRepository.DEFAULT_REQUEST_ATTR_NAME)
      return c instanceof SecurityContext ? c : null
    }
    let generated: SecurityContext | null = null
    return { get: () => get() ?? (generated ??= SecurityContextHolder.createEmptyContext()), isGenerated: () => get() === null }
  }

  saveContext(context: SecurityContext, request: HttpServletRequest): void {
    request.setAttribute(RequestAttributeSecurityContextRepository.DEFAULT_REQUEST_ATTR_NAME, context)
  }

  containsContext(request: HttpServletRequest): boolean {
    return request.getAttribute(RequestAttributeSecurityContextRepository.DEFAULT_REQUEST_ATTR_NAME) instanceof SecurityContext
  }
}

/** `DelegatingSecurityContextRepository` */
export class DelegatingSecurityContextRepository implements SecurityContextRepository {
  private readonly delegates: SecurityContextRepository[]
  constructor(...delegates: SecurityContextRepository[]) {
    this.delegates = delegates
  }

  loadDeferredContext(request: HttpServletRequest): DeferredSecurityContext {
    let deferred: DeferredSecurityContext | null = null
    for (const delegate of this.delegates) {
      if (deferred === null) deferred = delegate.loadDeferredContext(request)
      else {
        const previous: DeferredSecurityContext = deferred
        const next = delegate.loadDeferredContext(request)
        deferred = {
          get: () => {
            const c = previous.get()
            if (!previous.isGenerated()) return c
            return next.get()
          },
          isGenerated: () => previous.isGenerated() && next.isGenerated(),
        }
      }
    }
    return deferred as DeferredSecurityContext
  }

  saveContext(context: SecurityContext, request: HttpServletRequest, response: HttpServletResponse): void {
    for (const d of this.delegates) d.saveContext(context, request, response)
  }

  containsContext(request: HttpServletRequest): boolean {
    return this.delegates.some((d) => d.containsContext(request))
  }
}

// ---------------------------------------------------------------------------
// Points d'entrée, gestionnaires
// ---------------------------------------------------------------------------

export interface AuthenticationEntryPoint {
  commence(request: HttpServletRequest, response: HttpServletResponse, authException: AuthenticationException): void | Promise<void>
}

/** `BasicAuthenticationEntryPoint` */
export class BasicAuthenticationEntryPoint implements AuthenticationEntryPoint {
  realmName = 'Realm'
  commence(_request: HttpServletRequest, response: HttpServletResponse): void {
    response.setHeader('WWW-Authenticate', `Basic realm="${this.realmName}"`)
    response.sendError(401, 'Unauthorized')
  }
}

/** `Http403ForbiddenEntryPoint` */
export class Http403ForbiddenEntryPoint implements AuthenticationEntryPoint {
  commence(_request: HttpServletRequest, response: HttpServletResponse): void {
    response.sendError(403, 'Forbidden')
  }
}

/** `HttpStatusEntryPoint` */
export class HttpStatusEntryPoint implements AuthenticationEntryPoint {
  constructor(private readonly httpStatus: { value: number }) {}
  commence(_request: HttpServletRequest, response: HttpServletResponse): void {
    response.setStatus(this.httpStatus.value)
  }
}

/** `LoginUrlAuthenticationEntryPoint` (redirection absolue vers la page de connexion) */
export class LoginUrlAuthenticationEntryPoint implements AuthenticationEntryPoint {
  private readonly redirectStrategy = new DefaultRedirectStrategy()
  constructor(private readonly loginFormUrl: string) {}
  commence(request: HttpServletRequest, response: HttpServletResponse): void {
    let redirectUrl = this.loginFormUrl
    if (!isAbsoluteUrl(this.loginFormUrl)) {
      const scheme = request.scheme
      const port = request.serverPort
      const includePort = !((scheme === 'http' && port === 80) || (scheme === 'https' && port === 443))
      redirectUrl = `${scheme}://${request.serverName}${includePort ? `:${port}` : ''}${request.contextPath}${this.loginFormUrl}`
    }
    this.redirectStrategy.sendRedirect(request, response, redirectUrl)
  }
}

/** `DelegatingAuthenticationEntryPoint` */
export class DelegatingAuthenticationEntryPoint implements AuthenticationEntryPoint {
  defaultEntryPoint: AuthenticationEntryPoint | null = null
  constructor(private readonly entryPoints: [RequestMatcher, AuthenticationEntryPoint][]) {}
  commence(request: HttpServletRequest, response: HttpServletResponse, authException: AuthenticationException): void | Promise<void> {
    for (const [matcher, ep] of this.entryPoints) if (matcher.matches(request)) return ep.commence(request, response, authException)
    return (this.defaultEntryPoint as AuthenticationEntryPoint).commence(request, response, authException)
  }
}

export interface AuthenticationFailureHandler {
  onAuthenticationFailure(request: HttpServletRequest, response: HttpServletResponse, exception: AuthenticationException): void | Promise<void>
}

export interface AuthenticationSuccessHandler {
  onAuthenticationSuccess(request: HttpServletRequest, response: HttpServletResponse, authentication: Authentication): void | Promise<void>
}

/** `AuthenticationEntryPointFailureHandler` */
export class AuthenticationEntryPointFailureHandler implements AuthenticationFailureHandler {
  rethrowAuthenticationServiceException = true
  constructor(private readonly authenticationEntryPoint: AuthenticationEntryPoint) {}
  onAuthenticationFailure(request: HttpServletRequest, response: HttpServletResponse, exception: AuthenticationException): void | Promise<void> {
    if (!this.rethrowAuthenticationServiceException) return this.authenticationEntryPoint.commence(request, response, exception)
    if (exception.constructor.name === 'AuthenticationServiceException' || exception.constructor.name === 'InternalAuthenticationServiceException') throw exception
    return this.authenticationEntryPoint.commence(request, response, exception)
  }
}

export const AUTHENTICATION_EXCEPTION = 'SPRING_SECURITY_LAST_EXCEPTION'

/** `SimpleUrlAuthenticationFailureHandler` (redirection, exception mémorisée en session) */
export class SimpleUrlAuthenticationFailureHandler implements AuthenticationFailureHandler {
  private readonly redirectStrategy = new DefaultRedirectStrategy()
  allowSessionCreation = true
  constructor(private readonly defaultFailureUrl: string | null = null) {}
  onAuthenticationFailure(request: HttpServletRequest, response: HttpServletResponse, exception: AuthenticationException): void {
    if (this.defaultFailureUrl === null) {
      response.sendError(401, 'Unauthorized')
      return
    }
    // saveException (forwardToDestination = false)
    const session = request.getSession(false)
    if (session !== null || this.allowSessionCreation) request.getSession()?.setAttribute(AUTHENTICATION_EXCEPTION, exception)
    this.redirectStrategy.sendRedirect(request, response, this.defaultFailureUrl)
  }
}

/** `SavedRequestAwareAuthenticationSuccessHandler` */
export class SavedRequestAwareAuthenticationSuccessHandler implements AuthenticationSuccessHandler {
  private readonly redirectStrategy = new DefaultRedirectStrategy()
  defaultTargetUrl = '/'
  alwaysUseDefaultTargetUrl = false
  requestCache: RequestCache = new HttpSessionRequestCache()

  onAuthenticationSuccess(request: HttpServletRequest, response: HttpServletResponse): void {
    const savedRequest = this.requestCache.getRequest(request, response)
    let targetUrl = this.defaultTargetUrl
    if (savedRequest !== null && !this.alwaysUseDefaultTargetUrl) targetUrl = savedRequest.redirectUrl
    else if (savedRequest !== null) this.requestCache.removeRequest(request, response)
    // clearAuthenticationAttributes
    request.getSession(false)?.removeAttribute(AUTHENTICATION_EXCEPTION)
    this.redirectStrategy.sendRedirect(request, response, targetUrl)
  }
}

export interface AccessDeniedHandler {
  handle(request: HttpServletRequest, response: HttpServletResponse, accessDeniedException: AccessDeniedException): void | Promise<void>
}

/** `AccessDeniedHandlerImpl` */
export class AccessDeniedHandlerImpl implements AccessDeniedHandler {
  handle(_request: HttpServletRequest, response: HttpServletResponse): void {
    if (response.isCommitted) return
    response.sendError(403, 'Forbidden')
  }
}

// ---------------------------------------------------------------------------
// Request cache
// ---------------------------------------------------------------------------

export class SavedRequest {
  constructor(
    readonly method: string,
    readonly redirectUrl: string,
  ) {}
}

export interface RequestCache {
  saveRequest(request: HttpServletRequest, response: HttpServletResponse): void
  getRequest(request: HttpServletRequest, response: HttpServletResponse): SavedRequest | null
  getMatchingRequest(request: HttpServletRequest, response: HttpServletResponse): HttpServletRequest | null
  removeRequest(request: HttpServletRequest, response: HttpServletResponse): void
}

export class NullRequestCache implements RequestCache {
  saveRequest(): void {}
  getRequest(): SavedRequest | null {
    return null
  }
  getMatchingRequest(): HttpServletRequest | null {
    return null
  }
  removeRequest(): void {}
}

const SAVED_REQUEST = 'SPRING_SECURITY_SAVED_REQUEST'

/** `HttpSessionRequestCache` (paramètre de correspondance `continue`) */
export class HttpSessionRequestCache implements RequestCache {
  requestMatcher: RequestMatcher = AnyRequestMatcher.INSTANCE
  createSessionAllowed = true
  matchingRequestParameterName = 'continue'

  saveRequest(request: HttpServletRequest): void {
    if (!this.requestMatcher.matches(request)) return
    if (this.createSessionAllowed || request.getSession(false) !== null) {
      const q = request.queryString
      const sep = q ? '&' : ''
      const url = `${request.requestURL}?${q ?? ''}${sep}${this.matchingRequestParameterName}`
      request.getSession()?.setAttribute(SAVED_REQUEST, new SavedRequest(request.method, url))
    }
  }

  getRequest(request: HttpServletRequest): SavedRequest | null {
    const session = request.getSession(false)
    const r = session !== null ? session.getAttribute(SAVED_REQUEST) : null
    return r instanceof SavedRequest ? r : null
  }

  getMatchingRequest(request: HttpServletRequest): HttpServletRequest | null {
    if (this.matchingRequestParameterName !== null && request.getParameter(this.matchingRequestParameterName) === null) return null
    const saved = this.getRequest(request)
    if (saved === null) return null
    this.removeRequest(request)
    return request
  }

  removeRequest(request: HttpServletRequest): void {
    request.getSession(false)?.removeAttribute(SAVED_REQUEST)
  }
}

/** Correspondance par défaut de RequestCacheConfigurer (CSRF désactivé) */
function defaultSavedRequestMatcher(): RequestMatcher {
  const notMatchingMediaType = (t: ParsedMediaType) => new NegatedRequestMatcher(new MediaTypeRequestMatcher(t).setIgnoredMediaTypes([MT.ALL]))
  const favicon: RequestMatcher = { matches: (r) => /^(.*\/)?favicon\.[^/]*$/.test(pathWithinApplication(r)) }
  return new AndRequestMatcher(
    new NegatedRequestMatcher(favicon),
    notMatchingMediaType(MT.APPLICATION_JSON),
    new NegatedRequestMatcher(X_REQUESTED_WITH),
    notMatchingMediaType(MT.MULTIPART_FORM_DATA),
    notMatchingMediaType(MT.TEXT_EVENT_STREAM),
  )
}

// ---------------------------------------------------------------------------
// Filtres
// ---------------------------------------------------------------------------

/** `SecurityContextHolderFilter` */
export class SecurityContextHolderFilter implements Filter {
  constructor(private readonly securityContextRepository: SecurityContextRepository) {}
  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    const deferred = this.securityContextRepository.loadDeferredContext(request)
    try {
      SecurityContextHolder.getContextHolderStrategy().setDeferredContext(() => deferred.get())
      await chain.doFilter(request, response)
    } finally {
      SecurityContextHolder.clearContext()
    }
  }
}

export interface HeaderWriter {
  writeHeaders(request: HttpServletRequest, response: HttpServletResponse): void
}

function staticHeader(name: string, value: string): HeaderWriter {
  return {
    writeHeaders(_req, res) {
      if (!res.containsHeader(name)) res.setHeader(name, value)
    },
  }
}

/** `HeaderWriterFilter` : en-têtes écrits à l'envoi de la réponse (ou en fin de chaîne) */
export class HeaderWriterFilter implements Filter {
  constructor(private readonly headerWriters: HeaderWriter[]) {}
  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    let written = false
    const write = () => {
      if (written) return
      written = true
      for (const w of this.headerWriters) w.writeHeaders(request, response)
    }
    response.beforeCommit.push(write)
    try {
      await chain.doFilter(request, response)
    } finally {
      if (!response.isCommitted) write()
    }
  }
}

export interface LogoutHandler {
  logout(request: HttpServletRequest, response: HttpServletResponse, authentication: Authentication | null): void
}

export interface LogoutSuccessHandler {
  onLogoutSuccess(request: HttpServletRequest, response: HttpServletResponse, authentication: Authentication | null): void
}

/** `CookieClearingLogoutHandler` */
export class CookieClearingLogoutHandler implements LogoutHandler {
  constructor(private readonly cookiesToClear: string[]) {}
  logout(request: HttpServletRequest, response: HttpServletResponse): void {
    for (const name of this.cookiesToClear) {
      const cookie = new Cookie(name, '')
      const path = request.contextPath
      cookie.path = path.length > 0 ? path : '/'
      cookie.maxAge = 0
      cookie.secure = request.isSecure
      response.addCookie(cookie)
    }
  }
}

/** `SecurityContextLogoutHandler` */
export class SecurityContextLogoutHandler implements LogoutHandler {
  invalidateHttpSession = true
  clearAuthentication = true
  securityContextRepository: SecurityContextRepository = new HttpSessionSecurityContextRepository()
  logout(request: HttpServletRequest, response: HttpServletResponse): void {
    if (this.invalidateHttpSession) {
      const session = request.getSession(false)
      if (session !== null) session.invalidate()
    }
    const context = SecurityContextHolder.getContext()
    SecurityContextHolder.clearContext()
    if (this.clearAuthentication) context.authentication = null
    this.securityContextRepository.saveContext(SecurityContextHolder.createEmptyContext(), request, response)
  }
}

/** `LogoutSuccessEventPublishingLogoutHandler` */
export class LogoutSuccessEventPublishingLogoutHandler implements LogoutHandler {
  constructor(private readonly publisher: ApplicationEventPublisher | null) {}
  logout(_request: HttpServletRequest, _response: HttpServletResponse, authentication: Authentication | null): void {
    if (this.publisher === null || authentication === null) return
    this.publisher.publishEvent(new LogoutSuccessEvent(authentication))
  }
}

/** `HttpStatusReturningLogoutSuccessHandler` (204 par défaut) */
export class HttpStatusReturningLogoutSuccessHandler implements LogoutSuccessHandler {
  constructor(private readonly httpStatusToReturn = 204) {}
  onLogoutSuccess(_request: HttpServletRequest, response: HttpServletResponse): void {
    response.setStatus(this.httpStatusToReturn)
    response.send()
  }
}

/** `SimpleUrlLogoutSuccessHandler` */
export class SimpleUrlLogoutSuccessHandler implements LogoutSuccessHandler {
  constructor(private readonly defaultTargetUrl: string) {}
  onLogoutSuccess(request: HttpServletRequest, response: HttpServletResponse): void {
    new DefaultRedirectStrategy().sendRedirect(request, response, this.defaultTargetUrl)
  }
}

/** `LogoutFilter` */
export class LogoutFilter implements Filter {
  constructor(
    private readonly logoutSuccessHandler: LogoutSuccessHandler,
    private readonly handlers: LogoutHandler[],
    private readonly logoutRequestMatcher: RequestMatcher,
  ) {}
  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    if (this.logoutRequestMatcher.matches(request)) {
      const auth = SecurityContextHolder.getContext().authentication
      for (const h of this.handlers) h.logout(request, response, auth)
      this.logoutSuccessHandler.onLogoutSuccess(request, response, auth)
      return
    }
    await chain.doFilter(request, response)
  }
}

/** `ConcurrentSessionFilter` */
export class ConcurrentSessionFilter implements Filter {
  constructor(
    private readonly sessionRegistry: SessionRegistry,
    private readonly handlers: LogoutHandler[],
  ) {}
  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    const session = request.getSession(false)
    if (session !== null) {
      const info = this.sessionRegistry.getSessionInformation(session.id)
      if (info !== null) {
        if (info.isExpired()) {
          const auth = SecurityContextHolder.getContext().authentication
          for (const h of this.handlers) h.logout(request, response, auth)
          // ResponseBodySessionInformationExpiredStrategy
          response.send('This session has been expired (possibly due to multiple concurrent logins being attempted as the same user).')
          return
        }
        this.sessionRegistry.refreshLastRequest(info.sessionId)
      }
    }
    await chain.doFilter(request, response)
  }
}

/** `AuthenticationConverter` */
export interface AuthenticationConverter {
  convert(request: HttpServletRequest): Authentication | null
}

/** `BasicAuthenticationConverter` */
export class BasicAuthenticationConverter implements AuthenticationConverter {
  authenticationDetailsSource: AuthenticationDetailsSource = new WebAuthenticationDetailsSource()

  convert(request: HttpServletRequest): Authentication | null {
    let header = request.getHeader('Authorization')
    if (header === null) return null
    header = header.trim()
    if (!header.toLowerCase().startsWith('basic')) return null
    if (header.toLowerCase() === 'basic') throw new BadCredentialsException('Empty basic authentication token')
    const base64Token = header.substring(6)
    const decoded = strictBase64Decode(base64Token)
    if (decoded === null) throw new BadCredentialsException('Failed to decode basic authentication token')
    const token = decoded.toString('utf8')
    const delim = token.indexOf(':')
    if (delim === -1) throw new BadCredentialsException('Invalid basic authentication token')
    const result = UsernamePasswordAuthenticationToken.unauthenticated(token.substring(0, delim), token.substring(delim + 1))
    result.details = this.authenticationDetailsSource.buildDetails(request)
    return result
  }
}

function strictBase64Decode(s: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null
  const unpadded = s.replace(/=+$/, '')
  if (unpadded.length % 4 === 1) return null
  if (s.includes('=') && s.length % 4 !== 0) return null
  return Buffer.from(s, 'base64')
}

/** `BasicAuthenticationFilter` */
export class BasicAuthenticationFilter extends OncePerRequestFilter {
  readonly authenticationConverter = new BasicAuthenticationConverter()
  rememberMeServices: RememberMeServices = new NullRememberMeServices()
  securityContextRepository: SecurityContextRepository = new RequestAttributeSecurityContextRepository()

  constructor(
    private readonly authenticationManager: AuthenticationManager,
    private readonly authenticationEntryPoint: AuthenticationEntryPoint,
  ) {
    super()
  }

  protected async doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    try {
      const authRequest = this.authenticationConverter.convert(request)
      if (authRequest === null) {
        await chain.doFilter(request, response)
        return
      }
      const username = authRequest.name
      if (this.authenticationIsRequired(username)) {
        const authResult = this.authenticationManager.authenticate(authRequest) as Authentication
        const context = SecurityContextHolder.createEmptyContext()
        context.authentication = authResult
        SecurityContextHolder.setContext(context)
        this.rememberMeServices.loginSuccess(request, response, authResult)
        this.securityContextRepository.saveContext(context, request, response)
      }
    } catch (ex) {
      if (!(ex instanceof AuthenticationException)) throw ex
      SecurityContextHolder.clearContext()
      this.rememberMeServices.loginFail(request, response)
      await this.authenticationEntryPoint.commence(request, response, ex)
      return
    }
    await chain.doFilter(request, response)
  }

  private authenticationIsRequired(username: string): boolean {
    const existingAuth = SecurityContextHolder.getContext().authentication
    if (existingAuth === null || existingAuth.name !== username || !existingAuth.isAuthenticated) return true
    return existingAuth instanceof AnonymousAuthenticationToken
  }
}

/** `RequestCacheAwareFilter` */
export class RequestCacheAwareFilter implements Filter {
  constructor(private readonly requestCache: RequestCache) {}
  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    const wrapped = this.requestCache.getMatchingRequest(request, response)
    await chain.doFilter(wrapped ?? request, response)
  }
}

/** `RememberMeAuthenticationFilter` */
export class RememberMeAuthenticationFilter implements Filter {
  securityContextRepository: SecurityContextRepository = new HttpSessionSecurityContextRepository()
  eventPublisher: ApplicationEventPublisher | null = null

  constructor(
    private readonly authenticationManager: AuthenticationManager,
    private readonly rememberMeServices: RememberMeServices,
  ) {}

  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    if (SecurityContextHolder.getContext().authentication !== null) {
      await chain.doFilter(request, response)
      return
    }
    let rememberMeAuth = this.rememberMeServices.autoLogin(request, response)
    if (rememberMeAuth !== null) {
      try {
        rememberMeAuth = this.authenticationManager.authenticate(rememberMeAuth) as Authentication
        const context = SecurityContextHolder.createEmptyContext()
        context.authentication = rememberMeAuth
        SecurityContextHolder.setContext(context)
        this.securityContextRepository.saveContext(context, request, response)
        this.eventPublisher?.publishEvent(new InteractiveAuthenticationSuccessEvent(rememberMeAuth, RememberMeAuthenticationFilter))
      } catch (ex) {
        if (!(ex instanceof AuthenticationException)) throw ex
        this.rememberMeServices.loginFail(request, response)
      }
    }
    await chain.doFilter(request, response)
  }
}

/** `AnonymousAuthenticationFilter` */
export class AnonymousAuthenticationFilter implements Filter {
  private readonly authenticationDetailsSource = new WebAuthenticationDetailsSource()
  constructor(
    private readonly key: string = randomUUID(),
    private readonly principal: unknown = 'anonymousUser',
    private readonly authorities = [new SimpleGrantedAuthority('ROLE_ANONYMOUS')],
  ) {}

  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    const strategy = SecurityContextHolder.getContextHolderStrategy()
    const deferred = strategy.getDeferredContext()
    strategy.setDeferredContext(() => {
      const currentContext = deferred()
      if (currentContext.authentication === null) {
        const anonymous = new AnonymousAuthenticationToken(this.key, this.principal, this.authorities)
        anonymous.details = this.authenticationDetailsSource.buildDetails(request)
        const anonymousContext = SecurityContextHolder.createEmptyContext()
        anonymousContext.authentication = anonymous
        return anonymousContext
      }
      return currentContext
    })
    await chain.doFilter(request, response)
  }
}

// --- stratégies d'authentification de session

export interface SessionAuthenticationStrategy {
  onAuthentication(authentication: Authentication, request: HttpServletRequest, response: HttpServletResponse): void
}

/** `ConcurrentSessionControlAuthenticationStrategy` */
export class ConcurrentSessionControlAuthenticationStrategy implements SessionAuthenticationStrategy {
  maximumSessions = 1
  exceptionIfMaximumExceeded = false
  constructor(private readonly sessionRegistry: SessionRegistry) {}
  onAuthentication(authentication: Authentication, request: HttpServletRequest): void {
    const allowedSessions = this.maximumSessions
    if (allowedSessions === -1) return
    const sessions = this.sessionRegistry.getAllSessions(authentication.principal, false)
    const sessionCount = sessions.length
    if (sessionCount < allowedSessions) return
    if (sessionCount === allowedSessions) {
      const session = request.getSession(false)
      if (session !== null && sessions.some((si) => si.sessionId === session.id)) return
    }
    if (this.exceptionIfMaximumExceeded) throw new SessionAuthenticationException(`Maximum sessions of ${allowedSessions} for this principal exceeded`)
    const sorted = [...sessions].sort((a, b) => a.lastRequest.getTime() - b.lastRequest.getTime())
    const maximumSessionsExceededBy = sessions.length - allowedSessions + 1
    for (const s of sorted.slice(0, maximumSessionsExceededBy)) s.expireNow()
  }
}

/** `ChangeSessionIdAuthenticationStrategy` (protection contre la fixation de session) */
export class ChangeSessionIdAuthenticationStrategy implements SessionAuthenticationStrategy {
  alwaysCreateSession = false
  applicationEventPublisher: ApplicationEventPublisher | null = null
  onAuthentication(authentication: Authentication, request: HttpServletRequest): void {
    const hadSessionAlready = request.getSession(false) !== null
    if (!hadSessionAlready && !this.alwaysCreateSession) return
    const session = request.getSession() as HttpSession
    if (hadSessionAlready && isRequestedSessionIdValid(request)) {
      const originalSessionId = session.id
      const newSessionId = changeSessionId(request)
      if (originalSessionId !== newSessionId)
        this.applicationEventPublisher?.publishEvent(new SessionFixationProtectionEvent(authentication, originalSessionId, newSessionId))
    }
  }
}

/** `RegisterSessionAuthenticationStrategy` */
export class RegisterSessionAuthenticationStrategy implements SessionAuthenticationStrategy {
  constructor(private readonly sessionRegistry: SessionRegistry) {}
  onAuthentication(authentication: Authentication, request: HttpServletRequest): void {
    this.sessionRegistry.registerNewSession((request.getSession() as HttpSession).id, authentication.principal)
  }
}

/** `CompositeSessionAuthenticationStrategy` */
export class CompositeSessionAuthenticationStrategy implements SessionAuthenticationStrategy {
  constructor(private readonly delegateStrategies: SessionAuthenticationStrategy[]) {}
  onAuthentication(authentication: Authentication, request: HttpServletRequest, response: HttpServletResponse): void {
    for (const d of this.delegateStrategies) d.onAuthentication(authentication, request, response)
  }
}

/** `SessionManagementFilter` */
export class SessionManagementFilter implements Filter {
  constructor(
    private readonly securityContextRepository: SecurityContextRepository,
    private readonly sessionAuthenticationStrategy: SessionAuthenticationStrategy,
  ) {}
  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    const applied = '__spring_security_session_mgmt_filter_applied'
    if (request.getAttribute(applied) !== null) return chain.doFilter(request, response)
    request.setAttribute(applied, true)
    if (!this.securityContextRepository.containsContext(request)) {
      const authentication = SecurityContextHolder.getContext().authentication
      if (authentication !== null && AuthenticationTrustResolver.isAuthenticated(authentication)) {
        try {
          this.sessionAuthenticationStrategy.onAuthentication(authentication, request, response)
        } catch (ex) {
          if (!(ex instanceof SessionAuthenticationException)) throw ex
          SecurityContextHolder.clearContext()
          response.sendError(401, 'Unauthorized')
          return
        }
        this.securityContextRepository.saveContext(SecurityContextHolder.getContext(), request, response)
      } else if (requestedSessionIdOf(request) !== null && !isRequestedSessionIdValid(request)) {
        // invalidSessionStrategy : aucune par défaut
      }
    }
    await chain.doFilter(request, response)
  }
}

/** `ExceptionTranslationFilter` */
export class ExceptionTranslationFilter implements Filter {
  accessDeniedHandler: AccessDeniedHandler = new AccessDeniedHandlerImpl()

  constructor(
    private readonly authenticationEntryPoint: AuthenticationEntryPoint,
    private readonly requestCache: RequestCache = new HttpSessionRequestCache(),
  ) {}

  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    try {
      await chain.doFilter(request, response)
    } catch (ex) {
      const securityException = findCause(ex, AuthenticationException) ?? findCause(ex, AccessDeniedException)
      if (securityException === null) throw ex
      if (response.isCommitted) throw new IllegalStateException('Unable to handle the Spring Security Exception because the response is already committed.', ex)
      await this.handleSpringSecurityException(request, response, chain, securityException)
    }
  }

  private async handleSpringSecurityException(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain, exception: unknown): Promise<void> {
    if (exception instanceof AuthenticationException) await this.sendStartAuthentication(request, response, chain, exception)
    else if (exception instanceof AccessDeniedException) {
      const authentication = SecurityContextHolder.getContext().authentication
      const isAnonymous = AuthenticationTrustResolver.isAnonymous(authentication)
      if (isAnonymous || AuthenticationTrustResolver.isRememberMe(authentication))
        await this.sendStartAuthentication(request, response, chain, new InsufficientAuthenticationException('Full authentication is required to access this resource', exception))
      else await this.accessDeniedHandler.handle(request, response, exception)
    }
  }

  protected async sendStartAuthentication(request: HttpServletRequest, response: HttpServletResponse, _chain: FilterChain, reason: AuthenticationException): Promise<void> {
    SecurityContextHolder.setContext(SecurityContextHolder.createEmptyContext())
    this.requestCache.saveRequest(request, response)
    await this.authenticationEntryPoint.commence(request, response, reason)
  }
}

function findCause<T>(ex: unknown, cls: abstract new (...a: never[]) => T): T | null {
  let e: unknown = ex
  const seen = new Set<unknown>()
  while (e !== null && e !== undefined && !seen.has(e)) {
    if (e instanceof cls) return e
    seen.add(e)
    e = (e as { cause?: unknown }).cause
  }
  return null
}

// --- autorisation

export type AuthorizationManager = (authentication: () => Authentication, request: HttpServletRequest) => boolean | null

export const AuthorizationManagers = {
  permitAll: (): AuthorizationManager => () => true,
  denyAll: (): AuthorizationManager => () => false,
  authenticated: (): AuthorizationManager => (auth) => AuthenticationTrustResolver.isAuthenticated(auth()),
  fullyAuthenticated: (): AuthorizationManager => (auth) => AuthenticationTrustResolver.isFullyAuthenticated(auth()) && auth().isAuthenticated,
  anonymous: (): AuthorizationManager => (auth) => AuthenticationTrustResolver.isAnonymous(auth()),
  hasAnyAuthority:
    (...authorities: string[]): AuthorizationManager =>
    (auth) => {
      const a = auth()
      return a.isAuthenticated && a.authorities.some((g) => authorities.includes(g.getAuthority() ?? ''))
    },
  hasRole: (role: string): AuthorizationManager => {
    if (role.startsWith('ROLE_'))
      throw new IllegalArgumentException(`${role} should not start with ROLE_ since ROLE_ is automatically prepended when using hasRole. Consider using hasAuthority instead.`)
    return AuthorizationManagers.hasAnyAuthority(`ROLE_${role}`)
  },
  hasAnyRole: (...roles: string[]): AuthorizationManager => AuthorizationManagers.hasAnyAuthority(...roles.map((r) => `ROLE_${r}`)),
}

/** `AuthorizationFilter` avec RequestMatcherDelegatingAuthorizationManager (refus si aucune règle ne correspond) */
export class AuthorizationFilter implements Filter {
  constructor(private readonly mappings: [RequestMatcher, AuthorizationManager][]) {}

  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    const applied = 'org.springframework.security.web.access.intercept.AuthorizationFilter.APPLIED'
    if (request.getAttribute(applied) !== null) return chain.doFilter(request, response)
    request.setAttribute(applied, true)
    try {
      const getAuthentication = (): Authentication => {
        const authentication = SecurityContextHolder.getContext().authentication
        if (authentication === null) throw new AuthenticationCredentialsNotFoundException('An Authentication object was not found in the SecurityContext')
        return authentication
      }
      let granted: boolean | null = false
      for (const [matcher, manager] of this.mappings)
        if (matcher.matches(request)) {
          granted = manager(getAuthentication, request)
          break
        }
      if (granted !== null && !granted) throw new AuthorizationDeniedException('Access Denied')
      await chain.doFilter(request, response)
    } finally {
      request.attributes.delete(applied)
    }
  }
}

// ---------------------------------------------------------------------------
// Remember-me
// ---------------------------------------------------------------------------

export interface RememberMeServices {
  autoLogin(request: HttpServletRequest, response: HttpServletResponse): Authentication | null
  loginFail(request: HttpServletRequest, response: HttpServletResponse): void
  loginSuccess(request: HttpServletRequest, response: HttpServletResponse, successfulAuthentication: Authentication): void
}

export class NullRememberMeServices implements RememberMeServices {
  autoLogin(): Authentication | null {
    return null
  }
  loginFail(): void {}
  loginSuccess(): void {}
}

const rememberMeLogger = KotlinLogging.logger('org.springframework.security.web.authentication.rememberme.TokenBasedRememberMeServices')

/** `AbstractRememberMeServices` */
export abstract class AbstractRememberMeServices implements RememberMeServices, LogoutHandler {
  static readonly SPRING_SECURITY_REMEMBER_ME_COOKIE_KEY = 'remember-me'
  static readonly DEFAULT_PARAMETER = 'remember-me'
  static readonly TWO_WEEKS_S = 1209600
  private static readonly DELIMITER = ':'

  private cookieName = AbstractRememberMeServices.SPRING_SECURITY_REMEMBER_ME_COOKIE_KEY
  private cookieDomain: string | null = null
  private parameter = AbstractRememberMeServices.DEFAULT_PARAMETER
  private alwaysRemember = false
  private tokenValiditySeconds = AbstractRememberMeServices.TWO_WEEKS_S
  private useSecureCookie: boolean | null = null
  protected authenticationDetailsSource: AuthenticationDetailsSource = new WebAuthenticationDetailsSource()

  protected constructor(
    private readonly key: string,
    private readonly userDetailsService: UserDetailsService,
  ) {}

  autoLogin(request: HttpServletRequest, response: HttpServletResponse): Authentication | null {
    const rememberMeCookie = this.extractRememberMeCookie(request)
    if (rememberMeCookie === null) return null
    if (rememberMeCookie.length === 0) {
      this.cancelCookie(request, response)
      return null
    }
    try {
      const cookieTokens = this.decodeCookie(rememberMeCookie)
      const user = this.processAutoLoginCookie(cookieTokens, request, response)
      checkAccountStatus(user)
      if (!user.isCredentialsNonExpired()) throw new AccountStatusException('User credentials have expired')
      return this.createSuccessfulAuthentication(request, user)
    } catch (ex) {
      if (ex instanceof CookieTheftException) {
        this.cancelCookie(request, response)
        throw ex
      } else if (ex instanceof UsernameNotFoundException) rememberMeLogger.debug(() => 'Remember-me login was valid but corresponding user not found.')
      else if (ex instanceof InvalidCookieException) rememberMeLogger.debug(() => `Invalid remember-me cookie: ${ex.message}`)
      else if (ex instanceof AccountStatusException) rememberMeLogger.debug(() => `Invalid UserDetails: ${ex.message}`)
      else if (ex instanceof RememberMeAuthenticationException) rememberMeLogger.debug(() => ex.message)
      else throw ex
    }
    this.cancelCookie(request, response)
    return null
  }

  protected extractRememberMeCookie(request: HttpServletRequest): string | null {
    const cookies = request.getCookies()
    if (cookies.length === 0) return null
    for (const cookie of cookies) if (this.cookieName === cookie.name) return cookie.value
    return null
  }

  protected createSuccessfulAuthentication(request: HttpServletRequest, user: UserDetails): Authentication {
    const auth = new RememberMeAuthenticationToken(this.key, user, [...user.getAuthorities()])
    auth.details = this.authenticationDetailsSource.buildDetails(request)
    return auth
  }

  protected decodeCookie(cookieValue: string): string[] {
    // boucle de Spring : la longueur est réévaluée à chaque tour (complète jusqu'à un multiple de 4 quand il manque un '=')
    for (let j = 0; j < cookieValue.length % 4; j++) cookieValue = `${cookieValue}=`
    let cookieAsPlainText: string
    const decoded = strictBase64Decode(cookieValue)
    if (decoded === null) throw new InvalidCookieException(`Cookie token was not Base64 encoded; value was '${cookieValue}'`)
    cookieAsPlainText = decoded.toString('utf8')
    const tokens = cookieAsPlainText.split(AbstractRememberMeServices.DELIMITER)
    for (let i = 0; i < tokens.length; i++) {
      try {
        tokens[i] = javaUrlDecode(tokens[i] as string)
      } catch (e) {
        rememberMeLogger.error(() => (e as Error).message)
      }
    }
    return tokens
  }

  protected encodeCookie(cookieTokens: string[]): string {
    const value = cookieTokens.map((t) => javaUrlEncode(t)).join(AbstractRememberMeServices.DELIMITER)
    return Buffer.from(value, 'utf8').toString('base64').replace(/=+$/, '')
  }

  loginFail(request: HttpServletRequest, response: HttpServletResponse): void {
    rememberMeLogger.debug(() => 'Interactive login attempt was unsuccessful.')
    this.cancelCookie(request, response)
  }

  loginSuccess(request: HttpServletRequest, response: HttpServletResponse, successfulAuthentication: Authentication): void {
    if (!this.rememberMeRequested(request, this.parameter)) {
      rememberMeLogger.debug(() => 'Remember-me login not requested.')
      return
    }
    this.onLoginSuccess(request, response, successfulAuthentication)
  }

  protected abstract onLoginSuccess(request: HttpServletRequest, response: HttpServletResponse, successfulAuthentication: Authentication): void

  protected abstract processAutoLoginCookie(cookieTokens: string[], request: HttpServletRequest, response: HttpServletResponse): UserDetails

  protected rememberMeRequested(request: HttpServletRequest, parameter: string): boolean {
    if (this.alwaysRemember) return true
    const paramValue = request.getParameter(parameter)
    if (paramValue !== null && ['true', 'on', 'yes', '1'].includes(paramValue.toLowerCase())) return true
    return false
  }

  protected cancelCookie(request: HttpServletRequest, response: HttpServletResponse): void {
    const cookie = new Cookie(this.cookieName, '')
    cookie.maxAge = 0
    cookie.path = this.getCookiePath(request)
    if (this.cookieDomain !== null) cookie.domain = this.cookieDomain
    cookie.secure = this.useSecureCookie ?? request.isSecure
    response.addCookie(cookie)
  }

  protected setCookie(tokens: string[], maxAge: number, request: HttpServletRequest, response: HttpServletResponse): void {
    const cookieValue = this.encodeCookie(tokens)
    const cookie = new Cookie(this.cookieName, cookieValue)
    cookie.maxAge = maxAge
    cookie.path = this.getCookiePath(request)
    if (this.cookieDomain !== null) cookie.domain = this.cookieDomain
    cookie.secure = this.useSecureCookie ?? request.isSecure
    cookie.httpOnly = true
    response.addCookie(cookie)
  }

  private getCookiePath(request: HttpServletRequest): string {
    const contextPath = request.contextPath
    return contextPath.length > 0 ? contextPath : '/'
  }

  logout(request: HttpServletRequest, response: HttpServletResponse): void {
    this.cancelCookie(request, response)
  }

  getKey(): string {
    return this.key
  }

  protected getUserDetailsService(): UserDetailsService {
    return this.userDetailsService
  }

  setCookieName(cookieName: string): void {
    this.cookieName = cookieName
  }
  setCookieDomain(cookieDomain: string): void {
    this.cookieDomain = cookieDomain
  }
  setUseSecureCookie(useSecureCookie: boolean): void {
    this.useSecureCookie = useSecureCookie
  }
  setParameter(parameter: string): void {
    this.parameter = parameter
  }
  setAlwaysRemember(alwaysRemember: boolean): void {
    this.alwaysRemember = alwaysRemember
  }
  setTokenValiditySeconds(tokenValiditySeconds: number): void {
    this.tokenValiditySeconds = tokenValiditySeconds
  }
  getTokenValiditySeconds(): number {
    return this.tokenValiditySeconds
  }
  setAuthenticationDetailsSource(authenticationDetailsSource: AuthenticationDetailsSource): void {
    this.authenticationDetailsSource = authenticationDetailsSource
  }
}

export type RememberMeTokenAlgorithm = 'MD5' | 'SHA256'
const DIGEST: Record<RememberMeTokenAlgorithm, 'MD5' | 'SHA-256'> = { MD5: 'MD5', SHA256: 'SHA-256' }

/** `TokenBasedRememberMeServices` (SHA256 en encodage et en vérification par défaut) */
export class TokenBasedRememberMeServices extends AbstractRememberMeServices {
  private readonly encodingAlgorithm: RememberMeTokenAlgorithm
  private matchingAlgorithm: RememberMeTokenAlgorithm = 'SHA256'

  constructor(key: string, userDetailsService: UserDetailsService, encodingAlgorithm: RememberMeTokenAlgorithm = 'SHA256') {
    super(key, userDetailsService)
    this.encodingAlgorithm = encodingAlgorithm
  }

  protected processAutoLoginCookie(cookieTokens: string[]): UserDetails {
    if (cookieTokens.length !== 3 && cookieTokens.length !== 4)
      throw new InvalidCookieException(`Cookie token did not contain 3 or 4 tokens, but contained '[${cookieTokens.join(', ')}]'`)
    const tokenExpiryTime = this.getTokenExpiryTime(cookieTokens)
    if (tokenExpiryTime < Date.now()) throw new InvalidCookieException(`Cookie token[1] has expired (expired on '${new Date(tokenExpiryTime)}'; current time is '${new Date()}')`)
    const userDetails = this.getUserDetailsService().loadUserByUsername(cookieTokens[0] as string)
    let actualTokenSignature = cookieTokens[2] as string
    let actualAlgorithm = this.matchingAlgorithm
    if (cookieTokens.length === 4) {
      actualTokenSignature = cookieTokens[3] as string
      const alg = cookieTokens[2] as string
      if (alg !== 'MD5' && alg !== 'SHA256') throw new IllegalArgumentException(`No enum constant RememberMeTokenAlgorithm.${alg}`)
      actualAlgorithm = alg
    }
    const expectedTokenSignature = this.makeTokenSignature(tokenExpiryTime, userDetails.getUsername(), userDetails.getPassword(), actualAlgorithm)
    if (!constantTimeEquals(expectedTokenSignature, actualTokenSignature))
      throw new InvalidCookieException(`Cookie contained signature '${actualTokenSignature}' but expected '${expectedTokenSignature}'`)
    return userDetails
  }

  private getTokenExpiryTime(cookieTokens: string[]): number {
    const s = cookieTokens[1] as string
    if (!/^[+-]?\d+$/.test(s)) throw new InvalidCookieException(`Cookie token[1] did not contain a valid number (contained '${s}')`)
    return Number(s)
  }

  /** `makeTokenSignature` : hex(digest("username:expiry:password:key")) */
  makeTokenSignature(tokenExpiryTime: number, username: string, password: string | null, algorithm: RememberMeTokenAlgorithm = this.encodingAlgorithm): string {
    const data = `${username}:${tokenExpiryTime}:${password}:${this.getKey()}`
    return digestHex(DIGEST[algorithm], data)
  }

  protected onLoginSuccess(request: HttpServletRequest, response: HttpServletResponse, successfulAuthentication: Authentication): void {
    const username = this.retrieveUserName(successfulAuthentication)
    let password = this.retrievePassword(successfulAuthentication)
    if (username.length === 0) return
    if (password === null || password.length === 0) {
      const user = this.getUserDetailsService().loadUserByUsername(username)
      password = user.getPassword()
      if (password === null || password.length === 0) return
    }
    const tokenLifetime = this.getTokenValiditySeconds()
    const expiryTime = Date.now() + 1000 * (tokenLifetime < 0 ? AbstractRememberMeServices.TWO_WEEKS_S : tokenLifetime)
    const signatureValue = this.makeTokenSignature(expiryTime, username, password, this.encodingAlgorithm)
    this.setCookie([username, String(expiryTime), this.encodingAlgorithm, signatureValue], tokenLifetime, request, response)
  }

  setMatchingAlgorithm(matchingAlgorithm: RememberMeTokenAlgorithm): void {
    this.matchingAlgorithm = matchingAlgorithm
  }

  protected retrieveUserName(authentication: Authentication): string {
    const p = authentication.principal
    if (isUserDetails(p)) return p.getUsername()
    return String(p)
  }

  protected retrievePassword(authentication: Authentication): string | null {
    const p = authentication.principal
    if (isUserDetails(p)) return p.getPassword()
    if (authentication.credentials !== null && authentication.credentials !== undefined) return String(authentication.credentials)
    return null
  }

  /** Tests : encodage d'un cookie comme Spring */
  encode(tokens: string[]): string {
    return this.encodeCookie(tokens)
  }

  /** Tests : décodage d'un cookie comme Spring */
  decode(value: string): string[] {
    return this.decodeCookie(value)
  }
}

// ---------------------------------------------------------------------------
// SecurityFilterChain / FilterChainProxy
// ---------------------------------------------------------------------------

/** `SecurityFilterChain` (classe abstraite : jeton d'injection) */
export abstract class SecurityFilterChain {
  abstract matches(request: HttpServletRequest): boolean
  abstract getFilters(): Filter[]
  /** `@Order` du bean (Ordered.LOWEST_PRECEDENCE par défaut) */
  order = 2147483647
}

export class DefaultSecurityFilterChain extends SecurityFilterChain {
  constructor(
    readonly requestMatcher: RequestMatcher,
    private readonly filters: Filter[],
  ) {
    super()
  }
  matches(request: HttpServletRequest): boolean {
    return this.requestMatcher.matches(request)
  }
  getFilters(): Filter[] {
    return this.filters
  }
}

/** `FilterChainProxy` : pare-feu, contexte de sécurité propre à la requête, première chaîne correspondante */
export class FilterChainProxy implements Filter {
  private readonly firewall = new StrictHttpFirewall()
  private readonly filterChains: SecurityFilterChain[]

  constructor(filterChains: SecurityFilterChain[]) {
    // AnnotationAwareOrderComparator : tri stable par @Order
    this.filterChains = [...filterChains].sort((a, b) => a.order - b.order)
  }

  getFilterChains(): SecurityFilterChain[] {
    return this.filterChains
  }

  doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    return SecurityContextHolder.runWithNewStore(async () => {
      try {
        try {
          this.firewall.check(request)
        } catch (ex) {
          if (!(ex instanceof RequestRejectedException)) throw ex
          logger.debug(() => ex.message)
          // HttpStatusRequestRejectedHandler
          response.sendError(400)
          return
        }
        const filters = this.getFilters(request)
        if (filters === null || filters.length === 0) {
          await chain.doFilter(request, response)
          return
        }
        await new VirtualFilterChain(chain, filters).doFilter(request, response)
      } finally {
        SecurityContextHolder.clearContext()
      }
    })
  }

  private getFilters(request: HttpServletRequest): Filter[] | null {
    for (const c of this.filterChains) if (c.matches(request)) return c.getFilters()
    return null
  }
}

class VirtualFilterChain implements FilterChain {
  private currentPosition = 0
  constructor(
    private readonly originalChain: FilterChain,
    private readonly additionalFilters: Filter[],
  ) {}

  async doFilter(request: HttpServletRequest, response: HttpServletResponse): Promise<void> {
    if (this.currentPosition === this.additionalFilters.length) {
      exposePrincipal(request)
      await this.originalChain.doFilter(request, response)
      return
    }
    const next = this.additionalFilters[this.currentPosition++] as Filter
    await next.doFilter(request, response, this)
  }
}

/** Contrat avec le dispatcher MVC (SecurityContextHolderAwareRequestWrapper.getUserPrincipal) */
function exposePrincipal(request: HttpServletRequest): void {
  const auth = SecurityContextHolder.getContext().authentication
  if (auth !== null && !AuthenticationTrustResolver.isAnonymous(auth)) {
    request.userPrincipal = auth
    request.setAttribute(PRINCIPAL_ATTRIBUTE, auth.principal)
  } else {
    request.userPrincipal = null
    request.attributes.delete(PRINCIPAL_ATTRIBUTE)
  }
}

/** Principal courant (`@AuthenticationPrincipal`) : null si anonyme ou absent */
export function currentPrincipal(): unknown {
  const auth = SecurityContextHolder.getContext().authentication
  if (auth === null || AuthenticationTrustResolver.isAnonymous(auth)) return null
  return auth.principal
}

// ---------------------------------------------------------------------------
// HttpSecurity (builder)
// ---------------------------------------------------------------------------

export class SessionCreationPolicy {
  static readonly ALWAYS = new SessionCreationPolicy('ALWAYS')
  static readonly NEVER = new SessionCreationPolicy('NEVER')
  static readonly IF_REQUIRED = new SessionCreationPolicy('IF_REQUIRED')
  static readonly STATELESS = new SessionCreationPolicy('STATELESS')
  private constructor(readonly name: string) {}
}

type Customizer<T> = (it: T) => void

export abstract class AbstractHttpConfigurer {
  enabled = true
  disable(): void {
    this.enabled = false
  }
}

export class CorsConfigurer extends AbstractHttpConfigurer {}
export class CsrfConfigurer extends AbstractHttpConfigurer {}
export class FormLoginConfigurer extends AbstractHttpConfigurer {}

export class RequestMatcherConfigurer {
  readonly matchers: RequestMatcher[] = []
  // PORT: surcharges requestMatchers(String...) / requestMatchers(RequestMatcher...) fusionnées
  requestMatchers(...patterns: (string | RequestMatcher)[]): this {
    for (const p of patterns) this.matchers.push(typeof p === 'string' ? new PathPatternRequestMatcher(p) : p)
    return this
  }
}

export class AuthorizedUrl {
  constructor(
    private readonly registry: AuthorizationManagerRequestMatcherRegistry,
    private readonly matchers: RequestMatcher[],
  ) {}
  private add(m: AuthorizationManager): AuthorizationManagerRequestMatcherRegistry {
    for (const matcher of this.matchers) this.registry.mappings.push([matcher, m])
    return this.registry
  }
  permitAll(): AuthorizationManagerRequestMatcherRegistry {
    return this.add(AuthorizationManagers.permitAll())
  }
  denyAll(): AuthorizationManagerRequestMatcherRegistry {
    return this.add(AuthorizationManagers.denyAll())
  }
  authenticated(): AuthorizationManagerRequestMatcherRegistry {
    return this.add(AuthorizationManagers.authenticated())
  }
  fullyAuthenticated(): AuthorizationManagerRequestMatcherRegistry {
    return this.add(AuthorizationManagers.fullyAuthenticated())
  }
  anonymous(): AuthorizationManagerRequestMatcherRegistry {
    return this.add(AuthorizationManagers.anonymous())
  }
  hasRole(role: string): AuthorizationManagerRequestMatcherRegistry {
    return this.add(AuthorizationManagers.hasRole(role))
  }
  hasAnyRole(...roles: string[]): AuthorizationManagerRequestMatcherRegistry {
    return this.add(AuthorizationManagers.hasAnyRole(...roles))
  }
  hasAuthority(authority: string): AuthorizationManagerRequestMatcherRegistry {
    return this.add(AuthorizationManagers.hasAnyAuthority(authority))
  }
  hasAnyAuthority(...authorities: string[]): AuthorizationManagerRequestMatcherRegistry {
    return this.add(AuthorizationManagers.hasAnyAuthority(...authorities))
  }
  access(manager: AuthorizationManager): AuthorizationManagerRequestMatcherRegistry {
    return this.add(manager)
  }
}

export class AuthorizationManagerRequestMatcherRegistry {
  readonly mappings: [RequestMatcher, AuthorizationManager][] = []
  requestMatchers(...patterns: (string | RequestMatcher)[]): AuthorizedUrl {
    return new AuthorizedUrl(
      this,
      patterns.map((p) => (typeof p === 'string' ? new PathPatternRequestMatcher(p) : p)),
    )
  }
  anyRequest(): AuthorizedUrl {
    return new AuthorizedUrl(this, [AnyRequestMatcher.INSTANCE])
  }
}

export class FrameOptionsConfig {
  mode: 'DENY' | 'SAMEORIGIN' | null = 'DENY'
  deny(): void {
    this.mode = 'DENY'
  }
  sameOrigin(): void {
    this.mode = 'SAMEORIGIN'
  }
  disable(): void {
    this.mode = null
  }
}

export class ToggleConfig {
  enabled = true
  disable(): void {
    this.enabled = false
  }
}

export class HeadersConfigurer extends AbstractHttpConfigurer {
  readonly contentTypeOptionsConfig = new ToggleConfig()
  readonly xssProtectionConfig = new ToggleConfig()
  readonly cacheControlConfig = new ToggleConfig()
  readonly hstsConfig = new ToggleConfig()
  readonly frameOptionsConfig = new FrameOptionsConfig()

  contentTypeOptions(c: Customizer<ToggleConfig>): this {
    c(this.contentTypeOptionsConfig)
    return this
  }
  xssProtection(c: Customizer<ToggleConfig>): this {
    c(this.xssProtectionConfig)
    return this
  }
  cacheControl(c: Customizer<ToggleConfig>): this {
    c(this.cacheControlConfig)
    return this
  }
  httpStrictTransportSecurity(c: Customizer<ToggleConfig>): this {
    c(this.hstsConfig)
    return this
  }
  frameOptions(c: Customizer<FrameOptionsConfig>): this {
    c(this.frameOptionsConfig)
    return this
  }

  writers(): HeaderWriter[] {
    const w: HeaderWriter[] = []
    if (this.contentTypeOptionsConfig.enabled) w.push(staticHeader('X-Content-Type-Options', 'nosniff'))
    if (this.xssProtectionConfig.enabled) w.push(staticHeader('X-XSS-Protection', '0'))
    if (this.cacheControlConfig.enabled)
      w.push({
        writeHeaders(_req, res) {
          if (res.containsHeader('Cache-Control') || res.containsHeader('Expires') || res.containsHeader('Pragma') || res.status === 304) return
          res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
        },
      })
    if (this.hstsConfig.enabled)
      w.push({
        writeHeaders(req, res) {
          if (req.isSecure && !res.containsHeader('Strict-Transport-Security')) res.setHeader('Strict-Transport-Security', 'max-age=31536000 ; includeSubDomains')
        },
      })
    const mode = this.frameOptionsConfig.mode
    if (mode !== null) w.push(staticHeader('X-Frame-Options', mode))
    return w
  }
}

export class HttpBasicConfigurer extends AbstractHttpConfigurer {
  detailsSource: AuthenticationDetailsSource | null = null
  entryPoint: AuthenticationEntryPoint | null = null
  realm: string | null = null
  authenticationDetailsSource(source: AuthenticationDetailsSource): this {
    this.detailsSource = source
    return this
  }
  authenticationEntryPoint(ep: AuthenticationEntryPoint): this {
    this.entryPoint = ep
    return this
  }
  realmName(realm: string): this {
    this.realm = realm
    return this
  }
}

export class LogoutConfigurer extends AbstractHttpConfigurer {
  url = '/logout'
  readonly handlers: LogoutHandler[] = []
  invalidate = true
  successHandler: LogoutSuccessHandler | null = null
  logoutUrl(url: string): this {
    this.url = url
    return this
  }
  deleteCookies(...cookieNamesToClear: string[]): this {
    this.handlers.push(new CookieClearingLogoutHandler(cookieNamesToClear))
    return this
  }
  invalidateHttpSession(v: boolean): this {
    this.invalidate = v
    return this
  }
  addLogoutHandler(h: LogoutHandler): this {
    this.handlers.push(h)
    return this
  }
  logoutSuccessHandler(h: LogoutSuccessHandler): this {
    this.successHandler = h
    return this
  }
}

export class ConcurrencyControlConfigurer {
  registry: SessionRegistry | null = null
  max: number | null = null
  sessionRegistry(r: SessionRegistry): this {
    this.registry = r
    return this
  }
  maximumSessions(n: number): this {
    this.max = n
    return this
  }
}

export class SessionManagementConfigurer extends AbstractHttpConfigurer {
  policy: SessionCreationPolicy = SessionCreationPolicy.IF_REQUIRED
  concurrency: ConcurrencyControlConfigurer | null = null
  /** propertiesThatRequireImplicitAuthentication : SessionManagementFilter ajouté seulement si non vide */
  readonly implicitProperties = new Set<string>()
  sessionCreationPolicy(p: SessionCreationPolicy): this {
    this.policy = p
    this.implicitProperties.add('sessionCreationPolicy')
    return this
  }
  sessionConcurrency(c: Customizer<ConcurrencyControlConfigurer>): this {
    this.concurrency ??= new ConcurrencyControlConfigurer()
    c(this.concurrency)
    this.implicitProperties.add('maximumSessions')
    return this
  }
  maximumSessions(n: number): ConcurrencyControlConfigurer {
    this.concurrency ??= new ConcurrencyControlConfigurer()
    this.implicitProperties.add('maximumSessions')
    return this.concurrency.maximumSessions(n)
  }
}

export class ExceptionHandlingConfigurer extends AbstractHttpConfigurer {
  readonly defaultEntryPoints: [RequestMatcher, AuthenticationEntryPoint][] = []
  entryPoint: AuthenticationEntryPoint | null = null
  deniedHandler: AccessDeniedHandler | null = null
  defaultAuthenticationEntryPointFor(ep: AuthenticationEntryPoint, matcher: RequestMatcher): this {
    this.defaultEntryPoints.push([matcher, ep])
    return this
  }
  authenticationEntryPoint(ep: AuthenticationEntryPoint): this {
    this.entryPoint = ep
    return this
  }
  accessDeniedHandler(h: AccessDeniedHandler): this {
    this.deniedHandler = h
    return this
  }
}

export class RememberMeConfigurer extends AbstractHttpConfigurer {
  services: RememberMeServices | null = null
  theKey: string | null = null
  rememberMeServices(s: RememberMeServices): this {
    this.services = s
    return this
  }
  key(k: string): this {
    this.theKey = k
    return this
  }
}

/** Contribution d'un module (OAuth2) à la construction de la chaîne */
export interface HttpSecurityExtension {
  /** point d'entrée par défaut enregistré (après httpBasic) */
  entryPoint?: [RequestMatcher, AuthenticationEntryPoint]
  /** fournisseurs ajoutés au gestionnaire d'authentification de HttpSecurity */
  providers?: AuthenticationProvider[]
  /** filtres (et leur position de référence) */
  filters(ctx: HttpSecurityBuildContext): { filter: Filter; order: number }[]
}

export type HttpSecurityBuildContext = {
  authenticationManager: ProviderManager
  securityContextRepository: SecurityContextRepository
  sessionAuthenticationStrategy: SessionAuthenticationStrategy
  rememberMeServices: RememberMeServices
  eventPublisher: ApplicationEventPublisher | null
  applicationContext: ApplicationContext | null
}

// Ordre des filtres (FilterOrderRegistration)
const ORDER = {
  SecurityContextHolderFilter: 500,
  HeaderWriterFilter: 700,
  CorsFilter: 800,
  LogoutFilter: 1000,
  OAuth2AuthorizationRequestRedirectFilter: 1100,
  OAuth2LoginAuthenticationFilter: 1500,
  ConcurrentSessionFilter: 1900,
  BasicAuthenticationFilter: 2200,
  RequestCacheAwareFilter: 2300,
  SecurityContextHolderAwareRequestFilter: 2400,
  RememberMeAuthenticationFilter: 2600,
  AnonymousAuthenticationFilter: 2700,
  SessionManagementFilter: 2900,
  ExceptionTranslationFilter: 3000,
  AuthorizationFilter: 3200,
}
export const FILTER_ORDER: Readonly<Record<keyof typeof ORDER, number>> = ORDER

const filterClassOrder = new Map<AnyClass, number>([
  [SecurityContextHolderFilter, ORDER.SecurityContextHolderFilter],
  [HeaderWriterFilter, ORDER.HeaderWriterFilter],
  [CorsFilter, ORDER.CorsFilter],
  [LogoutFilter, ORDER.LogoutFilter],
  [ConcurrentSessionFilter, ORDER.ConcurrentSessionFilter],
  [BasicAuthenticationFilter, ORDER.BasicAuthenticationFilter],
  [RequestCacheAwareFilter, ORDER.RequestCacheAwareFilter],
  [RememberMeAuthenticationFilter, ORDER.RememberMeAuthenticationFilter],
  [AnonymousAuthenticationFilter, ORDER.AnonymousAuthenticationFilter],
  [SessionManagementFilter, ORDER.SessionManagementFilter],
  [ExceptionTranslationFilter, ORDER.ExceptionTranslationFilter],
  [AuthorizationFilter, ORDER.AuthorizationFilter],
])

/** Enregistre l'ordre d'une classe de filtre (modules OAuth2) */
export function registerFilterOrder(cls: AnyClass, order: number): void {
  filterClassOrder.set(cls, order)
}

const globalManagers = new WeakMap<object, ProviderManager | null>()

/**
 * AuthenticationManager global (AuthenticationConfiguration) : comme Spring, s'il existe exactement un bean
 * AuthenticationProvider (chez Komga : ApiKeyAuthenticationProvider), il est seul fournisseur (les UserDetailsService
 * sont alors ignorés, avertissement InitializeUserDetailsBeanManagerConfigurer) ; sinon DaoAuthenticationProvider
 * avec l'unique UserDetailsService.
 */
function globalAuthenticationManager(ctx: ApplicationContext | null): ProviderManager | null {
  if (ctx === null) return null
  if (globalManagers.has(ctx)) return globalManagers.get(ctx) ?? null
  let pm: ProviderManager | null = null
  const providers = ctx.getBeansOfType(AuthenticationProvider)
  if (providers.length === 1) pm = new ProviderManager([providers[0] as AuthenticationProvider])
  else {
    const uds = ctx.getBeansOfType(UserDetailsService)
    if (uds.length === 1) pm = new ProviderManager([new DaoAuthenticationProvider(uds[0] as UserDetailsService, passwordEncoderOf(ctx))])
  }
  const publisher = authenticationEventPublisherOf(ctx)
  if (pm !== null && publisher !== null) pm.setAuthenticationEventPublisher(publisher)
  globalManagers.set(ctx, pm)
  return pm
}

function passwordEncoderOf(ctx: ApplicationContext | null): PasswordEncoder | undefined {
  if (ctx === null) return undefined
  const l = ctx.getBeansOfType(PasswordEncoder)
  return l.length === 1 ? l[0] : undefined
}

function authenticationEventPublisherOf(ctx: ApplicationContext | null): AuthenticationEventPublisher | null {
  if (ctx === null) return null
  const l = ctx.getBeansOfType(AuthenticationEventPublisher)
  return l.length >= 1 ? (l[0] as AuthenticationEventPublisher) : null
}

/**
 * `HttpSecurity` : bean prototype injecté dans les méthodes @Bean des SecurityFilterChain
 * (dépendance `httpSecurity(order)` : `order` = valeur de @Order de la méthode @Bean).
 */
export class HttpSecurity {
  private readonly corsC = new CorsConfigurer()
  private readonly csrfC = new CsrfConfigurer()
  private readonly formLoginC = new FormLoginConfigurer()
  private readonly headersC = new HeadersConfigurer()
  private readonly httpBasicC = new HttpBasicConfigurer()
  private readonly logoutC = new LogoutConfigurer()
  private readonly sessionC = new SessionManagementConfigurer()
  private readonly exceptionC = new ExceptionHandlingConfigurer()
  private readonly rememberMeC = new RememberMeConfigurer()
  private readonly authorizeRegistry = new AuthorizationManagerRequestMatcherRegistry()
  private securityMatcherValue: RequestMatcher = AnyRequestMatcher.INSTANCE
  private corsApplied = false
  private httpBasicApplied = false
  private rememberMeApplied = false
  private authorizeApplied = false
  private uds: UserDetailsService | null = null
  private readonly extraFilters: { filter: Filter; order: number }[] = []
  private readonly extensions: HttpSecurityExtension[] = []

  constructor(
    readonly applicationContext: ApplicationContext | null = null,
    private readonly order: number = 2147483647,
  ) {
    // DefaultLogoutPage / logout sont appliqués par défaut, httpBasic et cors non
    this.corsC.enabled = false
    this.httpBasicC.enabled = false
    this.rememberMeC.enabled = false
  }

  cors(c: Customizer<CorsConfigurer>): this {
    this.corsApplied = true
    this.corsC.enabled = true
    c(this.corsC)
    return this
  }

  csrf(c: Customizer<CsrfConfigurer>): this {
    c(this.csrfC)
    return this
  }

  formLogin(c: Customizer<FormLoginConfigurer>): this {
    c(this.formLoginC)
    if (this.formLoginC.enabled) throw new UnsupportedOperationException('formLogin is not supported by this port')
    return this
  }

  securityMatchers(c: Customizer<RequestMatcherConfigurer>): this {
    const r = new RequestMatcherConfigurer()
    c(r)
    this.securityMatcherValue = new OrRequestMatcher(r.matchers)
    return this
  }

  securityMatcher(...patterns: (string | RequestMatcher)[]): this {
    const r = new RequestMatcherConfigurer().requestMatchers(...patterns)
    this.securityMatcherValue = r.matchers.length === 1 ? (r.matchers[0] as RequestMatcher) : new OrRequestMatcher(r.matchers)
    return this
  }

  authorizeHttpRequests(c: Customizer<AuthorizationManagerRequestMatcherRegistry>): this {
    this.authorizeApplied = true
    c(this.authorizeRegistry)
    return this
  }

  headers(c: Customizer<HeadersConfigurer>): this {
    c(this.headersC)
    return this
  }

  userDetailsService(uds: UserDetailsService): this {
    this.uds = uds
    return this
  }

  httpBasic(c: Customizer<HttpBasicConfigurer>): this {
    this.httpBasicApplied = true
    this.httpBasicC.enabled = true
    c(this.httpBasicC)
    return this
  }

  logout(c: Customizer<LogoutConfigurer>): this {
    c(this.logoutC)
    return this
  }

  sessionManagement(c: Customizer<SessionManagementConfigurer>): this {
    c(this.sessionC)
    return this
  }

  exceptionHandling(c: Customizer<ExceptionHandlingConfigurer>): this {
    c(this.exceptionC)
    return this
  }

  rememberMe(c: Customizer<RememberMeConfigurer>): this {
    this.rememberMeApplied = true
    this.rememberMeC.enabled = true
    c(this.rememberMeC)
    return this
  }

  /** Point d'extension (oauth2Login de spring-security-oauth2.ts) */
  with(extension: HttpSecurityExtension): this {
    this.extensions.push(extension)
    return this
  }

  // PORT: addFilterAfter(filter, Class) : la classe de référence est un constructeur
  addFilterAfter(filter: Filter, afterFilter: AnyClass): this {
    this.extraFilters.push({ filter, order: this.orderOf(afterFilter) + 1 })
    return this
  }

  addFilterBefore(filter: Filter, beforeFilter: AnyClass): this {
    this.extraFilters.push({ filter, order: this.orderOf(beforeFilter) - 1 })
    return this
  }

  addFilterAt(filter: Filter, atFilter: AnyClass): this {
    this.extraFilters.push({ filter, order: this.orderOf(atFilter) })
    return this
  }

  private orderOf(cls: AnyClass): number {
    const o = filterClassOrder.get(cls)
    if (o === undefined) throw new IllegalArgumentException(`The Filter class ${cls.name} does not have a registered order`)
    return o
  }

  /**
   * Style Kotlin : `http { ... }` (HttpSecurityDsl). Les blocs sont appliqués dans l'ordre d'écriture.
   */
  invoke(httpConfiguration: (dsl: HttpSecurityDsl) => void): void {
    httpConfiguration(new HttpSecurityDsl(this))
  }

  build(): SecurityFilterChain {
    const ctx = this.applicationContext
    const eventPublisher = ctx !== null ? (ctx.resolve(ApplicationEventPublisher) as ApplicationEventPublisher) : null
    const stateless = this.sessionC.policy === SessionCreationPolicy.STATELESS
    const httpSessionRepository = new HttpSessionSecurityContextRepository()
    httpSessionRepository.allowSessionCreation = this.sessionC.policy === SessionCreationPolicy.ALWAYS || this.sessionC.policy === SessionCreationPolicy.IF_REQUIRED
    const securityContextRepository: SecurityContextRepository = stateless
      ? new RequestAttributeSecurityContextRepository()
      : new DelegatingSecurityContextRepository(httpSessionRepository, new RequestAttributeSecurityContextRepository())
    const requestCache: RequestCache = stateless ? new NullRequestCache() : new HttpSessionRequestCache()
    if (requestCache instanceof HttpSessionRequestCache) requestCache.requestMatcher = defaultSavedRequestMatcher()

    // AuthenticationManager de HttpSecurity
    const providers: AuthenticationProvider[] = []
    const rememberMeServices: RememberMeServices = this.rememberMeC.enabled && this.rememberMeC.services !== null ? this.rememberMeC.services : new NullRememberMeServices()
    if (this.rememberMeC.enabled) {
      const key = this.rememberMeC.theKey ?? (rememberMeServices instanceof AbstractRememberMeServices ? rememberMeServices.getKey() : randomUUID())
      providers.push(new RememberMeAuthenticationProvider(key))
    }
    for (const e of this.extensions) providers.push(...(e.providers ?? []))
    if (this.uds !== null) providers.push(new DaoAuthenticationProvider(this.uds, passwordEncoderOf(ctx)))
    const authenticationManager = new ProviderManager(providers, globalAuthenticationManager(ctx))
    const publisher = authenticationEventPublisherOf(ctx)
    if (publisher !== null) authenticationManager.setAuthenticationEventPublisher(publisher)

    // SessionAuthenticationStrategy
    const changeSessionId = new ChangeSessionIdAuthenticationStrategy()
    changeSessionId.applicationEventPublisher = eventPublisher
    const concurrency = this.sessionC.concurrency
    let sessionAuthenticationStrategy: SessionAuthenticationStrategy
    if (concurrency !== null) {
      const registry = concurrency.registry as SessionRegistry
      const concurrent = new ConcurrentSessionControlAuthenticationStrategy(registry)
      if (concurrency.max !== null) concurrent.maximumSessions = concurrency.max
      sessionAuthenticationStrategy = new CompositeSessionAuthenticationStrategy([concurrent, changeSessionId, new RegisterSessionAuthenticationStrategy(registry)])
    } else sessionAuthenticationStrategy = new CompositeSessionAuthenticationStrategy([changeSessionId])

    // Points d'entrée par défaut (ordre d'enregistrement : exceptionHandling, puis httpBasic, puis oauth2Login)
    const entryPoints: [RequestMatcher, AuthenticationEntryPoint][] = [...this.exceptionC.defaultEntryPoints]
    // HttpBasicConfigurer : XMLHttpRequest -> 401 sans WWW-Authenticate (pas de fenêtre du navigateur), sinon Basic
    const basicAuthEntryPoint = new BasicAuthenticationEntryPoint()
    if (this.httpBasicC.realm !== null) basicAuthEntryPoint.realmName = this.httpBasicC.realm
    let basicEntryPoint: AuthenticationEntryPoint
    if (this.httpBasicC.entryPoint !== null) basicEntryPoint = this.httpBasicC.entryPoint
    else {
      const d = new DelegatingAuthenticationEntryPoint([[X_REQUESTED_WITH, new HttpStatusEntryPoint({ value: 401 })]])
      d.defaultEntryPoint = basicAuthEntryPoint
      basicEntryPoint = d
    }
    if (this.httpBasicC.enabled) {
      const restMatcher = new MediaTypeRequestMatcher(
        MT.APPLICATION_ATOM_XML,
        MT.APPLICATION_FORM_URLENCODED,
        MT.APPLICATION_JSON,
        MT.APPLICATION_OCTET_STREAM,
        MT.APPLICATION_XML,
        MT.MULTIPART_FORM_DATA,
        MT.TEXT_XML,
      ).setIgnoredMediaTypes([MT.ALL])
      const allMatcher = new MediaTypeRequestMatcher(MT.ALL).setUseEquals(true)
      const notHtmlMatcher = new NegatedRequestMatcher(new MediaTypeRequestMatcher(MT.TEXT_HTML))
      const restNotHtmlMatcher = new AndRequestMatcher(notHtmlMatcher, restMatcher)
      entryPoints.push([new OrRequestMatcher(X_REQUESTED_WITH, restNotHtmlMatcher, allMatcher), basicEntryPoint])
    }
    for (const e of this.extensions) if (e.entryPoint) entryPoints.push(e.entryPoint)
    let authenticationEntryPoint: AuthenticationEntryPoint
    if (this.exceptionC.entryPoint !== null) authenticationEntryPoint = this.exceptionC.entryPoint
    else if (entryPoints.length === 0) authenticationEntryPoint = new Http403ForbiddenEntryPoint()
    else if (entryPoints.length === 1) authenticationEntryPoint = (entryPoints[0] as [RequestMatcher, AuthenticationEntryPoint])[1]
    else {
      const d = new DelegatingAuthenticationEntryPoint(entryPoints)
      d.defaultEntryPoint = (entryPoints[0] as [RequestMatcher, AuthenticationEntryPoint])[1]
      authenticationEntryPoint = d
    }

    // Gestionnaires de déconnexion
    const contextLogoutHandler = new SecurityContextLogoutHandler()
    contextLogoutHandler.invalidateHttpSession = this.logoutC.invalidate
    contextLogoutHandler.securityContextRepository = securityContextRepository
    const logoutHandlers: LogoutHandler[] = [...this.logoutC.handlers]
    if (this.rememberMeC.enabled && isLogoutHandler(rememberMeServices)) logoutHandlers.push(rememberMeServices)
    logoutHandlers.push(contextLogoutHandler, new LogoutSuccessEventPublishingLogoutHandler(eventPublisher))

    const filters: { filter: Filter; order: number }[] = []
    filters.push({ filter: new SecurityContextHolderFilter(securityContextRepository), order: ORDER.SecurityContextHolderFilter })
    if (this.headersC.enabled) filters.push({ filter: new HeaderWriterFilter(this.headersC.writers()), order: ORDER.HeaderWriterFilter })
    if (this.corsApplied && this.corsC.enabled) filters.push({ filter: new CorsFilter(corsConfigurationSourceOf(ctx)), order: ORDER.CorsFilter })
    if (this.logoutC.enabled) {
      // CSRF désactivé : GET, POST, PUT ou DELETE sur l'URL de déconnexion
      const logoutMatcher = new OrRequestMatcher(['GET', 'POST', 'PUT', 'DELETE'].map((m) => new PathPatternRequestMatcher(this.logoutC.url, m)))
      const successHandler =
        this.logoutC.successHandler ?? (this.httpBasicC.enabled ? new HttpStatusReturningLogoutSuccessHandler() : new SimpleUrlLogoutSuccessHandler('/login?logout'))
      filters.push({ filter: new LogoutFilter(successHandler, logoutHandlers, logoutMatcher), order: ORDER.LogoutFilter })
    }
    const buildContext: HttpSecurityBuildContext = {
      authenticationManager,
      securityContextRepository,
      sessionAuthenticationStrategy,
      rememberMeServices,
      eventPublisher,
      applicationContext: ctx,
    }
    for (const e of this.extensions) filters.push(...e.filters(buildContext))
    if (concurrency !== null && this.sessionC.enabled)
      filters.push({
        filter: new ConcurrentSessionFilter(concurrency.registry as SessionRegistry, this.logoutC.enabled ? logoutHandlers : [contextLogoutHandler]),
        order: ORDER.ConcurrentSessionFilter,
      })
    if (this.httpBasicC.enabled) {
      const basic = new BasicAuthenticationFilter(authenticationManager, basicEntryPoint)
      if (this.httpBasicC.detailsSource !== null) basic.authenticationConverter.authenticationDetailsSource = this.httpBasicC.detailsSource
      basic.securityContextRepository = securityContextRepository
      basic.rememberMeServices = rememberMeServices
      filters.push({ filter: basic, order: ORDER.BasicAuthenticationFilter })
    }
    filters.push({ filter: new RequestCacheAwareFilter(requestCache), order: ORDER.RequestCacheAwareFilter })
    if (this.rememberMeC.enabled) {
      const f = new RememberMeAuthenticationFilter(authenticationManager, rememberMeServices)
      f.securityContextRepository = securityContextRepository
      f.eventPublisher = eventPublisher
      filters.push({ filter: f, order: ORDER.RememberMeAuthenticationFilter })
    }
    filters.push({ filter: new AnonymousAuthenticationFilter(), order: ORDER.AnonymousAuthenticationFilter })
    if (this.sessionC.enabled && this.sessionC.implicitProperties.size > 0)
      filters.push({ filter: new SessionManagementFilter(httpSessionRepository, sessionAuthenticationStrategy), order: ORDER.SessionManagementFilter })
    const exceptionTranslation = new ExceptionTranslationFilter(authenticationEntryPoint, requestCache)
    if (this.exceptionC.deniedHandler !== null) exceptionTranslation.accessDeniedHandler = this.exceptionC.deniedHandler
    filters.push({ filter: exceptionTranslation, order: ORDER.ExceptionTranslationFilter })
    if (this.authorizeApplied) filters.push({ filter: new AuthorizationFilter(this.authorizeRegistry.mappings), order: ORDER.AuthorizationFilter })
    filters.push(...this.extraFilters)

    // tri stable par ordre
    const sorted = filters.map((f, i) => ({ ...f, i })).sort((a, b) => a.order - b.order || a.i - b.i)
    const chain = new DefaultSecurityFilterChain(
      this.securityMatcherValue,
      sorted.map((f) => f.filter),
    )
    chain.order = this.order
    return chain
  }
}

function isLogoutHandler(v: unknown): v is LogoutHandler {
  return v !== null && typeof v === 'object' && typeof (v as LogoutHandler).logout === 'function'
}

/**
 * CorsConfigurer : bean `corsConfigurationSource` s'il existe, sinon HandlerMappingIntrospector (configurations CORS
 * des contrôleurs : aucune chez Komga, donc pas de configuration -> en-têtes Vary seuls, pré-vol rejeté).
 */
function corsConfigurationSourceOf(ctx: ApplicationContext | null): CorsConfigurationSource {
  if (ctx !== null) {
    try {
      return ctx.getBean<CorsConfigurationSource>('corsConfigurationSource')
    } catch {
      // absent
    }
  }
  return { getCorsConfiguration: (): CorsConfiguration | null => null }
}

// --- DSL Kotlin (`http { }`)

export class DisableDsl {
  constructor(private readonly c: { disable(): void }) {}
  disable(): void {
    this.c.disable()
  }
}

export class AuthorizeHttpRequestsDsl {
  constructor(private readonly registry: AuthorizationManagerRequestMatcherRegistry) {}
  readonly anyRequest: RequestMatcher = AnyRequestMatcher.INSTANCE
  readonly permitAll: AuthorizationManager = AuthorizationManagers.permitAll()
  readonly denyAll: AuthorizationManager = AuthorizationManagers.denyAll()
  readonly authenticated: AuthorizationManager = AuthorizationManagers.authenticated()
  hasRole(role: string): AuthorizationManager {
    return AuthorizationManagers.hasRole(role)
  }
  hasAnyRole(...roles: string[]): AuthorizationManager {
    return AuthorizationManagers.hasAnyRole(...roles)
  }
  hasAuthority(authority: string): AuthorizationManager {
    return AuthorizationManagers.hasAnyAuthority(authority)
  }
  // PORT: surcharges authorize(RequestMatcher, ...) / authorize(String, ...) fusionnées
  authorize(matcher: RequestMatcher | string, access: AuthorizationManager): void {
    this.registry.requestMatchers(matcher).access(access)
  }
}

export class HeadersDsl {
  constructor(private readonly c: HeadersConfigurer) {}
  cacheControl(fn: (it: DisableDsl) => void): void {
    this.c.cacheControl((cc) => fn(new DisableDsl(cc)))
  }
  frameOptions(fn: (it: { deny: boolean; sameOrigin: boolean; disable(): void }) => void): void {
    const fo = this.c.frameOptionsConfig
    fn({
      set deny(v: boolean) {
        if (v) fo.deny()
      },
      get deny() {
        return fo.mode === 'DENY'
      },
      set sameOrigin(v: boolean) {
        if (v) fo.sameOrigin()
      },
      get sameOrigin() {
        return fo.mode === 'SAMEORIGIN'
      },
      disable: () => fo.disable(),
    })
  }
  disable(): void {
    this.c.disable()
  }
}

export class SessionConcurrencyDsl {
  constructor(private readonly c: ConcurrencyControlConfigurer) {}
  set sessionRegistry(r: SessionRegistry) {
    this.c.sessionRegistry(r)
  }
  set maximumSessions(n: number) {
    this.c.maximumSessions(n)
  }
}

export class SessionManagementDsl {
  constructor(private readonly c: SessionManagementConfigurer) {}
  set sessionCreationPolicy(p: SessionCreationPolicy) {
    this.c.sessionCreationPolicy(p)
  }
  sessionConcurrency(fn: (it: SessionConcurrencyDsl) => void): void {
    this.c.sessionConcurrency((cc) => fn(new SessionConcurrencyDsl(cc)))
  }
}

/** `HttpSecurityDsl` (Kotlin) */
export class HttpSecurityDsl {
  constructor(private readonly http: HttpSecurity) {}
  cors(fn: (it: CorsConfigurer) => void): void {
    this.http.cors(fn)
  }
  csrf(fn: (it: DisableDsl) => void): void {
    this.http.csrf((c) => fn(new DisableDsl(c)))
  }
  formLogin(fn: (it: DisableDsl) => void): void {
    this.http.formLogin((c) => fn(new DisableDsl(c)))
  }
  httpBasic(fn: (it: DisableDsl) => void): void {
    // httpBasic { disable() } : le configurer est appliqué puis retiré
    this.http.httpBasic((c) => fn(new DisableDsl(c)))
  }
  logout(fn: (it: DisableDsl) => void): void {
    this.http.logout((c) => fn(new DisableDsl(c)))
  }
  securityMatcher(...patterns: (string | RequestMatcher)[]): void {
    this.http.securityMatcher(...patterns)
  }
  authorizeHttpRequests(fn: (it: AuthorizeHttpRequestsDsl) => void): void {
    this.http.authorizeHttpRequests((r) => fn(new AuthorizeHttpRequestsDsl(r)))
  }
  headers(fn: (it: HeadersDsl) => void): void {
    this.http.headers((h) => fn(new HeadersDsl(h)))
  }
  sessionManagement(fn: (it: SessionManagementDsl) => void): void {
    this.http.sessionManagement((s) => fn(new SessionManagementDsl(s)))
  }
  // PORT: addFilterBefore<T>(filter) : le paramètre de type réifié devient le premier argument
  addFilterBefore(beforeFilter: AnyClass, filter: Filter): void {
    this.http.addFilterBefore(filter, beforeFilter)
  }
  addFilterAfter(afterFilter: AnyClass, filter: Filter): void {
    this.http.addFilterAfter(filter, afterFilter)
  }
}

/** Dépendance `HttpSecurity` d'une méthode @Bean (`order` = @Order de la méthode) */
export function httpSecurity(order = 2147483647): Dependency {
  return { expression: (ctx) => new HttpSecurity(ctx, order) }
}

// ---------------------------------------------------------------------------
// @EnableWebSecurity : FilterChainProxy + enregistrement dans le conteneur de servlets
// ---------------------------------------------------------------------------

/** `WebSecurityConfiguration` + `SecurityFilterAutoConfiguration` (spring.security.filter.order = -100) */
export class WebSecurityConfiguration {
  static readonly DEFAULT_FILTER_ORDER = -100

  springSecurityFilterChain(securityFilterChains: SecurityFilterChain[]): FilterChainProxy {
    return new FilterChainProxy(securityFilterChains)
  }

  securityFilterChainRegistration(springSecurityFilterChain: FilterChainProxy): FilterRegistrationBean {
    const registration = new FilterRegistrationBean(springSecurityFilterChain, WebSecurityConfiguration.DEFAULT_FILTER_ORDER, ['/*'], 'springSecurityFilterChain')
    // spring.security.filter.dispatcher-types = ASYNC, ERROR, REQUEST
    setFilterDispatcherTypes(registration, ['ASYNC', 'ERROR', 'REQUEST'])
    return registration
  }
}

configuration(WebSecurityConfiguration, {
  beans: [
    { method: 'springSecurityFilterChain', type: FilterChainProxy, inject: [{ list: SecurityFilterChain }] },
    { method: 'securityFilterChainRegistration', name: 'securityFilterChainRegistration', type: FilterRegistrationBean, inject: [FilterChainProxy] },
  ],
})

export { AccessDeniedException, AuthenticationException, OncePerRequestFilter, type SecurityContextHolderStrategy }

/**
 * @EnableMethodSecurity : évaluation de `@PreAuthorize` pour le DispatcherServlet (port/spring-web-dispatcher.ts).
 * Variables SpEL : `#principal` (principal authentifié, paramètre @AuthenticationPrincipal de Komga) et les variables
 * de chemin (`#id`…), seuls noms de paramètres utilisés par les expressions de Komga.
 */
setPreAuthorizeEvaluator((expression, request) => {
  const variables: Record<string, unknown> = {}
  const uriVariables = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE) as Map<string, string> | null
  if (uriVariables !== null) for (const [k, v] of uriVariables) variables[k] = v
  variables.principal = request.getAttribute(PRINCIPAL_ATTRIBUTE) ?? currentPrincipal()
  return evaluateSecurityExpression(expression, SecurityContextHolder.getContext().authentication, variables)
})
