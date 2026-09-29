// Support de portage : noyau de Spring Security 6.5 (spring-security-core / crypto) utilisé par Komga.
// - SecurityContext par requête (AsyncLocalStorage) et SecurityContextHolder
// - Authentication (UsernamePassword, Anonymous, RememberMe), GrantedAuthority, UserDetails / UserDetailsService
// - PasswordEncoder : BCryptPasswordEncoder compatible avec les empreintes de Spring ($2a$10$…)
// - AuthenticationManager / ProviderManager / AbstractUserDetailsAuthenticationProvider / DaoAuthenticationProvider
// - AuthenticationEventPublisher (événements de succès / d'échec publiés dans le conteneur → LoginListener)
// - WebAuthenticationDetails / WebAuthenticationDetailsSource
// - sécurité des méthodes : checkPreAuthorize("hasRole('X')") (voir la documentation de la fonction)
// Le web (HttpSecurity, filtres) est dans spring-security-web.ts, les sessions dans spring-session.ts,
// OAuth2 dans spring-security-oauth2.ts. Ce fichier n'a pas de jumeau Kotlin.
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import * as bcrypt from './bcrypt.js'
import { KotlinLogging } from './logging.js'
import { Exception, IllegalArgumentException, RuntimeException } from './kotlin.js'
import type { HttpServletRequest } from './servlet.js'
import { ApplicationEventPublisher, component } from './spring.js'
import { AccessDeniedException } from './spring-web.js'

export { AccessDeniedException }

/** `Class<?>` : un constructeur (éventuellement privé ou abstrait) */
export type AnyClass = { readonly prototype: unknown; readonly name: string }

/** `Class.isAssignableFrom` : `cls` est `base` ou une sous-classe */
export function isAssignableFrom(base: AnyClass, cls: AnyClass | null | undefined): boolean {
  if (!cls) return false
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return cls === base || (cls.prototype as object) instanceof (base as unknown as Function)
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

/** `org.springframework.security.core.AuthenticationException` */
export class AuthenticationException extends RuntimeException {
  authenticationRequest: Authentication | null = null
  setAuthenticationRequest(a: Authentication): void {
    this.authenticationRequest = a
  }
}
export class BadCredentialsException extends AuthenticationException {}
export class UsernameNotFoundException extends AuthenticationException {}
export class InsufficientAuthenticationException extends AuthenticationException {}
export class ProviderNotFoundException extends AuthenticationException {}
export class AuthenticationServiceException extends AuthenticationException {}
export class InternalAuthenticationServiceException extends AuthenticationServiceException {}
export class AuthenticationCredentialsNotFoundException extends AuthenticationException {}
export class AccountStatusException extends AuthenticationException {}
export class DisabledException extends AccountStatusException {}
export class LockedException extends AccountStatusException {}
export class AccountExpiredException extends AccountStatusException {}
export class CredentialsExpiredException extends AccountStatusException {}
export class RememberMeAuthenticationException extends AuthenticationException {}
export class InvalidCookieException extends RememberMeAuthenticationException {}
export class CookieTheftException extends RememberMeAuthenticationException {}
export class SessionAuthenticationException extends AuthenticationException {}
/** `AuthorizationDeniedException` (refus d'AuthorizationFilter / @PreAuthorize) */
export class AuthorizationDeniedException extends AccessDeniedException {}

// ---------------------------------------------------------------------------
// GrantedAuthority / UserDetails
// ---------------------------------------------------------------------------

export interface GrantedAuthority {
  getAuthority(): string | null
}

export class SimpleGrantedAuthority implements GrantedAuthority {
  constructor(private readonly role: string) {}
  getAuthority(): string {
    return this.role
  }
  get authority(): string {
    return this.role
  }
  equals(other: unknown): boolean {
    return other instanceof SimpleGrantedAuthority && other.role === this.role
  }
  hashCode(): number {
    let h = 0
    for (let i = 0; i < this.role.length; i++) h = (31 * h + this.role.charCodeAt(i)) | 0
    return h
  }
  toString(): string {
    return this.role
  }
}

/** Autorités distinctes (Set Java de SimpleGrantedAuthority) */
export function distinctAuthorities(a: Iterable<GrantedAuthority>): GrantedAuthority[] {
  const seen = new Set<string | null>()
  const out: GrantedAuthority[] = []
  for (const x of a) {
    const k = x.getAuthority()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(x)
    }
  }
  return out
}

/** `java.security.Principal` */
export interface Principal {
  getName(): string
}

/** `org.springframework.security.core.userdetails.UserDetails` */
export interface UserDetails {
  getAuthorities(): Iterable<GrantedAuthority>
  getPassword(): string | null
  getUsername(): string
  isAccountNonExpired(): boolean
  isAccountNonLocked(): boolean
  isCredentialsNonExpired(): boolean
  isEnabled(): boolean
}

export function isUserDetails(v: unknown): v is UserDetails {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as UserDetails).getUsername === 'function' &&
    typeof (v as UserDetails).getPassword === 'function' &&
    typeof (v as UserDetails).getAuthorities === 'function'
  )
}

function isPrincipal(v: unknown): v is Principal {
  return v !== null && typeof v === 'object' && typeof (v as Principal).getName === 'function'
}

/** `UserDetailsService` (classe abstraite : jeton d'injection) */
export abstract class UserDetailsService {
  abstract loadUserByUsername(username: string): UserDetails
}

/** `CredentialsContainer` */
export interface CredentialsContainer {
  eraseCredentials(): void
}

