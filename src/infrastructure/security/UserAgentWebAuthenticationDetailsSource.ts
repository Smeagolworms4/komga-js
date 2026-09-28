// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/UserAgentWebAuthenticationDetailsSource.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { HttpServletRequest } from '../../port/servlet.js'
import { WebAuthenticationDetailsSource } from '../../port/spring-security.js'
import { component } from '../../port/spring.js'
import { UserAgentWebAuthenticationDetails } from './UserAgentWebAuthenticationDetails.js'

export class UserAgentWebAuthenticationDetailsSource extends WebAuthenticationDetailsSource {
  override buildDetails(context: HttpServletRequest): UserAgentWebAuthenticationDetails {
    return new UserAgentWebAuthenticationDetails(context)
  }
}

// @Component
component(UserAgentWebAuthenticationDetailsSource)
