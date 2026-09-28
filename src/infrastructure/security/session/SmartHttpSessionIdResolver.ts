// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/session/SmartHttpSessionIdResolver.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { HttpServletRequest, HttpServletResponse } from '../../../port/servlet.js'
import { CookieHttpSessionIdResolver, type CookieSerializer, HeaderHttpSessionIdResolver, type HttpSessionIdResolver } from '../../../port/spring-session.js'

export class SmartHttpSessionIdResolver implements HttpSessionIdResolver {
  private readonly cookie: CookieHttpSessionIdResolver
  private readonly header: HeaderHttpSessionIdResolver

  constructor(
    private readonly sessionHeaderName: string,
    cookieSerializer: CookieSerializer,
  ) {
    this.cookie = new CookieHttpSessionIdResolver()
    this.cookie.setCookieSerializer(cookieSerializer)
    this.header = new HeaderHttpSessionIdResolver(sessionHeaderName)
  }

  resolveSessionIds(request: HttpServletRequest): string[] {
    return this.getResolver(request).resolveSessionIds(request)
  }

  setSessionId(request: HttpServletRequest, response: HttpServletResponse, sessionId: string): void {
    this.getResolver(request).setSessionId(request, response, sessionId)
  }

  expireSession(request: HttpServletRequest, response: HttpServletResponse): void {
    this.getResolver(request).expireSession(request, response)
  }

  // PORT: fonction d'extension privée HttpServletRequest.getResolver()
  private getResolver(self: HttpServletRequest): HttpSessionIdResolver {
    return self.getHeader(this.sessionHeaderName) !== null ? this.header : this.cookie
  }
}
