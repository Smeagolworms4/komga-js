// Support de portage : exécution des requêtes de Spring MVC 6.2 (DispatcherServlet) derrière le contrat de
// déclaration de port/spring-web.ts. Reproduit :
// - RequestMappingHandlerMapping : motifs PathPattern (classe + méthode combinés, sans « / » final optionnel),
//   conditions méthode / params / headers / consumes / produces, choix du plus spécifique, HEAD -> GET,
//   OPTIONS (Allow, Accept-Patch), pré-vol CORS, erreurs 404 (NoHandlerFoundException), 405, 406, 415, 400 ;
// - ressources statiques (ResourceHttpRequestHandler) et intercepteurs (WebMvcConfigurer) ;
// - résolution des arguments (conversions du ConversionService, @RequestBody Jackson, @Valid, validation de
//   méthode, Pageable / Sort de Spring Data web, résolveurs personnalisés) ;
// - traitement des valeurs de retour (convertisseurs de messages, négociation de contenu, ResponseEntity,
//   Resource et requêtes Range, StreamingResponseBody, SseEmitter, vues Thymeleaf, forward:, redirect:) ;
// - résolution des exceptions (@ExceptionHandler du contrôleur puis @ControllerAdvice, ResponseStatusException,
//   @ResponseStatus, DefaultHandlerExceptionResolver) ;
// - BasicErrorController de Spring Boot (/error, JSON ou page « Whitelabel ») et DefaultErrorAttributes.
// Ce fichier n'a pas de jumeau Kotlin.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomInt } from 'node:crypto'
import type { Readable, Writable } from 'node:stream'
import { qualifiedNameOf } from './jackson.js'
import { JsonProcessingException, type JavaType, ObjectMapper } from './jackson-mapper.js'
import { Exception, IllegalArgumentException, IllegalStateException, RuntimeException } from './kotlin.js'
import { KotlinLogging } from './logging.js'
import { InvalidMediaTypeException, ParsedMediaType, mediaTypeForFilename, sortBySpecificity } from './media-type.js'
import { PathContainer, type PathPattern, PathPatternParser } from './path-pattern.js'
import { type FilterChain, type HttpServletRequest, type HttpServletResponse, MaxUploadSizeExceededException, MultipartFile } from './servlet.js'
import { HttpServletRequestWrapper, parameterMap } from './servlet-wrapper.js'
import type { ApplicationContext } from './spring.js'
import { Direction, Order, PageRequest, Pageable, Sort } from './spring-data.js'
import {
  AccessDeniedException,
  type ArgSpec,
  type ControllerSpec,
  type ExceptionHandlerSpec,
  type HandlerMethodArgumentResolver,
  type HandlerSpec,
  HttpHeaders,
  HttpMediaTypeNotAcceptableException,
  HttpMediaTypeNotSupportedException,
  HttpMessageNotReadableException,
  HttpRequestMethodNotSupportedException,
  HttpStatus,
  HandlerMethodValidationException,
  MethodArgumentNotValidException,
  MethodArgumentTypeMismatchException,
  MissingServletRequestParameterException,
  NoResourceFoundException,
  type RequestMappingSpec,
  Resource,
  ResponseEntity,
  ResponseStatusException,
  STREAMING,
  ServletRequestBindingException,
  type StreamingResponseBody,
  exceptionStatusOf,
  registeredAdvices,
  registeredControllers,
} from './spring-web.js'
import { CorsUtils, DefaultCorsProcessor } from './spring-web-cors.js'
import { OncePerRequestFilter, RequestDispatcher, ServletWebRequest, ShallowEtagHeaderFilter, dispatcherTypeOf, parseHttpDate, setDispatcherType } from './spring-web-filter.js'
import { type DataWithMediaType, ResponseBodyEmitter } from './spring-web-sse.js'
import { MappingJackson2XmlHttpMessageConverter } from './jackson-xml.js'
import { type HandlerInterceptor, InterceptorRegistry, MappedInterceptor, ResourceHandlerRegistry, type ResourceHandlerRegistration, WebMvcConfigurer, lookupStaticResource } from './spring-webmvc-config.js'
import { renderView } from './thymeleaf.js'
import { flushOutput, setContentLanguage } from './tomcat-output.js'
import { ConstraintViolationException, type LocaleTag, currentLocale, localeFromAcceptLanguage, validate, validateParameters, withLocale } from './validation-engine.js'

const logger = KotlinLogging.logger('org.springframework.web.servlet.DispatcherServlet')

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** `org.springframework.web.servlet.HandlerMapping` */
export const HandlerMapping = {
  BEST_MATCHING_HANDLER_ATTRIBUTE: 'org.springframework.web.servlet.HandlerMapping.bestMatchingHandler',
  BEST_MATCHING_PATTERN_ATTRIBUTE: 'org.springframework.web.servlet.HandlerMapping.bestMatchingPattern',
  PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE: 'org.springframework.web.servlet.HandlerMapping.pathWithinHandlerMapping',
  URI_TEMPLATE_VARIABLES_ATTRIBUTE: 'org.springframework.web.servlet.HandlerMapping.uriTemplateVariables',
  PRODUCIBLE_MEDIA_TYPES_ATTRIBUTE: 'org.springframework.web.servlet.HandlerMapping.producibleMediaTypes',
} as const

/**
 * Attribut de requête où la sécurité dépose le principal authentifié (objet passé aux arguments
 * `authenticationPrincipal()`). À défaut, `request.userPrincipal` est utilisé.
 */
export const PRINCIPAL_ATTRIBUTE = 'komga.principal'

/** `DefaultErrorAttributes.ERROR_INTERNAL_ATTRIBUTE` : exception vue par les HandlerExceptionResolver */
export const ERROR_ATTRIBUTE = 'org.springframework.boot.web.servlet.error.DefaultErrorAttributes.ERROR'

/** Multipart dépassant spring.servlet.multipart.max-request-size (posé par le serveur) */
export const MULTIPART_EXCEEDED_ATTRIBUTE = 'komga.multipart.sizeExceeded'

/** Raisons HTTP de `org.springframework.http.HttpStatus` */
const REASON_PHRASES: Record<number, string> = {
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  103: 'Early Hints',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',
  208: 'Already Reported',
  226: 'IM Used',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Requested range not satisfiable',
  417: 'Expectation Failed',
  418: "I'm a teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version not supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  509: 'Bandwidth Limit Exceeded',
  510: 'Not Extended',
  511: 'Network Authentication Required',
}

/** `HttpStatus.valueOf(code).getReasonPhrase()` ; null si le code est inconnu */
export function reasonPhrase(code: number): string | null {
  return REASON_PHRASES[code] ?? null
}

const HTTP_STATUS_NAMES: Record<number, string> = Object.fromEntries(
  HttpStatus.entries()
    .map((s) => [s.value, s.name] as const)
    .concat([[416, 'REQUESTED_RANGE_NOT_SATISFIABLE']]),
)

/** `HttpStatusCode.toString()` : `404 NOT_FOUND` */
export function httpStatusToString(code: number): string {
  const name = HTTP_STATUS_NAMES[code] ?? (REASON_PHRASES[code] ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  return name ? `${code} ${name}` : String(code)
}

function statusCodeOf(s: HttpStatus | number): number {
  return typeof s === 'number' ? s : s.value
}

// ---------------------------------------------------------------------------
// RequestContextHolder / Model / ProblemDetail
// ---------------------------------------------------------------------------

/** `ServletRequestAttributes` */
export class ServletRequestAttributes {
  constructor(
    readonly request: HttpServletRequest,
    readonly response: HttpServletResponse,
  ) {}
}

const requestContext = new AsyncLocalStorage<ServletRequestAttributes>()

/** `org.springframework.web.context.request.RequestContextHolder` */
export const RequestContextHolder = {
  getRequestAttributes(): ServletRequestAttributes | null {
    return requestContext.getStore() ?? null
  },
  currentRequestAttributes(): ServletRequestAttributes {
    const a = requestContext.getStore()
    if (!a) throw new IllegalStateException('No thread-bound request found')
    return a
  },
}

/**
 * `org.springframework.web.filter.RequestContextFilter` (OrderedRequestContextFilter de Spring Boot, ordre -105) :
 * RequestContextHolder et LocaleContextHolder pour toute la chaîne de filtres.
 */
export class RequestContextFilter extends OncePerRequestFilter {
  protected override shouldNotFilterAsyncDispatch(): boolean {
    return false
  }

  protected override shouldNotFilterErrorDispatch(): boolean {
    return false
  }

  protected async doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    const locale = localeFromAcceptLanguage(request.getHeader('accept-language'))
    await withLocale(locale, () => requestContext.run(new ServletRequestAttributes(request, response), () => filterChain.doFilter(request, response)))
  }
}

/** `org.springframework.ui.Model` (ExtendedModelMap) */
export class Model {
  readonly attributes = new Map<string, unknown>()
  addAttribute(name: string, value: unknown): this {
    this.attributes.set(name, value)
    return this
  }
  containsAttribute(name: string): boolean {
    return this.attributes.has(name)
  }
  getAttribute(name: string): unknown {
    return this.attributes.get(name) ?? null
  }
  asMap(): Map<string, unknown> {
    return this.attributes
  }
}

/** `org.springframework.web.servlet.ModelAndView` */
export class ModelAndView {
  constructor(
    readonly viewName: string | null,
    readonly model: Map<string, unknown> = new Map(),
    public status: number | null = null,
  ) {}
}

/** `org.springframework.http.ProblemDetail` */
export class ProblemDetail {
  type = 'about:blank'
  title: string | null = null
  detail: string | null = null
  instance: string | null = null
  properties: Map<string, unknown> | null = null

  constructor(public status: number) {}

  static forStatus(status: HttpStatus | number): ProblemDetail {
    return new ProblemDetail(statusCodeOf(status))
  }

  static forStatusAndDetail(status: HttpStatus | number, detail: string | null): ProblemDetail {
    const p = ProblemDetail.forStatus(status)
    p.detail = detail
    return p
  }

  setProperty(name: string, value: unknown): void {
    if (this.properties === null) this.properties = new Map()
    this.properties.set(name, value)
  }

  /** Représentation JSON (ProblemDetailJacksonMixin : title par défaut = raison du statut, champs nuls omis) */
  toJsonMap(): Map<string, unknown> {
    const m = new Map<string, unknown>()
    m.set('type', this.type)
    const title = this.title ?? reasonPhrase(this.status)
    if (title !== null) m.set('title', title)
    m.set('status', this.status)
    if (this.detail !== null) m.set('detail', this.detail)
    if (this.instance !== null) m.set('instance', this.instance)
    if (this.properties) for (const [k, v] of this.properties) m.set(k, v)
    return m
  }
}

// PORT: `MaxUploadSizeExceededException.getBody()` (ErrorResponse) : ajouté ici à la classe de port/servlet.ts
declare module './servlet.js' {
  interface MaxUploadSizeExceededException {
    readonly body: ProblemDetail
  }
}
const uploadBodies = new WeakMap<object, ProblemDetail>()
Object.defineProperty(MaxUploadSizeExceededException.prototype, 'body', {
  configurable: true,
  get(this: object) {
    let b = uploadBodies.get(this)
    if (!b) {
      b = ProblemDetail.forStatusAndDetail(413, 'Maximum upload size exceeded')
      uploadBodies.set(this, b)
    }
    return b
  },
})

// ---------------------------------------------------------------------------
// Exceptions (ErrorResponse : statut, détail, en-têtes)
// ---------------------------------------------------------------------------

type ErrorResponseInfo = { status: number; detail: string | null; headers: [string, string][] }
const errorResponses = new WeakMap<object, ErrorResponseInfo>()

function asErrorResponse<E extends object>(e: E, status: number, detail: string | null, headers: [string, string][] = []): E {
  errorResponses.set(e, { status, detail, headers })
  return e
}

/** `org.springframework.web.servlet.NoHandlerFoundException` */
export class NoHandlerFoundException extends Exception {
  constructor(
    readonly httpMethod: string,
    readonly requestURL: string,
  ) {
    super(`No endpoint ${httpMethod} ${requestURL}.`)
    asErrorResponse(this, 404, `No endpoint ${httpMethod} ${requestURL}.`)
  }
}

export class MissingPathVariableException extends ServletRequestBindingException {}
export class MissingRequestHeaderException extends ServletRequestBindingException {}
export class MissingRequestCookieException extends ServletRequestBindingException {}
export class UnsatisfiedServletRequestParameterException extends ServletRequestBindingException {}
export class MissingServletRequestPartException extends Exception {}
export class MultipartException extends RuntimeException {}
export class HttpMessageNotWritableException extends Exception {}
export class AsyncRequestTimeoutException extends RuntimeException {}
export class MethodArgumentConversionNotSupportedException extends Exception {}

// ---------------------------------------------------------------------------
// Hooks : sécurité des méthodes
// ---------------------------------------------------------------------------

