// Support de portage : filtres de Spring Web et types de dispatch du conteneur de servlets :
// - DispatcherType (REQUEST, FORWARD, ERROR, ASYNC) porté par la requête, types de dispatch d'un
//   FilterRegistrationBean (défaut de Spring Boot : tous pour un OncePerRequestFilter, REQUEST sinon) ;
// - GenericFilterBean, OncePerRequestFilter (attribut « déjà filtré », dispatch d'erreur) ;
// - ServletWebRequest (checkNotModified : If-Match, If-Unmodified-Since, If-None-Match, If-Modified-Since,
//   304 / 412, en-têtes ETag et Last-Modified) ;
// - ContentCachingResponseWrapper et ShallowEtagHeaderFilter ;
// - CommonsRequestLoggingFilter, ForwardedHeaderFilter.
// Ce fichier n'a pas de jumeau Kotlin.
import { createHash } from 'node:crypto'
import { Writable } from 'node:stream'
import { KotlinLogging } from './logging.js'
import { type Filter, type FilterChain, type FilterRegistrationBean, HttpServletRequest, type HttpServletResponse } from './servlet.js'
import { HttpServletResponseWrapper, parameterMap, unwrapResponse } from './servlet-wrapper.js'
import type { WebRequest } from './spring-web.js'
import { flushOutput } from './tomcat-output.js'

// ---------------------------------------------------------------------------
// DispatcherType
// ---------------------------------------------------------------------------

export type DispatcherType = 'REQUEST' | 'FORWARD' | 'INCLUDE' | 'ERROR' | 'ASYNC'

const dispatcherTypes = new WeakMap<object, DispatcherType>()

/** Type de dispatch de la requête (défini par le serveur pour les dispatchs d'erreur et de forward) */
export function setDispatcherType(request: HttpServletRequest, type: DispatcherType): void {
  dispatcherTypes.set(request, type)
}

/** `request.getDispatcherType()` */
export function dispatcherTypeOf(request: HttpServletRequest): DispatcherType {
  let r: unknown = request
  while (r) {
    const t = dispatcherTypes.get(r as object)
    if (t) return t
    r = typeof (r as { getRequest?: () => unknown }).getRequest === 'function' ? (r as { getRequest: () => unknown }).getRequest() : null
  }
  return 'REQUEST'
}

/** Attributs de requête posés par le conteneur pour un dispatch d'erreur (`jakarta.servlet.RequestDispatcher`) */
export const RequestDispatcher = {
  ERROR_EXCEPTION: 'jakarta.servlet.error.exception',
  ERROR_EXCEPTION_TYPE: 'jakarta.servlet.error.exception_type',
  ERROR_MESSAGE: 'jakarta.servlet.error.message',
  ERROR_REQUEST_URI: 'jakarta.servlet.error.request_uri',
  ERROR_SERVLET_NAME: 'jakarta.servlet.error.servlet_name',
  ERROR_STATUS_CODE: 'jakarta.servlet.error.status_code',
  FORWARD_REQUEST_URI: 'jakarta.servlet.forward.request_uri',
  FORWARD_SERVLET_PATH: 'jakarta.servlet.forward.servlet_path',
} as const

const registrationDispatcherTypes = new WeakMap<FilterRegistrationBean, ReadonlySet<DispatcherType>>()

/** `FilterRegistrationBean.setDispatcherTypes(...)` */
export function setFilterDispatcherTypes(registration: FilterRegistrationBean, types: DispatcherType[]): void {
  registrationDispatcherTypes.set(registration, new Set(types))
}

/** Types de dispatch d'un filtre enregistré (AbstractFilterRegistrationBean.configure) */
export function filterDispatcherTypes(registration: FilterRegistrationBean): ReadonlySet<DispatcherType> {
  const t = registrationDispatcherTypes.get(registration)
  if (t) return t
  if (registration.filter instanceof OncePerRequestFilter) return new Set<DispatcherType>(['REQUEST', 'FORWARD', 'INCLUDE', 'ERROR', 'ASYNC'])
  return new Set<DispatcherType>(['REQUEST'])
}

function removeAttribute(request: HttpServletRequest, name: string): void {
  request.attributes.delete(name)
}

// ---------------------------------------------------------------------------
// GenericFilterBean / OncePerRequestFilter
// ---------------------------------------------------------------------------

