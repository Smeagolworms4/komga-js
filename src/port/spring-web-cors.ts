// Support de portage : CORS de Spring Web 6.2 (org.springframework.web.cors) : CorsConfiguration,
// UrlBasedCorsConfigurationSource, DefaultCorsProcessor (en-têtes Vary systématiques, rejet 403
// « Invalid CORS request »), CorsUtils et CorsFilter. Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException } from './kotlin.js'
import { PathPatternParser, type PathPattern } from './path-pattern.js'
import type { FilterChain, HttpServletRequest, HttpServletResponse } from './servlet.js'
import { OncePerRequestFilter } from './spring-web-filter.js'
import { flushOutput } from './tomcat-output.js'

const ALL = '*'

function trimTrailingSlash(origin: string): string {
  return origin.endsWith('/') ? origin.slice(0, -1) : origin
}

/** `org.springframework.web.cors.CorsConfiguration` */
export class CorsConfiguration {
  static readonly ALL = ALL
  private static readonly DEFAULT_PERMIT_METHODS = ['GET', 'HEAD', 'POST']

  private _allowedOrigins: string[] | null = null
  private _allowedOriginPatterns: { declared: string; pattern: RegExp }[] | null = null
  private _allowedMethods: string[] | null = null
  private resolvedMethods: string[] | null = CorsConfiguration.DEFAULT_PERMIT_METHODS
  private _allowedHeaders: string[] | null = null
  private _exposedHeaders: string[] | null = null
  allowCredentials: boolean | null = null
  allowPrivateNetwork: boolean | null = null
  maxAge: number | null = null

  get allowedOrigins(): string[] | null {
    return this._allowedOrigins
  }
  set allowedOrigins(origins: string[] | null) {
    this._allowedOrigins = origins === null ? null : origins.filter((o) => o).map(trimTrailingSlash)
  }

  get allowedOriginPatterns(): string[] | null {
    return this._allowedOriginPatterns?.map((p) => p.declared) ?? null
  }
  set allowedOriginPatterns(patterns: string[] | null) {
    this._allowedOriginPatterns =
      patterns === null
        ? null
        : patterns.map((p) => {
            const declared = trimTrailingSlash(p)
            const re = declared
              .split('*')
              .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('.*')
            return { declared, pattern: new RegExp(`^${re}$`) }
          })
  }

  get allowedMethods(): string[] | null {
    return this._allowedMethods
  }
  set allowedMethods(methods: string[] | null) {
    this._allowedMethods = methods !== null ? [...methods] : null
    if (methods && methods.length > 0) {
      this.resolvedMethods = []
      for (const m of methods) {
        if (m === ALL) {
          this.resolvedMethods = null
          break
        }
        this.resolvedMethods.push(m.toUpperCase())
      }
    } else this.resolvedMethods = CorsConfiguration.DEFAULT_PERMIT_METHODS
  }

  get allowedHeaders(): string[] | null {
    return this._allowedHeaders
  }
  set allowedHeaders(h: string[] | null) {
    this._allowedHeaders = h !== null ? [...h] : null
  }

  get exposedHeaders(): string[] | null {
    return this._exposedHeaders
  }
  set exposedHeaders(h: string[] | null) {
    this._exposedHeaders = h !== null ? [...h] : null
  }

  addAllowedOrigin(origin: string): void {
    this._allowedOrigins = [...(this._allowedOrigins ?? []), trimTrailingSlash(origin)]
  }
  addAllowedHeader(h: string): void {
    this._allowedHeaders = [...(this._allowedHeaders ?? []), h]
  }
  addExposedHeader(h: string): void {
    this._exposedHeaders = [...(this._exposedHeaders ?? []), h]
  }
  addAllowedMethod(m: string): void {
    this.allowedMethods = [...(this._allowedMethods ?? []), m]
  }

  /** `applyPermitDefaultValues()` */
  applyPermitDefaultValues(): this {
    if (this._allowedOrigins === null && this._allowedOriginPatterns === null) this.addAllowedOrigin(ALL)
    if (this._allowedMethods === null) this.allowedMethods = [...CorsConfiguration.DEFAULT_PERMIT_METHODS]
    if (this._allowedHeaders === null) this.addAllowedHeader(ALL)
    if (this.maxAge === null) this.maxAge = 1800
    return this
  }

