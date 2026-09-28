// Support de portage : sous-ensemble de Apache Tika (tika-core 3.3.2) utilisé par Komga, sans jumeau Kotlin.
// Komga n'a que tika-core sur son classpath : `TikaConfig()` donne un DefaultDetector qui ne contient que
// MimeTypes (aucun détecteur chargé par ServiceLoader). Ce fichier porte donc :
//  - MediaType, MediaTypeRegistry, MimeType, Magic/MagicMatch/clauses, MagicDetector, MimeTypesReader,
//    MimeTypes (détection par octets magiques + racine XML + TextDetector), XmlRootExtractor ;
//  - le registre tika-mimetypes.xml, copie exacte générée par tools/gen-tika-mimetypes.mjs.
// Komga passe le nom de fichier sous la clé `tika.mime.file` (et non `resourceName`) : le nom n'est jamais utilisé
// pour la détection, seul le contenu compte.
// Vérifié contre la vraie bibliothèque (jshell, tools/jshell-komga.sh) : test/port/tika.test.ts.
import { closeSync, openSync, readSync } from 'node:fs'
import { Exception, IllegalArgumentException } from './kotlin.js'
import { IOException, InputStream } from './java-io.js'
import { translateError } from './java-nio-file.js'
import { TIKA_MIMETYPES_XML } from './tika-mimetypes.js'

export class MimeTypeException extends Exception {}

/** `org.apache.tika.io.TaggedIOException` : erreur d'entrée-sortie du flux d'un TikaInputStream (TaggedInputStream) */
export class TaggedIOException extends IOException {}

// ---------------------------------------------------------------------------
// MediaType
// ---------------------------------------------------------------------------

/** `\s` de java.util.regex : [ \t\n\x0B\f\r] */
const JWS = ' \\t\\n\\x0B\\f\\r'
const SPECIAL = /[()<>@,;:\\"/[\]?=]/g
const SPECIAL_OR_WHITESPACE = new RegExp(`[()<>@,;:\\\\"/\\[\\]?=${JWS}]`)
// VALID_CHARS de Tika : "[^\c\(\)<>@,;:\\\"/\[\]\?=\s]" ; en Java `\c\` est le caractère de contrôle 0x1C
const VALID_CHARS = `([^\\x1C()<>@,;:\\\\"/\\[\\]?=${JWS}]+)`
const TYPE_PATTERN = new RegExp(`^[${JWS}]*${VALID_CHARS}[${JWS}]*/[${JWS}]*${VALID_CHARS}[${JWS}]*($|;[\\s\\S]*)$`)
// CHARSET_FIRST_PATTERN : "(?is)\s*(charset\s*=\s*[^\c;\s]+)\s*;\s*..." ; `\c;` est '{'
const CHARSET_FIRST_PATTERN = new RegExp(`^[${JWS}]*(charset[${JWS}]*=[${JWS}]*[^{${JWS}]+)[${JWS}]*;[${JWS}]*${VALID_CHARS}[${JWS}]*/[${JWS}]*${VALID_CHARS}[${JWS}]*$`, 'i')

/** `String.trim()` de Java : retire les caractères <= ' ' */
function javaTrim(s: string): string {
  let a = 0
  let b = s.length
  while (a < b && s.charCodeAt(a) <= 32) a++
  while (b > a && s.charCodeAt(b - 1) <= 32) b--
  return s.substring(a, b)
}

/** `toLowerCase(Locale.ENGLISH)` */
function lowerEn(s: string): string {
  return s.toLowerCase()
}

export class MediaType {
  private static readonly SIMPLE_TYPES = new Map<string, MediaType>()

  private readonly string: string
  private readonly slash: number
  private readonly semicolon: number
  private readonly parameters: Map<string, string>

  constructor(type: string, subtype: string, parameters: Map<string, string>)
  constructor(string: string, slash: number)
  constructor(a: string, b: string | number, parameters?: Map<string, string>) {
    if (typeof b === 'number') {
      this.string = a
      this.slash = b
      this.semicolon = a.length
      this.parameters = new Map()
      return
    }
    const type = lowerEn(javaTrim(a))
    const subtype = lowerEn(javaTrim(b))
    this.slash = type.length
    this.semicolon = this.slash + 1 + subtype.length
    const params = parameters as Map<string, string>
    if (params.size === 0) {
      this.parameters = new Map()
      this.string = `${type}/${subtype}`
    } else {
      let builder = `${type}/${subtype}`
      const map = new Map<string, string>()
      for (const [k, v] of params) map.set(lowerEn(javaTrim(k)), v)
      const sorted = new Map([...map.entries()].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)))
      for (const [key, value] of sorted) {
        builder += `; ${key}=`
        if (SPECIAL_OR_WHITESPACE.test(value)) builder += `"${value.replace(SPECIAL, (m) => `\\${m}`)}"`
        else builder += value
      }
      this.string = builder
      this.parameters = sorted
    }
  }

  static readonly OCTET_STREAM = MediaType.parse('application/octet-stream') as MediaType
  static readonly EMPTY = MediaType.parse('application/x-empty') as MediaType
  static readonly TEXT_PLAIN = MediaType.parse('text/plain') as MediaType
  static readonly TEXT_HTML = MediaType.parse('text/html') as MediaType
  static readonly APPLICATION_XML = MediaType.parse('application/xml') as MediaType
  static readonly APPLICATION_ZIP = MediaType.parse('application/zip') as MediaType

  static withParameters(type: MediaType, parameters: Map<string, string>): MediaType {
    let union: Map<string, string>
    if (type.parameters.size === 0) union = parameters
    else if (parameters.size === 0) union = type.parameters
    else union = new Map([...type.parameters, ...parameters])
    return new MediaType(type.getType(), type.getSubtype(), union)
  }

  static parse(string: string | null): MediaType | null {
    if (string === null) return null
    let type = MediaType.SIMPLE_TYPES.get(string)
    if (type === undefined) {
      const slash = string.indexOf('/')
      if (slash === -1) {
        return null
      } else if (MediaType.SIMPLE_TYPES.size < 10000 && isSimpleName(string.substring(0, slash)) && isSimpleName(string.substring(slash + 1))) {
        type = new MediaType(string, slash)
        MediaType.SIMPLE_TYPES.set(string, type)
      }
    }
    if (type !== undefined) return type

    let m = TYPE_PATTERN.exec(string)
    if (m) return new MediaType(m[1] as string, m[2] as string, parseParameters(m[3] as string))
    m = CHARSET_FIRST_PATTERN.exec(string)
    if (m) return new MediaType(m[2] as string, m[3] as string, parseParameters(m[1] as string))
    return null
  }

  getBaseType(): MediaType {
    if (this.parameters.size === 0) return this
    return MediaType.parse(this.string.substring(0, this.semicolon)) as MediaType
  }

  getType(): string {
    return this.string.substring(0, this.slash)
  }

  getSubtype(): string {
    return this.string.substring(this.slash + 1, this.semicolon)
  }

  hasParameters(): boolean {
    return this.parameters.size !== 0
  }

  getParameters(): Map<string, string> {
    return this.parameters
  }

  toString(): string {
    return this.string
  }

  equals(o: unknown): boolean {
    return o instanceof MediaType && o.string === this.string
  }

  compareTo(that: MediaType): number {
    return javaCompare(this.string, that.string)
  }
}

function isSimpleName(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i)
    if (c !== 45 && c !== 43 && c !== 46 && c !== 95 && !(48 <= c && c <= 57) && !(97 <= c && c <= 122)) return false
  }
  return name.length > 0
}

