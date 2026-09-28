// Support de portage : comportements de java.lang.Character / java.lang.Float (JDK 21) utilisés par Lucene 9.9.1
// dans les analyseurs et le QueryParser de Komga.
// - Character.toLowerCase(int) : correspondance simple (1 pour 1) de Java, différente de String.toLowerCase de JS
//   (U+0130, versions d'Unicode) ; table relevée sur le JDK 21 (Unicode 15.0) par jshell, encodée en suites
//   [début, nombre, pas, décalage].
// - Float.parseFloat : grammaire de FloatingDecimal.readJavaFormatString.
// Ce fichier n'a pas de jumeau Kotlin.
import { NumberFormatException } from '../kotlin.js'

// prettier-ignore
const LOWER_RUNS: readonly (readonly [number, number, number, number])[] = [
  [65, 26, 1, 32], [192, 23, 1, 32], [216, 7, 1, 32], [0x100, 24, 2, 1], [0x130, 1, 1, -199], [0x132, 3, 2, 1],
  [0x139, 8, 2, 1], [0x14a, 23, 2, 1], [0x178, 1, 1, -121], [0x179, 3, 2, 1], [0x181, 1, 1, 210], [0x182, 2, 2, 1],
  [0x186, 1, 1, 206], [0x187, 1, 1, 1], [0x189, 2, 1, 205], [0x18b, 1, 1, 1], [0x18e, 1, 1, 79], [0x18f, 1, 1, 202],
  [0x190, 1, 1, 203], [0x191, 1, 1, 1], [0x193, 1, 1, 205], [0x194, 1, 1, 207], [0x196, 1, 1, 211],
  [0x197, 1, 1, 209], [0x198, 1, 1, 1], [0x19c, 1, 1, 211], [0x19d, 1, 1, 213], [0x19f, 1, 1, 214], [0x1a0, 3, 2, 1],
  [0x1a6, 1, 1, 218], [0x1a7, 1, 1, 1], [0x1a9, 1, 1, 218], [0x1ac, 1, 1, 1], [0x1ae, 1, 1, 218], [0x1af, 1, 1, 1],
  [0x1b1, 2, 1, 217], [0x1b3, 2, 2, 1], [0x1b7, 1, 1, 219], [0x1b8, 1, 1, 1], [0x1bc, 1, 1, 1], [0x1c4, 1, 1, 2],
  [0x1c5, 1, 1, 1], [0x1c7, 1, 1, 2], [0x1c8, 1, 1, 1], [0x1ca, 1, 1, 2], [0x1cb, 9, 2, 1], [0x1de, 9, 2, 1],
  [0x1f1, 1, 1, 2], [0x1f2, 2, 2, 1], [0x1f6, 1, 1, -97], [0x1f7, 1, 1, -56], [0x1f8, 20, 2, 1], [0x220, 1, 1, -130],
  [0x222, 9, 2, 1], [0x23a, 1, 1, 0x2a2b], [0x23b, 1, 1, 1], [0x23d, 1, 1, -163], [0x23e, 1, 1, 0x2a28],
  [0x241, 1, 1, 1], [0x243, 1, 1, -195], [0x244, 1, 1, 69], [0x245, 1, 1, 71], [0x246, 5, 2, 1], [0x370, 2, 2, 1],
  [0x376, 1, 1, 1], [0x37f, 1, 1, 116], [0x386, 1, 1, 38], [0x388, 3, 1, 37], [0x38c, 1, 1, 64], [0x38e, 2, 1, 63],
  [0x391, 17, 1, 32], [0x3a3, 9, 1, 32], [0x3cf, 1, 1, 8], [0x3d8, 12, 2, 1], [0x3f4, 1, 1, -60], [0x3f7, 1, 1, 1],
  [0x3f9, 1, 1, -7], [0x3fa, 1, 1, 1], [0x3fd, 3, 1, -130], [0x400, 16, 1, 80], [0x410, 32, 1, 32],
  [0x460, 17, 2, 1], [0x48a, 27, 2, 1], [0x4c0, 1, 1, 15], [0x4c1, 7, 2, 1], [0x4d0, 48, 2, 1], [0x531, 38, 1, 48],
  [0x10a0, 38, 1, 0x1c60], [0x10c7, 1, 1, 0x1c60], [0x10cd, 1, 1, 0x1c60], [0x13a0, 80, 1, 0x97d0],
  [0x13f0, 6, 1, 8], [0x1c90, 43, 1, -0xbc0], [0x1cbd, 3, 1, -0xbc0], [0x1e00, 75, 2, 1], [0x1e9e, 1, 1, -0x1dbf],
  [0x1ea0, 48, 2, 1], [0x1f08, 8, 1, -8], [0x1f18, 6, 1, -8], [0x1f28, 8, 1, -8], [0x1f38, 8, 1, -8],
  [0x1f48, 6, 1, -8], [0x1f59, 4, 2, -8], [0x1f68, 8, 1, -8], [0x1f88, 8, 1, -8], [0x1f98, 8, 1, -8],
  [0x1fa8, 8, 1, -8], [0x1fb8, 2, 1, -8], [0x1fba, 2, 1, -74], [0x1fbc, 1, 1, -9], [0x1fc8, 4, 1, -86],
  [0x1fcc, 1, 1, -9], [0x1fd8, 2, 1, -8], [0x1fda, 2, 1, -100], [0x1fe8, 2, 1, -8], [0x1fea, 2, 1, -112],
  [0x1fec, 1, 1, -7], [0x1ff8, 2, 1, -128], [0x1ffa, 2, 1, -126], [0x1ffc, 1, 1, -9], [0x2126, 1, 1, -0x1d5d],
  [0x212a, 1, 1, -0x20bf], [0x212b, 1, 1, -0x2046], [0x2132, 1, 1, 28], [0x2160, 16, 1, 16], [0x2183, 1, 1, 1],
  [0x24b6, 26, 1, 26], [0x2c00, 48, 1, 48], [0x2c60, 1, 1, 1], [0x2c62, 1, 1, -0x29f7], [0x2c63, 1, 1, -0xee6],
  [0x2c64, 1, 1, -0x29e7], [0x2c67, 3, 2, 1], [0x2c6d, 1, 1, -0x2a1c], [0x2c6e, 1, 1, -0x29fd],
  [0x2c6f, 1, 1, -0x2a1f], [0x2c70, 1, 1, -0x2a1e], [0x2c72, 1, 1, 1], [0x2c75, 1, 1, 1], [0x2c7e, 2, 1, -0x2a3f],
  [0x2c80, 50, 2, 1], [0x2ceb, 2, 2, 1], [0x2cf2, 1, 1, 1], [0xa640, 23, 2, 1], [0xa680, 14, 2, 1],
  [0xa722, 7, 2, 1], [0xa732, 31, 2, 1], [0xa779, 2, 2, 1], [0xa77d, 1, 1, -0x8a04], [0xa77e, 5, 2, 1],
  [0xa78b, 1, 1, 1], [0xa78d, 1, 1, -0xa528], [0xa790, 2, 2, 1], [0xa796, 10, 2, 1], [0xa7aa, 1, 1, -0xa544],
  [0xa7ab, 1, 1, -0xa54f], [0xa7ac, 1, 1, -0xa54b], [0xa7ad, 1, 1, -0xa541], [0xa7ae, 1, 1, -0xa544],
  [0xa7b0, 1, 1, -0xa512], [0xa7b1, 1, 1, -0xa52a], [0xa7b2, 1, 1, -0xa515], [0xa7b3, 1, 1, 0x3a0],
  [0xa7b4, 8, 2, 1], [0xa7c4, 1, 1, -48], [0xa7c5, 1, 1, -0xa543], [0xa7c6, 1, 1, -0x8a38], [0xa7c7, 2, 2, 1],
  [0xa7d0, 1, 1, 1], [0xa7d6, 2, 2, 1], [0xa7f5, 1, 1, 1], [0xff21, 26, 1, 32], [0x10400, 40, 1, 40],
  [0x104b0, 36, 1, 40], [0x10570, 11, 1, 39], [0x1057c, 15, 1, 39], [0x1058c, 7, 1, 39], [0x10594, 2, 1, 39],
  [0x10c80, 51, 1, 64], [0x118a0, 32, 1, 32], [0x16e40, 32, 1, 32], [0x1e900, 34, 1, 34],
]

