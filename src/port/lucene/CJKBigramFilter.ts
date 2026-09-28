// Support de portage : org.apache.lucene.analysis.cjk.CJKBigramFilter (Lucene 9.9.1), porté ligne à ligne.
// Ce fichier n'a pas de jumeau Kotlin.
import { charCount, codePointAt, type State, TokenFilter, type TokenStream, toChars } from './analysis.js'
import { StandardTokenizer } from './StandardTokenizer.js'

// the types from standardtokenizer
const HAN_TYPE = StandardTokenizer.TOKEN_TYPES[StandardTokenizer.IDEOGRAPHIC] as string
const HIRAGANA_TYPE = StandardTokenizer.TOKEN_TYPES[StandardTokenizer.HIRAGANA] as string
const KATAKANA_TYPE = StandardTokenizer.TOKEN_TYPES[StandardTokenizer.KATAKANA] as string
const HANGUL_TYPE = StandardTokenizer.TOKEN_TYPES[StandardTokenizer.HANGUL] as string

// sentinel value for ignoring a script
const NO = {}

function grow(a: Int32Array<ArrayBuffer>, minSize: number): Int32Array<ArrayBuffer> {
  if (a.length >= minSize) return a
  const b = new Int32Array(Math.max(minSize, a.length + (a.length >> 3) + 3))
  b.set(a)
  return b
}

/**
 * Forms bigrams of CJK terms that are generated from StandardTokenizer or ICUTokenizer.
 *
 * CJK types are set by these tokenizers, but you can also use {@link #CJKBigramFilter(TokenStream,
 * int)} to explicitly control which of the CJK scripts are turned into bigrams.
 *
 * By default, when a CJK character has no adjacent characters to form a bigram, it is output in
 * unigram form. If you want to always output both unigrams and bigrams, set the <code>
 * outputUnigrams</code> flag in {@link CJKBigramFilter#CJKBigramFilter(TokenStream, int, boolean)}.
 * This can be used for a combined unigram+bigram approach.
 *
 * Unlike ICUTokenizer, StandardTokenizer does not split at script boundaries. Korean Hangul
 * characters are treated the same as many other scripts' letters, and as a result,
 * StandardTokenizer can produce tokens that mix Hangul and non-Hangul characters, e.g. "한국abc".
 * Such mixed-script tokens are typed as <code>&lt;ALPHANUM&gt;</code> rather than <code>
 * &lt;HANGUL&gt;</code>, and as a result, will not be converted to bigrams by CJKBigramFilter.
 *
 * In all cases, all non-CJK input is passed thru unmodified.
 */
export class CJKBigramFilter extends TokenFilter {
  // configuration
  /** bigram flag for Han Ideographs */
  static readonly HAN = 1
  /** bigram flag for Hiragana */
  static readonly HIRAGANA = 2
  /** bigram flag for Katakana */
  static readonly KATAKANA = 4
  /** bigram flag for Hangul */
  static readonly HANGUL = 8

  /** when we emit a bigram, it's then marked as this type */
  static readonly DOUBLE_TYPE = '<DOUBLE>'
  /** when we emit a unigram, it's then marked as this type */
  static readonly SINGLE_TYPE = '<SINGLE>'

  // these are set to either their type or NO if we want to pass them thru
  private readonly doHan: unknown
  private readonly doHiragana: unknown
  private readonly doKatakana: unknown
  private readonly doHangul: unknown

  // true if we should output unigram tokens always
  private readonly outputUnigrams: boolean
  private ngramState = false // false = output unigram, true = output bigram

  // buffers containing codepoint and offsets in parallel
  buffer = new Int32Array(8)
  startOffset = new Int32Array(8)
  endOffset = new Int32Array(8)
  // length of valid buffer
  bufferLen = 0
  // current buffer index
  index = 0

  // the last end offset, to determine if we should bigram across tokens
  lastEndOffset = 0

  private exhausted = false

  private loneState: State | null = null // rarely used: only for "lone cjk characters", where we emit unigrams

