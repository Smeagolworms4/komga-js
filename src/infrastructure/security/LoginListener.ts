// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/LoginListener.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { AuthenticationActivity } from '../../domain/model/AuthenticationActivity.js'
import { AuthenticationActivityRepository } from '../../domain/persistence/AuthenticationActivityRepository.js'
import { KomgaUserRepository } from '../../domain/persistence/KomgaUserRepository.js'
import { str } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import {
  AbstractAuthenticationFailureEvent,
  AbstractAuthenticationToken,
  type AbstractAuthenticationEvent,
  AuthenticationFailureProviderNotFoundEvent,
  AuthenticationSuccessEvent,
  RememberMeAuthenticationToken,
  UsernamePasswordAuthenticationToken,
  WebAuthenticationDetails,
} from '../../port/spring-security.js'
import { OAuth2LoginAuthenticationToken } from '../../port/spring-security-oauth2.js'
import { component } from '../../port/spring.js'
import { ApiKeyAuthenticationToken } from './apikey/ApiKeyAuthenticationToken.js'
import type { KomgaPrincipal } from './KomgaPrincipal.js'
import { UserAgentWebAuthenticationDetails } from './UserAgentWebAuthenticationDetails.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.security.LoginListener')

// PORT: `x as T` Kotlin (ClassCastException si x n'est pas un T, NullPointerException si null)
function cast<T>(x: unknown, cls: abstract new (...a: never[]) => T): T {
  if (x instanceof cls) return x
  throw new TypeError(`${String(x)} cannot be cast to ${cls.name}`)
}

export class LoginListener {
  constructor(
    private readonly authenticationActivityRepository: AuthenticationActivityRepository,
    private readonly userRepository: KomgaUserRepository,
  ) {}

  onSuccess(event: AuthenticationSuccessEvent): void {
    const komgaPrincipal = event.authentication.principal as KomgaPrincipal
    const user = komgaPrincipal.user
    const apiKey = komgaPrincipal.apiKey
    let source: string | null
    if (event.source instanceof OAuth2LoginAuthenticationToken) source = `OAuth2:${(event.source as OAuth2LoginAuthenticationToken).clientRegistration.clientName}`
    else if (event.source instanceof ApiKeyAuthenticationToken) source = 'ApiKey'
    else if (event.source instanceof UsernamePasswordAuthenticationToken) source = 'Password'
    else if (event.source instanceof RememberMeAuthenticationToken) source = 'RememberMe'
    else source = null
    const activity = new AuthenticationActivity({
      userId: user.id,
      email: user.email,
      apiKeyId: apiKey?.id ?? null,
      apiKeyComment: apiKey?.comment ?? null,
      ip: this.getIp(event),
      userAgent: this.getUserAgent(event),
      success: true,
      source: source,
    })

    logger.debug(() => str(activity))
    this.authenticationActivityRepository.insert(activity)
  }

  onFailure(event: AbstractAuthenticationFailureEvent): void {
    // somehow we get 2 events with bad credentials, so discard this one
    if (event instanceof AuthenticationFailureProviderNotFoundEvent) return
    let source: string | null
    if (event.source instanceof OAuth2LoginAuthenticationToken) source = `OAuth2:${(event.source as OAuth2LoginAuthenticationToken).clientRegistration.clientName}`
    else if (event.source instanceof ApiKeyAuthenticationToken) source = 'ApiKey'
    else if (event.source instanceof UsernamePasswordAuthenticationToken) source = 'Password'
    else if (event.source instanceof RememberMeAuthenticationToken) source = 'RememberMe'
    else source = null
    const p = event.authentication?.principal
    const principal = p === null || p === undefined ? '' : String(p)
    const activity = new AuthenticationActivity({
      userId: this.userRepository.findByEmailIgnoreCaseOrNull(principal)?.id ?? null,
      email: !(event.source instanceof ApiKeyAuthenticationToken) ? principal : null,
      apiKeyComment: event.source instanceof ApiKeyAuthenticationToken ? principal : null,
      ip: this.getIp(event),
      userAgent: this.getUserAgent(event),
      success: false,
      source: source,
      error: event.exception.message || null,
    })

    logger.debug(() => str(activity))
    this.authenticationActivityRepository.insert(activity)
  }

  // PORT: fonctions d'extension privées EventObject.getIp() / EventObject.getUserAgent()
  private getIp(self: AbstractAuthenticationEvent): string | null {
    try {
      if (self.source instanceof WebAuthenticationDetails) return (self.source as WebAuthenticationDetails).remoteAddress
      else if (self.source instanceof AbstractAuthenticationToken) return cast((self.source as AbstractAuthenticationToken).details, WebAuthenticationDetails).remoteAddress
      else return null
    } catch (e) {
      return null
    }
  }

  private getUserAgent(self: AbstractAuthenticationEvent): string | null {
    try {
      if (self.source instanceof UserAgentWebAuthenticationDetails) return (self.source as UserAgentWebAuthenticationDetails).userAgent
      else if (self.source instanceof AbstractAuthenticationToken) return cast((self.source as AbstractAuthenticationToken).details, UserAgentWebAuthenticationDetails).userAgent
      else return null
    } catch (e) {
      return null
    }
  }
}

// @Component
component(LoginListener, {
  inject: [AuthenticationActivityRepository, KomgaUserRepository],
  eventListeners: [
    { method: 'onSuccess', events: [AuthenticationSuccessEvent] },
    { method: 'onFailure', events: [AbstractAuthenticationFailureEvent] },
  ],
})