function parseParameters(string: string): Map<string, string> {
  const parameters = new Map<string, string>()
  if (string.length === 0) return parameters
  while (string.length > 0) {
    let key = string
    let value = ''
    const semicolon = string.indexOf(';')
    if (semicolon !== -1) {
      key = string.substring(0, semicolon)
      string = string.substring(semicolon + 1)
    } else {
      string = ''
    }
    const equals = key.indexOf('=')
    if (equals !== -1) {
      value = key.substring(equals + 1)
      key = key.substring(0, equals)
    }
    key = javaTrim(key)
    if (key.length > 0) parameters.set(key, unquote(javaTrim(value)))
  }
  return parameters
}

function unquote(s: string): string {
  while (s.startsWith('"') || s.startsWith("'")) s = s.substring(1)
  while (s.endsWith('"') || s.endsWith("'")) s = s.substring(0, s.length - 1)
  return s
}

/** `String.compareTo` (unités UTF-16) */
function javaCompare(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const d = a.charCodeAt(i) - b.charCodeAt(i)
    if (d !== 0) return d
  }
  return a.length - b.length
}

// ---------------------------------------------------------------------------
// MediaTypeRegistry
// ---------------------------------------------------------------------------

export class MediaTypeRegistry {
  private readonly registry = new Map<string, MediaType>()
  private readonly inheritance = new Map<string, MediaType>()

  addType(type: MediaType): void {
    this.registry.set(type.toString(), type)
  }

  addAlias(type: MediaType, alias: MediaType): void {
    this.registry.set(alias.toString(), type)
  }

  addSuperType(type: MediaType, supertype: MediaType): void {
    this.inheritance.set(type.toString(), supertype)
  }

  normalize(type: MediaType | null): MediaType | null {
    if (type === null) return null
    const canonical = this.registry.get(type.getBaseType().toString())
    if (canonical === undefined) return type
    else if (type.hasParameters()) return MediaType.withParameters(canonical, type.getParameters())
    else return canonical
  }

  isSpecializationOf(a: MediaType, b: MediaType): boolean {
    return this.isInstanceOf(this.getSupertype(a), b)
  }

  isInstanceOf(a: MediaType | null, b: MediaType): boolean {
    return a !== null && (a.equals(b) || this.isSpecializationOf(a, b))
  }

  getSupertype(type: MediaType | null): MediaType | null {
    if (type === null) return null
    else if (this.inheritance.has(type.toString())) return this.inheritance.get(type.toString()) as MediaType
    else if (type.hasParameters()) return type.getBaseType()
    else if (type.getSubtype().endsWith('+xml')) return MediaType.APPLICATION_XML
    else if (type.getSubtype().endsWith('+zip')) return MediaType.APPLICATION_ZIP
    else if (type.getType() === 'text' && !MediaType.TEXT_PLAIN.equals(type)) return MediaType.TEXT_PLAIN
    else if (type.getType().includes('empty') && !MediaType.EMPTY.equals(type)) return MediaType.EMPTY
    else if (!MediaType.OCTET_STREAM.equals(type)) return MediaType.OCTET_STREAM
    else return null
  }
}

// ---------------------------------------------------------------------------
// Clauses et octets magiques
// ---------------------------------------------------------------------------

interface Clause {
  eval(data: Uint8Array): boolean
  size(): number
  toString(): string
}

/** `\s` de Java dans une regex traduite */
const JAVA_S = '[ \\t\\n\\x0B\\f\\r]'
const JAVA_S_IN_CLASS = ' \\t\\n\\x0B\\f\\r'
const JAVA_DOT = '[^\\n\\r\\u0085\\u2028\\u2029]'

/**
 * Traduit une regex java.util.regex (celles de tika-mimetypes.xml) en RegExp JS :
 * drapeaux initiaux `(?s)`/`(?i)`, `.` hors DOTALL (exclut aussi U+0085 en Java), `\s`/`\S` (ASCII en Java).
 */
export function translateJavaRegex(pattern: string, caseInsensitive: boolean): RegExp {
  let flags = caseInsensitive ? 'i' : ''
  let dotAll = false
  let p = pattern
  const m = /^\(\?([a-z]+)\)/.exec(p)
  if (m) {
    for (const f of m[1] as string) {
      if (f === 's') dotAll = true
      else if (f === 'i') flags += flags.includes('i') ? '' : 'i'
      else throw new IllegalArgumentException(`Unsupported inline flag ${f} in ${pattern}`)
    }
    p = p.substring(m[0].length)
  }
  let out = ''
  let inClass = false
  for (let i = 0; i < p.length; i++) {
    const c = p[i] as string
    if (c === '\\') {
      const n = p[i + 1] ?? ''
      i++
      if (n === 's') out += inClass ? JAVA_S_IN_CLASS : JAVA_S
      else if (n === 'S') {
        if (inClass) throw new IllegalArgumentException(`Unsupported \\S in class: ${pattern}`)
        out += '[^ \\t\\n\\x0B\\f\\r]'
      } else out += `\\${n}`
    } else if (inClass) {
      if (c === ']') inClass = false
      out += c
    } else if (c === '[') {
      inClass = true
      out += c
      if (p[i + 1] === '^') {
        out += '^'
        i++
      }
      if (p[i + 1] === ']') {
        out += '\\]'
        i++
      }
    } else if (c === '.') {
      out += dotAll ? '[\\s\\S]' : JAVA_DOT
    } else out += c
  }
  return new RegExp(out, `${flags}y`)
}

/** Port de org.apache.tika.detect.MagicDetector, évalué directement sur le préfixe (`byte[]`) */
class MagicDetector {
  private readonly pattern: Int8Array
  private readonly mask: Int8Array
  private readonly patternLength: number
  private readonly length: number
  private regex: RegExp | null = null

  constructor(
    readonly type: MediaType,
    pattern: Uint8Array,
    mask: Uint8Array | null,
    private readonly isRegex: boolean,
    private readonly isStringIgnoreCase: boolean,
    private readonly offsetRangeBegin: number,
    private readonly offsetRangeEnd: number,
  ) {
    if (offsetRangeBegin < 0 || offsetRangeEnd < offsetRangeBegin) throw new IllegalArgumentException(`Invalid offset range: [${offsetRangeBegin},${offsetRangeEnd}]`)
    this.patternLength = Math.max(pattern.length, mask !== null ? mask.length : 0)
    this.length = isRegex ? 8 * 1024 : this.patternLength
    this.mask = new Int8Array(this.patternLength)
    this.pattern = new Int8Array(this.patternLength)
    for (let i = 0; i < this.patternLength; i++) {
      this.mask[i] = mask !== null && i < mask.length ? (mask[i] as number) : -1
      this.pattern[i] = i < pattern.length ? (pattern[i] as number) & (this.mask[i] as number) : 0
    }
  }

  static parse(mediaType: MediaType, type: string, offset: string | null, value: string, mask: string | null): MagicDetector {
    let start = 0
    let end = 0
    if (offset !== null) {
      const colon = offset.indexOf(':')
      if (colon === -1) {
        start = parseJavaInt(offset, 10)
        end = start
      } else {
        start = parseJavaInt(offset.substring(0, colon), 10)
        end = parseJavaInt(offset.substring(colon + 1), 10)
      }
    }
    const patternBytes = decodeValue(value, type)
    const maskBytes = mask !== null ? decodeValue(mask, type) : null
    return new MagicDetector(mediaType, patternBytes, maskBytes, type === 'regex', type === 'stringignorecase', start, end)
  }

  getLength(): number {
    return this.patternLength
  }