/**
 * Évaluation de `@PreAuthorize` (fournie par la sécurité) : false -> AccessDeniedException("Access Denied").
 * Appelée après la résolution des arguments, avant l'appel de la méthode (proxy de sécurité).
 */
export type PreAuthorizeEvaluator = (expression: string, request: HttpServletRequest, handler: { bean: object; method: string }) => boolean | Promise<boolean>
let preAuthorizeEvaluator: PreAuthorizeEvaluator | null = null
export function setPreAuthorizeEvaluator(evaluator: PreAuthorizeEvaluator | null): void {
  preAuthorizeEvaluator = evaluator
}

// ---------------------------------------------------------------------------
// Conditions de correspondance
// ---------------------------------------------------------------------------

type NameValueExpr = { name: string; value: string | null; negated: boolean }

function parseNameValue(expression: string): NameValueExpr {
  const i = expression.indexOf('=')
  if (i === -1) {
    const negated = expression.startsWith('!')
    return { name: negated ? expression.slice(1) : expression, value: null, negated }
  }
  const negated = i > 0 && expression[i - 1] === '!'
  return { name: negated ? expression.slice(0, i - 1) : expression.slice(0, i), value: expression.slice(i + 1), negated }
}

type MediaExpr = { mediaType: ParsedMediaType; negated: boolean }

function parseMediaExpr(e: string): MediaExpr {
  const negated = e.startsWith('!')
  return { mediaType: ParsedMediaType.parse(negated ? e.slice(1) : e), negated }
}

type HandlerMethod = {
  bean: object
  method: string
  spec: HandlerSpec
  controller: ControllerSpec
  controllerType: object
  signature: string
}

type MappingInfo = {
  patterns: PathPattern[]
  methods: string[]
  params: NameValueExpr[]
  headers: NameValueExpr[]
  consumes: MediaExpr[]
  produces: MediaExpr[]
  bodyRequired: boolean
  handler: HandlerMethod
}

type Match = {
  info: MappingInfo
  patterns: PathPattern[]
  methods: string[]
  produces: MediaExpr[]
  consumes: MediaExpr[]
}

const EMPTY_PATTERNS: PathPattern[] = []
const parser = PathPatternParser.defaultInstance

function toArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}

/** Chemin dans l'application (brut, sans context-path ni X-Forwarded-Prefix) */
export function lookupPath(request: HttpServletRequest): string {
  let uri = request.requestURI
  const prefix = request.getHeader('x-forwarded-prefix')?.split(',')[0]?.trim().replace(/\/+$/, '') ?? ''
  const base = prefix + request.contextPath
  if (base && uri.startsWith(base)) uri = uri.slice(base.length)
  return uri || ''
}

function acceptedMediaTypes(request: HttpServletRequest): ParsedMediaType[] {
  const headers = request.getHeaders('accept')
  let list: ParsedMediaType[]
  try {
    list = ParsedMediaType.parseList(headers.length ? headers : null)
  } catch (e) {
    throw asErrorResponse(
      new HttpMediaTypeNotAcceptableException(`Could not parse 'Accept' header [${headers.join(', ')}]: ${(e as Error).message}`),
      406,
      `Could not parse 'Accept' header [${headers.join(', ')}]: ${(e as Error).message}`,
    )
  }
  if (list.length === 0) return [ParsedMediaType.ALL]
  sortBySpecificity(list)
  return list
}

function matchMethods(info: MappingInfo, request: HttpServletRequest): string[] | null {
  if (CorsUtils.isPreFlightRequest(request)) return info.methods.length ? info.methods : []
  const m = request.method
  if (info.methods.length === 0) return m === 'OPTIONS' && dispatcherTypeOf(request) !== 'ERROR' ? null : []
  if (info.methods.includes(m)) return [m]
  if (m === 'HEAD' && info.methods.includes('GET')) return ['GET']
  return null
}

function matchParams(exprs: NameValueExpr[], request: HttpServletRequest): boolean {
  const params = parameterMap(request)
  return exprs.every((e) => {
    const values = params.get(e.name)
    let match: boolean
    if (e.value === null) match = values !== undefined
    else match = values !== undefined && values.includes(e.value)
    return e.negated ? !match : match
  })
}

function matchHeaders(exprs: NameValueExpr[], request: HttpServletRequest): boolean {
  if (CorsUtils.isPreFlightRequest(request)) return true
  return exprs.every((e) => {
    const v = request.getHeader(e.name)
    const match = e.value === null ? v !== null : v !== null && v === e.value
    return e.negated ? !match : match
  })
}

function hasBody(request: HttpServletRequest): boolean {
  const cl = request.getHeader('content-length')
  const te = request.getHeader('transfer-encoding')
  return (te !== null && te.trim() !== '') || (cl !== null && cl.trim() !== '' && cl.trim() !== '0')
}

function matchConsumes(info: MappingInfo, request: HttpServletRequest): MediaExpr[] | null {
  if (CorsUtils.isPreFlightRequest(request)) return []
  if (info.consumes.length === 0) return []
  if (!hasBody(request) && !info.bodyRequired) return []
  let contentType: ParsedMediaType
  try {
    const ct = request.contentType
    contentType = ct ? ParsedMediaType.parse(ct) : ParsedMediaType.APPLICATION_OCTET_STREAM
  } catch {
    return null
  }
  const result = info.consumes.filter((e) => e.mediaType.includes(contentType) !== e.negated)
  return result.length ? result : null
}

function matchProduces(info: MappingInfo, request: HttpServletRequest): MediaExpr[] | null {
  if (CorsUtils.isPreFlightRequest(request)) return []
  if (info.produces.length === 0) return []
  let accepted: ParsedMediaType[]
  try {
    accepted = acceptedMediaTypes(request)
  } catch {
    return null
  }
  const result = info.produces.filter((e) => accepted.some((a) => e.mediaType.isCompatibleWith(a)) !== e.negated)
  if (result.length) return result
  return accepted.some((a) => a.isWildcardType && a.isWildcardSubtype) ? [] : null
}

function matchPatterns(info: MappingInfo, path: string): PathPattern[] | null {
  if (info.patterns.length === 0) return path === '' || path === '/' ? EMPTY_PATTERNS : null
  const container = PathContainer.parsePath(path)
  const m = info.patterns.filter((p) => p.matches(container))
  if (m.length === 0) return null
  return m.sort(PathPattern_SPECIFICITY)
}

function PathPattern_SPECIFICITY(a: PathPattern, b: PathPattern): number {
  return (a.constructor as unknown as { SPECIFICITY_COMPARATOR: (a: PathPattern, b: PathPattern) => number }).SPECIFICITY_COMPARATOR(a, b)
}

function getMatchingMapping(info: MappingInfo, request: HttpServletRequest, path: string): Match | null {
  const methods = matchMethods(info, request)
  if (methods === null) return null
  if (!matchParams(info.params, request)) return null
  if (!matchHeaders(info.headers, request)) return null
  const consumes = matchConsumes(info, request)
  if (consumes === null) return null
  const produces = matchProduces(info, request)
  if (produces === null) return null
  const patterns = matchPatterns(info, path)
  if (patterns === null) return null
  return { info, patterns, methods, produces, consumes }
}

function producesExpressionsToCompare(m: Match): ParsedMediaType[] {
  return m.produces.length ? m.produces.map((e) => e.mediaType) : [ParsedMediaType.ALL]
}

function compareProduces(a: Match, b: Match, request: HttpServletRequest): number {
  const accepted = acceptedMediaTypes(request)
  const ea = producesExpressionsToCompare(a)
  const eb = producesExpressionsToCompare(b)
  const indexOfEqual = (list: ParsedMediaType[], mt: ParsedMediaType) => list.findIndex((x) => x.type === mt.type && x.subtype === mt.subtype)
  const indexOfIncluded = (list: ParsedMediaType[], mt: ParsedMediaType) => list.findIndex((x) => mt.includes(x))
  const compareMatching = (i1: number, i2: number, l1: ParsedMediaType[], l2: ParsedMediaType[]) => {
    if (i1 !== i2) return i2 - i1
    if (i1 !== -1) {
      const m1 = l1[i1] as ParsedMediaType
      const m2 = l2[i2] as ParsedMediaType
      if (m1.isMoreSpecific(m2)) return -1
      if (m2.isMoreSpecific(m1)) return 1
    }
    return 0
  }
  for (const acc of accepted) {
    let r = compareMatching(indexOfEqual(ea, acc), indexOfEqual(eb, acc), ea, eb)
    if (r !== 0) return r
    r = compareMatching(indexOfIncluded(ea, acc), indexOfIncluded(eb, acc), ea, eb)
    if (r !== 0) return r
  }
  return 0
}

function compareMethods(a: string[], b: string[]): number {
  if (a.length !== b.length) return b.length - a.length
  if (a.length === 1) {
    if (a.includes('HEAD') && b.includes('GET')) return -1
    if (a.includes('GET') && b.includes('HEAD')) return 1
  }
  return 0
}

/** `RequestMappingInfo.compareTo` */
function compareMatches(a: Match, b: Match, request: HttpServletRequest): number {
  if (request.method === 'HEAD') {
    const r = compareMethods(a.methods, b.methods)
    if (r !== 0) return r
  }
  const pa = a.patterns
  const pb = b.patterns
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const r = PathPattern_SPECIFICITY(pa[i] as PathPattern, pb[i] as PathPattern)
    if (r !== 0) return r
  }
  if (pa.length !== pb.length) return pa.length > pb.length ? -1 : 1
  let r = b.info.params.length - a.info.params.length
  if (r !== 0) return r
  r = b.info.headers.length - a.info.headers.length
  if (r !== 0) return r
  if (a.consumes.length === 0 && b.consumes.length > 0) return 1
  if (a.consumes.length > 0 && b.consumes.length === 0) return -1
  if (a.consumes.length > 0 && b.consumes.length > 0) {
    const ca = (a.consumes[0] as MediaExpr).mediaType
    const cb = (b.consumes[0] as MediaExpr).mediaType
    if (ca.isMoreSpecific(cb)) return -1
    if (cb.isMoreSpecific(ca)) return 1
  }
  r = compareProduces(a, b, request)
  if (r !== 0) return r
  return compareMethods(a.methods, b.methods)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type Handler =
  | { kind: 'method'; hm: HandlerMethod; match: Match }
  | { kind: 'options'; allow: string[]; acceptPatch: string[] }
  | { kind: 'preflight' }
  | { kind: 'resource'; registration: ResourceHandlerRegistration; path: string }

/** Échappement HTML de Spring (HtmlUtils.htmlEscape) */
function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

const JAVA_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const JAVA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `java.util.Date.toString()` : `Mon Sep 28 13:36:00 CEST 2026` dans le fuseau par défaut */
export function javaDateToString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const zone = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName')?.value ?? 'GMT'
  return `${JAVA_DAYS[d.getDay()]} ${JAVA_MONTHS[d.getMonth()]} ${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${zone === 'UTC' ? 'UTC' : zone} ${d.getFullYear()}`
}

/** Horodatage JSON de Jackson pour java.util.Date (StdDateFormat, UTC) */
export function jacksonDate(d: Date): string {
  return d.toISOString().replace('Z', '+00:00')
}

/** `BasicErrorController` (server.error.include-message=always) */
class BasicErrorController {
  errorHtml(request: HttpServletRequest, response: HttpServletResponse): ModelAndView {
    const status = errorStatus(request)
    const model = errorAttributes(request)
    response.setStatus(status)
    return new ModelAndView('error', model)
  }

  error(request: HttpServletRequest): ResponseEntity<Map<string, unknown>> {
    const status = errorStatus(request)
    if (status === 204) return new ResponseEntity<Map<string, unknown>>(null, new HttpHeaders(), status)
    const body = errorAttributes(request)
    body.set('timestamp', jacksonDate(body.get('timestamp') as Date))
    return new ResponseEntity(body, new HttpHeaders(), status)
  }

  mediaTypeNotAcceptable(request: HttpServletRequest): ResponseEntity<string> {
    return new ResponseEntity<string>(null, new HttpHeaders(), errorStatus(request))
  }
}

function errorStatus(request: HttpServletRequest): number {
  const code = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) as number | null
  if (code === null) return 500
  return reasonPhrase(code) !== null ? code : 500
}

function unwrapServletException(e: unknown): unknown {
  return e
}

/** `DefaultErrorAttributes.getErrorAttributes` : timestamp, status, error, message, path */
export function errorAttributes(request: HttpServletRequest): Map<string, unknown> {
  const m = new Map<string, unknown>()
  m.set('timestamp', new Date())
  const status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) as number | null
  if (status === null) {
    m.set('status', 999)
    m.set('error', 'None')
  } else {
    m.set('status', status)
    m.set('error', reasonPhrase(status) ?? `Http Status ${status}`)
  }
  const error = unwrapServletException(request.getAttribute(ERROR_ATTRIBUTE) ?? request.getAttribute(RequestDispatcher.ERROR_EXCEPTION))
  if (error instanceof MethodArgumentNotValidException) {
    const br = error.bindingResult
    m.set('message', `Validation failed for object='${br.objectName}'. Error count: ${br.errorCount}`)
  } else if (error instanceof HandlerMethodValidationException && error.method !== null) {
    // addMessageAndErrorsFromMethodValidationResult
    m.set('message', `Validation failed for method='${error.method}'. Error count: ${error.objectErrorCount}`)
  } else {
    const attr = request.getAttribute(RequestDispatcher.ERROR_MESSAGE)
    if (attr !== null && attr !== '') m.set('message', String(attr))
    else if (error instanceof Error && error.message) m.set('message', error.message)
    else m.set('message', 'No message available')
  }
  const path = request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI)
  if (path !== null) m.set('path', path)
  return m
}

