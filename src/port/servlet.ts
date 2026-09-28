// Support de portage : sous-ensemble de l'API Jakarta Servlet (Tomcat embarqué de Spring Boot) sur node:http.
// HttpServletRequest / HttpServletResponse / Cookie / HttpSession, avec server.forward-headers-strategy=framework
// (X-Forwarded-*), server.servlet.context-path, requêtes < 10 Mo en mémoire (multipart compris).
// Ce fichier n'a pas de jumeau Kotlin.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable, type Writable } from 'node:stream'
import { Exception } from './kotlin.js'

export class Cookie {
  maxAge = -1
  path: string | null = null
  domain: string | null = null
  secure = false
  httpOnly = false
  sameSite: string | null = null

  constructor(
    readonly name: string,
    public value: string,
  ) {}

  /** En-tête Set-Cookie au format de Tomcat (Rfc6265CookieProcessor) */
  toHeader(): string {
    let h = `${this.name}=${this.value}`
    if (this.maxAge >= 0) {
      h += `; Max-Age=${this.maxAge}`
      h += `; Expires=${this.maxAge === 0 ? 'Thu, 01 Jan 1970 00:00:10 GMT' : new Date(Date.now() + this.maxAge * 1000).toUTCString()}`
    }
    if (this.domain) h += `; Domain=${this.domain}`
    if (this.path) h += `; Path=${this.path}`
    if (this.secure) h += '; Secure'
    if (this.httpOnly) h += '; HttpOnly'
    if (this.sameSite) h += `; SameSite=${this.sameSite}`
    return h
  }
}

/** Fichier reçu en multipart (`org.springframework.web.multipart.MultipartFile`) */
export class MultipartFile {
  constructor(
    readonly name: string,
    readonly originalFilename: string | null,
    readonly contentType: string | null,
    readonly bytes: Uint8Array,
  ) {}
  get size(): number {
    return this.bytes.length
  }
  isEmpty(): boolean {
    return this.bytes.length === 0
  }
  getInputStream(): Readable {
    return Readable.from(Buffer.from(this.bytes))
  }
}

export class MaxUploadSizeExceededException extends Exception {}

export interface HttpSession {
  readonly id: string
  getAttribute(name: string): unknown
  setAttribute(name: string, value: unknown): void
  removeAttribute(name: string): void
  invalidate(): void
  readonly creationTime: number
  lastAccessedTime: number
  maxInactiveInterval: number
  readonly isNew: boolean
}

/** Fournit les sessions (équivalent du SessionRepositoryFilter de Spring Session) */
export interface SessionProvider {
  getSession(request: HttpServletRequest, create: boolean): HttpSession | null
}

function parseCookies(header: string | undefined): Cookie[] {
  if (!header) return []
  return header
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.includes('='))
    .map((p) => {
      const i = p.indexOf('=')
      let v = p.slice(i + 1)
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      return new Cookie(p.slice(0, i), v)
    })
}

export class HttpServletRequest {
  readonly attributes = new Map<string, unknown>()
  readonly method: string
  private readonly url: URL
  /** Paramètres de requête et de formulaire (application/x-www-form-urlencoded) */
  readonly parameters = new Map<string, string[]>()
  readonly parts = new Map<string, MultipartFile[]>()
  readonly cookies: Cookie[]
  sessionProvider: SessionProvider | null = null
  private session: HttpSession | null | undefined = undefined
  /** Principal authentifié (SecurityContextHolderAwareRequestWrapper) */
  userPrincipal: { getName(): string } | null = null

