// Support de portage : net.greypanther.natsort (natural-comparator 1.1), sans jumeau Kotlin.
// Port ligne à ligne de AbstractSimpleNaturalComparator / SimpleNaturalComparator / CaseInsensitiveSimpleNaturalComparator.
// Les chaînes Java et JS sont toutes deux des suites d'unités UTF-16 : charAt/length sont identiques.
// Vérifié contre la vraie bibliothèque (jshell), voir test/port/natsort.test.ts.

/** `(long) (c - '0')` */
function parse(c1: number): number {
  return c1 - 48
}

/** `'0' <= c & c <= '9'` */
function isDigit(c: number): boolean {
  return 48 <= c && c <= 57
}

const TWO_64 = 1n << 64n

/**
 * Nombre accumulé comme un `long` Java (`num * 10 + digit`, débordement modulo 2^64) puis comparé non signé
 * (`compareUnsigned`) : représenté par un `number` tant qu'il est exact, puis par un `bigint` modulo 2^64.
 */
type Num = number | bigint

function accumulate(num: Num, digit: number): Num {
  if (typeof num === 'number') {
    const n = num * 10 + digit
    if (Number.isSafeInteger(n)) return n
    return (BigInt(num) * 10n + BigInt(digit)) % TWO_64
  }
  return (num * 10n + BigInt(digit)) % TWO_64
}

function compareUnsigned(num1: Num, num2: Num): number {
  if (typeof num1 === 'number' && typeof num2 === 'number') return num1 < num2 ? -1 : num1 === num2 ? 0 : 1
  const a = BigInt(num1)
  const b = BigInt(num2)
  return a < b ? -1 : a === b ? 0 : 1
}

abstract class AbstractSimpleNaturalComparator {
  compare(sequence1: string, sequence2: string): number {
    const len1 = sequence1.length
    const len2 = sequence2.length
    let idx1 = 0
    let idx2 = 0

    while (idx1 < len1 && idx2 < len2) {
      const c1 = sequence1.charCodeAt(idx1++)
      const c2 = sequence2.charCodeAt(idx2++)

      const isDigit1 = isDigit(c1)
      const isDigit2 = isDigit(c2)

      if (isDigit1 && !isDigit2) {
        return -1
      } else if (!isDigit1 && isDigit2) {
        return 1
      } else if (!isDigit1 && !isDigit2) {
        const c = this.compareChars(c1, c2)
        if (c !== 0) {
          return c
        }
      } else {
        let num1: Num = parse(c1)
        while (idx1 < len1) {
          const digit = sequence1.charCodeAt(idx1++)
          if (isDigit(digit)) {
            num1 = accumulate(num1, parse(digit))
          } else {
            idx1--
            break
          }
        }

        let num2: Num = parse(c2)
        while (idx2 < len2) {
          const digit = sequence2.charCodeAt(idx2++)
          if (isDigit(digit)) {
            num2 = accumulate(num2, parse(digit))
          } else {
            idx2--
            break
          }
        }

        if (compareUnsigned(num1, num2) !== 0) {
          return compareUnsigned(num1, num2)
        }
      }
    }

    if (idx1 < len1) {
      return 1
    } else if (idx2 < len2) {
      return -1
    } else {
      return 0
    }
  }

  abstract compareChars(c1: number, c2: number): number
}

export class SimpleNaturalComparator extends AbstractSimpleNaturalComparator {
  private static readonly INSTANCE = new SimpleNaturalComparator()

  compareChars(c1: number, c2: number): number {
    return c1 - c2
  }

  static getInstance(): (a: string, b: string) => number {
    const i = SimpleNaturalComparator.INSTANCE
    return (a, b) => i.compare(a, b)
  }
}

/**
 * `Character.toLowerCase(char)` : correspondance simple (UnicodeData) d'une unité UTF-16.
 * `String.prototype.toLowerCase` applique les correspondances complètes (SpecialCasing) : seule U+0130 diffère
 * dans le BMP (`İ` -> `i̇` en JS, `i` en Java). Les demi-surrogates sont inchangés dans les deux cas.
 */
export function javaCharToLowerCase(c: number): number {
  if (c < 0x80) return c >= 65 && c <= 90 ? c + 32 : c
  if (c === 0x130) return 0x69
  if (c >= 0xd800 && c <= 0xdfff) return c
  const l = String.fromCharCode(c).toLowerCase()
  return l.length === 1 ? l.charCodeAt(0) : c
}

export class CaseInsensitiveSimpleNaturalComparator extends AbstractSimpleNaturalComparator {
  private static readonly INSTANCE = new CaseInsensitiveSimpleNaturalComparator()

  compareChars(c1: number, c2: number): number {
    return javaCharToLowerCase(c1) - javaCharToLowerCase(c2)
  }

  static getInstance(): (a: string, b: string) => number {
    const i = CaseInsensitiveSimpleNaturalComparator.INSTANCE
    return (a, b) => i.compare(a, b)
  }
}
