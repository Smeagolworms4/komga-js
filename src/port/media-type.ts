// Support de portage : org.springframework.util.MimeType / org.springframework.http.MediaType (Spring 6.2) :
// analyse, compatibilité, inclusion, spécificité (tri par qualité puis spécificité, comme MediaType.isMoreSpecific),
// utilisés par la négociation de contenu du DispatcherServlet. Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException } from './kotlin.js'

/** `InvalidMediaTypeException` */
export class InvalidMediaTypeException extends IllegalArgumentException {
  constructor(
    readonly mediaType: string,
    message: string,
  ) {
    super(`Invalid mime type "${mediaType}": ${message}`)
  }
}

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export class ParsedMediaType {
  constructor(
    readonly type: string,
    readonly subtype: string,
    readonly parameters: ReadonlyMap<string, string> = new Map(),
  ) {}

  static readonly ALL = new ParsedMediaType('*', '*')
  static readonly APPLICATION_JSON = new ParsedMediaType('application', 'json')
  static readonly APPLICATION_OCTET_STREAM = new ParsedMediaType('application', 'octet-stream')
  static readonly APPLICATION_PROBLEM_JSON = new ParsedMediaType('application', 'problem+json')
  static readonly TEXT_PLAIN = new ParsedMediaType('text', 'plain')
  static readonly TEXT_HTML = new ParsedMediaType('text', 'html')

  /** `MediaType.parseMediaType` */
  static parse(value: string): ParsedMediaType {
    const s = value.trim()
    if (!s) throw new InvalidMediaTypeException(value, "'mimeType' must not be empty")
    const parts = splitParams(s)
    let full = (parts[0] as string).trim()
    // java.net.HttpURLConnection returns a *; q=.2 Accept header
    if (full === '*') full = '*/*'
    const slash = full.indexOf('/')
    if (slash < 0) throw new InvalidMediaTypeException(value, 'does not contain \'/\'')
    if (slash === full.length - 1) throw new InvalidMediaTypeException(value, "does not contain subtype after '/'")
    const type = full.slice(0, slash)
    const subtype = full.slice(slash + 1)
    if (!TOKEN.test(type)) throw new InvalidMediaTypeException(value, `Invalid token character in type "${type}"`)
    if (!TOKEN.test(subtype)) throw new InvalidMediaTypeException(value, `Invalid token character in subtype "${subtype}"`)
    if (type === '*' && subtype !== '*') throw new InvalidMediaTypeException(value, 'wildcard type is legal only in \'*/*\' (all mime types)')
    const params = new Map<string, string>()
    for (const p of parts.slice(1)) {
      const t = p.trim()
      if (!t) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim()
      if (k.toLowerCase() === 'q') {
        const q = Number(v.replace(/^"|"$/g, ''))
        if (Number.isNaN(q) || q < 0 || q > 1) throw new InvalidMediaTypeException(value, `Invalid quality value "${v}": should be between 0.0 and 1.0`)
      }
      params.set(k, v)
    }
    return new ParsedMediaType(type.toLowerCase(), subtype.toLowerCase(), params)
  }

  /** `MediaType.parseMediaTypes` (liste séparée par des virgules, hors guillemets) */
  static parseList(values: string | string[] | null): ParsedMediaType[] {
    const list = values === null ? [] : Array.isArray(values) ? values : [values]
    const out: ParsedMediaType[] = []
    for (const v of list) for (const t of tokenizeList(v)) if (t.trim()) out.push(ParsedMediaType.parse(t))
    return out
  }

  getParameter(name: string): string | null {
    for (const [k, v] of this.parameters) if (k.toLowerCase() === name.toLowerCase()) return v.replace(/^"|"$/g, '')
    return null
  }

  get charset(): string | null {
    return this.getParameter('charset')
  }

  get qualityValue(): number {
    const q = this.getParameter('q')
    return q === null ? 1 : Number(q)
  }

  get isWildcardType(): boolean {
    return this.type === '*'
  }

  get isWildcardSubtype(): boolean {
    return this.subtype === '*' || this.subtype.startsWith('*+')
  }

  get isConcrete(): boolean {
    return !this.isWildcardType && !this.isWildcardSubtype
  }

  get subtypeSuffix(): string | null {
    const i = this.subtype.lastIndexOf('+')
    return i >= 0 && i < this.subtype.length - 1 ? this.subtype.slice(i + 1) : null
  }

  equalsTypeAndSubtype(other: ParsedMediaType): boolean {
    return this.type === other.type && this.subtype === other.subtype
  }

  /** `includes` */
  includes(other: ParsedMediaType): boolean {
    if (this.isWildcardType) return true
    if (this.type !== other.type) return false
    if (this.subtype === other.subtype) return true
    if (this.isWildcardSubtype) {
      // Wildcard with suffix, e.g. application/*+xml
      const thisPlusIdx = this.subtype.lastIndexOf('+')
      if (thisPlusIdx === -1) return true
      // application/*+xml includes application/soap+xml
      const otherPlusIdx = other.subtype.lastIndexOf('+')
      if (otherPlusIdx !== -1) {
        const thisSubtypeNoSuffix = this.subtype.slice(0, thisPlusIdx)
        const thisSubtypeSuffix = this.subtype.slice(thisPlusIdx + 1)
        const otherSubtypeSuffix = other.subtype.slice(otherPlusIdx + 1)
        if (thisSubtypeSuffix === otherSubtypeSuffix && thisSubtypeNoSuffix === '*') return true
      }
    }
    return false
  }

  /** `isCompatibleWith` */
  isCompatibleWith(other: ParsedMediaType): boolean {
    if (this.isWildcardType || other.isWildcardType) return true
    if (this.type !== other.type) return false
    if (this.subtype === other.subtype) return true
    if (this.isWildcardSubtype || other.isWildcardSubtype) {
      const thisSuffix = this.subtypeSuffix
      const otherSuffix = other.subtypeSuffix
      // Wildcard and without suffix
      if (this.subtype === '*' || other.subtype === '*') return true
      // Wildcard with suffix, e.g. application/*+xml
      if (this.isWildcardSubtype && thisSuffix !== null) return thisSuffix === other.subtype || thisSuffix === otherSuffix
      if (other.isWildcardSubtype && otherSuffix !== null) return this.subtype === otherSuffix || otherSuffix === thisSuffix
    }
    return false
  }

  /** `MediaType.isMoreSpecific` : qualité, puis joker de type, joker de sous-type, nombre de paramètres */
  isMoreSpecific(other: ParsedMediaType): boolean {
    const q1 = this.qualityValue
    const q2 = other.qualityValue
    if (q1 > q2) return true
    if (q1 < q2) return false
    const thisWildcard = this.isWildcardType
    const otherWildcard = other.isWildcardType
    if (thisWildcard && !otherWildcard) return false
    if (!thisWildcard && otherWildcard) return true
    const thisWildcardSubtype = this.isWildcardSubtype
    const otherWildcardSubtype = other.isWildcardSubtype
    if (thisWildcardSubtype && !otherWildcardSubtype) return false
    if (!thisWildcardSubtype && otherWildcardSubtype) return true
    if (this.type === other.type && this.subtype === other.subtype) return this.parameters.size > other.parameters.size
    return false
  }

  isLessSpecific(other: ParsedMediaType): boolean {
    return other.isMoreSpecific(this)
  }

  copyQualityValue(from: ParsedMediaType): ParsedMediaType {
    const q = from.getParameter('q')
    if (q === null) return this
    const params = new Map(this.parameters)
    params.set('q', q)
    return new ParsedMediaType(this.type, this.subtype, params)
  }

  removeQualityValue(): ParsedMediaType {
    if (this.getParameter('q') === null) return this
    return new ParsedMediaType(this.type, this.subtype, new Map([...this.parameters].filter(([k]) => k.toLowerCase() !== 'q')))
  }

  withCharset(charset: string): ParsedMediaType {
    const params = new Map([...this.parameters].filter(([k]) => k.toLowerCase() !== 'charset'))
    params.set('charset', charset)
    return new ParsedMediaType(this.type, this.subtype, params)
  }

  /** `MimeType.toString` : `type/subtype;k=v` */
  toString(): string {
    let s = `${this.type}/${this.subtype}`
    for (const [k, v] of this.parameters) s += `;${k}=${v}`
    return s
  }
}