const LOWER = new Map<number, number>()
for (const [start, count, step, delta] of LOWER_RUNS) for (let i = 0; i < count; i++) LOWER.set(start + i * step, start + i * step + delta)

/** `Character.toLowerCase(int codePoint)` du JDK 21 */
export function javaToLowerCase(cp: number): number {
  return LOWER.get(cp) ?? cp
}

const FLOAT_RE = /^[+-]?(NaN|Infinity|((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)[fFdD]?|(0[xX]([0-9a-fA-F]+\.?[0-9a-fA-F]*|\.[0-9a-fA-F]+)[pP][+-]?\d+[fFdD]?))$/

/** `Float.parseFloat(String)` : lève NumberFormatException si la chaîne n'est pas un flottant Java */
export function javaParseFloat(s: string): number {
  // String.trim() de Java : retire les caractères <= ' '
  let a = 0
  let b = s.length
  while (a < b && s.charCodeAt(a) <= 0x20) a++
  while (b > a && s.charCodeAt(b - 1) <= 0x20) b--
  const t = s.slice(a, b)
  if (!FLOAT_RE.test(t)) throw new NumberFormatException(t.length === 0 ? 'empty String' : `For input string: "${t}"`)
  const sign = t.startsWith('-') ? -1 : 1
  const u = t.replace(/^[+-]/, '')
  if (u === 'NaN') return NaN
  if (u === 'Infinity') return sign * Infinity
  if (/^0[xX]/.test(u)) {
    const m = /^0[xX]([0-9a-fA-F]*)\.?([0-9a-fA-F]*)[pP]([+-]?\d+)/.exec(u)!
    const mant = parseInt((m[1] ?? '') + (m[2] ?? '') || '0', 16)
    return Math.fround(sign * mant * 2 ** (Number(m[3]) - 4 * (m[2] ?? '').length))
  }
  // PORT: arrondi décimal -> double -> float (Java arrondit directement en float ; écart possible au dernier bit sur des cas limites)
  return Math.fround(sign * Number(u.replace(/[fFdD]$/, '')))
}