  // PORT: surcharges CJKBigramFilter(in), (in, flags), (in, flags, outputUnigrams) -> paramètres par défaut
  constructor(input: TokenStream, flags: number = CJKBigramFilter.HAN | CJKBigramFilter.HIRAGANA | CJKBigramFilter.KATAKANA | CJKBigramFilter.HANGUL, outputUnigrams = false) {
    super(input)
    this.doHan = (flags & CJKBigramFilter.HAN) === 0 ? NO : HAN_TYPE
    this.doHiragana = (flags & CJKBigramFilter.HIRAGANA) === 0 ? NO : HIRAGANA_TYPE
    this.doKatakana = (flags & CJKBigramFilter.KATAKANA) === 0 ? NO : KATAKANA_TYPE
    this.doHangul = (flags & CJKBigramFilter.HANGUL) === 0 ? NO : HANGUL_TYPE
    this.outputUnigrams = outputUnigrams
  }

  /*
   * much of this complexity revolves around handling the special case of a
   * "lone cjk character" where cjktokenizer would output a unigram. this
   * is also the only time we ever have to captureState.
   */
  incrementToken(): boolean {
    while (true) {
      if (this.hasBufferedBigram()) {
        // case 1: we have multiple remaining codepoints buffered,
        // so we can emit a bigram here.

        if (this.outputUnigrams) {
          // when also outputting unigrams, we output the unigram first,
          // then rewind back to revisit the bigram.
          // so an input of ABC is A + (rewind)AB + B + (rewind)BC + C
          // the logic in hasBufferedUnigram ensures we output the C,
          // even though it did actually have adjacent CJK characters.

          if (this.ngramState) {
            this.flushBigram()
          } else {
            this.flushUnigram()
            this.index--
          }
          this.ngramState = !this.ngramState
        } else {
          this.flushBigram()
        }
        return true
      } else if (this.doNext()) {
        // case 2: look at the token type. should we form any n-grams?

        const type = this.attributes.type
        if (type === this.doHan || type === this.doHiragana || type === this.doKatakana || type === this.doHangul) {
          // acceptable CJK type: we form n-grams from these.
          // as long as the offsets are aligned, we just add these to our current buffer.
          // otherwise, we clear the buffer and start over.

          if (this.attributes.startOffset !== this.lastEndOffset) {
            // unaligned, clear queue
            if (this.hasBufferedUnigram()) {
              // we have a buffered unigram, and we peeked ahead to see if we could form
              // a bigram, but we can't, because the offsets are unaligned. capture the state
              // of this peeked data to be revisited next time thru the loop, and dump our unigram.

              this.loneState = this.captureState()
              this.flushUnigram()
              return true
            }
            this.index = 0
            this.bufferLen = 0
          }
          this.refill()
        } else {
          // not a CJK type: we just return these as-is.

          if (this.hasBufferedUnigram()) {
            // we have a buffered unigram, and we peeked ahead to see if we could form
            // a bigram, but we can't, because it's not a CJK type. capture the state
            // of this peeked data to be revisited next time thru the loop, and dump our unigram.

            this.loneState = this.captureState()
            this.flushUnigram()
            return true
          }
          return true
        }
      } else {
        // case 3: we have only zero or 1 codepoints buffered,
        // so not enough to form a bigram. But, we also have no
        // more input. So if we have a buffered codepoint, emit
        // a unigram, otherwise, it's end of stream.

        if (this.hasBufferedUnigram()) {
          this.flushUnigram() // flush our remaining unigram
          return true
        }
        return false
      }
    }
  }

  /** looks at next input token, returning false is none is available */
  private doNext(): boolean {
    if (this.loneState !== null) {
      this.restoreState(this.loneState)
      this.loneState = null
      return true
    } else {
      if (this.exhausted) {
        return false
      } else if (this.input.incrementToken()) {
        return true
      } else {
        this.exhausted = true
        return false
      }
    }
  }