function isCredentialsContainer(v: unknown): v is CredentialsContainer {
  return v !== null && typeof v === 'object' && typeof (v as CredentialsContainer).eraseCredentials === 'function'
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * `org.springframework.security.core.Authentication`.
 * PORT: les accesseurs Java (getName, getPrincipal…) sont des propriétés, comme en Kotlin (`auth.name`, `auth.principal`).
 */
export interface Authentication extends Principal {
  readonly name: string
  readonly principal: unknown
  readonly credentials: unknown
  details: unknown
  readonly authorities: GrantedAuthority[]
  isAuthenticated: boolean
}

export abstract class AbstractAuthenticationToken implements Authentication, CredentialsContainer {
  readonly authorities: GrantedAuthority[]
  details: unknown = null
  private authenticated = false

  constructor(authorities: Iterable<GrantedAuthority> | null) {
    this.authorities = authorities === null ? [] : [...authorities]
  }

  abstract get principal(): unknown
  abstract get credentials(): unknown

  get name(): string {
    return this.getName()
  }

  getName(): string {
    const p = this.principal
    if (isUserDetails(p)) return p.getUsername()
    if (isPrincipal(p)) return p.getName()
    return p === null || p === undefined ? '' : String(p)
  }

  get isAuthenticated(): boolean {
    return this.authenticated
  }

  set isAuthenticated(v: boolean) {
    this.setAuthenticated(v)
  }

  setAuthenticated(v: boolean): void {
    this.authenticated = v
  }

  eraseCredentials(): void {
    eraseSecret(this.credentials)
    eraseSecret(this.principal)
    eraseSecret(this.details)
  }

  toString(): string {
    return `${this.constructor.name} [Principal=${String(this.principal)}, Credentials=[PROTECTED], Authenticated=${this.authenticated}, Details=${String(this.details)}, Granted Authorities=[${this.authorities.map((a) => a.getAuthority()).join(', ')}]]`
  }
}

function eraseSecret(o: unknown): void {
  if (isCredentialsContainer(o)) o.eraseCredentials()
}

export class UsernamePasswordAuthenticationToken extends AbstractAuthenticationToken {
  private readonly thePrincipal: unknown
  private theCredentials: unknown

  /**
   * PORT: constructeurs Java (principal, credentials) → non authentifié et
   * (principal, credentials, authorities) → authentifié : `authorities` absent (undefined) = constructeur à 2 arguments.
   */
  constructor(principal: unknown, credentials: unknown, authorities?: Iterable<GrantedAuthority> | null) {
    super(authorities ?? null)
    this.thePrincipal = principal
    this.theCredentials = credentials
    if (authorities === undefined) super.setAuthenticated(false)
    else super.setAuthenticated(true)
  }

  static unauthenticated(principal: unknown, credentials: unknown): UsernamePasswordAuthenticationToken {
    return new UsernamePasswordAuthenticationToken(principal, credentials)
  }

  static authenticated(principal: unknown, credentials: unknown, authorities: Iterable<GrantedAuthority> | null): UsernamePasswordAuthenticationToken {
    return new UsernamePasswordAuthenticationToken(principal, credentials, authorities)
  }

  get principal(): unknown {
    return this.thePrincipal
  }

  get credentials(): unknown {
    return this.theCredentials
  }

  override setAuthenticated(v: boolean): void {
    if (v) throw new IllegalArgumentException('Cannot set this token to trusted - use constructor which takes a GrantedAuthority list instead')
    super.setAuthenticated(false)
  }

  override eraseCredentials(): void {
    super.eraseCredentials()
    this.theCredentials = null
  }
}

/** Code de hachage d'une chaîne (String.hashCode Java) */
export function javaStringHashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (31 * h + s.charCodeAt(i)) | 0
  return h
}

export class AnonymousAuthenticationToken extends AbstractAuthenticationToken {
  readonly keyHash: number
  private readonly thePrincipal: unknown

  constructor(key: string, principal: unknown, authorities: Iterable<GrantedAuthority>) {
    super(authorities)
    this.keyHash = javaStringHashCode(key)
    this.thePrincipal = principal
    this.setAuthenticated(true)
  }

  get principal(): unknown {
    return this.thePrincipal
  }

  get credentials(): unknown {
    return ''
  }
}

export class RememberMeAuthenticationToken extends AbstractAuthenticationToken {
  readonly keyHash: number
  private readonly thePrincipal: unknown

  constructor(key: string, principal: unknown, authorities: Iterable<GrantedAuthority>) {
    super(authorities)
    this.keyHash = javaStringHashCode(key)
    this.thePrincipal = principal
    this.setAuthenticated(true)
  }

  get principal(): unknown {
    return this.thePrincipal
  }

  get credentials(): unknown {
    return ''
  }
}

/** `AuthenticationTrustResolverImpl` */
export const AuthenticationTrustResolver = {
  isAnonymous(a: Authentication | null | undefined): boolean {
    return a instanceof AnonymousAuthenticationToken
  },
  isRememberMe(a: Authentication | null | undefined): boolean {
    return a instanceof RememberMeAuthenticationToken
  },
  isFullyAuthenticated(a: Authentication | null | undefined): boolean {
    return !!a && !this.isAnonymous(a) && !this.isRememberMe(a)
  },
  isAuthenticated(a: Authentication | null | undefined): boolean {
    return !!a && a.isAuthenticated && !this.isAnonymous(a)
  },
}

// ---------------------------------------------------------------------------
// SecurityContext / SecurityContextHolder
// ---------------------------------------------------------------------------

export class SecurityContext {
  authentication: Authentication | null = null

  constructor(authentication: Authentication | null = null) {
    this.authentication = authentication
  }

  getAuthentication(): Authentication | null {
    return this.authentication
  }

  setAuthentication(a: Authentication | null): void {
    this.authentication = a
  }
}

type ContextStore = { supplier: (() => SecurityContext) | null }

const storage = new AsyncLocalStorage<ContextStore>()
/** Contexte hors requête (tâches, tests) : équivalent du ThreadLocal du thread principal */
const globalStore: ContextStore = { supplier: null }

