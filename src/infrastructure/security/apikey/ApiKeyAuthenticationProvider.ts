// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/apikey/ApiKeyAuthenticationProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaUserRepository } from '../../../domain/persistence/KomgaUserRepository.js'
import { nn } from '../../../port/kotlin.js'
import {
  AbstractUserDetailsAuthenticationProvider,
  type AnyClass,
  type Authentication,
  BadCredentialsException,
  type UserDetails,
  type UsernamePasswordAuthenticationToken,
  isAssignableFrom,
} from '../../../port/spring-security.js'
import { component } from '../../../port/spring.js'
import { KomgaPrincipal } from '../KomgaPrincipal.js'
import { ApiKeyAuthenticationToken } from './ApiKeyAuthenticationToken.js'

/**
 * A provider to lookup API keys in the repository.
 */
export class ApiKeyAuthenticationProvider extends AbstractUserDetailsAuthenticationProvider {
  constructor(private readonly userRepository: KomgaUserRepository) {
    super()
  }

  protected additionalAuthenticationChecks(_userDetails: UserDetails | null, _authentication: UsernamePasswordAuthenticationToken | null): void {}

  protected retrieveUser(_username: string, authentication: UsernamePasswordAuthenticationToken): UserDetails {
    const it = this.userRepository.findByApiKeyOrNull(String(authentication.credentials))
    if (it !== null) {
      const [user, apiKey] = it
      return new KomgaPrincipal(user, { apiKey: apiKey, name: authentication.name })
    }
    throw new BadCredentialsException('Bad credentials')
  }

  protected override createSuccessAuthentication(principal: unknown, authentication: Authentication | null, user: UserDetails | null): Authentication {
    const token = ApiKeyAuthenticationToken.authenticated(principal, authentication?.credentials ?? null, nn(user).getAuthorities())
    token.details = authentication?.details ?? null
    this.logger.debug(() => 'Authenticated user')
    return token
  }

  override supports(authentication: AnyClass): boolean {
    return isAssignableFrom(ApiKeyAuthenticationToken, authentication)
  }
}

// @Component
component(ApiKeyAuthenticationProvider, { inject: [KomgaUserRepository] })