  /** `detect(new ByteArrayInputStream(data), metadata) != OCTET_STREAM` sans le flux intermédiaire */
  matches(data: Uint8Array): boolean {
    const begin = this.offsetRangeBegin
    if (data.length < begin) return false
    const bufLen = this.length + (this.offsetRangeEnd - begin)
    const read = Math.min(data.length - begin, bufLen)
    const at = (k: number): number => (k < read ? ((data[begin + k] as number) << 24) >> 24 : 0)
    if (this.isRegex) {
      if (this.regex === null) {
        const src = new TextDecoder('utf-8').decode(new Uint8Array(this.pattern.buffer))
        this.regex = translateJavaRegex(src, this.isStringIgnoreCase)
      }
      // ISO_8859_1.decode(buffer) : le tampon est complété par des zéros
      let text = Buffer.from(data.buffer, data.byteOffset + begin, read).toString('latin1')
      if (read < bufLen) text += '\0'.repeat(bufLen - read)
      for (let i = 0; i <= this.offsetRangeEnd - begin; i++) {
        // m.region(i, length + i) ; m.lookingAt() : bornes opaques et ancrées
        const region = text.substring(i, this.length + i)
        this.regex.lastIndex = 0
        if (this.regex.test(region)) return true
      }
      return false
    }
    if (begin + read < begin + this.length) return false
    for (let i = 0; i <= this.offsetRangeEnd - begin; i++) {
      let match = true
      for (let j = 0; match && j < this.length; j++) {
        let masked = at(i + j) & (this.mask[j] as number)
        if (this.isStringIgnoreCase && masked >= 65 && masked <= 90) masked += 32
        match = masked === this.pattern[j]
      }
      if (match) return true
    }
    return false
  }
}

/** `Integer.parseInt(s, radix)` (NumberFormatException sinon) */
function parseJavaInt(s: string, radix: number): number {
  const re = radix === 16 ? /^[+-]?[0-9a-fA-F]+$/ : radix === 8 ? /^[+-]?[0-7]+$/ : /^[+-]?[0-9]+$/
  if (!re.test(s)) throw new IllegalArgumentException(`For input string: "${s}"`)
  return parseInt(s, radix)
}

export function decodeValue(value: string, type: string): Uint8Array {
  let tmpVal: string
  let radix: number
  if (value.startsWith('0x')) {
    tmpVal = value.substring(2)
    radix = 16
  } else {
    tmpVal = value
    radix = 8
  }
  switch (type) {
    case 'string':
    case 'regex':
    case 'unicodeLE':
    case 'unicodeBE':
      return decodeString(value, type)
    case 'stringignorecase':
      return decodeString(value.toLowerCase(), type)
    case 'byte':
      return new TextEncoder().encode(tmpVal)
    case 'host16':
    case 'little16': {
      const i = parseJavaInt(tmpVal, radix)
      return new Uint8Array([i & 0xff, (i >> 8) & 0xff])
    }
    case 'big16': {
      const i = parseJavaInt(tmpVal, radix)
      return new Uint8Array([(i >> 8) & 0xff, i & 0xff])
    }
    case 'host32':
    case 'little32': {
      const i = parseJavaInt(tmpVal, radix)
      return new Uint8Array([i & 0xff, (i >>> 8) & 0xff, (i >>> 16) & 0xff, Math.floor(i / 0x1000000) & 0xff])
    }
    case 'big32': {
      const i = parseJavaInt(tmpVal, radix)
      return new Uint8Array([Math.floor(i / 0x1000000) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff])
    }
  }
  throw new IllegalArgumentException(`Unknown magic type ${type}`)
}

function decodeString(value: string, type: string): Uint8Array {
  if (value.startsWith('0x')) {
    const vals = new Uint8Array(Math.floor((value.length - 2) / 2))
    for (let i = 0; i < vals.length; i++) vals[i] = parseJavaInt(value.substring(2 + i * 2, 4 + i * 2), 16) & 0xff
    return vals
  }
  const chars: number[] = []
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\') {
      if (value[i + 1] === '\\') {
        chars.push(92)
        i++
      } else if (value[i + 1] === 'x') {
        chars.push(parseJavaInt(value.substring(i + 2, i + 4), 16))
        i += 3
      } else if (value[i + 1] === 'r') {
        chars.push(13)
        i++
      } else if (value[i + 1] === 'n') {
        chars.push(10)
        i++
      } else {
        let j = i + 1
        while (j < i + 4 && j < value.length && /[0-9]/.test(value[j] as string)) j++
        // Short.decode("0" + digits).byteValue() : octal
        const digits = value.substring(i + 1, j)
        chars.push(digits.length === 0 ? 0 : parseInt(digits, 8) & 0xff)
        i = j - 1
      }
    } else {
      chars.push(value.charCodeAt(i))
    }
  }
  let bytes: Uint8Array
  if (type === 'unicodeLE') {
    bytes = new Uint8Array(chars.length * 2)
    for (let i = 0; i < chars.length; i++) {
      bytes[i * 2] = (chars[i] as number) & 0xff
      bytes[i * 2 + 1] = (chars[i] as number) >> 8
    }
  } else if (type === 'unicodeBE') {
    bytes = new Uint8Array(chars.length * 2)
    for (let i = 0; i < chars.length; i++) {
      bytes[i * 2] = (chars[i] as number) >> 8
      bytes[i * 2 + 1] = (chars[i] as number) & 0xff
    }
  } else {
    bytes = new Uint8Array(chars.length)
    for (let i = 0; i < chars.length; i++) bytes[i] = (chars[i] as number) & 0xff
  }
  return bytes
}

class MagicMatch implements Clause {
  private detector: MagicDetector | null = null

  constructor(
    private readonly mediaType: MediaType,
    private readonly type: string,
    private readonly offset: string | null,
    private readonly value: string,
    private readonly mask: string | null,
  ) {}

  private getDetector(): MagicDetector {
    if (this.detector === null) this.detector = MagicDetector.parse(this.mediaType, this.type, this.offset, this.value, this.mask)
    return this.detector
  }

  eval(data: Uint8Array): boolean {
    return this.getDetector().matches(data) && !this.mediaType.equals(MediaType.OCTET_STREAM)
  }

  size(): number {
    return this.getDetector().getLength()
  }

  toString(): string {
    return `${this.mediaType} ${this.type} ${this.offset} ${this.value} ${this.mask}`
  }
}

class AndClause implements Clause {
  constructor(private readonly clauses: Clause[]) {}

  eval(data: Uint8Array): boolean {
    for (const c of this.clauses) if (!c.eval(data)) return false
    return true
  }

  size(): number {
    let size = 0
    for (const c of this.clauses) size += c.size()
    return size
  }

  toString(): string {
    return `and[${this.clauses.map((c) => c.toString()).join(', ')}]`
  }
}

class OrClause implements Clause {
  constructor(private readonly clauses: Clause[]) {}

  eval(data: Uint8Array): boolean {
    for (const c of this.clauses) if (c.eval(data)) return true
    return false
  }

  size(): number {
    let size = 0
    for (const c of this.clauses) size = Math.max(size, c.size())
    return size
  }

  toString(): string {
    return `or[${this.clauses.map((c) => c.toString()).join(', ')}]`
  }
}

class MinShouldMatchClause implements Clause {
  constructor(
    private readonly min: number,
    private readonly clauses: Clause[],
  ) {}

  eval(data: Uint8Array): boolean {
    let matches = 0
    for (const c of this.clauses) if (c.eval(data) && ++matches >= this.min) return true
    return false
  }

  size(): number {
    let size = 0
    for (const c of this.clauses) size = Math.max(size, c.size())
    return size
  }

  toString(): string {
    return `minShouldMatch (min: ${this.min}) [${this.clauses.map((c) => c.toString()).join(', ')}]`
  }
}

class Magic {
  readonly string: string

  constructor(
    readonly type: MimeType,
    readonly priority: number,
    private readonly clause: Clause,
  ) {
    this.string = `[${priority}/${clause}]`
  }

  eval(data: Uint8Array): boolean {
    return this.clause.eval(data)
  }

  size(): number {
    return this.clause.size()
  }

  compareTo(o: Magic): number {
    let diff = o.priority - this.priority
    if (diff === 0) diff = o.size() - this.size()
    if (diff === 0) diff = o.type.compareTo(this.type)
    if (diff === 0) diff = javaCompare(o.string, this.string)
    return diff
  }
}

// ---------------------------------------------------------------------------
// MimeType
// ---------------------------------------------------------------------------