/** Vue « error » par défaut de Spring Boot (ErrorMvcAutoConfiguration.StaticView) */
function whitelabelHtml(model: Map<string, unknown>): string {
  const timestamp = model.get('timestamp') as Date
  const message = model.get('message')
  let b =
    '<html><body><h1>Whitelabel Error Page</h1><p>This application has no explicit mapping for /error, so you are seeing this as a fallback.</p>' +
    `<div id='created'>${javaDateToString(timestamp)}</div>` +
    `<div>There was an unexpected error (type=${htmlEscape(String(model.get('error')))}, status=${htmlEscape(String(model.get('status')))}).</div>`
  if (message !== null && message !== undefined) b += `<div>${htmlEscape(String(message))}</div>`
  b += '</body></html>'
  return b
}

// ---------------------------------------------------------------------------
// Conversion des paramètres (ConversionService)
// ---------------------------------------------------------------------------

class ConversionError extends Exception {}

function unwrapType(t: JavaType): { type: JavaType; nullable: boolean } {
  if (typeof t === 'object' && 'nullable' in t) return { type: t.nullable, nullable: true }
  return { type: t, nullable: false }
}

const SCALAR_JAVA_NAMES: Record<string, string> = {
  LocalDateTime: 'java.time.LocalDateTime',
  LocalDate: 'java.time.LocalDate',
  ZonedDateTime: 'java.time.ZonedDateTime',
  Instant: 'java.time.Instant',
  Duration: 'java.time.Duration',
  URL: 'java.net.URL',
  URI: 'java.net.URI',
  ByteArray: 'byte[]',
}

/** Nom Java d'un type (messages de Spring) : `java.lang.String`, `int`, `java.lang.Boolean`, `java.util.List`… */
export function javaTypeName(t: JavaType, nullable = false): string {
  const u = unwrapType(t)
  const n = nullable || u.nullable
  const type = u.type
  switch (type) {
    case 'String':
      return 'java.lang.String'
    case 'Boolean':
      return n ? 'java.lang.Boolean' : 'boolean'
    case 'Int':
      return n ? 'java.lang.Integer' : 'int'
    case 'Long':
      return n ? 'java.lang.Long' : 'long'
    case 'Float':
      return n ? 'java.lang.Float' : 'float'
    case 'Double':
      return n ? 'java.lang.Double' : 'double'
    case 'Number':
      return 'java.lang.Number'
    case 'Any':
      return 'java.lang.Object'
  }
  if (typeof type === 'object') {
    if ('list' in type) return 'java.util.List'
    if ('set' in type) return 'java.util.Set'
    if ('map' in type) return 'java.util.Map'
    if ('enum' in type) return qualifiedNameOf(type.enum) ?? (type.enum as unknown as { name: string }).name
    if ('class' in type) return qualifiedNameOf(type.class) ?? (type.class as { name?: string }).name ?? 'java.lang.Object'
    if ('scalar' in type) return SCALAR_JAVA_NAMES[type.scalar] ?? type.scalar
  }
  return 'java.lang.Object'
}

/** `Class.getSimpleName()` (messages « for method parameter type X ») */
function javaSimpleName(t: JavaType, nullable = false): string {
  const n = javaTypeName(t, nullable)
  return n.slice(n.lastIndexOf('.') + 1).replace(/^.*\$/, '')
}

function canonicalEnumName(e: object): string {
  return (qualifiedNameOf(e) ?? (e as { name: string }).name).replaceAll('$', '.')
}

function parseJavaInteger(s: string, bits: 32 | 64): number {
  const t = s.replace(/\s+/g, '')
  let v: bigint
  const hex = /^([+-]?)(?:0x|0X|#)([0-9a-fA-F]+)$/.exec(t)
  const oct = /^([+-]?)0([0-7]+)$/.exec(t)
  if (hex) v = BigInt(`${hex[1] === '-' ? '-' : ''}0x${hex[2]}`)
  else if (oct && oct[2]) v = BigInt(`${oct[1] === '-' ? '-' : ''}0o${oct[2]}`)
  else if (/^[+-]?\d+$/.test(t)) v = BigInt(t)
  else throw new ConversionError(`For input string: "${t}"`)
  const max = bits === 32 ? 2147483647n : 9223372036854775807n
  if (v > max || v < -max - 1n) throw new ConversionError(`For input string: "${t}"${bits === 32 && hex ? '' : ''}`)
  return Number(v)
}

/** Conversion d'une chaîne vers un type simple ; null pour une chaîne vide (convertisseurs de Spring) */
function convertScalar(source: string, type: JavaType): unknown {
  switch (type) {
    case 'String':
    case 'Any':
      return source
    case 'Boolean': {
      const value = source.trim()
      if (value === '') return null
      const v = value.toLowerCase()
      if (['true', 'on', 'yes', '1'].includes(v)) return true
      if (['false', 'off', 'no', '0'].includes(v)) return false
      throw new ConversionError(`Invalid boolean value [${source}]`)
    }
    case 'Int':
    case 'Long':
      if (source.trim() === '') return null
      return parseJavaInteger(source, type === 'Int' ? 32 : 64)
    case 'Float':
    case 'Double':
    case 'Number': {
      const t = source.trim()
      if (t === '') return null
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?$/.test(t)) throw new ConversionError(`For input string: "${t}"`)
      const n = Number(t.replace(/[fFdD]$/, ''))
      return type === 'Float' ? Math.fround(n) : n
    }
  }
  if (typeof type === 'object') {
    if ('enum' in type) {
      const t = source.trim()
      if (t === '') return null
      const e = type.enum.entries().find((x) => x.name === t)
      if (!e) throw new ConversionError(`No enum constant ${canonicalEnumName(type.enum)}.${t}`)
      return e
    }
    if ('scalar' in type) {
      if (source.trim() === '') return null
      try {
        return type.read(source.trim())
      } catch (e) {
        throw new ConversionError((e as Error).message)
      }
    }
    if ('nullable' in type) return convertScalar(source, type.nullable)
  }
  return source
}

type ConversionContext = { name: string; annotation: string; nullable: boolean }

/** `WebDataBinder.convertIfNecessary` : MethodArgumentTypeMismatchException en cas d'échec */
function convertArgument(raw: string | string[] | null, declared: JavaType, ctx: ConversionContext): unknown {
  if (raw === null) return null
  const { type, nullable } = unwrapType(declared)
  const isNullable = nullable || ctx.nullable
  const valueType = Array.isArray(raw) ? 'java.lang.String[]' : 'java.lang.String'
  const fail = (cause: string) =>
    new MethodArgumentTypeMismatchException(
      `Method parameter '${ctx.name}': Failed to convert value of type '${valueType}' to required type '${javaTypeName(declared, isNullable)}'; ${cause}`,
    )
  if (typeof type === 'object' && ('list' in type || 'set' in type)) {
    const el = 'list' in type ? type.list : type.set
    const elements = Array.isArray(raw)
      ? raw
      : raw
          .split(',')
          .map((s) => s.trim())
          .filter((_s, i, a) => !(a.length === 1 && a[0] === ''))
    const out: unknown[] = []
    for (const e of elements) {
      try {
        out.push(convertScalar(Array.isArray(raw) ? e : e.trim(), el))
      } catch (err) {
        if (!(err instanceof ConversionError)) throw err
        throw fail(`Failed to convert from type [java.lang.String] to type [@${ctx.annotation} ${javaTypeName(el, true)}] for value [${e}]`)
      }
    }
    return 'set' in type ? new Set(out) : out
  }
  const single = Array.isArray(raw) ? (raw.length === 1 ? (raw[0] as string) : raw.join(',')) : raw
  try {
    return convertScalar(single, type)
  } catch (err) {
    if (!(err instanceof ConversionError)) throw err
    // enum : StringToEnumConverterFactory via le ConversionService -> ConversionFailedException (relevé sur Komga :
    // GET /api/v2/tags?include=FOO)
    if (typeof type === 'object' && 'enum' in type)
      throw fail(`Failed to convert from type [java.lang.String] to type [@${ctx.annotation} ${javaTypeName(type, true)}] for value [${single}]`)
    throw fail(err.message)
  }
}

// ---------------------------------------------------------------------------
// Ranges (HttpRange / ResourceRegion)
// ---------------------------------------------------------------------------

type ResourceRegion = { start: number; count: number }

function parseLong(s: string): number {
  if (!/^[+-]?\d+$/.test(s)) throw new IllegalArgumentException(`For input string: "${s}"`)
  return Number(s)
}

/** `HttpRange.parseRanges` + `toResourceRegions` */
function toResourceRegions(header: string, length: number): ResourceRegion[] {
  if (!header) return []
  if (!header.startsWith('bytes=')) throw new IllegalArgumentException(`Range '${header}' does not start with 'bytes='`)
  const tokens = header
    .slice(6)
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t)
  if (tokens.length > 100) throw new IllegalArgumentException(`Too many ranges: ${tokens.length}`)
  const regions = tokens.map((range) => {
    const dashIdx = range.indexOf('-')
    let start: number
    let end: number
    if (dashIdx > 0) {
      const firstPos = parseLong(range.slice(0, dashIdx))
      const lastPos = dashIdx < range.length - 1 ? parseLong(range.slice(dashIdx + 1)) : null
      if (firstPos < 0) throw new IllegalArgumentException(`Invalid first byte position: ${firstPos}`)
      if (lastPos !== null && lastPos < firstPos) throw new IllegalArgumentException(`firstBytePosition=${firstPos} should be less then or equal to lastBytePosition=${lastPos}`)
      start = firstPos
      end = lastPos !== null && lastPos < length ? lastPos : length - 1
    } else if (dashIdx === 0) {
      const suffixLength = parseLong(range.slice(1))
      if (suffixLength < 0) throw new IllegalArgumentException(`Invalid suffix length: ${suffixLength}`)
      start = suffixLength < length ? length - suffixLength : 0
      end = length - 1
    } else throw new IllegalArgumentException(`Range '${range}' does not contain "-"`)
    if (!(start < length)) throw new IllegalArgumentException(`'position' exceeds the resource length ${length}`)
    return { start, count: end - start + 1 }
  })
  if (regions.length > 1) {
    const total = regions.reduce((s, r) => s + r.count, 0)
    if (total >= length) throw new IllegalArgumentException(`The sum of all ranges (${total}) should be less than the resource length (${length})`)
  }
  return regions
}

const BOUNDARY_CHARS = '-_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** `MimeTypeUtils.generateMultipartBoundaryString` */
function generateMultipartBoundary(): string {
  const len = randomInt(30, 41)
  let s = ''
  for (let i = 0; i < len; i++) s += BOUNDARY_CHARS[randomInt(0, BOUNDARY_CHARS.length)]
  return s
}

async function pipeTo(input: Readable, out: Writable): Promise<void> {
  for await (const chunk of input) {
    if (!out.write(chunk as Buffer)) await new Promise<void>((r) => out.once('drain', r))
  }
}

// ---------------------------------------------------------------------------
// Négociation de contenu et écriture
// ---------------------------------------------------------------------------

type BodyKind = 'bytes' | 'string' | 'resource' | 'problem' | 'json'

function bodyKind(value: unknown): BodyKind {
  if (value instanceof Uint8Array) return 'bytes'
  if (typeof value === 'string') return 'string'
  if (value instanceof Resource) return 'resource'
  if (value instanceof ProblemDetail) return 'problem'
  return 'json'
}

const JSON_TYPES = [ParsedMediaType.APPLICATION_JSON, ParsedMediaType.parse('application/*+json')]
/** MappingJackson2XmlHttpMessageConverter (bean de Komga, OPDS v1) */
const XML_TYPES = [ParsedMediaType.parse('application/xml;charset=UTF-8'), ParsedMediaType.parse('text/xml;charset=UTF-8'), ParsedMediaType.parse('application/*+xml;charset=UTF-8')]
const XML_PROBLEM_TYPES = [ParsedMediaType.parse('application/problem+xml')]

/** Écriture XML fournie par le bean MappingJackson2XmlHttpMessageConverter (XmlMapper.writeValueAsString) */
type XmlWriter = (value: unknown, type?: JavaType) => Uint8Array