function store(): ContextStore {
  return storage.getStore() ?? globalStore
}

/**
 * `SecurityContextHolderStrategy` (ThreadLocalSecurityContextHolderStrategy : le porteur contient un Supplier) :
 * un contexte par requête, porté par AsyncLocalStorage (voir `SecurityContextHolder.runWithNewStore`).
 */
export class SecurityContextHolderStrategy {
  getContext(): SecurityContext {
    return this.getDeferredContext()()
  }

  getDeferredContext(): () => SecurityContext {
    const s = store()
    let result = s.supplier
    if (result === null) {
      const context = this.createEmptyContext()
      result = () => context
      s.supplier = result
    }
    return result
  }

  setContext(context: SecurityContext): void {
    store().supplier = () => context
  }

  setDeferredContext(deferredContext: () => SecurityContext): void {
    // SupplierDeferredSecurityContext : évalué une seule fois
    let cached: SecurityContext | null = null
    store().supplier = () => (cached ??= deferredContext())
  }

  /** Accesseur Kotlin `strategy.context` */
  get context(): SecurityContext {
    return this.getContext()
  }

  set context(c: SecurityContext) {
    this.setContext(c)
  }

  clearContext(): void {
    store().supplier = null
  }

  createEmptyContext(): SecurityContext {
    return new SecurityContext()
  }
}

const strategy = new SecurityContextHolderStrategy()

export const SecurityContextHolder = {
  getContextHolderStrategy(): SecurityContextHolderStrategy {
    return strategy
  },
  getContext(): SecurityContext {
    return strategy.getContext()
  },
  setContext(c: SecurityContext): void {
    strategy.setContext(c)
  },
  clearContext(): void {
    strategy.clearContext()
  },
  createEmptyContext(): SecurityContext {
    return strategy.createEmptyContext()
  },
  /** Exécute `fn` avec un contexte de sécurité propre (une requête HTTP ; FilterChainProxy l'utilise) */
  runWithNewStore<T>(fn: () => T): T {
    return storage.run({ supplier: null }, fn)
  },
  /** Tests (`@WithSecurityContext`) : exécute `fn` avec ce contexte */
  runWithContext<T>(context: SecurityContext, fn: () => T): T {
    return storage.run({ supplier: () => context }, fn)
  },
}

// ---------------------------------------------------------------------------
// PasswordEncoder
// ---------------------------------------------------------------------------

/** `PasswordEncoder` (classe abstraite : jeton d'injection) */
export abstract class PasswordEncoder {
  abstract encode(rawPassword: string): string
  // PORT: async (BCryptPasswordEncoder vérifie sur le pool de threads de libuv, port/bcrypt.ts) ; une implémentation
  // synchrone reste possible, les appelants font `await`
  abstract matches(rawPassword: string, encodedPassword: string | null): boolean | Promise<boolean>
  upgradeEncoding(_encodedPassword: string | null): boolean {
    return false
  }
}

const passwordEncoderLogger = KotlinLogging.logger('org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder')
const BCRYPT_PATTERN = /^\$2(a|y|b)?\$(\d\d)\$[./0-9A-Za-z]{53}/

/**
 * `BCryptPasswordEncoder` (version $2a, force 10 par défaut), empreintes interchangeables avec celles de Spring :
 * vérifié contre des empreintes produites par Spring (test/port/spring-security/password-encoder.test.ts).
 */
export class BCryptPasswordEncoder extends PasswordEncoder {
  constructor(
    private readonly strength: number = 10,
    private readonly version: '$2a' | '$2y' | '$2b' = '$2a',
  ) {
    super()
    if (strength !== -1 && (strength < 4 || strength > 31)) throw new IllegalArgumentException('Bad strength')
  }

  private gensalt(): string {
    const rounds = this.strength === -1 ? 10 : this.strength
    return `${this.version}$${rounds < 10 ? '0' : ''}${rounds}$${bcrypt.bcryptBase64Encode(randomBytes(16), 16)}`
  }

  encode(rawPassword: string): string {
    if (rawPassword === null || rawPassword === undefined) throw new IllegalArgumentException('rawPassword cannot be null')
    // BCrypt.hashpw (Spring Security 6.3+) : au-delà de 72 octets, refus
    if (Buffer.byteLength(rawPassword, 'utf8') > 72) throw new IllegalArgumentException('password cannot be more than 72 bytes')
    // PORT: reste synchrone (création d'utilisateur, changement de mot de passe : actions d'administration ponctuelles,
    // appelées dans des chaînes synchrones) ; calcul natif, ~70 ms sur le thread JS
    return bcrypt.hashSync(rawPassword, this.gensalt())
  }

  // PORT: async (BCrypt.checkpw calculé sur le pool de threads de libuv : ne bloque pas le thread JS)
  async matches(rawPassword: string, encodedPassword: string | null): Promise<boolean> {
    if (rawPassword === null || rawPassword === undefined) throw new IllegalArgumentException('rawPassword cannot be null')
    if (encodedPassword === null || encodedPassword.length === 0) {
      passwordEncoderLogger.warn(() => 'Empty encoded password')
      return false
    }
    if (!BCRYPT_PATTERN.test(encodedPassword)) {
      passwordEncoderLogger.warn(() => 'Encoded password does not look like BCrypt')
      return false
    }
    // BCrypt.checkpw ne limite pas la longueur : les octets au-delà de 72 sont ignorés (bcryptjs aussi)
    return bcrypt.compare(rawPassword, encodedPassword)
  }

  override upgradeEncoding(encodedPassword: string | null): boolean {
    if (encodedPassword === null || encodedPassword.length === 0) {
      passwordEncoderLogger.warn(() => 'Empty encoded password')
      return false
    }
    const m = BCRYPT_PATTERN.exec(encodedPassword)
    if (!m) throw new IllegalArgumentException(`Encoded password does not look like BCrypt: ${encodedPassword}`)
    return Number(m[2]) < this.strength
  }
}