  constructor(
    readonly raw: IncomingMessage,
    readonly body: Buffer,
    readonly contextPath: string = '',
  ) {
    this.method = (raw.method ?? 'GET').toUpperCase()
    // server.forward-headers-strategy=framework : ForwardedHeaderFilter
    const proto = this.firstForwarded('x-forwarded-proto') ?? ((raw.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http')
    const host = this.firstForwarded('x-forwarded-host') ?? raw.headers.host ?? 'localhost'
    const port = this.firstForwarded('x-forwarded-port')
    const prefix = this.firstForwarded('x-forwarded-prefix') ?? ''
    this.url = new URL(`${proto}://${host}${port && !host.includes(':') ? `:${port}` : ''}${prefix.replace(/\/$/, '')}${raw.url ?? '/'}`)
    for (const [k, v] of this.url.searchParams) this.addParam(k, v)
    const ct = this.contentType ?? ''
    if (ct.startsWith('application/x-www-form-urlencoded') && this.method !== 'GET')
      for (const [k, v] of new URLSearchParams(body.toString('latin1'))) this.addParam(k, v)
    if (ct.startsWith('multipart/form-data')) this.parseMultipart(ct)
    this.cookies = parseCookies(raw.headers.cookie)
  }

  private firstForwarded(name: string): string | null {
    const v = this.raw.headers[name]
    const s = Array.isArray(v) ? v[0] : v
    return s ? (s.split(',')[0] as string).trim() : null
  }

  private addParam(k: string, v: string): void {
    const l = this.parameters.get(k)
    if (l) l.push(v)
    else this.parameters.set(k, [v])
  }

  private parseMultipart(ct: string): void {
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct)
    if (!m) return
    const boundary = Buffer.from(`--${m[1] ?? m[2]}`)
    let pos = this.body.indexOf(boundary)
    while (pos >= 0) {
      const start = pos + boundary.length
      if (this.body.subarray(start, start + 2).toString() === '--') break
      const headerEnd = this.body.indexOf('\r\n\r\n', start)
      if (headerEnd < 0) break
      const headers = this.body.subarray(start + 2, headerEnd).toString('utf8')
      const next = this.body.indexOf(boundary, headerEnd + 4)
      if (next < 0) break
      const content = this.body.subarray(headerEnd + 4, next - 2)
      const disp = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headers)?.[1] ?? ''
      const name = /\bname="([^"]*)"/i.exec(disp)?.[1] ?? ''
      const filename = /\bfilename="([^"]*)"/i.exec(disp)?.[1]
      const partType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() ?? null
      if (filename !== undefined) {
        const f = new MultipartFile(name, filename, partType, new Uint8Array(content))
        const l = this.parts.get(name)
        if (l) l.push(f)
        else this.parts.set(name, [f])
      } else this.addParam(name, content.toString('utf8'))
      pos = next
    }
  }

  getHeader(name: string): string | null {
    const v = this.raw.headers[name.toLowerCase()]
    if (v === undefined) return null
    return Array.isArray(v) ? (v[0] ?? null) : v
  }

  getHeaders(name: string): string[] {
    const v = this.raw.headers[name.toLowerCase()]
    if (v === undefined) return []
    return Array.isArray(v) ? v : [v]
  }

  getHeaderNames(): string[] {
    return Object.keys(this.raw.headers)
  }

  getParameter(name: string): string | null {
    return this.parameters.get(name)?.[0] ?? null
  }

  getParameterValues(name: string): string[] | null {
    return this.parameters.get(name) ?? null
  }

  getCookies(): Cookie[] {
    return this.cookies
  }

  get contentType(): string | null {
    return this.getHeader('content-type')
  }

  /** URI décodée de la requête, sans la chaîne de requête (Tomcat : getRequestURI n'est pas décodée) */
  get requestURI(): string {
    return this.url.pathname
  }

  /** Chemin dans l'application (sans le context-path), décodé */
  get servletPath(): string {
    const p = decodeURIComponentSafe(this.url.pathname)
    return this.contextPath && p.startsWith(this.contextPath) ? p.slice(this.contextPath.length) || '/' : p
  }

  get queryString(): string | null {
    const q = this.url.search
    return q ? q.slice(1) : null
  }

  get requestURL(): string {
    return `${this.url.protocol}//${this.url.host}${this.url.pathname}`
  }

  get scheme(): string {
    return this.url.protocol.slice(0, -1)
  }

  get serverName(): string {
    return this.url.hostname
  }

  get serverPort(): number {
    return this.url.port ? Number(this.url.port) : this.scheme === 'https' ? 443 : 80
  }

  get isSecure(): boolean {
    return this.scheme === 'https'
  }

  get remoteAddr(): string {
    // ForwardedHeaderFilter ne modifie pas remoteAddr ; RemoteIpValve n'est pas activé en mode framework
    return javaHostAddress(this.raw.socket.remoteAddress ?? '')
  }

  getInputStream(): Readable {
    return Readable.from(this.body)
  }

  getSession(create = true): HttpSession | null {
    if (this.session !== undefined && (this.session !== null || !create)) return this.session
    this.session = this.sessionProvider?.getSession(this, create) ?? null
    return this.session
  }

  /** Session déjà résolue, sans en créer */
  peekSession(): HttpSession | null {
    return this.session ?? null
  }

  resetSessionCache(): void {
    this.session = undefined
  }

  getAttribute(name: string): unknown {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: unknown): void {
    this.attributes.set(name, value)
  }
}