/** `org.springframework.web.filter.GenericFilterBean` */
export abstract class GenericFilterBean implements Filter {
  protected readonly logger = KotlinLogging.logger(this.constructor.name)
  /** nom du filtre (FilterConfig) : nom de l'enregistrement ou du bean */
  filterName: string | null = null

  getFilterName(): string {
    return this.filterName ?? this.constructor.name
  }

  abstract doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): void | Promise<void>
}

/** `org.springframework.web.filter.OncePerRequestFilter` */
export abstract class OncePerRequestFilter extends GenericFilterBean {
  static readonly ALREADY_FILTERED_SUFFIX = '.FILTERED'

  async doFilter(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    const alreadyFilteredAttributeName = this.getAlreadyFilteredAttributeName()
    const hasAlreadyFilteredAttribute = request.getAttribute(alreadyFilteredAttributeName) !== null
    if (this.skipDispatch(request) || this.shouldNotFilter(request)) {
      // Proceed without invoking this filter...
      await filterChain.doFilter(request, response)
    } else if (hasAlreadyFilteredAttribute) {
      if (dispatcherTypeOf(request) === 'ERROR') {
        await this.doFilterNestedErrorDispatch(request, response, filterChain)
        return
      }
      // Proceed without invoking this filter...
      await filterChain.doFilter(request, response)
    } else {
      // Do invoke this filter...
      request.setAttribute(alreadyFilteredAttributeName, true)
      try {
        await this.doFilterInternal(request, response, filterChain)
      } finally {
        // Remove the "already filtered" request attribute for this request.
        removeAttribute(request, alreadyFilteredAttributeName)
      }
    }
  }

  private skipDispatch(request: HttpServletRequest): boolean {
    if (this.isAsyncDispatch(request) && this.shouldNotFilterAsyncDispatch()) return true
    if (request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI) !== null && this.shouldNotFilterErrorDispatch()) return true
    return false
  }

  protected isAsyncDispatch(request: HttpServletRequest): boolean {
    return dispatcherTypeOf(request) === 'ASYNC'
  }

  protected getAlreadyFilteredAttributeName(): string {
    return this.getFilterName() + OncePerRequestFilter.ALREADY_FILTERED_SUFFIX
  }

  protected shouldNotFilter(_request: HttpServletRequest): boolean {
    return false
  }

  protected shouldNotFilterAsyncDispatch(): boolean {
    return true
  }

  protected shouldNotFilterErrorDispatch(): boolean {
    return true
  }

  protected abstract doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): void | Promise<void>

  protected async doFilterNestedErrorDispatch(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    await filterChain.doFilter(request, response)
  }
}

// ---------------------------------------------------------------------------
// ServletWebRequest
// ---------------------------------------------------------------------------