function splitParams(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const c of s) {
    if (c === '"') quoted = !quoted
    if (c === ';' && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** `MimeTypeUtils.tokenize` */
function tokenizeList(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const c of s) {
    if (c === '"') quoted = !quoted
    if (c === ',' && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** `MimeTypeUtils.sortBySpecificity` : tri à bulles stable (au plus 50 éléments) */
export function sortBySpecificity(list: ParsedMediaType[]): void {
  if (list.length > 50) throw new InvalidMediaTypeException(list.toString(), 'Too many elements')
  const len = list.length
  for (let i = 0; i < len; i++) {
    for (let j = 1; j < len - i; j++) {
      const prev = list[j - 1] as ParsedMediaType
      const cur = list[j] as ParsedMediaType
      if (prev.isLessSpecific(cur)) {
        list[j] = prev
        list[j - 1] = cur
      }
    }
  }
}

/** Extensions de fichiers (MediaTypeFactory, mime.types de Spring) utilisées pour les ressources statiques */
const EXTENSIONS: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  map: 'application/json',
  txt: 'text/plain',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  wbmp: 'image/vnd.wap.wbmp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  pdf: 'application/pdf',
  zip: 'application/zip',
  epub: 'application/epub+zip',
  cbz: 'application/x-cbz',
  cbr: 'application/x-cbr',
  csv: 'text/csv',
  yml: 'application/yaml',
  yaml: 'application/yaml',
  properties: 'text/plain',
  atom: 'application/atom+xml',
  rss: 'application/rss+xml',
  webmanifest: 'application/manifest+json',
  wasm: 'application/wasm',
}

/** `MediaTypeFactory.getMediaType(filename)` */
export function mediaTypeForFilename(filename: string | null): ParsedMediaType | null {
  if (!filename) return null
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return null
  const t = EXTENSIONS[filename.slice(dot + 1).toLowerCase()]
  return t ? ParsedMediaType.parse(t) : null
}
