// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/KoboMissingPortFilter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { FilterChain, HttpServletRequest, HttpServletResponse } from '../../port/servlet.js'
import { HttpServletRequestWrapper } from '../../port/servlet-wrapper.js'
import { OncePerRequestFilter } from '../../port/spring-web-filter.js'

export class KoboMissingPortFilter extends OncePerRequestFilter {
  private static readonly FORWARDED_HEADER_NAMES = new Set(['Forwarded', 'X-Forwarded-Host', 'X-Forwarded-Port', 'X-Forwarded-Proto', 'X-Forwarded-Prefix', 'X-Forwarded-Ssl', 'X-Forwarded-For'])

  constructor(private readonly koboPortSupplier: () => number | null) {
    super()
  }

  protected override shouldNotFilter(request: HttpServletRequest): boolean {
    // ignore this filter if forwarded headers are present
    for (const it of KoboMissingPortFilter.FORWARDED_HEADER_NAMES) if (request.getHeader(it) !== null) return true
    return false
  }

  protected override shouldNotFilterAsyncDispatch(): boolean {
    return false
  }

  protected override shouldNotFilterErrorDispatch(): boolean {
    return false
  }

  protected async doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    let wrappedRequest: HttpServletRequest
    try {
      wrappedRequest = new KoboMissingPortFilter.KoboMissingPortRequest(request, this.koboPortSupplier)
    } catch (ex) {
      if (this.logger.isEnabled('DEBUG')) this.logger.debug(ex as Error, () => `Failed to apply missing port to ${this.formatRequest(request)}`)
      response.sendError(400)
      return
    }
    await filterChain.doFilter(wrappedRequest, response)
  }

  protected override async doFilterNestedErrorDispatch(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    await this.doFilterInternal(request, response, filterChain)
  }

  private formatRequest(request: HttpServletRequest): string {
    return `HTTP ${request.method} "${request.requestURI}"`
  }
}

export namespace KoboMissingPortFilter {
  export class KoboMissingPortRequest extends HttpServletRequestWrapper {
    declare readonly port: () => number | null

    constructor(request: HttpServletRequest, port: () => number | null) {
      super(request)
      Object.defineProperty(this, 'port', { value: port })
    }

    override get serverPort(): number {
      return this.port() ?? this.getRequest().serverPort
    }
  }
}