const SAFE_METHODS = new Set(['GET', 'HEAD'])

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Dates HTTP acceptées par Tomcat (`FastHttpDateFormat.parseDate`) : RFC 1123, RFC 1036, asctime ; -1 sinon */
export function parseHttpDate(value: string | null): number {
  if (value === null) return -1
  let m = /^[A-Za-z]{3}, (\d{2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(value)
  if (!m) m = /^[A-Za-z]+, (\d{2})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(value)
  let year: number
  let month: number
  let day: number
  let hh: number
  let mm: number
  let ss: number
  if (m) {
    day = Number(m[1])
    month = MONTHS.indexOf(m[2] as string)
    year = Number(m[3])
    if ((m[3] as string).length === 2) year += year < 70 ? 2000 : 1900
    hh = Number(m[4])
    mm = Number(m[5])
    ss = Number(m[6])
  } else {
    const a = /^[A-Za-z]{3} ([A-Za-z]{3}) ([ \d]\d) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(value)
    if (!a) return -1
    month = MONTHS.indexOf(a[1] as string)
    day = Number((a[2] as string).trim())
    hh = Number(a[3])
    mm = Number(a[4])
    ss = Number(a[5])
    year = Number(a[6])
  }
  if (month < 0) return -1
  return Date.UTC(year, month, day, hh, mm, ss)
}

/** `Last-Modified` / en-têtes de date au format HTTP */
export function formatHttpDate(epochMillis: number): string {
  return new Date(Math.floor(epochMillis / 1000) * 1000).toUTCString()
}

function padEtagIfNecessary(etag: string): string {
  if (!etag) return etag
  if ((etag.startsWith('"') || etag.startsWith('W/"')) && etag.endsWith('"')) return etag
  return `"${etag}"`
}

/** `ETag.parse` : liste d'ETag d'un en-tête If-Match / If-None-Match */
function parseETags(source: string): { tag: string; weak: boolean; wildcard: boolean }[] {
  const out: { tag: string; weak: boolean; wildcard: boolean }[] = []
  const re = /\s*(\*|(W\/)?("[^"]*"|[^,\s]+))\s*(,|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null && m[0].length > 0) {
    if (m[1] === '*') out.push({ tag: '*', weak: false, wildcard: true })
    else {
      let t = m[3] as string
      if (!t.startsWith('"')) t = `"${t}"`
      out.push({ tag: t, weak: m[2] !== undefined, wildcard: false })
    }
    if (m[4] === '') break
  }
  return out
}

function eTagStrongMatch(first: string | null, second: string | null): boolean {
  if (!first || !second || first.startsWith('W/') || second.startsWith('W/')) return false
  return first === second
}

function eTagWeakMatch(first: string | null, second: string | null): boolean {
  if (!first || !second) return false
  return (first.startsWith('W/') ? first.slice(2) : first) === (second.startsWith('W/') ? second.slice(2) : second)
}

/** `org.springframework.web.context.request.ServletWebRequest` */
export class ServletWebRequest implements WebRequest {
  private notModified = false

  /** réponse facultative : `ServletWebRequest(request)` (Spring vérifie `getResponse() != null`) */
  private readonly nativeResponse: HttpServletResponse | null

  constructor(
    readonly request: HttpServletRequest,
    response: HttpServletResponse | null = null,
  ) {
    this.nativeResponse = response
  }

  get response(): HttpServletResponse {
    if (this.nativeResponse === null) throw new Error('ServletWebRequest created without response')
    return this.nativeResponse
  }

  getHeader(name: string): string | null {
    return this.request.getHeader(name)
  }

  getParameter(name: string): string | null {
    return this.request.getParameter(name)
  }

  getParameterMap(): Map<string, string[]> {
    return parameterMap(this.request)
  }

  isNotModified(): boolean {
    return this.notModified
  }

  /** `checkNotModified(lastModified)`, `checkNotModified(etag)`, `checkNotModified(etag, lastModified)` */
  checkNotModified(etagOrLastModified: string | number | null, lastModified?: number): boolean {
    // PORT: surcharges Java réunies
    const eTag = typeof etagOrLastModified === 'string' ? etagOrLastModified : null
    const lastModifiedTimestamp = typeof etagOrLastModified === 'number' ? etagOrLastModified : (lastModified ?? -1)
    const response = this.nativeResponse
    if (this.notModified || (response !== null && response.status !== 200)) return this.notModified
    // Evaluate conditions in order of precedence.
    // See https://datatracker.ietf.org/doc/html/rfc9110#section-13.2.2
    if (this.validateIfMatch(eTag)) {
      this.updateResponseStateChanging(eTag, lastModifiedTimestamp)
      return this.notModified
    }
    // 2) If-Unmodified-Since
    if (this.validateIfUnmodifiedSince(lastModifiedTimestamp)) {
      this.updateResponseStateChanging(eTag, lastModifiedTimestamp)
      return this.notModified
    }
    // 3) If-None-Match
    if (!this.validateIfNoneMatch(eTag)) {
      // 4) If-Modified-Since
      this.validateIfModifiedSince(lastModifiedTimestamp)
    }
    this.updateResponseIdempotent(eTag, lastModifiedTimestamp)
    return this.notModified
  }

  private validateIfMatch(eTag: string | null): boolean {
    const ifMatchHeaders = this.request.getHeaders('If-Match')
    if (SAFE_METHODS.has(this.request.method) || ifMatchHeaders.length === 0) return false
    this.notModified = this.matchRequestedETags(ifMatchHeaders, eTag, false)
    return true
  }

  private validateIfNoneMatch(eTag: string | null): boolean {
    const ifNoneMatchHeaders = this.request.getHeaders('If-None-Match')
    if (ifNoneMatchHeaders.length === 0) return false
    this.notModified = !this.matchRequestedETags(ifNoneMatchHeaders, eTag, true)
    return true
  }

  private matchRequestedETags(requestedETagValues: string[], tag: string | null, weakCompare: boolean): boolean {
    if (tag) tag = padEtagIfNecessary(tag)
    const isNotSafeMethod = !SAFE_METHODS.has(this.request.method)
    for (const v of requestedETagValues) {
      for (const requestedETag of parseETags(v)) {
        // only consider "lost updates" checks for unsafe HTTP methods
        if (requestedETag.wildcard && tag && isNotSafeMethod) return false
        const formatted = requestedETag.weak ? `W/${requestedETag.tag}` : requestedETag.tag
        if (weakCompare) {
          if (eTagWeakMatch(tag, formatted)) return false
        } else if (eTagStrongMatch(tag, formatted)) return false
      }
    }
    return true
  }

  private parseDateHeader(name: string): number {
    const value = this.request.getHeader(name)
    const d = parseHttpDate(value)
    if (d !== -1 || value === null) return d
    // Possibly an IE 10 style value: "Wed, 09 Apr 2014 09:57:42 GMT; length=13774"
    const separatorIndex = value.indexOf(';')
    return separatorIndex !== -1 ? parseHttpDate(value.slice(0, separatorIndex)) : -1
  }

  private validateIfUnmodifiedSince(lastModifiedTimestamp: number): boolean {
    if (lastModifiedTimestamp < 0) return false
    const ifUnmodifiedSince = this.parseDateHeader('If-Unmodified-Since')
    if (ifUnmodifiedSince === -1) return false
    // We will perform this validation...
    this.notModified = ifUnmodifiedSince < Math.floor(lastModifiedTimestamp / 1000) * 1000
    return true
  }

  private validateIfModifiedSince(lastModifiedTimestamp: number): boolean {
    if (lastModifiedTimestamp < 0) return false
    const ifModifiedSince = this.parseDateHeader('If-Modified-Since')
    if (ifModifiedSince === -1) return false
    // We will perform this validation...
    this.notModified = ifModifiedSince >= Math.floor(lastModifiedTimestamp / 1000) * 1000
    return true
  }

  private updateResponseStateChanging(eTag: string | null, lastModifiedTimestamp: number): void {
    if (this.notModified && this.nativeResponse !== null) this.nativeResponse.setStatus(412)
    else this.addCachingResponseHeaders(eTag, lastModifiedTimestamp)
  }

  private updateResponseIdempotent(eTag: string | null, lastModifiedTimestamp: number): void {
    if (this.nativeResponse !== null) {
      const isHttpGetOrHead = SAFE_METHODS.has(this.request.method)
      if (this.notModified) this.nativeResponse.setStatus(isHttpGetOrHead ? 304 : 412)
      this.addCachingResponseHeaders(eTag, lastModifiedTimestamp)
    }
  }

  private addCachingResponseHeaders(eTag: string | null, lastModifiedTimestamp: number): void {
    const response = this.nativeResponse
    if (response !== null && SAFE_METHODS.has(this.request.method)) {
      if (lastModifiedTimestamp > 0 && parseHttpDate(response.getHeader('Last-Modified')) === -1)
        response.setHeader('Last-Modified', formatHttpDate(lastModifiedTimestamp))
      if (eTag && response.getHeader('ETag') === null) response.setHeader('ETag', padEtagIfNecessary(eTag))
    }
  }
}

// ---------------------------------------------------------------------------
// ContentCachingResponseWrapper / ShallowEtagHeaderFilter
// ---------------------------------------------------------------------------

/** `org.springframework.web.util.ContentCachingResponseWrapper` : corps mis en tampon jusqu'à copyBodyToResponse */
export class ContentCachingResponseWrapper extends HttpServletResponseWrapper {
  declare private content: Buffer[]
  declare private ended: boolean
  declare private stream: Writable | null
  declare private contentLength: number | null
  declare private finished: Promise<void> | null
  declare private resolveFinished: (() => void) | null

  constructor(response: HttpServletResponse) {
    super(response)
    this.content = []
    this.ended = false
    this.stream = null
    this.contentLength = null
    this.finished = null
    this.resolveFinished = null
  }

  override get isCommitted(): boolean {
    return this.getResponse().isCommitted
  }

  override commit(): void {
    // PORT: les en-têtes ne partent qu'à copyBodyToResponse
  }

  override setHeader(name: string, value: string): void {
    if (name.toLowerCase() === 'content-length') this.contentLength = Number(value)
    else this.getResponse().setHeader(name, value)
  }

  override addHeader(name: string, value: string): void {
    if (name.toLowerCase() === 'content-length') this.contentLength = Number(value)
    else this.getResponse().addHeader(name, value)
  }

  override getHeader(name: string): string | null {
    if (name.toLowerCase() === 'content-length') return this.contentLength !== null ? String(this.contentLength) : null
    return this.getResponse().getHeader(name)
  }

  override containsHeader(name: string): boolean {
    if (name.toLowerCase() === 'content-length') return this.contentLength !== null
    return this.getResponse().containsHeader(name)
  }

  override send(body?: string | Uint8Array): void {
    if (body !== undefined) this.content.push(typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body))
    this.ended = true
    this.resolveFinished?.()
  }

  override getOutputStream(): Writable {
    if (this.stream) return this.stream
    const self = this
    this.finished = new Promise<void>((r) => {
      self.resolveFinished = r
    })
    this.stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        self.content.push(Buffer.from(chunk))
        cb()
      },
      final(cb) {
        self.ended = true
        self.resolveFinished?.()
        cb()
      },
    })
    this.stream.on('close', () => self.resolveFinished?.())
    ;(this.stream as unknown as { flushBuffer: () => void }).flushBuffer = () => {}
    return this.stream
  }

  override sendError(status: number, message?: string): void {
    this.content = []
    this.getResponse().sendError(status, message)
  }

  /** Attend la fin de l'écriture en flux (corps asynchrone) */
  async whenWritten(): Promise<void> {
    if (this.finished && !this.ended) await this.finished
  }

  getContentAsByteArray(): Buffer {
    return Buffer.concat(this.content)
  }

  getContentSize(): number {
    return this.content.reduce((s, b) => s + b.length, 0)
  }

  /** `copyBodyToResponse()` : Content-Length, puis corps sur la réponse d'origine */
  copyBodyToResponse(): void {
    const raw = this.getResponse()
    if (raw.attributesForError !== null) return
    const body = this.getContentAsByteArray()
    if (!raw.isCommitted) {
      if (body.length > 0 || this.contentLength !== null) {
        if (raw.getHeader('Transfer-Encoding') === null) raw.setHeader('Content-Length', String(body.length > 0 ? body.length : (this.contentLength as number)))
      }
      this.contentLength = null
    }
    if (body.length > 0 || this.ended) {
      const out = raw.getOutputStream()
      if (body.length > 0) out.write(body)
      flushOutput(out)
      out.end()
    }
    this.content = []
  }
}

