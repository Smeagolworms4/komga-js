// Support de portage : org.apache.lucene.analysis.standard.StandardTokenizer (Lucene 9.9.1), porté ligne à ligne.
// Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException } from '../kotlin.js'
import { StringReader, Tokenizer } from './analysis.js'
import { StandardTokenizerImpl } from './StandardTokenizerImpl.js'

/** `StandardAnalyzer.DEFAULT_MAX_TOKEN_LENGTH` */
export const DEFAULT_MAX_TOKEN_LENGTH = 255

export class StandardTokenizer extends Tokenizer {
  /** A private instance of the JFlex-constructed scanner */
  private scanner!: StandardTokenizerImpl

  static readonly ALPHANUM = 0
  static readonly NUM = 1
  static readonly SOUTHEAST_ASIAN = 2
  static readonly IDEOGRAPHIC = 3
  static readonly HIRAGANA = 4
  static readonly KATAKANA = 5
  static readonly HANGUL = 6
  static readonly EMOJI = 7

  /** String token types that correspond to token type int constants */
  static readonly TOKEN_TYPES: readonly string[] = ['<ALPHANUM>', '<NUM>', '<SOUTHEAST_ASIAN>', '<IDEOGRAPHIC>', '<HIRAGANA>', '<KATAKANA>', '<HANGUL>', '<EMOJI>']

  /** Absolute maximum sized token */
  static readonly MAX_TOKEN_LENGTH_LIMIT = 1024 * 1024

  private skippedPositions = 0

  private maxTokenLength = DEFAULT_MAX_TOKEN_LENGTH

  setMaxTokenLength(length: number): void {
    if (length < 1) {
      throw new IllegalArgumentException('maxTokenLength must be greater than zero')
    } else if (length > StandardTokenizer.MAX_TOKEN_LENGTH_LIMIT) {
      throw new IllegalArgumentException(`maxTokenLength may not exceed ${StandardTokenizer.MAX_TOKEN_LENGTH_LIMIT}`)
    }
    if (length !== this.maxTokenLength) {
      this.maxTokenLength = length
      this.scanner.setBufferSize(length)
    }
  }

  getMaxTokenLength(): number {
    return this.maxTokenLength
  }

  constructor() {
    super()
    this.init()
  }

  private init(): void {
    this.scanner = new StandardTokenizerImpl(this.input)
  }

  incrementToken(): boolean {
    this.clearAttributes()
    this.skippedPositions = 0

    while (true) {
      const tokenType = this.scanner.getNextToken()

      if (tokenType === StandardTokenizerImpl.YYEOF) {
        return false
      }

      if (this.scanner.yylength() <= this.maxTokenLength) {
        this.attributes.setPositionIncrement(this.skippedPositions + 1)
        this.scanner.getText(this.attributes.termAtt)
        const start = this.scanner.yychar()
        this.attributes.setOffset(this.correctOffset(start), this.correctOffset(start + this.attributes.termAtt.length()))
        this.attributes.type = StandardTokenizer.TOKEN_TYPES[tokenType] as string
        return true
      }
      // When we skip a too-long term, we still increment the
      // position increment
      else this.skippedPositions++
    }
  }

  end(): void {
    super.end()
    // set final offset
    const finalOffset = this.correctOffset(this.scanner.yychar() + this.scanner.yylength())
    this.attributes.setOffset(finalOffset, finalOffset)
    // adjust any skipped tokens
    this.attributes.setPositionIncrement(this.attributes.positionIncrement + this.skippedPositions)
  }

  close(): void {
    super.close()
    this.scanner.yyreset(this.input)
  }

  reset(): void {
    super.reset()
    this.scanner.yyreset(this.input)
    this.skippedPositions = 0
  }

  setReader(input: StringReader): void {
    super.setReader(input)
  }
}