  validateAllowCredentials(): void {
    if (this.allowCredentials === true && this._allowedOrigins !== null && this._allowedOrigins.includes(ALL))
      throw new IllegalArgumentException(
        'When allowCredentials is true, allowedOrigins cannot contain the special value "*" since that cannot be set on the "Access-Control-Allow-Origin" response header. To allow credentials to a set of origins, list them explicitly or consider using "allowedOriginPatterns" instead.',
      )
  }

  validateAllowPrivateNetwork(): void {
    if (this.allowPrivateNetwork === true && this._allowedOrigins !== null && this._allowedOrigins.includes(ALL))
      throw new IllegalArgumentException(
        'When allowPrivateNetwork is true, allowedOrigins cannot contain the special value "*" as it is not recommended from a security perspective. To allow private network access to a set of origins, list them explicitly or consider using "allowedOriginPatterns" instead.',
      )
  }

  checkOrigin(origin: string | null): string | null {
    if (!origin || !origin.trim()) return null
    const originToCheck = trimTrailingSlash(origin)
    if (this._allowedOrigins && this._allowedOrigins.length > 0) {
      if (this._allowedOrigins.includes(ALL)) {
        this.validateAllowCredentials()
        this.validateAllowPrivateNetwork()
        return ALL
      }
      for (const allowedOrigin of this._allowedOrigins) if (originToCheck.toLowerCase() === allowedOrigin.toLowerCase()) return origin
    }
    if (this._allowedOriginPatterns && this._allowedOriginPatterns.length > 0)
      for (const p of this._allowedOriginPatterns) if (p.declared === ALL || p.pattern.test(originToCheck)) return origin
    return null
  }

  checkHttpMethod(requestMethod: string | null): string[] | null {
    if (requestMethod === null) return null
    if (this.resolvedMethods === null) return [requestMethod]
    return this.resolvedMethods.includes(requestMethod) ? this.resolvedMethods : null
  }

  checkHeaders(requestHeaders: string[] | null): string[] | null {
    if (requestHeaders === null) return null
    if (requestHeaders.length === 0) return []
    if (!this._allowedHeaders || this._allowedHeaders.length === 0) return null
    const allowAnyHeader = this._allowedHeaders.includes(ALL)
    const result: string[] = []
    for (let requestHeader of requestHeaders) {
      if (requestHeader.trim()) {
        requestHeader = requestHeader.trim()
        if (allowAnyHeader) result.push(requestHeader)
        else
          for (const allowedHeader of this._allowedHeaders)
            if (requestHeader.toLowerCase() === allowedHeader.toLowerCase()) {
              result.push(requestHeader)
              break
            }
      }
    }
    return result.length === 0 ? null : result
  }
}

/** `org.springframework.web.cors.CorsConfigurationSource` */
export interface CorsConfigurationSource {
  getCorsConfiguration(request: HttpServletRequest): CorsConfiguration | null
}

/** `org.springframework.web.cors.UrlBasedCorsConfigurationSource` */
export class UrlBasedCorsConfigurationSource implements CorsConfigurationSource {
  private readonly corsConfigurations = new Map<PathPattern, CorsConfiguration>()

  registerCorsConfiguration(pattern: string, config: CorsConfiguration): void {
    this.corsConfigurations.set(PathPatternParser.defaultInstance.parse(PathPatternParser.defaultInstance.initFullPathPattern(pattern)), config)
  }

  getCorsConfigurations(): Map<string, CorsConfiguration> {
    return new Map([...this.corsConfigurations].map(([p, c]) => [p.patternString, c]))
  }

  getCorsConfiguration(request: HttpServletRequest): CorsConfiguration | null {
    const lookupPath = request.servletPath
    for (const [pattern, config] of this.corsConfigurations) if (pattern.matches(lookupPath)) return config
    return null
  }
}

function defaultPort(scheme: string | null, port: number): number {
  if (port === -1) {
    if (scheme === 'http' || scheme === 'ws') return 80
    if (scheme === 'https' || scheme === 'wss') return 443
  }
  return port
}

/** `org.springframework.web.cors.CorsUtils` */
export const CorsUtils = {
  isCorsRequest(request: HttpServletRequest): boolean {
    const origin = request.getHeader('Origin')
    if (origin === null) return false
    let u: URL
    try {
      u = new URL(origin)
    } catch {
      return true
    }
    const scheme = request.scheme
    const host = request.serverName
    const port = request.serverPort
    const originScheme = u.protocol.slice(0, -1)
    const originHost = u.hostname
    const originPort = u.port ? Number(u.port) : -1
    return !(scheme === originScheme && host === originHost && defaultPort(scheme, port) === defaultPort(originScheme, originPort))
  },

  isPreFlightRequest(request: HttpServletRequest): boolean {
    return request.method === 'OPTIONS' && request.getHeader('Origin') !== null && request.getHeader('Access-Control-Request-Method') !== null
  },
}

