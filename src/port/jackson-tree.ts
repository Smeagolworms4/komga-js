// Support de portage : arbre JSON Jackson (ObjectMapper.readTree / writeValue sur JsonNode) fidèle aux octets.
// Ce fichier n'a pas de jumeau Kotlin.
// Jackson conserve la nature des nombres (IntNode/LongNode/BigIntegerNode/DoubleNode) et écrit les doubles avec
// Double.toString de Java ("1.0", "1.0E-4"), contrairement à JSON.parse/JSON.stringify.

export class JsonNumber {
  constructor(
    /** 'int' pour IntNode/LongNode/BigIntegerNode, 'double' pour DoubleNode */
    readonly kind: 'int' | 'double',
    readonly value: number | bigint,
  ) {}
}

// Objets : Map pour conserver l'ordre d'insertion des clés comme ObjectNode (un objet JS place les clés numériques en premier)
export type JsonNode = null | boolean | string | JsonNumber | JsonNode[] | Map<string, JsonNode>

// ---------------------------------------------------------------------------
// Lecture (UTF8StreamJsonParser de jackson-core 2.19, fonctionnalités par défaut : ni commentaires, ni guillemets simples,
// ni zéros en tête, ni NaN ; messages d'erreur identiques)
// ---------------------------------------------------------------------------

/**
 * Erreur de lecture différée : Jackson lit le flux au fil de la désérialisation, une erreur de syntaxe n'apparaît qu'au
 * moment où le jeton fautif est lu (une erreur de type rencontrée avant l'emporte). En mode `lenient`, `readTree`
 * place l'erreur dans l'arbre, là où le flux s'interrompt : à la place d'une valeur, ou après les entrées lues d'un
 * objet ou d'un tableau (`deferredError`). `mismatch` : MismatchedInputException (document vide) au lieu de JsonParseException.
 */
export class JsonPoison {
  constructor(
    readonly message: string,
    readonly mismatch = false,
  ) {}
}

/** Erreur de lecture levée par `readTree` hors mode `lenient` */
export class JsonReadError extends Error {
  constructor(
    message: string,
    readonly mismatch = false,
  ) {
    super(message)
  }
}

const deferred = new WeakMap<object, JsonPoison>()

/** Erreur survenue après les entrées lues d'un objet (Map) ou d'un tableau */
export function deferredError(container: object): JsonPoison | undefined {
  return deferred.get(container)
}

const VALID_VALUES = "(JSON String, Number, Array, Object or token 'null', 'true' or 'false')"
const MAX_ERROR_TOKEN_LENGTH = 256

/** `Character.isISOControl` */
function isIsoControl(c: number): boolean {
  return c <= 0x1f || (c >= 0x7f && c <= 0x9f)
}

/** `Character.isJavaIdentifierStart` */
function isJavaIdentifierStart(c: number): boolean {
  return /[\p{L}\p{Nl}\p{Sc}\p{Pc}]/u.test(String.fromCodePoint(c))
}

/** `Character.isJavaIdentifierPart` */
function isJavaIdentifierPart(c: number): boolean {
  if ((c >= 0 && c <= 8) || (c >= 0x0e && c <= 0x1b) || (c >= 0x7f && c <= 0x9f)) return true
  return /[\p{L}\p{Nl}\p{Sc}\p{Pc}\p{Nd}\p{Mn}\p{Mc}\p{Cf}]/u.test(String.fromCodePoint(c))
}

/** `ParserMinimalBase._getCharDesc` */
function charDesc(c: number): string {
  if (isIsoControl(c)) return `(CTRL-CHAR, code ${c})`
  if (c > 255) return `'${String.fromCodePoint(c)}' (code ${c} / 0x${c.toString(16)})`
  return `'${String.fromCharCode(c)}' (code ${c})`
}