class RootXML {
  constructor(
    readonly namespaceURI: string | null,
    readonly localName: string | null,
  ) {
    if (isEmpty(namespaceURI) && isEmpty(localName)) throw new IllegalArgumentException('Both namespaceURI and localName cannot be empty')
  }

  matches(namespaceURI: string | null, localName: string | null): boolean {
    if (!isEmpty(this.namespaceURI)) {
      if (this.namespaceURI !== namespaceURI) return false
    } else if (!isEmpty(namespaceURI)) return false
    if (!isEmpty(this.localName)) return this.localName === localName
    return isEmpty(localName)
  }
}

function isEmpty(s: string | null): boolean {
  return s === null || s === ''
}

export class MimeType {
  private magics: Magic[] | null = null
  private rootXML: RootXML[] | null = null
  private extensions: string[] | null = null
  interpreted = false

  constructor(readonly type: MediaType) {}

  getType(): MediaType {
    return this.type
  }

  getName(): string {
    return this.type.toString()
  }

  addRootXML(namespaceURI: string | null, localName: string | null): void {
    if (this.rootXML === null) this.rootXML = []
    this.rootXML.push(new RootXML(namespaceURI, localName))
  }

  matchesXML(namespaceURI: string | null, localName: string | null): boolean {
    if (this.rootXML !== null) for (const xml of this.rootXML) if (xml.matches(namespaceURI, localName)) return true
    return false
  }

  hasRootXML(): boolean {
    return this.rootXML !== null
  }

  getMagics(): Magic[] {
    return this.magics ?? []
  }

  addMagic(magic: Magic): void {
    if (this.magics === null) this.magics = []
    this.magics.push(magic)
  }

  hasMagic(): boolean {
    return this.magics !== null
  }

  compareTo(mime: MimeType): number {
    return this.type.compareTo(mime.type)
  }

  equals(o: unknown): boolean {
    return o instanceof MimeType && this.type.equals(o.type)
  }

  toString(): string {
    return this.type.toString()
  }

  getExtension(): string {
    return this.extensions === null ? '' : (this.extensions[0] as string)
  }

  getExtensions(): string[] {
    return this.extensions ?? []
  }

  addExtension(extension: string): void {
    if (this.extensions === null) this.extensions = []
    if (!this.extensions.includes(extension)) this.extensions.push(extension)
  }
}

// ---------------------------------------------------------------------------
// Metadata / TikaInputStream
// ---------------------------------------------------------------------------

export class Metadata {
  static readonly TIKA_MIME_FILE = 'tika.mime.file'
  static readonly CONTENT_TYPE = 'Content-Type'
  static readonly RESOURCE_NAME_KEY = 'resourceName'
  private readonly values = new Map<string, string>()

  get(name: string): string | null {
    return this.values.get(name) ?? null
  }

  set(name: string, value: string): void {
    this.values.set(name, value)
  }
}

/**
 * `TikaInputStream.get(path)` : flux de fichier avec mark/reset. Seul le préfixe lu par le détecteur
 * (64 Kio au plus) est conservé en mémoire.
 */
export class TikaInputStream extends InputStream {
  private fd: number | null
  private pos = 0
  private markPos = -1

  private constructor(path: string) {
    super()
    try {
      this.fd = openSync(path, 'r')
    } catch (e) {
      // Files.newInputStream : NoSuchFileException, AccessDeniedException...
      throw translateError(e, path)
    }
  }

  static get(path: string): TikaInputStream {
    return new TikaInputStream(path)
  }

  read(b: Uint8Array, off = 0, len = b.length - off): number {
    if (this.fd === null) throw new Error('Stream Closed')
    if (len === 0) return 0
    let n: number
    try {
      n = readSync(this.fd, b, off, len, this.pos)
    } catch (e) {
      // PORT: TikaInputStream est un TaggedInputStream : l'IOException de lecture (ex. « Is a directory ») est
      // enveloppée dans une TaggedIOException de même message
      throw new TaggedIOException(translateError(e, null).message, e)
    }
    if (n === 0) return -1
    this.pos += n
    return n
  }

  override markSupported(): boolean {
    return true
  }

  override mark(_readlimit: number): void {
    this.markPos = this.pos
  }

  override reset(): void {
    this.pos = this.markPos < 0 ? 0 : this.markPos
  }

  override close(): void {
    if (this.fd !== null) {
      closeSync(this.fd)
      this.fd = null
    }
  }
}

// ---------------------------------------------------------------------------
// TextDetector
// ---------------------------------------------------------------------------

class TextStatistics {
  private readonly counts = new Int32Array(256)
  private total = 0

  addData(buffer: Uint8Array, offset: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.counts[buffer[offset + i] as number]!++
      this.total++
    }
  }

  isMostlyAscii(): boolean {
    const control = this.count(0, 0x20)
    const ascii = this.count(0x20, 128)
    const safe = this.countSafeControl()
    return this.total > 0 && (control - safe) * 100 < this.total * 2 && (ascii + safe) * 100 > this.total * 90
  }

  looksLikeUTF8(): boolean {
    const control = this.count(0, 0x20)
    let utf8 = this.count(0x20, 0x80)
    const safe = this.countSafeControl()
    let expectedContinuation = 0
    const leading = [this.count(0xc0, 0xe0), this.count(0xe0, 0xf0), this.count(0xf0, 0xf8)]
    for (let i = 0; i < leading.length; i++) {
      utf8 += leading[i] as number
      expectedContinuation += (i + 1) * (leading[i] as number)
    }
    const continuation = this.count(0x80, 0xc0)
    return utf8 > 0 && continuation <= expectedContinuation && continuation >= expectedContinuation - 3 && this.count(0xf8, 0x100) === 0 && (control - safe) * 100 < utf8 * 2
  }

  private count(from: number, to: number): number {
    let count = 0
    for (let i = from; i < to; i++) count += this.counts[i] as number
    return count
  }

  private countSafeControl(): number {
    return (this.counts[9] as number) + (this.counts[10] as number) + (this.counts[13] as number) + (this.counts[0x0c] as number) + (this.counts[0x1b] as number)
  }
}

/** `new TextDetector(bytesToTest).detect(new ByteArrayInputStream(data), metadata)` */
function textDetect(data: Uint8Array, bytesToTest: number): MediaType {
  const stats = new TextStatistics()
  stats.addData(data, 0, Math.min(bytesToTest, data.length))
  if (stats.isMostlyAscii() || stats.looksLikeUTF8()) return MediaType.TEXT_PLAIN
  return MediaType.OCTET_STREAM
}

// ---------------------------------------------------------------------------
// MimeTypes
// ---------------------------------------------------------------------------

export class MimeTypes {
  static readonly OCTET_STREAM = 'application/octet-stream'
  static readonly PLAIN_TEXT = 'text/plain'
  static readonly XML = 'application/xml'
  private static DEFAULT_TYPES: MimeTypes | null = null

  private readonly rootMimeType: MimeType
  private readonly rootMimeTypeL: MimeType[]
  private readonly textMimeType: MimeType
  private readonly htmlMimeType: MimeType
  private readonly xmlMimeType: MimeType
  private readonly registry = new MediaTypeRegistry()
  private readonly types = new Map<string, MimeType>()
  private readonly magics: Magic[] = []
  private readonly xmls: MimeType[] = []

  constructor() {
    this.rootMimeType = new MimeType(MediaType.OCTET_STREAM)
    this.textMimeType = new MimeType(MediaType.TEXT_PLAIN)
    this.htmlMimeType = new MimeType(MediaType.TEXT_HTML)
    this.xmlMimeType = new MimeType(MediaType.APPLICATION_XML)
    this.rootMimeTypeL = [this.rootMimeType]
    this.add(this.rootMimeType)
    this.add(this.textMimeType)
    this.add(this.xmlMimeType)
  }

