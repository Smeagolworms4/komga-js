// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/apikey/ApiKeyAuthenticationToken.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type GrantedAuthority, UsernamePasswordAuthenticationToken } from '../../../port/spring-security.js'

/**
 * A specialization of [UsernamePasswordAuthenticationToken] to store API keys.
 */
export class ApiKeyAuthenticationToken extends UsernamePasswordAuthenticationToken {
  // PORT: constructeurs privés (principal, credentials, authorities) et (principal, credentials) fusionnés :
  // le second délègue au premier avec authorities = null puis passe isAuthenticated à false
  private constructor(principal: unknown, credentials: unknown, authorities: Iterable<GrantedAuthority> | null, twoArgs = false) {
    super(principal, credentials, authorities)
    if (twoArgs) this.isAuthenticated = false
  }

  static override authenticated(principal: unknown, credentials: unknown, authorities: Iterable<GrantedAuthority> | null): ApiKeyAuthenticationToken {
    return new ApiKeyAuthenticationToken(principal, credentials, authorities)
  }

  static override unauthenticated(principal: unknown, credentials: unknown): ApiKeyAuthenticationToken {
    return new ApiKeyAuthenticationToken(principal, credentials, null, true)
  }
}
