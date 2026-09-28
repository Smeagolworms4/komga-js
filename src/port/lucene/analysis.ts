// Support de portage : sous-ensemble de l'API d'analyse d'Apache Lucene 9.9.1 utilisé par Komga
// (org.apache.lucene.analysis.{Analyzer, TokenStream, Tokenizer, TokenFilter, LowerCaseFilter, CharacterUtils},
// org.apache.lucene.analysis.tokenattributes.*, org.apache.lucene.util.AttributeSource).
// Les classes reprennent le code Java de Lucene ; les attributs sont regroupés dans un seul objet partagé par la
// chaîne (AttributeSource), avec captureState/restoreState/clearAttributes/endAttributes comme en Java.
// Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException, IllegalStateException } from '../kotlin.js'
import { javaToLowerCase } from './JavaCharacter.js'

// ---------------------------------------------------------------------------
// Caractères UTF-16 (java.lang.Character sur char[])
// ---------------------------------------------------------------------------

export function isHighSurrogate(c: number): boolean {
  return c >= 0xd800 && c <= 0xdbff
}

export function isLowSurrogate(c: number): boolean {
  return c >= 0xdc00 && c <= 0xdfff
}

/** `Character.codePointAt(char[] a, int index, int limit)` */
export function codePointAt(a: ArrayLike<number>, index: number, limit: number): number {
  const c1 = a[index] as number
  if (isHighSurrogate(c1) && index + 1 < limit) {
    const c2 = a[index + 1] as number
    if (isLowSurrogate(c2)) return ((c1 - 0xd800) << 10) + (c2 - 0xdc00) + 0x10000
  }
  return c1
}

/** `Character.charCount(int codePoint)` */
export function charCount(cp: number): number {
  return cp >= 0x10000 ? 2 : 1
}

/** `Character.toChars(int codePoint, char[] dst, int dstIndex)` */
export function toChars(cp: number, dst: Uint16Array, dstIndex: number): number {
  if (cp >= 0x10000) {
    const v = cp - 0x10000
    dst[dstIndex] = 0xd800 + (v >> 10)
    dst[dstIndex + 1] = 0xdc00 + (v & 0x3ff)
    return 2
  }
  dst[dstIndex] = cp
  return 1
}

/** `Character.codePointCount(CharSequence, int, int)` */
export function codePointCount(a: ArrayLike<number>, begin: number, end: number): number {
  let n = end - begin
  for (let i = begin; i < end; ) {
    if (isHighSurrogate(a[i++] as number) && i < end && isLowSurrogate(a[i] as number)) {
      n--
      i++
    }
  }
  return n
}

/** `Character.offsetByCodePoints(char[] a, int start, int count, int index, int codePointOffset)` (décalage positif) */
export function offsetByCodePoints(a: ArrayLike<number>, start: number, count: number, index: number, codePointOffset: number): number {
  let x = index
  const limit = start + count
  for (let i = 0; i < codePointOffset; i++) {
    if (x >= limit) throw new IndexOutOfBoundsExceptionJ()
    if (isHighSurrogate(a[x++] as number) && x < limit && isLowSurrogate(a[x] as number)) x++
  }
  return x
}

class IndexOutOfBoundsExceptionJ extends IllegalArgumentException {}

/** Chaîne JS d'un tampon UTF-16 */
export function charsToString(a: ArrayLike<number>, offset: number, length: number): string {
  let s = ''
  for (let i = offset; i < offset + length; i += 4096)
    s += String.fromCharCode(...Array.prototype.slice.call(a, i, Math.min(offset + length, i + 4096)))
  return s
}

/** Terme d'index (BytesRef UTF-8) : les demi-codets isolés deviennent U+FFFD comme dans UnicodeUtil.UTF16toUTF8 */
export function toTermText(s: string): string {
  // String.prototype.toWellFormed (ES2024)
  return (s as unknown as { toWellFormed(): string }).toWellFormed()
}

/** Comparaison de termes dans l'ordre des octets UTF-8 (= ordre des points de code) */
export function compareTerms(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const ca = a.charCodeAt(i)
    const cb = b.charCodeAt(i)
    if (ca !== cb) {
      // un demi-codet (supplémentaire) est supérieur à tout caractère du BMP en UTF-8
      const sa = ca >= 0xd800 && ca <= 0xdfff
      const sb = cb >= 0xd800 && cb <= 0xdfff
      if (sa !== sb) return sa ? 1 : -1
      return ca - cb
    }
  }
  return a.length - b.length
}

// ---------------------------------------------------------------------------
// Attributs
// ---------------------------------------------------------------------------

/** `CharTermAttributeImpl` */
export class CharTermAttribute {
  private termBuffer: Uint16Array = new Uint16Array(10)
  private termLength = 0

