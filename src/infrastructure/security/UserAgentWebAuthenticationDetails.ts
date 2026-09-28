// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/UserAgentWebAuthenticationDetails.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { HttpServletRequest } from '../../port/servlet.js'
import { WebAuthenticationDetails } from '../../port/spring-security.js'

export class UserAgentWebAuthenticationDetails extends WebAuthenticationDetails {
  readonly userAgent: string

  constructor(request: HttpServletRequest) {
    super(request)
    this.userAgent = request.getHeader('User-Agent') ?? ''
  }
}