/** Types produits par les convertisseurs de Spring Boot pour une classe de valeur (ordre de HttpMessageConverters) */
function converterMediaTypes(kind: BodyKind, xml: boolean): ParsedMediaType[] {
  switch (kind) {
    case 'bytes':
      return [ParsedMediaType.APPLICATION_OCTET_STREAM, ParsedMediaType.ALL]
    case 'string':
      return [ParsedMediaType.TEXT_PLAIN, ParsedMediaType.ALL, ...JSON_TYPES, ...(xml ? XML_TYPES : [])]
    case 'resource':
      return [ParsedMediaType.ALL]
    case 'problem':
      return [ParsedMediaType.APPLICATION_PROBLEM_JSON, ...(xml ? XML_PROBLEM_TYPES : [])]
    default:
      return [...JSON_TYPES, ...(xml ? XML_TYPES : [])]
  }
}

function isXmlType(mt: ParsedMediaType): boolean {
  return XML_TYPES.some((x) => x.isCompatibleWith(mt)) || (mt.type === 'application' && mt.subtype === 'problem+xml')
}

function canWrite(kind: BodyKind, mt: ParsedMediaType, xml: boolean): boolean {
  return converterMediaTypes(kind, xml).some((s) => s.isCompatibleWith(mt)) || (kind === 'problem' && [...JSON_TYPES, ...(xml ? XML_TYPES : [])].some((s) => s.isCompatibleWith(mt)))
}

function mostSpecific(accept: ParsedMediaType, produce: ParsedMediaType): ParsedMediaType {
  const p = produce.copyQualityValue(accept)
  // MimeTypeUtils.SPECIFICITY_COMPARATOR : le plus spécifique d'abord
  if (accept.isMoreSpecific(p)) return accept
  if (p.isMoreSpecific(accept)) return p
  return accept
}

const SAFE_EXTENSIONS = new Set(['txt', 'text', 'yml', 'properties', 'csv', 'json', 'xml', 'atom', 'rss', 'png', 'jpe', 'jpeg', 'jpg', 'gif', 'wbmp', 'bmp'])

function extensionOf(filename: string): string | null {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return null
  const sep = filename.lastIndexOf('/')
  if (sep > dot) return null
  return filename.slice(dot + 1)
}

function safeExtension(request: HttpServletRequest, extension: string | null): boolean {
  if (!extension) return true
  const ext = extension.toLowerCase()
  if (SAFE_EXTENSIONS.has(ext)) return true
  const pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) as string | null
  if (pattern !== null && pattern.endsWith(`.${ext}`)) return true
  if (ext === 'html') {
    const mediaTypes = request.getAttribute(HandlerMapping.PRODUCIBLE_MEDIA_TYPES_ATTRIBUTE) as ParsedMediaType[] | null
    if (mediaTypes && mediaTypes.some((m) => m.type === 'text' && m.subtype === 'html')) return true
  }
  const mt = mediaTypeForFilename(`file.${ext}`)
  return mt !== null && (['audio', 'image', 'video'].includes(mt.type) || mt.subtype.endsWith('+xml'))
}

function originatingRequestUri(request: HttpServletRequest): string {
  return (request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI) as string | null) ?? (request.getAttribute(RequestDispatcher.FORWARD_REQUEST_URI) as string | null) ?? request.requestURI
}

/** `AbstractMessageConverterMethodProcessor.addContentDispositionHeader` (protection RFD) */
function addContentDispositionHeader(request: HttpServletRequest, response: HttpServletResponse): void {
  if (response.containsHeader('Content-Disposition')) return
  const status = response.status
  if (status < 200 || (status > 299 && status < 400)) return
  const requestUri = originatingRequestUri(request)
  let filename = requestUri.slice(requestUri.lastIndexOf('/') + 1)
  let pathParams = ''
  const semi = filename.indexOf(';')
  if (semi !== -1) {
    pathParams = filename.slice(semi)
    filename = filename.slice(0, semi)
  }
  let decoded = filename
  try {
    decoded = decodeURIComponent(filename)
  } catch {
    // tel quel
  }
  const ext = extensionOf(decoded)
  const extInPathParams = extensionOf(pathParams)
  if (!safeExtension(request, ext) || !safeExtension(request, extInPathParams)) response.addHeader('Content-Disposition', 'inline;filename=f.txt')
}

// ---------------------------------------------------------------------------
// DispatcherServlet
// ---------------------------------------------------------------------------

export type DispatcherOptions = {
  /** spring.servlet.multipart.max-file-size (octets) */
  maxFileSize?: number
  /** spring.servlet.multipart.max-request-size (octets) */
  maxRequestSize?: number
  /** spring.mvc.async.request-timeout (ms) */
  asyncRequestTimeout?: number
  /** server.error.path */
  errorPath?: string
  /** spring.thymeleaf.prefix (Komga : classpath:/public/) */
  templatePrefix?: string
}

type ForwardFn = (request: HttpServletRequest, response: HttpServletResponse, path: string) => Promise<void>

type AdviceHandler = { bean: object; method: string; spec: ExceptionHandlerSpec; rest: boolean; exceptions: (abstract new (...a: never[]) => unknown)[] }

type ArgContext = {
  request: HttpServletRequest
  response: HttpServletResponse
  handler: HandlerMethod | null
  exception: unknown
  model: Model
  uriVariables: Map<string, string>
}

/** Requête d'un dispatch interne (forward, erreur) : chemin remplacé */
class DispatchRequestWrapper extends HttpServletRequestWrapper {
  declare private readonly dispatchPath: string

  constructor(request: HttpServletRequest, dispatchPath: string) {
    super(request)
    Object.defineProperty(this, 'dispatchPath', { value: dispatchPath })
  }

  override get requestURI(): string {
    return this.getRequest().contextPath + this.dispatchPath
  }

  override get servletPath(): string {
    return this.dispatchPath
  }
}

/** Crée la requête d'un dispatch interne (`RequestDispatcher.forward` / page d'erreur) */
export function dispatchRequest(request: HttpServletRequest, path: string, type: 'FORWARD' | 'ERROR'): HttpServletRequest {
  const r = new DispatchRequestWrapper(request, path)
  setDispatcherType(r, type)
  return r
}

const ERROR_CONTROLLER_SPEC: ControllerSpec = {
  rest: false,
  handlers: {
    errorHtml: { mapping: { produces: ['text/html'] }, args: [{ kind: 'request' }, { kind: 'response' }] },
    error: { mapping: {}, args: [{ kind: 'request' }] },
  },
  exceptionHandlers: { mediaTypeNotAcceptable: { exceptions: [HttpMediaTypeNotAcceptableException], args: [{ kind: 'request' }] } },
  javaName: 'org.springframework.boot.autoconfigure.web.servlet.error.BasicErrorController',
}

export class DispatcherServlet {
  private mappings: MappingInfo[] | null = null
  private resourceRegistry = new ResourceHandlerRegistry()
  private resourcePatterns: { pattern: PathPattern; registration: ResourceHandlerRegistration; literal: boolean }[] = []
  private interceptors: HandlerInterceptor[] = []
  private argumentResolvers: HandlerMethodArgumentResolver[] = []
  private adviceHandlers: AdviceHandler[] = []
  private objectMapper: ObjectMapper = new ObjectMapper()
  private xmlWriter: XmlWriter | null = null
  private readonly corsProcessor = new DefaultCorsProcessor()
  private readonly maxFileSize: number
  private readonly maxRequestSize: number
  private readonly asyncRequestTimeout: number
  private readonly errorPath: string
  private readonly templatePrefix: string
  /** Forward vers un autre chemin (défini par le serveur pour passer par les filtres FORWARD) */
  forward: ForwardFn