  buffer(): Uint16Array {
    return this.termBuffer
  }

  length(): number {
    return this.termLength
  }

  resizeBuffer(newSize: number): Uint16Array {
    if (this.termBuffer.length < newSize) {
      const b = new Uint16Array(Math.max(newSize, this.termBuffer.length * 2))
      b.set(this.termBuffer)
      this.termBuffer = b
    }
    return this.termBuffer
  }

  copyBuffer(buffer: ArrayLike<number>, offset: number, length: number): void {
    this.growTermBuffer(length)
    for (let i = 0; i < length; i++) this.termBuffer[i] = buffer[offset + i] as number
    this.termLength = length
  }

  private growTermBuffer(newSize: number): void {
    if (this.termBuffer.length < newSize) this.termBuffer = new Uint16Array(Math.max(newSize, this.termBuffer.length * 2))
  }

  setLength(length: number): this {
    if (length < 0 || length > this.termBuffer.length) throw new IllegalArgumentException(`length ${length} exceeds the size of the termBuffer (${this.termBuffer.length})`)
    this.termLength = length
    return this
  }

  setEmpty(): this {
    this.termLength = 0
    return this
  }

  append(s: string): this {
    this.resizeBuffer(this.termLength + s.length)
    for (let i = 0; i < s.length; i++) this.termBuffer[this.termLength++] = s.charCodeAt(i)
    return this
  }

  toString(): string {
    return charsToString(this.termBuffer, 0, this.termLength)
  }
}

export type State = {
  term: Uint16Array
  startOffset: number
  endOffset: number
  positionIncrement: number
  positionLength: number
  type: string
  termFrequency: number
}

export const DEFAULT_TYPE = 'word'

/** `AttributeSource` : l'ensemble des attributs utilisés par les filtres de Komga */
export class AttributeSource {
  readonly termAtt = new CharTermAttribute()
  startOffset = 0
  endOffset = 0
  positionIncrement = 1
  positionLength = 1
  type = DEFAULT_TYPE
  termFrequency = 1

  setOffset(startOffset: number, endOffset: number): void {
    if (startOffset < 0 || endOffset < startOffset)
      throw new IllegalArgumentException(`startOffset must be non-negative, and endOffset must be >= startOffset; got startOffset=${startOffset},endOffset=${endOffset}`)
    this.startOffset = startOffset
    this.endOffset = endOffset
  }

  setPositionIncrement(positionIncrement: number): void {
    if (positionIncrement < 0) throw new IllegalArgumentException(`Position increment must be zero or greater; got ${positionIncrement}`)
    this.positionIncrement = positionIncrement
  }

  clearAttributes(): void {
    this.termAtt.setEmpty()
    this.startOffset = 0
    this.endOffset = 0
    this.positionIncrement = 1
    this.positionLength = 1
    this.type = DEFAULT_TYPE
    this.termFrequency = 1
  }

  /** `endAttributes()` : AttributeImpl.end() (PositionIncrementAttributeImpl.end() met l'incrément à 0) */
  endAttributes(): void {
    this.clearAttributes()
    this.positionIncrement = 0
  }

  captureState(): State {
    return {
      term: this.termAtt.buffer().slice(0, this.termAtt.length()),
      startOffset: this.startOffset,
      endOffset: this.endOffset,
      positionIncrement: this.positionIncrement,
      positionLength: this.positionLength,
      type: this.type,
      termFrequency: this.termFrequency,
    }
  }

  restoreState(state: State): void {
    this.termAtt.copyBuffer(state.term, 0, state.term.length)
    this.startOffset = state.startOffset
    this.endOffset = state.endOffset
    this.positionIncrement = state.positionIncrement
    this.positionLength = state.positionLength
    this.type = state.type
    this.termFrequency = state.termFrequency
  }
}

// ---------------------------------------------------------------------------
// TokenStream
// ---------------------------------------------------------------------------

export abstract class TokenStream {
  protected constructor(readonly attributes: AttributeSource) {}

  abstract incrementToken(): boolean

  end(): void {
    this.attributes.endAttributes()
  }

  reset(): void {}

  close(): void {}

  protected clearAttributes(): void {
    this.attributes.clearAttributes()
  }

  protected captureState(): State {
    return this.attributes.captureState()
  }

  protected restoreState(state: State): void {
    this.attributes.restoreState(state)
  }

  /** `reflectWith` limité à l'attribut "term" (Utils.getTokens des tests Komga) */
  reflectWith(reflector: (attClass: string, key: string, value: unknown) => void): void {
    reflector('CharTermAttribute', 'term', this.attributes.termAtt.toString())
  }
}

export abstract class TokenFilter extends TokenStream {
  protected constructor(protected readonly input: TokenStream) {
    super(input.attributes)
  }

  end(): void {
    this.input.end()
  }

