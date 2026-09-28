// Support de portage : configuration de Spring MVC 6.2 utilisée par Komga (WebMvcConfigurer) :
// ResourceHandlerRegistry (ressources statiques servies par ResourceHttpRequestHandler), InterceptorRegistry
// (HandlerInterceptor, WebContentInterceptor et ses correspondances Cache-Control), résolveurs d'arguments.
// Les beans WebMvcConfigurer sont lus par le DispatcherServlet (port/spring-web-dispatcher.ts).
// Ce fichier n'a pas de jumeau Kotlin.
import { statSync } from 'node:fs'
import { isAbsolute, join, normalize, relative } from 'node:path'
import { PathContainer, type PathPattern, PathPatternParser } from './path-pattern.js'
import { resourcesDir } from './resources.js'
import type { HttpServletRequest, HttpServletResponse } from './servlet.js'
import { FileSystemResource } from './spring-core-io.js'
import type { HandlerMethodArgumentResolver, Resource } from './spring-web.js'

// ---------------------------------------------------------------------------
// HandlerInterceptor
// ---------------------------------------------------------------------------

/** `org.springframework.web.servlet.HandlerInterceptor` */
export interface HandlerInterceptor {
  preHandle?(request: HttpServletRequest, response: HttpServletResponse, handler: unknown): boolean | Promise<boolean>
  postHandle?(request: HttpServletRequest, response: HttpServletResponse, handler: unknown): void
  afterCompletion?(request: HttpServletRequest, response: HttpServletResponse, handler: unknown, ex: unknown): void
}

/** `org.springframework.web.servlet.handler.MappedInterceptor` */
export class MappedInterceptor implements HandlerInterceptor {
  constructor(
    readonly interceptor: HandlerInterceptor,
    readonly includePatterns: PathPattern[] | null,
    readonly excludePatterns: PathPattern[] | null,
  ) {}

  preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: unknown): boolean | Promise<boolean> {
    return this.interceptor.preHandle ? this.interceptor.preHandle(request, response, handler) : true
  }

  matches(request: HttpServletRequest): boolean {
    const path = PathContainer.parsePath(request.servletPath)
    if (this.excludePatterns?.some((p) => p.matches(path))) return false
    if (this.includePatterns === null || this.includePatterns.length === 0) return true
    return this.includePatterns.some((p) => p.matches(path))
  }
}

/** `InterceptorRegistration` */
export class InterceptorRegistration {
  private includePatterns: string[] = []
  private excludePatterns: string[] = []
  order = 0

  constructor(readonly interceptor: HandlerInterceptor) {}

  addPathPatterns(...patterns: string[]): this {
    this.includePatterns.push(...patterns)
    return this
  }

  excludePathPatterns(...patterns: string[]): this {
    this.excludePatterns.push(...patterns)
    return this
  }

  getInterceptor(): HandlerInterceptor {
    if (this.includePatterns.length === 0 && this.excludePatterns.length === 0) return this.interceptor
    const parse = (ps: string[]) => ps.map((p) => PathPatternParser.defaultInstance.parse(PathPatternParser.defaultInstance.initFullPathPattern(p)))
    return new MappedInterceptor(this.interceptor, parse(this.includePatterns), parse(this.excludePatterns))
  }
}

/** `InterceptorRegistry` */
export class InterceptorRegistry {
  private readonly registrations: InterceptorRegistration[] = []

  addInterceptor(interceptor: HandlerInterceptor): InterceptorRegistration {
    const r = new InterceptorRegistration(interceptor)
    this.registrations.push(r)
    return r
  }

  getInterceptors(): HandlerInterceptor[] {
    return [...this.registrations].sort((a, b) => a.order - b.order).map((r) => r.getInterceptor())
  }
}

// ---------------------------------------------------------------------------
// WebContentInterceptor
// ---------------------------------------------------------------------------

function applyCacheControl(response: HttpServletResponse, ccValue: string | null): void {
  if (ccValue) {
    // Set computed HTTP 1.1 Cache-Control header
    response.setHeader('Cache-Control', ccValue)
    // Reset HTTP 1.0 Pragma header if present
    if (response.containsHeader('Pragma')) response.setHeader('Pragma', '')
    // Reset HTTP 1.0 Expires header if present
    if (response.containsHeader('Expires')) response.setHeader('Expires', '')
  }
}