  constructor(
    private readonly ctx: ApplicationContext | null,
    opts: DispatcherOptions = {},
  ) {
    this.maxFileSize = opts.maxFileSize ?? 1024 * 1024
    this.maxRequestSize = opts.maxRequestSize ?? 10 * 1024 * 1024
    this.asyncRequestTimeout = opts.asyncRequestTimeout ?? 3600_000
    this.errorPath = opts.errorPath ?? '/error'
    this.templatePrefix = opts.templatePrefix ?? 'classpath:/templates/'
    this.forward = async (request, response, path) => {
      await this.service(dispatchRequest(request, path, 'FORWARD'), response)
    }
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  private init(): MappingInfo[] {
    if (this.mappings) return this.mappings
    const ctx = this.ctx
    if (ctx) {
      try {
        this.objectMapper = ctx.getBean(ObjectMapper)
      } catch {
        // ObjectMapper par défaut
      }
      // MappingJackson2XmlHttpMessageConverter : actif si son XmlMapper sait écrire
      const xmlConverter = ctx.getBeansOfType(MappingJackson2XmlHttpMessageConverter)[0]
      const xmlMapper = xmlConverter?.objectMapper as unknown as { writeValueAsBytes?: XmlWriter; writeValueAsString?: (v: unknown, t?: JavaType) => string } | undefined
      if (xmlMapper?.writeValueAsBytes) this.xmlWriter = (v, t) => (xmlMapper.writeValueAsBytes as XmlWriter).call(xmlMapper, v, t)
      else if (xmlMapper?.writeValueAsString) this.xmlWriter = (v, t) => Buffer.from((xmlMapper.writeValueAsString as (v: unknown, t?: JavaType) => string).call(xmlMapper, v, t), 'utf8')
    }
    const configurers = ctx ? ctx.getBeansOfType(WebMvcConfigurer as never) as WebMvcConfigurer[] : []
    const interceptorRegistry = new InterceptorRegistry()
    for (const c of configurers) {
      c.addResourceHandlers(this.resourceRegistry)
      c.addInterceptors(interceptorRegistry)
      c.addArgumentResolvers(this.argumentResolvers)
    }
    this.interceptors = interceptorRegistry.getInterceptors()
    for (const r of this.resourceRegistry.registrations)
      for (const p of r.pathPatterns) {
        const pattern = parser.parse(parser.initFullPathPattern(p))
        this.resourcePatterns.push({ pattern, registration: r, literal: !pattern.hasPatternSyntax() })
      }
    const mappings: MappingInfo[] = []
    for (const reg of registeredControllers()) {
      if (!ctx) continue
      let bean: object
      try {
        bean = ctx.getBean(reg.type as never) as object
      } catch {
        // contrôleur inactif (profil / condition)
        continue
      }
      this.registerController(mappings, bean, reg.type, reg.spec)
    }
    this.registerController(mappings, new BasicErrorController(), BasicErrorController, { ...ERROR_CONTROLLER_SPEC, requestMapping: { path: [this.errorPath] } })
    const advices = [...registeredAdvices()].map((a, i) => ({ a, i })).sort((x, y) => (x.a.order ?? 2147483647) - (y.a.order ?? 2147483647) || x.i - y.i)
    for (const { a } of advices) {
      if (!ctx) continue
      let bean: object
      try {
        bean = ctx.getBean(a.type as never) as object
      } catch {
        continue
      }
      for (const [method, spec] of Object.entries(a.handlers)) this.adviceHandlers.push({ bean, method, spec, rest: a.rest ?? true, exceptions: spec.exceptions })
    }
    this.mappings = mappings
    return mappings
  }

  private registerController(mappings: MappingInfo[], bean: object, type: object, spec: ControllerSpec): void {
    const cls = spec.requestMapping ?? {}
    const javaName = spec.javaName ?? `${(type as { name: string }).name}`
    for (const [method, hs] of Object.entries(spec.handlers)) {
      const m: RequestMappingSpec = hs.mapping
      const classPaths = (cls.path ?? []).map((p) => parser.parse(parser.initFullPathPattern(p)))
      const methodPaths = (m.path ?? []).map((p) => parser.parse(parser.initFullPathPattern(p)))
      let patterns: PathPattern[]
      if (classPaths.length === 0) patterns = methodPaths
      else if (methodPaths.length === 0) patterns = classPaths
      else patterns = classPaths.flatMap((c) => methodPaths.map((mp) => c.combine(mp)))
      const headerExprs = [...(cls.headers ?? []), ...(m.headers ?? [])].map(parseNameValue)
      const producesFromHeaders = headerExprs.filter((h) => h.name.toLowerCase() === 'accept' && h.value !== null).map((h) => h.value as string)
      const consumesFromHeaders = headerExprs.filter((h) => h.name.toLowerCase() === 'content-type' && h.value !== null).map((h) => h.value as string)
      const produces = (m.produces?.length ? m.produces : (cls.produces ?? [])).concat(producesFromHeaders)
      const consumes = (m.consumes?.length ? m.consumes : (cls.consumes ?? [])).concat(consumesFromHeaders)
      const bodyArg = (hs.args ?? []).find((a) => a.kind === 'requestBody') as { required: boolean } | undefined
      const hm: HandlerMethod = {
        bean,
        method,
        spec: hs,
        controller: spec,
        controllerType: type,
        signature: hs.signature ?? `public ${javaName}.${method}()`,
      }
      mappings.push({
        patterns,
        methods: [...new Set([...toArray(cls.method), ...toArray(m.method)])],
        params: [...(cls.params ?? []), ...(m.params ?? [])].map(parseNameValue),
        headers: headerExprs.filter((h) => !['accept', 'content-type'].includes(h.name.toLowerCase())),
        consumes: consumes.flatMap((c) => c.split(',')).map((c) => parseMediaExpr(c.trim())),
        produces: produces.flatMap((c) => c.split(',')).map((c) => parseMediaExpr(c.trim())),
        bodyRequired: bodyArg ? bodyArg.required : true,
        handler: hm,
      })
    }
  }

  /**
   * `HandlerMappingIntrospector.getCorsConfiguration` (source CORS utilisée par Spring Security quand aucun bean
   * corsConfigurationSource n'existe) : Komga ne déclare ni @CrossOrigin ni addCorsMappings, donc toujours null.
   */
  getCorsConfiguration(_request: HttpServletRequest): null {
    return null
  }

  // -------------------------------------------------------------------------
  // Service
  // -------------------------------------------------------------------------

  /** `FrameworkServlet.service` : contexte de locale et de requête, puis doDispatch */
  async service(request: HttpServletRequest, response: HttpServletResponse): Promise<void> {
    this.init()
    const locale = localeFromAcceptLanguage(request.getHeader('accept-language'))
    await withLocale(locale, () => requestContext.run(new ServletRequestAttributes(request, response), () => this.doDispatch(request, response)))
  }

  private async doDispatch(request: HttpServletRequest, response: HttpServletResponse): Promise<void> {
    let handler: Handler | null = null
    let mv: ModelAndView | null = null
    let dispatchException: unknown = null
    const chain: HandlerInterceptor[] = []
    try {
      this.checkMultipart(request)
      handler = this.getHandler(request)
      if (handler === null) throw new NoHandlerFoundException(request.method, request.requestURI)
      if (handler.kind !== 'preflight') for (const i of this.interceptors) if (!(i instanceof MappedInterceptor) || i.matches(request)) chain.push(i instanceof MappedInterceptor ? i.interceptor : i)
      for (const i of chain) if (i.preHandle && !(await i.preHandle(request, response, handler))) return
      mv = await this.handle(request, response, handler)
      for (const i of [...chain].reverse()) i.postHandle?.(request, response, handler)
    } catch (e) {
      dispatchException = e
    }
    await this.processDispatchResult(request, response, handler, mv, dispatchException)
    for (const i of [...chain].reverse()) i.afterCompletion?.(request, response, handler, dispatchException)
  }

  /** `checkMultipart` : taille maximale des fichiers et de la requête */
  private checkMultipart(request: HttpServletRequest): void {
    const ct = request.contentType
    if (!ct || !ct.toLowerCase().startsWith('multipart/')) return
    if (request.getAttribute(MULTIPART_EXCEEDED_ATTRIBUTE) !== null || request.body.length > this.maxRequestSize)
      throw asErrorResponse(new MaxUploadSizeExceededException(`Maximum upload size of ${this.maxRequestSize} bytes exceeded`), 413, 'Maximum upload size exceeded')
    for (const files of request.parts.values())
      for (const f of files)
        if (f.size > this.maxFileSize) throw asErrorResponse(new MaxUploadSizeExceededException(`Maximum upload size exceeded`), 413, 'Maximum upload size exceeded')
  }

  // -------------------------------------------------------------------------
  // Correspondance
  // -------------------------------------------------------------------------

  private getHandler(request: HttpServletRequest): Handler | null {
    const mappings = this.init()
    const path = lookupPath(request)
    const matches: Match[] = []
    for (const info of mappings) {
      const m = getMatchingMapping(info, request, path)
      if (m) matches.push(m)
    }
    if (matches.length > 0) {
      let best = matches[0] as Match
      if (matches.length > 1) {
        matches.sort((a, b) => compareMatches(a, b, request))
        best = matches[0] as Match
        if (CorsUtils.isPreFlightRequest(request)) return { kind: 'preflight' }
        const second = matches[1] as Match
        if (compareMatches(best, second, request) === 0)
          throw new IllegalStateException(
            `Ambiguous handler methods mapped for '${path}': {${best.info.handler.signature}, ${second.info.handler.signature}}`,
          )
      } else if (CorsUtils.isPreFlightRequest(request)) return { kind: 'preflight' }
      this.handleMatch(best, path, request)
      return { kind: 'method', hm: best.info.handler, match: best }
    }
    const noMatch = this.handleNoMatch(mappings, path, request)
    if (noMatch) return noMatch
    // SimpleUrlHandlerMapping des ressources statiques
    const container = PathContainer.parsePath(path)
    const direct = this.resourcePatterns.find((r) => r.literal && r.pattern.patternString === path)
    if (direct) {
      request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, path)
      request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, path)
      if (CorsUtils.isPreFlightRequest(request)) return { kind: 'preflight' }
      return { kind: 'resource', registration: direct.registration, path }
    }
    const resMatches = this.resourcePatterns.filter((r) => !r.literal && r.pattern.matches(container))
    if (resMatches.length) {
      resMatches.sort((a, b) => PathPattern_SPECIFICITY(a.pattern, b.pattern))
      const r = resMatches[0] as (typeof resMatches)[number]
      const within = r.pattern.extractPathWithinPattern(container)
      request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, r.pattern.patternString)
      request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, within)
      if (CorsUtils.isPreFlightRequest(request)) return { kind: 'preflight' }
      return { kind: 'resource', registration: r.registration, path: within }
    }
    return null
  }

  private handleMatch(match: Match, path: string, request: HttpServletRequest): void {
    const pattern = match.patterns[0]
    const vars = pattern ? (pattern.matchAndExtract(path) ?? new Map<string, string>()) : new Map<string, string>()
    request.setAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE, match.info.handler)
    request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, pattern ? pattern.patternString : path)
    request.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, vars)
    if (match.produces.length) request.setAttribute(HandlerMapping.PRODUCIBLE_MEDIA_TYPES_ATTRIBUTE, match.produces.filter((e) => !e.negated).map((e) => e.mediaType))
  }

  /** `RequestMappingInfoHandlerMapping.handleNoMatch` */
  private handleNoMatch(mappings: MappingInfo[], path: string, request: HttpServletRequest): Handler | null {
    const partial = mappings
      .filter((info) => matchPatterns(info, path) !== null)
      .map((info) => {
        const methods = matchMethods(info, request) !== null
        const consumes = matchConsumes(info, request) !== null
        const produces = matchProduces(info, request) !== null
        const params = matchParams(info.params, request)
        return { info, methods, consumes, produces, params }
      })
    if (partial.length === 0) return null
    if (!partial.some((p) => p.methods)) {
      const allowed: string[] = []
      for (const p of partial) for (const m of p.info.methods) if (!allowed.includes(m)) allowed.push(m)
      if (request.method === 'OPTIONS') {
        const acceptPatch: string[] = []
        for (const p of partial) if (p.info.methods.includes('PATCH')) for (const c of p.info.consumes) if (!c.negated) acceptPatch.push(c.mediaType.toString())
        return { kind: 'options', allow: allowed, acceptPatch }
      }
      throw asErrorResponse(new HttpRequestMethodNotSupportedException(`Request method '${request.method}' is not supported`), 405, `Method '${request.method}' is not supported.`, [
        ['Allow', allowed.join(', ')],
      ])
    }
    if (!partial.some((p) => p.methods && p.consumes)) {
      const types: string[] = []
      for (const p of partial) for (const c of p.info.consumes) if (!c.negated && !types.includes(c.mediaType.toString())) types.push(c.mediaType.toString())
      const ct = request.contentType
      let contentType: string | null = null
      if (ct) {
        try {
          contentType = ParsedMediaType.parse(ct).toString()
        } catch (e) {
          throw asErrorResponse(new HttpMediaTypeNotSupportedException((e as Error).message), 415, 'Could not parse Content-Type.', [['Accept', types.join(', ')]])
        }
      }
      throw asErrorResponse(new HttpMediaTypeNotSupportedException(`Content-Type '${contentType}' is not supported`), 415, `Content-Type '${contentType}' is not supported.`, [
        ['Accept', types.join(', ')],
      ])
    }
    if (!partial.some((p) => p.methods && p.consumes && p.produces)) {
      const types: string[] = []
      for (const p of partial) for (const e of p.info.produces) if (!e.negated && !types.includes(e.mediaType.toString())) types.push(e.mediaType.toString())
      throw asErrorResponse(new HttpMediaTypeNotAcceptableException(`No acceptable representation`), 406, `Acceptable representations: [${types.join(', ')}].`, [['Accept', types.join(', ')]])
    }
    if (!partial.some((p) => p.methods && p.consumes && p.produces && p.params)) {
      const conditions = partial.map((p) => p.info.params.map((e) => `${e.negated && e.value === null ? '!' : ''}${e.name}${e.value !== null ? `${e.negated ? '!=' : '='}${e.value}` : ''}`))
      const actual = [...parameterMap(request)].map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
      throw asErrorResponse(
        new UnsatisfiedServletRequestParameterException(`Parameter conditions ${conditions.map((c) => `"${c.join(', ')}"`).join(' OR ')} not met for actual request parameters: ${actual}`),
        400,
        'Invalid request parameters.',
      )
    }
    return null
  }

  // -------------------------------------------------------------------------
  // Appel
  // -------------------------------------------------------------------------

  private async handle(request: HttpServletRequest, response: HttpServletResponse, handler: Handler): Promise<ModelAndView | null> {
    switch (handler.kind) {
      case 'preflight':
        this.corsProcessor.processRequest(null, request, response)
        return null
      case 'options': {
        const allowed: string[] = []
        if (handler.allow.length === 0) allowed.push('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS')
        else {
          allowed.push(...handler.allow)
          if (handler.allow.includes('GET') && !allowed.includes('HEAD')) allowed.push('HEAD')
          if (!allowed.includes('OPTIONS')) allowed.push('OPTIONS')
        }
        response.setHeader('Allow', allowed.join(','))
        response.setHeader('Accept-Patch', handler.acceptPatch.join(', '))
        return null
      }
      case 'resource':
        await this.handleResource(request, response, handler.registration, handler.path)
        return null
      case 'method':
        return this.invokeHandlerMethod(request, response, handler.hm)
    }
  }

  private async invokeHandlerMethod(request: HttpServletRequest, response: HttpServletResponse, hm: HandlerMethod): Promise<ModelAndView | null> {
    const uriVariables = (request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE) as Map<string, string> | null) ?? new Map<string, string>()
    const model = new Model()
    const argCtx: ArgContext = { request, response, handler: hm, exception: null, model, uriVariables }
    const specs = hm.spec.args ?? []
    const args: unknown[] = []
    for (const spec of specs) args.push(await this.resolveArgument(spec, argCtx))
    // validation de méthode (@Validated / validation intégrée de Spring MVC)
    const constrained = specs.map((s, i) => ({ s, v: args[i] })).filter(({ s }) => s.constraints && s.constraints.length > 0)
    if (constrained.length > 0) {
      const violations = validateParameters(
        hm.bean,
        hm.method,
        constrained.map(({ s, v }) => ({ name: s.parameterName ?? ('name' in s ? (s.name as string) : 'arg'), value: v ?? null, constraints: s.constraints ?? [] })),
      )
      if (violations.length > 0) {
        if (hm.controller.validated) throw new ConstraintViolationException(violations)
        throw asErrorResponse(new HandlerMethodValidationException('400 BAD_REQUEST "Validation failure"'), 400, 'Validation failure')
      }
    }
    // @PreAuthorize (proxy de sécurité autour du contrôleur)
    const expression = hm.spec.preAuthorize ?? hm.controller.preAuthorize
    if (expression && preAuthorizeEvaluator && !(await preAuthorizeEvaluator(expression, request, { bean: hm.bean, method: hm.method })))
      throw new AccessDeniedException('Access Denied')
    let rv = (hm.bean as Record<string, (...a: unknown[]) => unknown>)[hm.method]?.apply(hm.bean, args)
    if (rv instanceof Promise) rv = await rv
    return this.handleReturnValue(rv, { rest: hm.controller.rest ?? true, responseStatus: hm.spec.responseStatus, returns: hm.spec.returns }, request, response, model)
  }

  // -------------------------------------------------------------------------
  // Arguments
  // -------------------------------------------------------------------------

  private missingValue(spec: ArgSpec): unknown {
    return spec.hasDefault ? undefined : null
  }

  private isOptional(spec: ArgSpec): boolean {
    return spec.nullable === true || spec.hasDefault === true
  }

  private async resolveArgument(spec: ArgSpec, c: ArgContext): Promise<unknown> {
    const { request, response } = c
    switch (spec.kind) {
      case 'pathVariable': {
        const raw = c.uriVariables.get(spec.name) ?? null
        if (raw === null) {
          if (spec.required && !this.isOptional(spec))
            throw asErrorResponse(
              new MissingPathVariableException(`Required URI template variable '${spec.name}' for method parameter type ${javaSimpleName(spec.type, spec.nullable)} is not present`),
              500,
              `Required path variable '${spec.name}' is not present.`,
            )
          return this.missingValue(spec)
        }
        const v = convertArgument(raw, spec.type, { name: spec.name, annotation: 'org.springframework.web.bind.annotation.PathVariable', nullable: spec.nullable === true })
        if (v === null && spec.required && !this.isOptional(spec))
          throw asErrorResponse(
            new MissingPathVariableException(`Required URI template variable '${spec.name}' for method parameter type ${javaSimpleName(spec.type, spec.nullable)} is present but converted to null`),
            400,
            `Required path variable '${spec.name}' is not present.`,
          )
        return v ?? this.missingValue(spec)
      }
      case 'requestParam': {
        const t = unwrapType(spec.type).type
        if (typeof t === 'object' && 'class' in t && t.class === MultipartFile) {
          const f = request.parts.get(spec.name)?.[0] ?? null
          if (f === null && spec.required && !this.isOptional(spec))
            throw asErrorResponse(new MissingServletRequestPartException(`Required part '${spec.name}' is not present.`), 400, `Required part '${spec.name}' is not present.`)
          return f ?? this.missingValue(spec)
        }
        if (typeof t === 'object' && ('list' in t || 'set' in t)) {
          const el = 'list' in t ? t.list : t.set
          if (typeof el === 'object' && 'class' in el && el.class === MultipartFile) {
            const files = request.parts.get(spec.name) ?? null
            if (files === null && spec.required && !this.isOptional(spec))
              throw asErrorResponse(new MissingServletRequestPartException(`Required part '${spec.name}' is not present.`), 400, `Required part '${spec.name}' is not present.`)
            return files ?? this.missingValue(spec)
          }
        }
        const values = request.getParameterValues(spec.name)
        let raw: string | string[] | null = values === null ? null : values.length === 1 ? (values[0] as string) : values
        if (raw === null) {
          if (spec.defaultValue !== null) raw = spec.defaultValue
          else if (spec.required && !this.isOptional(spec))
            throw asErrorResponse(
              new MissingServletRequestParameterException(`Required request parameter '${spec.name}' for method parameter type ${javaSimpleName(spec.type, spec.nullable)} is not present`),
              400,
              `Required parameter '${spec.name}' is not present.`,
            )
          else return this.missingValue(spec)
        } else if (raw === '' && spec.defaultValue !== null) raw = spec.defaultValue
        const v = convertArgument(raw, spec.type, { name: spec.name, annotation: 'org.springframework.web.bind.annotation.RequestParam', nullable: spec.nullable === true })
        if (v === null && spec.defaultValue === null && spec.required && !this.isOptional(spec))
          throw asErrorResponse(
            new MissingServletRequestParameterException(`Required request parameter '${spec.name}' for method parameter type ${javaSimpleName(spec.type, spec.nullable)} is present but converted to null`),
            400,
            `Required parameter '${spec.name}' is not present.`,
          )
        return v ?? this.missingValue(spec)
      }
      case 'requestParamMap': {
        const m = new Map<string, string>()
        for (const [k, v] of parameterMap(request)) m.set(k, v[0] ?? '')
        return m
      }
      case 'requestHeader': {
        const values = request.getHeaders(spec.name)
        let raw: string | string[] | null = values.length === 0 ? null : values.length === 1 ? (values[0] as string) : values
        if (raw === null) {
          if (spec.defaultValue !== null) raw = spec.defaultValue
          else if (spec.required && !this.isOptional(spec))
            throw asErrorResponse(
              new MissingRequestHeaderException(`Required request header '${spec.name}' for method parameter type ${javaSimpleName(spec.type, spec.nullable)} is not present`),
              400,
              `Required header '${spec.name}' is not present.`,
            )
          else return this.missingValue(spec)
        } else if (raw === '' && spec.defaultValue !== null) raw = spec.defaultValue
        const v = convertArgument(raw, spec.type, { name: spec.name, annotation: 'org.springframework.web.bind.annotation.RequestHeader', nullable: spec.nullable === true })
        if (v === null && spec.defaultValue === null && spec.required && !this.isOptional(spec))
          throw asErrorResponse(
            new MissingRequestHeaderException(`Required request header '${spec.name}' for method parameter type ${javaSimpleName(spec.type, spec.nullable)} is present but converted to null`),
            400,
            `Required header '${spec.name}' is not present.`,
          )
        return v ?? this.missingValue(spec)
      }
      case 'requestBody':
        return this.readBody(spec, c)
      case 'requestPart': {
        const ct = request.contentType
        if (!ct || !ct.toLowerCase().startsWith('multipart/'))
          throw asErrorResponse(new MultipartException('Current request is not a multipart request'), 400, null)
        const f = request.parts.get(spec.name)?.[0] ?? null
        if (f !== null) return f
        const field = request.getParameter(spec.name)
        if (field !== null) return field
        if (spec.required && !this.isOptional(spec))
          throw asErrorResponse(new MissingServletRequestPartException(`Required part '${spec.name}' is not present.`), 400, `Required part '${spec.name}' is not present.`)
        return this.missingValue(spec)
      }
      case 'cookieValue': {
        const cookie = request.getCookies().find((x) => x.name === spec.name)
        if (!cookie) {
          if (spec.required && !this.isOptional(spec))
            throw asErrorResponse(
              new MissingRequestCookieException(`Required cookie '${spec.name}' for method parameter type String is not present`),
              400,
              `Required cookie '${spec.name}' is not present.`,
            )
          return this.missingValue(spec)
        }
        return cookie.value
      }
      case 'authenticationPrincipal':
        return request.getAttribute(PRINCIPAL_ATTRIBUTE) ?? request.userPrincipal ?? null
      case 'pageable':
        return this.resolvePageable(spec, request)
      case 'sort':
        return this.resolveSort(request, null)
      case 'request':
        return request
      case 'response':
        return response
      case 'webRequest':
        return new ServletWebRequest(request, response)
      case 'principal':
        return request.userPrincipal
      case 'session':
        return request.getSession(true)
      case 'model':
        return c.model
      case 'exception':
        return c.exception
      case 'custom': {
        const resolver =
          this.argumentResolvers.find((r) => r.supportsParameter?.({ annotation: spec.resolver, name: spec.name })) ??
          this.argumentResolvers.find((r) => r.constructor.name === spec.resolver)
        if (!resolver) throw new IllegalStateException(`No suitable resolver for argument '${spec.name}' (${spec.resolver})`)
        const v = resolver.resolveArgument(spec.name, request)
        return v instanceof Promise ? await v : v
      }
    }
  }

  /** `SortHandlerMethodArgumentResolver` */
  private resolveSort(request: HttpServletRequest, fallback: string[] | null | undefined): Sort {
    const directionParameter = request.getParameterValues('sort')
    const defaultSort = () => (fallback && fallback.length ? Sort.by(...fallback) : Sort.unsorted())
    // No parameter
    if (directionParameter === null) return defaultSort()
    // Single empty parameter, e.g "sort="
    if (directionParameter.length === 1 && !(directionParameter[0] as string).trim()) return defaultSort()
    const allOrders: Order[] = []
    for (const raw of directionParameter) {
      let part = raw
      try {
        part = decodeURIComponent(raw.replace(/\+/g, '%2B'))
      } catch {
        // tel quel
      }
      // String.split(",") de Java : éléments vides finaux retirés, puis ceux qui ne sont que des points
      const elements = part
        .split(',')
        .reduceRight<string[]>((acc, e) => (acc.length === 0 && e === '' ? acc : [e, ...acc]), [])
        .filter((e) => e.replaceAll('.', '').trim() !== '')
      let lastIndex = elements.length
      let direction: Direction | null = null
      let ignoreCase = false
      if (lastIndex > 0 && (elements[lastIndex - 1] as string).toLowerCase() === 'ignorecase') {
        ignoreCase = true
        lastIndex--
      }
      if (lastIndex > 0) {
        const d = elements[lastIndex - 1] as string
        const found = Direction.entries().find((x) => x.name === d.toUpperCase())
        if (found) {
          direction = found
          lastIndex--
        }
      }
      for (let i = 0; i < lastIndex; i++) {
        const property = elements[i] as string
        if (!property.trim()) continue
        allOrders.push(new Order(direction, property, ignoreCase))
      }
    }
    return allOrders.length === 0 ? Sort.unsorted() : Sort.by(allOrders)
  }

  /** `PageableHandlerMethodArgumentResolver` (spring.data.web : taille maximale 2000, pages à partir de 0) */
  private resolvePageable(spec: Extract<ArgSpec, { kind: 'pageable' }>, request: HttpServletRequest): Pageable {
    const maxPageSize = 2000
    const parse = (s: string | null, upper: number): number | null => {
      if (s === null || !s.trim()) return null
      if (!/^[+-]?\d+$/.test(s)) return 0
      const n = Number(s)
      if (!Number.isFinite(n) || n > 2147483647 || n < -2147483648) return 0
      return n < 0 ? 0 : n > upper ? upper : n
    }
    const defaultSort = spec.defaultSort && spec.defaultSort.length ? Sort.by(...spec.defaultSort) : Sort.unsorted()
    const fallback = PageRequest.of(spec.defaultPage, spec.defaultSize, defaultSort)
    const sort = this.resolveSort(request, spec.defaultSort)
    const page = parse(request.getParameter('page'), 2147483647)
    let size = parse(request.getParameter('size'), maxPageSize)
    const p = page ?? fallback.pageNumber
    size = size ?? fallback.pageSize
    // Limit lower bound
    if (size < 1) size = fallback.pageSize
    // Limit upper bound
    if (size > maxPageSize) size = maxPageSize
    const pageable = PageRequest.of(p, size, fallback.sort)
    if (sort.isSorted) return PageRequest.of(pageable.pageNumber, pageable.pageSize, sort)
    return pageable
  }

  /** `RequestResponseBodyMethodProcessor.readWithMessageConverters` + validation */
  private readBody(spec: Extract<ArgSpec, { kind: 'requestBody' }>, c: ArgContext): unknown {
    const { request } = c
    const rawCt = request.contentType
    let contentType: ParsedMediaType
    let noContentType = false
    try {
      if (rawCt) {
        contentType = ParsedMediaType.parse(rawCt)
        if (contentType.charset === null) contentType = contentType.withCharset('UTF-8')
      } else {
        noContentType = true
        contentType = ParsedMediaType.APPLICATION_OCTET_STREAM
      }
    } catch (e) {
      throw asErrorResponse(new HttpMediaTypeNotSupportedException((e as Error).message), 415, 'Could not parse Content-Type.')
    }
    const target = unwrapType(spec.type).type
    const isString = target === 'String'
    const isBytes = typeof target === 'object' && 'scalar' in target && target.scalar === 'ByteArray'
    const readable = isString || isBytes || JSON_TYPES.some((j) => j.includes(contentType))
    const body = request.body
    const httpMethod = request.method
    let value: unknown = null
    if (!readable) {
      if (!['POST', 'PUT', 'PATCH'].includes(httpMethod) || (noContentType && body.length === 0)) value = null
      else {
        const supported = isString
          ? ['text/plain', '*/*']
          : ['application/json', 'application/yaml', 'application/xml;charset=UTF-8', 'text/xml;charset=UTF-8', 'application/*+json', 'application/*+xml;charset=UTF-8']
        throw asErrorResponse(new HttpMediaTypeNotSupportedException(`Content-Type '${contentType}' is not supported`), 415, `Content-Type '${contentType}' is not supported.`, [
          ['Accept', supported.join(', ')],
        ])
      }
    } else if (body.length > 0) {
      if (isString) value = body.toString((contentType.charset ?? 'utf-8').toLowerCase() === 'utf-8' ? 'utf8' : 'latin1')
      else if (isBytes) value = new Uint8Array(body)
      else {
        try {
          value = this.objectMapper.readValue(body, spec.type)
        } catch (e) {
          if (e instanceof JsonProcessingException) throw new HttpMessageNotReadableException(`JSON parse error: ${e.message}`, e)
          throw e
        }
      }
    }
    if (value === null && spec.required && !this.isOptional(spec)) throw new HttpMessageNotReadableException(`Required request body is missing: ${c.handler?.signature ?? ''}`)
    if (value !== null && spec.valid && (value instanceof Map || Array.isArray(value) || value instanceof Set)) {
      // @Valid sur un conteneur (Map<String, Dto>, List<Dto>) : validation de méthode (MethodValidationAdapter),
      // chaque élément est validé ; HandlerMethodValidationException (400)
      const elements = value instanceof Map ? [...value.values()] : [...value]
      const count = elements.reduce((n: number, e) => n + (e !== null && typeof e === 'object' ? validate(e as object).length : 0), 0)
      if (count > 0) {
        // Method.toString() : signature sans les paramètres de type (toGenericString sans <...>)
        let method = c.handler?.signature ?? ''
        while (/<[^<>]*>/.test(method)) method = method.replace(/<[^<>]*>/g, '')
        throw asErrorResponse(new HandlerMethodValidationException('400 BAD_REQUEST "Validation failure"', method, count), 400, 'Validation failure')
      }
    } else if (value !== null && spec.valid && typeof value === 'object' && !Array.isArray(value)) {
      const violations = validate(value as object)
      if (violations.length > 0) {
        const objectName = (() => {
          const n = (value as object).constructor.name
          return n.charAt(0).toLowerCase() + n.slice(1)
        })()
        throw new MethodArgumentNotValidException(
          violations.filter((v) => v.propertyPath !== '').map((v) => ({ field: v.propertyPath, message: v.message, rejectedValue: v.invalidValue })),
          violations.filter((v) => v.propertyPath === '').map((v) => ({ objectName, message: v.message })),
          objectName,
        )
      }
    }
    return value ?? this.missingValue(spec)
  }

  // -------------------------------------------------------------------------
  // Valeurs de retour
  // -------------------------------------------------------------------------

  private async handleReturnValue(
    rv: unknown,
    opts: { rest: boolean; responseStatus?: HttpStatus; returns?: JavaType },
    request: HttpServletRequest,
    response: HttpServletResponse,
    model: Model,
  ): Promise<ModelAndView | null> {
    // ServletInvocableHandlerMethod.setResponseStatus
    if (opts.responseStatus) response.setStatus(opts.responseStatus.value)
    if (rv instanceof ModelAndView) return rv
    const emitter = rv instanceof ResponseEntity && rv.body instanceof ResponseBodyEmitter ? rv.body : rv instanceof ResponseBodyEmitter ? rv : null
    if (emitter) {
      if (rv instanceof ResponseEntity) this.applyEntity(rv, response)
      await this.handleEmitter(emitter, request, response)
      return null
    }
    const streaming = rv instanceof ResponseEntity ? rv.body : rv
    if (typeof streaming === 'function' && (streaming as unknown as Record<symbol, unknown>)[STREAMING]) {
      if (rv instanceof ResponseEntity) this.applyEntity(rv, response)
      await this.handleStreaming(streaming as StreamingResponseBody, request, response)
      return null
    }
    if (rv instanceof ResponseEntity) {
      await this.handleEntity(rv, request, response, opts.returns)
      return null
    }
    if (rv instanceof HttpHeaders) {
      for (const [k, vs] of rv.entries) for (const v of vs) response.addHeader(k, v)
      return null
    }
    if (rv === undefined || rv === null) {
      if (opts.rest) return null
      return null
    }
    if (opts.rest) {
      if (rv instanceof ProblemDetail) {
        response.setStatus(rv.status)
        if (rv.instance === null) rv.instance = request.requestURI
      }
      await this.writeWithMessageConverters(rv, opts.returns, request, response)
      return null
    }
    if (typeof rv === 'string') return new ModelAndView(rv, model.asMap())
    throw new IllegalArgumentException(`Unknown return value type: ${(rv as object).constructor?.name}`)
  }

  private applyEntity(entity: ResponseEntity<unknown>, response: HttpServletResponse): void {
    response.setStatus(entity.statusCode)
    for (const [k, vs] of entity.headers.entries) {
      if (k === 'content-type') response.setContentType(vs[0] as string)
      else for (const v of vs) response.addHeader(k, v)
    }
  }

  /** `HttpEntityMethodProcessor.handleReturnValue` */
  private async handleEntity(entity: ResponseEntity<unknown>, request: HttpServletRequest, response: HttpServletResponse, returns?: JavaType): Promise<void> {
    const status = entity.statusCode
    response.setStatus(status)
    const etag = entity.headers.getFirst('etag')
    const lastModified = entity.headers.getFirst('last-modified')
    for (const [k, vs] of entity.headers.entries) {
      if (k === 'content-type') continue
      if ((k === 'etag' || k === 'last-modified') && status === 200 && (request.method === 'GET' || request.method === 'HEAD')) continue
      for (const v of vs) response.addHeader(k, v)
    }
    const presetContentType = entity.headers.getFirst('content-type')
    if (status === 200 && (request.method === 'GET' || request.method === 'HEAD')) {
      const lm = lastModified !== null ? parseHttpDate(lastModified) : -1
      // outputMessage.flush() : en-têtes seulement, le corps n'étant pas utilisé la réponse n'est pas envoyée
      if (new ServletWebRequest(request, response).checkNotModified(etag, lm)) return
    } else if (status / 100 === 3) {
      // saveFlashAttributes : sans objet
    }
    const body = entity.body
    if (body instanceof ProblemDetail) {
      response.setStatus(body.status)
      if (body.instance === null) body.instance = request.requestURI
    }
    await this.writeWithMessageConverters(body, returns, request, response, presetContentType)
    // Ensure headers are flushed even if no body was written : ServletServerHttpResponse.flush() n'envoie la
    // réponse que si le corps a été utilisé ; sinon le conteneur la termine (Content-Length: 0)
  }

  /** `AbstractMessageConverterMethodProcessor.writeWithMessageConverters` */
  private async writeWithMessageConverters(
    value: unknown,
    declared: JavaType | undefined,
    request: HttpServletRequest,
    response: HttpServletResponse,
    presetContentType: string | null = null,
  ): Promise<void> {
    let body = value
    const kind = bodyKind(body)
    let regions: ResourceRegion[] | null = null
    if (body instanceof Resource) {
      response.setHeader('Accept-Ranges', 'bytes')
      const range = request.getHeader('range')
      if (range !== null && response.status === 200) {
        try {
          regions = toResourceRegions(range, body.contentLength())
          response.setStatus(206)
        } catch (e) {
          if (!(e instanceof IllegalArgumentException)) throw e
          response.setHeader('Content-Range', `bytes */${body.contentLength()}`)
          response.setStatus(416)
        }
      }
    }
    let selected: ParsedMediaType | null = null
    let preset: ParsedMediaType | null = null
    if (presetContentType !== null) {
      try {
        preset = ParsedMediaType.parse(presetContentType)
      } catch {
        preset = null
      }
    }
    if (preset !== null && preset.isConcrete) selected = preset
    else {
      const acceptable = acceptedMediaTypes(request)
      const fromMapping = request.getAttribute(HandlerMapping.PRODUCIBLE_MEDIA_TYPES_ATTRIBUTE) as ParsedMediaType[] | null
      const xml = this.xmlWriter !== null
      let producible = fromMapping && fromMapping.length ? fromMapping : converterMediaTypes(kind, xml)
      if (body !== null && body !== undefined && fromMapping && fromMapping.length) producible = fromMapping.filter((m) => canWrite(kind, m, xml))
      if (body !== null && body !== undefined && producible.length === 0)
        throw new HttpMessageNotWritableException(`No converter found for return value of type: ${(body as object).constructor?.name}`)
      let compatible: ParsedMediaType[] = []
      for (const a of acceptable) for (const p of producible) if (a.isCompatibleWith(p)) compatible.push(mostSpecific(a, p))
      if (compatible.length === 0 && kind === 'problem') {
        for (const p of producible) if (ParsedMediaType.APPLICATION_PROBLEM_JSON.isCompatibleWith(p)) compatible.push(mostSpecific(ParsedMediaType.APPLICATION_PROBLEM_JSON, p))
      }
      if (compatible.length === 0) {
        if (body !== null && body !== undefined)
          throw asErrorResponse(new HttpMediaTypeNotAcceptableException('No acceptable representation'), 406, `Acceptable representations: [${producible.join(', ')}].`, [
            ['Accept', producible.join(', ')],
          ])
        return
      }
      compatible = [...compatible]
      sortBySpecificity(compatible)
      for (const mt of compatible) {
        if (mt.isConcrete) {
          selected = mt
          break
        }
        if ((mt.isWildcardType && mt.isWildcardSubtype) || (mt.type === 'application' && mt.subtype === '*')) {
          selected = ParsedMediaType.APPLICATION_OCTET_STREAM
          break
        }
      }
    }
    if (selected === null) return
    selected = selected.removeQualityValue()
    if (body === null || body === undefined) return
    if (!canWrite(kind, selected, this.xmlWriter !== null) && !(kind === 'bytes' || kind === 'resource')) {
      const types = converterMediaTypes(kind, this.xmlWriter !== null)
      throw asErrorResponse(new HttpMediaTypeNotAcceptableException('No acceptable representation'), 406, `Acceptable representations: [${types.join(', ')}].`, [
        ['Accept', types.join(', ')],
      ])
    }
    if (this.xmlWriter !== null && (kind === 'json' || kind === 'problem') && isXmlType(selected)) {
      addContentDispositionHeader(request, response)
      const bytes = this.xmlWriter(kind === 'problem' ? (body as ProblemDetail).toJsonMap() : body, declared)
      if (response.contentType === null) response.setContentType(selected.toString())
      const out = response.getOutputStream()
      out.write(bytes)
      flushOutput(out)
      out.end()
      return
    }
    addContentDispositionHeader(request, response)
    switch (kind) {
      case 'bytes': {
        const b = body as Uint8Array
        if (response.contentType === null) response.setContentType((selected.isConcrete ? selected : ParsedMediaType.APPLICATION_OCTET_STREAM).toString())
        response.setHeader('Content-Length', String(b.length))
        const out = response.getOutputStream()
        out.write(b)
        flushOutput(out)
        out.end()
        return
      }
      case 'string': {
        const s = body as string
        let ct = selected
        if (response.contentType === null) {
          const isJson = JSON_TYPES.some((j) => j.isCompatibleWith(ct)) && ct.isConcrete
          if (!isJson && ct.charset === null) ct = ct.withCharset('UTF-8')
          response.setContentType(ct.toString())
        }
        const bytes = Buffer.from(s, 'utf8')
        response.setHeader('Content-Length', String(bytes.length))
        const out = response.getOutputStream()
        out.write(bytes)
        flushOutput(out)
        out.end()
        return
      }
      case 'resource': {
        const res = body as Resource
        let ct: ParsedMediaType | null = preset ?? selected
        if (preset === null && (!selected.isConcrete || (selected.type === 'application' && selected.subtype === 'octet-stream')))
          ct = mediaTypeForFilename(res.filename) ?? ParsedMediaType.APPLICATION_OCTET_STREAM
        if (regions !== null) await this.writeRegions(res, regions, ct, response)
        else {
          if (response.contentType === null && ct !== null) response.setContentType(ct.toString())
          response.setHeader('Content-Length', String(res.contentLength()))
          const out = response.getOutputStream()
          await pipeTo(res.getInputStream(), out)
          flushOutput(out)
          out.end()
        }
        return
      }
      case 'problem': {
        const bytes = this.objectMapper.writeValueAsBytes((body as ProblemDetail).toJsonMap())
        if (response.contentType === null) response.setContentType(selected.toString())
        const out = response.getOutputStream()
        out.write(bytes)
        flushOutput(out)
        out.end()
        return
      }
      default: {
        const bytes = this.objectMapper.writeValueAsBytes(body, declared)
        if (response.contentType === null) response.setContentType(selected.toString())
        const out = response.getOutputStream()
        out.write(bytes)
        flushOutput(out)
        out.end()
      }
    }
  }

  /** `ResourceRegionHttpMessageConverter` */
  private async writeRegions(res: Resource, regions: ResourceRegion[], contentType: ParsedMediaType | null, response: HttpServletResponse): Promise<void> {
    const resourceLength = res.contentLength()
    if (regions.length === 1) {
      const region = regions[0] as ResourceRegion
      const start = region.start
      const end = Math.min(start + region.count - 1, resourceLength - 1)
      const rangeLength = end - start + 1
      if (response.contentType === null && contentType !== null) response.setContentType(contentType.toString())
      response.addHeader('Content-Range', `bytes ${start}-${end}/${resourceLength}`)
      response.setHeader('Content-Length', String(rangeLength))
      const out = response.getOutputStream()
      await pipeTo(res.getInputStream({ start, end }), out)
      flushOutput(out)
      out.end()
      return
    }
    const boundary = generateMultipartBoundary()
    response.setContentType(`multipart/byteranges; boundary=${boundary}`)
    const out = response.getOutputStream()
    for (const region of regions) {
      const start = region.start
      const end = Math.min(start + region.count - 1, resourceLength - 1)
      let head = `\r\n--${boundary}\r\n`
      if (contentType !== null) head += `Content-Type: ${contentType}\r\n`
      head += `Content-Range: bytes ${start}-${end}/${resourceLength}\r\n\r\n`
      out.write(Buffer.from(head, 'ascii'))
      await pipeTo(res.getInputStream({ start, end }), out)
    }
    out.write(Buffer.from(`\r\n--${boundary}--`, 'ascii'))
    flushOutput(out)
    out.end()
  }

  /** `StreamingResponseBodyReturnValueHandler` : en-têtes envoyés, puis écriture (attendue) */
  private async handleStreaming(body: StreamingResponseBody, request: HttpServletRequest, response: HttpServletResponse): Promise<void> {
    ShallowEtagHeaderFilter.disableContentCaching(request)
    const out = response.getOutputStream()
    let ended = false
    out.once('finish', () => {
      ended = true
    })
    try {
      await body(out)
    } catch (e) {
      logger.debug(() => `Streaming failed: ${(e as Error).message}`)
    }
    if (!ended && !out.writableEnded) {
      flushOutput(out)
      out.end()
    }
  }

  /** `ResponseBodyEmitterReturnValueHandler` : en-têtes envoyés immédiatement, écriture jusqu'à complete() */
  private async handleEmitter(emitter: ResponseBodyEmitter, request: HttpServletRequest, response: HttpServletResponse): Promise<void> {
    ShallowEtagHeaderFilter.disableContentCaching(request)
    if (response.contentType === null && emitter.defaultContentType !== null) response.setContentType(emitter.defaultContentType)
    const out = response.getOutputStream()
    flushOutput(out)
    await new Promise<void>((resolve) => {
      let done = false
      const timeoutCbs: (() => void)[] = []
      const errorCbs: ((e: unknown) => void)[] = []
      const completionCbs: (() => void)[] = []
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        for (const cb of completionCbs) cb()
        if (!out.writableEnded) out.end()
        resolve()
      }
      const timer = setTimeout(
        () => {
          for (const cb of timeoutCbs) cb()
          finish()
        },
        emitter.timeout ?? this.asyncRequestTimeout,
      )
      timer.unref?.()
      const onClose = () => {
        if (done) return
        const err = new Error('Connection closed')
        for (const cb of errorCbs) cb(err)
        finish()
      }
      response.raw.once('close', onClose)
      emitter.initialize({
        send: (items: DataWithMediaType[]) => {
          if (done || response.raw.destroyed || response.raw.writableEnded) throw new Error('Broken pipe')
          for (const item of items) {
            const data = item.data
            let bytes: Buffer
            if (typeof data === 'string' && (item.mediaType === null || item.mediaType.startsWith('text/'))) bytes = Buffer.from(data, 'utf8')
            else if (data instanceof Uint8Array) bytes = Buffer.from(data)
            else bytes = Buffer.from(this.objectMapper.writeValueAsBytes(data))
            out.write(bytes)
          }
          flushOutput(out)
        },
        complete: () => finish(),
        completeWithError: () => finish(),
        onTimeout: (cb) => timeoutCbs.push(cb),
        onError: (cb) => errorCbs.push(cb),
        onCompletion: (cb) => completionCbs.push(cb),
      })
    })
  }

  // -------------------------------------------------------------------------
  // Ressources statiques
  // -------------------------------------------------------------------------

  /** `ResourceHttpRequestHandler.handleRequest` */
  private async handleResource(request: HttpServletRequest, response: HttpServletResponse, registration: ResourceHandlerRegistration, path: string): Promise<void> {
    const resource = lookupStaticResource(path, registration.locations)
    if (resource === null) throw asErrorResponse(new NoResourceFoundException(`No static resource ${path}.`), 404, `No static resource ${path}.`)
    if (request.method === 'OPTIONS') {
      response.setHeader('Allow', 'GET,HEAD,OPTIONS')
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD')
      throw asErrorResponse(new HttpRequestMethodNotSupportedException(`Request method '${request.method}' is not supported`), 405, `Method '${request.method}' is not supported.`, [
        ['Allow', 'GET, HEAD'],
      ])
    if (registration.cacheControl) response.setHeader('Cache-Control', registration.cacheControl)
    const lastModified = resource.lastModified() ?? -1
    if (new ServletWebRequest(request, response).checkNotModified(lastModified)) return
    const mediaType = mediaTypeForFilename(resource.filename)
    if (mediaType !== null) response.setContentType(mediaType.toString())
    response.setHeader('Accept-Ranges', 'bytes')
    const range = request.getHeader('range')
    if (range !== null) {
      try {
        const regions = toResourceRegions(range, resource.contentLength())
        response.setStatus(206)
        await this.writeRegions(resource, regions, mediaType, response)
        return
      } catch (e) {
        if (!(e instanceof IllegalArgumentException)) throw e
        response.setHeader('Content-Range', `bytes */${resource.contentLength()}`)
        response.sendError(416)
        return
      }
    }
    response.setHeader('Content-Length', String(resource.contentLength()))
    const out = response.getOutputStream()
    if (request.method !== 'HEAD') await pipeTo(resource.getInputStream(), out)
    out.end()
  }

  // -------------------------------------------------------------------------
  // Exceptions
  // -------------------------------------------------------------------------

  private async processDispatchResult(
    request: HttpServletRequest,
    response: HttpServletResponse,
    handler: Handler | null,
    mv: ModelAndView | null,
    exception: unknown,
  ): Promise<void> {
    if (exception !== null) mv = await this.processHandlerException(request, response, handler, exception)
    if (mv !== null && mv.viewName !== null) await this.render(mv, request, response)
  }

  /** `DispatcherServlet.processHandlerException` : lève l'exception si aucun résolveur ne la traite */
  private async processHandlerException(request: HttpServletRequest, response: HttpServletResponse, handler: Handler | null, ex: unknown): Promise<ModelAndView | null> {
    // Success and error responses may use different content types
    request.attributes.delete(HandlerMapping.PRODUCIBLE_MEDIA_TYPES_ATTRIBUTE)
    // DefaultErrorAttributes
    request.setAttribute(ERROR_ATTRIBUTE, ex)
    const hm = handler?.kind === 'method' ? handler.hm : null
    // 1. ExceptionHandlerExceptionResolver
    const resolved = await this.resolveWithExceptionHandler(request, response, hm, ex)
    if (resolved !== undefined) return resolved
    // 2. ResponseStatusExceptionResolver
    if (this.resolveResponseStatus(response, ex)) return null
    // 3. DefaultHandlerExceptionResolver
    if (this.resolveDefault(response, ex)) return null
    throw ex
  }

  private findExceptionHandler(ex: unknown, candidates: { exceptions: (abstract new (...a: never[]) => unknown)[] }[]): number {
    // ExceptionDepthComparator : classe d'exception la plus proche, puis la cause
    let e: unknown = ex
    while (e !== null && e !== undefined) {
      let best = -1
      let bestDepth = Number.MAX_SAFE_INTEGER
      candidates.forEach((c, idx) => {
        for (const t of c.exceptions) {
          if (!(e instanceof (t as unknown as new () => unknown))) continue
          let depth = 0
          let proto = Object.getPrototypeOf(e)
          while (proto && proto.constructor !== t) {
            depth++
            proto = Object.getPrototypeOf(proto)
          }
          if (depth < bestDepth) {
            bestDepth = depth
            best = idx
          }
        }
      })
      if (best !== -1) return best
      e = e instanceof Error ? (e.cause ?? null) : null
    }
    return -1
  }

  /** undefined : non résolue ; null : résolue sans vue */
  private async resolveWithExceptionHandler(
    request: HttpServletRequest,
    response: HttpServletResponse,
    hm: HandlerMethod | null,
    ex: unknown,
  ): Promise<ModelAndView | null | undefined> {
    let target: { bean: object; method: string; spec: ExceptionHandlerSpec; rest: boolean } | null = null
    if (hm && hm.controller.exceptionHandlers) {
      const entries = Object.entries(hm.controller.exceptionHandlers)
      const i = this.findExceptionHandler(
        ex,
        entries.map(([, s]) => s),
      )
      if (i !== -1) {
        const [method, spec] = entries[i] as [string, ExceptionHandlerSpec]
        target = { bean: hm.bean, method, spec, rest: hm.controller.rest ?? true }
      }
    }
    if (target === null) {
      // advices dans l'ordre, chacune avec sa propre résolution
      const byBean = new Map<object, AdviceHandler[]>()
      for (const a of this.adviceHandlers) byBean.set(a.bean, [...(byBean.get(a.bean) ?? []), a])
      for (const handlers of byBean.values()) {
        const i = this.findExceptionHandler(ex, handlers)
        if (i !== -1) {
          const a = handlers[i] as AdviceHandler
          target = { bean: a.bean, method: a.method, spec: a.spec, rest: a.rest }
          break
        }
      }
    }
    if (target === null) return undefined
    const argCtx: ArgContext = { request, response, handler: hm, exception: ex, model: new Model(), uriVariables: new Map() }
    try {
      const args: unknown[] = []
      for (const spec of target.spec.args ?? [{ kind: 'exception' } as ArgSpec]) args.push(await this.resolveArgument(spec, argCtx))
      let rv = (target.bean as Record<string, (...a: unknown[]) => unknown>)[target.method]?.apply(target.bean, args)
      if (rv instanceof Promise) rv = await rv
      if (response.isCommitted) return null
      const mv = await this.handleReturnValue(rv, { rest: target.rest, responseStatus: target.spec.responseStatus, returns: target.spec.returns }, request, response, argCtx.model)
      return mv
    } catch (invocationEx) {
      // Any other than the original exception (or a cause) is unintended here,
      // probably an accident (e.g. failed assertion or the like).
      if (invocationEx !== ex && invocationEx !== (ex as Error)?.cause)
        logger.warn(() => `Failure in @ExceptionHandler ${(target?.bean as object).constructor.name}#${target?.method}: ${(invocationEx as Error)?.message}`)
      // Continue with default processing of the original exception...
      return undefined
    }
  }

  /** `ResponseStatusExceptionResolver` */
  private resolveResponseStatus(response: HttpServletResponse, ex: unknown): boolean {
    if (response.isCommitted) return false
    if (ex instanceof ResponseStatusException) {
      const headers = (ex as unknown as { headers?: HttpHeaders }).headers
      if (headers instanceof HttpHeaders) for (const [k, vs] of headers.entries) for (const v of vs) response.addHeader(k, v)
      if (ex.reason) response.sendError(ex.status.value, ex.reason)
      else response.sendError(ex.status.value)
      return true
    }
    const annotated = exceptionStatusOf(ex)
    if (annotated) {
      if (annotated.reason) response.sendError(annotated.status.value, annotated.reason)
      else response.sendError(annotated.status.value)
      return true
    }
    const cause = ex instanceof Error ? ex.cause : undefined
    if (cause instanceof Error) return this.resolveResponseStatus(response, cause)
    return false
  }

  /** `DefaultHandlerExceptionResolver` */
  private resolveDefault(response: HttpServletResponse, ex: unknown): boolean {
    if (response.isCommitted) return false
    const info = ex !== null && typeof ex === 'object' ? errorResponses.get(ex) : undefined
    if (info) {
      for (const [k, v] of info.headers) response.addHeader(k, v)
      if (info.detail !== null) response.sendError(info.status, info.detail)
      else response.sendError(info.status)
      return true
    }
    if (ex instanceof HttpRequestMethodNotSupportedException) response.sendError(405, `Method is not supported.`)
    else if (ex instanceof HttpMediaTypeNotSupportedException) response.sendError(415)
    else if (ex instanceof HttpMediaTypeNotAcceptableException) response.sendError(406)
    else if (ex instanceof MissingServletRequestParameterException) response.sendError(400)
    else if (ex instanceof MethodArgumentNotValidException) response.sendError(400, 'Invalid request content.')
    else if (ex instanceof HandlerMethodValidationException) response.sendError(400, 'Validation failure')
    else if (ex instanceof NoResourceFoundException) response.sendError(404, ex.message)
    else if (ex instanceof ServletRequestBindingException) response.sendError(400, 'Failed to read request.')
    else if (ex instanceof MaxUploadSizeExceededException) response.sendError(413, 'Maximum upload size exceeded')
    else if (ex instanceof AsyncRequestTimeoutException) response.sendError(503)
    else if (ex instanceof MethodArgumentConversionNotSupportedException) response.sendError(500)
    else if (ex instanceof MethodArgumentTypeMismatchException) response.sendError(400)
    else if (ex instanceof HttpMessageNotReadableException) response.sendError(400)
    else if (ex instanceof HttpMessageNotWritableException) response.sendError(500)
    else return false
    return true
  }

  // -------------------------------------------------------------------------
  // Vues
  // -------------------------------------------------------------------------

  private async render(mv: ModelAndView, request: HttpServletRequest, response: HttpServletResponse): Promise<void> {
    const locale: LocaleTag = currentLocale()
    setContentLanguage(response.raw, locale)
    if (mv.status !== null) response.setStatus(mv.status)
    const viewName = mv.viewName as string
    if (viewName.startsWith('redirect:')) {
      const target = viewName.slice('redirect:'.length)
      response.sendRedirect(target.startsWith('/') ? request.contextPath + target : target)
      return
    }
    if (viewName.startsWith('forward:')) {
      await this.forward(request, response, viewName.slice('forward:'.length))
      return
    }
    let html: string
    if (viewName === 'error') {
      try {
        html = renderView('error', mv.model, request.contextPath, this.templatePrefix)
      } catch {
        html = whitelabelHtml(mv.model)
      }
    } else html = renderView(viewName, mv.model, request.contextPath, this.templatePrefix)
    if (response.isCommitted) return
    response.setContentType('text/html;charset=UTF-8')
    const out = response.getOutputStream()
    out.write(Buffer.from(html, 'utf8'))
    out.end()
  }
}

export { ParsedMediaType, InvalidMediaTypeException }