  close(): void {
    this.input.close()
  }

  reset(): void {
    this.input.reset()
  }
}

/** `java.io.Reader` minimal (ReusableStringReader) */
export class StringReader {
  private pos = 0
  private left: number

  constructor(private readonly s: string) {
    this.left = s.length
  }

  /** `read(char[] cbuf, int off, int len)` */
  readInto(cbuf: Uint16Array, off: number, len: number): number {
    if (this.left > 0) {
      const size = Math.min(this.left, len)
      for (let i = 0; i < size; i++) cbuf[off + i] = this.s.charCodeAt(this.pos + i)
      this.pos += size
      this.left -= size
      return size
    } else return -1
  }

  /** `read()` */
  read(): number {
    if (this.left > 0) {
      --this.left
      return this.s.charCodeAt(this.pos++)
    } else return -1
  }

  close(): void {}
}

const ILLEGAL_STATE_READER = new StringReader('')

export abstract class Tokenizer extends TokenStream {
  protected input: StringReader = ILLEGAL_STATE_READER
  private inputPending: StringReader = ILLEGAL_STATE_READER

  protected constructor() {
    super(new AttributeSource())
  }

  close(): void {
    this.input.close()
    this.inputPending = ILLEGAL_STATE_READER
    this.input = ILLEGAL_STATE_READER
  }

  protected correctOffset(currentOff: number): number {
    return currentOff
  }

  setReader(input: StringReader): void {
    if (input === null) throw new IllegalArgumentException('input must not be null')
    this.inputPending = input
  }

  reset(): void {
    super.reset()
    this.input = this.inputPending
    this.inputPending = ILLEGAL_STATE_READER
  }
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export class TokenStreamComponents {
  constructor(
    readonly source: Tokenizer,
    readonly sink: TokenStream,
  ) {}

  setReader(reader: StringReader): void {
    this.source.setReader(reader)
  }

  getTokenStream(): TokenStream {
    return this.sink
  }
}

/** TokenStream à un seul jeton (Analyzer.StringTokenStream), utilisé par `normalize` */
class StringTokenStream extends TokenStream {
  private used = true

  constructor(
    private readonly value: string,
    private readonly length: number,
  ) {
    super(new AttributeSource())
  }

  reset(): void {
    this.used = false
  }

  incrementToken(): boolean {
    if (this.used) return false
    this.clearAttributes()
    this.attributes.termAtt.append(this.value)
    this.attributes.setOffset(0, this.length)
    this.used = true
    return true
  }

  end(): void {
    super.end()
    this.attributes.setOffset(this.length, this.length)
  }
}

export abstract class Analyzer {
  // PORT: Lucene réutilise les composants par thread (ReuseStrategy) ; ici une chaîne neuve par appel (sans état partagé)
  protected abstract createComponents(fieldName: string): TokenStreamComponents

  protected normalize(_fieldName: string | null, input: TokenStream): TokenStream {
    return input
  }

  tokenStream(fieldName: string, text: string): TokenStream {
    const components = this.createComponents(fieldName)
    components.setReader(new StringReader(text))
    return components.getTokenStream()
  }

  /** `normalize(String fieldName, String text)` : renvoie le terme (BytesRef) sous forme de chaîne */
  normalizeText(fieldName: string, text: string): string {
    const ts = this.normalize(fieldName, new StringTokenStream(text, text.length))
    try {
      ts.reset()
      if (ts.incrementToken() === false)
        throw new IllegalStateException(`The normalization token stream is expected to produce exactly 1 token, but got 0 for analyzer ${this} and input "${text}"`)
      const term = toTermText(ts.attributes.termAtt.toString())
      if (ts.incrementToken())
        throw new IllegalStateException(`The normalization token stream is expected to produce exactly 1 token, but got 2+ for analyzer ${this} and input "${text}"`)
      ts.end()
      return term
    } finally {
      ts.close()
    }
  }

  getPositionIncrementGap(_fieldName: string): number {
    return 0
  }

  getOffsetGap(_fieldName: string): number {
    return 1
  }
}

// ---------------------------------------------------------------------------
// LowerCaseFilter (CharacterUtils.toLowerCase)
// ---------------------------------------------------------------------------

export function toLowerCaseBuffer(buffer: Uint16Array, offset: number, limit: number): void {
  for (let i = offset; i < limit; ) {
    i += toChars(javaToLowerCase(codePointAt(buffer, i, limit)), buffer, i)
  }
}

export class LowerCaseFilter extends TokenFilter {
  constructor(input: TokenStream) {
    super(input)
  }

  incrementToken(): boolean {
    if (this.input.incrementToken()) {
      const termAtt = this.attributes.termAtt
      toLowerCaseBuffer(termAtt.buffer(), 0, termAtt.length())
      return true
    } else {
      return false
    }
  }
}