export function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export class HttpServletResponse {
  status = 200
  private readonly headers = new Map<string, string[]>()
  private committed = false
  /** Hooks exécutés juste avant l'envoi des en-têtes (SessionRepositoryFilter, en-têtes de sécurité…) */
  readonly beforeCommit: (() => void)[] = []

  constructor(readonly raw: ServerResponse) {}

  setStatus(status: number): void {
    this.status = status
  }

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), [value])
  }

  addHeader(name: string, value: string): void {
    const l = this.headers.get(name.toLowerCase())
    if (l) l.push(value)
    else this.headers.set(name.toLowerCase(), [value])
  }

  getHeader(name: string): string | null {
    return this.headers.get(name.toLowerCase())?.[0] ?? null
  }

  getHeaders(name: string): string[] {
    return this.headers.get(name.toLowerCase()) ?? []
  }

  containsHeader(name: string): boolean {
    return this.headers.has(name.toLowerCase())
  }

  removeHeader(name: string): void {
    this.headers.delete(name.toLowerCase())
  }

  setContentType(ct: string): void {
    this.setHeader('Content-Type', ct)
  }

  get contentType(): string | null {
    return this.getHeader('content-type')
  }

  addCookie(c: Cookie): void {
    // comme Tomcat : addCookie = addHeader("Set-Cookie"), dans l'ordre avec les Set-Cookie écrits directement
    // (DefaultCookieSerializer de Spring Session)
    this.addHeader('Set-Cookie', c.toHeader())
  }

  get isCommitted(): boolean {
    return this.committed || this.raw.headersSent
  }

  /** Envoie statut et en-têtes (une seule fois) */
  commit(): void {
    if (this.isCommitted) return
    for (const h of this.beforeCommit.splice(0)) h()
    this.committed = true
    for (const [k, v] of this.headers) this.raw.setHeader(canonicalHeaderName(k), v.length === 1 ? (v[0] as string) : v)
    this.raw.statusCode = this.status
  }

  /** Corps complet */
  send(body?: string | Uint8Array): void {
    this.commit()
    this.raw.end(body)
  }

  /** Flux de sortie (StreamingResponseBody, ressources) */
  getOutputStream(): Writable {
    this.commit()
    return this.raw
  }

  sendError(status: number, message?: string): void {
    this.status = status
    this.attributesForError = { status, message: message ?? null }
  }

  /** Erreur demandée par sendError, rendue par le gestionnaire d'erreurs (BasicErrorController) */
  attributesForError: { status: number; message: string | null } | null = null

  sendRedirect(location: string): void {
    this.status = 302
    this.setHeader('Location', location)
    this.send()
  }
}

/** Casse des en-têtes telle que Tomcat les renvoie (Content-Type, X-Frame-Options…) */
export function canonicalHeaderName(k: string): string {
  const special: Record<string, string> = { etag: 'ETag', 'www-authenticate': 'WWW-Authenticate', 'x-xss-protection': 'X-XSS-Protection' }
  return special[k] ?? k.replace(/(^|-)([a-z])/g, (_, d: string, c: string) => d + c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Filtres (jakarta.servlet.Filter) et leur enregistrement (FilterRegistrationBean / @Order)
// ---------------------------------------------------------------------------

export interface FilterChain {
  doFilter(request: HttpServletRequest, response: HttpServletResponse): Promise<void>
}

export interface Filter {
  doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): void | Promise<void>
}

/**
 * Filtre enregistré dans le conteneur : ordre croissant (Ordered), motifs d'URL servlet (`/*`, `/api/*`…).
 * Ordres de Spring Boot : ForwardedHeaderFilter -2147483648, CharacterEncoding -2147483648,
 * SessionRepositoryFilter -2147483598 (Integer.MIN_VALUE + 50), FilterChainProxy (sécurité) -100.
 */
export class FilterRegistrationBean {
  constructor(
    readonly filter: Filter,
    readonly order: number = 0,
    readonly urlPatterns: string[] = ['/*'],
    readonly name: string = filter.constructor.name,
  ) {}

  matches(servletPath: string): boolean {
    return this.urlPatterns.some((p) => {
      if (p === '/*' || p === '/') return true
      if (p.endsWith('/*')) return servletPath === p.slice(0, -2) || servletPath.startsWith(p.slice(0, -1))
      if (p.startsWith('*.')) return servletPath.endsWith(p.slice(1))
      return servletPath === p
    })
  }
}

/** Chaîne de filtres ordonnée, terminée par la servlet (DispatcherServlet) */
export function buildFilterChain(
  filters: FilterRegistrationBean[],
  servlet: (req: HttpServletRequest, res: HttpServletResponse) => Promise<void>,
): FilterChain {
  const sorted = [...filters].sort((a, b) => a.order - b.order)
  const at = (i: number): FilterChain => ({
    async doFilter(req, res) {
      let j = i
      while (j < sorted.length && !(sorted[j] as FilterRegistrationBean).matches(req.servletPath)) j++
      if (j >= sorted.length) return servlet(req, res)
      await (sorted[j] as FilterRegistrationBean).filter.doFilter(req, res, at(j + 1))
    },
  })
  return at(0)
}

/**
 * `InetAddress.getHostAddress()` : IPv6 en 8 groupes hexadécimaux non compressés ("0:0:0:0:0:0:0:1"),
 * IPv4 mappée ("::ffff:1.2.3.4") rendue en IPv4 comme le fait Java.
 */
export function javaHostAddress(addr: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr)
  if (mapped) return mapped[1] as string
  if (!addr.includes(':')) return addr
  const [head, tail] = addr.split('%') as [string, string | undefined]
  let groups: string[]
  if (head.includes('::')) {
    const [l, r] = head.split('::') as [string, string]
    const left = l ? l.split(':') : []
    const right = r ? r.split(':') : []
    groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
  } else groups = head.split(':')
  return groups.map((g) => parseInt(g, 16).toString(16)).join(':') + (tail !== undefined ? `%${tail}` : '')
}