  static getDefaultMimeTypes(): MimeTypes {
    if (MimeTypes.DEFAULT_TYPES === null) {
      const types = new MimeTypes()
      new MimeTypesReader(types).read(TIKA_MIMETYPES_XML)
      types.init()
      MimeTypes.DEFAULT_TYPES = types
    }
    return MimeTypes.DEFAULT_TYPES
  }

  getMimeTypeForData(data: Uint8Array): MimeType[] {
    if (data.length === 0) return this.rootMimeTypeL

    const result: MimeType[] = []
    let currentPriority = -1
    for (const magic of this.magics) {
      if (currentPriority > 0 && currentPriority > magic.priority) break
      if (magic.eval(data)) {
        result.push(magic.type)
        currentPriority = magic.priority
      }
    }

    if (result.length > 0) {
      for (let i = 0; i < result.length; i++) {
        const matched = result[i] as MimeType
        if (matched.getName() === 'application/xml' || matched.getName() === 'text/html') {
          const rootElement = new XmlRootExtractor().extractRootElement(data)
          if (rootElement !== null) {
            for (const type of this.xmls) {
              if (type.matchesXML(rootElement.namespaceURI, rootElement.localPart)) {
                result[i] = type
                break
              }
            }
          } else if (matched.getName() === 'application/xml') {
            let isHTML = false
            for (const magic of this.magics) {
              if (!magic.type.equals(this.htmlMimeType)) continue
              if (magic.eval(data)) {
                isHTML = true
                break
              }
            }
            result[i] = isHTML ? this.htmlMimeType : this.textMimeType
          }
        }
      }
      return result
    }

    try {
      return [this.forName(textDetect(data, this.getMinLength()).toString())]
    } catch {
      return this.rootMimeTypeL
    }
  }

  readMagicHeader(stream: InputStream): Uint8Array {
    const bytes = new Uint8Array(this.getMinLength())
    let totalRead = 0
    let lastRead = stream.read(bytes, 0, bytes.length)
    while (lastRead !== -1) {
      totalRead += lastRead
      if (totalRead === bytes.length) return bytes
      lastRead = stream.read(bytes, totalRead, bytes.length - totalRead)
    }
    return bytes.slice(0, totalRead)
  }

  forName(name: string): MimeType {
    const type = MediaType.parse(name)
    if (type !== null) {
      const normalisedType = this.registry.normalize(type) as MediaType
      let mime = this.types.get(normalisedType.toString())
      if (mime === undefined) {
        mime = new MimeType(type)
        this.add(mime)
        this.types.set(type.toString(), mime)
      }
      return mime
    }
    throw new MimeTypeException(`Invalid media type name: ${name}`)
  }

  setSuperType(type: MimeType, parent: MediaType): void {
    this.registry.addSuperType(type.getType(), parent)
  }

  addAlias(type: MimeType, alias: MediaType): void {
    this.registry.addAlias(type.getType(), alias)
  }

  /** `Patterns.add` : seules les extensions (`*.ext`) intéressent Komga (`MimeType.getExtension`) */
  addPattern(type: MimeType, pattern: string, isRegex: boolean): void {
    if (isRegex) return
    if (pattern.indexOf('*') === -1 && pattern.indexOf('?') === -1 && pattern.indexOf('[') === -1) return
    if (pattern.startsWith('*') && pattern.indexOf('*', 1) === -1 && pattern.indexOf('?') === -1 && pattern.indexOf('[') === -1) {
      type.addExtension(pattern.substring(1))
    }
  }

  getMediaTypeRegistry(): MediaTypeRegistry {
    return this.registry
  }

  getMinLength(): number {
    return 64 * 1024
  }

  add(type: MimeType): void {
    this.registry.addType(type.getType())
    this.types.set(type.getType().toString(), type)
    if (type.hasMagic()) this.magics.push(...type.getMagics())
    if (type.hasRootXML()) this.xmls.push(type)
  }

  init(): void {
    for (const type of this.types.values()) {
      this.magics.push(...type.getMagics())
      if (type.hasRootXML()) this.xmls.push(type)
    }
    // Collections.sort : tri stable
    this.magics.sort((a, b) => a.compareTo(b))
    this.xmls.sort((a, b) => a.compareTo(b))
  }

  detect(input: InputStream | null, metadata: Metadata): MediaType {
    let possibleTypes: MimeType[] | null = null
    if (input !== null) {
      input.mark(this.getMinLength())
      try {
        const prefix = this.readMagicHeader(input)
        possibleTypes = this.getMimeTypeForData(prefix)
      } finally {
        input.reset()
      }
    }
    // PORT: indice resourceName (nom de fichier) non porté : Komga ne le renseigne jamais (clé tika.mime.file)
    const typeName = metadata.get(Metadata.CONTENT_TYPE)
    if (typeName !== null) {
      try {
        possibleTypes = this.applyHint(possibleTypes, this.forName(typeName))
      } catch (e) {
        if (!(e instanceof MimeTypeException)) throw e
      }
    }
    if (possibleTypes === null || possibleTypes.length === 0) return MediaType.OCTET_STREAM
    return (possibleTypes[0] as MimeType).getType()
  }

  private applyHint(possibleTypes: MimeType[] | null, hint: MimeType): MimeType[] {
    if (possibleTypes === null || possibleTypes.length === 0) return [hint]
    for (const type of possibleTypes) if (hint.equals(type) || this.registry.isSpecializationOf(hint.getType(), type.getType())) return [hint]
    return possibleTypes
  }
}

// ---------------------------------------------------------------------------
// MimeTypesReader (analyse de tika-mimetypes.xml)
// ---------------------------------------------------------------------------

class MinShouldMatchVal implements Clause {
  constructor(readonly val: number) {}
  eval(): boolean {
    throw new Error('This should never be used on this placeholder class')
  }
  size(): number {
    return 0
  }
}

class ClauseRecord {
  subclauses: Clause[] | null = null

  constructor(
    readonly parent: ClauseRecord | null,
    public clause: Clause | null,
  ) {}
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (_m, e: string) => {
    if (e === 'lt') return '<'
    if (e === 'gt') return '>'
    if (e === 'amp') return '&'
    if (e === 'quot') return '"'
    if (e === 'apos') return "'"
    return String.fromCodePoint(e.startsWith('#x') ? parseInt(e.substring(2), 16) : parseInt(e.substring(1), 10))
  })
}

class MimeTypesReader {
  private type: MimeType | null = null
  private priority = 0
  private current: ClauseRecord | null = new ClauseRecord(null, null)

  constructor(private readonly types: MimeTypes) {}

