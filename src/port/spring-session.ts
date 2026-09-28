// Support de portage : Spring Session 3.5 (spring-session-core) et spring-session-caffeine 2.1 (com.github.gotson),
// tels qu'utilisés par Komga (@EnableCaffeineHttpSession, SessionConfiguration) :
// - MapSession (identifiant UUID aléatoire), CaffeineIndexedSessionRepository (mémoire, expiration par inactivité,
//   index par nom de principal : FindByIndexNameSessionRepository), événements de session
// - SessionRepositoryFilter : enregistré comme FilterRegistrationBean (ordre Integer.MIN_VALUE + 50) ; il implémente
//   SessionProvider de port/servlet.ts (request.getSession(...) passe par lui) et enregistre / expire la session
//   au moment de l'envoi de la réponse (OnCommittedResponseWrapper) et en fin de chaîne
// - CookieSerializer / DefaultCookieSerializer, CookieHttpSessionIdResolver, HeaderHttpSessionIdResolver
// - SessionRegistry de Spring Security adossé au dépôt (SpringSessionBackedSessionRegistry)
// Ce fichier n'a pas de jumeau Kotlin.
import { Duration } from '@js-joda/core'
import { randomUUID } from 'node:crypto'
import { IllegalStateException, UnsupportedOperationException } from './kotlin.js'
import { FilterRegistrationBean, type Filter, type FilterChain, type HttpServletRequest, type HttpServletResponse, type HttpSession, type SessionProvider } from './servlet.js'
import { ApplicationEventPublisher, configuration, parseSpringDuration, type ApplicationContext } from './spring.js'
import { type Principal, SecurityContext, isUserDetails } from './spring-security.js'
import { setFilterDispatcherTypes } from './spring-web-filter.js'

// ---------------------------------------------------------------------------
// Session / MapSession
// ---------------------------------------------------------------------------

/** `org.springframework.session.Session` */
export interface Session {
  readonly id: string
  changeSessionId(): string
  getAttribute<T = unknown>(name: string): T | null
  getAttributeNames(): string[]
  setAttribute(name: string, value: unknown): void
  removeAttribute(name: string): void
  creationTime: number
  lastAccessedTime: number
  /** secondes */
  maxInactiveInterval: number
  isExpired(): boolean
}

/** `org.springframework.session.MapSession` */
export class MapSession implements Session {
  static readonly DEFAULT_MAX_INACTIVE_INTERVAL_SECONDS = 1800

  id: string
  readonly originalId: string
  private readonly sessionAttrs = new Map<string, unknown>()
  creationTime = Date.now()
  lastAccessedTime = this.creationTime
  maxInactiveInterval = MapSession.DEFAULT_MAX_INACTIVE_INTERVAL_SECONDS

  // PORT: surcharges MapSession() / MapSession(id) / MapSession(session) fusionnées
  constructor(idOrSession: string | Session = MapSession.generateId()) {
    if (typeof idOrSession === 'string') {
      this.id = idOrSession
      this.originalId = idOrSession
    } else {
      const session = idOrSession
      this.id = session.id
      this.originalId = session instanceof MapSession ? session.originalId : session.id
      for (const n of session.getAttributeNames()) {
        const v = session.getAttribute(n)
        if (v !== null) this.sessionAttrs.set(n, v)
      }
      this.lastAccessedTime = session.lastAccessedTime
      this.creationTime = session.creationTime
      this.maxInactiveInterval = session.maxInactiveInterval
    }
  }

  /** `UuidSessionIdGenerator` */
  static generateId(): string {
    return randomUUID()
  }

  changeSessionId(): string {
    const changedId = MapSession.generateId()
    this.id = changedId
    return changedId
  }

  getAttribute<T = unknown>(name: string): T | null {
    return (this.sessionAttrs.get(name) as T | undefined) ?? null
  }

  getAttributeNames(): string[] {
    return [...this.sessionAttrs.keys()]
  }

  setAttribute(name: string, value: unknown): void {
    if (value === null || value === undefined) this.removeAttribute(name)
    else this.sessionAttrs.set(name, value)
  }

  removeAttribute(name: string): void {
    this.sessionAttrs.delete(name)
  }