// ---------------------------------------------------------------------------
// Événements d'authentification
// ---------------------------------------------------------------------------

/** `AbstractAuthenticationEvent` : `source` = l'Authentication */
export abstract class AbstractAuthenticationEvent {
  readonly timestamp = Date.now()
  constructor(readonly authentication: Authentication) {}
  get source(): unknown {
    return this.authentication
  }
}
export class AuthenticationSuccessEvent extends AbstractAuthenticationEvent {}
export class InteractiveAuthenticationSuccessEvent extends AbstractAuthenticationEvent {
  constructor(
    authentication: Authentication,
    readonly generatedBy: AnyClass,
  ) {
    super(authentication)
  }
}
export class LogoutSuccessEvent extends AbstractAuthenticationEvent {}
export class SessionFixationProtectionEvent extends AbstractAuthenticationEvent {
  constructor(
    authentication: Authentication,
    readonly oldSessionId: string,
    readonly newSessionId: string,
  ) {
    super(authentication)
  }
}
export abstract class AbstractAuthenticationFailureEvent extends AbstractAuthenticationEvent {
  constructor(
    authentication: Authentication,
    readonly exception: AuthenticationException,
  ) {
    super(authentication)
  }
}
export class AuthenticationFailureBadCredentialsEvent extends AbstractAuthenticationFailureEvent {}
export class AuthenticationFailureCredentialsExpiredEvent extends AbstractAuthenticationFailureEvent {}
export class AuthenticationFailureDisabledEvent extends AbstractAuthenticationFailureEvent {}
export class AuthenticationFailureExpiredEvent extends AbstractAuthenticationFailureEvent {}
export class AuthenticationFailureLockedEvent extends AbstractAuthenticationFailureEvent {}
export class AuthenticationFailureProviderNotFoundEvent extends AbstractAuthenticationFailureEvent {}
export class AuthenticationFailureProxyUntrustedEvent extends AbstractAuthenticationFailureEvent {}
export class AuthenticationFailureServiceExceptionEvent extends AbstractAuthenticationFailureEvent {}

/** `AuthenticationEventPublisher` (classe abstraite : jeton d'injection) */
export abstract class AuthenticationEventPublisher {
  abstract publishAuthenticationSuccess(authentication: Authentication): void
  abstract publishAuthenticationFailure(exception: AuthenticationException, authentication: Authentication): void
}

type FailureEventCtor = new (a: Authentication, e: AuthenticationException) => AbstractAuthenticationFailureEvent

/**
 * `DefaultAuthenticationEventPublisher` (bean auto-configuré par Spring Boot) : correspondance par classe exacte
 * de l'exception (comme Spring : une sous-classe non listée ne publie rien, ex. OAuth2AuthenticationException).
 */
export class DefaultAuthenticationEventPublisher extends AuthenticationEventPublisher {
  private readonly exceptionMappings = new Map<AnyClass, FailureEventCtor>([
    [BadCredentialsException, AuthenticationFailureBadCredentialsEvent],
    [UsernameNotFoundException, AuthenticationFailureBadCredentialsEvent],
    [AccountExpiredException, AuthenticationFailureExpiredEvent],
    [ProviderNotFoundException, AuthenticationFailureProviderNotFoundEvent],
    [DisabledException, AuthenticationFailureDisabledEvent],
    [LockedException, AuthenticationFailureLockedEvent],
    [AuthenticationServiceException, AuthenticationFailureServiceExceptionEvent],
    [CredentialsExpiredException, AuthenticationFailureCredentialsExpiredEvent],
  ])

  constructor(private readonly applicationEventPublisher: ApplicationEventPublisher | null = null) {
    super()
  }

  publishAuthenticationSuccess(authentication: Authentication): void {
    this.applicationEventPublisher?.publishEvent(new AuthenticationSuccessEvent(authentication))
  }

  publishAuthenticationFailure(exception: AuthenticationException, authentication: Authentication): void {
    const ctor = this.exceptionMappings.get(exception.constructor as AnyClass)
    if (ctor && this.applicationEventPublisher) this.applicationEventPublisher.publishEvent(new ctor(authentication, exception))
  }

  /** `setAdditionalExceptionMappings` */
  setAdditionalExceptionMappings(mappings: Map<AnyClass, FailureEventCtor>): void {
    for (const [k, v] of mappings) this.exceptionMappings.set(k, v)
  }
}

// SecurityAutoConfiguration : DefaultAuthenticationEventPublisher
component(DefaultAuthenticationEventPublisher, { inject: [ApplicationEventPublisher], types: [AuthenticationEventPublisher] })

class NullEventPublisher extends AuthenticationEventPublisher {
  publishAuthenticationSuccess(): void {}
  publishAuthenticationFailure(): void {}
}

// ---------------------------------------------------------------------------
// AuthenticationManager / providers
// ---------------------------------------------------------------------------

export interface AuthenticationManager {
  // PORT: async (DaoAuthenticationProvider vérifie le mot de passe sur le pool de threads de libuv) : T | Promise<T>
  authenticate(authentication: Authentication): Authentication | null | Promise<Authentication | null>
}

/** `AuthenticationProvider` (classe abstraite : jeton d'injection) */
export abstract class AuthenticationProvider {
  // PORT: async (voir AuthenticationManager) : T | Promise<T>
  abstract authenticate(authentication: Authentication): Authentication | null | Promise<Authentication | null>
  /** PORT: `supports(Class<?>)` : reçoit la classe (constructeur) du jeton */
  abstract supports(authentication: AnyClass): boolean
}