  /** Analyse SAX minimale (le fichier est bien formé, sans DTD ni CDATA) */
  read(xml: string): void {
    const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(xml)) !== null) {
      if (m[2] === undefined) continue
      const name = m[2]
      if (m[1] === '/') {
        this.endElement(name)
        continue
      }
      const attrs = new Map<string, string>()
      const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
      let a: RegExpExecArray | null
      while ((a = attrRe.exec(m[3] as string)) !== null) {
        // normalisation des valeurs d'attribut XML : \r\n, \r, \n, \t -> espace
        const raw = (a[2] ?? a[3] ?? '').replace(/\r\n|[\r\n\t]/g, ' ')
        attrs.set(a[1] as string, decodeXmlEntities(raw))
      }
      this.startElement(name, attrs)
      if (m[4] === '/') this.endElement(name)
    }
  }

  private startElement(qName: string, attributes: Map<string, string>): void {
    const attr = (k: string): string | null => attributes.get(k) ?? null
    if (this.type === null) {
      if (qName === 'mime-type') {
        const name = attr('type') as string
        const interpreted = attr('interpreted') === 'true'
        this.type = this.types.forName(name)
        this.type.interpreted = interpreted
      }
    } else if (qName === 'alias') {
      this.types.addAlias(this.type, MediaType.parse(attr('type')) as MediaType)
    } else if (qName === 'sub-class-of') {
      this.types.setSuperType(this.type, MediaType.parse(attr('type')) as MediaType)
    } else if (qName === 'glob') {
      const pattern = attr('pattern')
      const isRegex = attr('isregex')
      if (pattern !== null) this.types.addPattern(this.type, pattern, isRegex !== null && isRegex.toLowerCase() === 'true')
    } else if (qName === 'root-XML') {
      this.type.addRootXML(attr('namespaceURI'), attr('localName'))
    } else if (qName === 'match') {
      if (attr('minShouldMatch') !== null) {
        this.current = new ClauseRecord(this.current, new MinShouldMatchVal(parseJavaInt(attr('minShouldMatch') as string, 10)))
      } else {
        this.current = new ClauseRecord(this.current, new MagicMatch(this.type.getType(), attr('type') ?? 'string', attr('offset'), attr('value') as string, attr('mask')))
      }
    } else if (qName === 'magic') {
      const value = attr('priority')
      this.priority = value !== null && value.length > 0 ? parseJavaInt(value, 10) : 50
      this.current = new ClauseRecord(null, null)
    }
  }

  private endElement(qName: string): void {
    if (this.type === null) return
    if (qName === 'mime-type') {
      this.type = null
    } else if (qName === 'match') {
      this.stop(this.current as ClauseRecord)
    } else if (qName === 'magic') {
      for (const clause of (this.current as ClauseRecord).subclauses ?? []) this.type.addMagic(new Magic(this.type, this.priority, clause))
      this.current = null
    }
  }

  private stop(rec: ClauseRecord): void {
    if (rec.clause instanceof MinShouldMatchVal) {
      rec.clause = new MinShouldMatchClause(rec.clause.val, rec.subclauses ?? [])
    } else if (rec.subclauses !== null) {
      const subclause = rec.subclauses.length === 1 ? (rec.subclauses[0] as Clause) : new OrClause(rec.subclauses)
      rec.clause = new AndClause([rec.clause as Clause, subclause])
    }
    const parent = rec.parent as ClauseRecord
    if (parent.subclauses === null) parent.subclauses = [rec.clause as Clause]
    else parent.subclauses.push(rec.clause as Clause)
    this.current = parent
  }
}

// ---------------------------------------------------------------------------
// XmlRootExtractor
// ---------------------------------------------------------------------------

export type QName = { namespaceURI: string; localPart: string }

class MalformedCharException extends Exception {}
class XmlFatal extends Exception {}

/**
 * Port de org.apache.tika.detect.XmlRootExtractor : Tika lance un analyseur SAX (Xerces du JDK, espaces de noms,
 * DTD externe non chargée) et s'arrête au premier startElement. Ici, un analyseur du prologue XML
 * (déclaration, commentaires, PI, DOCTYPE) et de la balise racine, qui échoue là où Xerces lève une erreur fatale.
 * Une séquence d'octets invalide dans l'encodage (CharConversionException) fait réessayer avec la moitié des données.
 */
export class XmlRootExtractor {
  extractRootElement(data: Uint8Array): QName | null {
    for (;;) {
      try {
        return extractRoot(data)
      } catch (e) {
        if (!(e instanceof MalformedCharException)) return null
        let newLen = Math.floor(data.length / 2)
        if (newLen % 2 === 1) newLen--
        if (newLen > 0) data = data.subarray(0, newLen)
        else break
      }
    }
    return null
  }
}

/** Taille des blocs lus par le lecteur UTF-8 de Xerces (octets décodés d'un coup) */
const XERCES_CHUNK = 8192

function decodeXml(data: Uint8Array): { text: string; decl: boolean } {
  // détection de l'encodage (XMLEntityManager.getEncodingInfo)
  const b0 = data[0]
  const b1 = data[1]
  const b2 = data[2]
  const b3 = data[3]
  let utf16: string | null = null
  if (b0 === 0xfe && b1 === 0xff) utf16 = decodeUtf16(data.subarray(2), false)
  else if (b0 === 0xff && b1 === 0xfe && !(b2 === 0 && b3 === 0)) utf16 = decodeUtf16(data.subarray(2), true)
  else if (b0 === 0x00 && b1 === 0x3c && b2 === 0x00 && b3 === 0x3f) utf16 = decodeUtf16(data, false)
  else if (b0 === 0x3c && b1 === 0x00 && b2 === 0x3f && b3 === 0x00) utf16 = decodeUtf16(data, true)
  if (utf16 !== null) {
    // Xerces : un encodage déclaré incompatible avec UTF-16 est une erreur fatale (relevé sur le JDK)
    const d = /^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"[^"]*"|'[^']*')[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"([^"]*)"|'([^']*)')/.exec(utf16)
    if (d && !/^UTF-?16/i.test(d[1] ?? d[2] ?? '')) throw new XmlFatal('Encoding incompatible with UTF-16')
    return { text: utf16, decl: true }
  }
  let start = 0
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) start = 3
  // encodage déclaré (ASCII compatible)
  const head = Buffer.from(data.subarray(start, Math.min(data.length, start + 256))).toString('latin1')
  const m = /^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"[^"]*"|'[^']*')[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"([^"]*)"|'([^']*)')/.exec(head)
  const enc = m ? (m[1] ?? m[2] ?? '').toUpperCase() : 'UTF-8'
  const body = data.subarray(start)
  if (enc === 'UTF-8' || enc === 'UTF8') return { text: decodeUtf8Chunked(body), decl: false }
  if (enc === 'ISO-8859-1' || enc === 'LATIN1' || enc === 'ISO8859-1' || enc === 'ISO_8859-1') return { text: Buffer.from(body).toString('latin1'), decl: false }
  if (enc === 'US-ASCII' || enc === 'ASCII') {
    for (let i = 0; i < Math.min(body.length, XERCES_CHUNK); i++) if ((body[i] as number) >= 0x80) throw new MalformedCharException('Invalid byte for ASCII')
    return { text: Buffer.from(body).toString('latin1'), decl: false }
  }
  try {
    return { text: new TextDecoder(enc.toLowerCase()).decode(body), decl: false }
  } catch {
    // encodage inconnu de Java : erreur fatale
    throw new XmlFatal(`Invalid encoding name "${enc}"`)
  }
}

function decodeUtf16(data: Uint8Array, le: boolean): string {
  const n = data.length - (data.length % 2)
  let s = ''
  for (let i = 0; i < n; i += 2) s += String.fromCharCode(le ? (data[i] as number) | ((data[i + 1] as number) << 8) : ((data[i] as number) << 8) | (data[i + 1] as number))
  return s
}

/**
 * UTF-8 strict. Xerces lit le flux par blocs et lève MalformedByteSequenceException sur le premier bloc qui contient
 * une séquence invalide : on décode donc bloc par bloc et on ne garde que les blocs valides précédents,
 * l'erreur n'étant signalée que si l'analyse a besoin du bloc fautif (voir `extractRoot`).
 */
function decodeUtf8Chunked(body: Uint8Array): string {
  const dec = new TextDecoder('utf-8', { fatal: true })
  try {
    return dec.decode(body)
  } catch {
    // position du premier octet invalide
    let valid = 0
    let i = 0
    while (i < body.length) {
      const c = body[i] as number
      let n = c < 0x80 ? 1 : c >= 0xc2 && c < 0xe0 ? 2 : c >= 0xe0 && c < 0xf0 ? 3 : c >= 0xf0 && c < 0xf5 ? 4 : 0
      if (n === 0 || i + n > body.length) break
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(i, i + n))
      } catch {
        n = 0
      }
      if (n === 0) break
      i += n
      valid = i
    }
    const text = new TextDecoder('utf-8').decode(body.subarray(0, valid))
    return `${text}\u{FFFF}MALFORMED`
  }
}