/** `org.springframework.web.servlet.mvc.WebContentInterceptor` */
export class WebContentInterceptor implements HandlerInterceptor {
  private readonly cacheControlMappings = new Map<PathPattern, string>()

  /** `addCacheMapping(cacheControl, vararg paths)` */
  addCacheMapping(cacheControl: string, ...paths: string[]): void {
    for (const path of paths) this.cacheControlMappings.set(PathPatternParser.defaultInstance.parse(path), cacheControl)
  }

  preHandle(request: HttpServletRequest, response: HttpServletResponse): boolean {
    const path = PathContainer.parsePath(request.servletPath)
    if (this.cacheControlMappings.size > 0) {
      const control = this.lookupCacheControl(path)
      if (control !== null) {
        applyCacheControl(response, control)
        return true
      }
    }
    return true
  }

  protected lookupCacheControl(path: PathContainer): string | null {
    for (const [pattern, cc] of this.cacheControlMappings) if (pattern.matches(path)) return cc
    return null
  }
}

// ---------------------------------------------------------------------------
// Ressources statiques
// ---------------------------------------------------------------------------

/** `ResourceHandlerRegistration` */
export class ResourceHandlerRegistration {
  readonly locations: string[] = []
  cacheControl: string | null = null

  constructor(readonly pathPatterns: string[]) {}

  addResourceLocations(...locations: string[]): this {
    this.locations.push(...locations)
    return this
  }

  /** `setCacheControl(CacheControl.x())` : valeur de l'en-tête */
  setCacheControl(cacheControl: string): this {
    this.cacheControl = cacheControl
    return this
  }
}

/** `ResourceHandlerRegistry` */
export class ResourceHandlerRegistry {
  readonly registrations: ResourceHandlerRegistration[] = []

  addResourceHandler(...pathPatterns: string[]): ResourceHandlerRegistration {
    const r = new ResourceHandlerRegistration(pathPatterns)
    this.registrations.push(r)
    return r
  }

  hasMappingForPattern(pathPattern: string): boolean {
    return this.registrations.some((r) => r.pathPatterns.includes(pathPattern))
  }
}

/** Emplacement `classpath:x/` ou `file:x/` -> répertoire local */
export function resolveLocation(location: string): string {
  if (location.startsWith('classpath:')) return join(resourcesDir(), location.slice('classpath:'.length).replace(/^\/+/, ''))
  if (location.startsWith('file:')) return location.slice('file:'.length)
  return join(resourcesDir(), location)
}

/** `ResourceHttpRequestHandler.getResource` : chemin nettoyé puis recherché dans les emplacements */
export function lookupStaticResource(path: string, locations: string[]): Resource | null {
  // processPath
  path = path.replaceAll('\\', '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '')
  if (!path.trim() || isInvalidPath(path)) return null
  for (const loc of locations) {
    const dir = resolveLocation(loc)
    const file = normalize(join(dir, path))
    const rel = relative(dir, file)
    if (rel.startsWith('..') || isAbsolute(rel)) continue
    try {
      if (statSync(file).isFile()) return new FileSystemResource(file)
    } catch {
      // absent
    }
  }
  return null
}

function isInvalidPath(path: string): boolean {
  if (path.includes('WEB-INF') || path.includes('META-INF')) return true
  if (path.includes(':/')) return true
  if (path.includes('..') && path.split('/').includes('..')) return true
  return false
}

// ---------------------------------------------------------------------------
// WebMvcConfigurer
// ---------------------------------------------------------------------------

/** `org.springframework.web.servlet.config.annotation.WebMvcConfigurer` */
export abstract class WebMvcConfigurer {
  addResourceHandlers(_registry: ResourceHandlerRegistry): void {}
  addInterceptors(_registry: InterceptorRegistry): void {}
  /** Résolveurs d'arguments personnalisés (voir ArgSpec `custom`) */
  addArgumentResolvers(_resolvers: HandlerMethodArgumentResolver[]): void {}
}