/** `ProviderManager` */
export class ProviderManager implements AuthenticationManager {
  private eventPublisher: AuthenticationEventPublisher = new NullEventPublisher()
  private readonly providers: AuthenticationProvider[]
  eraseCredentialsAfterAuthentication = true

  // PORT: surcharges ProviderManager(vararg providers) / ProviderManager(providers, parent) fusionnées
  constructor(providers: AuthenticationProvider | AuthenticationProvider[], private readonly parent: AuthenticationManager | null = null) {
    this.providers = Array.isArray(providers) ? providers : [providers]
  }

  setAuthenticationEventPublisher(publisher: AuthenticationEventPublisher): void {
    this.eventPublisher = publisher
  }

  getAuthenticationEventPublisher(): AuthenticationEventPublisher {
    return this.eventPublisher
  }

  getProviders(): AuthenticationProvider[] {
    return this.providers
  }

  // PORT: async (les fournisseurs peuvent attendre)
  async authenticate(authentication: Authentication): Promise<Authentication> {
    const toTest = authentication.constructor as AnyClass
    let lastException: AuthenticationException | null = null
    let parentException: AuthenticationException | null = null
    let result: Authentication | null = null
    let parentResult: Authentication | null = null
    for (const provider of this.providers) {
      if (!provider.supports(toTest)) continue
      try {
        result = await provider.authenticate(authentication)
        if (result !== null) {
          this.copyDetails(authentication, result)
          break
        }
      } catch (ex) {
        if (ex instanceof AccountStatusException || ex instanceof InternalAuthenticationServiceException) {
          this.prepareException(ex, authentication)
          ex.setAuthenticationRequest(authentication)
          throw ex
        }
        if (ex instanceof AuthenticationException) {
          ex.setAuthenticationRequest(authentication)
          lastException = ex
        } else throw ex
      }
    }
    if (result === null && this.parent !== null) {
      try {
        parentResult = await this.parent.authenticate(authentication)
        result = parentResult
      } catch (ex) {
        if (ex instanceof ProviderNotFoundException) {
          // ignoré : le parent n'a pas de fournisseur
        } else if (ex instanceof AuthenticationException) {
          parentException = ex
          lastException = ex
        } else throw ex
      }
    }
    if (result !== null) {
      if (this.eraseCredentialsAfterAuthentication && isCredentialsContainer(result)) result.eraseCredentials()
      if (parentResult === null) this.eventPublisher.publishAuthenticationSuccess(result)
      return result
    }
    if (lastException === null) lastException = new ProviderNotFoundException(`No AuthenticationProvider found for ${javaClassName(toTest)}`)
    if (parentException === null) this.prepareException(lastException, authentication)
    throw lastException
  }

  private prepareException(ex: AuthenticationException, auth: Authentication): void {
    this.eventPublisher.publishAuthenticationFailure(ex, auth)
  }

  private copyDetails(source: Authentication, dest: Authentication): void {
    if (dest instanceof AbstractAuthenticationToken && dest.details === null) dest.details = source.details
  }
}

const javaClassNames = new Map<AnyClass, string>()
/** Nom qualifié Java d'une classe (messages d'erreur) */
export function registerJavaClassName(cls: AnyClass, name: string): void {
  javaClassNames.set(cls, name)
}
function javaClassName(cls: AnyClass): string {
  return javaClassNames.get(cls) ?? cls.name
}
registerJavaClassName(UsernamePasswordAuthenticationToken, 'org.springframework.security.authentication.UsernamePasswordAuthenticationToken')

/** `AccountStatusUserDetailsChecker` / contrôles par défaut d'AbstractUserDetailsAuthenticationProvider */
export function checkAccountStatus(user: UserDetails): void {
  if (!user.isAccountNonLocked()) throw new LockedException('User account is locked')
  if (!user.isEnabled()) throw new DisabledException('User is disabled')
  if (!user.isAccountNonExpired()) throw new AccountExpiredException('User account has expired')
}

/** `AbstractUserDetailsAuthenticationProvider` */
export abstract class AbstractUserDetailsAuthenticationProvider extends AuthenticationProvider {
  protected readonly logger = KotlinLogging.logger(this.constructor.name)
  hideUserNotFoundExceptions = true
  forcePrincipalAsString = false

  // PORT: async (DaoAuthenticationProvider : PasswordEncoder.matches) : void | Promise<void>
  protected abstract additionalAuthenticationChecks(userDetails: UserDetails | null, authentication: UsernamePasswordAuthenticationToken | null): void | Promise<void>

  // PORT: async (DaoAuthenticationProvider : mitigateAgainstTimingAttack) : T | Promise<T>
  protected abstract retrieveUser(username: string, authentication: UsernamePasswordAuthenticationToken): UserDetails | Promise<UserDetails>

  // PORT: async (additionalAuthenticationChecks)
  async authenticate(authentication: Authentication): Promise<Authentication | null> {
    if (!(authentication instanceof UsernamePasswordAuthenticationToken))
      throw new IllegalArgumentException('Only UsernamePasswordAuthenticationToken is supported')
    const username = authentication.principal === null ? 'NONE_PROVIDED' : authentication.name
    let user: UserDetails
    try {
      user = await this.retrieveUser(username, authentication)
    } catch (ex) {
      if (ex instanceof UsernameNotFoundException) {
        this.logger.debug(() => `Failed to find user '${username}'`)
        if (!this.hideUserNotFoundExceptions) throw ex
        throw new BadCredentialsException('Bad credentials')
      }
      throw ex
    }
    // preAuthenticationChecks
    if (!user.isAccountNonLocked()) throw new LockedException('User account is locked')
    if (!user.isEnabled()) throw new DisabledException('User is disabled')
    if (!user.isAccountNonExpired()) throw new AccountExpiredException('User account has expired')
    await this.additionalAuthenticationChecks(user, authentication)
    // postAuthenticationChecks
    if (!user.isCredentialsNonExpired()) throw new CredentialsExpiredException('User credentials have expired')
    const principalToReturn: unknown = this.forcePrincipalAsString ? user.getUsername() : user
    return this.createSuccessAuthentication(principalToReturn, authentication, user)
  }