  isExpired(now: number = Date.now()): boolean {
    if (this.maxInactiveInterval < 0) return false
    return now - this.maxInactiveInterval * 1000 >= this.lastAccessedTime
  }
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

/** `org.springframework.session.events.AbstractSessionEvent` */
export abstract class AbstractSessionEvent {
  constructor(
    readonly source: unknown,
    readonly session: Session,
  ) {}
  get sessionId(): string {
    return this.session.id
  }
  getSession(): Session {
    return this.session
  }
}
export class SessionCreatedEvent extends AbstractSessionEvent {}
export abstract class SessionDestroyedEvent extends AbstractSessionEvent {}
export class SessionDeletedEvent extends SessionDestroyedEvent {}
export class SessionExpiredEvent extends SessionDestroyedEvent {}

// ---------------------------------------------------------------------------
// Dépôts
// ---------------------------------------------------------------------------

/** `org.springframework.session.SessionRepository` */
export abstract class SessionRepository<S extends Session = Session> {
  abstract createSession(): S
  abstract save(session: S): void
  abstract findById(id: string): S | null
  abstract deleteById(id: string): void
}

/** `FindByIndexNameSessionRepository` */
export abstract class FindByIndexNameSessionRepository<S extends Session = Session> extends SessionRepository<S> {
  static readonly PRINCIPAL_NAME_INDEX_NAME = 'org.springframework.session.FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME'
  abstract findByIndexNameAndIndexValue(indexName: string, indexValue: string): Map<string, S>
  findByPrincipalName(principalName: string): Map<string, S> {
    return this.findByIndexNameAndIndexValue(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME, principalName)
  }
}

const SPRING_SECURITY_CONTEXT = 'SPRING_SECURITY_CONTEXT'

/** `PrincipalNameIndexResolver` : attribut PRINCIPAL_NAME_INDEX_NAME, sinon nom de l'authentification du contexte */
export function resolvePrincipalNameIndex(session: Session): string | null {
  const principalName = session.getAttribute<string>(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME)
  if (principalName !== null) return principalName
  const ctx = session.getAttribute<unknown>(SPRING_SECURITY_CONTEXT)
  if (ctx instanceof SecurityContext && ctx.authentication !== null) return ctx.authentication.name
  return null
}

/** Session du dépôt Caffeine (CaffeineIndexedSessionRepository.CaffeineSession) */
export class CaffeineSession implements Session {
  isNew: boolean
  sessionIdChanged = false

  constructor(
    readonly delegate: MapSession,
    isNew: boolean,
  ) {
    this.isNew = isNew
  }

  get id(): string {
    return this.delegate.id
  }

  changeSessionId(): string {
    this.sessionIdChanged = true
    return this.delegate.changeSessionId()
  }

  getAttribute<T = unknown>(name: string): T | null {
    return this.delegate.getAttribute<T>(name)
  }

  getAttributeNames(): string[] {
    return this.delegate.getAttributeNames()
  }

  setAttribute(name: string, value: unknown): void {
    this.delegate.setAttribute(name, value)
    // l'index du nom de principal est mis à jour quand le contexte de sécurité change (attribut "principalName")
    if (name === SPRING_SECURITY_CONTEXT) {
      const principal = value !== null && value !== undefined ? resolvePrincipalNameIndex(this) : null
      this.delegate.setAttribute(CaffeineIndexedSessionRepository.PRINCIPAL_NAME_ATTRIBUTE, principal)
    }
  }

  removeAttribute(name: string): void {
    this.delegate.removeAttribute(name)
  }

  get creationTime(): number {
    return this.delegate.creationTime
  }

  set creationTime(v: number) {
    this.delegate.creationTime = v
  }

  get lastAccessedTime(): number {
    return this.delegate.lastAccessedTime
  }

  set lastAccessedTime(v: number) {
    this.delegate.lastAccessedTime = v
  }

  get maxInactiveInterval(): number {
    return this.delegate.maxInactiveInterval
  }

  set maxInactiveInterval(v: number) {
    this.delegate.maxInactiveInterval = v
  }

  isExpired(): boolean {
    return this.delegate.isExpired()
  }
}


/**
 * `com.github.gotson.spring.session.caffeine.CaffeineIndexedSessionRepository` : cache en mémoire dont chaque entrée
 * expire après son `maxInactiveInterval` depuis le dernier accès (Expiry de Caffeine). Événements : création
 * (save d'une nouvelle session), suppression explicite (SessionDeletedEvent), expiration (SessionExpiredEvent).
 * PORT: Caffeine → Map + balayage périodique (60 s, timer non bloquant) et contrôle à la lecture.
 */
export class CaffeineIndexedSessionRepository extends FindByIndexNameSessionRepository<CaffeineSession> {
  static readonly PRINCIPAL_NAME_ATTRIBUTE = 'principalName'

  private eventPublisher: ApplicationEventPublisher = { publishEvent: () => {} }
  private defaultMaxInactiveInterval: number | null = null
  private readonly sessions = new Map<string, MapSession>()
  private sweeper: NodeJS.Timeout | null = null

  init(): void {
    this.sweeper = setInterval(() => this.cleanUp(), 60_000)
    this.sweeper.unref()
  }

  /** Arrêt (DisposableBean) */
  destroy(): void {
    if (this.sweeper) clearInterval(this.sweeper)
    this.sweeper = null
  }

  setApplicationEventPublisher(eventPublisher: ApplicationEventPublisher): void {
    this.eventPublisher = eventPublisher
  }

  setDefaultMaxInactiveInterval(defaultMaxInactiveInterval: number | null): void {
    this.defaultMaxInactiveInterval = defaultMaxInactiveInterval
  }

  /** Expire les sessions inactives (maintenance de Caffeine) */
  cleanUp(now: number = Date.now()): void {
    for (const [id, s] of [...this.sessions]) if (s.isExpired(now)) this.remove(id, 'EXPIRED')
  }

