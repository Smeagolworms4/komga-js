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

/** `ObjectMapper().readTree(text)` */
export function readTree(text: string): JsonNode {
  let i = 0
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i] as string)) i++
  }
  const fail = (): never => {
    throw new SyntaxError(`Unexpected character at ${i} in JSON`)
  }
  const value = (): JsonNode => {
    ws()
    const c = text[i]
    if (c === '{') {
      i++
      const o = new Map<string, JsonNode>()
      ws()
      if (text[i] === '}') {
        i++
        return o
      }
      for (;;) {
        ws()
        if (text[i] !== '"') fail()
        const k = str()
        ws()
        if (text[i++] !== ':') fail()
        o.set(k, value())
        ws()
        if (text[i] === ',') i++
        else if (text[i] === '}') {
          i++
          return o
        } else fail()
      }
    }
    if (c === '[') {
      i++
      const a: JsonNode[] = []
      ws()
      if (text[i] === ']') {
        i++
        return a
      }
      for (;;) {
        a.push(value())
        ws()
        if (text[i] === ',') i++
        else if (text[i] === ']') {
          i++
          return a
        } else fail()
      }
    }
    if (c === '"') return str()
    if (text.startsWith('true', i)) return (i += 4), true
    if (text.startsWith('false', i)) return (i += 5), false
    if (text.startsWith('null', i)) return (i += 4), null
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
    if (!m) return fail()
    i += m[0].length
    if (m[2] === undefined && m[3] === undefined) {
      const b = BigInt(m[0])
      return new JsonNumber('int', b >= BigInt(Number.MIN_SAFE_INTEGER) && b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : b)
    }
    return new JsonNumber('double', Number(m[0]))
  }
  const str = (): string => {
    const start = i
    i++
    for (;;) {
      if (i >= text.length) fail()
      if (text[i] === '\\') i += 2
      else if (text[i] === '"') break
      else i++
    }
    i++
    return JSON.parse(text.slice(start, i)) as string
  }
  const v = value()
  ws()
  if (i !== text.length) fail()
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