  protected createSuccessAuthentication(principal: unknown, authentication: Authentication | null, user: UserDetails | null): Authentication {
    const result = UsernamePasswordAuthenticationToken.authenticated(principal, authentication?.credentials ?? null, user !== null ? [...user.getAuthorities()] : [])
    result.details = authentication?.details ?? null
    this.logger.debug(() => 'Authenticated user')
    return result
  }

  supports(authentication: AnyClass): boolean {
    return isAssignableFrom(UsernamePasswordAuthenticationToken, authentication)
  }
}

const USER_NOT_FOUND_PASSWORD = 'userNotFoundPassword'

/** `DaoAuthenticationProvider` */
export class DaoAuthenticationProvider extends AbstractUserDetailsAuthenticationProvider {
  private userNotFoundEncodedPassword: string | null = null

  constructor(
    private readonly userDetailsService: UserDetailsService,
    private readonly passwordEncoder: PasswordEncoder = new BCryptPasswordEncoder(),
  ) {
    super()
  }

  // PORT: async (PasswordEncoder.matches)
  protected async additionalAuthenticationChecks(userDetails: UserDetails | null, authentication: UsernamePasswordAuthenticationToken | null): Promise<void> {
    if (authentication?.credentials === null || authentication?.credentials === undefined) {
      this.logger.debug(() => 'Failed to authenticate since no credentials provided')
      throw new BadCredentialsException('Bad credentials')
    }
    const presentedPassword = String(authentication.credentials)
    if (!(await this.passwordEncoder.matches(presentedPassword, userDetails?.getPassword() ?? null))) {
      this.logger.debug(() => 'Failed to authenticate since password does not match stored value')
      throw new BadCredentialsException('Bad credentials')
    }
  }

  // PORT: async (mitigateAgainstTimingAttack)
  protected async retrieveUser(username: string, authentication: UsernamePasswordAuthenticationToken): Promise<UserDetails> {
    this.prepareTimingAttackProtection()
    try {
      const loadedUser = this.userDetailsService.loadUserByUsername(username)
      if (loadedUser === null || loadedUser === undefined)
        throw new InternalAuthenticationServiceException('UserDetailsService returned null, which is an interface contract violation')
      return loadedUser
    } catch (ex) {
      if (ex instanceof UsernameNotFoundException) {
        await this.mitigateAgainstTimingAttack(authentication)
        throw ex
      }
      if (ex instanceof InternalAuthenticationServiceException) throw ex
      throw new InternalAuthenticationServiceException(ex instanceof Error ? ex.message : String(ex), ex)
    }
  }

  protected override createSuccessAuthentication(principal: unknown, authentication: Authentication | null, user: UserDetails | null): Authentication {
    // PORT: userDetailsPasswordService (mise à jour de l'encodage) absent de Komga
    return super.createSuccessAuthentication(principal, authentication, user)
  }

  private prepareTimingAttackProtection(): void {
    if (this.userNotFoundEncodedPassword === null) this.userNotFoundEncodedPassword = this.passwordEncoder.encode(USER_NOT_FOUND_PASSWORD)
  }

  // PORT: async (PasswordEncoder.matches)
  private async mitigateAgainstTimingAttack(authentication: UsernamePasswordAuthenticationToken): Promise<void> {
    if (authentication.credentials !== null && authentication.credentials !== undefined)
      await this.passwordEncoder.matches(String(authentication.credentials), this.userNotFoundEncodedPassword)
  }
}

/** `RememberMeAuthenticationProvider` */
export class RememberMeAuthenticationProvider extends AuthenticationProvider {
  constructor(private readonly key: string) {
    super()
  }

  authenticate(authentication: Authentication): Authentication | null {
    if (!this.supports(authentication.constructor as AnyClass)) return null
    if (javaStringHashCode(this.key) !== (authentication as RememberMeAuthenticationToken).keyHash)
      throw new BadCredentialsException('The presented RememberMeAuthenticationToken does not contain the expected key')
    return authentication
  }

  supports(authentication: AnyClass): boolean {
    return isAssignableFrom(RememberMeAuthenticationToken, authentication)
  }
}

// ---------------------------------------------------------------------------
// WebAuthenticationDetails
// ---------------------------------------------------------------------------

/** `WebAuthenticationDetails` */
export class WebAuthenticationDetails {
  readonly remoteAddress: string
  readonly sessionId: string | null

  constructor(request: HttpServletRequest) {
    this.remoteAddress = request.remoteAddr
    this.sessionId = request.getSession(false)?.id ?? null
  }

  toString(): string {
    return `WebAuthenticationDetails [RemoteIpAddress=${this.remoteAddress}, SessionId=${this.sessionId}]`
  }
}

/** `AuthenticationDetailsSource<HttpServletRequest, *>` */
export interface AuthenticationDetailsSource {
  buildDetails(context: HttpServletRequest): unknown
}

/** `WebAuthenticationDetailsSource` */
export class WebAuthenticationDetailsSource implements AuthenticationDetailsSource {
  buildDetails(context: HttpServletRequest): WebAuthenticationDetails {
    return new WebAuthenticationDetails(context)
  }
}

// ---------------------------------------------------------------------------
// Sécurité des méthodes : @PreAuthorize
// ---------------------------------------------------------------------------