const STREAMING_ATTRIBUTE = 'org.springframework.web.filter.ShallowEtagHeaderFilter.STREAMING'

/** `org.springframework.web.filter.ShallowEtagHeaderFilter` */
export class ShallowEtagHeaderFilter extends OncePerRequestFilter {
  private static readonly DIRECTIVE_NO_STORE = 'no-store'
  writeWeakETag = false

  protected override shouldNotFilterAsyncDispatch(): boolean {
    return false
  }

  protected async doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    let responseToUse = response
    if (!this.isAsyncDispatch(request) && !(response instanceof ContentCachingResponseWrapper)) responseToUse = new ContentCachingResponseWrapper(response)
    await filterChain.doFilter(request, responseToUse)
    if (responseToUse instanceof ContentCachingResponseWrapper) await responseToUse.whenWritten()
    if (!ShallowEtagHeaderFilter.isContentCachingDisabled(request)) this.updateResponse(request, responseToUse)
    else if (responseToUse instanceof ContentCachingResponseWrapper) responseToUse.copyBodyToResponse()
  }

  private updateResponse(request: HttpServletRequest, response: HttpServletResponse): void {
    if (!(response instanceof ContentCachingResponseWrapper)) return
    const wrapper = response
    const rawResponse = wrapper.getResponse()
    if (this.isEligibleForEtag(request, wrapper, wrapper.status)) {
      let eTag = wrapper.getHeader('ETag')
      if (!eTag) {
        eTag = this.generateETagHeaderValue(wrapper.getContentAsByteArray(), this.writeWeakETag)
        rawResponse.setHeader('ETag', eTag)
      }
      if (new ServletWebRequest(request, rawResponse).checkNotModified(eTag)) return
    }
    wrapper.copyBodyToResponse()
  }

  protected isEligibleForEtag(request: HttpServletRequest, response: HttpServletResponse, responseStatusCode: number): boolean {
    if (!response.isCommitted && responseStatusCode >= 200 && responseStatusCode < 300 && request.method === 'GET') {
      const cacheControl = response.getHeader('Cache-Control')
      return cacheControl === null || !cacheControl.includes(ShallowEtagHeaderFilter.DIRECTIVE_NO_STORE)
    }
    return false
  }

  protected generateETagHeaderValue(content: Uint8Array, isWeak: boolean): string {
    // length of W/ + " + 0 + 32bits md5 hash + "
    return `${isWeak ? 'W/' : ''}"0${createHash('md5').update(content).digest('hex')}"`
  }

  /** `ShallowEtagHeaderFilter.disableContentCaching(request)` */
  static disableContentCaching(request: HttpServletRequest): void {
    request.setAttribute(STREAMING_ATTRIBUTE, true)
  }

  private static isContentCachingDisabled(request: HttpServletRequest): boolean {
    return request.getAttribute(STREAMING_ATTRIBUTE) !== null
  }
}

