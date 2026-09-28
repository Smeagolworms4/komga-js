// Support de portage : org.springframework.web.util.UriComponentsBuilder / UriComponents et
// org.springframework.web.servlet.support.ServletUriComponentsBuilder (Spring 6.2), tels qu'utilisés par Komga
// (OPDS, WebPub, Kobo, point d'entrée d'authentification OPDS). La requête courante vient de RequestContextHolder
// (RequestContextFilter puis DispatcherServlet) ; les en-têtes X-Forwarded-* sont déjà appliqués (ForwardedHeaderFilter).
// Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException, IllegalStateException } from './kotlin.js'
import type { HttpServletRequest } from './servlet.js'
import { RequestContextHolder } from './spring-web-dispatcher.js'

// Encodage de UriComponents.encode() (HierarchicalUriComponents.Type)
const UNRESERVED = /[A-Za-z0-9\-._~]/
const SUB_DELIMS = /[!$&'()*+,;=]/

function encodeComponent(s: string, allowed: (c: string) => boolean): string {
  let out = ''
  for (const b of Buffer.from(s, 'utf8')) {
    const c = String.fromCharCode(b)
    if (b < 0x80 && allowed(c)) out += c
    else out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

const isPchar = (c: string) => UNRESERVED.test(c) || SUB_DELIMS.test(c) || c === ':' || c === '@'
const isQueryParam = (c: string) => (isPchar(c) || c === '/' || c === '?') && c !== '=' && c !== '&'
const isQuery = (c: string) => isPchar(c) || c === '/' || c === '?'
const isFragment = isQuery
/** `/` à l'intérieur d'un segment ajouté par pathSegment (encodé %2F, jamais séparateur) */
const SEGMENT_SLASH = '\u0001'

/** `org.springframework.web.util.UriComponents` */
export class UriComponents {
  constructor(
    readonly scheme: string | null,
    readonly userInfo: string | null,
    readonly host: string | null,
    readonly port: number,
    readonly path: string,
    readonly queryParams: [string, string | null][],
    readonly fragment: string | null,
    private readonly encoded: boolean,
  ) {}

  /** `encode()` : encodage des composants selon leurs caractères autorisés */
  encode(): UriComponents {
    if (this.encoded) return this
    return new UriComponents(
      this.scheme,
      this.userInfo,
      this.host,
      this.port,
      this.path
        .split('/')
        .map((seg) => encodeComponent(seg, isPchar).replaceAll('%01', '%2F'))
        .join('/'),
      this.queryParams.map(([k, v]) => [encodeComponent(k, isQueryParam), v === null ? null : encodeComponent(v, isQueryParam)]),
      this.fragment === null ? null : encodeComponent(this.fragment, isFragment),
      true,
    )
  }

  /** `expand(vararg values)` / `expand(map)` */
  expand(...values: unknown[]): UriComponents {
    const map = values.length === 1 && values[0] instanceof Map ? (values[0] as Map<string, unknown>) : null
    let i = 0
    const sub = (s: string | null) =>
      s === null
        ? null
        : s.replace(/\{([^}:]+)(?::[^}]*)?\}/g, (_m, name: string) => {
            const v = map ? map.get(name) : values[i++]
            if (v === undefined) throw new IllegalArgumentException(`Not enough variable values available to expand '${name}'`)
            return v === null ? '' : String(v)
          })
    return new UriComponents(
      sub(this.scheme),
      sub(this.userInfo),
      sub(this.host),
      this.port,
      sub(this.path) as string,
      this.queryParams.map(([k, v]) => [sub(k) as string, sub(v)]),
      sub(this.fragment),
      this.encoded,
    )
  }

  get query(): string | null {
    if (this.queryParams.length === 0) return null
    return this.queryParams.map(([k, v]) => (v === null ? k : `${k}=${v}`)).join('&')
  }

  toUriString(): string {
    let s = ''
    if (this.scheme !== null) s += `${this.scheme}:`
    if (this.userInfo !== null || this.host !== null) {
      s += '//'
      if (this.userInfo !== null) s += `${this.userInfo}@`
      if (this.host !== null) s += this.host
      if (this.port !== -1) s += `:${this.port}`
    }
    if (this.path) {
      const path = this.path.replaceAll(SEGMENT_SLASH, '/')
      if (s && !path.startsWith('/')) s += '/'
      s += path
    }
    const q = this.query
    if (q !== null) s += `?${q}`
    if (this.fragment !== null) s += `#${this.fragment}`
    return s
  }

  /** `toUri()` : `java.net.URI` -> chaîne (PORT) */
  toUri(): string {
    return this.encode().toUriString()
  }

  toString(): string {
    return this.toUriString()
  }
}

/** `org.springframework.web.util.UriComponentsBuilder` */
export class UriComponentsBuilder {
  protected _scheme: string | null = null
  protected _userInfo: string | null = null
  protected _host: string | null = null
  protected _port = -1
  protected _path = ''
  /** dernier constructeur de chemin = PathSegmentComponentBuilder (pathSegment) */
  protected _lastSegment = false
  protected _query: [string, string | null][] = []
  protected _fragment: string | null = null

  static newInstance(): UriComponentsBuilder {
    return new UriComponentsBuilder()
  }

  /** `fromUriString` : `scheme://userinfo@host:port/path?query#fragment` (variables `{x}` conservées) */
  static fromUriString(uri: string): UriComponentsBuilder {
    const m = /^(?:([a-zA-Z][a-zA-Z0-9+.-]*):)?(?:\/\/(?:([^@/?#]*)@)?(\[[^\]]*\]|[^:/?#]*)(?::(\d*|\{[^}]*\}))?)?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(uri)
    if (!m) throw new IllegalArgumentException(`[${uri}] is not a valid URI`)
    const b = new UriComponentsBuilder()
    b._scheme = m[1] ?? null
    b._userInfo = m[2] ?? null
    b._host = m[3] !== undefined && m[3] !== '' ? m[3] : null
    if (m[4]) b._port = /^\d+$/.test(m[4]) ? Number(m[4]) : -1
    b._path = m[5] ?? ''
    if (m[6] !== undefined) b.query(m[6])
    b._fragment = m[7] ?? null
    return b
  }

  static fromHttpUrl(url: string): UriComponentsBuilder {
    return UriComponentsBuilder.fromUriString(url)
  }

  static fromPath(path: string): UriComponentsBuilder {
    return new UriComponentsBuilder().path(path)
  }

  scheme(scheme: string | null): this {
    this._scheme = scheme
    return this
  }

  host(host: string | null): this {
    this._host = host
    return this
  }

  port(port: number): this {
    this._port = port
    return this
  }

  userInfo(userInfo: string | null): this {
    this._userInfo = userInfo
    return this
  }

  /** `path(p)` : ajouté au chemin courant (un seul `/` entre les deux) */
  path(path: string): this {
    if (!path) return this
    // CompositePathComponentBuilder.addPath : après pathSegment(), le chemin ajouté commence par « / »
    if (this._lastSegment && !path.startsWith('/')) path = `/${path}`
    this._lastSegment = false
    if (this._path.endsWith('/') && path.startsWith('/')) this._path += path.slice(1)
    else this._path += path
    return this
  }

  replacePath(path: string | null): this {
    this._path = path ?? ''
    this._lastSegment = false
    return this
  }

  /** `pathSegment(vararg segments)` : segments ajoutés, séparés par `/` */
  pathSegment(...segments: string[]): this {
    const segs = segments.filter((s) => s !== '')
    if (segs.length === 0) return this
    let p = this._path
    if (!p.endsWith('/')) p += '/'
    this._path = p + segs.map((s) => s.replaceAll('/', SEGMENT_SLASH)).join('/')
    this._lastSegment = true
    return this
  }

  query(query: string | null): this {
    if (query === null) return this
    for (const part of query.split('&')) {
      if (!part) continue
      const eq = part.indexOf('=')
      this._query.push(eq < 0 ? [part, null] : [part.slice(0, eq), part.slice(eq + 1)])
    }
    return this
  }

  replaceQuery(query: string | null): this {
    this._query = []
    return this.query(query)
  }

  queryParam(name: string, ...values: unknown[]): this {
    if (values.length === 0) this._query.push([name, null])
    for (const v of values) this._query.push([name, v === null || v === undefined ? null : String(v)])
    return this
  }

  /** `queryParamIfPresent(name, Optional)` : une collection ajoute chacune de ses valeurs (aucune : nom seul) */
  queryParamIfPresent(name: string, value: unknown): this {
    if (value === null || value === undefined) return this
    if (Array.isArray(value) || value instanceof Set) return this.queryParam(name, ...value)
    return this.queryParam(name, value)
  }

  replaceQueryParam(name: string, ...values: unknown[]): this {
    this._query = this._query.filter(([k]) => k !== name)
    if (values.length > 0) this.queryParam(name, ...values)
    return this
  }

  fragment(fragment: string | null): this {
    this._fragment = fragment
    return this
  }

  cloneBuilder(): UriComponentsBuilder {
    const b = new UriComponentsBuilder()
    b._scheme = this._scheme
    b._userInfo = this._userInfo
    b._host = this._host
    b._port = this._port
    b._path = this._path
    b._lastSegment = this._lastSegment
    b._query = [...this._query]
    b._fragment = this._fragment
    return b
  }

  build(encoded = false): UriComponents {
    return new UriComponents(this._scheme, this._userInfo, this._host, this._port, this._path, [...this._query], this._fragment, encoded)
  }

  buildAndExpand(...values: unknown[]): UriComponents {
    return this.build().expand(...values)
  }

  /** `toUriString()` : `build().encode().toUriString()` */
  toUriString(): string {
    return this.build().encode().toUriString()
  }

  encode(): UriComponentsBuilder {
    return this
  }
}

/** `org.springframework.web.servlet.support.ServletUriComponentsBuilder` */
export class ServletUriComponentsBuilder extends UriComponentsBuilder {
  static fromContextPath(request: HttpServletRequest): ServletUriComponentsBuilder {
    const b = ServletUriComponentsBuilder.fromRequest(request)
    const prefix = request.getHeader('x-forwarded-prefix')?.split(',')[0]?.trim().replace(/\/+$/, '') ?? ''
    // ForwardedHeaderFilter : X-Forwarded-Prefix remplace le context-path
    b.replacePath(prefix || request.contextPath)
    b.replaceQuery(null)
    return b
  }

  static fromRequestUri(request: HttpServletRequest): ServletUriComponentsBuilder {
    const b = ServletUriComponentsBuilder.fromRequest(request)
    b.replaceQuery(null)
    return b
  }

  static fromRequest(request: HttpServletRequest): ServletUriComponentsBuilder {
    const b = new ServletUriComponentsBuilder()
    const scheme = request.scheme
    const port = request.serverPort
    b.scheme(scheme)
    b.host(request.serverName)
    if ((scheme === 'http' && port !== 80) || (scheme === 'https' && port !== 443)) b.port(port)
    b.path(request.requestURI)
    b.query(request.queryString)
    return b
  }

  private static currentRequest(): HttpServletRequest {
    const attrs = RequestContextHolder.getRequestAttributes()
    if (!attrs) throw new IllegalStateException('No current ServletRequestAttributes')
    return attrs.request
  }

  static fromCurrentContextPath(): ServletUriComponentsBuilder {
    return ServletUriComponentsBuilder.fromContextPath(ServletUriComponentsBuilder.currentRequest())
  }

  static fromCurrentRequestUri(): ServletUriComponentsBuilder {
    return ServletUriComponentsBuilder.fromRequestUri(ServletUriComponentsBuilder.currentRequest())
  }

  static fromCurrentRequest(): ServletUriComponentsBuilder {
    return ServletUriComponentsBuilder.fromRequest(ServletUriComponentsBuilder.currentRequest())
  }
}

/** `org.springframework.web.util.UriUtils` (encodage UTF-8) */
export const UriUtils = {
  /** `encodeQueryParam(queryParam, UTF_8)` : HierarchicalUriComponents.Type.QUERY_PARAM */
  encodeQueryParam(queryParam: string): string {
    return encodeComponent(queryParam, isQueryParam)
  },
}