/** `ObjectMapper().readTree(text)` ; `lenient` : erreurs de syntaxe placées dans l'arbre (JsonPoison) */
export function readTree(text: string, { allowTrailing = false, lenient = false }: { allowTrailing?: boolean; lenient?: boolean } = {}): JsonNode {
  let i = 0
  let aborted = false
  const n = text.length
  const cp = (at: number): number => text.codePointAt(at) as number
  const width = (c: number): number => (c > 0xffff ? 2 : 1)
  /** premier octet UTF-8 du caractère (le flux d'octets de Jackson rapporte parfois l'octet brut) */
  const rawByte = (c: number): number => (c < 0x80 ? c : (Buffer.from(String.fromCodePoint(c), 'utf8')[0] as number))
  const poison = (message: string, mismatch = false): JsonPoison => {
    aborted = true
    if (!lenient) throw new JsonReadError(message, mismatch)
    return new JsonPoison(message, mismatch)
  }
  class Stop {
    constructor(readonly p: JsonPoison) {}
  }
  const stop = (message: string): never => {
    throw new Stop(poison(message))
  }
  const unexpected = (c: number, comment: string): never => stop(`Unexpected character (${charDesc(c)}): ${comment}`)
  const unexpectedNumberChar = (c: number, comment: string): never => stop(`Unexpected character (${charDesc(c)}) in numeric value: ${comment}`)
  /** JsonLocation d'un marqueur d'ouverture : ligne et colonne (octets) */
  const location = (at: number): string => {
    let line = 1
    let lineStart = 0
    for (let k = 0; k < at; k++) {
      const ch = text.charCodeAt(k)
      if (ch === 0x0a || (ch === 0x0d && text.charCodeAt(k + 1) !== 0x0a)) {
        line++
        lineStart = k + 1
      }
    }
    const column = Buffer.byteLength(text.slice(lineStart, at), 'utf8') + 1
    return `[Source: REDACTED (\`StreamReadFeature.INCLUDE_SOURCE_IN_LOCATION\` disabled); line: ${line}, column: ${column}]`
  }
  /** `_skipWS` / `_skipWSOrEnd` : -1 en fin d'entrée */
  const skipWs = (): number => {
    while (i < n) {
      const c = text.charCodeAt(i)
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++
      else if (c === 0x2f) unexpected(c, "maybe a (non-standard) comment? (not recognized as one since Feature 'ALLOW_COMMENTS' not enabled for parser)")
      else if (c < 0x20) stop(`Illegal character (${charDesc(c)}): only regular white space (\\r, \\n, \\t) is allowed between tokens`)
      else return c
    }
    return -1
  }
  /** `_reportInvalidToken` : le jeton se prolonge tant que les caractères sont des parties d'identifiant Java */
  const invalidToken = (matched: string): never => {
    let sb = matched
    while (i < n) {
      const c = cp(i)
      if (!isJavaIdentifierPart(c)) break
      i += width(c)
      sb += String.fromCodePoint(c)
      if (sb.length >= MAX_ERROR_TOKEN_LENGTH) {
        sb += '...'
        break
      }
    }
    return stop(`Unrecognized token '${sb}': was expecting ${VALID_VALUES}`)
  }
  /** `_matchToken` : `i` pointe sur le premier caractère (déjà reconnu) */
  const matchToken = (token: string): void => {
    for (let k = 1; k < token.length; k++) {
      i++
      if (i >= n || text[i] !== token[k]) invalidToken(token.slice(0, k))
    }
    i++
    if (i < n) {
      const c = cp(i)
      if (c >= 0x30 && c !== 0x5d && c !== 0x7d && isJavaIdentifierPart(c)) invalidToken(token)
    }
  }
  const str = (kind: 'VALUE_STRING' | 'field name'): string => {
    // i sur le guillemet ouvrant
    i++
    let out = ''
    for (;;) {
      if (i >= n) stop(`Unexpected end-of-input in ${kind}`)
      const c = cp(i)
      if (c === 0x22) {
        i++
        return out
      }
      if (c === 0x5c) {
        i++
        if (i >= n) stop('Unexpected end-of-input in character escape sequence')
        const e = cp(i)
        i += width(e)
        switch (e) {
          case 0x62:
            out += '\b'
            break
          case 0x74:
            out += '\t'
            break
          case 0x6e:
            out += '\n'
            break
          case 0x66:
            out += '\f'
            break
          case 0x72:
            out += '\r'
            break
          case 0x22:
          case 0x2f:
          case 0x5c:
            out += String.fromCharCode(e)
            break
          case 0x75: {
            let v = 0
            for (let k = 0; k < 4; k++) {
              if (i >= n) stop('Unexpected end-of-input in character escape sequence')
              const h = cp(i)
              const d = h >= 0x30 && h <= 0x39 ? h - 0x30 : h >= 0x61 && h <= 0x66 ? h - 0x57 : h >= 0x41 && h <= 0x46 ? h - 0x37 : -1
              if (d < 0) unexpected(h, 'expected a hex-digit for character escape sequence')
              v = (v << 4) | d
              i += width(h)
            }
            out += String.fromCharCode(v)
            break
          }
          default:
            stop(`Unrecognized character escape ${charDesc(e)}`)
        }
        continue
      }
      if (c < 0x20) stop(`Illegal unquoted character (${charDesc(c)}): has to be escaped using backslash to be included in ${kind === 'field name' ? 'name' : 'string value'}`)
      out += String.fromCodePoint(c)
      i += width(c)
    }
  }
  const digit = (at: number): boolean => at < n && text.charCodeAt(at) >= 0x30 && text.charCodeAt(at) <= 0x39
  const charAt = (at: number): number => (at < n ? cp(at) : -1)
  const number = (root: boolean): JsonNode => {
    const start = i
    if (text[i] === '-') {
      i++
      if (i >= n) stop('Unexpected end-of-input in a Number value')
      if (!digit(i)) {
        if (text.startsWith('Infinity', i)) stop("Non-standard token '-Infinity': enable `JsonReadFeature.ALLOW_NON_NUMERIC_NUMBERS` to allow")
        unexpectedNumberChar(rawByte(cp(i)), 'expected digit (0-9) to follow minus sign, for valid numeric value')
      }
    }
    // _verifyNoLeadingZeroes
    if (text[i] === '0' && digit(i + 1)) stop('Invalid numeric value: Leading zeroes not allowed')
    while (digit(i)) i++
    let isInt = true
    if (text[i] === '.') {
      isInt = false
      i++
      if (!digit(i)) unexpectedNumberChar(i < n ? rawByte(cp(i)) : 0x2e, 'Decimal point not followed by a digit')
      while (digit(i)) i++
    }
    if (text[i] === 'e' || text[i] === 'E') {
      isInt = false
      i++
      if (text[i] === '+' || text[i] === '-') i++
      if (!digit(i)) unexpectedNumberChar(i < n ? rawByte(cp(i)) : text.charCodeAt(i - 1), 'Exponent indicator not followed by a digit')
      while (digit(i)) i++
    }
    // _verifyRootSpace
    if (root && i < n) {
      const c = text.charCodeAt(i)
      if (!(c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d)) unexpected(rawByte(cp(i)), 'Expected space separating root-level values')
    }
    const literal = text.slice(start, i)
    if (isInt) {
      const b = BigInt(literal)
      return new JsonNumber('int', b >= BigInt(Number.MIN_SAFE_INTEGER) && b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : b)
    }
    return new JsonNumber('double', Number(literal))
  }
  /** `_nextTokenNotInObject` / valeur d'un champ, `c` : premier caractère (non blanc) */
  const value = (c: number, ctx: 'root' | 'object' | 'array'): JsonNode => {
    try {
      switch (c) {
        case 0x22:
          return str('VALUE_STRING')
        case 0x7b:
          return object()
        case 0x5b:
          return array()
        case 0x2d:
          return number(ctx === 'root')
        case 0x74:
          matchToken('true')
          return true
        case 0x66:
          matchToken('false')
          return false
        case 0x6e:
          matchToken('null')
          return null
        case 0x2b:
          return unexpectedNumberChar(c, 'JSON spec does not allow numbers to have plus signs: enable `JsonReadFeature.ALLOW_LEADING_PLUS_SIGN_FOR_NUMBERS` to allow')
      }
      if (c >= 0x30 && c <= 0x39) return number(ctx === 'root')
      // _handleUnexpectedValue
      switch (c) {
        case 0x5d:
          if (ctx === 'array') unexpected(c, 'expected a value')
          break
        case 0x2c:
        case 0x7d:
          unexpected(c, 'expected a value')
          break
        case 0x4e:
          matchToken('NaN')
          stop("Non-standard token 'NaN': enable `JsonReadFeature.ALLOW_NON_NUMERIC_NUMBERS` to allow")
          break
        case 0x49:
          matchToken('Infinity')
          stop("Non-standard token 'Infinity': enable `JsonReadFeature.ALLOW_NON_NUMERIC_NUMBERS` to allow")
          break
      }
      // l'octet brut est pris pour un caractère ISO-8859-1 ; la suite d'un caractère multi-octets est alors un octet de
      // continuation, rejeté comme début de séquence UTF-8
      const b = rawByte(c)
      if (isJavaIdentifierStart(b)) {
        if (c >= 0x80) stop(`Invalid UTF-8 start byte 0x${(Buffer.from(String.fromCodePoint(c), 'utf8')[1] as number).toString(16)}`)
        i += 1
        return invalidToken(String.fromCharCode(b))
      }
      return unexpected(b, `expected a valid value ${VALID_VALUES}`)
    } catch (e) {
      if (e instanceof Stop) return e.p as unknown as JsonNode
      throw e
    }
  }
  const closeMarker = (c: number, expected: '}' | ']', type: 'Object' | 'Array', startAt: number): never =>
    stop(`Unexpected close marker '${String.fromCharCode(c)}': expected '${expected}' (for ${type} starting at ${location(startAt)})`)
  const object = (): Map<string, JsonNode> => {
    const startAt = i
    i++
    const o = new Map<string, JsonNode>()
    try {
      let c = skipWs()
      let first = true
      for (;;) {
        if (c < 0) stop(`Unexpected end-of-input: expected close marker for Object (start marker at ${location(startAt)})`)
        if (c === 0x7d) {
          i++
          return o
        }
        if (c === 0x5d) closeMarker(c, '}', 'Object', startAt)
        if (!first) {
          if (c !== 0x2c) unexpected(rawByte(c), 'was expecting comma to separate Object entries')
          i++
          c = skipWs()
          if (c < 0) stop('Unexpected end-of-input within/between Object entries')
        }
        first = false
        if (c !== 0x22) unexpected(c, 'was expecting double-quote to start field name')
        const k = str('field name')
        c = skipWs()
        if (c < 0) stop('Unexpected end-of-input within/between Object entries')
        if (c !== 0x3a) unexpected(rawByte(c), 'was expecting a colon to separate field name and value')
        i++
        c = skipWs()
        if (c < 0) stop('Unexpected end-of-input within/between Object entries')
        o.set(k, value(c, 'object'))
        if (aborted) return o
        c = skipWs()
      }
    } catch (e) {
      if (e instanceof Stop) {
        deferred.set(o, e.p)
        return o
      }
      throw e
    }
  }
  const array = (): JsonNode[] => {
    const startAt = i
    i++
    const a: JsonNode[] = []
    try {
      let c = skipWs()
      let first = true
      for (;;) {
        if (c < 0) stop(`Unexpected end-of-input: expected close marker for Array (start marker at ${location(startAt)})`)
        if (c === 0x5d) {
          i++
          return a
        }
        if (c === 0x7d) closeMarker(c, ']', 'Array', startAt)
        if (!first) {
          if (c !== 0x2c) unexpected(rawByte(c), 'was expecting comma to separate Array entries')
          i++
          c = skipWs()
          if (c < 0) stop('Unexpected end-of-input within/between Array entries')
        }
        first = false
        a.push(value(c, 'array'))
        if (aborted) return a
        c = skipWs()
      }
    } catch (e) {
      if (e instanceof Stop) {
        deferred.set(a, e.p)
        return a
      }
      throw e
    }
  }
  let v: JsonNode
  try {
    const c = skipWs()
    // ObjectMapper._initForReading : document vide
    if (c < 0) return poison('No content to map due to end-of-input', true) as unknown as JsonNode
    if (c === 0x7d || c === 0x5d) stop(`Unexpected close marker '${String.fromCharCode(c)}': no open ${c === 0x5d ? 'Array' : 'Object'} to close`)
    v = value(c, 'root')
  } catch (e) {
    if (e instanceof Stop) return e.p as unknown as JsonNode
    throw e
  }
  // allowTrailing : DeserializationFeature.FAIL_ON_TRAILING_TOKENS désactivé (ObjectMapper) : le contenu après la
  // valeur racine n'est pas lu
  if (allowTrailing || aborted) return v
  try {
    const c = skipWs()
    if (c >= 0) stop(`Unexpected character (${charDesc(c)}): expected end-of-input`)
  } catch (e) {
    if (e instanceof Stop) return e.p as unknown as JsonNode
    throw e
  }
  return v
}