  private remove(id: string, cause: 'EXPLICIT' | 'EXPIRED' | 'REPLACED'): void {
    const s = this.sessions.get(id)
    if (!s) return
    this.sessions.delete(id)
    if (cause === 'EXPLICIT') this.eventPublisher.publishEvent(new SessionDeletedEvent(this, s))
    else if (cause === 'EXPIRED') this.eventPublisher.publishEvent(new SessionExpiredEvent(this, s))
  }

  findByIndexNameAndIndexValue(indexName: string, indexValue: string): Map<string, CaffeineSession> {
    if (indexName !== FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME) return new Map()
    this.cleanUp()
    const out = new Map<string, CaffeineSession>()
    for (const s of this.sessions.values()) if (indexValue === s.getAttribute(CaffeineIndexedSessionRepository.PRINCIPAL_NAME_ATTRIBUTE)) out.set(s.id, new CaffeineSession(s, false))
    return out
  }

  createSession(): CaffeineSession {
    const delegate = new MapSession()
    if (this.defaultMaxInactiveInterval !== null) delegate.maxInactiveInterval = Duration.ofSeconds(this.defaultMaxInactiveInterval).seconds()
    return new CaffeineSession(delegate, true)
  }

  save(session: CaffeineSession): void {
    if (session.isNew) {
      this.sessions.set(session.id, session.delegate)
      this.eventPublisher.publishEvent(new SessionCreatedEvent(this, session))
    } else if (session.sessionIdChanged) {
      this.sessions.delete(session.delegate.originalId)
      this.sessions.delete(this.findOriginal(session))
      this.sessions.set(session.id, session.delegate)
    } else {
      this.sessions.set(session.id, session.delegate)
    }
    session.isNew = false
    session.sessionIdChanged = false
  }

  private findOriginal(session: CaffeineSession): string {
    for (const [k, v] of this.sessions) if (v === session.delegate && k !== session.id) return k
    return ''
  }

  findById(id: string): CaffeineSession | null {
    const saved = this.sessions.get(id)
    if (!saved) return null
    if (saved.isExpired()) {
      this.remove(id, 'EXPIRED')
      return null
    }
    return new CaffeineSession(saved, false)
  }

  deleteById(id: string): void {
    this.remove(id, 'EXPLICIT')
  }

  /** Nombre de sessions (tests) */
  get size(): number {
    return this.sessions.size
  }
}

/** `SessionRepositoryCustomizer<T>` (interface fonctionnelle) */
export class SessionRepositoryCustomizer<T> {
  constructor(readonly customize: (sessionRepository: T) => void) {}
}

// ---------------------------------------------------------------------------
// Cookies et résolution de l'identifiant de session
// ---------------------------------------------------------------------------

/** `CookieSerializer.CookieValue` */
export class CookieValue {
  cookieMaxAge = -1