/**
 * `@PreAuthorize(expression)` (@EnableMethodSecurity(prePostEnabled = true)).
 *
 * CONTRAT avec le dispatcher MVC (port/spring-web-dispatcher.ts) : pour un handler déclarant
 * `HandlerSpec.preAuthorize`, appeler `checkPreAuthorize(spec.preAuthorize, variables)` APRÈS la résolution des
 * arguments et AVANT l'appel de la méthode ; `variables` associe le nom Kotlin de chaque paramètre à sa valeur
 * (`#principal`, `#id`…). En cas de refus, `AccessDeniedException` est levée : le dispatcher NE DOIT PAS la traiter
 * (ni l'AuthenticationException) mais la laisser remonter jusqu'à ExceptionTranslationFilter, qui répond 403
 * (AccessDeniedHandlerImpl) ou 401 via le point d'entrée si l'utilisateur est anonyme / remember-me.
 *
 * Sous-ensemble de SpEL reconnu (celui de Komga) : `hasRole('X')`, `hasAnyRole('X','Y')`, `hasAuthority('X')`,
 * `hasAnyAuthority(..)`, `isAuthenticated()`, `isFullyAuthenticated()`, `isAnonymous()`, `isRememberMe()`, `permitAll`,
 * `denyAll`, `and`, `or`, `not` / `!`, parenthèses, `==` / `!=`, littéraux ('chaîne', nombres, true, false, null),
 * variables `#nom` avec accès aux propriétés `#principal.user.id`.
 */
export function checkPreAuthorize(expression: string, variables: Record<string, unknown> = {}): void {
  const authentication = SecurityContextHolder.getContext().authentication
  if (authentication === null) throw new AuthenticationCredentialsNotFoundException('An Authentication object was not found in the SecurityContext')
  if (!evaluateSecurityExpression(expression, authentication, variables)) throw new AuthorizationDeniedException('Access Denied')
}

/** Évalue une expression de sécurité (SpEL restreint) : exposé pour les tests et l'autorisation des URL */
export function evaluateSecurityExpression(expression: string, authentication: Authentication | null, variables: Record<string, unknown> = {}): boolean {
  return Boolean(new SpelParser(expression, authentication, variables).parse())
}

type Tok = { t: 'id' | 'str' | 'num' | 'var' | 'op' | 'eof'; v: string }

class SpelParser {
  private readonly toks: Tok[]
  private i = 0

  constructor(
    private readonly src: string,
    private readonly auth: Authentication | null,
    private readonly vars: Record<string, unknown>,
  ) {
    this.toks = this.lex(src)
  }

  private lex(s: string): Tok[] {
    const out: Tok[] = []
    let i = 0
    while (i < s.length) {
      const c = s[i] as string
      if (/\s/.test(c)) {
        i++
      } else if (c === "'" || c === '"') {
        let j = i + 1
        let v = ''
        while (j < s.length) {
          if (s[j] === c) {
            if (s[j + 1] === c) {
              v += c
              j += 2
              continue
            }
            break
          }
          v += s[j]
          j++
        }
        out.push({ t: 'str', v })
        i = j + 1
      } else if (/[0-9]/.test(c)) {
        const m = /^[0-9]+(\.[0-9]+)?/.exec(s.slice(i)) as RegExpExecArray
        out.push({ t: 'num', v: m[0] })
        i += m[0].length
      } else if (c === '#') {
        const m = /^#[A-Za-z_$][\w$]*/.exec(s.slice(i))
        if (!m) throw new IllegalArgumentException(`Invalid SpEL expression: ${s}`)
        out.push({ t: 'var', v: m[0].slice(1) })
        i += m[0].length
      } else if (/[A-Za-z_$]/.test(c)) {
        const m = /^[A-Za-z_$][\w$]*/.exec(s.slice(i)) as RegExpExecArray
        out.push({ t: 'id', v: m[0] })
        i += m[0].length
      } else {
        const two = s.slice(i, i + 2)
        if (['==', '!=', '&&', '||'].includes(two)) {
          out.push({ t: 'op', v: two })
          i += 2
        } else if ('()!,.'.includes(c)) {
          out.push({ t: 'op', v: c })
          i++
        } else throw new IllegalArgumentException(`Invalid SpEL expression: ${s}`)
      }
    }
    out.push({ t: 'eof', v: '' })
    return out
  }

  private peek(): Tok {
    return this.toks[this.i] as Tok
  }

  private next(): Tok {
    return this.toks[this.i++] as Tok
  }

  private isOp(v: string): boolean {
    const t = this.peek()
    return (t.t === 'op' && t.v === v) || (t.t === 'id' && t.v.toLowerCase() === v)
  }

  private expect(v: string): void {
    const t = this.next()
    if (t.t !== 'op' || t.v !== v) throw new IllegalArgumentException(`Invalid SpEL expression (expected '${v}'): ${this.src}`)
  }

  parse(): unknown {
    const v = this.or()
    if (this.peek().t !== 'eof') throw new IllegalArgumentException(`Invalid SpEL expression: ${this.src}`)
    return v
  }

  private or(): unknown {
    let l = this.and()
    while (this.isOp('||') || this.isOp('or')) {
      this.next()
      // SpEL évalue les deux côtés paresseusement : court-circuit
      const save = this.i
      if (l) {
        this.skipAnd(save)
        l = true
      } else l = Boolean(this.and())
    }
    return l
  }

  /** Avance sur une sous-expression `and` sans l'évaluer (court-circuit) */
  private skipAnd(_save: number): void {
    let depth = 0
    while (this.peek().t !== 'eof') {
      const t = this.peek()
      if (t.t === 'op' && t.v === '(') depth++
      else if (t.t === 'op' && t.v === ')') {
        if (depth === 0) return
        depth--
      } else if (depth === 0 && (this.isOp('||') || this.isOp('or'))) return
      this.next()
    }
  }