// Valeur exacte d'un double : num / den (BigInt), x > 0
function exactFraction(x: number): [bigint, bigint] {
  const b = new DataView(new ArrayBuffer(8))
  b.setFloat64(0, x)
  const bits = b.getBigUint64(0)
  const e = Number((bits >> 52n) & 0x7ffn)
  let m = bits & 0xfffffffffffffn
  let exp: number
  if (e === 0) exp = -1074
  else {
    m |= 1n << 52n
    exp = e - 1075
  }
  return exp >= 0 ? [m << BigInt(exp), 1n] : [m, 1n << BigInt(-exp)]
}

/**
 * Plus courte suite de chiffres (au moins 2, comme Java) qui redonne `x` via `roundTrip`,
 * la plus proche de la valeur exacte, égalité départagée vers le chiffre pair (algorithme de Java 19+).
 * Retourne les chiffres et l'exposant décimal du premier chiffre.
 */
function javaShortest(x: number, roundTrip: (c: number) => boolean): { digits: string; exp: number } {
  const [num, den] = exactFraction(x)
  // exposant décimal du premier chiffre significatif
  let e10 = Math.floor(Math.log10(x))
  const pow = (k: number): [bigint, bigint] => (k >= 0 ? [10n ** BigInt(k), 1n] : [1n, 10n ** BigInt(-k)])
  // corrige e10 pour que 10^e10 <= x < 10^(e10+1)
  for (;;) {
    const [pn, pd] = pow(e10)
    if (pn * den > num * pd) e10--
    else {
      const [qn, qd] = pow(e10 + 1)
      if (qn * den <= num * qd) e10++
      else break
    }
  }
  for (let p = 2; p <= 17; p++) {
    const k = e10 - p + 1
    const [pn, pd] = pow(k)
    // x / 10^k = num*pd / (den*pn)
    const a = num * pd
    const b = den * pn
    const lo = a / b
    const rem = a - lo * b // distance à lo (en unités de 1/b)
    const cands: { d: bigint; dist: bigint }[] = [
      { d: lo, dist: rem },
      { d: lo + 1n, dist: b - rem },
    ]
    const ok = cands.filter((c) => c.d > 0n && roundTrip(Number(`${c.d}e${k}`)))
    if (ok.length === 0) continue
    ok.sort((u, v) => (u.dist === v.dist ? Number(u.d % 2n) - Number(v.d % 2n) : u.dist < v.dist ? -1 : 1))
    const best = (ok[0] as { d: bigint }).d
    let digits = best.toString()
    let exp = e10
    if (digits.length > p) exp++ // retenue : 99 -> 100
    digits = digits.replace(/0+$/, '')
    return { digits: digits === '' ? '0' : digits, exp }
  }
  const [mant, expS] = x.toExponential().split('e') as [string, string]
  return { digits: mant.replace('.', ''), exp: Number(expS) }
}

