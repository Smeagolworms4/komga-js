// Support de portage : org.apache.lucene.analysis.cjk.CJKWidthFilter (Lucene 9.9.1), porté ligne à ligne.
// Ce fichier n'a pas de jumeau Kotlin.
import { TokenFilter, type TokenStream } from './analysis.js'

/* halfwidth kana mappings: 0xFF65-0xFF9D
 *
 * note: 0xFF9C and 0xFF9D are only mapped to 0x3099 and 0x309A
 * as a fallback when they cannot properly combine with a preceding
 * character into a composed form.
 */
// prettier-ignore
const KANA_NORM = new Uint16Array([
  0x30fb, 0x30f2, 0x30a1, 0x30a3, 0x30a5, 0x30a7, 0x30a9, 0x30e3, 0x30e5,
  0x30e7, 0x30c3, 0x30fc, 0x30a2, 0x30a4, 0x30a6, 0x30a8, 0x30aa, 0x30ab,
  0x30ad, 0x30af, 0x30b1, 0x30b3, 0x30b5, 0x30b7, 0x30b9, 0x30bb, 0x30bd,
  0x30bf, 0x30c1, 0x30c4, 0x30c6, 0x30c8, 0x30ca, 0x30cb, 0x30cc, 0x30cd,
  0x30ce, 0x30cf, 0x30d2, 0x30d5, 0x30d8, 0x30db, 0x30de, 0x30df, 0x30e0,
  0x30e1, 0x30e2, 0x30e4, 0x30e6, 0x30e8, 0x30e9, 0x30ea, 0x30eb, 0x30ec,
  0x30ed, 0x30ef, 0x30f3, 0x3099, 0x309A,
])

/* kana combining diffs: 0x30A6-0x30FD */
// prettier-ignore
const KANA_COMBINE_VOICED = new Int8Array([
  78, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0,
  1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 8, 8, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
])

// prettier-ignore
const KANA_COMBINE_HALF_VOICED = new Int8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 2,
  0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
])

/** `StemmerUtil.delete(char[] s, int pos, int len)` */
function stemmerDelete(s: Uint16Array, pos: number, len: number): number {
  if (pos < len - 1) {
    // don't arraycopy if asked to delete last character
    s.copyWithin(pos, pos + 1, len)
  }
  return len - 1
}

/**
 * A TokenFilter that normalizes CJK width differences:
 * - Folds fullwidth ASCII variants into the equivalent basic latin
 * - Folds halfwidth Katakana variants into the equivalent kana
 */
export class CJKWidthFilter extends TokenFilter {
  constructor(input: TokenStream) {
    super(input)
  }

  incrementToken(): boolean {
    if (this.input.incrementToken()) {
      const termAtt = this.attributes.termAtt
      const text = termAtt.buffer()
      let length = termAtt.length()
      for (let i = 0; i < length; i++) {
        const ch = text[i] as number
        if (ch >= 0xff01 && ch <= 0xff5e) {
          // Fullwidth ASCII variants
          text[i] = (text[i] as number) - 0xfee0
        } else if (ch >= 0xff65 && ch <= 0xff9f) {
          // Halfwidth Katakana variants
          if ((ch === 0xff9e || ch === 0xff9f) && i > 0 && CJKWidthFilter.combine(text, i, ch)) {
            length = stemmerDelete(text, i--, length)
          } else {
            text[i] = KANA_NORM[ch - 0xff65] as number
          }
        }
      }
      termAtt.setLength(length)
      return true
    } else {
      return false
    }
  }

  /** returns true if we successfully combined the voice mark */
  private static combine(text: Uint16Array, pos: number, ch: number): boolean {
    const prev = text[pos - 1] as number
    if (prev >= 0x30a6 && prev <= 0x30fd) {
      text[pos - 1] = (text[pos - 1] as number) + (ch === 0xff9f ? (KANA_COMBINE_HALF_VOICED[prev - 0x30a6] as number) : (KANA_COMBINE_VOICED[prev - 0x30a6] as number))
      return text[pos - 1] !== prev
    }
    return false
  }
}