/** plages de caractères (code points BMP) -> classe RegExp */
function charClass(prefix: string, ranges: [number, number][]): RegExp {
  const hex = (n: number): string => `\\x{${n.toString(16)}}`.replace('x{', 'u{')
  return new RegExp(`[${prefix}${ranges.map(([a, b]) => (a === b ? hex(a) : `${hex(a)}-${hex(b)}`)).join('')}]`, 'u')
}
// XML 1.0 (5e édition) NameStartChar / NameChar, limités au BMP (les surrogates sont acceptés à part)
const NAME_START_RANGES: [number, number][] = [
  [0xc0, 0xd6], [0xd8, 0xf6], [0xf8, 0x2ff], [0x370, 0x37d], [0x37f, 0x1fff], [0x200c, 0x200d], [0x2070, 0x218f],
  [0x2c00, 0x2fef], [0x3001, 0xd7ff], [0xf900, 0xfdcf], [0xfdf0, 0xfffd],
]
const NAME_START = charClass('A-Z_a-z:', NAME_START_RANGES)
const NAME_CHAR = charClass('\\-.0-9A-Z_a-z:', [[0xb7, 0xb7], [0x300, 0x36f], [0x203f, 0x2040], ...NAME_START_RANGES])

function extractRoot(data: Uint8Array): QName | null {
  let text: string
  try {
    text = decodeXml(data).text
  } catch (e) {
    if (e instanceof MalformedCharException) throw e
    return null
  }
  const malformedAt = text.indexOf('\u{FFFF}MALFORMED')
  const p = new PrologParser(malformedAt < 0 ? text : text.substring(0, malformedAt), malformedAt >= 0)
  try {
    return p.parse()
  } catch (e) {
    if (e instanceof MalformedCharException) throw e
    return null
  }
}

class PrologParser {
  i = 0
  /** entités générales : texte de remplacement (null : entité externe, interdite dans un attribut) */
  private entities = new Map<string, string | null>([
    ['amp', '&#38;'],
    ['lt', '&#60;'],
    ['gt', '>'],
    ['quot', '"'],
    ['apos', "'"],
  ])

  constructor(
    private readonly s: string,
    private readonly truncatedByMalformed: boolean,
  ) {}

  /** fin des données : si elle est due à une séquence invalide, c'est une CharConversionException */
  private eof(): never {
    if (this.truncatedByMalformed) throw new MalformedCharException('Invalid byte sequence')
    throw new XmlFatal('Premature end of file.')
  }

  private peek(k = 0): string {
    const c = this.s[this.i + k]
    if (c === undefined) this.eof()
    return c
  }

  private startsWith(t: string): boolean {
    if (this.s.length - this.i < t.length) {
      if (t.startsWith(this.s.substring(this.i))) this.eof()
      return false
    }
    return this.s.startsWith(t, this.i)
  }

  private isWs(c: string): boolean {
    return c === ' ' || c === '\t' || c === '\n' || c === '\r'
  }

  private skipWs(): boolean {
    let any = false
    while (this.i < this.s.length && this.isWs(this.s[this.i] as string)) {
      this.i++
      any = true
    }
    if (this.i >= this.s.length) this.eof()
    return any
  }