function javaFormat(neg: boolean, a: number, digits: string, exp: number): string {
  let s: string
  if (a >= 1e-3 && a < 1e7) {
    if (exp >= 0) {
      const intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0')
      const frac = digits.slice(exp + 1)
      s = `${intPart}.${frac === '' ? '0' : frac}`
    } else {
      s = `0.${'0'.repeat(-exp - 1)}${digits}`
    }
  } else {
    s = `${digits[0]}.${digits.length > 1 ? digits.slice(1) : '0'}E${exp}`
  }
  return neg ? `-${s}` : s
}

/** `Double.toString(d)` de Java (JDK 19+). Vérifié contre la JVM (test/port/jackson-tree.test.ts). */
export function javaDoubleToString(d: number): string {
  if (Number.isNaN(d)) return 'NaN'
  if (d === Infinity) return 'Infinity'
  if (d === -Infinity) return '-Infinity'
  if (d === 0) return Object.is(d, -0) ? '-0.0' : '0.0'
  const a = Math.abs(d)
  const { digits, exp } = javaShortest(a, (c) => c === a)
  return javaFormat(d < 0, a, digits, exp)
}

/** `Float.toString(f)` de Java (JDK 19+) pour la valeur float32 de `f`. */
export function javaFloatToString(f: number): string {
  f = Math.fround(f)
  if (Number.isNaN(f)) return 'NaN'
  if (f === Infinity) return 'Infinity'
  if (f === -Infinity) return '-Infinity'
  if (f === 0) return Object.is(f, -0) ? '-0.0' : '0.0'
  const a = Math.abs(f)
  const { digits, exp } = javaShortest(a, (c) => Math.fround(c) === a)
  return javaFormat(f < 0, a, digits, exp)
}

const HEX = '0123456789ABCDEF'

function jacksonString(s: string): string {
  let out = '"'
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (c < 0x20) {
      if (c === 0x0a) out += '\\n'
      else if (c === 0x0d) out += '\\r'
      else if (c === 0x09) out += '\\t'
      else if (c === 0x08) out += '\\b'
      else if (c === 0x0c) out += '\\f'
      else out += `\\u00${HEX[c >> 4]}${HEX[c & 15]}`
    } else out += ch
  }
  return out + '"'
}

/** `ObjectMapper().writeValueAsString(node)` (sortie compacte). */
export function writeTree(n: JsonNode): string {
  if (n === null) return 'null'
  if (typeof n === 'boolean') return n ? 'true' : 'false'
  if (typeof n === 'string') return jacksonString(n)
  if (n instanceof JsonNumber) return n.kind === 'int' ? String(n.value) : javaDoubleToString(Number(n.value))
  if (Array.isArray(n)) return `[${n.map(writeTree).join(',')}]`
  return `{${[...n]
    .map(([k, v]) => `${jacksonString(k)}:${writeTree(v)}`)
    .join(',')}}`
}
