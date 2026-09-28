// Support de portage : conversions numériques de la stdlib Kotlin (JVM) : `String.toIntOrNull()`,
// `String.toFloatOrNull()`. Ce fichier n'a pas de jumeau Kotlin.
// Sur la JVM, les chiffres sont reconnus par `Character.digit` (tous les chiffres Unicode Nd, pas seulement ASCII) ;
// `toFloatOrNull` filtre avec la grammaire de `Double.valueOf` (espaces <= U+0020 autour, NaN, Infinity,
// hexadécimal, suffixe f/F/d/D) puis appelle `Float.parseFloat`, arrondi correct décimal -> float (sans double arrondi).
// Vérifié contre la stdlib Kotlin de Komga (jshell), voir test/port/kotlin-numbers.test.ts.

const ND = /^\p{Nd}$/u

/** `Character.digit(ch, 10)` pour une unité UTF-16 */
export function javaDigit(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30
  if (c >= 0xd800 && c <= 0xdfff) return -1
  if (!ND.test(String.fromCharCode(c))) return -1
  // les chiffres Unicode (Nd) forment des suites contiguës de valeurs 0..9
  let start = c
  while (ND.test(String.fromCharCode(start - 1))) start--
  return (c - start) % 10
}

/** `String.toIntOrNull()` */
export function toIntOrNull(s: string): number | null {
  const length = s.length
  if (length === 0) return null
  let start: number
  let isNegative: boolean
  const firstChar = s.charCodeAt(0)
  if (firstChar < 0x30) {
    if (length === 1) return null
    start = 1
    if (firstChar === 0x2d) isNegative = true
    else if (firstChar === 0x2b) isNegative = false
    else return null
  } else {
    start = 0
    isNegative = false
  }
  let result = 0
  for (let i = start; i < length; i++) {
    const digit = javaDigit(s.charCodeAt(i))
    if (digit < 0) return null
    result = result * 10 + digit
    if (result > (isNegative ? 2147483648 : 2147483647)) return null
  }
  return isNegative ? (result === 0 ? 0 : -result) : result
}

// Double.valueOf grammar (ScreenFloatValueRegEx de Kotlin), chiffres ASCII
const DIGITS = '([0-9]+)'
const HEX_DIGITS = '([0-9a-fA-F]+)'
const EXP = `[eE][+-]?${DIGITS}`
const HEX_STRING = `(0[xX]${HEX_DIGITS}(\\.)?)|(0[xX]${HEX_DIGITS}?(\\.)${HEX_DIGITS})`
const NUMBER = `(${DIGITS}(\\.)?(${DIGITS}?)(${EXP})?)|(\\.(${DIGITS})(${EXP})?)|((${HEX_STRING})[pP][+-]?${DIGITS})`
const FP_REGEX = new RegExp(`^[\\x00-\\x20]*[+-]?(NaN|Infinity|((${NUMBER})[fFdD]?))[\\x00-\\x20]*$`)

const FLOAT_MAX = 3.4028234663852886e38

function bitLength(n: bigint): number {
  return n === 0n ? 0 : n.toString(2).length
}

/** Arrondi correct (au plus proche, égalité -> pair) de num/den (> 0) en float 32 bits */
function ratToFloat(num: bigint, den: bigint): number {
  if (num === 0n) return 0
  // exposant e tel que num/den / 2^e ait 24 bits
  let e = bitLength(num) - bitLength(den) - 24
  if (e < -149) e = -149
  const scaledNum = e < 0 ? num << BigInt(-e) : num
  const scaledDen = e > 0 ? den << BigInt(e) : den
  let q = scaledNum / scaledDen
  const rem = scaledNum - q * scaledDen
  if (q >= 1n << 24n && e > -149) {
    // un bit de trop : recalcul avec e + 1
    return ratToFloatWith(num, den, e + 1)
  }
  const twice = rem * 2n
  if (twice > scaledDen || (twice === scaledDen && (q & 1n) === 1n)) q += 1n
  const v = Number(q) * 2 ** e
  return v > FLOAT_MAX ? Infinity : Math.fround(v)
}

function ratToFloatWith(num: bigint, den: bigint, e: number): number {
  const scaledNum = e < 0 ? num << BigInt(-e) : num
  const scaledDen = e > 0 ? den << BigInt(e) : den
  let q = scaledNum / scaledDen
  const rem = scaledNum - q * scaledDen
  const twice = rem * 2n
  if (twice > scaledDen || (twice === scaledDen && (q & 1n) === 1n)) q += 1n
  const v = Number(q) * 2 ** e
  return v > FLOAT_MAX ? Infinity : Math.fround(v)
}

/** `Float.parseFloat(s)` sur une chaîne déjà acceptée par la grammaire */
function javaParseFloat(str: string): number {
  let s = str.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '')
  let neg = false
  if (s[0] === '+' || s[0] === '-') {
    neg = s[0] === '-'
    s = s.slice(1)
  }
  let abs: number
  if (s === 'NaN') return NaN
  if (s === 'Infinity') abs = Infinity
  else {
    s = s.replace(/[fFdD]$/, '')
    if (/^0[xX]/.test(s)) {
      const m = /^0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?[pP]([+-]?[0-9]+)$/.exec(s) as RegExpExecArray
      const intPart = m[1] ?? ''
      const frac = m[2] ?? ''
      const mant = BigInt('0x0' + intPart + frac)
      let exp = Number(m[3]) - 4 * frac.length
      if (exp > 2000) exp = 2000
      if (exp < -2000) exp = -2000
      abs = exp >= 0 ? ratToFloat(mant << BigInt(exp), 1n) : ratToFloat(mant, 1n << BigInt(-exp))
    } else {
      const m = /^([0-9]*)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]+))?$/.exec(s) as RegExpExecArray
      const digits = ((m[1] ?? '') + (m[2] ?? '')).replace(/^0+/, '')
      const mant = BigInt('0' + digits)
      let exp = (m[3] !== undefined ? Number(m[3]) : 0) - (m[2] ?? '').length
      if (mant === 0n) abs = 0
      else if (exp + digits.length > 50) abs = Infinity
      else if (exp + digits.length < -60) abs = 0
      else {
        if (!Number.isFinite(exp)) exp = 0
        abs = exp >= 0 ? ratToFloat(mant * 10n ** BigInt(exp), 1n) : ratToFloat(mant, 10n ** BigInt(-exp))
      }
    }
  }
  return neg ? -abs : abs
}

/** `String.toFloatOrNull()` (valeur arrondie en float 32 bits) */
export function toFloatOrNull(s: string): number | null {
  if (!FP_REGEX.test(s)) return null
  return javaParseFloat(s)
}