  private checkChar(c: number): void {
    // XML 1.0 Char
    if (!(c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xd800 && c <= 0xdfff) || (c >= 0xe000 && c <= 0xfffd))) throw new XmlFatal('Invalid XML character')
  }

  private name(): string {
    const start = this.i
    if (!NAME_START.test(this.peek()) && !this.isSurrogate(this.peek())) throw new XmlFatal('Invalid name start')
    this.i++
    while (NAME_CHAR.test(this.peek()) || this.isSurrogate(this.peek())) this.i++
    return this.s.substring(start, this.i)
  }

  private isSurrogate(c: string): boolean {
    const code = c.charCodeAt(0)
    return code >= 0xd800 && code <= 0xdbff
  }

  private until(end: string): string {
    const idx = this.s.indexOf(end, this.i)
    if (idx < 0) this.eof()
    const content = this.s.substring(this.i, idx)
    for (let k = 0; k < content.length; k++) this.checkChar(content.charCodeAt(k))
    this.i = idx + end.length
    return content
  }

  private quoted(): string {
    const q = this.peek()
    if (q !== '"' && q !== "'") throw new XmlFatal('Quote expected')
    this.i++
    return this.until(q)
  }

  parse(): QName | null {
    // XMLDecl?
    if (this.startsWith('<?xml') && (this.i + 5 >= this.s.length ? this.eof() : this.isWs(this.s[this.i + 5] as string) || this.s[this.i + 5] === '?')) {
      this.xmlDecl()
    }
    // Misc* (doctypedecl Misc*)?
    let seenDoctype = false
    for (;;) {
      this.skipWs()
      if (this.startsWith('<!--')) this.comment()
      else if (this.startsWith('<?')) this.pi()
      else if (this.startsWith('<!DOCTYPE')) {
        if (seenDoctype) throw new XmlFatal('Already seen doctype')
        seenDoctype = true
        this.doctype()
      } else if (this.peek() === '<') {
        return this.rootTag()
      } else throw new XmlFatal('Content is not allowed in prolog.')
    }
  }

  private xmlDecl(): void {
    this.i += 5
    this.skipWs()
    if (!this.startsWith('version')) throw new XmlFatal('version required')
    this.i += 7
    this.eq()
    const v = this.quoted()
    if (!/^1\.[0-9]+$/.test(v)) throw new XmlFatal(`XML version "${v}" is not supported`)
    let ws = this.skipWs()
    if (this.startsWith('encoding')) {
      if (!ws) throw new XmlFatal('ws required')
      this.i += 8
      this.eq()
      const e = this.quoted()
      if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(e)) throw new XmlFatal('Invalid encoding name')
      ws = this.skipWs()
    }
    if (this.startsWith('standalone')) {
      if (!ws) throw new XmlFatal('ws required')
      this.i += 10
      this.eq()
      const sd = this.quoted()
      if (sd !== 'yes' && sd !== 'no') throw new XmlFatal('standalone')
      this.skipWs()
    }
    if (!this.startsWith('?>')) throw new XmlFatal('?> expected')
    this.i += 2
  }

  private eq(): void {
    this.skipWs()
    if (this.peek() !== '=') throw new XmlFatal('= expected')
    this.i++
    this.skipWs()
  }

  private comment(): void {
    this.i += 4
    const content = this.until('-->')
    if (content.includes('--') || content.endsWith('-')) throw new XmlFatal('The string "--" is not permitted within comments.')
  }

  private pi(): void {
    this.i += 2
    const target = this.name()
    if (target.toLowerCase() === 'xml') throw new XmlFatal('The processing instruction target matching "[xX][mM][lL]" is not allowed.')
    if (target.includes(':')) throw new XmlFatal('colon in PI target')
    if (this.startsWith('?>')) {
      this.i += 2
      return
    }
    if (!this.isWs(this.peek())) throw new XmlFatal('ws expected')
    this.until('?>')
  }

  private doctype(): void {
    this.i += 9
    if (!this.skipWs()) throw new XmlFatal('ws required')
    this.name()
    let ws = this.skipWs()
    if (this.startsWith('SYSTEM')) {
      if (!ws) throw new XmlFatal('ws')
      this.i += 6
      if (!this.skipWs()) throw new XmlFatal('ws')
      this.quoted()
      ws = this.skipWs()
    } else if (this.startsWith('PUBLIC')) {
      if (!ws) throw new XmlFatal('ws')
      this.i += 6
      if (!this.skipWs()) throw new XmlFatal('ws')
      const pub = this.quoted()
      if (!/^[ \r\na-zA-Z0-9\-'()+,./:=?;!*#@$_%]*$/.test(pub)) throw new XmlFatal('Invalid public id')
      if (!this.skipWs()) throw new XmlFatal('ws')
      this.quoted()
      this.skipWs()
    }
    if (this.peek() === '[') {
      this.i++
      this.internalSubset()
      this.skipWs()
    }
    if (this.peek() !== '>') throw new XmlFatal('> expected')
    this.i++
  }

  private internalSubset(): void {
    for (;;) {
      this.skipWs()
      if (this.peek() === ']') {
        this.i++
        return
      }
      if (this.startsWith('<!--')) this.comment()
      else if (this.startsWith('<?')) this.pi()
      else if (this.peek() === '%') {
        this.i++
        this.name()
        if (this.peek() !== ';') throw new XmlFatal('; expected')
        this.i++
      } else if (this.startsWith('<!ENTITY')) {
        this.i += 8
        if (!this.skipWs()) throw new XmlFatal('ws')
        let pe = false
        if (this.peek() === '%') {
          pe = true
          this.i++
          this.skipWs()
        }
        const n = this.name()
        this.skipWs()
        const q = this.peek()
        const value = q === '"' || q === "'" ? this.quoted() : null
        // la première déclaration l'emporte
        if (!pe && !this.entities.has(n)) this.entities.set(n, value)
        this.markupRest()
      } else if (this.startsWith('<!ELEMENT') || this.startsWith('<!ATTLIST') || this.startsWith('<!NOTATION')) {
        this.i += 2
        this.markupRest()
      } else throw new XmlFatal('Invalid markup in internal subset')
    }
  }

  /** reste d'une déclaration de balisage jusqu'au `>` (hors chaînes) */
  private markupRest(): void {
    for (;;) {
      const c = this.peek()
      if (c === '"' || c === "'") this.quoted()
      else if (c === '>') {
        this.i++
        return
      } else this.i++
    }
  }

  private rootTag(): QName {
    this.i++
    const qname = this.name()
    const attrs: [string, string][] = []
    for (;;) {
      const ws = this.skipWs()
      const c = this.peek()
      if (c === '>') {
        this.i++
        break
      }
      if (c === '/') {
        if (this.peek(1) !== '>') throw new XmlFatal('> expected')
        this.i += 2
        break
      }
      if (!ws) throw new XmlFatal('Element type must be followed by either attribute specifications, ">" or "/>".')
      const an = this.name()
      this.eq()
      const q = this.peek()
      if (q !== '"' && q !== "'") throw new XmlFatal('Open quote is expected')
      this.i++
      let value = ''
      for (;;) {
        const ch = this.peek()
        if (ch === q) {
          this.i++
          break
        }
        value += this.attrChar(0)
      }
      if (attrs.some(([k]) => k === an)) throw new XmlFatal(`Attribute "${an}" was already specified for element "${qname}".`)
      attrs.push([an, value])
    }
    return this.namespaces(qname, attrs)
  }

  /** valeur d'une entité générale dans un attribut (références imbriquées développées) */
  private expandEntity(name: string, depth: number): string {
    if (!this.entities.has(name)) throw new XmlFatal(`The entity "${name}" was referenced, but not declared.`)
    const v = this.entities.get(name)
    if (v === null || v === undefined) throw new XmlFatal(`The external entity reference "&${name};" is not permitted in an attribute value.`)
    if (depth > 20) throw new XmlFatal('entity expansion')
    const sub = new PrologParser(v, false)
    sub.entities = this.entities
    let out = ''
    while (sub.i < v.length) {
      if (v[sub.i] === '<') throw new XmlFatal('The value of attribute must not contain the \'<\' character.')
      out += sub.attrChar(depth + 1)
    }
    return out
  }

  /** un caractère ou une référence d'une valeur d'attribut */
  private attrChar(depth: number): string {
    const ch = this.peek()
    if (ch === '<') throw new XmlFatal('The value of attribute must not contain the \'<\' character.')
    if (ch === '&') {
      this.i++
      if (this.peek() === '#') {
        this.i++
        let hex = false
        if (this.peek() === 'x') {
          hex = true
          this.i++
        }
        const start = this.i
        while (this.peek() !== ';') this.i++
        const digits = this.s.substring(start, this.i)
        this.i++
        if (!(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(digits)) throw new XmlFatal('Invalid char ref')
        const cp = parseInt(digits, hex ? 16 : 10)
        if (!(cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff))) throw new XmlFatal('Invalid char ref')
        return String.fromCodePoint(cp)
      }
      const en = this.name()
      if (this.peek() !== ';') throw new XmlFatal('; expected')
      this.i++
      return this.expandEntity(en, depth)
    }
    this.checkChar(ch.charCodeAt(0))
    this.i++
    return this.isWs(ch) ? ' ' : ch
  }

  private namespaces(qname: string, attrs: [string, string][]): QName {
    // espaces de noms
    const ns = new Map<string, string>([['xml', 'http://www.w3.org/XML/1998/namespace']])
    let defaultNs = ''
    for (const [k, v] of attrs) {
      if (k === 'xmlns') {
        if (v === 'http://www.w3.org/XML/1998/namespace' || v === 'http://www.w3.org/2000/xmlns/') throw new XmlFatal('reserved namespace')
        defaultNs = v
      } else if (k.startsWith('xmlns:')) {
        const prefix = k.substring(6)
        if (prefix.length === 0 || prefix.includes(':')) throw new XmlFatal('Invalid prefix')
        if (prefix === 'xmlns') throw new XmlFatal('xmlns prefix')
        if (v === '') throw new XmlFatal('Prefixed namespace bindings may not be empty.')
        if (prefix === 'xml' ? v !== 'http://www.w3.org/XML/1998/namespace' : v === 'http://www.w3.org/XML/1998/namespace' || v === 'http://www.w3.org/2000/xmlns/') throw new XmlFatal('reserved namespace')
        ns.set(prefix, v)
      }
    }
    const resolve = (n: string, isElement: boolean): QName => {
      const parts = n.split(':')
      if (parts.length > 2 || parts.some((p) => p.length === 0)) throw new XmlFatal(`The QName "${n}" is not valid`)
      if (parts.length === 1) return { namespaceURI: isElement ? defaultNs : '', localPart: n }
      const prefix = parts[0] as string
      if (!NAME_START.test(parts[1]?.[0] ?? '') || parts[1]?.[0] === ':') throw new XmlFatal('Invalid local name')
      const uri = ns.get(prefix)
      if (uri === undefined) throw new XmlFatal(`The prefix "${prefix}" for element "${n}" is not bound.`)
      return { namespaceURI: uri, localPart: parts[1] as string }
    }
    const seen = new Set<string>()
    for (const [k] of attrs) {
      if (k === 'xmlns' || k.startsWith('xmlns:')) continue
      if (k.includes(':')) {
        const q = resolve(k, false)
        const key = `{${q.namespaceURI}}${q.localPart}`
        if (seen.has(key)) throw new XmlFatal('duplicate attribute')
        seen.add(key)
      }
    }
    return resolve(qname, true)
  }
}

// ---------------------------------------------------------------------------
// Detector / TikaConfig
// ---------------------------------------------------------------------------

export interface Detector {
  detect(input: InputStream | null, metadata: Metadata): MediaType
}

/** `DefaultDetector` avec tika-core seul : CompositeDetector(registre, [MimeTypes]) */
class DefaultDetector implements Detector {
  constructor(private readonly types: MimeTypes) {}

  detect(input: InputStream | null, metadata: Metadata): MediaType {
    // PORT: détection des surcharges (CONTENT_TYPE_USER_OVERRIDE / PARSER_OVERRIDE) non portée : jamais renseignées par Komga
    let type = MediaType.OCTET_STREAM
    const detected = this.types.detect(input, metadata)
    if (this.types.getMediaTypeRegistry().isSpecializationOf(detected, type)) type = detected
    return type
  }
}

export class TikaConfig {
  readonly mimeRepository: MimeTypes
  readonly detector: Detector

  constructor() {
    this.mimeRepository = MimeTypes.getDefaultMimeTypes()
    this.detector = new DefaultDetector(this.mimeRepository)
  }
}