// ---------------------------------------------------------------------------
// CommonsRequestLoggingFilter / ForwardedHeaderFilter
// ---------------------------------------------------------------------------

/** `org.springframework.web.filter.CommonsRequestLoggingFilter` (AbstractRequestLoggingFilter) */
export class CommonsRequestLoggingFilter extends OncePerRequestFilter {
  private includeQueryString = false
  private includePayload = false
  private maxPayloadLength = 50
  private includeHeaders = false
  private includeClientInfo = false
  private beforeMessagePrefix = 'Before request ['
  private beforeMessageSuffix = ']'
  private afterMessagePrefix = 'After request ['
  private afterMessageSuffix = ']'
  private readonly log = KotlinLogging.logger('org.springframework.web.filter.CommonsRequestLoggingFilter')

  setIncludeQueryString(v: boolean): void {
    this.includeQueryString = v
  }
  setIncludePayload(v: boolean): void {
    this.includePayload = v
  }
  setMaxPayloadLength(v: number): void {
    this.maxPayloadLength = v
  }
  setIncludeHeaders(v: boolean): void {
    this.includeHeaders = v
  }
  setBeforeMessagePrefix(v: string): void {
    this.beforeMessagePrefix = v
  }
  setAfterMessagePrefix(v: string): void {
    this.afterMessagePrefix = v
  }