  private skipUnary(): void {
    let depth = 0
    while (this.peek().t !== 'eof') {
      const t = this.peek()
      if (t.t === 'op' && t.v === '(') depth++
      else if (t.t === 'op' && t.v === ')') {
        if (depth === 0) return
        depth--
      } else if (depth === 0 && (this.isOp('||') || this.isOp('or') || this.isOp('&&') || this.isOp('and'))) return
      this.next()
    }
  }

  private and(): unknown {
    let l = this.equality()
    while (this.isOp('&&') || this.isOp('and')) {
      this.next()
      if (!l) {
        this.skipUnary()
        l = false
      } else l = Boolean(this.equality())
    }
    return l
  }

  private equality(): unknown {
    const l = this.unary()
    if (this.isOp('==') || this.isOp('eq')) {
      this.next()
      return spelEquals(l, this.unary())
    }
    if (this.isOp('!=') || this.isOp('ne')) {
      this.next()
      return !spelEquals(l, this.unary())
    }
    return l
  }

  private unary(): unknown {
    if (this.isOp('!') || this.isOp('not')) {
      this.next()
      return !this.unary()
    }
    return this.primary()
  }

  private primary(): unknown {
    const t = this.next()
    if (t.t === 'op' && t.v === '(') {
      const v = this.or()
      this.expect(')')
      return v
    }
    if (t.t === 'str') return t.v
    if (t.t === 'num') return Number(t.v)
    if (t.t === 'var') return this.properties(this.vars[t.v] ?? null)
    if (t.t === 'id') {
      if (t.v === 'true') return true
      if (t.v === 'false') return false
      if (t.v === 'null') return null
      if (this.peek().t === 'op' && this.peek().v === '(') {
        this.next()
        const args: unknown[] = []
        while (!(this.peek().t === 'op' && this.peek().v === ')')) {
          args.push(this.or())
          if (this.peek().t === 'op' && this.peek().v === ',') this.next()
        }
        this.expect(')')
        return this.call(t.v, args)
      }
      return this.properties(this.root(t.v))
    }
    throw new IllegalArgumentException(`Invalid SpEL expression: ${this.src}`)
  }

  private properties(v: unknown): unknown {
    let cur = v
    while (this.peek().t === 'op' && this.peek().v === '.') {
      this.next()
      const name = this.next()
      if (name.t !== 'id') throw new IllegalArgumentException(`Invalid SpEL expression: ${this.src}`)
      cur = readProperty(cur, name.v)
    }
    return cur
  }

  private root(name: string): unknown {
    switch (name) {
      case 'permitAll':
        return true
      case 'denyAll':
        return false
      case 'principal':
        return this.auth?.principal ?? null
      case 'authentication':
        return this.auth
      default:
        throw new IllegalArgumentException(`EL1008E: Property or field '${name}' cannot be found`)
    }
  }

  private authorities(): Set<string | null> {
    return new Set((this.auth?.authorities ?? []).map((a) => a.getAuthority()))
  }

  private call(name: string, args: unknown[]): boolean {
    const role = (r: unknown) => (String(r).startsWith('ROLE_') ? String(r) : `ROLE_${String(r)}`)
    switch (name) {
      case 'hasRole':
        return this.authorities().has(role(args[0]))
      case 'hasAnyRole':
        return args.some((r) => this.authorities().has(role(r)))
      case 'hasAuthority':
        return this.authorities().has(String(args[0]))
      case 'hasAnyAuthority':
        return args.some((r) => this.authorities().has(String(r)))
      case 'isAuthenticated':
        return AuthenticationTrustResolver.isAuthenticated(this.auth)
      case 'isFullyAuthenticated':
        return AuthenticationTrustResolver.isFullyAuthenticated(this.auth)
      case 'isAnonymous':
        return AuthenticationTrustResolver.isAnonymous(this.auth)
      case 'isRememberMe':
        return AuthenticationTrustResolver.isRememberMe(this.auth)
      case 'permitAll':
        return true
      case 'denyAll':
        return false
      default:
        throw new IllegalArgumentException(`EL1004E: Method call: Method ${name}() cannot be found`)
    }
  }
}

function readProperty(obj: unknown, name: string): unknown {
  if (obj === null || obj === undefined) throw new IllegalArgumentException(`EL1007E: Property or field '${name}' cannot be found on null`)
  const o = obj as Record<string, unknown>
  if (name in o) {
    const v = o[name]
    return typeof v === 'function' ? (v as () => unknown).call(o) : v
  }
  const getter = `get${name.charAt(0).toUpperCase()}${name.slice(1)}`
  if (typeof o[getter] === 'function') return (o[getter] as () => unknown).call(o)
  throw new IllegalArgumentException(`EL1008E: Property or field '${name}' cannot be found`)
}

function spelEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a === 'object' && typeof (a as { equals?: unknown }).equals === 'function') return (a as { equals(o: unknown): boolean }).equals(b)
  return String(a) === String(b) && typeof a === typeof b
}

// ---------------------------------------------------------------------------
// Utilitaires partagés (web)
// ---------------------------------------------------------------------------

/** Comparaison en temps constant (MessageDigest.isEqual) */
export function constantTimeEquals(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Empreinte hexadécimale (MessageDigest + Hex.encode) */
export function digestHex(algorithm: 'MD5' | 'SHA-256' | 'SHA-512', data: string): string {
  return createHash(algorithm.replace('-', '').toLowerCase()).update(Buffer.from(data, 'utf8')).digest('hex')
}

/** Exception non liée à la sécurité (ServletException) */
export class ServletException extends Exception {}

/** `org.springframework.security.core.token.Sha512DigestUtils` */
export const Sha512DigestUtils = {
  /** empreinte SHA-512 hexadécimale (minuscules) des octets UTF-8 */
  shaHex(data: string): string {
    return digestHex('SHA-512', data)
  },
}