  constructor(
    readonly request: HttpServletRequest,
    readonly response: HttpServletResponse,
    readonly cookieValue: string,
  ) {
    if (this.cookieValue === '') this.cookieMaxAge = 0
  }
}

/** `CookieSerializer` (classe abstraite : jeton d'injection, s'utilise avec `implements`) */
export abstract class CookieSerializer {
  /** `CookieSerializer.CookieValue` */
  static readonly CookieValue = CookieValue
  abstract writeCookieValue(cookieValue: CookieValue): void
  abstract readCookieValues(request: HttpServletRequest): string[]
}

/** Date au format DateTimeFormatter.RFC_1123_DATE_TIME (jour non complété de zéro) */
export function rfc1123(epochMillis: number): string {
  const d = new Date(epochMillis)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const p = (n: number) => String(n).padStart(2, '0')
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT`
}

/** Décodage Base64 strict de java.util.Base64.getDecoder() (remplissage facultatif), null si invalide */
export function javaBase64Decode(value: string): string | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null
  const unpadded = value.replace(/=+$/, '')
  if (unpadded.length % 4 === 1) return null
  if (value.includes('=') && value.length % 4 !== 0) return null
  return Buffer.from(value, 'base64').toString('utf8')
}

/** `org.springframework.session.web.http.DefaultCookieSerializer` */
export class DefaultCookieSerializer implements CookieSerializer {
  private cookieName = 'SESSION'
  private useSecureCookie: boolean | null = null
  private useHttpOnlyCookie = true
  private cookiePath: string | null = null
  private cookieMaxAge: number | null = null
  private domainName: string | null = null
  private jvmRoute: string | null = null
  private useBase64Encoding = true
  private rememberMeRequestAttribute: string | null = null
  private sameSite: string | null = 'Lax'

  readCookieValues(request: HttpServletRequest): string[] {
    const matchingCookieValues: string[] = []
    for (const cookie of request.getCookies()) {
      if (this.cookieName === cookie.name) {
        let sessionId = this.useBase64Encoding ? javaBase64Decode(cookie.value) : cookie.value
        if (sessionId === null) continue
        if (this.jvmRoute !== null && sessionId.endsWith(this.jvmRoute)) sessionId = sessionId.slice(0, sessionId.length - this.jvmRoute.length)
        matchingCookieValues.push(sessionId)
      }
    }
    return matchingCookieValues
  }

  writeCookieValue(cookieValue: CookieValue): void {
    const request = cookieValue.request
    const response = cookieValue.response
    let sb = `${this.cookieName}=`
    const value = this.getValue(cookieValue)
    if (value !== null && value.length > 0) sb += value
    const maxAge = this.getMaxAge(cookieValue)
    if (maxAge > -1) {
      sb += `; Max-Age=${cookieValue.cookieMaxAge}`
      const expires = maxAge !== 0 ? Date.now() + maxAge * 1000 : 0
      sb += `; Expires=${rfc1123(expires)}`
    }
    const domain = this.domainName
    if (domain !== null && domain.length > 0) sb += `; Domain=${domain}`
    const path = this.getCookiePath(request)
    if (path !== null && path.length > 0) sb += `; Path=${path}`
    if (this.isSecureCookie(request)) sb += '; Secure'
    if (this.useHttpOnlyCookie) sb += '; HttpOnly'
    if (this.sameSite !== null) sb += `; SameSite=${this.sameSite}`
    response.addHeader('Set-Cookie', sb)
  }

  private getValue(cookieValue: CookieValue): string {
    const requestedCookieValue = cookieValue.cookieValue
    let actualCookieValue = this.jvmRoute !== null ? requestedCookieValue + this.jvmRoute : requestedCookieValue
    if (this.useBase64Encoding) actualCookieValue = Buffer.from(actualCookieValue, 'utf8').toString('base64')
    return actualCookieValue
  }

  private getMaxAge(cookieValue: CookieValue): number {
    const maxAge = cookieValue.cookieMaxAge
    if (maxAge < 0) {
      if (this.rememberMeRequestAttribute !== null && cookieValue.request.getAttribute(this.rememberMeRequestAttribute) !== null)
        cookieValue.cookieMaxAge = 2147483647
      else if (this.cookieMaxAge !== null) cookieValue.cookieMaxAge = this.cookieMaxAge
    }
    return cookieValue.cookieMaxAge
  }

  private isSecureCookie(request: HttpServletRequest): boolean {
    if (this.useSecureCookie === null) return request.isSecure
    return this.useSecureCookie
  }

  private getCookiePath(request: HttpServletRequest): string {
    if (this.cookiePath === null) return `${request.contextPath}/`
    return this.cookiePath
  }

  setCookieName(cookieName: string): void {
    this.cookieName = cookieName
  }
  setUseSecureCookie(useSecureCookie: boolean): void {
    this.useSecureCookie = useSecureCookie
  }
  setUseHttpOnlyCookie(useHttpOnlyCookie: boolean): void {
    this.useHttpOnlyCookie = useHttpOnlyCookie
  }
  setCookiePath(cookiePath: string | null): void {
    this.cookiePath = cookiePath
  }
  setCookieMaxAge(cookieMaxAge: number): void {
    this.cookieMaxAge = cookieMaxAge
  }
  setDomainName(domainName: string | null): void {
    this.domainName = domainName
  }
  setJvmRoute(jvmRoute: string): void {
    this.jvmRoute = `.${jvmRoute}`
  }
  setUseBase64Encoding(useBase64Encoding: boolean): void {
    this.useBase64Encoding = useBase64Encoding
  }
  setRememberMeRequestAttribute(rememberMeRequestAttribute: string): void {
    this.rememberMeRequestAttribute = rememberMeRequestAttribute
  }
  setSameSite(sameSite: string | null): void {
    this.sameSite = sameSite
  }
}

/** `org.springframework.session.web.http.HttpSessionIdResolver` (classe abstraite : jeton d'injection, s'utilise avec `implements`) */
export abstract class HttpSessionIdResolver {
  abstract resolveSessionIds(request: HttpServletRequest): string[]
  abstract setSessionId(request: HttpServletRequest, response: HttpServletResponse, sessionId: string): void
  abstract expireSession(request: HttpServletRequest, response: HttpServletResponse): void
}

const WRITTEN_SESSION_ID_ATTR = 'org.springframework.session.web.http.CookieHttpSessionIdResolver.WRITTEN_SESSION_ID_ATTR'

/** `CookieHttpSessionIdResolver` */
export class CookieHttpSessionIdResolver implements HttpSessionIdResolver {
  private cookieSerializer: CookieSerializer = new DefaultCookieSerializer()

  resolveSessionIds(request: HttpServletRequest): string[] {
    return this.cookieSerializer.readCookieValues(request)
  }

  setSessionId(request: HttpServletRequest, response: HttpServletResponse, sessionId: string): void {
    if (sessionId === request.getAttribute(WRITTEN_SESSION_ID_ATTR)) return
    request.setAttribute(WRITTEN_SESSION_ID_ATTR, sessionId)
    this.cookieSerializer.writeCookieValue(new CookieValue(request, response, sessionId))
  }

  expireSession(request: HttpServletRequest, response: HttpServletResponse): void {
    this.cookieSerializer.writeCookieValue(new CookieValue(request, response, ''))
  }

  setCookieSerializer(cookieSerializer: CookieSerializer): void {
    this.cookieSerializer = cookieSerializer
  }
}

/** `HeaderHttpSessionIdResolver` */
export class HeaderHttpSessionIdResolver implements HttpSessionIdResolver {
  constructor(private readonly headerName: string) {}

  static xAuthToken(): HeaderHttpSessionIdResolver {
    return new HeaderHttpSessionIdResolver('X-Auth-Token')
  }

  static authenticationInfo(): HeaderHttpSessionIdResolver {
    return new HeaderHttpSessionIdResolver('Authentication-Info')
  }

  resolveSessionIds(request: HttpServletRequest): string[] {
    const headerValue = request.getHeader(this.headerName)
    return headerValue !== null ? [headerValue] : []
  }

  setSessionId(_request: HttpServletRequest, response: HttpServletResponse, sessionId: string): void {
    response.setHeader(this.headerName, sessionId)
  }

  expireSession(_request: HttpServletRequest, response: HttpServletResponse): void {
    response.setHeader(this.headerName, '')
  }
}

// ---------------------------------------------------------------------------
// SessionRepositoryFilter
// ---------------------------------------------------------------------------

const INVALID_SESSION_ID_ATTR = 'org.springframework.session.web.http.SessionRepositoryFilter.SessionRepositoryRequestWrapper.INVALID_SESSION_ID_ATTR'
const CURRENT_SESSION_ATTR = 'org.springframework.session.web.http.SessionRepositoryFilter.CURRENT_SESSION'
const STATE_ATTR = 'org.springframework.session.web.http.SessionRepositoryFilter.STATE'

/** HttpSession de Spring Session (`HttpSessionAdapter` / `HttpSessionWrapper`) */
export class HttpSessionWrapper implements HttpSession {
  private invalidated = false
  private old = false

  constructor(
    readonly session: Session,
    private readonly onInvalidate: (w: HttpSessionWrapper) => void,
  ) {}

  get id(): string {
    return this.session.id
  }

  private checkState(): void {
    if (this.invalidated) throw new IllegalStateException('The HttpSession has already be invalidated.')
  }

  getAttribute(name: string): unknown {
    this.checkState()
    return this.session.getAttribute(name)
  }

  getAttributeNames(): string[] {
    this.checkState()
    return this.session.getAttributeNames()
  }

  setAttribute(name: string, value: unknown): void {
    this.checkState()
    this.session.setAttribute(name, value)
  }

  removeAttribute(name: string): void {
    this.checkState()
    this.session.removeAttribute(name)
  }

  invalidate(): void {
    this.checkState()
    this.invalidated = true
    this.onInvalidate(this)
  }

  get creationTime(): number {
    this.checkState()
    return this.session.creationTime
  }

  get lastAccessedTime(): number {
    this.checkState()
    return this.session.lastAccessedTime
  }

  set lastAccessedTime(v: number) {
    this.session.lastAccessedTime = v
  }

  get maxInactiveInterval(): number {
    return this.session.maxInactiveInterval
  }

  set maxInactiveInterval(v: number) {
    this.session.maxInactiveInterval = v
  }

  get isNew(): boolean {
    this.checkState()
    return !this.old
  }

  markNotNew(): void {
    this.old = true
  }

  /** `request.changeSessionId()` */
  changeSessionId(): string {
    return this.session.changeSessionId()
  }
}

/** État de SessionRepositoryRequestWrapper pour une requête */
class RequestSessionState {
  currentSession: HttpSessionWrapper | null = null
  requestedSession: Session | null = null
  requestedSessionId: string | null = null
  requestedSessionCached = false
  requestedSessionIdValid: boolean | null = null
  requestedSessionInvalidated = false

  constructor(
    readonly filter: SessionRepositoryFilter,
    readonly request: HttpServletRequest,
    readonly response: HttpServletResponse,
  ) {}
}

/**
 * `org.springframework.session.web.http.SessionRepositoryFilter`.
 * PORT: au lieu d'envelopper la requête (SessionRepositoryRequestWrapper), le filtre devient le `sessionProvider`
 * de la requête ; le « commit » de la session se fait dans `response.beforeCommit` et en fin de chaîne.
 */
export class SessionRepositoryFilter implements Filter, SessionProvider {
  static readonly SESSION_REPOSITORY_ATTR = 'org.springframework.session.SessionRepository'
  static readonly DEFAULT_ORDER = -2147483648 + 50

  private httpSessionIdResolver: HttpSessionIdResolver = new CookieHttpSessionIdResolver()

  constructor(private readonly sessionRepository: SessionRepository<Session>) {}

  setHttpSessionIdResolver(httpSessionIdResolver: HttpSessionIdResolver): void {
    this.httpSessionIdResolver = httpSessionIdResolver
  }

  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    // OncePerRequestFilter
    const alreadyFiltered = `${this.constructor.name}.FILTERED`
    if (request.getAttribute(alreadyFiltered) !== null) return chain.doFilter(request, response)
    request.setAttribute(alreadyFiltered, true)
    request.setAttribute(SessionRepositoryFilter.SESSION_REPOSITORY_ATTR, this.sessionRepository)
    const state = new RequestSessionState(this, request, response)
    request.setAttribute(STATE_ATTR, state)
    request.sessionProvider = this
    request.resetSessionCache()
    response.beforeCommit.push(() => this.commitSession(state))
    try {
      await chain.doFilter(request, response)
    } finally {
      this.commitSession(state)
    }
  }

  private state(request: HttpServletRequest): RequestSessionState {
    const s = request.getAttribute(STATE_ATTR)
    if (!(s instanceof RequestSessionState)) throw new IllegalStateException('SessionRepositoryFilter is not applied to this request')
    return s
  }

  /** `SessionRepositoryRequestWrapper.getSession(create)` */
  getSession(request: HttpServletRequest, create: boolean): HttpSession | null {
    const st = this.state(request)
    if (st.currentSession !== null) return st.currentSession
    const requestedSession = this.getRequestedSession(st)
    if (requestedSession !== null) {
      if (request.getAttribute(INVALID_SESSION_ID_ATTR) === null) {
        requestedSession.lastAccessedTime = Date.now()
        st.requestedSessionIdValid = true
        const currentSession = this.wrap(st, requestedSession)
        currentSession.markNotNew()
        this.setCurrentSession(st, currentSession)
        return currentSession
      }
    } else {
      request.setAttribute(INVALID_SESSION_ID_ATTR, 'true')
    }
    if (!create) return null
    if (this.httpSessionIdResolver instanceof CookieHttpSessionIdResolver && st.response.isCommitted)
      throw new IllegalStateException('Cannot create a session after the response has been committed')
    const session = this.sessionRepository.createSession()
    session.lastAccessedTime = Date.now()
    const currentSession = this.wrap(st, session)
    this.setCurrentSession(st, currentSession)
    return currentSession
  }

  private wrap(st: RequestSessionState, session: Session): HttpSessionWrapper {
    return new HttpSessionWrapper(session, (w) => {
      st.requestedSessionInvalidated = true
      this.setCurrentSession(st, null)
      this.clearRequestedSessionCache(st)
      this.sessionRepository.deleteById(w.id)
      st.request.resetSessionCache()
    })
  }

  private setCurrentSession(st: RequestSessionState, s: HttpSessionWrapper | null): void {
    st.currentSession = s
    if (s === null) st.request.attributes.delete(CURRENT_SESSION_ATTR)
    else st.request.setAttribute(CURRENT_SESSION_ATTR, s)
  }

  private getRequestedSession(st: RequestSessionState): Session | null {
    if (!st.requestedSessionCached) {
      const sessionIds = this.httpSessionIdResolver.resolveSessionIds(st.request)
      for (const sessionId of sessionIds) {
        if (st.requestedSessionId === null) st.requestedSessionId = sessionId
        const session = this.sessionRepository.findById(sessionId)
        if (session !== null) {
          st.requestedSession = session
          st.requestedSessionId = sessionId
          break
        }
      }
      st.requestedSessionCached = true
    }
    return st.requestedSession
  }

  private clearRequestedSessionCache(st: RequestSessionState): void {
    st.requestedSessionCached = false
    st.requestedSession = null
    st.requestedSessionId = null
  }

  /** `request.getRequestedSessionId()` */
  getRequestedSessionId(request: HttpServletRequest): string | null {
    const st = this.state(request)
    if (st.requestedSessionId === null) this.getRequestedSession(st)
    return st.requestedSessionId
  }

  /** `request.isRequestedSessionIdValid()` */
  isRequestedSessionIdValid(request: HttpServletRequest): boolean {
    const st = this.state(request)
    if (st.requestedSessionIdValid === null) {
      const requestedSession = this.getRequestedSession(st)
      if (requestedSession !== null) requestedSession.lastAccessedTime = Date.now()
      return this.isRequestedSessionIdValidFor(st, requestedSession)
    }
    return st.requestedSessionIdValid
  }

  private isRequestedSessionIdValidFor(st: RequestSessionState, session: Session | null): boolean {
    if (st.requestedSessionIdValid === null) st.requestedSessionIdValid = session !== null
    return st.requestedSessionIdValid
  }

  /** `request.changeSessionId()` */
  changeSessionId(request: HttpServletRequest): string {
    const session = request.getSession(false)
    if (session === null) throw new IllegalStateException('Cannot change session ID. There is no session associated with this request.')
    return nnSession(this.state(request).currentSession).changeSessionId()
  }

  /** `SessionRepositoryRequestWrapper.commitSession()` */
  private commitSession(st: RequestSessionState): void {
    const wrappedSession = st.currentSession
    if (wrappedSession === null) {
      if (st.requestedSessionInvalidated) this.httpSessionIdResolver.expireSession(st.request, st.response)
    } else {
      const session = wrappedSession.session
      const requestedSessionId = this.getRequestedSessionId(st.request)
      this.clearRequestedSessionCache(st)
      this.sessionRepository.save(session)
      const sessionId = session.id
      if (!this.isRequestedSessionIdValid(st.request) || sessionId !== requestedSessionId)
        this.httpSessionIdResolver.setSessionId(st.request, st.response, sessionId)
    }
  }
}

function nnSession(s: HttpSessionWrapper | null): HttpSessionWrapper {
  if (s === null) throw new IllegalStateException('No current session')
  return s
}

/** SessionRepositoryFilter appliqué à la requête, s'il y en a un */
export function sessionRepositoryFilterOf(request: HttpServletRequest): SessionRepositoryFilter | null {
  const s = request.getAttribute(STATE_ATTR)
  return s instanceof RequestSessionState ? s.filter : null
}

/** `request.getRequestedSessionId()` (null hors SessionRepositoryFilter) */
export function requestedSessionIdOf(request: HttpServletRequest): string | null {
  return sessionRepositoryFilterOf(request)?.getRequestedSessionId(request) ?? null
}

/** `request.isRequestedSessionIdValid()` */
export function isRequestedSessionIdValid(request: HttpServletRequest): boolean {
  return sessionRepositoryFilterOf(request)?.isRequestedSessionIdValid(request) ?? false
}

/** `request.changeSessionId()` */
export function changeSessionId(request: HttpServletRequest): string {
  const f = sessionRepositoryFilterOf(request)
  if (f === null) throw new IllegalStateException('Cannot change session ID. There is no session associated with this request.')
  return f.changeSessionId(request)
}

// ---------------------------------------------------------------------------
// SessionRegistry (Spring Security) adossé à Spring Session
// ---------------------------------------------------------------------------

/** `org.springframework.security.core.session.SessionInformation` */
export class SessionInformation {
  private expired = false
  lastRequest: Date

  constructor(
    readonly principal: unknown,
    readonly sessionId: string,
    lastRequest: Date,
  ) {
    this.lastRequest = lastRequest
  }

  isExpired(): boolean {
    return this.expired
  }

  expireNow(): void {
    this.expired = true
  }

  refreshLastRequest(): void {
    this.lastRequest = new Date()
  }
}

/** `org.springframework.security.core.session.SessionRegistry` */
export abstract class SessionRegistry {
  abstract getAllPrincipals(): unknown[]
  abstract getAllSessions(principal: unknown, includeExpiredSessions: boolean): SessionInformation[]
  abstract getSessionInformation(sessionId: string): SessionInformation | null
  abstract refreshLastRequest(sessionId: string): void
  abstract registerNewSession(sessionId: string, principal: unknown): void
  abstract removeSessionInformation(sessionId: string): void
}

const EXPIRED_ATTR = 'org.springframework.session.security.SpringSessionBackedSessionInformation.EXPIRED'

/** `SpringSessionBackedSessionInformation` */
export class SpringSessionBackedSessionInformation extends SessionInformation {
  static readonly EXPIRED_ATTR = EXPIRED_ATTR

  constructor(
    session: Session,
    private readonly sessionRepository: SessionRepository<Session>,
  ) {
    super(SpringSessionBackedSessionInformation.resolvePrincipal(session), session.id, new Date(session.lastAccessedTime))
    if (session.getAttribute(EXPIRED_ATTR) !== null) super.expireNow()
  }

  private static resolvePrincipal(session: Session): unknown {
    const principalName = session.getAttribute<string>(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME)
    if (principalName !== null) return principalName
    const securityContext = session.getAttribute<unknown>(SPRING_SECURITY_CONTEXT)
    if (securityContext instanceof SecurityContext && securityContext.authentication !== null) return securityContext.authentication.principal
    return ''
  }

  override expireNow(): void {
    super.expireNow()
    const session = this.sessionRepository.findById(this.sessionId)
    if (session !== null) {
      session.setAttribute(EXPIRED_ATTR, true)
      this.sessionRepository.save(session)
    }
  }
}

/** `SpringSessionBackedSessionRegistry` */
export class SpringSessionBackedSessionRegistry<S extends Session = Session> extends SessionRegistry {
  constructor(private readonly sessionRepository: FindByIndexNameSessionRepository<S>) {
    super()
  }

  getAllPrincipals(): unknown[] {
    throw new UnsupportedOperationException('SpringSessionBackedSessionRegistry does not support retrieving all principals, since Spring Session provides no way to obtain that information')
  }

  getAllSessions(principal: unknown, includeExpiredSessions: boolean): SessionInformation[] {
    const sessions = this.sessionRepository.findByPrincipalName(this.name(principal)).values()
    const infos: SessionInformation[] = []
    for (const session of sessions)
      if (includeExpiredSessions || session.getAttribute(EXPIRED_ATTR) === null)
        infos.push(new SpringSessionBackedSessionInformation(session, this.sessionRepository as unknown as SessionRepository<Session>))
    return infos
  }

  getSessionInformation(sessionId: string): SessionInformation | null {
    const session = this.sessionRepository.findById(sessionId)
    if (session !== null) return new SpringSessionBackedSessionInformation(session, this.sessionRepository as unknown as SessionRepository<Session>)
    return null
  }

  /** Sans effet : les sessions sont gérées par Spring Session */
  refreshLastRequest(_sessionId: string): void {}

  /** Sans effet : les sessions sont indexées par nom de principal */
  registerNewSession(_sessionId: string, _principal: unknown): void {}

  /** Sans effet */
  removeSessionInformation(_sessionId: string): void {}

  private name(principal: unknown): string {
    if (isUserDetails(principal)) return principal.getUsername()
    if (principal !== null && typeof principal === 'object' && typeof (principal as Principal).getName === 'function') return (principal as Principal).getName()
    return String(principal)
  }
}

// ---------------------------------------------------------------------------
// Configuration (@EnableCaffeineHttpSession + SessionAutoConfiguration)
// ---------------------------------------------------------------------------

/**
 * `ServerProperties` (sous-ensemble : server.servlet.session.timeout, server.servlet.context-path).
 * PORT: sous-ensemble de org.springframework.boot.autoconfigure.web.ServerProperties utilisé par la configuration des sessions.
 */
export class ServerProperties {
  readonly servlet: { contextPath: string; session: { timeout: Duration } }
  constructor(ctx: ApplicationContext) {
    const env = ctx.environment
    this.servlet = {
      contextPath: env.getProperty('server.servlet.context-path', ''),
      session: { timeout: parseSpringDuration(env.getProperty('server.servlet.session.timeout', '30m'), 'SECONDS') },
    }
  }
}

/**
 * `CaffeineHttpSessionConfiguration` (via @EnableCaffeineHttpSession) + `SpringHttpSessionConfiguration` :
 * beans `sessionRepository` et `springSessionRepositoryFilter` (enregistré dans le conteneur à l'ordre
 * SessionRepositoryFilter.DEFAULT_ORDER, comme le fait Spring Boot pour un Filter ordonné).
 */
export class CaffeineHttpSessionConfiguration {
  sessionRepository(
    applicationEventPublisher: ApplicationEventPublisher,
    customizers: SessionRepositoryCustomizer<CaffeineIndexedSessionRepository>[],
  ): CaffeineIndexedSessionRepository {
    const sessionRepository = new CaffeineIndexedSessionRepository()
    sessionRepository.setApplicationEventPublisher(applicationEventPublisher)
    // @EnableCaffeineHttpSession(maxInactiveIntervalInSeconds = 1800)
    sessionRepository.setDefaultMaxInactiveInterval(MapSession.DEFAULT_MAX_INACTIVE_INTERVAL_SECONDS)
    for (const c of customizers) c.customize(sessionRepository)
    sessionRepository.init()
    return sessionRepository
  }

  springSessionRepositoryFilter(
    sessionRepository: CaffeineIndexedSessionRepository,
    httpSessionIdResolver: HttpSessionIdResolver | null,
    cookieSerializer: CookieSerializer | null,
  ): FilterRegistrationBean {
    const filter = new SessionRepositoryFilter(sessionRepository as unknown as SessionRepository<Session>)
    if (httpSessionIdResolver !== null) filter.setHttpSessionIdResolver(httpSessionIdResolver)
    else if (cookieSerializer !== null) {
      const r = new CookieHttpSessionIdResolver()
      r.setCookieSerializer(cookieSerializer)
      filter.setHttpSessionIdResolver(r)
    }
    const registration = new FilterRegistrationBean(filter, SessionRepositoryFilter.DEFAULT_ORDER, ['/*'], 'springSessionRepositoryFilter')
    // spring.session.servlet.filter-dispatcher-types = ASYNC, ERROR, REQUEST
    setFilterDispatcherTypes(registration, ['ASYNC', 'ERROR', 'REQUEST'])
    return registration
  }
}

configuration(CaffeineHttpSessionConfiguration, {
  beans: [
    {
      method: 'sessionRepository',
      type: CaffeineIndexedSessionRepository,
      types: [FindByIndexNameSessionRepository, SessionRepository],
      inject: [ApplicationEventPublisher, { list: SessionRepositoryCustomizer }],
    },
    {
      method: 'springSessionRepositoryFilter',
      type: FilterRegistrationBean,
      inject: [CaffeineIndexedSessionRepository, { optional: HttpSessionIdResolver }, { optional: CookieSerializer }],
    },
  ],
})

// ServerProperties (auto-configuration de Spring Boot)
configuration(
  class ServerPropertiesConfiguration {
    serverProperties(ctx: ApplicationContext): ServerProperties {
      return new ServerProperties(ctx)
    }
  },
  { beans: [{ method: 'serverProperties', type: ServerProperties, inject: [{ expression: (ctx) => ctx }] }] },
)