  /** refills buffers with new data from the current token. */
  private refill(): void {
    // compact buffers to keep them smallish if they become large
    // just a safety check, but technically we only need the last codepoint
    if (this.bufferLen > 64) {
      const last = this.bufferLen - 1
      this.buffer[0] = this.buffer[last] as number
      this.startOffset[0] = this.startOffset[last] as number
      this.endOffset[0] = this.endOffset[last] as number
      this.bufferLen = 1
      this.index -= last
    }

    const termBuffer = this.attributes.termAtt.buffer()
    const len = this.attributes.termAtt.length()
    let start = this.attributes.startOffset
    const end = this.attributes.endOffset

    const newSize = this.bufferLen + len
    this.buffer = grow(this.buffer, newSize)
    this.startOffset = grow(this.startOffset, newSize)
    this.endOffset = grow(this.endOffset, newSize)
    this.lastEndOffset = end

    if (end - start !== len) {
      // crazy offsets (modified by synonym or charfilter): just preserve
      for (let i = 0, cp = 0; i < len; i += charCount(cp)) {
        cp = this.buffer[this.bufferLen] = codePointAt(termBuffer, i, len)
        this.startOffset[this.bufferLen] = start
        this.endOffset[this.bufferLen] = end
        this.bufferLen++
      }
    } else {
      // normal offsets
      for (let i = 0, cp = 0, cpLen = 0; i < len; i += cpLen) {
        cp = this.buffer[this.bufferLen] = codePointAt(termBuffer, i, len)
        cpLen = charCount(cp)
        this.startOffset[this.bufferLen] = start
        start = this.endOffset[this.bufferLen] = start + cpLen
        this.bufferLen++
      }
    }
  }

  /**
   * Flushes a bigram token to output from our buffer This is the normal case, e.g. ABC -&gt; AB BC
   */
  private flushBigram(): void {
    this.clearAttributes()
    const termAtt = this.attributes.termAtt
    const termBuffer = termAtt.resizeBuffer(4) // maximum bigram length in code units (2 supplementaries)
    const len1 = toChars(this.buffer[this.index] as number, termBuffer, 0)
    const len2 = len1 + toChars(this.buffer[this.index + 1] as number, termBuffer, len1)
    termAtt.setLength(len2)
    this.attributes.setOffset(this.startOffset[this.index] as number, this.endOffset[this.index + 1] as number)
    this.attributes.type = CJKBigramFilter.DOUBLE_TYPE
    // when outputting unigrams, all bigrams are synonyms that span two unigrams
    if (this.outputUnigrams) {
      this.attributes.setPositionIncrement(0)
      this.attributes.positionLength = 2
    }
    this.index++
  }

  /**
   * Flushes a unigram token to output from our buffer. This happens when we encounter isolated CJK
   * characters, either the whole CJK string is a single character, or we encounter a CJK character
   * surrounded by space, punctuation, english, etc, but not beside any other CJK.
   */
  private flushUnigram(): void {
    this.clearAttributes()
    const termAtt = this.attributes.termAtt
    const termBuffer = termAtt.resizeBuffer(2) // maximum unigram length (2 surrogates)
    const len = toChars(this.buffer[this.index] as number, termBuffer, 0)
    termAtt.setLength(len)
    this.attributes.setOffset(this.startOffset[this.index] as number, this.endOffset[this.index] as number)
    this.attributes.type = CJKBigramFilter.SINGLE_TYPE
    this.index++
  }

  /** True if we have multiple codepoints sitting in our buffer */
  private hasBufferedBigram(): boolean {
    return this.bufferLen - this.index > 1
  }

  /**
   * True if we have a single codepoint sitting in our buffer, where its future (whether it is
   * emitted as unigram or forms a bigram) depends upon not-yet-seen inputs.
   */
  private hasBufferedUnigram(): boolean {
    if (this.outputUnigrams) {
      // when outputting unigrams always
      return this.bufferLen - this.index === 1
    } else {
      // otherwise it's only when we have a lone CJK character
      return this.bufferLen === 1 && this.index === 0
    }
  }

  reset(): void {
    super.reset()
    this.bufferLen = 0
    this.index = 0
    this.lastEndOffset = 0
    this.loneState = null
    this.exhausted = false
    this.ngramState = false
  }
}