  protected override shouldNotFilterAsyncDispatch(): boolean {
    return false
  }

  private createMessage(request: HttpServletRequest, prefix: string, suffix: string): string {
    let msg = `${prefix}${request.method} ${request.requestURI}`
    if (this.includeQueryString && request.queryString !== null) msg += `?${request.queryString}`
    if (this.includeClientInfo) {
      const client = request.remoteAddr
      if (client) msg += `, client=${client}`
      const session = request.getSession(false)
      if (session !== null) msg += `, session=${session.id}`
      const user = request.userPrincipal?.getName() ?? null
      if (user !== null) msg += `, user=${user}`
    }
    // ServletServerHttpRequest.getHeaders() : noms dans la casse reçue ; HttpHeaders.toString() (formatHeaders)
    if (this.includeHeaders) msg += `, headers=[${rawHeaderNames(request).map((n) => `${n}:${request.getHeaders(n).map((v) => `"${v}"`).join(', ')}`).join(', ')}]`
    if (this.includePayload && request.body.length > 0) msg += `, payload=${request.body.subarray(0, this.maxPayloadLength).toString('utf8')}`
    return msg + suffix
  }

  protected async doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    this.log.debug(() => this.createMessage(request, this.beforeMessagePrefix, this.beforeMessageSuffix))
    try {
      await filterChain.doFilter(request, response)
    } finally {
      this.log.debug(() => this.createMessage(request, this.afterMessagePrefix, this.afterMessageSuffix))
    }
  }
}

/**
 * `org.springframework.web.filter.ForwardedHeaderFilter` (server.forward-headers-strategy=framework).
 * PORT: les en-têtes X-Forwarded-* sont déjà appliqués par HttpServletRequest (port/servlet.ts) ;
 * le filtre ne fait que passer la main, il existe pour son ordre dans la chaîne.
 */
export class ForwardedHeaderFilter extends OncePerRequestFilter {
  protected override shouldNotFilterAsyncDispatch(): boolean {
    return false
  }
  protected override shouldNotFilterErrorDispatch(): boolean {
    return false
  }
  protected async doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    await filterChain.doFilter(request, response)
  }
}

export { unwrapResponse }

/** Noms d'en-têtes uniques dans la casse reçue (Tomcat getHeaderNames) */
function rawHeaderNames(request: HttpServletRequest): string[] {
  const raw = request.raw.rawHeaders ?? []
  const names: string[] = []
  for (let i = 0; i < raw.length; i += 2) {
    const n = raw[i] as string
    if (!names.some((it) => it.toLowerCase() === n.toLowerCase())) names.push(n)
  }
  return names.length > 0 ? names : request.getHeaderNames()
}
