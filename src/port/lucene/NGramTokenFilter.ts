// Support de portage : org.apache.lucene.analysis.ngram.NGramTokenFilter (Lucene 9.9.1), porté ligne à ligne.
// Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException } from '../kotlin.js'
import { codePointCount, offsetByCodePoints, type State, TokenFilter, type TokenStream } from './analysis.js'

/**
 * Tokenizes the input into n-grams of the given size(s). As of Lucene 4.4, this token filter:
 * handles supplementary characters correctly, emits all n-grams for the same token at the same
 * position, does not modify offsets, sorts n-grams by their offset in the original token first,
 * then increasing length.
 */
export class NGramTokenFilter extends TokenFilter {
  static readonly DEFAULT_PRESERVE_ORIGINAL = false

  private readonly minGram: number
  private readonly maxGram: number
  private readonly preserveOriginal: boolean

  private curTermBuffer: Uint16Array | null = null
  private curTermLength = 0
  private curTermCodePointCount = 0
  private curGramSize = 0
  private curPos = 0
  private curPosIncr = 0
  private state: State | null = null

  constructor(input: TokenStream, minGram: number, maxGram: number, preserveOriginal: boolean) {
    super(input)
    if (minGram < 1) {
      throw new IllegalArgumentException('minGram must be greater than zero')
    }
    if (minGram > maxGram) {
      throw new IllegalArgumentException('minGram must not be greater than maxGram')
    }
    this.minGram = minGram
    this.maxGram = maxGram
    this.preserveOriginal = preserveOriginal
  }

  incrementToken(): boolean {
    const termAtt = this.attributes.termAtt
    while (true) {
      if (this.curTermBuffer === null) {
        if (!this.input.incrementToken()) {
          return false
        }
        this.state = this.captureState()

        this.curTermLength = termAtt.length()
        this.curTermCodePointCount = codePointCount(termAtt.buffer(), 0, termAtt.length())
        this.curPosIncr += this.attributes.positionIncrement
        this.curPos = 0

        if (this.preserveOriginal && this.curTermCodePointCount < this.minGram) {
          // Token is shorter than minGram, but we'd still like to keep it.
          this.attributes.setPositionIncrement(this.curPosIncr)
          this.curPosIncr = 0
          return true
        }

        this.curTermBuffer = termAtt.buffer().slice()
        this.curGramSize = this.minGram
      }

      if (this.curGramSize > this.maxGram || this.curPos + this.curGramSize > this.curTermCodePointCount) {
        ++this.curPos
        this.curGramSize = this.minGram
      }
      if (this.curPos + this.curGramSize <= this.curTermCodePointCount) {
        this.restoreState(this.state as State)
        const start = offsetByCodePoints(this.curTermBuffer, 0, this.curTermLength, 0, this.curPos)
        const end = offsetByCodePoints(this.curTermBuffer, 0, this.curTermLength, start, this.curGramSize)
        termAtt.copyBuffer(this.curTermBuffer, start, end - start)
        this.attributes.setPositionIncrement(this.curPosIncr)
        this.curPosIncr = 0
        this.curGramSize++
        return true
      } else if (this.preserveOriginal && this.curTermCodePointCount > this.maxGram) {
        // Token is longer than maxGram, but we'd still like to keep it.
        this.restoreState(this.state as State)
        this.attributes.setPositionIncrement(0)
        termAtt.copyBuffer(this.curTermBuffer, 0, this.curTermLength)
        this.curTermBuffer = null
        return true
      }

      this.curTermBuffer = null
    }
  }

  reset(): void {
    super.reset()
    this.curTermBuffer = null
    this.curPosIncr = 0
  }

  end(): void {
    super.end()
    this.attributes.setPositionIncrement(this.curPosIncr)
  }
}