/** `org.springframework.web.cors.DefaultCorsProcessor` */
export class DefaultCorsProcessor {
  processRequest(config: CorsConfiguration | null, request: HttpServletRequest, response: HttpServletResponse): boolean {
    const varyHeaders = response.getHeaders('Vary')
    if (!varyHeaders.includes('Origin')) response.addHeader('Vary', 'Origin')
    if (!varyHeaders.includes('Access-Control-Request-Method')) response.addHeader('Vary', 'Access-Control-Request-Method')
    if (!varyHeaders.includes('Access-Control-Request-Headers')) response.addHeader('Vary', 'Access-Control-Request-Headers')
    if (!CorsUtils.isCorsRequest(request)) return true
    if (response.getHeader('Access-Control-Allow-Origin') !== null) return true
    const preFlightRequest = CorsUtils.isPreFlightRequest(request)
    if (config === null) {
      // Only pre-flight requests are rejected, as the specification allows the response to not have CORS headers
      if (preFlightRequest) {
        this.rejectRequest(response)
        return false
      }
      return true
    }
    return this.handleInternal(request, response, config, preFlightRequest)
  }

  /** Statut 403 et corps « Invalid CORS request », réponse envoyée */
  protected rejectRequest(response: HttpServletResponse): void {
    response.setStatus(403)
    const out = response.getOutputStream()
    out.write(Buffer.from('Invalid CORS request', 'utf8'))
    // ServerHttpResponse.flush() : la réponse part en bloc (Transfer-Encoding: chunked)
    flushOutput(out)
    out.end()
  }

  protected handleInternal(request: HttpServletRequest, response: HttpServletResponse, config: CorsConfiguration, preFlightRequest: boolean): boolean {
    const requestOrigin = request.getHeader('Origin')
    const allowOrigin = config.checkOrigin(requestOrigin)
    if (allowOrigin === null) {
      this.rejectRequest(response)
      return false
    }
    const requestMethod = preFlightRequest ? request.getHeader('Access-Control-Request-Method') : request.method
    const allowMethods = config.checkHttpMethod(requestMethod)
    if (allowMethods === null) {
      this.rejectRequest(response)
      return false
    }
    const requestHeaders = preFlightRequest
      ? request
          .getHeaders('Access-Control-Request-Headers')
          .flatMap((v) => v.split(','))
          .map((s) => s.trim())
          .filter((s) => s)
      : request.getHeaderNames()
    const allowHeaders = config.checkHeaders(requestHeaders)
    if (preFlightRequest && allowHeaders === null) {
      this.rejectRequest(response)
      return false
    }
    response.setHeader('Access-Control-Allow-Origin', allowOrigin)
    if (preFlightRequest) response.setHeader('Access-Control-Allow-Methods', allowMethods.join(','))
    if (preFlightRequest && allowHeaders !== null && allowHeaders.length > 0) response.setHeader('Access-Control-Allow-Headers', allowHeaders.join(', '))
    if (config.exposedHeaders && config.exposedHeaders.length > 0) response.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(', '))
    if (config.allowCredentials === true) response.setHeader('Access-Control-Allow-Credentials', 'true')
    if (config.allowPrivateNetwork === true && request.getHeader('Access-Control-Request-Private-Network') === 'true')
      response.setHeader('Access-Control-Allow-Private-Network', 'true')
    if (preFlightRequest && config.maxAge !== null) response.setHeader('Access-Control-Max-Age', String(config.maxAge))
    return true
  }
}

/** `org.springframework.web.filter.CorsFilter` */
export class CorsFilter extends OncePerRequestFilter {
  private processor = new DefaultCorsProcessor()

  constructor(private readonly configSource: CorsConfigurationSource) {
    super()
  }

  setCorsProcessor(processor: DefaultCorsProcessor): void {
    this.processor = processor
  }

  protected async doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    const corsConfiguration = this.configSource.getCorsConfiguration(request)
    const isValid = this.processor.processRequest(corsConfiguration, request, response)
    if (!isValid || CorsUtils.isPreFlightRequest(request)) return
    await filterChain.doFilter(request, response)
  }
}
