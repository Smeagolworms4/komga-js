// Support de portage : sous-ensemble de jsoup 1.23.1 utilisé par EpubMetadataProvider. Ce fichier n'a pas de jumeau Kotlin.
// PORT: port/jsoup.ts (écrit en parallèle, analyse XML par htmlparser2 / HTML par parse5) couvre d'autres usages ;
// ce fichier porte à plat l'analyseur de jsoup lui-même, pour un comportement identique sur les entrées mal formées :
//  - parser.{CharacterReader (tampon de 2048 caractères), Token, Tokeniser, TokeniserState, TreeBuilder, XmlTreeBuilder,
//    HtmlTreeBuilder, HtmlTreeBuilderState, HtmlTagOptions, Tag, TagSet, ParseSettings}, nodes.{Entities (décodage,
//    tables EntitiesData recopiées), Attributes, Node, Element, Document...}, sans suivi des positions ni des erreurs ;
//  - `Jsoup.parse(xml, "", Parser.xmlParser())` ; `Element.select` / `selectFirst` (select.QueryParser limité aux
//    sélecteurs de type, `*|type`, `*`, combinateurs ` ` et `>`, `,` et attributs `[k]`, `[k=v]` ; les autres lèvent
//    SelectorParseException : PORT) ; `Element.text()`, `attr()`, `hasAttr()`, `id()` ;
//  - `Jsoup.clean(html, Safelist.none())` : Parser.parseBodyFragment (HtmlTreeBuilder), Cleaner (Safelist.none : seuls
//    les TextNode sont recopiés) et sortie `body().html()` (Printer.Pretty, Entities.escape en mode base, UTF-8).
// Vérifié contre jsoup-1.23.1.jar (jshell) : test/port/jsoup-parser.test.ts et
// test/infrastructure/metadata/epub/EpubOracle.test.ts.
import { IllegalArgumentException, IllegalStateException } from './kotlin.js'

// ---------------------------------------------------------------------------
// Utilitaires Java
// ---------------------------------------------------------------------------

/** `String.trim()` de Java */
function javaTrim(s: string): string {
  let st = 0
  let len = s.length
  while (st < len && s.charCodeAt(st) <= 0x20) st++
  while (st < len && s.charCodeAt(len - 1) <= 0x20) len--
  return s.substring(st, len)
}

/** `Character.toUpperCase(char)` (unité UTF-16) */
function charUpper(c: string): string {
  const u = c.toUpperCase()
  return u.length === 1 ? u : c
}

/** `Character.toLowerCase(char)` (unité UTF-16) */
function charLower(c: string): string {
  const l = c.toLowerCase()
  return l.length === 1 ? l : c
}

/** `String.equalsIgnoreCase` */
function equalsIgnoreCase(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const c1 = a.charAt(i)
    const c2 = b.charAt(i)
    if (c1 === c2) continue
    const u1 = charUpper(c1)
    const u2 = charUpper(c2)
    if (u1 === u2) continue
    if (charLower(u1) === charLower(u2)) continue
    return false
  }
  return true
}

/** `Normalizer.lowerCase` : `toLowerCase(Locale.ROOT)` */
function lowerCase(s: string): string {
  return s.toLowerCase()
}

/** `Normalizer.normalize` : minuscules puis trim */
function normalize(s: string): string {
  return javaTrim(lowerCase(s))
}

const LETTER = /^\p{L}$/u
const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u

function isJavaLetter(c: string): boolean {
  const code = c.charCodeAt(0)
  return !(code >= 0xd800 && code <= 0xdfff) && LETTER.test(c)
}

function isAsciiLetter(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}

function isHexDigit(c: string): boolean {
  return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

/** `StringUtil.isWhitespace` */
function isWhitespaceChar(c: string | number): boolean {
  const n = typeof c === 'string' ? c.charCodeAt(0) : c
  return n === 0x20 || n === 0x09 || n === 0x0a || n === 0x0c || n === 0x0d
}

/** `StringUtil.isActuallyWhitespace` */
function isActuallyWhitespace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d || c === 160
}

/** `StringUtil.isInvisibleChar` */
function isInvisibleChar(c: number): boolean {
  return c === 8203 || c === 173
}

/** `StringUtil.isBlank` */
function isBlankString(s: string | null): boolean {
  if (s === null || s.length === 0) return true
  for (let i = 0; i < s.length; i++) if (!isWhitespaceChar(s.charCodeAt(i))) return false
  return true
}

/** `StringUtil.appendNormalisedWhitespace` */
function appendNormalisedWhitespace(accum: string[], string: string, stripLeading: boolean): void {
  let lastWasWhite = false
  let reachedNonWhite = false
  for (const ch of string) {
    const c = ch.codePointAt(0) as number
    if (isActuallyWhitespace(c)) {
      if ((stripLeading && !reachedNonWhite) || lastWasWhite) continue
      accum.push(' ')
      lastWasWhite = true
    } else if (!isInvisibleChar(c)) {
      accum.push(ch)
      lastWasWhite = false
      reachedNonWhite = true
    }
  }
}

function binarySearchStrings(a: readonly string[], key: string): number {
  let low = 0
  let high = a.length - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const v = a[mid] as string
    if (v < key) low = mid + 1
    else if (v > key) high = mid - 1
    else return mid
  }
  return -(low + 1)
}

function binarySearchInts(a: readonly number[], key: number): number {
  let low = 0
  let high = a.length - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const v = a[mid] as number
    if (v < key) low = mid + 1
    else if (v > key) high = mid - 1
    else return mid
  }
  return -(low + 1)
}

// ---------------------------------------------------------------------------
// parser.CharacterReader (tampon de 2048 caractères rempli depuis l'entrée, comme jsoup : certaines décisions du
// tokeniser dépendent de ce qui est en tampon, ex. `readFully()` et `containsIgnoreCase()` dans RcdataLessthanSign)
// ---------------------------------------------------------------------------

const EOF = '￿'
const BufferSize = 1024 * 2
const RefillPoint = BufferSize / 2
const RewindLimit = 1024

class CharacterReader {
  private input: string
  private inputPos = 0
  private charBuf = ''
  private bufPos = 0
  private bufLength = 0
  private fillPoint = 0
  private consumed = 0
  private bufMark = -1
  private readFully_ = false
  private lastIcSeq: string | null = null
  private lastIcIndex = 0

  constructor(input: string) {
    this.input = input
    this.bufferUp()
  }

  private bufferUp(): void {
    if (this.readFully_ || this.bufPos < this.fillPoint || this.bufMark !== -1) return
    this.doBufferUp()
  }

  private doBufferUp(): void {
    this.consumed += this.bufPos
    this.charBuf = this.charBuf.substring(this.bufPos)
    this.bufLength -= this.bufPos
    this.bufPos = 0
    while (this.bufLength < BufferSize) {
      // StringReader.read(cbuf, off, len)
      if (this.inputPos >= this.input.length) {
        this.readFully_ = true
        break
      }
      const read = Math.min(BufferSize - this.bufLength, this.input.length - this.inputPos)
      this.charBuf += this.input.substring(this.inputPos, this.inputPos + read)
      this.inputPos += read
      this.bufLength += read
    }
    this.fillPoint = Math.min(this.bufLength, RefillPoint)
    this.lastIcSeq = null
  }

  mark(): void {
    // make sure there is enough look ahead capacity
    if (this.bufLength - this.bufPos < RewindLimit) this.fillPoint = 0
    this.bufferUp()
    this.bufMark = this.bufPos
  }

  unmark(): void {
    this.bufMark = -1
  }

  rewindToMark(): void {
    if (this.bufMark === -1) throw new IllegalStateException('Mark invalid')
    this.bufPos = this.bufMark
    this.unmark()
  }

  pos(): number {
    return this.consumed + this.bufPos
  }

  readFully(): boolean {
    return this.readFully_
  }

  isEmpty(): boolean {
    this.bufferUp()
    return this.bufPos >= this.bufLength
  }

  private isEmptyNoBufferUp(): boolean {
    return this.bufPos >= this.bufLength
  }

  current(): string {
    this.bufferUp()
    return this.isEmptyNoBufferUp() ? EOF : (this.charBuf[this.bufPos] as string)
  }

  consume(): string {
    this.bufferUp()
    const val = this.isEmptyNoBufferUp() ? EOF : (this.charBuf[this.bufPos] as string)
    this.bufPos++
    return val
  }

  unconsume(): void {
    if (this.bufPos < 1) throw new IllegalStateException('WTF: No buffer left to unconsume.')
    this.bufPos--
  }

  advance(): void {
    this.bufPos++
  }

  nextIndexOf(seq: string): number {
    this.bufferUp()
    const i = this.charBuf.indexOf(seq, this.bufPos)
    // limité au tampon
    return i < 0 || i + seq.length > this.bufLength ? -1 : i - this.bufPos
  }

  consumeTo(seq: string): string {
    const offset = this.nextIndexOf(seq)
    if (offset !== -1) {
      const consumed = this.charBuf.substring(this.bufPos, this.bufPos + offset)
      this.bufPos += offset
      return consumed
    } else if (seq.length === 1) {
      return this.consumeToEnd()
    } else if (this.bufLength - this.bufPos < seq.length) {
      return this.consumeToEnd()
    } else {
      // the last few chars of the buffer may be the start of the sequence, so hold them back
      const endPos = this.bufLength - seq.length + 1
      const consumed = this.charBuf.substring(this.bufPos, endPos)
      this.bufPos = endPos
      return consumed
    }
  }

  consumeMatching(func: (c: string) => boolean, maxLength = -1): string {
    this.bufferUp()
    let pos = this.bufPos
    const start = pos
    while (pos < this.bufLength && (maxLength === -1 || pos - start < maxLength) && func(this.charBuf[pos] as string)) pos++
    this.bufPos = pos
    return pos > start ? this.charBuf.substring(start, pos) : ''
  }

  consumeToAny(...chars: string[]): string {
    this.bufferUp()
    let pos = this.bufPos
    const start = pos
    while (pos < this.bufLength && !chars.includes(this.charBuf[pos] as string)) pos++
    return this.consumeRange(start, pos)
  }

  consumeToAnySorted(chars: readonly string[]): string {
    return this.consumeToAny(...chars)
  }

  consumeData(): string {
    return this.consumeToAny('&', '<', nullChar)
  }

  consumeAttributeQuoted(single: boolean): string {
    const quote = single ? "'" : '"'
    return this.consumeToAny(nullChar, '&', quote)
  }

  consumeRawData(): string {
    return this.consumeToAny('<', nullChar)
  }

  consumeTagName(): string {
    this.bufferUp()
    let pos = this.bufPos
    const start = pos
    while (pos < this.bufLength) {
      const c = this.charBuf[pos]
      if (c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === ' ' || c === '/' || c === '>') return this.consumeRange(start, pos)
      pos++
    }
    return this.consumeRange(start, pos)
  }

  consumeToEnd(): string {
    this.bufferUp()
    const data = this.charBuf.substring(this.bufPos, this.bufLength)
    this.bufPos = this.bufLength
    return data
  }

  consumeLetterSequence(): string {
    return this.consumeMatching(isJavaLetter)
  }

  consumeLetterThenDigitSequence(): string {
    this.bufferUp()
    const start = this.bufPos
    while (this.bufPos < this.bufLength) {
      if (isAsciiLetter(this.charBuf[this.bufPos] as string)) this.bufPos++
      else break
    }
    while (!this.isEmptyNoBufferUp()) {
      if (isDigit(this.charBuf[this.bufPos] as string)) this.bufPos++
      else break
    }
    return this.charBuf.substring(start, this.bufPos)
  }

  consumeHexSequence(): string {
    return this.consumeMatching(isHexDigit)
  }

  consumeDigitSequence(): string {
    return this.consumeMatching((c) => c >= '0' && c <= '9')
  }

  private consumeRange(start: number, pos: number): string {
    this.bufPos = pos
    return pos > start ? this.charBuf.substring(start, pos) : ''
  }

  matches(seq: string): boolean {
    if (seq.length === 1) return !this.isEmpty() && this.charBuf[this.bufPos] === seq
    this.bufferUp()
    if (seq.length > this.bufLength - this.bufPos) return false
    return this.charBuf.startsWith(seq, this.bufPos)
  }

  matchesIgnoreCase(seq: string): boolean {
    this.bufferUp()
    if (seq.length > this.bufLength - this.bufPos) return false
    return this.rangeMatchesIgnoreCase(seq, this.bufPos)
  }

  private rangeMatchesIgnoreCase(seq: string, start: number): boolean {
    for (let offset = 0; offset < seq.length; offset++) {
      let scan = seq.charAt(offset)
      let target = this.charBuf.charAt(start + offset)
      if (scan === target) continue
      scan = charUpper(scan)
      target = charUpper(target)
      if (scan !== target) return false
    }
    return true
  }

  matchesAny(...seq: string[]): boolean {
    if (this.isEmpty()) return false
    return seq.includes(this.charBuf[this.bufPos] as string)
  }

  matchesAnySorted(seq: readonly string[]): boolean {
    this.bufferUp()
    return !this.isEmpty() && seq.includes(this.charBuf[this.bufPos] as string)
  }

  matchesAsciiAlpha(): boolean {
    if (this.isEmpty()) return false
    return isAsciiLetter(this.charBuf[this.bufPos] as string)
  }

  matchesDigit(): boolean {
    if (this.isEmpty()) return false
    return isDigit(this.charBuf[this.bufPos] as string)
  }

  matchConsume(seq: string): boolean {
    this.bufferUp()
    if (this.matches(seq)) {
      this.bufPos += seq.length
      return true
    }
    return false
  }

  matchConsumeIgnoreCase(seq: string): boolean {
    if (this.matchesIgnoreCase(seq)) {
      this.bufPos += seq.length
      return true
    }
    return false
  }

  containsIgnoreCase(seq: string): boolean {
    this.bufferUp()
    if (seq === this.lastIcSeq) {
      if (this.lastIcIndex === -1) return false
      if (this.lastIcIndex >= this.bufPos) return true
    }
    this.lastIcSeq = seq
    const scanLength = seq.length
    const maxStart = this.bufLength - scanLength
    for (let scan = this.bufPos; scan <= maxStart; scan++) {
      if (this.rangeMatchesIgnoreCase(seq, scan)) {
        this.lastIcIndex = scan
        return true
      }
    }
    this.lastIcIndex = -1
    return false
  }
}

// ---------------------------------------------------------------------------
// parser.Token
// ---------------------------------------------------------------------------

/** `TokenData` */
class TokenData {
  private v: string | null = null

  reset(): void {
    this.v = null
  }

  set(s: string): void {
    this.v = s
  }

  append(s: string): void {
    this.v = this.v === null ? s : this.v + s
  }

  appendCodePoint(cp: number): void {
    this.append(String.fromCodePoint(cp))
  }

  hasData(): boolean {
    return this.v !== null
  }

  value(): string {
    return this.v ?? ''
  }
}

type TokenType = 'Doctype' | 'StartTag' | 'EndTag' | 'Comment' | 'Character' | 'XmlDecl' | 'EOF'

abstract class Token {
  constructor(readonly type: TokenType) {}

  tokenType(): string {
    return this.constructor.name
  }

  reset(): this {
    return this
  }

  isDoctype(): boolean {
    return this.type === 'Doctype'
  }

  asDoctype(): DoctypeToken {
    return this as unknown as DoctypeToken
  }

  isStartTag(): boolean {
    return this.type === 'StartTag'
  }

  asStartTag(): StartTagToken {
    return this as unknown as StartTagToken
  }

  isEndTag(): boolean {
    return this.type === 'EndTag'
  }

  asEndTag(): EndTagToken {
    return this as unknown as EndTagToken
  }

  isComment(): boolean {
    return this.type === 'Comment'
  }

  asComment(): CommentToken {
    return this as unknown as CommentToken
  }

  isCharacter(): boolean {
    return this.type === 'Character'
  }

  isCData(): boolean {
    return this instanceof CDataToken
  }

  asCharacter(): CharacterToken {
    return this as unknown as CharacterToken
  }

  asXmlDecl(): XmlDeclToken {
    return this as unknown as XmlDeclToken
  }

  isEOF(): boolean {
    return this.type === 'EOF'
  }
}

class DoctypeToken extends Token {
  readonly name = new TokenData()
  pubSysKey: string | null = null
  readonly publicIdentifier = new TokenData()
  readonly systemIdentifier = new TokenData()
  readonly internalSubset = new TokenData()
  sawInternalSubset = false
  forceQuirks = false

  constructor() {
    super('Doctype')
  }

  override reset(): this {
    this.name.reset()
    this.pubSysKey = null
    this.publicIdentifier.reset()
    this.systemIdentifier.reset()
    this.internalSubset.reset()
    this.sawInternalSubset = false
    this.forceQuirks = false
    return this
  }

  getName(): string {
    return this.name.value()
  }

  getPubSysKey(): string | null {
    return this.pubSysKey
  }

  getPublicIdentifier(): string {
    return this.publicIdentifier.value()
  }

  getSystemIdentifier(): string {
    return this.systemIdentifier.value()
  }

  isForceQuirks(): boolean {
    return this.forceQuirks
  }
}

const MaxAttributes = 512

abstract class TagToken extends Token {
  readonly tagName = new TokenData()
  normalName_: string = null as unknown as string
  selfClosing = false
  attributes: Attributes | null = null
  private readonly attrName = new TokenData()
  private readonly attrValue = new TokenData()
  private hasEmptyAttrValue = false

  constructor(
    type: TokenType,
    readonly treeBuilder: TreeBuilder | null,
  ) {
    super(type)
  }

  override reset(): this {
    this.tagName.reset()
    this.normalName_ = null as unknown as string
    this.selfClosing = false
    this.attributes = null
    this.resetPendingAttr()
    return this
  }

  private resetPendingAttr(): void {
    this.attrName.reset()
    this.attrValue.reset()
    this.hasEmptyAttrValue = false
  }

  newAttribute(): void {
    if (this.attributes === null) this.attributes = new Attributes()
    if (this.attrName.hasData() && this.attributes.size() < MaxAttributes) {
      let name = this.attrName.value()
      name = javaTrim(name)
      if (name.length !== 0) {
        let value: string | null
        if (this.attrValue.hasData()) value = this.attrValue.value()
        else if (this.hasEmptyAttrValue) value = ''
        else value = null
        this.attributes.add(name, value)
      }
    }
    this.resetPendingAttr()
  }

  hasAttributes(): boolean {
    return this.attributes !== null
  }

  hasAttributeIgnoreCase(key: string): boolean {
    return this.attributes !== null && this.attributes.hasKeyIgnoreCase(key)
  }

  finaliseTag(): void {
    if (this.attrName.hasData()) {
      this.newAttribute()
    }
  }

  // PORT: finaliseAttributeRanges : positions de source non suivies
  finaliseAttributeRanges(_settings: ParseSettings): void {}

  normalName(): string {
    return this.normalName_ as string
  }

  // PORT: surcharges name() / name(String) fusionnées
  name(): string
  name(name: string): this
  name(name?: string): string | this {
    if (name === undefined) return this.tagName.value()
    this.tagName.set(name)
    this.normalName_ = lowerCase(this.tagName.value())
    return this
  }

  isSelfClosing(): boolean {
    return this.selfClosing
  }

  appendTagName(append: string): void {
    append = append.replaceAll(nullChar, replacementChar)
    this.tagName.append(append)
    this.normalName_ = lowerCase(this.tagName.value())
  }

  appendAttributeName(append: string, _startPos?: number, _endPos?: number): void {
    append = append.replaceAll(nullChar, replacementChar)
    this.attrName.append(append)
  }

  appendAttributeValue(append: string | number[], _startPos?: number, _endPos?: number): void {
    if (typeof append === 'string') this.attrValue.append(append)
    else for (const codepoint of append) this.attrValue.appendCodePoint(codepoint)
  }

  setEmptyAttributeValue(): void {
    this.hasEmptyAttrValue = true
  }
}

class StartTagToken extends TagToken {
  constructor(treeBuilder: TreeBuilder | null) {
    super('StartTag', treeBuilder)
  }

  override reset(): this {
    super.reset()
    this.attributes = null
    return this
  }

  nameAttr(name: string, attributes: Attributes): this {
    this.tagName.set(name)
    this.attributes = attributes
    this.normalName_ = lowerCase(name)
    return this
  }
}

class EndTagToken extends TagToken {
  constructor(treeBuilder: TreeBuilder | null) {
    super('EndTag', treeBuilder)
  }
}

class XmlDeclToken extends TagToken {
  isDeclaration = true

  constructor(treeBuilder: TreeBuilder | null) {
    super('XmlDecl', treeBuilder)
  }

  override reset(): this {
    super.reset()
    this.isDeclaration = true
    return this
  }
}

class CommentToken extends Token {
  readonly data = new TokenData()
  bogus = false

  constructor() {
    super('Comment')
  }

  override reset(): this {
    this.data.reset()
    this.bogus = false
    return this
  }

  getData(): string {
    return this.data.value()
  }

  append(append: string): this {
    this.data.append(append)
    return this
  }
}

class CharacterToken extends Token {
  readonly data = new TokenData()

  constructor(source?: CharacterToken) {
    super('Character')
    if (source !== undefined) this.data.set(source.getData())
  }

  override reset(): this {
    this.data.reset()
    return this
  }

  getData(): string {
    return this.data.value()
  }

  append(str: string): this {
    this.data.append(str)
    return this
  }

  normalizeNulls(replace: boolean): void {
    let data = this.data.value()
    if (data.indexOf(nullChar) === -1) return
    data = replace ? data.replaceAll(nullChar, replacementChar) : data.replaceAll(nullChar, '')
    this.data.set(data)
  }
}

class CDataToken extends CharacterToken {
  constructor(data: string) {
    super()
    this.data.set(data)
  }
}

class EOFToken extends Token {
  constructor() {
    super('EOF')
  }
}

// ---------------------------------------------------------------------------
// parser.Tokeniser
// ---------------------------------------------------------------------------

const nullChar = '\u0000'
const replacementChar = '�'
const replacementStr = replacementChar
const eof = EOF
const notCharRefCharsSorted = ['\t', '\n', '\f', '\r', ' ', '&', '<']
const win1252ExtensionsStart = 0x80
const win1252Extensions = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
]
const attributeNameCharsSorted = ['\t', '\n', '\f', '\r', ' ', '"', "'", '/', '<', '=', '>', '?']
const attributeValueUnquoted = [nullChar, '\t', '\n', '\f', '\r', ' ', '"', '&', "'", '<', '=', '>', '`']

class Tokeniser {
  private state: State = S.Data
  private emitPending: Token | null = null
  private isEmitPending = false
  readonly dataBuffer = new TokenData()
  readonly syntax: 'xml' | 'html'
  readonly startPending: StartTagToken
  readonly endPending: EndTagToken
  tagPending: TagToken
  readonly charPending = new CharacterToken()
  readonly doctypePending = new DoctypeToken()
  readonly commentPending = new CommentToken()
  readonly xmlDeclPending: XmlDeclToken
  private lastStartTag: string | null = null
  private lastStartCloseSeq: string | null = null
  private readonly reader: CharacterReader

  constructor(private readonly treeBuilder: TreeBuilder) {
    this.syntax = treeBuilder instanceof XmlTreeBuilder ? 'xml' : 'html'
    this.tagPending = this.startPending = new StartTagToken(treeBuilder)
    this.endPending = new EndTagToken(treeBuilder)
    this.xmlDeclPending = new XmlDeclToken(treeBuilder)
    this.reader = treeBuilder.reader
  }

  read(): Token {
    while (!this.isEmitPending) {
      this.state.read(this, this.reader)
    }
    // if emit is pending, a non-character token was found: return any chars in buffer, and leave token for next read:
    if (this.charPending.data.hasData()) {
      return this.charPending
    } else {
      this.isEmitPending = false
      return this.emitPending as Token
    }
  }

  // PORT: surcharges emit(Token) / emit(String) / emit(char) / emit(int[]) fusionnées
  emit(token: Token | string | number[]): void {
    if (typeof token === 'string') {
      // buffer strings up until last string token found, to emit only one token for a run of character refs etc.
      this.charPending.append(token)
      return
    }
    if (Array.isArray(token)) {
      this.emit(String.fromCodePoint(...token))
      return
    }
    if (this.isEmitPending) throw new IllegalArgumentException('Must be false')
    this.emitPending = token
    this.isEmitPending = true
    if (token.type === 'StartTag') {
      const startTag = token as StartTagToken
      this.lastStartTag = startTag.name()
      this.lastStartCloseSeq = null // only lazy inits
    }
  }

  transition(newState: State): void {
    this.state = newState
  }

  advanceTransition(newState: State): void {
    this.transition(newState)
    this.reader.advance()
  }

  consumeCharacterReference(additionalAllowedCharacter: string | null, inAttribute: boolean): number[] | null {
    const reader = this.reader
    if (reader.isEmpty()) return null
    if (additionalAllowedCharacter !== null && additionalAllowedCharacter === reader.current()) return null
    if (reader.matchesAnySorted(notCharRefCharsSorted)) return null

    reader.mark()
    if (reader.matchConsume('#')) {
      // numbered
      const isHexMode = reader.matchConsumeIgnoreCase('X')
      const numRef = isHexMode ? reader.consumeHexSequence() : reader.consumeDigitSequence()
      if (numRef.length === 0) {
        // didn't match anything
        reader.rewindToMark()
        return null
      }

      reader.unmark()
      reader.matchConsume(';')
      let charval = -1
      // Integer.valueOf(numRef, base) : NumberFormatException au-delà de Integer.MAX_VALUE
      const v = parseInt(numRef, isHexMode ? 16 : 10)
      if (v <= 2147483647) charval = v
      let codeRef: number
      if (charval === -1 || charval > 0x10ffff) {
        codeRef = replacementChar.charCodeAt(0)
      } else {
        // fix illegal unicode characters to match browser behavior
        if (charval >= win1252ExtensionsStart && charval < win1252ExtensionsStart + win1252Extensions.length) {
          charval = win1252Extensions[charval - win1252ExtensionsStart] as number
        }
        codeRef = charval
      }
      return [codeRef]
    } else {
      // named
      // get as many letters as possible, and look for matching entities.
      let nameRef = reader.consumeLetterThenDigitSequence()
      const looksLegit = reader.matches(';')
      // found if a base named entity without a ;, or an extended entity with the ;.
      const found = Entities.isBaseNamedEntity(nameRef) || (Entities.isNamedEntity(nameRef) && looksLegit)

      if (!found) {
        reader.rewindToMark()
        if (inAttribute) return null
        // check if there's a base prefix match; consume and use that if so
        const prefix = Entities.findPrefix(nameRef)
        if (prefix.length === 0) return null
        reader.matchConsume(prefix)
        nameRef = prefix
      }
      if (inAttribute && (reader.matchesAsciiAlpha() || reader.matchesDigit() || reader.matchesAny('=', '-', '_'))) {
        // don't want that to match
        reader.rewindToMark()
        return null
      }

      reader.unmark()
      reader.matchConsume(';')
      const holder = [0, 0]
      const numChars = Entities.codepointsForName(nameRef, holder)
      if (numChars === 1) {
        return [holder[0] as number]
      } else if (numChars === 2) {
        return holder
      } else {
        throw new IllegalArgumentException('Unexpected characters returned for ' + nameRef)
      }
    }
  }

  createTagPending(start: boolean): TagToken {
    this.tagPending = start ? this.startPending.reset() : this.endPending.reset()
    return this.tagPending
  }

  createXmlDeclPending(isDeclaration: boolean): XmlDeclToken {
    const decl = this.xmlDeclPending.reset()
    decl.isDeclaration = isDeclaration
    this.tagPending = decl
    return decl
  }

  emitTagPending(): void {
    this.tagPending.finaliseTag()
    this.emit(this.tagPending)
  }

  createCommentPending(): void {
    this.commentPending.reset()
  }

  emitCommentPending(): void {
    this.emit(this.commentPending)
  }

  createBogusCommentPending(): void {
    this.commentPending.reset()
    this.commentPending.bogus = true
  }

  createDoctypePending(): void {
    this.doctypePending.reset()
  }

  emitDoctypePending(): void {
    this.emit(this.doctypePending)
  }

  createTempBuffer(): void {
    this.dataBuffer.reset()
  }

  isCdataAllowed(): boolean {
    return this.syntax === 'xml' || NamespaceHtml !== this.treeBuilder.currentElement().tag().namespace()
  }

  isAppropriateEndTagToken(): boolean {
    return this.lastStartTag !== null && equalsIgnoreCase(this.tagPending.name(), this.lastStartTag)
  }

  appropriateEndTagName(): string | null {
    return this.lastStartTag // could be null
  }

  appropriateEndTagSeq(): string {
    if (this.lastStartCloseSeq === null)
      // reset on start tag emit
      this.lastStartCloseSeq = '</' + this.lastStartTag
    return this.lastStartCloseSeq
  }

  // PORT: la liste des erreurs d'analyse n'est pas tenue (Parser.isTrackErrors désactivé par défaut)
  error(_state: State | string, ..._args: unknown[]): void {}

  eofError(_state: State): void {}
}

// ---------------------------------------------------------------------------
// parser.TokeniserState (conversion à plat de l'enum Java)
// ---------------------------------------------------------------------------

abstract class State {
  constructor(readonly name: string) {}

  abstract read(t: Tokeniser, r: CharacterReader): void

  toString(): string {
    return this.name
  }
}

// ---------------------------------------------------------------------------
// nodes.Entities (décodage) et EntitiesData
// ---------------------------------------------------------------------------

const xmlPoints =
  'amp=12;1&gt=1q;3&lt=1o;2&quot=y;0&'
const basePoints =
  'AElig=5i;1c&AMP=12;2&Aacute=5d;17&Acirc=5e;18&Agrave=5c;16&Aring=5h;1b&Atilde=5f;19&Auml=5g;1a&COPY=4p;h&Ccedil=5j;1d&ETH=5s;1m&Eacute=5l;1f&Ecirc=5m;1g&Egrave=5k;1e&Euml=5n;1h&GT=1q;6&Iacute=5p;1j&Icirc=5q;1k&Igrave=5o;1i&Iuml=5r;1l&LT=1o;4&Ntilde=5t;1n&Oacute=5v;1p&Ocirc=5w;1q&Ograve=5u;1o&Oslash=60;1u&Otilde=5x;1r&Ouml=5y;1s&QUOT=y;0&REG=4u;n&THORN=66;20&Uacute=62;1w&Ucirc=63;1x&Ugrave=61;1v&Uuml=64;1y&Yacute=65;1z&aacute=69;23&acirc=6a;24&acute=50;u&aelig=6e;28&agrave=68;22&amp=12;3&aring=6d;27&atilde=6b;25&auml=6c;26&brvbar=4m;e&ccedil=6f;29&cedil=54;y&cent=4i;a&copy=4p;i&curren=4k;c&deg=4w;q&divide=6v;2p&eacute=6h;2b&ecirc=6i;2c&egrave=6g;2a&eth=6o;2i&euml=6j;2d&frac12=59;13&frac14=58;12&frac34=5a;14&gt=1q;7&iacute=6l;2f&icirc=6m;2g&iexcl=4h;9&igrave=6k;2e&iquest=5b;15&iuml=6n;2h&laquo=4r;k&lt=1o;5&macr=4v;p&micro=51;v&middot=53;x&nbsp=4g;8&not=4s;l&ntilde=6p;2j&oacute=6r;2l&ocirc=6s;2m&ograve=6q;2k&ordf=4q;j&ordm=56;10&oslash=6w;2q&otilde=6t;2n&ouml=6u;2o&para=52;w&plusmn=4x;r&pound=4j;b&quot=y;1&raquo=57;11&reg=4u;o&sect=4n;f&shy=4t;m&sup1=55;z&sup2=4y;s&sup3=4z;t&szlig=67;21&thorn=72;2w&times=5z;1t&uacute=6y;2s&ucirc=6z;2t&ugrave=6x;2r&uml=4o;g&uuml=70;2u&yacute=71;2v&yen=4l;d&yuml=73;2x&'
const fullPoints =
  'AElig=5i;2v&AMP=12;8&Aacute=5d;2p&Abreve=76;4k&Acirc=5e;2q&Acy=sw;av&Afr=2kn8;1kh&Agrave=5c;2o&Alpha=pd;8d&Amacr=74;4i&And=8cz;1e1&Aogon=78;4m&Aopf=2koo;1ls&ApplyFunction=6e9;ew&Aring=5h;2t&Ascr=2kkc;1jc&Assign=6s4;s6&Atilde=5f;2r&Auml=5g;2s&Backslash=6qe;o1&Barv=8h3;1it&Barwed=6x2;120&Bcy=sx;aw&Because=6r9;pw&Bernoullis=6jw;gn&Beta=pe;8e&Bfr=2kn9;1ki&Bopf=2kop;1lt&Breve=k8;82&Bscr=6jw;gp&Bumpeq=6ry;ro&CHcy=tj;bi&COPY=4p;1q&Cacute=7a;4o&Cap=6vm;zz&CapitalDifferentialD=6kl;h8&Cayleys=6jx;gq&Ccaron=7g;4u&Ccedil=5j;2w&Ccirc=7c;4q&Cconint=6r4;pn&Cdot=7e;4s&Cedilla=54;2e&CenterDot=53;2b&Cfr=6jx;gr&Chi=pz;8y&CircleDot=6u1;x8&CircleMinus=6ty;x3&CirclePlus=6tx;x1&CircleTimes=6tz;x5&ClockwiseContourIntegral=6r6;pp&CloseCurlyDoubleQuote=6cd;e0&CloseCurlyQuote=6c9;dt&Colon=6rb;q1&Colone=8dw;1en&Congruent=6sh;sn&Conint=6r3;pm&ContourIntegral=6r2;pi&Copf=6iq;f7&Coproduct=6q8;nq&CounterClockwiseContourIntegral=6r7;pr&Cross=8bz;1d8&Cscr=2kke;1jd&Cup=6vn;100&CupCap=6rx;rk&DD=6kl;h9&DDotrahd=841;184&DJcy=si;ai&DScy=sl;al&DZcy=sv;au&Dagger=6ch;e7&Darr=6n5;j5&Dashv=8h0;1ir&Dcaron=7i;4w&Dcy=t0;az&Del=6pz;n9&Delta=pg;8g&Dfr=2knb;1kj&DiacriticalAcute=50;27&DiacriticalDot=k9;84&DiacriticalDoubleAcute=kd;8a&DiacriticalGrave=2o;13&DiacriticalTilde=kc;88&Diamond=6v8;za&DifferentialD=6km;ha&Dopf=2kor;1lu&Dot=4o;1n&DotDot=6ho;f5&DotEqual=6s0;rw&DoubleContourIntegral=6r3;pl&DoubleDot=4o;1m&DoubleDownArrow=6oj;m0&DoubleLeftArrow=6og;lq&DoubleLeftRightArrow=6ok;m3&DoubleLeftTee=8h0;1iq&DoubleLongLeftArrow=7w8;17g&DoubleLongLeftRightArrow=7wa;17m&DoubleLongRightArrow=7w9;17j&DoubleRightArrow=6oi;lw&DoubleRightTee=6ug;xz&DoubleUpArrow=6oh;lt&DoubleUpDownArrow=6ol;m7&DoubleVerticalBar=6qt;ov&DownArrow=6mr;i8&DownArrowBar=843;186&DownArrowUpArrow=6ph;mn&DownBreve=lt;8c&DownLeftRightVector=85s;198&DownLeftTeeVector=866;19m&DownLeftVector=6nx;ke&DownLeftVectorBar=85y;19e&DownRightTeeVector=867;19n&DownRightVector=6o1;kq&DownRightVectorBar=85z;19f&DownTee=6uc;xs&DownTeeArrow=6nb;jh&Downarrow=6oj;m1&Dscr=2kkf;1je&Dstrok=7k;4y&ENG=96;6g&ETH=5s;35&Eacute=5l;2y&Ecaron=7u;56&Ecirc=5m;2z&Ecy=tp;bo&Edot=7q;52&Efr=2knc;1kk&Egrave=5k;2x&Element=6q0;na&Emacr=7m;50&EmptySmallSquare=7i3;15x&EmptyVerySmallSquare=7fv;150&Eogon=7s;54&Eopf=2kos;1lv&Epsilon=ph;8h&Equal=8dx;1eo&EqualTilde=6rm;qp&Equilibrium=6oc;li&Escr=6k0;gu&Esim=8dv;1em&Eta=pj;8j&Euml=5n;30&Exists=6pv;mz&ExponentialE=6kn;hc&Fcy=tg;bf&Ffr=2knd;1kl&FilledSmallSquare=7i4;15y&FilledVerySmallSquare=7fu;14w&Fopf=2kot;1lw&ForAll=6ps;ms&Fouriertrf=6k1;gv&Fscr=6k1;gw&GJcy=sj;aj&GT=1q;r&Gamma=pf;8f&Gammad=rg;a5&Gbreve=7y;5a&Gcedil=82;5e&Gcirc=7w;58&Gcy=sz;ay&Gdot=80;5c&Gfr=2kne;1km&Gg=6vt;10c&Gopf=2kou;1lx&GreaterEqual=6sl;sv&GreaterEqualLess=6vv;10i&GreaterFullEqual=6sn;t6&GreaterGreater=8f6;1gh&GreaterLess=6t3;ul&GreaterSlantEqual=8e6;1f5&GreaterTilde=6sz;ub&Gscr=2kki;1jf&Gt=6sr;tr&HARDcy=tm;bl&Hacek=jr;80&Hat=2m;10&Hcirc=84;5f&Hfr=6j0;fe&HilbertSpace=6iz;fa&Hopf=6j1;fg&HorizontalLine=7b4;13i&Hscr=6iz;fc&Hstrok=86;5h&HumpDownHump=6ry;rn&HumpEqual=6rz;rs&IEcy=t1;b0&IJlig=8i;5s&IOcy=sh;ah&Iacute=5p;32&Icirc=5q;33&Icy=t4;b3&Idot=8g;5p&Ifr=6j5;fq&Igrave=5o;31&Im=6j5;fr&Imacr=8a;5l&ImaginaryI=6ko;hf&Implies=6oi;ly&Int=6r0;pf&Integral=6qz;pd&Intersection=6v6;z4&InvisibleComma=6eb;f0&InvisibleTimes=6ea;ey&Iogon=8e;5n&Iopf=2kow;1ly&Iota=pl;8l&Iscr=6j4;fn&Itilde=88;5j&Iukcy=sm;am&Iuml=5r;34&Jcirc=8k;5u&Jcy=t5;b4&Jfr=2knh;1kn&Jopf=2kox;1lz&Jscr=2kkl;1jg&Jsercy=so;ao&Jukcy=sk;ak&KHcy=th;bg&KJcy=ss;as&Kappa=pm;8m&Kcedil=8m;5w&Kcy=t6;b5&Kfr=2kni;1ko&Kopf=2koy;1m0&Kscr=2kkm;1jh&LJcy=sp;ap&LT=1o;m&Lacute=8p;5z&Lambda=pn;8n&Lang=7vu;173&Laplacetrf=6j6;fs&Larr=6n2;j1&Lcaron=8t;63&Lcedil=8r;61&Lcy=t7;b6&LeftAngleBracket=7vs;16x&LeftArrow=6mo;hu&LeftArrowBar=6p0;mj&LeftArrowRightArrow=6o6;l3&LeftCeiling=6x4;121&LeftDoubleBracket=7vq;16t&LeftDownTeeVector=869;19p&LeftDownVector=6o3;kw&LeftDownVectorBar=861;19h&LeftFloor=6x6;125&LeftRightArrow=6ms;ib&LeftRightVector=85q;196&LeftTee=6ub;xq&LeftTeeArrow=6n8;ja&LeftTeeVector=862;19i&LeftTriangle=6uq;ya&LeftTriangleBar=89b;1c0&LeftTriangleEqual=6us;yg&LeftUpDownVector=85t;199&LeftUpTeeVector=868;19o&LeftUpVector=6nz;kk&LeftUpVectorBar=860;19g&LeftVector=6nw;kb&LeftVectorBar=85u;19a&Leftarrow=6og;lr&Leftrightarrow=6ok;m4&LessEqualGreater=6vu;10e&LessFullEqual=6sm;t0&LessGreater=6t2;ui&LessLess=8f5;1gf&LessSlantEqual=8e5;1ez&LessTilde=6sy;u8&Lfr=2knj;1kp&Ll=6vs;109&Lleftarrow=6oq;me&Lmidot=8v;65&LongLeftArrow=7w5;177&LongLeftRightArrow=7w7;17d&LongRightArrow=7w6;17a&Longleftarrow=7w8;17h&Longleftrightarrow=7wa;17n&Longrightarrow=7w9;17k&Lopf=2koz;1m1&LowerLeftArrow=6mx;iq&LowerRightArrow=6mw;in&Lscr=6j6;fu&Lsh=6nk;jv&Lstrok=8x;67&Lt=6sq;tl&Map=83p;17v&Mcy=t8;b7&MediumSpace=6e7;eu&Mellintrf=6k3;gx&Mfr=2knk;1kq&MinusPlus=6qb;nv&Mopf=2kp0;1m2&Mscr=6k3;gz&Mu=po;8o&NJcy=sq;aq&Nacute=8z;69&Ncaron=93;6d&Ncedil=91;6b&Ncy=t9;b8&NegativeMediumSpace=6bv;dc&NegativeThickSpace=6bv;dd&NegativeThinSpace=6bv;de&NegativeVeryThinSpace=6bv;db&NestedGreaterGreater=6sr;tq&NestedLessLess=6sq;tk&NewLine=a;1&Nfr=2knl;1kr&NoBreak=6e8;ev&NonBreakingSpace=4g;1d&Nopf=6j9;fx&Not=8h8;1ix&NotCongruent=6si;sp&NotCupCap=6st;tv&NotDoubleVerticalBar=6qu;p0&NotElement=6q1;ne&NotEqual=6sg;sk&NotEqualTilde=6rm,mw;qn&NotExists=6pw;n1&NotGreater=6sv;tz&NotGreaterEqual=6sx;u5&NotGreaterFullEqual=6sn,mw;t3&NotGreaterGreater=6sr,mw;tn&NotGreaterLess=6t5;uq&NotGreaterSlantEqual=8e6,mw;1f2&NotGreaterTilde=6t1;ug&NotHumpDownHump=6ry,mw;rl&NotHumpEqual=6rz,mw;rq&NotLeftTriangle=6wa;113&NotLeftTriangleBar=89b,mw;1bz&NotLeftTriangleEqual=6wc;119&NotLess=6su;tw&NotLessEqual=6sw;u2&NotLessGreater=6t4;uo&NotLessLess=6sq,mw;th&NotLessSlantEqual=8e5,mw;1ew&NotLessTilde=6t0;ue&NotNestedGreaterGreater=8f6,mw;1gg&NotNestedLessLess=8f5,mw;1ge&NotPrecedes=6tc;vb&NotPrecedesEqual=8fj,mw;1gv&NotPrecedesSlantEqual=6w0;10p&NotReverseElement=6q4;nl&NotRightTriangle=6wb;116&NotRightTriangleBar=89c,mw;1c1&NotRightTriangleEqual=6wd;11c&NotSquareSubset=6tr,mw;wh&NotSquareSubsetEqual=6w2;10t&NotSquareSuperset=6ts,mw;wl&NotSquareSupersetEqual=6w3;10v&NotSubset=6te,6he;vh&NotSubsetEqual=6tk;w0&NotSucceeds=6td;ve&NotSucceedsEqual=8fk,mw;1h1&NotSucceedsSlantEqual=6w1;10r&NotSucceedsTilde=6tb,mw;v7&NotSuperset=6tf,6he;vm&NotSupersetEqual=6tl;w3&NotTilde=6rl;ql&NotTildeEqual=6ro;qv&NotTildeFullEqual=6rr;r1&NotTildeTilde=6rt;r9&NotVerticalBar=6qs;or&Nscr=2kkp;1ji&Ntilde=5t;36&Nu=pp;8p&OElig=9e;6m&Oacute=5v;38&Ocirc=5w;39&Ocy=ta;b9&Odblac=9c;6k&Ofr=2knm;1ks&Ograve=5u;37&Omacr=98;6i&Omega=q1;90&Omicron=pr;8r&Oopf=2kp2;1m3&OpenCurlyDoubleQuote=6cc;dy&OpenCurlyQuote=6c8;dr&Or=8d0;1e2&Oscr=2kkq;1jj&Oslash=60;3d&Otilde=5x;3a&Otimes=8c7;1df&Ouml=5y;3b&OverBar=6da;em&OverBrace=732;13b&OverBracket=71w;134&OverParenthesis=730;139&PartialD=6pu;mx&Pcy=tb;ba&Pfr=2knn;1kt&Phi=py;8x&Pi=ps;8s&PlusMinus=4x;22&Poincareplane=6j0;fd&Popf=6jd;g3&Pr=8fv;1hl&Precedes=6t6;us&PrecedesEqual=8fj;1gy&PrecedesSlantEqual=6t8;uy&PrecedesTilde=6ta;v4&Prime=6cz;eg&Product=6q7;no&Proportion=6rb;q0&Proportional=6ql;oa&Pscr=2kkr;1jk&Psi=q0;8z&QUOT=y;3&Qfr=2kno;1ku&Qopf=6je;g5&Qscr=2kks;1jl&RBarr=840;183&REG=4u;1x&Racute=9g;6o&Rang=7vv;174&Rarr=6n4;j4&Rarrtl=846;187&Rcaron=9k;6s&Rcedil=9i;6q&Rcy=tc;bb&Re=6jg;gb&ReverseElement=6q3;nh&ReverseEquilibrium=6ob;le&ReverseUpEquilibrium=86n;1a4&Rfr=6jg;ga&Rho=pt;8t&RightAngleBracket=7vt;170&RightArrow=6mq;i3&RightArrowBar=6p1;ml&RightArrowLeftArrow=6o4;ky&RightCeiling=6x5;123&RightDoubleBracket=7vr;16v&RightDownTeeVector=865;19l&RightDownVector=6o2;kt&RightDownVectorBar=85x;19d&RightFloor=6x7;127&RightTee=6ua;xo&RightTeeArrow=6na;je&RightTeeVector=863;19j&RightTriangle=6ur;yd&RightTriangleBar=89c;1c2&RightTriangleEqual=6ut;yk&RightUpDownVector=85r;197&RightUpTeeVector=864;19k&RightUpVector=6ny;kh&RightUpVectorBar=85w;19c&RightVector=6o0;kn&RightVectorBar=85v;19b&Rightarrow=6oi;lx&Ropf=6jh;gd&RoundImplies=86o;1a6&Rrightarrow=6or;mg&Rscr=6jf;g7&Rsh=6nl;jx&RuleDelayed=8ac;1cb&SHCHcy=tl;bk&SHcy=tk;bj&SOFTcy=to;bn&Sacute=9m;6u&Sc=8fw;1hm&Scaron=9s;70&Scedil=9q;6y&Scirc=9o;6w&Scy=td;bc&Sfr=2knq;1kv&ShortDownArrow=6mr;i7&ShortLeftArrow=6mo;ht&ShortRightArrow=6mq;i2&ShortUpArrow=6mp;hy&Sigma=pv;8u&SmallCircle=6qg;o6&Sopf=2kp6;1m4&Sqrt=6qi;o9&Square=7fl;14t&SquareIntersection=6tv;ww&SquareSubset=6tr;wi&SquareSubsetEqual=6tt;wp&SquareSuperset=6ts;wm&SquareSupersetEqual=6tu;ws&SquareUnion=6tw;wz&Sscr=2kku;1jm&Star=6va;zf&Sub=6vk;zw&Subset=6vk;zv&SubsetEqual=6ti;vu&Succeeds=6t7;uv&SucceedsEqual=8fk;1h4&SucceedsSlantEqual=6t9;v1&SucceedsTilde=6tb;v8&SuchThat=6q3;ni&Sum=6q9;ns&Sup=6vl;zy&Superset=6tf;vp&SupersetEqual=6tj;vx&Supset=6vl;zx&THORN=66;3j&TRADE=6jm;gf&TSHcy=sr;ar&TScy=ti;bh&Tab=9;0&Tau=pw;8v&Tcaron=9w;74&Tcedil=9u;72&Tcy=te;bd&Tfr=2knr;1kw&Therefore=6r8;pt&Theta=pk;8k&ThickSpace=6e7,6bu;et&ThinSpace=6bt;d7&Tilde=6rg;q9&TildeEqual=6rn;qs&TildeFullEqual=6rp;qy&TildeTilde=6rs;r4&Topf=2kp7;1m5&TripleDot=6hn;f3&Tscr=2kkv;1jn&Tstrok=9y;76&Uacute=62;3f&Uarr=6n3;j2&Uarrocir=85l;193&Ubrcy=su;at&Ubreve=a4;7c&Ucirc=63;3g&Ucy=tf;be&Udblac=a8;7g&Ufr=2kns;1kx&Ugrave=61;3e&Umacr=a2;7a&UnderBar=2n;11&UnderBrace=733;13c&UnderBracket=71x;136&UnderParenthesis=731;13a&Union=6v7;z8&UnionPlus=6tq;wf&Uogon=aa;7i&Uopf=2kp8;1m6&UpArrow=6mp;hz&UpArrowBar=842;185&UpArrowDownArrow=6o5;l1&UpDownArrow=6mt;ie&UpEquilibrium=86m;1a2&UpTee=6ud;xv&UpTeeArrow=6n9;jc&Uparrow=6oh;lu&Updownarrow=6ol;m8&UpperLeftArrow=6mu;ih&UpperRightArrow=6mv;ik&Upsi=r6;9z&Upsilon=px;8w&Uring=a6;7e&Uscr=2kkw;1jo&Utilde=a0;78&Uuml=64;3h&VDash=6uj;y3&Vbar=8h7;1iw&Vcy=sy;ax&Vdash=6uh;y1&Vdashl=8h2;1is&Vee=6v5;z3&Verbar=6c6;dp&Vert=6c6;dq&VerticalBar=6qr;on&VerticalLine=3g;18&VerticalSeparator=7rs;16o&VerticalTilde=6rk;qi&VeryThinSpace=6bu;d9&Vfr=2knt;1ky&Vopf=2kp9;1m7&Vscr=2kkx;1jp&Vvdash=6ui;y2&Wcirc=ac;7k&Wedge=6v4;z0&Wfr=2knu;1kz&Wopf=2kpa;1m8&Wscr=2kky;1jq&Xfr=2knv;1l0&Xi=pq;8q&Xopf=2kpb;1m9&Xscr=2kkz;1jr&YAcy=tr;bq&YIcy=sn;an&YUcy=tq;bp&Yacute=65;3i&Ycirc=ae;7m&Ycy=tn;bm&Yfr=2knw;1l1&Yopf=2kpc;1ma&Yscr=2kl0;1js&Yuml=ag;7o&ZHcy=t2;b1&Zacute=ah;7p&Zcaron=al;7t&Zcy=t3;b2&Zdot=aj;7r&ZeroWidthSpace=6bv;df&Zeta=pi;8i&Zfr=6js;gl&Zopf=6jo;gi&Zscr=2kl1;1jt&aacute=69;3m&abreve=77;4l&ac=6ri;qg&acE=6ri,mr;qe&acd=6rj;qh&acirc=6a;3n&acute=50;28&acy=ts;br&aelig=6e;3r&af=6e9;ex&afr=2kny;1l2&agrave=68;3l&alefsym=6k5;h3&aleph=6k5;h4&alpha=q9;92&amacr=75;4j&amalg=8cf;1dm&amp=12;9&and=6qv;p6&andand=8d1;1e3&andd=8d8;1e9&andslope=8d4;1e6&andv=8d6;1e7&ang=6qo;oj&ange=884;1b1&angle=6qo;oi&angmsd=6qp;ol&angmsdaa=888;1b5&angmsdab=889;1b6&angmsdac=88a;1b7&angmsdad=88b;1b8&angmsdae=88c;1b9&angmsdaf=88d;1ba&angmsdag=88e;1bb&angmsdah=88f;1bc&angrt=6qn;og&angrtvb=6v2;yw&angrtvbd=87x;1b0&angsph=6qq;om&angst=5h;2u&angzarr=70c;12z&aogon=79;4n&aopf=2kpe;1mb&ap=6rs;r8&apE=8ds;1ej&apacir=8dr;1eh&ape=6ru;rd&apid=6rv;rf&apos=13;a&approx=6rs;r5&approxeq=6ru;rc&aring=6d;3q&ascr=2kl2;1ju&ast=16;e&asymp=6rs;r6&asympeq=6rx;rj&atilde=6b;3o&auml=6c;3p&awconint=6r7;ps&awint=8b5;1cr&bNot=8h9;1iy&backcong=6rw;rg&backepsilon=s6;af&backprime=6d1;ei&backsim=6rh;qc&backsimeq=6vh;zp&barvee=6v1;yv&barwed=6x1;11y&barwedge=6x1;11x&bbrk=71x;137&bbrktbrk=71y;138&bcong=6rw;rh&bcy=tt;bs&bdquo=6ce;e4&becaus=6r9;py&because=6r9;px&bemptyv=88g;1bd&bepsi=s6;ag&bernou=6jw;go&beta=qa;93&beth=6k6;h5&between=6ss;tt&bfr=2knz;1l3&bigcap=6v6;z5&bigcirc=7hr;15s&bigcup=6v7;z7&bigodot=8ao;1cd&bigoplus=8ap;1cf&bigotimes=8aq;1ch&bigsqcup=8au;1cl&bigstar=7id;15z&bigtriangledown=7gd;15e&bigtriangleup=7g3;154&biguplus=8as;1cj&bigvee=6v5;z1&bigwedge=6v4;yy&bkarow=83x;17x&blacklozenge=8a3;1c9&blacksquare=7fu;14x&blacktriangle=7g4;156&blacktriangledown=7ge;15g&blacktriangleleft=7gi;15k&blacktriangleright=7g8;15a&blank=74z;13f&blk12=7f6;14r&blk14=7f5;14q&blk34=7f7;14s&block=7ew;14p&bne=1p,6hx;o&bnequiv=6sh,6hx;sm&bnot=6xc;12d&bopf=2kpf;1mc&bot=6ud;xx&bottom=6ud;xu&bowtie=6vc;zi&boxDL=7dj;141&boxDR=7dg;13y&boxDl=7di;140&boxDr=7df;13x&boxH=7dc;13u&boxHD=7dy;14g&boxHU=7e1;14j&boxHd=7dw;14e&boxHu=7dz;14h&boxUL=7dp;147&boxUR=7dm;144&boxUl=7do;146&boxUr=7dl;143&boxV=7dd;13v&boxVH=7e4;14m&boxVL=7dv;14d&boxVR=7ds;14a&boxVh=7e3;14l&boxVl=7du;14c&boxVr=7dr;149&boxbox=895;1bw&boxdL=7dh;13z&boxdR=7de;13w&boxdl=7bk;13m&boxdr=7bg;13l&boxh=7b4;13j&boxhD=7dx;14f&boxhU=7e0;14i&boxhd=7cc;13r&boxhu=7ck;13s&boxminus=6u7;xi&boxplus=6u6;xg&boxtimes=6u8;xk&boxuL=7dn;145&boxuR=7dk;142&boxul=7bs;13o&boxur=7bo;13n&boxv=7b6;13k&boxvH=7e2;14k&boxvL=7dt;14b&boxvR=7dq;148&boxvh=7cs;13t&boxvl=7c4;13q&boxvr=7bw;13p&bprime=6d1;ej&breve=k8;83&brvbar=4m;1k&bscr=2kl3;1jv&bsemi=6dr;er&bsim=6rh;qd&bsime=6vh;zq&bsol=2k;x&bsolb=891;1bv&bsolhsub=7uw;16r&bull=6ci;e9&bullet=6ci;e8&bump=6ry;rp&bumpE=8fi;1gu&bumpe=6rz;ru&bumpeq=6rz;rt&cacute=7b;4p&cap=6qx;pa&capand=8ck;1dq&capbrcup=8cp;1dv&capcap=8cr;1dx&capcup=8cn;1dt&capdot=8cg;1dn&caps=6qx,1e68;p9&caret=6dd;eo&caron=jr;81&ccaps=8ct;1dz&ccaron=7h;4v&ccedil=6f;3s&ccirc=7d;4r&ccups=8cs;1dy&ccupssm=8cw;1e0&cdot=7f;4t&cedil=54;2f&cemptyv=88i;1bf&cent=4i;1g&centerdot=53;2c&cfr=2ko0;1l4&chcy=uf;ce&check=7pv;16j&checkmark=7pv;16i&chi=qv;9s&cir=7gr;15q&cirE=88z;1bt&circ=jq;7z&circeq=6s7;sc&circlearrowleft=6nu;k6&circlearrowright=6nv;k8&circledR=4u;1w&circledS=79k;13g&circledast=6u3;xc&circledcirc=6u2;xa&circleddash=6u5;xe&cire=6s7;sd&cirfnint=8b4;1cq&cirmid=8hb;1j0&cirscir=88y;1bs&clubs=7kz;168&clubsuit=7kz;167&colon=1m;j&colone=6s4;s7&coloneq=6s4;s5&comma=18;g&commat=1s;u&comp=6pt;mv&compfn=6qg;o7&complement=6pt;mu&complexes=6iq;f6&cong=6rp;qz&congdot=8dp;1ef&conint=6r2;pj&copf=2kpg;1md&coprod=6q8;nr&copy=4p;1r&copysr=6jb;fz&crarr=6np;k1&cross=7pz;16k&cscr=2kl4;1jw&csub=8gf;1id&csube=8gh;1if&csup=8gg;1ie&csupe=8gi;1ig&ctdot=6wf;11g&cudarrl=854;18x&cudarrr=851;18u&cuepr=6vy;10m&cuesc=6vz;10o&cularr=6nq;k3&cularrp=859;190&cup=6qy;pc&cupbrcap=8co;1du&cupcap=8cm;1ds&cupcup=8cq;1dw&cupdot=6tp;we&cupor=8cl;1dr&cups=6qy,1e68;pb&curarr=6nr;k5&curarrm=858;18z&curlyeqprec=6vy;10l&curlyeqsucc=6vz;10n&curlyvee=6vi;zr&curlywedge=6vj;zt&curren=4k;1i&curvearrowleft=6nq;k2&curvearrowright=6nr;k4&cuvee=6vi;zs&cuwed=6vj;zu&cwconint=6r6;pq&cwint=6r5;po&cylcty=6y5;12u&dArr=6oj;m2&dHar=86d;19t&dagger=6cg;e5&daleth=6k8;h7&darr=6mr;ia&dash=6c0;dl&dashv=6ub;xr&dbkarow=83z;180&dblac=kd;8b&dcaron=7j;4x&dcy=tw;bv&dd=6km;hb&ddagger=6ch;e6&ddarr=6oa;ld&ddotseq=8dz;1ep&deg=4w;21&delta=qc;95&demptyv=88h;1be&dfisht=873;1aj&dfr=2ko1;1l5&dharl=6o3;kx&dharr=6o2;ku&diam=6v8;zc&diamond=6v8;zb&diamondsuit=7l2;16b&diams=7l2;16c&die=4o;1o&digamma=rh;a6&disin=6wi;11j&div=6v;49&divide=6v;48&divideontimes=6vb;zg&divonx=6vb;zh&djcy=uq;co&dlcorn=6xq;12n&dlcrop=6x9;12a&dollar=10;6&dopf=2kph;1me&dot=k9;85&doteq=6s0;rx&doteqdot=6s1;rz&dotminus=6rc;q2&dotplus=6qc;ny&dotsquare=6u9;xm&doublebarwedge=6x2;11z&downarrow=6mr;i9&downdownarrows=6oa;lc&downharpoonleft=6o3;kv&downharpoonright=6o2;ks&drbkarow=840;182&drcorn=6xr;12p&drcrop=6x8;129&dscr=2kl5;1jx&dscy=ut;cr&dsol=8ae;1cc&dstrok=7l;4z&dtdot=6wh;11i&dtri=7gf;15j&dtrif=7ge;15h&duarr=6ph;mo&duhar=86n;1a5&dwangle=886;1b3&dzcy=v3;d0&dzigrarr=7wf;17r&eDDot=8dz;1eq&eDot=6s1;s0&eacute=6h;3u&easter=8dq;1eg&ecaron=7v;57&ecir=6s6;sb&ecirc=6i;3v&ecolon=6s5;s9&ecy=ul;ck&edot=7r;53&ee=6kn;he&efDot=6s2;s2&efr=2ko2;1l6&eg=8ey;1g9&egrave=6g;3t&egs=8eu;1g5&egsdot=8ew;1g7&el=8ex;1g8&elinters=73b;13e&ell=6j7;fv&els=8et;1g3&elsdot=8ev;1g6&emacr=7n;51&empty=6px;n7&emptyset=6px;n5&emptyv=6px;n6&emsp=6bn;d2&emsp13=6bo;d3&emsp14=6bp;d4&eng=97;6h&ensp=6bm;d1&eogon=7t;55&eopf=2kpi;1mf&epar=6vp;103&eparsl=89v;1c6&eplus=8dt;1ek&epsi=qd;97&epsilon=qd;96&epsiv=s5;ae&eqcirc=6s6;sa&eqcolon=6s5;s8&eqsim=6rm;qq&eqslantgtr=8eu;1g4&eqslantless=8et;1g2&equals=1p;p&equest=6sf;sj&equiv=6sh;so&equivDD=8e0;1er&eqvparsl=89x;1c8&erDot=6s3;s4&erarr=86p;1a7&escr=6jz;gs&esdot=6s0;ry&esim=6rm;qr&eta=qf;99&eth=6o;41&euml=6j;3w&euro=6gc;f2&excl=x;2&exist=6pv;n0&expectation=6k0;gt&exponentiale=6kn;hd&fallingdotseq=6s2;s1&fcy=uc;cb&female=7k0;163&ffilig=1dkz;1ja&fflig=1dkw;1j7&ffllig=1dl0;1jb&ffr=2ko3;1l7&filig=1dkx;1j8&fjlig=2u,2y;15&flat=7l9;16e&fllig=1dky;1j9&fltns=7g1;153&fnof=b6;7v&fopf=2kpj;1mg&forall=6ps;mt&fork=6vo;102&forkv=8gp;1in&fpartint=8b1;1cp&frac12=59;2k&frac13=6kz;hh&frac14=58;2j&frac15=6l1;hj&frac16=6l5;hn&frac18=6l7;hp&frac23=6l0;hi&frac25=6l2;hk&frac34=5a;2m&frac35=6l3;hl&frac38=6l8;hq&frac45=6l4;hm&frac56=6l6;ho&frac58=6l9;hr&frac78=6la;hs&frasl=6dg;eq&frown=6xu;12r&fscr=2kl7;1jy&gE=6sn;t8&gEl=8ek;1ft&gacute=dx;7x&gamma=qb;94&gammad=rh;a7&gap=8ee;1fh&gbreve=7z;5b&gcirc=7x;59&gcy=tv;bu&gdot=81;5d&ge=6sl;sx&gel=6vv;10k&geq=6sl;sw&geqq=6sn;t7&geqslant=8e6;1f6&ges=8e6;1f7&gescc=8fd;1gn&gesdot=8e8;1f9&gesdoto=8ea;1fb&gesdotol=8ec;1fd&gesl=6vv,1e68;10h&gesles=8es;1g1&gfr=2ko4;1l8&gg=6sr;ts&ggg=6vt;10b&gimel=6k7;h6&gjcy=ur;cp&gl=6t3;un&glE=8eq;1fz&gla=8f9;1gj&glj=8f8;1gi&gnE=6sp;tg&gnap=8ei;1fp&gnapprox=8ei;1fo&gne=8eg;1fl&gneq=8eg;1fk&gneqq=6sp;tf&gnsim=6w7;10y&gopf=2kpk;1mh&grave=2o;14&gscr=6iy;f9&gsim=6sz;ud&gsime=8em;1fv&gsiml=8eo;1fx&gt=1q;s&gtcc=8fb;1gl&gtcir=8e2;1et&gtdot=6vr;107&gtlPar=87p;1aw&gtquest=8e4;1ev&gtrapprox=8ee;1fg&gtrarr=86w;1ad&gtrdot=6vr;106&gtreqless=6vv;10j&gtreqqless=8ek;1fs&gtrless=6t3;um&gtrsim=6sz;uc&gvertneqq=6sp,1e68;td&gvnE=6sp,1e68;te&hArr=6ok;m5&hairsp=6bu;da&half=59;2l&hamilt=6iz;fb&hardcy=ui;ch&harr=6ms;id&harrcir=85k;192&harrw=6nh;js&hbar=6j3;fl&hcirc=85;5g&hearts=7l1;16a&heartsuit=7l1;169&hellip=6cm;eb&hercon=6ux;yr&hfr=2ko5;1l9&hksearow=84l;18i&hkswarow=84m;18k&hoarr=6pr;mr&homtht=6rf;q5&hookleftarrow=6nd;jj&hookrightarrow=6ne;jl&hopf=2kpl;1mi&horbar=6c5;do&hscr=2kl9;1jz&hslash=6j3;fi&hstrok=87;5i&hybull=6df;ep&hyphen=6c0;dk&iacute=6l;3y&ic=6eb;f1&icirc=6m;3z&icy=u0;bz&iecy=tx;bw&iexcl=4h;1f&iff=6ok;m6&ifr=2ko6;1la&igrave=6k;3x&ii=6ko;hg&iiiint=8b0;1cn&iiint=6r1;pg&iinfin=89o;1c3&iiota=6jt;gm&ijlig=8j;5t&imacr=8b;5m&image=6j5;fp&imagline=6j4;fm&imagpart=6j5;fo&imath=8h;5r&imof=6uv;yo&imped=c5;7w&in=6q0;nd&incare=6it;f8&infin=6qm;of&infintie=89p;1c4&inodot=8h;5q&int=6qz;pe&intcal=6uy;yt&integers=6jo;gh&intercal=6uy;ys&intlarhk=8bb;1cx&intprod=8cc;1dk&iocy=up;cn&iogon=8f;5o&iopf=2kpm;1mj&iota=qh;9b&iprod=8cc;1dl&iquest=5b;2n&iscr=2kla;1k0&isin=6q0;nc&isinE=6wp;11r&isindot=6wl;11n&isins=6wk;11l&isinsv=6wj;11k&isinv=6q0;nb&it=6ea;ez&itilde=89;5k&iukcy=uu;cs&iuml=6n;40&jcirc=8l;5v&jcy=u1;c0&jfr=2ko7;1lb&jmath=fr;7y&jopf=2kpn;1mk&jscr=2klb;1k1&jsercy=uw;cu&jukcy=us;cq&kappa=qi;9c&kappav=s0;a9&kcedil=8n;5x&kcy=u2;c1&kfr=2ko8;1lc&kgreen=8o;5y&khcy=ud;cc&kjcy=v0;cy&kopf=2kpo;1ml&kscr=2klc;1k2&lAarr=6oq;mf&lArr=6og;ls&lAtail=84b;18a&lBarr=83y;17z&lE=6sm;t2&lEg=8ej;1fr&lHar=86a;19q&lacute=8q;60&laemptyv=88k;1bh&lagran=6j6;ft&lambda=qj;9d&lang=7vs;16z&langd=87l;1as&langle=7vs;16y&lap=8ed;1ff&laquo=4r;1t&larr=6mo;hx&larrb=6p0;mk&larrbfs=84f;18e&larrfs=84d;18c&larrhk=6nd;jk&larrlp=6nf;jo&larrpl=855;18y&larrsim=86r;1a9&larrtl=6n6;j7&lat=8ff;1gp&latail=849;188&late=8fh;1gt&lates=8fh,1e68;1gs&lbarr=83w;17w&lbbrk=7si;16p&lbrace=3f;16&lbrack=2j;v&lbrke=87f;1am&lbrksld=87j;1aq&lbrkslu=87h;1ao&lcaron=8u;64&lcedil=8s;62&lceil=6x4;122&lcub=3f;17&lcy=u3;c2&ldca=852;18v&ldquo=6cc;dz&ldquor=6ce;e3&ldrdhar=86f;19v&ldrushar=85n;195&ldsh=6nm;jz&le=6sk;st&leftarrow=6mo;hv&leftarrowtail=6n6;j6&leftharpoondown=6nx;kd&leftharpoonup=6nw;ka&leftleftarrows=6o7;l6&leftrightarrow=6ms;ic&leftrightarrows=6o6;l4&leftrightharpoons=6ob;lf&leftrightsquigarrow=6nh;jr&leftthreetimes=6vf;zl&leg=6vu;10g&leq=6sk;ss&leqq=6sm;t1&leqslant=8e5;1f0&les=8e5;1f1&lescc=8fc;1gm&lesdot=8e7;1f8&lesdoto=8e9;1fa&lesdotor=8eb;1fc&lesg=6vu,1e68;10d&lesges=8er;1g0&lessapprox=8ed;1fe&lessdot=6vq;104&lesseqgtr=6vu;10f&lesseqqgtr=8ej;1fq&lessgtr=6t2;uj&lesssim=6sy;u9&lfisht=870;1ag&lfloor=6x6;126&lfr=2ko9;1ld&lg=6t2;uk&lgE=8ep;1fy&lhard=6nx;kf&lharu=6nw;kc&lharul=86i;19y&lhblk=7es;14o&ljcy=ux;cv&ll=6sq;tm&llarr=6o7;l7&llcorner=6xq;12m&llhard=86j;19z&lltri=7i2;15w&lmidot=8w;66&lmoust=71s;131&lmoustache=71s;130&lnE=6so;tc&lnap=8eh;1fn&lnapprox=8eh;1fm&lne=8ef;1fj&lneq=8ef;1fi&lneqq=6so;tb&lnsim=6w6;10x&loang=7vw;175&loarr=6pp;mp&lobrk=7vq;16u&longleftarrow=7w5;178&longleftrightarrow=7w7;17e&longmapsto=7wc;17p&longrightarrow=7w6;17b&looparrowleft=6nf;jn&looparrowright=6ng;jp&lopar=879;1ak&lopf=2kpp;1mm&loplus=8bx;1d6&lotimes=8c4;1dc&lowast=6qf;o5&lowbar=2n;12&loz=7gq;15p&lozenge=7gq;15o&lozf=8a3;1ca&lpar=14;b&lparlt=87n;1au&lrarr=6o6;l5&lrcorner=6xr;12o&lrhar=6ob;lg&lrhard=86l;1a1&lrm=6by;di&lrtri=6v3;yx&lsaquo=6d5;ek&lscr=2kld;1k3&lsh=6nk;jw&lsim=6sy;ua&lsime=8el;1fu&lsimg=8en;1fw&lsqb=2j;w&lsquo=6c8;ds&lsquor=6ca;dw&lstrok=8y;68&lt=1o;n&ltcc=8fa;1gk&ltcir=8e1;1es&ltdot=6vq;105&lthree=6vf;zm&ltimes=6vd;zj&ltlarr=86u;1ac&ltquest=8e3;1eu&ltrPar=87q;1ax&ltri=7gj;15n&ltrie=6us;yi&ltrif=7gi;15l&lurdshar=85m;194&luruhar=86e;19u&lvertneqq=6so,1e68;t9&lvnE=6so,1e68;ta&mDDot=6re;q4&macr=4v;20&male=7k2;164&malt=7q8;16m&maltese=7q8;16l&map=6na;jg&mapsto=6na;jf&mapstodown=6nb;ji&mapstoleft=6n8;jb&mapstoup=6n9;jd&marker=7fy;152&mcomma=8bt;1d4&mcy=u4;c3&mdash=6c4;dn&measuredangle=6qp;ok&mfr=2koa;1le&mho=6jr;gj&micro=51;29&mid=6qr;oq&midast=16;d&midcir=8hc;1j1&middot=53;2d&minus=6qa;nu&minusb=6u7;xj&minusd=6rc;q3&minusdu=8bu;1d5&mlcp=8gr;1ip&mldr=6cm;ec&mnplus=6qb;nw&models=6uf;xy&mopf=2kpq;1mn&mp=6qb;nx&mscr=2kle;1k4&mstpos=6ri;qf&mu=qk;9e&multimap=6uw;yp&mumap=6uw;yq&nGg=6vt,mw;10a&nGt=6sr,6he;tp&nGtv=6sr,mw;to&nLeftarrow=6od;lk&nLeftrightarrow=6oe;lm&nLl=6vs,mw;108&nLt=6sq,6he;tj&nLtv=6sq,mw;ti&nRightarrow=6of;lo&nVDash=6un;y7&nVdash=6um;y6&nabla=6pz;n8&nacute=90;6a&nang=6qo,6he;oh&nap=6rt;rb&napE=8ds,mw;1ei&napid=6rv,mw;re&napos=95;6f&napprox=6rt;ra&natur=7la;16g&natural=7la;16f&naturals=6j9;fw&nbsp=4g;1e&nbump=6ry,mw;rm&nbumpe=6rz,mw;rr&ncap=8cj;1dp&ncaron=94;6e&ncedil=92;6c&ncong=6rr;r2&ncongdot=8dp,mw;1ee&ncup=8ci;1do&ncy=u5;c4&ndash=6c3;dm&ne=6sg;sl&neArr=6on;mb&nearhk=84k;18h&nearr=6mv;im&nearrow=6mv;il&nedot=6s0,mw;rv&nequiv=6si;sq&nesear=84o;18n&nesim=6rm,mw;qo&nexist=6pw;n3&nexists=6pw;n2&nfr=2kob;1lf&ngE=6sn,mw;t4&nge=6sx;u7&ngeq=6sx;u6&ngeqq=6sn,mw;t5&ngeqslant=8e6,mw;1f3&nges=8e6,mw;1f4&ngsim=6t1;uh&ngt=6sv;u1&ngtr=6sv;u0&nhArr=6oe;ln&nharr=6ni;ju&nhpar=8he;1j3&ni=6q3;nk&nis=6ws;11u&nisd=6wq;11s&niv=6q3;nj&njcy=uy;cw&nlArr=6od;ll&nlE=6sm,mw;sy&nlarr=6my;iu&nldr=6cl;ea&nle=6sw;u4&nleftarrow=6my;it&nleftrightarrow=6ni;jt&nleq=6sw;u3&nleqq=6sm,mw;sz&nleqslant=8e5,mw;1ex&nles=8e5,mw;1ey&nless=6su;tx&nlsim=6t0;uf&nlt=6su;ty&nltri=6wa;115&nltrie=6wc;11b&nmid=6qs;ou&nopf=2kpr;1mo&not=4s;1u&notin=6q1;ng&notinE=6wp,mw;11q&notindot=6wl,mw;11m&notinva=6q1;nf&notinvb=6wn;11p&notinvc=6wm;11o&notni=6q4;nn&notniva=6q4;nm&notnivb=6wu;11w&notnivc=6wt;11v&npar=6qu;p4&nparallel=6qu;p2&nparsl=8hp,6hx;1j5&npart=6pu,mw;mw&npolint=8b8;1cu&npr=6tc;vd&nprcue=6w0;10q&npre=8fj,mw;1gw&nprec=6tc;vc&npreceq=8fj,mw;1gx&nrArr=6of;lp&nrarr=6mz;iw&nrarrc=84z,mw;18s&nrarrw=6n1,mw;ix&nrightarrow=6mz;iv&nrtri=6wb;118&nrtrie=6wd;11e&nsc=6td;vg&nsccue=6w1;10s&nsce=8fk,mw;1h2&nscr=2klf;1k5&nshortmid=6qs;os&nshortparallel=6qu;p1&nsim=6rl;qm&nsime=6ro;qx&nsimeq=6ro;qw&nsmid=6qs;ot&nspar=6qu;p3&nsqsube=6w2;10u&nsqsupe=6w3;10w&nsub=6tg;vs&nsubE=8g5,mw;1hv&nsube=6tk;w2&nsubset=6te,6he;vi&nsubseteq=6tk;w1&nsubseteqq=8g5,mw;1hw&nsucc=6td;vf&nsucceq=8fk,mw;1h3&nsup=6th;vt&nsupE=8g6,mw;1hz&nsupe=6tl;w5&nsupset=6tf,6he;vn&nsupseteq=6tl;w4&nsupseteqq=8g6,mw;1i0&ntgl=6t5;ur&ntilde=6p;42&ntlg=6t4;up&ntriangleleft=6wa;114&ntrianglelefteq=6wc;11a&ntriangleright=6wb;117&ntrianglerighteq=6wd;11d&nu=ql;9f&num=z;5&numero=6ja;fy&numsp=6br;d5&nvDash=6ul;y5&nvHarr=83o;17u&nvap=6rx,6he;ri&nvdash=6uk;y4&nvge=6sl,6he;su&nvgt=1q,6he;q&nvinfin=89q;1c5&nvlArr=83m;17s&nvle=6sk,6he;sr&nvlt=1o,6he;l&nvltrie=6us,6he;yf&nvrArr=83n;17t&nvrtrie=6ut,6he;yj&nvsim=6rg,6he;q6&nwArr=6om;ma&nwarhk=84j;18g&nwarr=6mu;ij&nwarrow=6mu;ii&nwnear=84n;18m&oS=79k;13h&oacute=6r;44&oast=6u3;xd&ocir=6u2;xb&ocirc=6s;45&ocy=u6;c5&odash=6u5;xf&odblac=9d;6l&odiv=8c8;1dg&odot=6u1;x9&odsold=88s;1bn&oelig=9f;6n&ofcir=88v;1bp&ofr=2koc;1lg&ogon=kb;87&ograve=6q;43&ogt=88x;1br&ohbar=88l;1bi&ohm=q1;91&oint=6r2;pk&olarr=6nu;k7&olcir=88u;1bo&olcross=88r;1bm&oline=6da;en&olt=88w;1bq&omacr=99;6j&omega=qx;9u&omicron=qn;9h&omid=88m;1bj&ominus=6ty;x4&oopf=2kps;1mp&opar=88n;1bk&operp=88p;1bl&oplus=6tx;x2&or=6qw;p8&orarr=6nv;k9&ord=8d9;1ea&order=6k4;h1&orderof=6k4;h0&ordf=4q;1s&ordm=56;2h&origof=6uu;yn&oror=8d2;1e4&orslope=8d3;1e5&orv=8d7;1e8&oscr=6k4;h2&oslash=6w;4a&osol=6u0;x7&otilde=6t;46&otimes=6tz;x6&otimesas=8c6;1de&ouml=6u;47&ovbar=6yl;12x&par=6qt;oz&para=52;2a&parallel=6qt;ox&parsim=8hf;1j4&parsl=8hp;1j6&part=6pu;my&pcy=u7;c6&percnt=11;7&period=1a;h&permil=6cw;ed&perp=6ud;xw&pertenk=6cx;ee&pfr=2kod;1lh&phi=qu;9r&phiv=r9;a2&phmmat=6k3;gy&phone=7im;162&pi=qo;9i&pitchfork=6vo;101&piv=ra;a4&planck=6j3;fj&planckh=6j2;fh&plankv=6j3;fk&plus=17;f&plusacir=8bn;1cz&plusb=6u6;xh&pluscir=8bm;1cy&plusdo=6qc;nz&plusdu=8bp;1d1&pluse=8du;1el&plusmn=4x;23&plussim=8bq;1d2&plustwo=8br;1d3&pm=4x;24&pointint=8b9;1cv&popf=2kpt;1mq&pound=4j;1h&pr=6t6;uu&prE=8fn;1h7&prap=8fr;1he&prcue=6t8;v0&pre=8fj;1h0&prec=6t6;ut&precapprox=8fr;1hd&preccurlyeq=6t8;uz&preceq=8fj;1gz&precnapprox=8ft;1hh&precneqq=8fp;1h9&precnsim=6w8;10z&precsim=6ta;v5&prime=6cy;ef&primes=6jd;g2&prnE=8fp;1ha&prnap=8ft;1hi&prnsim=6w8;110&prod=6q7;np&profalar=6y6;12v&profline=6xe;12e&profsurf=6xf;12f&prop=6ql;oe&propto=6ql;oc&prsim=6ta;v6&prurel=6uo;y8&pscr=2klh;1k6&psi=qw;9t&puncsp=6bs;d6&qfr=2koe;1li&qint=8b0;1co&qopf=2kpu;1mr&qprime=6dz;es&qscr=2kli;1k7&quaternions=6j1;ff&quatint=8ba;1cw&quest=1r;t&questeq=6sf;si&quot=y;4&rAarr=6or;mh&rArr=6oi;lz&rAtail=84c;18b&rBarr=83z;181&rHar=86c;19s&race=6rh,mp;qb&racute=9h;6p&radic=6qi;o8&raemptyv=88j;1bg&rang=7vt;172&rangd=87m;1at&range=885;1b2&rangle=7vt;171&raquo=57;2i&rarr=6mq;i6&rarrap=86t;1ab&rarrb=6p1;mm&rarrbfs=84g;18f&rarrc=84z;18t&rarrfs=84e;18d&rarrhk=6ne;jm&rarrlp=6ng;jq&rarrpl=85h;191&rarrsim=86s;1aa&rarrtl=6n7;j9&rarrw=6n1;iz&ratail=84a;189&ratio=6ra;pz&rationals=6je;g4&rbarr=83x;17y&rbbrk=7sj;16q&rbrace=3h;1b&rbrack=2l;y&rbrke=87g;1an&rbrksld=87i;1ap&rbrkslu=87k;1ar&rcaron=9l;6t&rcedil=9j;6r&rceil=6x5;124&rcub=3h;1c&rcy=u8;c7&rdca=853;18w&rdldhar=86h;19x&rdquo=6cd;e2&rdquor=6cd;e1&rdsh=6nn;k0&real=6jg;g9&realine=6jf;g6&realpart=6jg;g8&reals=6jh;gc&rect=7fx;151&reg=4u;1y&rfisht=871;1ah&rfloor=6x7;128&rfr=2kof;1lj&rhard=6o1;kr&rharu=6o0;ko&rharul=86k;1a0&rho=qp;9j&rhov=s1;ab&rightarrow=6mq;i4&rightarrowtail=6n7;j8&rightharpoondown=6o1;kp&rightharpoonup=6o0;km&rightleftarrows=6o4;kz&rightleftharpoons=6oc;lh&rightrightarrows=6o9;la&rightsquigarrow=6n1;iy&rightthreetimes=6vg;zn&ring=ka;86&risingdotseq=6s3;s3&rlarr=6o4;l0&rlhar=6oc;lj&rlm=6bz;dj&rmoust=71t;133&rmoustache=71t;132&rnmid=8ha;1iz&roang=7vx;176&roarr=6pq;mq&robrk=7vr;16w&ropar=87a;1al&ropf=2kpv;1ms&roplus=8by;1d7&rotimes=8c5;1dd&rpar=15;c&rpargt=87o;1av&rppolint=8b6;1cs&rrarr=6o9;lb&rsaquo=6d6;el&rscr=2klj;1k8&rsh=6nl;jy&rsqb=2l;z&rsquo=6c9;dv&rsquor=6c9;du&rthree=6vg;zo&rtimes=6ve;zk&rtri=7g9;15d&rtrie=6ut;ym&rtrif=7g8;15b&rtriltri=89a;1by&ruluhar=86g;19w&rx=6ji;ge&sacute=9n;6v&sbquo=6ca;dx&sc=6t7;ux&scE=8fo;1h8&scap=8fs;1hg&scaron=9t;71&sccue=6t9;v3&sce=8fk;1h6&scedil=9r;6z&scirc=9p;6x&scnE=8fq;1hc&scnap=8fu;1hk&scnsim=6w9;112&scpolint=8b7;1ct&scsim=6tb;va&scy=u9;c8&sdot=6v9;zd&sdotb=6u9;xn&sdote=8di;1ec&seArr=6oo;mc&searhk=84l;18j&searr=6mw;ip&searrow=6mw;io&sect=4n;1l&semi=1n;k&seswar=84p;18p&setminus=6qe;o2&setmn=6qe;o4&sext=7qu;16n&sfr=2kog;1lk&sfrown=6xu;12q&sharp=7lb;16h&shchcy=uh;cg&shcy=ug;cf&shortmid=6qr;oo&shortparallel=6qt;ow&shy=4t;1v&sigma=qr;9n&sigmaf=qq;9l&sigmav=qq;9m&sim=6rg;qa&simdot=8dm;1ed&sime=6rn;qu&simeq=6rn;qt&simg=8f2;1gb&simgE=8f4;1gd&siml=8f1;1ga&simlE=8f3;1gc&simne=6rq;r0&simplus=8bo;1d0&simrarr=86q;1a8&slarr=6mo;hw&smallsetminus=6qe;o0&smashp=8c3;1db&smeparsl=89w;1c7&smid=6qr;op&smile=6xv;12t&smt=8fe;1go&smte=8fg;1gr&smtes=8fg,1e68;1gq&softcy=uk;cj&sol=1b;i&solb=890;1bu&solbar=6yn;12y&sopf=2kpw;1mt&spades=7kw;166&spadesuit=7kw;165&spar=6qt;oy&sqcap=6tv;wx&sqcaps=6tv,1e68;wv&sqcup=6tw;x0&sqcups=6tw,1e68;wy&sqsub=6tr;wk&sqsube=6tt;wr&sqsubset=6tr;wj&sqsubseteq=6tt;wq&sqsup=6ts;wo&sqsupe=6tu;wu&sqsupset=6ts;wn&sqsupseteq=6tu;wt&squ=7fl;14v&square=7fl;14u&squarf=7fu;14y&squf=7fu;14z&srarr=6mq;i5&sscr=2klk;1k9&ssetmn=6qe;o3&ssmile=6xv;12s&sstarf=6va;ze&star=7ie;161&starf=7id;160&straightepsilon=s5;ac&straightphi=r9;a0&strns=4v;1z&sub=6te;vl&subE=8g5;1hy&subdot=8fx;1hn&sube=6ti;vw&subedot=8g3;1ht&submult=8g1;1hr&subnE=8gb;1i8&subne=6tm;w9&subplus=8fz;1hp&subrarr=86x;1ae&subset=6te;vk&subseteq=6ti;vv&subseteqq=8g5;1hx&subsetneq=6tm;w8&subsetneqq=8gb;1i7&subsim=8g7;1i3&subsub=8gl;1ij&subsup=8gj;1ih&succ=6t7;uw&succapprox=8fs;1hf&succcurlyeq=6t9;v2&succeq=8fk;1h5&succnapprox=8fu;1hj&succneqq=8fq;1hb&succnsim=6w9;111&succsim=6tb;v9&sum=6q9;nt&sung=7l6;16d&sup=6tf;vr&sup1=55;2g&sup2=4y;25&sup3=4z;26&supE=8g6;1i2&supdot=8fy;1ho&supdsub=8go;1im&supe=6tj;vz&supedot=8g4;1hu&suphsol=7ux;16s&suphsub=8gn;1il&suplarr=86z;1af&supmult=8g2;1hs&supnE=8gc;1ic&supne=6tn;wd&supplus=8g0;1hq&supset=6tf;vq&supseteq=6tj;vy&supseteqq=8g6;1i1&supsetneq=6tn;wc&supsetneqq=8gc;1ib&supsim=8g8;1i4&supsub=8gk;1ii&supsup=8gm;1ik&swArr=6op;md&swarhk=84m;18l&swarr=6mx;is&swarrow=6mx;ir&swnwar=84q;18r&szlig=67;3k&target=6xi;12h&tau=qs;9o&tbrk=71w;135&tcaron=9x;75&tcedil=9v;73&tcy=ua;c9&tdot=6hn;f4&telrec=6xh;12g&tfr=2koh;1ll&there4=6r8;pv&therefore=6r8;pu&theta=qg;9a&thetasym=r5;9v&thetav=r5;9x&thickapprox=6rs;r3&thicksim=6rg;q7&thinsp=6bt;d8&thkap=6rs;r7&thksim=6rg;q8&thorn=72;4g&tilde=kc;89&times=5z;3c&timesb=6u8;xl&timesbar=8c1;1da&timesd=8c0;1d9&tint=6r1;ph&toea=84o;18o&top=6uc;xt&topbot=6ye;12w&topcir=8hd;1j2&topf=2kpx;1mu&topfork=8gq;1io&tosa=84p;18q&tprime=6d0;eh&trade=6jm;gg&triangle=7g5;158&triangledown=7gf;15i&triangleleft=7gj;15m&trianglelefteq=6us;yh&triangleq=6sc;sg&triangleright=7g9;15c&trianglerighteq=6ut;yl&tridot=7ho;15r&trie=6sc;sh&triminus=8ca;1di&triplus=8c9;1dh&trisb=899;1bx&tritime=8cb;1dj&trpezium=736;13d&tscr=2kll;1ka&tscy=ue;cd&tshcy=uz;cx&tstrok=9z;77&twixt=6ss;tu&twoheadleftarrow=6n2;j0&twoheadrightarrow=6n4;j3&uArr=6oh;lv&uHar=86b;19r&uacute=6y;4c&uarr=6mp;i1&ubrcy=v2;cz&ubreve=a5;7d&ucirc=6z;4d&ucy=ub;ca&udarr=6o5;l2&udblac=a9;7h&udhar=86m;1a3&ufisht=872;1ai&ufr=2koi;1lm&ugrave=6x;4b&uharl=6nz;kl&uharr=6ny;ki&uhblk=7eo;14n&ulcorn=6xo;12j&ulcorner=6xo;12i&ulcrop=6xb;12c&ultri=7i0;15u&umacr=a3;7b&uml=4o;1p&uogon=ab;7j&uopf=2kpy;1mv&uparrow=6mp;i0&updownarrow=6mt;if&upharpoonleft=6nz;kj&upharpoonright=6ny;kg&uplus=6tq;wg&upsi=qt;9q&upsih=r6;9y&upsilon=qt;9p&upuparrows=6o8;l8&urcorn=6xp;12l&urcorner=6xp;12k&urcrop=6xa;12b&uring=a7;7f&urtri=7i1;15v&uscr=2klm;1kb&utdot=6wg;11h&utilde=a1;79&utri=7g5;159&utrif=7g4;157&uuarr=6o8;l9&uuml=70;4e&uwangle=887;1b4&vArr=6ol;m9&vBar=8h4;1iu&vBarv=8h5;1iv&vDash=6ug;y0&vangrt=87w;1az&varepsilon=s5;ad&varkappa=s0;a8&varnothing=6px;n4&varphi=r9;a1&varpi=ra;a3&varpropto=6ql;ob&varr=6mt;ig&varrho=s1;aa&varsigma=qq;9k&varsubsetneq=6tm,1e68;w6&varsubsetneqq=8gb,1e68;1i5&varsupsetneq=6tn,1e68;wa&varsupsetneqq=8gc,1e68;1i9&vartheta=r5;9w&vartriangleleft=6uq;y9&vartriangleright=6ur;yc&vcy=tu;bt&vdash=6ua;xp&vee=6qw;p7&veebar=6uz;yu&veeeq=6sa;sf&vellip=6we;11f&verbar=3g;19&vert=3g;1a&vfr=2koj;1ln&vltri=6uq;yb&vnsub=6te,6he;vj&vnsup=6tf,6he;vo&vopf=2kpz;1mw&vprop=6ql;od&vrtri=6ur;ye&vscr=2kln;1kc&vsubnE=8gb,1e68;1i6&vsubne=6tm,1e68;w7&vsupnE=8gc,1e68;1ia&vsupne=6tn,1e68;wb&vzigzag=87u;1ay&wcirc=ad;7l&wedbar=8db;1eb&wedge=6qv;p5&wedgeq=6s9;se&weierp=6jc;g0&wfr=2kok;1lo&wopf=2kq0;1mx&wp=6jc;g1&wr=6rk;qk&wreath=6rk;qj&wscr=2klo;1kd&xcap=6v6;z6&xcirc=7hr;15t&xcup=6v7;z9&xdtri=7gd;15f&xfr=2kol;1lp&xhArr=7wa;17o&xharr=7w7;17f&xi=qm;9g&xlArr=7w8;17i&xlarr=7w5;179&xmap=7wc;17q&xnis=6wr;11t&xodot=8ao;1ce&xopf=2kq1;1my&xoplus=8ap;1cg&xotime=8aq;1ci&xrArr=7w9;17l&xrarr=7w6;17c&xscr=2klp;1ke&xsqcup=8au;1cm&xuplus=8as;1ck&xutri=7g3;155&xvee=6v5;z2&xwedge=6v4;yz&yacute=71;4f&yacy=un;cm&ycirc=af;7n&ycy=uj;ci&yen=4l;1j&yfr=2kom;1lq&yicy=uv;ct&yopf=2kq2;1mz&yscr=2klq;1kf&yucy=um;cl&yuml=73;4h&zacute=ai;7q&zcaron=am;7u&zcy=tz;by&zdot=ak;7s&zeetrf=6js;gk&zeta=qe;98&zfr=2kon;1lr&zhcy=ty;bx&zigrarr=6ot;mi&zopf=2kq3;1n0&zscr=2klr;1kg&zwj=6bx;dh&zwnj=6bw;dg&'

const multipoints = new Map<string, string>()

class EscapeMode {
  readonly nameKeys: string[]
  readonly codeVals: number[]
  readonly codeKeys: number[]
  readonly nameVals: string[]

  constructor(pointsData: string, size: number) {
    this.nameKeys = new Array(size)
    this.codeVals = new Array(size)
    this.codeKeys = new Array(size)
    this.nameVals = new Array(size)
    let i = 0
    for (const entry of pointsData.split('&')) {
      if (entry.length === 0) continue
      // NotNestedLessLess=10913,824;1887&
      const eq = entry.indexOf('=')
      const name = entry.substring(0, eq)
      const rest = entry.substring(eq + 1)
      const m = /^([0-9a-z]+)(?:,([0-9a-z]+))?;([0-9a-z]+)$/.exec(rest) as RegExpExecArray
      const cp1 = parseInt(m[1] as string, 36)
      const cp2 = m[2] !== undefined ? parseInt(m[2], 36) : -1
      const index = parseInt(m[3] as string, 36)
      this.nameKeys[i] = name
      this.codeVals[i] = cp1
      this.codeKeys[index] = cp1
      this.nameVals[index] = name
      if (cp2 !== -1) multipoints.set(name, String.fromCodePoint(cp1, cp2))
      i++
    }
    if (i !== size) throw new IllegalArgumentException('Unexpected count of entities loaded')
  }

  codepointForName(name: string): number {
    const index = binarySearchStrings(this.nameKeys, name)
    return index >= 0 ? (this.codeVals[index] as number) : -1
  }

  nameForCodepoint(codepoint: number): string {
    const index = binarySearchInts(this.codeKeys, codepoint)
    if (index >= 0) {
      return index < this.nameVals.length - 1 && this.codeKeys[index + 1] === codepoint ? (this.nameVals[index + 1] as string) : (this.nameVals[index] as string)
    }
    return ''
  }
}

const Entities = (() => {
  const base = new EscapeMode(basePoints, 106)
  const extended = new EscapeMode(fullPoints, 2125)
  // sort the base names by length, for prefix matching (tri stable, comme List.sort)
  const baseSorted = [...base.nameKeys].sort((a, b) => b.length - a.length)
  return {
    base,
    extended,
    isNamedEntity(name: string): boolean {
      return extended.codepointForName(name) !== -1
    },
    isBaseNamedEntity(name: string): boolean {
      return base.codepointForName(name) !== -1
    },
    codepointsForName(name: string, codepoints: number[]): number {
      const val = multipoints.get(name)
      if (val !== undefined) {
        codepoints[0] = val.codePointAt(0) as number
        codepoints[1] = val.codePointAt(1) as number
        return 2
      }
      const codepoint = extended.codepointForName(name)
      if (codepoint !== -1) {
        codepoints[0] = codepoint
        return 1
      }
      return 0
    },
    findPrefix(input: string): string {
      for (const name of baseSorted) if (input.startsWith(name)) return name
      return ''
    },
  }
})()
void xmlPoints

type StateName =
  | 'Data'
  | 'CharacterReferenceInData'
  | 'Rcdata'
  | 'CharacterReferenceInRcdata'
  | 'Rawtext'
  | 'ScriptData'
  | 'PLAINTEXT'
  | 'TagOpen'
  | 'EndTagOpen'
  | 'TagName'
  | 'RcdataLessthanSign'
  | 'RCDATAEndTagOpen'
  | 'RCDATAEndTagName'
  | 'RawtextLessthanSign'
  | 'RawtextEndTagOpen'
  | 'RawtextEndTagName'
  | 'ScriptDataLessthanSign'
  | 'ScriptDataEndTagOpen'
  | 'ScriptDataEndTagName'
  | 'ScriptDataEscapeStart'
  | 'ScriptDataEscapeStartDash'
  | 'ScriptDataEscaped'
  | 'ScriptDataEscapedDash'
  | 'ScriptDataEscapedDashDash'
  | 'ScriptDataEscapedLessthanSign'
  | 'ScriptDataEscapedEndTagOpen'
  | 'ScriptDataEscapedEndTagName'
  | 'ScriptDataDoubleEscapeStart'
  | 'ScriptDataDoubleEscaped'
  | 'ScriptDataDoubleEscapedDash'
  | 'ScriptDataDoubleEscapedDashDash'
  | 'ScriptDataDoubleEscapedLessthanSign'
  | 'ScriptDataDoubleEscapeEnd'
  | 'BeforeAttributeName'
  | 'AttributeName'
  | 'AfterAttributeName'
  | 'BeforeAttributeValue'
  | 'AttributeValue_doubleQuoted'
  | 'AttributeValue_singleQuoted'
  | 'AttributeValue_unquoted'
  | 'AfterAttributeValue_quoted'
  | 'SelfClosingStartTag'
  | 'BogusComment'
  | 'MarkupDeclarationOpen'
  | 'MarkupProcessingOpen'
  | 'CommentStart'
  | 'CommentStartDash'
  | 'Comment'
  | 'CommentEndDash'
  | 'CommentEnd'
  | 'CommentEndBang'
  | 'Doctype'
  | 'BeforeDoctypeName'
  | 'DoctypeName'
  | 'AfterDoctypeName'
  | 'AfterDoctypePublicKeyword'
  | 'BeforeDoctypePublicIdentifier'
  | 'DoctypePublicIdentifier_doubleQuoted'
  | 'DoctypePublicIdentifier_singleQuoted'
  | 'AfterDoctypePublicIdentifier'
  | 'BetweenDoctypePublicAndSystemIdentifiers'
  | 'AfterDoctypeSystemKeyword'
  | 'BeforeDoctypeSystemIdentifier'
  | 'DoctypeSystemIdentifier_doubleQuoted'
  | 'DoctypeSystemIdentifier_singleQuoted'
  | 'AfterDoctypeSystemIdentifier'
  | 'BogusDoctype'
  | 'DoctypeInternalSubset'
  | 'CdataSection'
const S = {} as Record<StateName, State>

S.Data = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            switch (r.current()) {
                case '&':
                    t.advanceTransition(S.CharacterReferenceInData);
                    break;
                case '<':
                    t.advanceTransition(S.TagOpen);
                    break;
                case nullChar:
                    t.error(this); // NOT replacement character (oddly?)
                    t.emit(r.consume());
                    break;
                case eof:
                    t.emit(new EOFToken());
                    break;
                default:
                    const data = r.consumeData();
                    t.emit(data);
                    break;
            }
        }
})('Data')

S.CharacterReferenceInData = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            readCharRef(t, S.Data);
        }
})('CharacterReferenceInData')

S.Rcdata = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            switch (r.current()) {
                case '&':
                    t.advanceTransition(S.CharacterReferenceInRcdata);
                    break;
                case '<':
                    t.advanceTransition(S.RcdataLessthanSign);
                    break;
                case nullChar:
                    t.error(this);
                    r.advance();
                    t.emit(replacementChar);
                    break;
                case eof:
                    t.emit(new EOFToken());
                    break;
                default:
                    const data = r.consumeData();
                    t.emit(data);
                    break;
            }
        }
})('Rcdata')

S.CharacterReferenceInRcdata = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            readCharRef(t, S.Rcdata);
        }
})('CharacterReferenceInRcdata')

S.Rawtext = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            readRawData(t, r, this, S.RawtextLessthanSign);
        }
})('Rawtext')

S.ScriptData = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            readRawData(t, r, this, S.ScriptDataLessthanSign);
        }
})('ScriptData')

S.PLAINTEXT = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            switch (r.current()) {
                case nullChar:
                    t.error(this);
                    r.advance();
                    t.emit(replacementChar);
                    break;
                case eof:
                    t.emit(new EOFToken());
                    break;
                default:
                    const data = r.consumeTo(nullChar);
                    t.emit(data);
                    break;
            }
        }
})('PLAINTEXT')

S.TagOpen = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            switch (r.current()) {
                case '!':
                    t.advanceTransition(S.MarkupDeclarationOpen);
                    break;
                case '/':
                    t.advanceTransition(S.EndTagOpen);
                    break;
                case '?':
                    if (t.syntax === 'xml') {
                        t.advanceTransition(S.MarkupProcessingOpen);
                    } else {
                        t.createBogusCommentPending();
                        t.transition(S.BogusComment);
                    }
                    break;
                default:
                    if (r.matchesAsciiAlpha()) {
                        t.createTagPending(true);
                        t.transition(S.TagName);
                    } else {
                        t.error(this);
                        t.emit('<'); // char that got us here
                        t.transition(S.Data);
                    }
                    break;
            }
        }
})('TagOpen')

S.EndTagOpen = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.isEmpty()) {
                t.eofError(this);
                t.emit("</");
                t.transition(S.Data);
            } else if (r.matchesAsciiAlpha()) {
                t.createTagPending(false);
                t.transition(S.TagName);
            } else if (r.matches('>')) {
                t.error(this);
                t.advanceTransition(S.Data);
            } else {
                t.error(this);
                t.createBogusCommentPending();
                t.commentPending.append('/'); // push the / back on that got us here
                t.transition(S.BogusComment);
            }
        }
})('EndTagOpen')

S.TagName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const tagName = r.consumeTagName();
            t.tagPending.appendTagName(tagName);
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.BeforeAttributeName);
                    break;
                case '/':
                    t.transition(S.SelfClosingStartTag);
                    break;
                case '>':
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                case nullChar: // replacement
                    t.tagPending.appendTagName(replacementStr);
                    break;
                case eof: // should emit pending tag?
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                default: // buffer underrun
                    t.tagPending.appendTagName(c);
            }
        }
})('TagName')

S.RcdataLessthanSign = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matches('/')) {
                t.createTempBuffer();
                t.advanceTransition(S.RCDATAEndTagOpen);
            } else if (r.readFully() && r.matchesAsciiAlpha() && t.appropriateEndTagName() !== null &&  !r.containsIgnoreCase(t.appropriateEndTagSeq())) {
                t.tagPending = t.createTagPending(false).name(t.appropriateEndTagName() as string);
                t.emitTagPending();
                t.transition(S.TagOpen); // straight into S.TagOpen, as we came from < and looks like we're on a start tag
            } else {
                t.emit('<');
                t.transition(S.Rcdata);
            }
        }
})('RcdataLessthanSign')

S.RCDATAEndTagOpen = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matchesAsciiAlpha()) {
                t.createTagPending(false);
                t.tagPending.appendTagName(r.current());
                t.dataBuffer.append(r.current());
                t.advanceTransition(S.RCDATAEndTagName);
            } else {
                t.emit("</");
                t.transition(S.Rcdata);
            }
        }
})('RCDATAEndTagOpen')

S.RCDATAEndTagName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matchesAsciiAlpha()) {
                const name = r.consumeTagName();
                t.tagPending.appendTagName(name);
                t.dataBuffer.append(name);
                return;
            }
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    if (t.isAppropriateEndTagToken())
                        t.transition(S.BeforeAttributeName);
                    else
                        this.anythingElse(t, r);
                    break;
                case '/':
                    if (t.isAppropriateEndTagToken())
                        t.transition(S.SelfClosingStartTag);
                    else
                        this.anythingElse(t, r);
                    break;
                case '>':
                    if (t.isAppropriateEndTagToken()) {
                        t.emitTagPending();
                        t.transition(S.Data);
                    }
                    else
                        this.anythingElse(t, r);
                    break;
                default:
                    this.anythingElse(t, r);
            }
        }
        anythingElse(t: Tokeniser, r: CharacterReader): void {
            t.emit("</");
            t.emit(t.dataBuffer.value());
            r.unconsume();
            t.transition(S.Rcdata);
        }
})('RCDATAEndTagName')

S.RawtextLessthanSign = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matches('/')) {
                t.createTempBuffer();
                t.advanceTransition(S.RawtextEndTagOpen);
            } else {
                t.emit('<');
                t.transition(S.Rawtext);
            }
        }
})('RawtextLessthanSign')

S.RawtextEndTagOpen = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            readEndTag(t, r, S.RawtextEndTagName, S.Rawtext);
        }
})('RawtextEndTagOpen')

S.RawtextEndTagName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            handleDataEndTag(t, r, S.Rawtext);
        }
})('RawtextEndTagName')

S.ScriptDataLessthanSign = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            switch (r.consume()) {
                case '/':
                    t.createTempBuffer();
                    t.transition(S.ScriptDataEndTagOpen);
                    break;
                case '!':
                    t.emit("<!");
                    t.transition(S.ScriptDataEscapeStart);
                    break;
                case eof:
                    t.emit('<');
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                default:
                    t.emit('<');
                    r.unconsume();
                    t.transition(S.ScriptData);
            }
        }
})('ScriptDataLessthanSign')

S.ScriptDataEndTagOpen = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            readEndTag(t, r, S.ScriptDataEndTagName, S.ScriptData);
        }
})('ScriptDataEndTagOpen')

S.ScriptDataEndTagName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            handleDataEndTag(t, r, S.ScriptData);
        }
})('ScriptDataEndTagName')

S.ScriptDataEscapeStart = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matches('-')) {
                t.emit('-');
                t.advanceTransition(S.ScriptDataEscapeStartDash);
            } else {
                t.transition(S.ScriptData);
            }
        }
})('ScriptDataEscapeStart')

S.ScriptDataEscapeStartDash = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matches('-')) {
                t.emit('-');
                t.advanceTransition(S.ScriptDataEscapedDashDash);
            } else {
                t.transition(S.ScriptData);
            }
        }
})('ScriptDataEscapeStartDash')

S.ScriptDataEscaped = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.isEmpty()) {
                t.eofError(this);
                t.transition(S.Data);
                return;
            }
            switch (r.current()) {
                case '-':
                    t.emit('-');
                    t.advanceTransition(S.ScriptDataEscapedDash);
                    break;
                case '<':
                    t.advanceTransition(S.ScriptDataEscapedLessthanSign);
                    break;
                case nullChar:
                    t.error(this);
                    r.advance();
                    t.emit(replacementChar);
                    break;
                default:
                    const data = r.consumeToAny('-', '<', nullChar);
                    t.emit(data);
            }
        }
})('ScriptDataEscaped')

S.ScriptDataEscapedDash = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.isEmpty()) {
                t.eofError(this);
                t.transition(S.Data);
                return;
            }
            const c = r.consume();
            switch (c) {
                case '-':
                    t.emit(c);
                    t.transition(S.ScriptDataEscapedDashDash);
                    break;
                case '<':
                    t.transition(S.ScriptDataEscapedLessthanSign);
                    break;
                case nullChar:
                    t.error(this);
                    t.emit(replacementChar);
                    t.transition(S.ScriptDataEscaped);
                    break;
                default:
                    t.emit(c);
                    t.transition(S.ScriptDataEscaped);
            }
        }
})('ScriptDataEscapedDash')

S.ScriptDataEscapedDashDash = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.isEmpty()) {
                t.eofError(this);
                t.transition(S.Data);
                return;
            }
            const c = r.consume();
            switch (c) {
                case '-':
                    t.emit(c);
                    break;
                case '<':
                    t.transition(S.ScriptDataEscapedLessthanSign);
                    break;
                case '>':
                    t.emit(c);
                    t.transition(S.ScriptData);
                    break;
                case nullChar:
                    t.error(this);
                    t.emit(replacementChar);
                    t.transition(S.ScriptDataEscaped);
                    break;
                default:
                    t.emit(c);
                    t.transition(S.ScriptDataEscaped);
            }
        }
})('ScriptDataEscapedDashDash')

S.ScriptDataEscapedLessthanSign = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matchesAsciiAlpha()) {
                t.createTempBuffer();
                t.dataBuffer.append(r.current());
                t.emit('<');
                t.emit(r.current());
                t.advanceTransition(S.ScriptDataDoubleEscapeStart);
            } else if (r.matches('/')) {
                t.createTempBuffer();
                t.advanceTransition(S.ScriptDataEscapedEndTagOpen);
            } else {
                t.emit('<');
                t.transition(S.ScriptDataEscaped);
            }
        }
})('ScriptDataEscapedLessthanSign')

S.ScriptDataEscapedEndTagOpen = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matchesAsciiAlpha()) {
                t.createTagPending(false);
                t.tagPending.appendTagName(r.current());
                t.dataBuffer.append(r.current());
                t.advanceTransition(S.ScriptDataEscapedEndTagName);
            } else {
                t.emit("</");
                t.transition(S.ScriptDataEscaped);
            }
        }
})('ScriptDataEscapedEndTagOpen')

S.ScriptDataEscapedEndTagName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            handleDataEndTag(t, r, S.ScriptDataEscaped);
        }
})('ScriptDataEscapedEndTagName')

S.ScriptDataDoubleEscapeStart = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            handleDataDoubleEscapeTag(t, r, S.ScriptDataDoubleEscaped, S.ScriptDataEscaped);
        }
})('ScriptDataDoubleEscapeStart')

S.ScriptDataDoubleEscaped = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.current();
            switch (c) {
                case '-':
                    t.emit(c);
                    t.advanceTransition(S.ScriptDataDoubleEscapedDash);
                    break;
                case '<':
                    t.emit(c);
                    t.advanceTransition(S.ScriptDataDoubleEscapedLessthanSign);
                    break;
                case nullChar:
                    t.error(this);
                    r.advance();
                    t.emit(replacementChar);
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                default:
                    const data = r.consumeToAny('-', '<', nullChar);
                    t.emit(data);
            }
        }
})('ScriptDataDoubleEscaped')

S.ScriptDataDoubleEscapedDash = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '-':
                    t.emit(c);
                    t.transition(S.ScriptDataDoubleEscapedDashDash);
                    break;
                case '<':
                    t.emit(c);
                    t.transition(S.ScriptDataDoubleEscapedLessthanSign);
                    break;
                case nullChar:
                    t.error(this);
                    t.emit(replacementChar);
                    t.transition(S.ScriptDataDoubleEscaped);
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                default:
                    t.emit(c);
                    t.transition(S.ScriptDataDoubleEscaped);
            }
        }
})('ScriptDataDoubleEscapedDash')

S.ScriptDataDoubleEscapedDashDash = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '-':
                    t.emit(c);
                    break;
                case '<':
                    t.emit(c);
                    t.transition(S.ScriptDataDoubleEscapedLessthanSign);
                    break;
                case '>':
                    t.emit(c);
                    t.transition(S.ScriptData);
                    break;
                case nullChar:
                    t.error(this);
                    t.emit(replacementChar);
                    t.transition(S.ScriptDataDoubleEscaped);
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                default:
                    t.emit(c);
                    t.transition(S.ScriptDataDoubleEscaped);
            }
        }
})('ScriptDataDoubleEscapedDashDash')

S.ScriptDataDoubleEscapedLessthanSign = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matches('/')) {
                t.emit('/');
                t.createTempBuffer();
                t.advanceTransition(S.ScriptDataDoubleEscapeEnd);
            } else {
                t.transition(S.ScriptDataDoubleEscaped);
            }
        }
})('ScriptDataDoubleEscapedLessthanSign')

S.ScriptDataDoubleEscapeEnd = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            handleDataDoubleEscapeTag(t,r, S.ScriptDataEscaped, S.ScriptDataDoubleEscaped);
        }
})('ScriptDataDoubleEscapeEnd')

S.BeforeAttributeName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    break; // ignore whitespace
                case '/':
                    t.transition(S.SelfClosingStartTag);
                    break;
                case '>':
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                case nullChar:
                    r.unconsume();
                    t.error(this);
                    t.tagPending.newAttribute();
                    t.transition(S.AttributeName);
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                case '"':
                case '\'':
                case '=':
                    t.error(this);
                    t.tagPending.newAttribute();
                    t.tagPending.appendAttributeName(c, r.pos()-1, r.pos());
                    t.transition(S.AttributeName);
                    break;
                case '?': // Handle trailing ? in <?xml...?>
                    if (t.tagPending instanceof XmlDeclToken)
                        break;
                default: // A-Z, anything else
                    t.tagPending.newAttribute();
                    r.unconsume();
                    t.transition(S.AttributeName);
            }
        }
})('BeforeAttributeName')

S.AttributeName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            let pos = r.pos();
            const name = r.consumeToAnySorted(attributeNameCharsSorted); // spec deviate - consume and emit nulls in one hit vs stepping
            t.tagPending.appendAttributeName(name, pos, r.pos());
            pos = r.pos();
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.AfterAttributeName);
                    break;
                case '/':
                    t.transition(S.SelfClosingStartTag);
                    break;
                case '=':
                    t.transition(S.BeforeAttributeValue);
                    break;
                case '>':
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                case '"':
                case '\'':
                case '<':
                    t.error(this);
                    t.tagPending.appendAttributeName(c, pos, r.pos());
                    break;
                case '?':
                    if (t.syntax === 'xml' && t.tagPending instanceof XmlDeclToken) {
                        t.transition(S.AfterAttributeName);
                        break;
                    } // otherwise default - take it
                default: // buffer underrun
                    t.tagPending.appendAttributeName(c, pos, r.pos());
            }
        }
})('AttributeName')

S.AfterAttributeName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    break;
                case '/':
                    t.transition(S.SelfClosingStartTag);
                    break;
                case '=':
                    t.transition(S.BeforeAttributeValue);
                    break;
                case '>':
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                case nullChar:
                    t.error(this);
                    t.tagPending.appendAttributeName(replacementChar, r.pos()-1, r.pos());
                    t.transition(S.AttributeName);
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                case '"':
                case '\'':
                case '<':
                    t.error(this);
                    t.tagPending.newAttribute();
                    t.tagPending.appendAttributeName(c, r.pos()-1, r.pos());
                    t.transition(S.AttributeName);
                    break;
                default: // A-Z, anything else
                    t.tagPending.newAttribute();
                    r.unconsume();
                    t.transition(S.AttributeName);
            }
        }
})('AfterAttributeName')

S.BeforeAttributeValue = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    break;
                case '"':
                    t.transition(S.AttributeValue_doubleQuoted);
                    break;
                case '&':
                    r.unconsume();
                    t.transition(S.AttributeValue_unquoted);
                    break;
                case '\'':
                    t.transition(S.AttributeValue_singleQuoted);
                    break;
                case nullChar:
                    t.error(this);
                    t.tagPending.appendAttributeValue(replacementChar, r.pos()-1, r.pos());
                    t.transition(S.AttributeValue_unquoted);
                    break;
                case eof:
                    t.eofError(this);
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                case '>':
                    t.error(this);
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                case '<':
                case '=':
                case '`':
                    t.error(this);
                    t.tagPending.appendAttributeValue(c, r.pos()-1, r.pos());
                    t.transition(S.AttributeValue_unquoted);
                    break;
                default:
                    r.unconsume();
                    t.transition(S.AttributeValue_unquoted);
            }
        }
})('BeforeAttributeValue')

S.AttributeValue_doubleQuoted = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            let pos = r.pos();
            const value = r.consumeAttributeQuoted(false);
            if (value.length > 0)
                t.tagPending.appendAttributeValue(value, pos, r.pos());
            else
                t.tagPending.setEmptyAttributeValue();
            pos = r.pos();
            const c = r.consume();
            switch (c) {
                case '"':
                    t.transition(S.AfterAttributeValue_quoted);
                    break;
                case '&':
                    const ref = t.consumeCharacterReference('"', true);
                    if (ref !== null)
                        t.tagPending.appendAttributeValue(ref, pos, r.pos());
                    else
                        t.tagPending.appendAttributeValue('&', pos, r.pos());
                    break;
                case nullChar:
                    t.error(this);
                    t.tagPending.appendAttributeValue(replacementChar, pos, r.pos());
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                default: // hit end of buffer in first read, still in attribute
                    t.tagPending.appendAttributeValue(c, pos, r.pos());
            }
        }
})('AttributeValue_doubleQuoted')

S.AttributeValue_singleQuoted = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            let pos = r.pos();
            const value = r.consumeAttributeQuoted(true);
            if (value.length > 0)
                t.tagPending.appendAttributeValue(value, pos, r.pos());
            else
                t.tagPending.setEmptyAttributeValue();
            pos = r.pos();
            const c = r.consume();
            switch (c) {
                case '\'':
                    t.transition(S.AfterAttributeValue_quoted);
                    break;
                case '&':
                    const ref = t.consumeCharacterReference('\'', true);
                    if (ref !== null)
                        t.tagPending.appendAttributeValue(ref, pos, r.pos());
                    else
                        t.tagPending.appendAttributeValue('&', pos, r.pos());
                    break;
                case nullChar:
                    t.error(this);
                    t.tagPending.appendAttributeValue(replacementChar, pos, r.pos());
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                default: // hit end of buffer in first read, still in attribute
                    t.tagPending.appendAttributeValue(c, pos, r.pos());
            }
        }
})('AttributeValue_singleQuoted')

S.AttributeValue_unquoted = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            let pos = r.pos();
            const value = r.consumeToAnySorted(attributeValueUnquoted);
            if (value.length > 0)
                t.tagPending.appendAttributeValue(value, pos, r.pos());
            pos = r.pos();
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.BeforeAttributeName);
                    break;
                case '&':
                    const ref = t.consumeCharacterReference('>', true);
                    if (ref !== null)
                        t.tagPending.appendAttributeValue(ref, pos, r.pos());
                    else
                        t.tagPending.appendAttributeValue('&', pos, r.pos());
                    break;
                case '>':
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                case nullChar:
                    t.error(this);
                    t.tagPending.appendAttributeValue(replacementChar, pos, r.pos());
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                case '"':
                case '\'':
                case '<':
                case '=':
                case '`':
                    t.error(this);
                    t.tagPending.appendAttributeValue(c, pos, r.pos());
                    break;
                default: // hit end of buffer in first read, still in attribute
                    t.tagPending.appendAttributeValue(c, pos, r.pos());
            }
        }
})('AttributeValue_unquoted')

S.AfterAttributeValue_quoted = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.BeforeAttributeName);
                    break;
                case '/':
                    t.transition(S.SelfClosingStartTag);
                    break;
                case '>':
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                case '?': // Handle trailing ? in <?xml...?>
                    if (t.tagPending instanceof XmlDeclToken)
                        break;
                default:
                    r.unconsume();
                    t.error(this);
                    t.transition(S.BeforeAttributeName);
            }
        }
})('AfterAttributeValue_quoted')

S.SelfClosingStartTag = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '>':
                    t.tagPending.selfClosing = true;
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.transition(S.Data);
                    break;
                default:
                    r.unconsume();
                    t.error(this);
                    t.transition(S.BeforeAttributeName);
            }
        }
})('SelfClosingStartTag')

S.BogusComment = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            t.commentPending.append(r.consumeTo('>'));
            const next = r.current();
            if (next === '>' || next === eof) {
                r.consume();
                t.emitCommentPending();
                t.transition(S.Data);
            }
        }
})('BogusComment')

S.MarkupDeclarationOpen = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matchConsume("--")) {
                t.createCommentPending();
                t.transition(S.CommentStart);
            } else if (r.matchConsumeIgnoreCase("DOCTYPE")) {
                t.transition(S.Doctype);
            } else if (r.matchConsume("[CDATA[")) {
                if (t.isCdataAllowed()) {
                    t.createTempBuffer();
                    t.transition(S.CdataSection);
                } else {
                    t.error(this);
                    t.createBogusCommentPending();
                    t.commentPending.append("[CDATA[");
                    t.transition(S.BogusComment);
                }
            } else {
                if (t.syntax === 'xml' && r.matchesAsciiAlpha()) {
                    t.createXmlDeclPending(true);
                    t.transition(S.TagName); // treat <!ENTITY as XML Declaration, with tag-like handling
                } else {
                    t.error(this);
                    t.createBogusCommentPending();
                    t.transition(S.BogusComment);
                }
            }
        }
})('MarkupDeclarationOpen')

S.MarkupProcessingOpen = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matchesAsciiAlpha()) {
                t.createXmlDeclPending(false);
                t.transition(S.TagName); // treat <?xml... as XML Declaration (processing instruction), with tag-like handling
            } else {
                t.error(this);
                t.createBogusCommentPending();
                t.commentPending.append('?'); // push the ? to the start of the comment
                t.transition(S.BogusComment);
            }
        }
})('MarkupProcessingOpen')

S.CommentStart = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '-':
                    t.transition(S.CommentStartDash);
                    break;
                case nullChar:
                    t.error(this);
                    t.commentPending.append(replacementChar);
                    t.transition(S.Comment);
                    break;
                case '>':
                    t.error(this);
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                default:
                    r.unconsume();
                    t.transition(S.Comment);
            }
        }
})('CommentStart')

S.CommentStartDash = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '-':
                    t.transition(S.CommentEnd);
                    break;
                case nullChar:
                    t.error(this);
                    t.commentPending.append(replacementChar);
                    t.transition(S.Comment);
                    break;
                case '>':
                    t.error(this);
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                default:
                    t.commentPending.append(c);
                    t.transition(S.Comment);
            }
        }
})('CommentStartDash')

S.Comment = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.current();
            switch (c) {
                case '-':
                    t.advanceTransition(S.CommentEndDash);
                    break;
                case nullChar:
                    t.error(this);
                    r.advance();
                    t.commentPending.append(replacementChar);
                    break;
                case eof:
                    t.eofError(this);
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                default:
                    t.commentPending.append(r.consumeToAny('-', nullChar));
            }
        }
})('Comment')

S.CommentEndDash = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '-':
                    t.transition(S.CommentEnd);
                    break;
                case nullChar:
                    t.error(this);
                    t.commentPending.append('-').append(replacementChar);
                    t.transition(S.Comment);
                    break;
                case eof:
                    t.eofError(this);
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                default:
                    t.commentPending.append('-').append(c);
                    t.transition(S.Comment);
            }
        }
})('CommentEndDash')

S.CommentEnd = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '>':
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                case nullChar:
                    t.error(this);
                    t.commentPending.append("--").append(replacementChar);
                    t.transition(S.Comment);
                    break;
                case '!':
                    t.transition(S.CommentEndBang);
                    break;
                case '-':
                    t.commentPending.append('-');
                    break;
                case eof:
                    t.eofError(this);
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                default:
                    t.commentPending.append("--").append(c);
                    t.transition(S.Comment);
            }
        }
})('CommentEnd')

S.CommentEndBang = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '-':
                    t.commentPending.append("--!");
                    t.transition(S.CommentEndDash);
                    break;
                case '>':
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                case nullChar:
                    t.error(this);
                    t.commentPending.append("--!").append(replacementChar);
                    t.transition(S.Comment);
                    break;
                case eof:
                    t.eofError(this);
                    t.emitCommentPending();
                    t.transition(S.Data);
                    break;
                default:
                    t.commentPending.append("--!").append(c);
                    t.transition(S.Comment);
            }
        }
})('CommentEndBang')

S.Doctype = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.BeforeDoctypeName);
                    break;
                case eof:
                    t.eofError(this);
                case '>': // catch invalid <!DOCTYPE>
                    t.error(this);
                    t.createDoctypePending();
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.error(this);
                    t.transition(S.BeforeDoctypeName);
            }
        }
})('Doctype')

S.BeforeDoctypeName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matchesAsciiAlpha()) {
                t.createDoctypePending();
                t.transition(S.DoctypeName);
                return;
            }
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    break; // ignore whitespace
                case nullChar:
                    t.error(this);
                    t.createDoctypePending();
                    t.doctypePending.name.append(replacementChar);
                    t.transition(S.DoctypeName);
                    break;
                case eof:
                    t.eofError(this);
                    t.createDoctypePending();
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.createDoctypePending();
                    t.doctypePending.name.append(c);
                    t.transition(S.DoctypeName);
            }
        }
})('BeforeDoctypeName')

S.DoctypeName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.matchesAsciiAlpha()) {
                const name = r.consumeLetterSequence();
                t.doctypePending.name.append(name);
                return;
            }
            const c = r.consume();
            switch (c) {
                case '>':
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.AfterDoctypeName);
                    break;
                case nullChar:
                    t.error(this);
                    t.doctypePending.name.append(replacementChar);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.doctypePending.name.append(c);
            }
        }
})('DoctypeName')

S.AfterDoctypeName = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            if (r.isEmpty()) {
                t.eofError(this);
                t.doctypePending.forceQuirks = true;
                t.emitDoctypePending();
                t.transition(S.Data);
                return;
            }
            if (r.matchesAny('\t', '\n', '\r', '\f', ' '))
                r.advance(); // ignore whitespace
            else if (r.matches('>')) {
                t.emitDoctypePending();
                t.advanceTransition(S.Data);
            } else if (t.syntax === 'xml' && r.matches('[')) {
                t.doctypePending.sawInternalSubset = true;
                t.advanceTransition(S.DoctypeInternalSubset);
            } else if (r.matchConsumeIgnoreCase('PUBLIC')) {
                t.doctypePending.pubSysKey = 'PUBLIC';
                t.transition(S.AfterDoctypePublicKeyword);
            } else if (r.matchConsumeIgnoreCase('SYSTEM')) {
                t.doctypePending.pubSysKey = 'SYSTEM';
                t.transition(S.AfterDoctypeSystemKeyword);
            } else {
                t.error(this);
                t.doctypePending.forceQuirks = true;
                t.advanceTransition(S.BogusDoctype);
            }
        }
})('AfterDoctypeName')

S.AfterDoctypePublicKeyword = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.BeforeDoctypePublicIdentifier);
                    break;
                case '"':
                    t.error(this);
                    t.transition(S.DoctypePublicIdentifier_doubleQuoted);
                    break;
                case '\'':
                    t.error(this);
                    t.transition(S.DoctypePublicIdentifier_singleQuoted);
                    break;
                case '>':
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.transition(S.BogusDoctype);
            }
        }
})('AfterDoctypePublicKeyword')

S.BeforeDoctypePublicIdentifier = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    break;
                case '"':
                    t.transition(S.DoctypePublicIdentifier_doubleQuoted);
                    break;
                case '\'':
                    t.transition(S.DoctypePublicIdentifier_singleQuoted);
                    break;
                case '>':
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.transition(S.BogusDoctype);
            }
        }
})('BeforeDoctypePublicIdentifier')

S.DoctypePublicIdentifier_doubleQuoted = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '"':
                    t.transition(S.AfterDoctypePublicIdentifier);
                    break;
                case nullChar:
                    t.error(this);
                    t.doctypePending.publicIdentifier.append(replacementChar);
                    break;
                case '>':
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.doctypePending.publicIdentifier.append(c);
            }
        }
})('DoctypePublicIdentifier_doubleQuoted')

S.DoctypePublicIdentifier_singleQuoted = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\'':
                    t.transition(S.AfterDoctypePublicIdentifier);
                    break;
                case nullChar:
                    t.error(this);
                    t.doctypePending.publicIdentifier.append(replacementChar);
                    break;
                case '>':
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.doctypePending.publicIdentifier.append(c);
            }
        }
})('DoctypePublicIdentifier_singleQuoted')

S.AfterDoctypePublicIdentifier = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.BetweenDoctypePublicAndSystemIdentifiers);
                    break;
                case '>':
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case '"':
                    t.error(this);
                    t.transition(S.DoctypeSystemIdentifier_doubleQuoted);
                    break;
                case '\'':
                    t.error(this);
                    t.transition(S.DoctypeSystemIdentifier_singleQuoted);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.transition(S.BogusDoctype);
            }
        }
})('AfterDoctypePublicIdentifier')

S.BetweenDoctypePublicAndSystemIdentifiers = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    break;
                case '>':
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case '[':
                    if (t.syntax === 'xml') {
                        t.doctypePending.sawInternalSubset = true;
                        t.transition(S.DoctypeInternalSubset);
                        break;
                    }
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.transition(S.BogusDoctype);
                    break;
                case '"':
                    t.error(this);
                    t.transition(S.DoctypeSystemIdentifier_doubleQuoted);
                    break;
                case '\'':
                    t.error(this);
                    t.transition(S.DoctypeSystemIdentifier_singleQuoted);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.transition(S.BogusDoctype);
            }
        }
})('BetweenDoctypePublicAndSystemIdentifiers')

S.AfterDoctypeSystemKeyword = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.BeforeDoctypeSystemIdentifier);
                    break;
                case '>':
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case '"':
                    t.error(this);
                    t.transition(S.DoctypeSystemIdentifier_doubleQuoted);
                    break;
                case '\'':
                    t.error(this);
                    t.transition(S.DoctypeSystemIdentifier_singleQuoted);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
            }
        }
})('AfterDoctypeSystemKeyword')

S.BeforeDoctypeSystemIdentifier = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    break;
                case '"':
                    t.transition(S.DoctypeSystemIdentifier_doubleQuoted);
                    break;
                case '\'':
                    t.transition(S.DoctypeSystemIdentifier_singleQuoted);
                    break;
                case '>':
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.transition(S.BogusDoctype);
            }
        }
})('BeforeDoctypeSystemIdentifier')

S.DoctypeSystemIdentifier_doubleQuoted = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '"':
                    t.transition(S.AfterDoctypeSystemIdentifier);
                    break;
                case nullChar:
                    t.error(this);
                    t.doctypePending.systemIdentifier.append(replacementChar);
                    break;
                case '>':
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.doctypePending.systemIdentifier.append(c);
            }
        }
})('DoctypeSystemIdentifier_doubleQuoted')

S.DoctypeSystemIdentifier_singleQuoted = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\'':
                    t.transition(S.AfterDoctypeSystemIdentifier);
                    break;
                case nullChar:
                    t.error(this);
                    t.doctypePending.systemIdentifier.append(replacementChar);
                    break;
                case '>':
                    t.error(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.doctypePending.systemIdentifier.append(c);
            }
        }
})('DoctypeSystemIdentifier_singleQuoted')

S.AfterDoctypeSystemIdentifier = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    break;
                case '>':
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case '[':
                    if (t.syntax === 'xml') {
                        t.doctypePending.sawInternalSubset = true;
                        t.transition(S.DoctypeInternalSubset);
                        break;
                    }
                    t.error(this);
                    t.transition(S.BogusDoctype);
                    break;
                case eof:
                    t.eofError(this);
                    t.doctypePending.forceQuirks = true;
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    t.error(this);
                    t.transition(S.BogusDoctype);
            }
        }
})('AfterDoctypeSystemIdentifier')

S.BogusDoctype = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const c = r.consume();
            switch (c) {
                case '>':
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                case eof:
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    break;
                default:
                    break;
            }
        }
})('BogusDoctype')

S.DoctypeInternalSubset = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            readDoctypeInternalSubset(t, r, this);
        }
})('DoctypeInternalSubset')

S.CdataSection = new (class extends State {
        read(t: Tokeniser, r: CharacterReader): void {
            const data = r.consumeTo("]]>");
            t.dataBuffer.append(data);
            if (r.matchConsume("]]>") || r.isEmpty()) {
                t.emit(new CDataToken(t.dataBuffer.value()));
                t.transition(S.Data);
            }// otherwise, buffer underrun, stay in data section
        }
})('CdataSection')

    function handleDataEndTag(t: Tokeniser, r: CharacterReader, elseTransition: State): void {
        if (r.matchesAsciiAlpha()) {
            const name = r.consumeTagName();
            t.tagPending.appendTagName(name);
            t.dataBuffer.append(name);
            return;
        }
        let needsExitTransition = false;
        if (t.isAppropriateEndTagToken() && !r.isEmpty()) {
            const c = r.consume();
            switch (c) {
                case '\t':
                case '\n':
                case '\r':
                case '\f':
                case ' ':
                    t.transition(S.BeforeAttributeName);
                    break;
                case '/':
                    t.transition(S.SelfClosingStartTag);
                    break;
                case '>':
                    t.emitTagPending();
                    t.transition(S.Data);
                    break;
                default:
                    t.dataBuffer.append(c);
                    needsExitTransition = true;
            }
        } else {
            needsExitTransition = true;
        }
        if (needsExitTransition) {
            t.emit("</");
            t.emit(t.dataBuffer.value());
            t.transition(elseTransition);
        }
    }
    function readRawData(t: Tokeniser, r: CharacterReader, current: State, advance: State): void {
        switch (r.current()) {
            case '<':
                t.advanceTransition(advance);
                break;
            case nullChar:
                t.error(current);
                r.advance();
                t.emit(replacementChar);
                break;
            case eof:
                t.emit(new EOFToken());
                break;
            default:
                const data = r.consumeRawData();
                t.emit(data);
                break;
        }
    }
    function readCharRef(t: Tokeniser, advance: State): void {
        const c = t.consumeCharacterReference(null, false);
        if (c === null)
            t.emit('&');
        else
            t.emit(c);
        t.transition(advance);
    }
    function readEndTag(t: Tokeniser, r: CharacterReader, a: State, b: State): void {
        if (r.matchesAsciiAlpha()) {
            t.createTagPending(false);
            t.transition(a);
        } else {
            t.emit("</");
            t.transition(b);
        }
    }
    function handleDataDoubleEscapeTag(t: Tokeniser, r: CharacterReader, primary: State, fallback: State): void {
        if (r.matchesAsciiAlpha()) {
            const name = r.consumeLetterSequence();
            t.dataBuffer.append(name);
            t.emit(name);
            return;
        }
        const c = r.consume();
        switch (c) {
            case '\t':
            case '\n':
            case '\r':
            case '\f':
            case ' ':
            case '/':
            case '>':
                if (t.dataBuffer.value() === "script")
                    t.transition(primary);
                else
                    t.transition(fallback);
                t.emit(c);
                break;
            default:
                r.unconsume();
                t.transition(fallback);
        }
    }
    function readDoctypeInternalSubset(t: Tokeniser, r: CharacterReader, current: State): void {
        const None = 0, SingleQuote = 1, DoubleQuote = 2, CommentCtx = 3, ProcessingInstruction = 4;
        let context = None;
        const subset = t.doctypePending.internalSubset;
        while (true) {
            const c = r.consume();
            switch (c) {
                case '\'':
                    subset.append(c);
                    if  (context === None) context = SingleQuote;
                    else if (context === SingleQuote) context = None;
                    break;
                case '"':
                    subset.append(c);
                    if (context === None) context = DoubleQuote;
                    else if (context === DoubleQuote) context = None;
                    break;
                case '<':
                    subset.append(c);
                    if (context === None) {
                        if (r.matchConsume("!--")) {
                            subset.append("!--");
                            context = CommentCtx;
                        } else if (r.matchConsume("?")) {
                            subset.append('?');
                            context = ProcessingInstruction;
                        }
                    }
                    break;
                case '-':
                    subset.append(c);
                    if (context === CommentCtx && r.matchConsume("->")) {
                        subset.append("->");
                        context = None;
                    }
                    break;
                case '?':
                    subset.append(c);
                    if (context === ProcessingInstruction && r.matches('>')) {
                        r.advance();
                        subset.append('>');
                        context = None;
                    }
                    break;
                case ']':
                    if (context === None) {
                        const ws = r.consumeMatching(isWhitespaceChar);
                        if (r.matches('>')) {
                            r.advance();
                            t.emitDoctypePending();
                            t.transition(S.Data);
                            return;
                        }
                        subset.append(c);
                        subset.append(ws);
                        break;
                    }
                    subset.append(c);
                    break;
                case nullChar:
                    t.error(current);
                    subset.append(replacementChar);
                    break;
                case eof:
                    t.eofError(current);
                    t.emitDoctypePending();
                    t.transition(S.Data);
                    return;
                default:
                    subset.append(c);
                    break;
            }
        }
    }


// ---------------------------------------------------------------------------
// Espaces de noms, ParseSettings, Attributes
// ---------------------------------------------------------------------------

const NamespaceHtml = 'http://www.w3.org/1999/xhtml'
const NamespaceXml = 'http://www.w3.org/XML/1998/namespace'
const NamespaceMathml = 'http://www.w3.org/1998/Math/MathML'
const NamespaceSvg = 'http://www.w3.org/2000/svg'

class ParseSettings {
  static readonly htmlDefault = new ParseSettings(false, false)
  static readonly preserveCase = new ParseSettings(true, true)

  constructor(
    private readonly preserveTagCase_: boolean,
    private readonly preserveAttributeCase_: boolean,
  ) {}

  preserveTagCase(): boolean {
    return this.preserveTagCase_
  }

  preserveAttributeCase(): boolean {
    return this.preserveAttributeCase_
  }

  normalizeTag(name: string): string {
    name = javaTrim(name)
    if (!this.preserveTagCase_) name = lowerCase(name)
    return name
  }

  normalizeAttributes(attributes: Attributes): void {
    if (!this.preserveAttributeCase_) {
      attributes.normalize()
    }
  }

  static normalName(name: string): string {
    return normalize(name)
  }
}

class Attribute {
  constructor(
    private readonly key: string,
    private readonly val: string | null,
  ) {}

  getKey(): string {
    return this.key
  }

  /** `getValue()` : "" pour un attribut booléen */
  getValue(): string {
    return this.val ?? ''
  }

  prefix(): string {
    const pos = this.key.indexOf(':')
    return pos === -1 ? '' : this.key.substring(0, pos)
  }
}

class Attributes {
  private keys: string[] = []
  private vals: (string | null)[] = []

  size(): number {
    return this.keys.length
  }

  isEmpty(): boolean {
    return this.size() === 0
  }

  private indexOfKey(key: string): number {
    return this.keys.indexOf(key)
  }

  private indexOfKeyIgnoreCase(key: string): number {
    for (let i = 0; i < this.keys.length; i++) if (equalsIgnoreCase(key, this.keys[i] as string)) return i
    return -1
  }

  get(key: string): string {
    const i = this.indexOfKey(key)
    return i === -1 ? '' : (this.vals[i] ?? '')
  }

  getIgnoreCase(key: string): string {
    const i = this.indexOfKeyIgnoreCase(key)
    return i === -1 ? '' : (this.vals[i] ?? '')
  }

  add(key: string, value: string | null): this {
    this.keys.push(key)
    this.vals.push(value)
    return this
  }

  // PORT: surcharges put(String, String) / put(Attribute) fusionnées
  put(keyOrAttr: string | Attribute, value?: string | null): this {
    if (keyOrAttr instanceof Attribute) return this.put(keyOrAttr.getKey(), keyOrAttr.getValue())
    const i = this.indexOfKey(keyOrAttr)
    if (i !== -1) this.vals[i] = value ?? null
    else this.add(keyOrAttr, value ?? null)
    return this
  }

  private removeAt(index: number): void {
    this.keys.splice(index, 1)
    this.vals.splice(index, 1)
  }

  removeIgnoreCase(key: string): void {
    const i = this.indexOfKeyIgnoreCase(key)
    if (i !== -1) this.removeAt(i)
  }

  hasKey(key: string): boolean {
    return this.indexOfKey(key) !== -1
  }

  hasKeyIgnoreCase(key: string): boolean {
    return this.indexOfKeyIgnoreCase(key) !== -1
  }

  addAll(incoming: Attributes): void {
    if (incoming.size() === 0) return
    const needsPut = this.size() !== 0
    for (const attr of incoming.asList()) {
      if (needsPut) this.put(attr)
      else this.add(attr.getKey(), attr.getValue())
    }
  }

  asList(): Attribute[] {
    return this.keys.map((k, i) => new Attribute(k, this.vals[i] as string | null))
  }

  [Symbol.iterator](): Iterator<Attribute> {
    return this.asList()[Symbol.iterator]()
  }

  equals(that: Attributes): boolean {
    if (this === that) return true
    if (this.size() !== that.size()) return false
    for (let i = 0; i < this.keys.length; i++) {
      const thatI = that.indexOfKey(this.keys[i] as string)
      if (thatI === -1 || this.vals[i] !== that.vals[thatI]) return false
    }
    return true
  }

  clone(): Attributes {
    const clone = new Attributes()
    clone.keys = [...this.keys]
    clone.vals = [...this.vals]
    return clone
  }

  normalize(): void {
    for (let i = 0; i < this.keys.length; i++) this.keys[i] = lowerCase(this.keys[i] as string)
  }

  deduplicate(settings: ParseSettings): number {
    if (this.size() === 0) return 0
    const preserve = settings.preserveAttributeCase()
    let dupes = 0
    for (let i = 0; i < this.keys.length; i++) {
      const keyI = this.keys[i] as string
      for (let j = i + 1; j < this.keys.length; j++) {
        if ((preserve && keyI === this.keys[j]) || (!preserve && equalsIgnoreCase(keyI, this.keys[j] as string))) {
          dupes++
          this.removeAt(j)
          j--
        }
      }
    }
    return dupes
  }
}

// ---------------------------------------------------------------------------
// parser.Tag, HtmlTagOptions, TagSet
// ---------------------------------------------------------------------------

const TagOpt = {
  Known: 1,
  Void: 1 << 1,
  Block: 1 << 2,
  InlineContainer: 1 << 3,
  SelfClose: 1 << 4,
  SeenSelfClose: 1 << 5,
  PreserveWhitespace: 1 << 6,
  RcData: 1 << 7,
  Data: 1 << 8,
  FormSubmittable: 1 << 9,
  TextBoundary: 1 << 10,
}

const HtmlTagOptions = {
  Scope: 1,
  ListScope: 1 << 1,
  ButtonScope: 1 << 2,
  TableScope: 1 << 3,
  SelectScopeMember: 1 << 4,
  ImpliedEnd: 1 << 5,
  ThoroughImpliedEnd: 1 << 6,
  Special: 1 << 7,
  ScopeTags: ['applet', 'caption', 'html', 'marquee', 'object', 'select', 'table', 'td', 'template', 'th'],
  MathScopeTags: ['annotation-xml', 'mi', 'mn', 'mo', 'ms', 'mtext'],
  SvgScopeTags: ['desc', 'foreignobject', 'title'],
  ListScopeTags: ['ol', 'ul'],
  ButtonScopeTags: ['button'],
  TableScopeTags: ['html', 'table', 'template'],
  SelectScopeMemberTags: ['optgroup', 'option'],
  ImpliedEndTags: ['dd', 'dt', 'li', 'optgroup', 'option', 'p', 'rb', 'rp', 'rt', 'rtc'],
  ThoroughImpliedEndTags: ['caption', 'colgroup', 'dd', 'dt', 'li', 'optgroup', 'option', 'p', 'rb', 'rp', 'rt', 'rtc', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr'],
  SpecialTags: [
    'address', 'applet', 'area', 'article', 'aside', 'base', 'basefont', 'bgsound', 'blockquote', 'body', 'br', 'button', 'caption', 'center', 'col', 'colgroup',
    'dd', 'details', 'dir', 'div', 'dl', 'dt', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5',
    'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'iframe', 'img', 'input', 'keygen', 'li', 'link', 'listing', 'main', 'marquee', 'menu', 'meta', 'nav',
    'noembed', 'noframes', 'noscript', 'object', 'ol', 'p', 'param', 'plaintext', 'pre', 'script', 'search', 'section', 'select', 'source', 'style', 'summary',
    'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul', 'wbr', 'xmp',
  ],
  optionsFor(normalName: string, namespace: string): number {
    const H = HtmlTagOptions
    let options = 0
    switch (namespace) {
      case NamespaceHtml:
        if (H.ImpliedEndTags.includes(normalName)) options |= H.ImpliedEnd
        if (H.ThoroughImpliedEndTags.includes(normalName)) options |= H.ThoroughImpliedEnd
        if (H.SelectScopeMemberTags.includes(normalName)) options |= H.SelectScopeMember
        if (H.ScopeTags.includes(normalName)) options |= H.Scope
        if (H.ListScopeTags.includes(normalName)) options |= H.ListScope
        if (H.ButtonScopeTags.includes(normalName)) options |= H.ButtonScope
        if (H.TableScopeTags.includes(normalName)) options |= H.TableScope
        if (H.SpecialTags.includes(normalName)) options |= H.Special
        break
      case NamespaceMathml:
        if (H.MathScopeTags.includes(normalName)) options |= H.Scope | H.Special
        break
      case NamespaceSvg:
        if (H.SvgScopeTags.includes(normalName)) options |= H.Scope | H.Special
        break
    }
    return options
  },
}

export class Tag {
  tagName: string
  normalName_: string
  namespace_: string
  options = 0
  private parserOptions = 0

  constructor(tagName: string, normalName: string, namespace: string) {
    this.tagName = tagName
    this.normalName_ = normalName
    this.namespace_ = namespace
    this.setParserOptions()
  }

  getName(): string {
    return this.tagName
  }

  name(): string {
    return this.tagName
  }

  normalName(): string {
    return this.normalName_
  }

  namespace(): string {
    return this.namespace_
  }

  set(option: number): this {
    this.options |= option
    this.options |= TagOpt.Known // considered known if touched
    return this
  }

  is(option: number): boolean {
    return (this.options & option) !== 0
  }

  setParserOptions(): void {
    this.parserOptions = HtmlTagOptions.optionsFor(this.normalName_, this.namespace_)
  }

  hasParserOption(option: number): boolean {
    return (this.parserOptions & option) !== 0
  }

  isBlock(): boolean {
    return (this.options & TagOpt.Block) !== 0
  }

  isInline(): boolean {
    return (this.options & TagOpt.Block) === 0
  }

  isEmpty(): boolean {
    return (this.options & TagOpt.Void) !== 0
  }

  isSelfClosing(): boolean {
    return (this.options & TagOpt.SelfClose) !== 0 || (this.options & TagOpt.Void) !== 0
  }

  isKnownTag(): boolean {
    return (this.options & TagOpt.Known) !== 0
  }

  preserveWhitespace(): boolean {
    return (this.options & TagOpt.PreserveWhitespace) !== 0
  }

  setSeenSelfClose(): void {
    this.options |= TagOpt.SeenSelfClose // does not change known status
  }

  textState(): State | null {
    if (this.is(TagOpt.RcData)) return S.Rcdata
    if (this.is(TagOpt.Data)) return S.Rawtext
    else return null
  }

  clone(): Tag {
    const t = new Tag(this.tagName, this.normalName_, this.namespace_)
    t.options = this.options
    t.parserOptions = this.parserOptions
    return t
  }

  toString(): string {
    return this.tagName
  }
}

class TagSet {
  private readonly tags = new Map<string, Map<string, Tag>>()

  constructor(private readonly source: TagSet | null = null) {}

  static Html(): TagSet {
    return new TagSet(HtmlTagSet)
  }

  add(tag: Tag): this {
    tag.set(TagOpt.Known)
    this.doAdd(tag)
    return this
  }

  private doAdd(tag: Tag): void {
    tag.setParserOptions()
    let ns = this.tags.get(tag.namespace_)
    if (ns === undefined) this.tags.set(tag.namespace_, (ns = new Map()))
    ns.set(tag.tagName, tag)
  }

  get(tagName: string, namespace: string): Tag | null {
    const nsTags = this.tags.get(namespace)
    if (nsTags !== undefined) {
      const tag = nsTags.get(tagName)
      if (tag !== undefined) return tag
    }
    if (this.source !== null) {
      const tag = this.source.get(tagName, namespace)
      if (tag !== null) {
        const copy = tag.clone()
        this.doAdd(copy)
        return copy
      }
    }
    return null
  }

  valueOf(tagName: string, normalName: string | null, namespace: string, preserveTagCase: boolean): Tag {
    if (normalName === null) tagName = javaTrim(tagName)
    if (tagName.length === 0) throw new IllegalArgumentException('String must not be empty')
    let tag = this.get(tagName, namespace)
    if (tag !== null) return tag

    // not found by tagName, try by normal
    if (normalName === null) normalName = ParseSettings.normalName(tagName)
    tagName = preserveTagCase ? tagName : normalName
    tag = this.get(normalName, namespace)
    if (tag !== null) {
      if (preserveTagCase && tagName !== normalName) {
        tag = tag.clone() // copy so that the name update doesn't reset all instances
        tag.tagName = tagName
        this.doAdd(tag)
      }
      return tag
    }

    // not defined: return a new one
    tag = new Tag(tagName, normalName, namespace)
    this.doAdd(tag)
    return tag
  }

  setupTags(namespace: string, tagNames: string[], tagModifier: (t: Tag) => void): this {
    for (const tagName of tagNames) {
      let tag = this.get(tagName, namespace)
      if (tag === null) {
        tag = new Tag(tagName, tagName, namespace)
        tag.options = 0
        this.add(tag)
      }
      tagModifier(tag)
    }
    return this
  }

  static initHtmlDefault(): TagSet {
    const blockTags = [
      'html', 'head', 'body', 'frameset', 'script', 'noscript', 'style', 'meta', 'link', 'title', 'frame', 'noframes', 'section', 'nav', 'aside', 'hgroup',
      'header', 'footer', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dialog', 'search', 'ul', 'ol', 'pre', 'div', 'blockquote', 'hr', 'address', 'figure',
      'figcaption', 'form', 'fieldset', 'dl', 'dt', 'dd', 'li', 'table', 'caption', 'thead', 'tfoot', 'tbody', 'colgroup', 'col', 'tr', 'th', 'td', 'details',
      'menu', 'plaintext', 'template', 'article', 'main', 'center', 'dir', 'applet', 'marquee', 'listing', '#root',
    ]
    const inlineTags = [
      'object', 'base', 'font', 'tt', 'i', 'b', 'u', 'big', 'small', 'em', 'strong', 'dfn', 'code', 'samp', 'kbd', 'var', 'cite', 'abbr', 'time', 'acronym',
      'mark', 'ruby', 'rt', 'rp', 'rtc', 'a', 'img', 'wbr', 'map', 'q', 'sub', 'sup', 'bdo', 'iframe', 'embed', 'span', 'input', 'select', 'textarea', 'label',
      'audio', 'video', 'canvas', 'optgroup', 'option', 'legend', 'datalist', 'keygen', 'output', 'progress', 'meter', 'area', 'param', 'source', 'track',
      'summary', 'command', 'device', 'basefont', 'bgsound', 'menuitem', 'data', 'bdi', 's', 'strike', 'nobr', 'ins', 'del', 'button', 'picture', 'slot', 'rb',
    ]
    const inlineContainers = ['title', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'address', 'li', 'th', 'td', 'script', 'style']
    const voidTags = ['meta', 'link', 'base', 'frame', 'img', 'br', 'wbr', 'embed', 'hr', 'input', 'keygen', 'col', 'command', 'device', 'area', 'basefont', 'bgsound', 'menuitem', 'param', 'source', 'track']
    const preserveWhitespaceTags = ['pre', 'plaintext', 'title', 'textarea', 'script']
    const rcdataTags = ['title', 'textarea']
    const dataTags = ['iframe', 'noembed', 'noframes', 'script', 'style', 'xmp']
    const formSubmitTags = FormSubmitTags
    const textBoundaryTags = ['button', 'input', 'select', 'textarea', 'option', 'output', 'progress', 'meter', 'img', 'picture', 'audio', 'video', 'canvas', 'object', 'embed', 'iframe']
    const blockMathTags = ['math']
    const inlineMathTags = ['mi', 'mo', 'msup', 'mn', 'mtext']
    const blockSvgTags = ['svg', 'femerge', 'femergenode']
    const inlineSvgTags = ['text']
    const dataSvgTags = ['script']

    return new TagSet()
      .setupTags(NamespaceHtml, blockTags, (tag) => tag.set(TagOpt.Block))
      .setupTags(NamespaceHtml, inlineTags, (tag) => tag.set(0))
      .setupTags(NamespaceHtml, inlineContainers, (tag) => tag.set(TagOpt.InlineContainer))
      .setupTags(NamespaceHtml, voidTags, (tag) => tag.set(TagOpt.Void))
      .setupTags(NamespaceHtml, preserveWhitespaceTags, (tag) => tag.set(TagOpt.PreserveWhitespace))
      .setupTags(NamespaceHtml, rcdataTags, (tag) => tag.set(TagOpt.RcData))
      .setupTags(NamespaceHtml, dataTags, (tag) => tag.set(TagOpt.Data))
      .setupTags(NamespaceHtml, formSubmitTags, (tag) => tag.set(TagOpt.FormSubmittable))
      .setupTags(NamespaceHtml, textBoundaryTags, (tag) => tag.set(TagOpt.TextBoundary))
      .setupTags(NamespaceMathml, blockMathTags, (tag) => tag.set(TagOpt.Block))
      .setupTags(NamespaceMathml, inlineMathTags, (tag) => tag.set(0))
      .setupTags(NamespaceSvg, blockSvgTags, (tag) => tag.set(TagOpt.Block))
      .setupTags(NamespaceSvg, inlineSvgTags, (tag) => tag.set(0))
      .setupTags(NamespaceSvg, dataSvgTags, (tag) => tag.set(TagOpt.Data))
  }
}

const FormSubmitTags = ['input', 'keygen', 'object', 'select', 'textarea']

// ---------------------------------------------------------------------------
// nodes
// ---------------------------------------------------------------------------

export abstract class Node {
  parentNode: Element | null = null

  parent(): Element | null {
    return this.parentNode
  }

  siblingIndex(): number {
    return this.parentNode === null ? 0 : this.parentNode.childNodes_.indexOf(this)
  }

  nextSibling(): Node | null {
    if (this.parentNode === null) return null
    return this.parentNode.childNodes_[this.siblingIndex() + 1] ?? null
  }

  previousSibling(): Node | null {
    if (this.parentNode === null) return null
    const i = this.siblingIndex()
    return i > 0 ? (this.parentNode.childNodes_[i - 1] as Node) : null
  }

  remove(): void {
    if (this.parentNode !== null) this.parentNode.removeChild(this)
  }

  before(node: Node): this {
    const parent = this.parentNode as Element
    if (node.parentNode === parent) node.remove()
    parent.addChildren(this.siblingIndex(), [node])
    return this
  }

  siblingNodes(): Node[] {
    if (this.parentNode === null) return []
    return this.parentNode.childNodes_.filter((it) => it !== this)
  }

  abstract nodeName(): string

  normalName(): string {
    return this.nodeName()
  }

  nameIs(normalName: string): boolean {
    return this.normalName() === normalName
  }
}

export class TextNode extends Node {
  constructor(protected value: string) {
    super()
  }

  nodeName(): string {
    return '#text'
  }

  getWholeText(): string {
    return this.value
  }

  isBlank(): boolean {
    return isBlankString(this.value)
  }
}

export class CDataNode extends TextNode {
  override nodeName(): string {
    return '#cdata'
  }
}

export class DataNode extends Node {
  constructor(private readonly data: string) {
    super()
  }

  nodeName(): string {
    return '#data'
  }

  getWholeData(): string {
    return this.data
  }
}

export class Comment extends Node {
  constructor(readonly data: string) {
    super()
  }

  nodeName(): string {
    return '#comment'
  }
}

export class XmlDeclaration extends Node {
  constructor(
    readonly name: string,
    readonly isDeclaration: boolean,
  ) {
    super()
  }

  nodeName(): string {
    return '#declaration'
  }
}

export class DocumentType extends Node {
  private pubSysKey: string | null = null

  constructor(
    private readonly name_: string,
    private readonly publicId_: string,
    private readonly systemId_: string,
  ) {
    super()
  }

  nodeName(): string {
    return '#doctype'
  }

  name(): string {
    return this.name_
  }

  publicId(): string {
    return this.publicId_
  }

  setPubSysKey(value: string | null): void {
    this.pubSysKey = value
  }
}

export class Element extends Node {
  readonly childNodes_: Node[] = []
  private attributes_: Attributes | null

  constructor(
    readonly tag_: Tag,
    _baseUri: string | null = null,
    attributes: Attributes | null = null,
  ) {
    super()
    this.attributes_ = attributes
  }

  tag(): Tag {
    return this.tag_
  }

  nodeName(): string {
    return this.tag_.getName()
  }

  tagName(): string {
    return this.tag_.getName()
  }

  override normalName(): string {
    return this.tag_.normalName()
  }

  override nameIs(normalName: string): boolean {
    return this.tag_.normalName() === normalName
  }

  elementIs(normalName: string, namespace: string): boolean {
    return this.tag_.normalName() === normalName && this.tag_.namespace() === namespace
  }

  isBlock(): boolean {
    return this.tag_.isBlock()
  }

  override parent(): Element | null {
    return this.parentNode
  }

  attributes(): Attributes {
    if (this.attributes_ === null) this.attributes_ = new Attributes()
    return this.attributes_
  }

  hasAttributes(): boolean {
    return this.attributes_ !== null
  }

  /** `appendChild` : retire l'enfant de son parent actuel, puis l'ajoute à la fin */
  appendChild(child: Node): this {
    if (child.parentNode !== null) child.parentNode.removeChild(child)
    child.parentNode = this
    this.childNodes_.push(child)
    return this
  }

  removeChild(out: Node): void {
    const i = this.childNodes_.indexOf(out)
    if (i !== -1) this.childNodes_.splice(i, 1)
    out.parentNode = null
  }

  addChildren(index: number, children: Node[]): void {
    if (children.length === 0) return
    const firstParent = (children[0] as Node).parent()
    if (firstParent !== null && firstParent.childNodeSize() === children.length) {
      let sameList = true
      for (let i = children.length - 1; i >= 0; i--) {
        if (children[i] !== firstParent.childNodes_[i]) {
          sameList = false
          break
        }
      }
      if (sameList) {
        firstParent.childNodes_.length = 0
        this.childNodes_.splice(index, 0, ...children)
        for (const child of children) child.parentNode = this
        return
      }
    }
    for (const child of children) {
      // reparentChild
      if (child.parentNode !== null) child.parentNode.removeChild(child)
      child.parentNode = this
    }
    this.childNodes_.splice(index, 0, ...children)
  }

  insertChildren(index: number, children: Node[]): this {
    const currentSize = this.childNodeSize()
    if (index < 0) index += currentSize + 1
    if (!(index >= 0 && index <= currentSize)) throw new IllegalArgumentException('Insert position out of bounds.')
    this.addChildren(index, [...children])
    return this
  }

  appendChildren(children: Node[]): this {
    return this.insertChildren(-1, children)
  }

  /** `childNodes()` : copie */
  childNodes(): Node[] {
    return [...this.childNodes_]
  }

  childNodeSize(): number {
    return this.childNodes_.length
  }

  firstElementChild(): Element | null {
    for (const c of this.childNodes_) if (c instanceof Element) return c
    return null
  }

  nextElementSibling(): Element | null {
    if (this.parentNode === null) return null
    const siblings = this.parentNode.childNodes_
    for (let i = siblings.indexOf(this) + 1; i < siblings.length; i++) if (siblings[i] instanceof Element) return siblings[i] as Element
    return null
  }

  appendElement(tagName: string, tagSet: TagSet = TagSet.Html()): Element {
    const child = new Element(tagSet.valueOf(tagName, null, this.tag_.namespace(), ParseSettings.htmlDefault.preserveTagCase()))
    this.appendChild(child)
    return child
  }

  /** `attr(key)` : insensible à la casse, "" si absent (ou attribut booléen) */
  attr(attributeKey: string): string {
    if (this.attributes_ === null) return ''
    const val = this.attributes_.getIgnoreCase(attributeKey)
    if (val.length > 0) return val
    // PORT: abs: (URL absolues) non porté : aucune URI de base
    return ''
  }

  hasAttr(attributeKey: string): boolean {
    if (this.attributes_ === null) return false
    return this.attributes_.hasKeyIgnoreCase(attributeKey)
  }

  id(): string {
    return this.attributes_ !== null ? this.attributes_.getIgnoreCase('id') : ''
  }

  hasText(): boolean {
    for (const child of this.childNodes_) {
      if (child instanceof TextNode) {
        if (!child.isBlank()) return true
      } else if (child instanceof Element) {
        if (child.hasText()) return true
      }
    }
    return false
  }

  /** Parcours en profondeur (préordre) de cet élément et de ses descendants */
  *allElements(): Generator<Element> {
    yield this
    for (const child of this.childNodes_) if (child instanceof Element) yield* child.allElements()
  }

  select(cssQuery: string): Element[] {
    const evaluator = QueryParser.parse(cssQuery)
    const out: Element[] = []
    for (const el of this.allElements()) if (evaluator.matches(this, el)) out.push(el)
    return out
  }

  selectFirst(cssQuery: string): Element | null {
    const evaluator = QueryParser.parse(cssQuery)
    for (const el of this.allElements()) if (evaluator.matches(this, el)) return el
    return null
  }

  /** `text()` : texte normalisé (TextAccumulator) */
  text(): string {
    const accum: string[] = []
    const lastCharIsWhitespace = () => accum.length !== 0 && (accum[accum.length - 1] as string).endsWith(' ')
    const traverse = (node: Node) => {
      // head
      if (node instanceof TextNode) {
        const text = node.getWholeText()
        if (preserveWhitespace(node.parentNode) || node instanceof CDataNode) accum.push(text)
        else appendNormalisedWhitespace(accum, text, lastCharIsWhitespace())
      } else if (node instanceof Element) {
        // add a synthetic space before leading blocks and readable boundaries when text would otherwise run together
        if (accum.join('').length > 0 && needsLeadingTextSeparator(node) && !lastCharIsWhitespace()) accum.push(' ')
        for (const child of node.childNodes_) traverse(child)
        // tail
        const next = node.nextSibling()
        if (
          needsTrailingTextSeparator(node) &&
          (next instanceof TextNode || (next instanceof Element && next.tag_.isInline())) &&
          !lastCharIsWhitespace()
        )
          accum.push(' ')
      }
    }
    traverse(this)
    return javaTrim(accum.join(''))
  }
}

function needsLeadingTextSeparator(element: Element): boolean {
  return element.isBlock() || element.nameIs('br') || (element.tag_.is(TagOpt.TextBoundary) && element.childNodeSize() > 0 && element.hasText())
}

function needsTrailingTextSeparator(element: Element): boolean {
  return element.tag_.is(TagOpt.TextBoundary) || !element.tag_.isInline() || hasBlockChild(element)
}

function hasBlockChild(element: Element): boolean {
  for (const child of element.childNodes_) if (child instanceof Element && child.isBlock()) return true
  return false
}

function preserveWhitespace(node: Node | null): boolean {
  // looks only at this element and five levels up, to prevent recursion & needless stack searches
  if (node instanceof Element) {
    let el: Element | null = node
    let i = 0
    do {
      if (el.tag_.preserveWhitespace()) return true
      el = el.parent()
      i++
    } while (i < 6 && el !== null)
  }
  return false
}

export class FormElement extends Element {
  // PORT: FormElement.addElement (liste des contrôles du formulaire) sans effet sur l'arbre : non porté
  addElement(_element: Element): this {
    return this
  }
}

export class Document extends Element {
  private quirksMode_: 'noQuirks' | 'quirks' | 'limitedQuirks' = 'noQuirks'

  constructor(namespace: string, baseUri: string) {
    super(new Tag('#root', ParseSettings.normalName('#root'), namespace), baseUri)
  }

  override nodeName(): string {
    return '#document'
  }

  static createShell(baseUri: string): Document {
    const doc = new Document(NamespaceHtml, baseUri)
    const html = doc.appendElement('html')
    html.appendElement('head')
    html.appendElement('body')
    return doc
  }

  private htmlEl(): Element {
    let el = this.firstElementChild()
    while (el !== null) {
      if (el.nameIs('html')) return el
      el = el.nextElementSibling()
    }
    return this.appendElement('html')
  }

  body(): Element {
    const html = this.htmlEl()
    let el = html.firstElementChild()
    while (el !== null) {
      if (el.nameIs('body') || el.nameIs('frameset')) return el
      el = el.nextElementSibling()
    }
    return html.appendElement('body')
  }

  // PORT: surcharges quirksMode() / quirksMode(QuirksMode) fusionnées
  quirksMode(mode?: 'noQuirks' | 'quirks' | 'limitedQuirks'): 'noQuirks' | 'quirks' | 'limitedQuirks' {
    if (mode !== undefined) this.quirksMode_ = mode
    return this.quirksMode_
  }
}

// ---------------------------------------------------------------------------
// parser.TreeBuilder
// ---------------------------------------------------------------------------

abstract class TreeBuilder {
  doc!: Document
  reader!: CharacterReader
  tokeniser!: Tokeniser
  stack!: (Element | null)[]
  baseUri = ''
  currentToken!: Token
  settings!: ParseSettings
  tagSet!: TagSet
  maxDepth = 512
  private start!: StartTagToken
  private readonly end = new EndTagToken(null)

  abstract defaultSettings(): ParseSettings

  abstract defaultTagSet(): TagSet

  abstract defaultMaxDepth(): number

  defaultNamespace(): string {
    return NamespaceHtml
  }

  initialiseParse(input: string, baseUri: string): void {
    this.doc = new Document(this.defaultNamespace(), baseUri)
    this.settings = this.defaultSettings()
    this.reader = new CharacterReader(input)
    this.tokeniser = new Tokeniser(this)
    this.stack = []
    this.tagSet = this.defaultTagSet()
    this.maxDepth = this.defaultMaxDepth()
    this.start = new StartTagToken(this)
    this.currentToken = this.start // init current token to the virtual start token.
    this.baseUri = baseUri
  }

  parse(input: string, baseUri: string): Document {
    this.initialiseParse(input, baseUri)
    this.runParser()
    return this.doc
  }

  parseFragment(inputFragment: string, context: Element | null, baseUri: string): Node[] {
    this.initialiseParse(inputFragment, baseUri)
    this.initialiseParseFragment(context)
    this.runParser()
    return this.completeParseFragment()
  }

  initialiseParseFragment(_context: Element | null): void {}

  abstract completeParseFragment(): Node[]

  runParser(): void {
    while (this.stepParser()) {
      // run until stepParser sees EOF
    }
  }

  stepParser(): boolean {
    // if we have reached the end already, step by popping off the stack, to hit nodeRemoved callbacks:
    if (this.currentToken.type === 'EOF') {
      if (this.stack === null) {
        return false
      }
      if (this.stack.length === 0) {
        ;(this as { stack: unknown }).stack = null
        return true
      }
      this.pop()
      return true
    }
    const token = this.tokeniser.read()
    this.currentToken = token
    this.process(token)
    token.reset()
    return true
  }

  abstract process(token: Token): boolean

  processStartTag(name: string, attrs?: Attributes): boolean {
    const start = this.start
    if (attrs === undefined) {
      if (this.currentToken === start) {
        // don't recycle an in-use token
        return this.process(new StartTagToken(this).name(name))
      }
      return this.process(start.reset().name(name))
    }
    if (this.currentToken === start) {
      return this.process(new StartTagToken(this).nameAttr(name, attrs))
    }
    start.reset()
    start.nameAttr(name, attrs)
    return this.process(start)
  }

  processEndTag(name: string): boolean {
    if (this.currentToken === this.end) {
      // don't recycle an in-use token
      return this.process(new EndTagToken(this).name(name))
    }
    return this.process(this.end.reset().name(name))
  }

  pop(): Element {
    const size = this.stack.length
    return this.stack.splice(size - 1, 1)[0] as Element
  }

  push(element: Element): void {
    this.stack.push(element)
  }

  enforceStackDepthLimit(): void {
    const maxDepth = this.maxDepth
    if (maxDepth === 2147483647) return
    while (this.stack.length >= maxDepth) {
      const trimmed = this.pop()
      this.onStackPrunedForDepth(trimmed)
    }
  }

  onStackPrunedForDepth(_element: Element): void {}

  currentElement(): Element {
    const size = this.stack.length
    return size > 0 ? (this.stack[size - 1] as Element) : this.doc
  }

  // PORT: surcharges currentElementIs(name) / currentElementIs(name, namespace) fusionnées
  currentElementIs(normalName: string, namespace: string = NamespaceHtml): boolean {
    if (this.stack.length === 0) return false
    const current = this.currentElement()
    return current !== null && current.normalName() === normalName && current.tag().namespace() === namespace
  }

  // PORT: erreurs d'analyse non suivies
  error(..._args: unknown[]): void {}

  // PORT: surcharges tagFor(String, String, String, ParseSettings) / tagFor(Token.Tag) fusionnées
  tagFor(tagNameOrToken: string | TagToken, normalName?: string, namespace?: string, settings?: ParseSettings): Tag {
    if (tagNameOrToken instanceof TagToken) {
      return this.tagSet.valueOf(tagNameOrToken.name(), tagNameOrToken.normalName_, this.defaultNamespace(), this.settings.preserveTagCase())
    }
    return this.tagSet.valueOf(tagNameOrToken, normalName as string, namespace as string, (settings as ParseSettings).preserveTagCase())
  }

  // PORT: positions de source non suivies
  onNodeInserted(_node: Node): void {}

  trackNodePosition(_node: Node | null, _isStart: boolean): void {}
}

// ---------------------------------------------------------------------------
// parser.XmlTreeBuilder
// ---------------------------------------------------------------------------

const XmlnsKey = 'xmlns'
const XmlnsPrefix = 'xmlns:'
const maxXmlQueueDepth = 256

class XmlTreeBuilder extends TreeBuilder {
  private readonly namespacesStack: Map<string, string>[] = []

  defaultSettings(): ParseSettings {
    return ParseSettings.preserveCase
  }

  defaultTagSet(): TagSet {
    return new TagSet() // an empty tagset
  }

  defaultMaxDepth(): number {
    return 2147483647
  }

  override defaultNamespace(): string {
    return NamespaceXml
  }

  override initialiseParse(input: string, baseUri: string): void {
    super.initialiseParse(input, baseUri)
    this.namespacesStack.length = 0
    const ns = new Map<string, string>()
    ns.set('xml', NamespaceXml)
    ns.set('', NamespaceXml)
    this.namespacesStack.push(ns)
  }

  completeParseFragment(): Node[] {
    return this.doc.childNodes()
  }

  process(token: Token): boolean {
    this.currentToken = token

    // start tag, end tag, doctype, xmldecl, comment, character, eof
    switch (token.type) {
      case 'StartTag':
        this.insertElementFor(token.asStartTag())
        break
      case 'EndTag':
        this.popStackToClose(token.asEndTag())
        break
      case 'Comment':
        this.insertLeafNode(new Comment(token.asComment().getData()))
        break
      case 'Character':
        this.insertCharacterFor(token.asCharacter())
        break
      case 'Doctype': {
        const d = token.asDoctype()
        const doctypeNode = new DocumentType(this.settings.normalizeTag(d.getName()), d.getPublicIdentifier(), d.getSystemIdentifier())
        doctypeNode.setPubSysKey(d.getPubSysKey())
        this.insertLeafNode(doctypeNode)
        break
      }
      case 'XmlDecl': {
        const x = token.asXmlDecl()
        this.insertLeafNode(new XmlDeclaration(x.name(), x.isDeclaration))
        break
      }
      case 'EOF': // could put some normalisation here if desired
        break
    }
    return true
  }

  private insertElementFor(startTag: StartTagToken): void {
    // handle namespace for tag
    const namespaces = new Map(this.namespacesStack[this.namespacesStack.length - 1])
    this.namespacesStack.push(namespaces)

    const attributes = startTag.attributes
    if (attributes !== null) {
      this.settings.normalizeAttributes(attributes)
      attributes.deduplicate(this.settings)
      XmlTreeBuilder.processNamespaces(attributes, namespaces)
      // PORT: applyNamespacesToAttributes (données internes des attributs) non porté
    }

    this.enforceStackDepthLimit()

    const tagName = startTag.name()
    const ns = XmlTreeBuilder.resolveNamespace(tagName, namespaces)
    const tag = this.tagFor(tagName, startTag.normalName_ as string, ns, this.settings)
    const el = new Element(tag, null, attributes)
    this.currentElement().appendChild(el)
    this.push(el)

    if (startTag.isSelfClosing()) {
      tag.setSeenSelfClose()
      this.pop() // push & pop ensures onNodeInserted & onNodeClosed
    } else if (tag.isEmpty()) {
      this.pop() // custom defined void tag
    } else {
      const textState = tag.textState()
      if (textState !== null) this.tokeniser.transition(textState)
    }
  }

  private static processNamespaces(attributes: Attributes, namespaces: Map<string, string>): void {
    // process attributes for namespaces (xmlns, xmlns:)
    for (const attr of attributes) {
      const key = attr.getKey()
      const value = attr.getValue()
      if (key === XmlnsKey) {
        namespaces.set('', value) // new default for this level
      } else if (key.startsWith(XmlnsPrefix)) {
        const nsPrefix = key.substring(XmlnsPrefix.length)
        namespaces.set(nsPrefix, value)
      }
    }
  }

  private static resolveNamespace(tagName: string, namespaces: Map<string, string>): string {
    let ns = namespaces.get('') as string
    const pos = tagName.indexOf(':')
    if (pos > 0) {
      const prefix = tagName.substring(0, pos)
      if (namespaces.has(prefix)) ns = namespaces.get(prefix) as string
    }
    return ns
  }

  private insertLeafNode(node: Node): void {
    this.currentElement().appendChild(node)
  }

  private insertCharacterFor(token: CharacterToken): void {
    const data = token.getData()
    let node: Node
    if (token.isCData()) node = new CDataNode(data)
    else if (this.currentElement().tag().is(TagOpt.Data)) node = new DataNode(data)
    else node = new TextNode(data)
    this.insertLeafNode(node)
  }

  override pop(): Element {
    this.namespacesStack.pop()
    return super.pop()
  }

  private popStackToClose(endTag: EndTagToken): void {
    // like in HtmlTreeBuilder - don't scan up forever for very (artificially) deeply nested stacks
    const elName = this.settings.normalizeTag(endTag.name())
    let firstFound: Element | null = null

    const bottom = this.stack.length - 1
    const upper = bottom >= maxXmlQueueDepth ? bottom - maxXmlQueueDepth : 0
    for (let pos = this.stack.length - 1; pos >= upper; pos--) {
      const next = this.stack[pos] as Element
      if (next.nodeName() === elName) {
        firstFound = next
        break
      }
    }
    if (firstFound === null) return // not found, skip

    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const next = this.pop()
      if (next === firstFound) {
        break
      }
    }
  }
}


// ---------------------------------------------------------------------------
// parser.HtmlTreeBuilder
// ---------------------------------------------------------------------------

function inSorted(needle: string, haystack: readonly string[]): boolean {
  return haystack.includes(needle)
}

function inArr(needle: string, haystack: readonly string[]): boolean {
  return haystack.includes(needle)
}

function jeq(a: unknown, b: unknown): boolean {
  return a === b
}

function validateWtf(msg: string): never {
  throw new IllegalStateException(msg)
}

class NoscriptState {
  constructor(
    readonly boundary: Element,
    readonly savedFormElement: FormElement | null,
  ) {}
}

const maxQueueDepth = 256 // an arbitrary tension point between real HTML and crafted pain
const maxUsedFormattingElements = 12 // limit how many elements get recreated

class HtmlTreeBuilder extends TreeBuilder {
  static readonly TagMathMlTextIntegration = ['mi', 'mn', 'mo', 'ms', 'mtext']
  static readonly TagSvgHtmlIntegration = ['desc', 'foreignObject', 'title']
  static readonly TagFormListed = ['button', 'fieldset', 'input', 'keygen', 'object', 'output', 'select', 'textarea']

  private state!: HState
  private originalState_: HState | null = null
  private headElement: Element | null = null
  private formElement: FormElement | null = null
  private contextElement: Element | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formattingElements!: any[]
  private tmplInsertMode!: HState[]
  private noscriptState: NoscriptState | null = null
  private pendingTableCharacters!: CharacterToken[]
  private emptyEnd!: EndTagToken
  private framesetOk_ = true
  private fosterInserts = false
  private fragmentParsing = false

  defaultSettings(): ParseSettings {
    return ParseSettings.htmlDefault
  }

  defaultTagSet(): TagSet {
    return TagSet.Html()
  }

  defaultMaxDepth(): number {
    return 512
  }

  override initialiseParse(input: string, baseUri: string): void {
    super.initialiseParse(input, baseUri)

    // this is a bit mucky. todo - probably just create new parser objects to ensure all reset.
    this.state = HS.Initial
    this.originalState_ = null
    this.headElement = null
    this.formElement = null
    this.contextElement = null
    this.formattingElements = []
    this.tmplInsertMode = []
    this.noscriptState = null
    this.pendingTableCharacters = []
    this.emptyEnd = new EndTagToken(this)
    this.framesetOk_ = true
    this.fosterInserts = false
    this.fragmentParsing = false
  }

  override initialiseParseFragment(context: Element | null): void {
    // context may be null
    this.state = HS.Initial
    this.fragmentParsing = true

    if (context !== null) {
      const contextName = context.normalName()
      this.contextElement = new Element(context.tag(), this.baseUri)
      if (context.hasAttributes()) this.contextElement.attributes().addAll(context.attributes())
      // PORT: quirksMode du document du contexte : noQuirks (Document.createShell)

      // initialise the tokeniser state:
      const contextTag = this.contextElement.tag()
      const htmlContext = NamespaceHtml === contextTag.namespace()
      let contextState = contextTag.textState()
      if (contextState === null) contextState = S.Data
      switch (contextName) {
        case 'script':
          if (htmlContext) {
            contextState = S.ScriptData
          } else if (NamespaceSvg === contextTag.namespace()) {
            contextState = S.Data
          }
          break
        case 'plaintext':
          if (htmlContext) contextState = S.PLAINTEXT
          break
        case 'template':
          if (htmlContext) {
            contextState = S.Data
            this.pushTemplateMode(HS.InTemplate)
          }
          break
      }
      this.tokeniser.transition(contextState)
      this.doc.appendChild(this.contextElement)
      this.push(this.contextElement)
      this.resetInsertionMode()

      // setup form element to nearest form on context (up ancestor chain). ensures form controls are associated
      // with form correctly
      let formSearch: Element | null = context
      while (formSearch !== null) {
        if (formSearch instanceof FormElement) {
          this.formElement = formSearch
          break
        }
        formSearch = formSearch.parent()
      }
      if (htmlContext && contextName === 'noscript') this.enterNoscript(this.contextElement)
    }
  }

  completeParseFragment(): Node[] {
    if (this.contextElement !== null) {
      // depending on context and the input html, content may have been added outside of the root el
      // e.g. context=p, input=div, the div will have been pushed out.
      const nodes = this.contextElement.siblingNodes()
      if (nodes.length !== 0) this.contextElement.insertChildren(-1, nodes)
      return this.contextElement.childNodes()
    } else return this.doc.childNodes()
  }

  // PORT: surcharges process(Token) / process(Token, HtmlTreeBuilderState) fusionnées
  process(token: Token, state?: HState): boolean {
    if (state !== undefined) return state.process(token, this)
    if (this.noscriptState !== null && this.state !== HS.Text) return this.processNoscriptToken(token)
    const dispatch = this.useCurrentOrForeignInsert(token) ? this.state : HS.ForeignContent
    return dispatch.process(token, this)
  }

  private processNoscriptToken(token: Token): boolean {
    switch (token.type) {
      case 'StartTag':
        return this.insertNoscriptStartTag(token.asStartTag())
      case 'EndTag':
        return this.closeNoscriptEndTag(token.asEndTag())
      case 'Comment':
        this.insertCommentNode(token.asComment())
        return true
      case 'Character': {
        const character = token.asCharacter()
        this.insertCharacterNode(character)
        if (!isBlankString(character.getData())) this.framesetOk(false)
        return true
      }
      case 'Doctype':
        this.error(this.state)
        return false
      case 'EOF':
        this.error(this.state)
        this.endNoscript()
        return this.process(token)
      default:
        validateWtf('Unexpected state: ' + token.type)
    }
  }

  private insertNoscriptStartTag(start: StartTagToken): boolean {
    const textState = this.tagFor(start).textState()
    const el = this.insertElementFor(start)
    if (textState !== null) {
      // plaintext is intentionally not TagSet-driven and remains plain fallback markup.
      if (start.isSelfClosing()) {
        if (this.currentElement() === el) this.pop()
      } else {
        this.tokeniser.transition(textState)
        this.markInsertionMode()
        this.transition(HS.Text)
      }
    }
    this.framesetOk(false)
    return true
  }

  private closeNoscriptEndTag(end: EndTagToken): boolean {
    const name = end.normalName()
    const island = this.noscriptState as NoscriptState
    if (name === 'noscript' && island.boundary !== this.contextElement) {
      this.endNoscript()
      return true
    }
    if (!this.inNoscriptScope(name)) {
      this.error(this.state)
      return false
    }
    if (!this.currentElementIs(name)) this.error(this.state)
    this.popStackToClose(name)
    return true
  }

  useCurrentOrForeignInsert(token: Token): boolean {
    // https://html.spec.whatwg.org/multipage/parsing.html#tree-construction
    // If the stack of open elements is empty
    if (this.stack.length === 0) return true
    const el = this.currentElement()
    const ns = el.tag().namespace()

    // If the adjusted current node is an element in the HTML namespace
    if (NamespaceHtml === ns) return true

    // If the adjusted current node is a MathML text integration point and the token is a start tag whose tag name is neither "mglyph" nor "malignmark"
    // If the adjusted current node is a MathML text integration point and the token is a character token
    if (HtmlTreeBuilder.isMathmlTextIntegration(el)) {
      if (token.isStartTag() && 'mglyph' !== token.asStartTag().normalName_ && 'malignmark' !== token.asStartTag().normalName_) return true
      if (token.isCharacter()) return true
    }
    // If the adjusted current node is a MathML annotation-xml element and the token is a start tag whose tag name is "svg"
    if (NamespaceMathml === ns && el.nameIs('annotation-xml') && token.isStartTag() && 'svg' === token.asStartTag().normalName_) return true

    // If the adjusted current node is an HTML integration point and the token is a start tag
    // If the adjusted current node is an HTML integration point and the token is a character token
    if (HtmlTreeBuilder.isHtmlIntegration(el) && (token.isStartTag() || token.isCharacter())) return true

    // If the token is an end-of-file token
    return token.isEOF()
  }

  static isMathmlTextIntegration(el: Element): boolean {
    return NamespaceMathml === el.tag().namespace() && inSorted(el.normalName(), HtmlTreeBuilder.TagMathMlTextIntegration)
  }

  static isHtmlIntegration(el: Element): boolean {
    if (NamespaceMathml === el.tag().namespace() && el.nameIs('annotation-xml')) {
      const encoding = normalize(el.attr('encoding'))
      if (encoding === 'text/html' || encoding === 'application/xhtml+xml') return true
    }
    // note using .tagName for case-sensitive hit here of foreignObject
    return NamespaceSvg === el.tag().namespace() && inArr(el.tagName(), HtmlTreeBuilder.TagSvgHtmlIntegration)
  }

  transition(state: HState): void {
    this.state = state
  }

  state_(): HState {
    return this.state
  }

  markInsertionMode(): void {
    this.originalState_ = this.state
  }

  originalState(): HState {
    return this.originalState_ as HState
  }

  // PORT: surcharges framesetOk() / framesetOk(boolean) fusionnées
  framesetOk(framesetOk?: boolean): boolean {
    if (framesetOk !== undefined) this.framesetOk_ = framesetOk
    return this.framesetOk_
  }

  getDocument(): Document {
    return this.doc
  }

  getBaseUri(): string {
    return this.baseUri
  }

  // PORT: <base href> sans effet sur le texte : non porté
  maybeSetBaseUri(_base: Element): void {}

  isFragmentParsing(): boolean {
    return this.fragmentParsing
  }

  createElementFor(startTag: StartTagToken, namespace: string, forcePreserveCase: boolean): Element {
    // dedupe and normalize the attributes:
    const attributes = startTag.attributes
    if (attributes !== null && !attributes.isEmpty()) {
      if (!forcePreserveCase) this.settings.normalizeAttributes(attributes)
      attributes.deduplicate(this.settings)
    }

    const tag = this.tagFor(startTag.name(), startTag.normalName_ as string, namespace, forcePreserveCase ? ParseSettings.preserveCase : this.settings)

    return tag.normalName() === 'form' ? new FormElement(tag, null, attributes) : new Element(tag, null, attributes)
  }

  /** Inserts an HTML element for the given tag */
  insertElementFor(startTag: StartTagToken): Element {
    const el = this.createElementFor(startTag, NamespaceHtml, false)
    this.doInsertElement(el)

    // handle self-closing tags. when the spec expects an empty (void) tag, will directly hit insertEmpty, so won't generate this fake end tag.
    if (startTag.isSelfClosing()) {
      const tag = el.tag()
      tag.setSeenSelfClose() // can infer output if in xml syntax
      if (tag.isEmpty()) {
        // treated as empty below; nothing further
      } else if (tag.isKnownTag() && tag.isSelfClosing()) {
        // ensure we get out of whatever state we are in. emitted for yielded processing
        this.tokeniser.transition(S.Data)
        this.tokeniser.emit(this.emptyEnd.reset().name(el.tagName()))
      } else {
        // error: not a void tag
      }
    }

    if (el.tag().isEmpty()) {
      this.pop() // custom void tags behave like built-in voids (no children, not left on stack); known empty go via insertEmpty
    }

    return el
  }

  /** Inserts a foreign element. Preserves the case of the tag name and of the attributes. */
  insertForeignElementFor(startTag: StartTagToken, namespace: string): Element {
    const el = this.createElementFor(startTag, namespace, true)
    this.doInsertElement(el)

    if (startTag.isSelfClosing()) {
      // foreign els are OK to self-close
      el.tag().setSeenSelfClose() // remember this is self-closing for output
      this.pop()
    }

    return el
  }

  insertEmptyElementFor(startTag: StartTagToken): Element {
    const el = this.createElementFor(startTag, NamespaceHtml, false)
    this.doInsertElement(el)
    this.pop()
    return el
  }

  insertFormElement(startTag: StartTagToken, onStack: boolean, checkTemplateStack: boolean): FormElement {
    const el = this.createElementFor(startTag, NamespaceHtml, false) as FormElement
    if (checkTemplateStack) {
      if (!this.onStack('template')) this.setFormElement(el)
    } else this.setFormElement(el)

    this.doInsertElement(el)
    if (!onStack) this.pop()
    return el
  }

  /** Inserts the Element onto the stack. All element inserts must run through this method. */
  private doInsertElement(el: Element): void {
    this.enforceStackDepthLimit()

    if (this.formElement !== null && el.tag().namespace() === NamespaceHtml && inSorted(el.normalName(), HtmlTreeBuilder.TagFormListed))
      this.formElement.addElement(el) // connect form controls to their form element

    // in HTML, the xmlns attribute if set must match what the parser set the tag's namespace to
    if (this.isFosterInserts() && inSorted(this.currentElement().normalName(), C.InTableFoster)) this.insertInFosterParent(el)
    else this.currentElement().appendChild(el)

    this.push(el)
  }

  insertCommentNode(token: CommentToken): void {
    const node = new Comment(token.getData())
    this.currentElement().appendChild(node)
  }

  /** Inserts the provided character token into the current element. */
  insertCharacterNode(characterToken: CharacterToken, replace = false): void {
    characterToken.normalizeNulls(replace)
    const el = this.currentElement() // will be doc if no current element; allows for whitespace to be inserted into the doc root object (not on the stack)
    this.insertCharacterToElement(characterToken, el)
  }

  /** Inserts the provided character token into the provided element. */
  insertCharacterToElement(characterToken: CharacterToken, el: Element): void {
    let node: Node
    const data = characterToken.getData()

    if (characterToken.isCData()) node = new CDataNode(data)
    else if (el.tag().is(TagOpt.Data)) node = new DataNode(data)
    else node = new TextNode(data)
    el.appendChild(node) // doesn't use insertNode, because we don't foster these; and will always have a stack.
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getStack(): any[] {
    return this.stack
  }

  // PORT: surcharges onStack(Element) / onStack(String) fusionnées
  onStack(elOrName: Element | string): boolean {
    if (typeof elOrName === 'string') return this.getFromStack(elOrName) !== null
    return HtmlTreeBuilder.onStackQueue(this.stack, elOrName)
  }

  private static onStackQueue(queue: (Element | null)[], element: Element): boolean {
    const bottom = queue.length - 1
    const upper = bottom >= maxQueueDepth ? bottom - maxQueueDepth : 0
    for (let pos = bottom; pos >= upper; pos--) {
      const next = queue[pos]
      if (next === element) {
        return true
      }
    }
    return false
  }

  /** Gets the nearest (lowest) HTML element with the given name from the stack. */
  getFromStack(elName: string): Element | null {
    const bottom = this.stack.length - 1
    const upper = bottom >= maxQueueDepth ? bottom - maxQueueDepth : 0
    for (let pos = bottom; pos >= upper; pos--) {
      const next = this.stack[pos] as Element
      if (next.elementIs(elName, NamespaceHtml)) {
        return next
      }
    }
    return null
  }

  removeFromStack(el: Element): boolean {
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const next = this.stack[pos]
      if (next === el) {
        this.stack.splice(pos, 1)
        return true
      }
    }
    return false
  }

  override onStackPrunedForDepth(element: Element): void {
    // handle other effects of popping to keep state correct
    if (element === this.headElement) this.headElement = null
    if (element === this.formElement) this.setFormElement(null)
    this.removeFromActiveFormattingElements(element)
    if (element.nameIs('template')) {
      this.clearFormattingElementsToLastMarker()
      if (this.templateModeSize() > 0) this.popTemplateMode()
      this.resetInsertionMode()
    } else if (this.noscriptState !== null && element === this.noscriptState.boundary) {
      this.restoreNoscriptState()
    }
  }

  // PORT: surcharges popStackToClose(String) / popStackToClose(String...) fusionnées (tableau => varargs)
  popStackToClose(elNameOrNames: string | readonly string[]): Element | null {
    if (typeof elNameOrNames === 'string') {
      for (let pos = this.stack.length - 1; pos >= 0; pos--) {
        const el = this.pop()
        if (el.elementIs(elNameOrNames, NamespaceHtml)) {
          return el
        }
      }
      return null
    }
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const el = this.pop()
      if (inSorted(el.normalName(), elNameOrNames) && NamespaceHtml === el.tag().namespace()) {
        break
      }
    }
    return null
  }

  popStackToCloseAnyNamespace(elName: string): Element | null {
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const el = this.pop()
      if (el.nameIs(elName)) {
        return el
      }
    }
    return null
  }

  clearStackToTableContext(): void {
    this.clearStackToContext('table', 'template')
  }

  clearStackToTableBodyContext(): void {
    this.clearStackToContext('tbody', 'tfoot', 'thead', 'template')
  }

  clearStackToTableRowContext(): void {
    this.clearStackToContext('tr', 'template')
  }

  /** Removes elements from the stack until one of the supplied HTML elements is removed. */
  private clearStackToContext(...nodeNames: string[]): void {
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const next = this.stack[pos] as Element
      if (NamespaceHtml === next.tag().namespace() && (inArr(next.normalName(), nodeNames) || next.nameIs('html'))) break
      else this.pop()
    }
  }

  aboveOnStack(el: Element): Element | null {
    if (!this.onStack(el)) return null
    for (let pos = this.stack.length - 1; pos > 0; pos--) {
      const next = this.stack[pos]
      if (next === el) {
        return this.stack[pos - 1] as Element
      }
    }
    return null
  }

  insertOnStackAfter(after: Element, inEl: Element): void {
    const i = this.stack.lastIndexOf(after)
    if (i === -1) {
      this.stack.push(inEl)
    } else {
      this.stack.splice(i + 1, 0, inEl)
    }
  }

  replaceOnStack(out: Element, inEl: Element): void {
    HtmlTreeBuilder.replaceInQueue(this.stack, out, inEl)
  }

  private static replaceInQueue(queue: (Element | null)[], out: Element, inEl: Element): void {
    const i = queue.lastIndexOf(out)
    if (i === -1) throw new IllegalArgumentException('Must be true')
    queue[i] = inEl
  }

  /** Reset the insertion mode, by searching up the stack for an appropriate insertion mode. */
  resetInsertionMode(): boolean {
    // https://html.spec.whatwg.org/multipage/parsing.html#the-insertion-mode
    let last = false
    const bottom = this.stack.length - 1
    const upper = bottom >= maxQueueDepth ? bottom - maxQueueDepth : 0
    const origState = this.state

    if (this.stack.length === 0) {
      // nothing left of stack, just get to body
      this.transition(HS.InBody)
    }

    LOOP: for (let pos = bottom; pos >= upper; pos--) {
      let node: Element | null = this.stack[pos] as Element
      if (pos === upper) {
        last = true
        if (this.fragmentParsing) node = this.contextElement
      }
      const name = node !== null && NamespaceHtml === node.tag().namespace() ? node.normalName() : ''
      switch (name) {
        case 'select':
          this.transition(HS.InSelect)
          // todo - should loop up (with some limit) and check for table or template hits
          break LOOP
        case 'td':
        case 'th':
          if (!last) {
            this.transition(HS.InCell)
            break LOOP
          }
          break
        case 'tr':
          this.transition(HS.InRow)
          break LOOP
        case 'tbody':
        case 'thead':
        case 'tfoot':
          this.transition(HS.InTableBody)
          break LOOP
        case 'caption':
          this.transition(HS.InCaption)
          break LOOP
        case 'colgroup':
          this.transition(HS.InColumnGroup)
          break LOOP
        case 'table':
          this.transition(HS.InTable)
          break LOOP
        case 'template': {
          const tmplState = this.currentTemplateMode()
          if (tmplState === null) throw new IllegalArgumentException('Bug: no template insertion mode on stack!')
          this.transition(tmplState)
          break LOOP
        }
        case 'head':
          if (!last) {
            this.transition(HS.InHead)
            break LOOP
          }
          break
        case 'body':
          this.transition(HS.InBody)
          break LOOP
        case 'frameset':
          this.transition(HS.InFrameset)
          break LOOP
        case 'html':
          this.transition(this.headElement === null ? HS.BeforeHead : HS.AfterHead)
          break LOOP
      }
      if (last) {
        this.transition(HS.InBody)
        break
      }
    }
    return this.state !== origState
  }

  /** Places the body back onto the stack and moves to InBody, for cases in AfterBody / AfterAfterBody when more content comes */
  resetBody(): void {
    if (!this.onStack('body')) {
      this.stack.push(this.doc.body()) // not onNodeInserted, as already seen
    }
    this.transition(HS.InBody)
  }

  private inSpecificScope(targetName: string, boundaryOptions: number): boolean {
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const el = this.stack[pos] as Element
      const tag = el.tag()
      if (NamespaceHtml === tag.namespace() && el.normalName() === targetName) return true
      if (tag.hasParserOption(boundaryOptions)) return false
    }
    return false
  }

  hasHeadingInScope(): boolean {
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const el = this.stack[pos] as Element
      const tag = el.tag()
      if (NamespaceHtml === tag.namespace() && inSorted(el.normalName(), C.Headings)) return true
      if (tag.hasParserOption(HtmlTagOptions.Scope)) return false
    }
    return false
  }

  inScope(targetName: string): boolean {
    return this.inSpecificScope(targetName, HtmlTagOptions.Scope)
  }

  inListItemScope(targetName: string): boolean {
    return this.inSpecificScope(targetName, HtmlTagOptions.Scope | HtmlTagOptions.ListScope)
  }

  inButtonScope(targetName: string): boolean {
    return this.inSpecificScope(targetName, HtmlTagOptions.Scope | HtmlTagOptions.ButtonScope)
  }

  inTableScope(targetName: string): boolean {
    return this.inSpecificScope(targetName, HtmlTagOptions.TableScope)
  }

  inSelectScope(targetName: string): boolean {
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const el = this.stack[pos] as Element
      const elName = el.normalName()
      if (elName === targetName) return true
      if (!el.tag().hasParserOption(HtmlTagOptions.SelectScopeMember)) return false
    }
    return false // nothing left on stack
  }

  /** Tests if there is some element on the stack that is not in the provided set. */
  onStackNot(allowedTags: readonly string[]): boolean {
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const elName = (this.stack[pos] as Element).normalName()
      if (!inSorted(elName, allowedTags)) return true
    }
    return false
  }

  setHeadElement(headElement: Element): void {
    this.headElement = headElement
  }

  getHeadElement(): Element {
    return this.headElement as Element
  }

  isFosterInserts(): boolean {
    return this.fosterInserts
  }

  setFosterInserts(fosterInserts: boolean): void {
    this.fosterInserts = fosterInserts
  }

  getFormElement(): FormElement | null {
    return this.formElement
  }

  setFormElement(formElement: FormElement | null): void {
    this.formElement = formElement
  }

  startNoscript(startTag: StartTagToken): void {
    const boundary = this.insertElementFor(startTag)
    this.enterNoscript(boundary)
  }

  private enterNoscript(boundary: Element): void {
    this.noscriptState = new NoscriptState(boundary, this.formElement)
    this.setFormElement(null)
  }

  private inNoscriptScope(name: string): boolean {
    const state = this.noscriptState
    if (state === null) return false
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      const el = this.stack[pos] as Element
      if (el === state.boundary) return false
      if (el.nameIs(name)) return true
    }
    return false
  }

  private endNoscript(): void {
    const state = this.noscriptState as NoscriptState
    const boundary = this.noscriptBoundaryIndex(state)
    if (boundary === -1) {
      this.error(this.state)
      this.restoreNoscriptState()
      return
    }
    if (this.stack[this.stack.length - 1] !== state.boundary) this.error(this.state)
    while (this.stack.length > boundary) this.pop()
    this.restoreNoscriptState()
  }

  private noscriptBoundaryIndex(state: NoscriptState): number {
    for (let pos = this.stack.length - 1; pos >= 0; pos--) {
      if (this.stack[pos] === state.boundary) return pos
    }
    return -1
  }

  private restoreNoscriptState(): void {
    const state = this.noscriptState as NoscriptState
    this.noscriptState = null
    this.setFormElement(state.savedFormElement)
  }

  resetPendingTableCharacters(): void {
    this.pendingTableCharacters.length = 0
  }

  getPendingTableCharacters(): CharacterToken[] {
    return this.pendingTableCharacters
  }

  addPendingTableCharacters(c: CharacterToken): void {
    // make a copy of the token to maintain its state (as Tokens are otherwise reset)
    const copy = new CharacterToken(c)
    this.pendingTableCharacters.push(copy)
  }

  // PORT: surcharges generateImpliedEndTags(String) / () / (boolean) fusionnées
  generateImpliedEndTags(arg?: string | boolean): void {
    if (typeof arg === 'string') {
      const excludeTag = arg
      while (this.currentElement().tag().hasParserOption(HtmlTagOptions.ImpliedEnd)) {
        if (excludeTag !== null && this.currentElementIs(excludeTag)) break
        this.pop()
      }
      return
    }
    const thorough = arg ?? false
    const option = thorough ? HtmlTagOptions.ThoroughImpliedEnd : HtmlTagOptions.ImpliedEnd
    for (;;) {
      const tag = this.currentElement().tag()
      if (!tag.hasParserOption(option)) break
      this.pop()
    }
  }

  closeElement(name: string): void {
    this.generateImpliedEndTags(name)
    if (name !== this.currentElement().normalName()) this.error(this.state_())
    this.popStackToClose(name)
  }

  static isSpecial(el: Element): boolean {
    return el.tag().hasParserOption(HtmlTagOptions.Special)
  }

  lastFormattingElement(): Element | null {
    return this.formattingElements.length > 0 ? (this.formattingElements[this.formattingElements.length - 1] ?? null) : null
  }

  positionOfElement(el: Element): number {
    for (let i = 0; i < this.formattingElements.length; i++) {
      if (el === this.formattingElements[i]) return i
    }
    return -1
  }

  removeLastFormattingElement(): Element | null {
    const size = this.formattingElements.length
    if (size > 0) return this.formattingElements.splice(size - 1, 1)[0] ?? null
    else return null
  }

  // active formatting elements
  pushActiveFormattingElements(inEl: Element): void {
    this.checkActiveFormattingElements(inEl)
    this.formattingElements.push(inEl)
  }

  pushWithBookmark(inEl: Element, bookmark: number): void {
    this.checkActiveFormattingElements(inEl)
    // catch any range errors and assume bookmark is incorrect - saves a redundant range check.
    if (bookmark < 0 || bookmark > this.formattingElements.length) this.formattingElements.push(inEl)
    else this.formattingElements.splice(bookmark, 0, inEl)
  }

  checkActiveFormattingElements(inEl: Element): void {
    let numSeen = 0
    const size = this.formattingElements.length - 1
    let ceil = size - maxUsedFormattingElements
    if (ceil < 0) ceil = 0

    for (let pos = size; pos >= ceil; pos--) {
      const el = this.formattingElements[pos] ?? null
      if (el === null)
        // marker
        break

      if (HtmlTreeBuilder.isSameFormattingElement(inEl, el)) numSeen++

      if (numSeen === 3) {
        this.formattingElements.splice(pos, 1)
        break
      }
    }
  }

  private static isSameFormattingElement(a: Element, b: Element): boolean {
    // same if: same namespace, tag, and attributes. Element.equals only checks tag, might in future check children
    return a.normalName() === b.normalName() && a.attributes().equals(b.attributes())
  }

  reconstructFormattingElements(): void {
    if (this.stack.length > maxQueueDepth) return
    const last = this.lastFormattingElement()
    if (last === null || this.onStack(last)) return

    let entry: Element | null = last
    const size = this.formattingElements.length
    let ceil = size - maxUsedFormattingElements
    if (ceil < 0) ceil = 0
    let pos = size - 1
    let skip = false
    for (;;) {
      if (pos === ceil) {
        // step 4. if none before, skip to 8
        skip = true
        break
      }
      entry = this.formattingElements[--pos] ?? null // step 5. one earlier than entry
      if (entry === null || this.onStack(entry))
        // step 6 - neither marker nor on stack
        break // jump to 8, else continue back to 4
    }
    for (;;) {
      if (!skip)
        // step 7: on later than entry
        entry = this.formattingElements[++pos] ?? null
      if (entry === null) throw new IllegalArgumentException('Object must not be null') // should not occur, as we break at last element

      // 8. create new element from element, 9 insert into current node, onto stack
      skip = false // can only skip increment from 4.
      const newEl = new Element(
        this.tagFor(entry.nodeName(), entry.normalName(), this.defaultNamespace(), this.settings),
        null,
        entry.attributes().clone(),
      )
      this.doInsertElement(newEl)

      // 10. replace entry with new entry
      this.formattingElements[pos] = newEl

      // 11
      if (pos === size - 1)
        // if not last entry in list, jump to 7
        break
    }
  }

  clearFormattingElementsToLastMarker(): void {
    while (this.formattingElements.length !== 0) {
      const el = this.removeLastFormattingElement()
      if (el === null) break
    }
  }

  removeFromActiveFormattingElements(el: Element): void {
    for (let pos = this.formattingElements.length - 1; pos >= 0; pos--) {
      const next = this.formattingElements[pos]
      if (next === el) {
        this.formattingElements.splice(pos, 1)
        break
      }
    }
  }

  isInActiveFormattingElements(el: Element): boolean {
    return HtmlTreeBuilder.onStackQueue(this.formattingElements, el)
  }

  getActiveFormattingElement(nodeName: string): Element | null {
    for (let pos = this.formattingElements.length - 1; pos >= 0; pos--) {
      const next = this.formattingElements[pos] ?? null
      if (next === null)
        // scope marker
        break
      else if (next.nameIs(nodeName)) return next
    }
    return null
  }

  replaceActiveFormattingElement(out: Element, inEl: Element): void {
    HtmlTreeBuilder.replaceInQueue(this.formattingElements, out, inEl)
  }

  insertMarkerToFormattingElements(): void {
    this.formattingElements.push(null)
  }

  insertInFosterParent(inNode: Node): void {
    let fosterParent: Element | null
    const lastTable = this.getFromStack('table')
    let isLastTableParent = false
    if (lastTable !== null) {
      if (lastTable.parent() !== null) {
        fosterParent = lastTable.parent()
        isLastTableParent = true
      } else fosterParent = this.aboveOnStack(lastTable)
    } else {
      // no table == frag
      fosterParent = this.stack[0] as Element
    }

    if (isLastTableParent) {
      ;(lastTable as Element).before(inNode)
    } else (fosterParent as Element).appendChild(inNode)
  }

  // Template Insertion Mode stack
  pushTemplateMode(state: HState): void {
    this.tmplInsertMode.push(state)
  }

  popTemplateMode(): HState | null {
    if (this.tmplInsertMode.length > 0) {
      return this.tmplInsertMode.splice(this.tmplInsertMode.length - 1, 1)[0] as HState
    } else {
      return null
    }
  }

  templateModeSize(): number {
    return this.tmplInsertMode.length
  }

  currentTemplateMode(): HState | null {
    return this.tmplInsertMode.length > 0 ? (this.tmplInsertMode[this.tmplInsertMode.length - 1] as HState) : null
  }
}

// ---------------------------------------------------------------------------
// parser.HtmlTreeBuilderState (conversion à plat de l'enum Java)
// ---------------------------------------------------------------------------

abstract class HState {
  constructor(readonly name: string) {}

  abstract process(t: Token, tb: HtmlTreeBuilder): boolean

  toString(): string {
    return this.name
  }
}

function isWhitespaceToken(t: Token): boolean {
  if (t.isCharacter()) {
    const data = t.asCharacter().getData()
    return isBlankString(data)
  }
  return false
}

function handleTextState(startTag: StartTagToken, tb: HtmlTreeBuilder, state: State | null): void {
  if (state !== null) tb.tokeniser.transition(state)
  tb.markInsertionMode()
  tb.transition(HS.Text)
  tb.insertElementFor(startTag)
}

function mergeAttributes(source: StartTagToken, dest: Element): void {
  if (!source.hasAttributes()) return
  for (const attr of source.attributes as Attributes) {
    const destAttrs = dest.attributes()
    if (!destAttrs.hasKey(attr.getKey())) {
      destAttrs.put(attr)
    }
  }
}

const C = {
  InHeadEmpty: ["base", "basefont", "bgsound", "command", "link"],
  InHeadRaw: ["noframes", "style"],
  InHeadEnd: ["body", "br", "html"],
  AfterHeadBody: ["body", "br", "html"],
  BeforeHtmlToHead: ["body", "br", "head", "html"],
  InBodyStartToHead: ["base", "basefont", "bgsound", "command", "link", "meta", "noframes", "script", "style", "template", "title"],
  InBodyStartPClosers: ["address", "article", "aside", "blockquote", "center", "details", "dir", "div", "dl",
            "fieldset", "figcaption", "figure", "footer", "header", "hgroup", "menu", "nav", "ol",
            "p", "section", "summary", "ul"],
  Headings: ["h1", "h2", "h3", "h4", "h5", "h6"],
  InBodyStartLiBreakers: ["address", "div", "p"],
  DdDt: ["dd", "dt"],
  InBodyStartApplets: ["applet", "marquee", "object"],
  InBodyStartMedia: ["param", "source", "track"],
  InBodyStartInputAttribs: ["action", "name", "prompt"],
  InBodyStartDrop: ["caption", "col", "colgroup", "frame", "head", "tbody", "td", "tfoot", "th", "thead", "tr"],
  InBodyEndClosers: ["address", "article", "aside", "blockquote", "button", "center", "details", "dir", "div",
            "dl", "fieldset", "figcaption", "figure", "footer", "header", "hgroup", "listing", "menu",
            "nav", "ol", "pre", "section", "summary", "ul"],
  InBodyEndOtherErrors: ["body", "dd", "dt", "html", "li", "optgroup", "option", "p", "rb", "rp", "rt", "rtc", "tbody", "td", "tfoot", "th", "thead", "tr"],
  InBodyEndAdoptionFormatters: ["a", "b", "big", "code", "em", "font", "i", "nobr", "s", "small", "strike", "strong", "tt", "u"],
  InTableToBody: ["tbody", "tfoot", "thead"],
  InTableAddBody: ["td", "th", "tr"],
  InTableToHead: ["script", "style", "template"],
  InCellNames: ["td", "th"],
  InCellBody: ["body", "caption", "col", "colgroup", "html"],
  InCellTable: ["table", "tbody", "tfoot", "thead", "tr"],
  InCellCol: ["caption", "col", "colgroup", "tbody", "td", "tfoot", "th", "thead", "tr"],
  InTableEndErr: ["body", "caption", "col", "colgroup", "html", "tbody", "td", "tfoot", "th", "thead", "tr"],
  InTableFoster: ["table", "tbody", "tfoot", "thead", "tr"],
  InTableBodyExit: ["caption", "col", "colgroup", "tbody", "tfoot", "thead"],
  InTableBodyEndIgnore: ["body", "caption", "col", "colgroup", "html", "td", "th", "tr"],
  InRowMissing: ["caption", "col", "colgroup", "tbody", "tfoot", "thead", "tr"],
  InRowIgnore: ["body", "caption", "col", "colgroup", "html", "td", "th"],
  InSelectEnd: ["input", "keygen", "textarea"],
  InSelectTableEnd: ["caption", "table", "tbody", "td", "tfoot", "th", "thead", "tr"],
  InTableEndIgnore: ["tbody", "tfoot", "thead"],
  InCaptionIgnore: ["body", "col", "colgroup", "html", "tbody", "td", "tfoot", "th", "thead", "tr"],
  InTemplateToHead: ["base", "basefont", "bgsound", "link", "meta", "noframes", "script", "style", "template", "title"],
  InTemplateToTable: ["caption", "colgroup", "tbody", "tfoot", "thead"],
  InForeignToHtml: ["b", "big", "blockquote", "body", "br", "center", "code", "dd", "div", "dl", "dt", "em", "embed", "h1", "h2", "h3", "h4", "h5", "h6", "head", "hr", "i", "img", "li", "listing", "menu", "meta", "nobr", "ol", "p", "pre", "ruby", "s", "small", "span", "strike", "strong", "sub", "sup", "table", "tt", "u", "ul", "var"],
}

type HStateName =
  | 'Initial'
  | 'BeforeHtml'
  | 'BeforeHead'
  | 'InHead'
  | 'AfterHead'
  | 'InBody'
  | 'Text'
  | 'InTable'
  | 'InTableText'
  | 'InCaption'
  | 'InColumnGroup'
  | 'InTableBody'
  | 'InRow'
  | 'InCell'
  | 'InSelect'
  | 'InSelectInTable'
  | 'InTemplate'
  | 'AfterBody'
  | 'InFrameset'
  | 'AfterFrameset'
  | 'AfterAfterBody'
  | 'AfterAfterFrameset'
  | 'ForeignContent'
const HS = {} as Record<HStateName, HState>

HS.Initial = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (isWhitespaceToken(t)) {
                return true;
            } else if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
            } else if (t.isDoctype()) {
                let d = t.asDoctype();
                let doctype = new DocumentType(
                    tb.settings.normalizeTag(d.getName()), d.getPublicIdentifier(), d.getSystemIdentifier());
                doctype.setPubSysKey(d.getPubSysKey());
                tb.getDocument().appendChild(doctype);
                tb.onNodeInserted(doctype);
                if (d.isForceQuirks() || !jeq(doctype.name(), "html") || equalsIgnoreCase(doctype.publicId(), "HTML"))
                    tb.getDocument().quirksMode('quirks');
                tb.transition(HS.BeforeHtml);
            } else {
                tb.getDocument().quirksMode('quirks');
                tb.transition(HS.BeforeHtml);
                return tb.process(t);
            }
            return true;
        }
})('Initial')

HS.BeforeHtml = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.isDoctype()) {
                tb.error(this);
                return false;
            } else if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
            } else if (isWhitespaceToken(t)) {
                tb.insertCharacterNode(t.asCharacter());
            } else if (t.isStartTag() && jeq(t.asStartTag().normalName(), "html")) {
                tb.insertElementFor(t.asStartTag());
                tb.transition(HS.BeforeHead);
            } else if (t.isEndTag() && (inSorted(t.asEndTag().normalName(), C.BeforeHtmlToHead))) {
                return this.anythingElse(t, tb);
            } else if (t.isEndTag()) {
                tb.error(this);
                return false;
            } else {
                return this.anythingElse(t, tb);
            }
            return true;
        }
        anythingElse(t: Token, tb: HtmlTreeBuilder): boolean {
            tb.processStartTag("html");
            tb.transition(HS.BeforeHead);
            return tb.process(t);
        }
})('BeforeHtml')

HS.BeforeHead = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (isWhitespaceToken(t)) {
                tb.insertCharacterNode(t.asCharacter());
            } else if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
            } else if (t.isDoctype()) {
                tb.error(this);
                return false;
            } else if (t.isStartTag() && jeq(t.asStartTag().normalName(), "html")) {
                return HS.InBody.process(t, tb);
            } else if (t.isStartTag() && jeq(t.asStartTag().normalName(), "head")) {
                let head = tb.insertElementFor(t.asStartTag());
                tb.setHeadElement(head);
                tb.transition(HS.InHead);
            } else if (t.isEndTag() && (inSorted(t.asEndTag().normalName(), C.BeforeHtmlToHead))) {
                tb.processStartTag("head");
                return tb.process(t);
            } else if (t.isEndTag()) {
                tb.error(this);
                return false;
            } else {
                tb.processStartTag("head");
                return tb.process(t);
            }
            return true;
        }
})('BeforeHead')

HS.InHead = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (isWhitespaceToken(t)) {
                tb.insertCharacterNode(t.asCharacter());
                return true;
            }
            let name: any;
            switch (t.type) {
                case 'Comment':
                    tb.insertCommentNode(t.asComment());
                    break;
                case 'Doctype':
                    tb.error(this);
                    return false;
                case 'StartTag':
                    let start = t.asStartTag();
                    name = start.normalName();
                    if (jeq(name, "html")) {
                        return HS.InBody.process(t, tb);
                    } else if (inSorted(name, C.InHeadEmpty)) {
                        let el = tb.insertEmptyElementFor(start);
                        if (jeq(name, "base") && el.hasAttr("href"))
                            tb.maybeSetBaseUri(el);
                    } else if (jeq(name, "meta")) {
                        tb.insertEmptyElementFor(start);
                    } else if (jeq(name, "title")) {
                        handleTextState(start, tb, tb.tagFor(start).textState());
                    } else if (inSorted(name, C.InHeadRaw)) {
                        handleTextState(start, tb, tb.tagFor(start).textState());
                    } else if (jeq(name, "noscript")) {
                        tb.startNoscript(start);
                    } else if (jeq(name, "script")) {
                        tb.tokeniser.transition(S.ScriptData);
                        tb.markInsertionMode();
                        tb.transition(HS.Text);
                        tb.insertElementFor(start);
                    } else if (jeq(name, "head")) {
                        tb.error(this);
                        return false;
                    } else if (jeq(name, "template")) {
                        tb.insertElementFor(start);
                        tb.insertMarkerToFormattingElements();
                        tb.framesetOk(false);
                        tb.transition(HS.InTemplate);
                        tb.pushTemplateMode(HS.InTemplate);
                    } else {
                        return this.anythingElse(t, tb);
                    }
                    break;
                case 'EndTag':
                    let end = t.asEndTag();
                    name = end.normalName();
                    if (jeq(name, "head")) {
                        tb.pop();
                        tb.transition(HS.AfterHead);
                    } else if (inSorted(name, C.InHeadEnd)) {
                        return this.anythingElse(t, tb);
                    } else if (jeq(name, "template")) {
                        if (!tb.onStack(name)) {
                            tb.error(this);
                        } else {
                            tb.generateImpliedEndTags(true);
                            if (!tb.currentElementIs(name)) tb.error(this);
                            tb.popStackToClose(name);
                            tb.clearFormattingElementsToLastMarker();
                            tb.popTemplateMode();
                            tb.resetInsertionMode();
                        }
                    }
                    else {
                        tb.error(this);
                        return false;
                    }
                    break;
                default:
                    return this.anythingElse(t, tb);
            }
            return true;
        }
        anythingElse(t: Token, tb: HtmlTreeBuilder): boolean {
            tb.processEndTag("head");
            return tb.process(t);
        }
})('InHead')

HS.AfterHead = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (isWhitespaceToken(t)) {
                tb.insertCharacterNode(t.asCharacter());
            } else if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
            } else if (t.isDoctype()) {
                tb.error(this);
            } else if (t.isStartTag()) {
                let startTag = t.asStartTag();
                let name = startTag.normalName();
                if (jeq(name, "html")) {
                    return tb.process(t, HS.InBody);
                } else if (jeq(name, "body")) {
                    tb.insertElementFor(startTag);
                    tb.framesetOk(false);
                    tb.transition(HS.InBody);
                } else if (jeq(name, "frameset")) {
                    tb.insertElementFor(startTag);
                    tb.transition(HS.InFrameset);
                } else if (inSorted(name, C.InBodyStartToHead)) {
                    tb.error(this);
                    let head = tb.getHeadElement();
                    tb.push(head);
                    tb.process(t, HS.InHead);
                    tb.removeFromStack(head);
                } else if (jeq(name, "head")) {
                    tb.error(this);
                    return false;
                } else {
                    this.anythingElse(t, tb);
                }
            } else if (t.isEndTag()) {
                let name = t.asEndTag().normalName();
                if (inSorted(name, C.AfterHeadBody)) {
                    this.anythingElse(t, tb);
                } else if (jeq(name, "template")) {
                    tb.process(t, HS.InHead);
                }
                else {
                    tb.error(this);
                    return false;
                }
            } else {
                this.anythingElse(t, tb);
            }
            return true;
        }
        anythingElse(t: Token, tb: HtmlTreeBuilder): boolean {
            tb.processStartTag("body");
            tb.framesetOk(true);
            return tb.process(t);
        }
})('AfterHead')

HS.InBody = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            switch (t.type) {
                case 'Character': {
                    let c = t.asCharacter();
                    if (tb.framesetOk() && isWhitespaceToken(c)) {
                        tb.reconstructFormattingElements();
                        tb.insertCharacterNode(c);
                    } else {
                        tb.reconstructFormattingElements();
                        tb.insertCharacterNode(c);
                        tb.framesetOk(false);
                    }
                    break;
                }
                case 'Comment': {
                    tb.insertCommentNode(t.asComment());
                    break;
                }
                case 'Doctype': {
                    tb.error(this);
                    return false;
                }
                case 'StartTag':
                    return this.inBodyStartTag(t, tb);
                case 'EndTag':
                    return this.inBodyEndTag(t, tb);
                case 'EOF':
                    if (tb.templateModeSize() > 0)
                        return tb.process(t, HS.InTemplate);
                    if (tb.onStackNot(C.InBodyEndOtherErrors))
                        tb.error(this);
                    break;
                default:
                    validateWtf("Unexpected state: " + t.type);
            }
            return true;
        }
        inBodyStartTag(t: Token, tb: HtmlTreeBuilder): boolean {
            let startTag = t.asStartTag();
            let name = startTag.normalName();
            let stack: any;
            let el: any;
            switch (name) {
                case "a":
                    if (tb.getActiveFormattingElement("a") !== null) {
                        tb.error(this);
                        tb.processEndTag("a");
                        let remainingA = tb.getFromStack("a");
                        if (remainingA !== null) {
                            tb.removeFromActiveFormattingElements(remainingA);
                            tb.removeFromStack(remainingA);
                        }
                    }
                    tb.reconstructFormattingElements();
                    el = tb.insertElementFor(startTag);
                    tb.pushActiveFormattingElements(el);
                    break;
                case "span":
                    tb.reconstructFormattingElements();
                    tb.insertElementFor(startTag);
                    break;
                case "li":
                    tb.framesetOk(false);
                    stack = tb.getStack();
                    for (let i = stack.length - 1; i > 0; i--) {
                        el = stack[i];
                        if (el.nameIs("li")) {
                            tb.processEndTag("li");
                            break;
                        }
                        if (HtmlTreeBuilder.isSpecial(el) && !inSorted(el.normalName(), C.InBodyStartLiBreakers))
                            break;
                    }
                    if (tb.inButtonScope("p")) {
                        tb.processEndTag("p");
                    }
                    tb.insertElementFor(startTag);
                    break;
                case "html":
                    tb.error(this);
                    if (tb.onStack("template")) return false;
                    stack = tb.getStack();
                    if (stack.length > 0) {
                        let html = tb.getStack()[0];
                        mergeAttributes(startTag, html);
                    }
                    break;
                case "body":
                    tb.error(this);
                    stack = tb.getStack();
                    if (stack.length < 2 || (stack.length > 2 && !stack[1].nameIs("body")) || tb.onStack("template")) {
                        return false;
                    } else {
                        tb.framesetOk(false);
                        let body = tb.getFromStack("body");
                        if (body !== null) mergeAttributes(startTag, body);
                    }
                    break;
                case "frameset":
                    tb.error(this);
                    stack = tb.getStack();
                    if (stack.length < 2|| (stack.length > 2 && !stack[1].nameIs("body"))) {
                        return false;
                    } else if (!tb.framesetOk()) {
                        return false;
                    } else {
                        let second = stack[1];
                        if (second.parent() !== null)
                            second.remove();
                        while (stack.length > 1)
                            stack.splice(stack.length - 1, 1);
                        tb.insertElementFor(startTag);
                        tb.transition(HS.InFrameset);
                    }
                    break;
                case "form":
                    if (tb.getFormElement() !== null && !tb.onStack("template")) {
                        tb.error(this);
                        return false;
                    }
                    if (tb.inButtonScope("p")) {
                        tb.closeElement("p");
                    }
                    tb.insertFormElement(startTag, true, true);
                    break;
                case "plaintext":
                    if (tb.inButtonScope("p")) {
                        tb.processEndTag("p");
                    }
                    tb.insertElementFor(startTag);
                    tb.tokeniser.transition(S.PLAINTEXT);
                    break;
                case "button":
                    if (tb.inButtonScope("button")) {
                        tb.error(this);
                        tb.processEndTag("button");
                        tb.process(startTag);
                    } else {
                        tb.reconstructFormattingElements();
                        tb.insertElementFor(startTag);
                        tb.framesetOk(false);
                    }
                    break;
                case "nobr":
                    tb.reconstructFormattingElements();
                    if (tb.inScope("nobr")) {
                        tb.error(this);
                        tb.processEndTag("nobr");
                        tb.reconstructFormattingElements();
                    }
                    el = tb.insertElementFor(startTag);
                    tb.pushActiveFormattingElements(el);
                    break;
                case "table":
                    if (tb.getDocument().quirksMode() !== 'quirks' && tb.inButtonScope("p")) {
                        tb.processEndTag("p");
                    }
                    tb.insertElementFor(startTag);
                    tb.framesetOk(false);
                    tb.transition(HS.InTable);
                    break;
                case "input":
                    tb.reconstructFormattingElements();
                    el = tb.insertEmptyElementFor(startTag);
                    if (!equalsIgnoreCase(el.attr("type"), "hidden"))
                        tb.framesetOk(false);
                    break;
                case "hr":
                    if (tb.inButtonScope("p")) {
                        tb.processEndTag("p");
                    }
                    tb.insertEmptyElementFor(startTag);
                    tb.framesetOk(false);
                    break;
                case "image":
                    if (tb.getFromStack("svg") === null)
                        return tb.process(startTag.name("img"));
                    else
                        tb.insertElementFor(startTag);
                    break;
                case "textarea":
                    tb.framesetOk(false);
                    handleTextState(startTag, tb, tb.tagFor(startTag).textState());
                    break;
                case "xmp":
                    if (tb.inButtonScope("p")) {
                        tb.processEndTag("p");
                    }
                    tb.reconstructFormattingElements();
                    tb.framesetOk(false);
                    handleTextState(startTag, tb, tb.tagFor(startTag).textState());
                    break;
                case "iframe":
                    tb.framesetOk(false);
                    handleTextState(startTag, tb, tb.tagFor(startTag).textState());
                    break;
                case "noembed":
                    handleTextState(startTag, tb, tb.tagFor(startTag).textState());
                    break;
                case "noscript":
                    tb.reconstructFormattingElements();
                    tb.startNoscript(startTag);
                    break;
                case "select":
                    tb.reconstructFormattingElements();
                    tb.insertElementFor(startTag);
                    tb.framesetOk(false);
                    if (startTag.selfClosing) break;
                    let state = tb.state_();
                    if (jeq(state, HS.InTable) || jeq(state, HS.InCaption) || jeq(state, HS.InTableBody) || jeq(state, HS.InRow) || jeq(state, HS.InCell))
                        tb.transition(HS.InSelectInTable);
                    else
                        tb.transition(HS.InSelect);
                    break;
                case "math":
                    tb.reconstructFormattingElements();
                    tb.insertForeignElementFor(startTag, NamespaceMathml);
                    break;
                case "svg":
                    tb.reconstructFormattingElements();
                    tb.insertForeignElementFor(startTag, NamespaceSvg);
                    break;
                case "h1":
                case "h2":
                case "h3":
                case "h4":
                case "h5":
                case "h6":
                    if (tb.inButtonScope("p")) {
                        tb.processEndTag("p");
                    }
                    if (inSorted(tb.currentElement().normalName(), C.Headings)) {
                        tb.error(this);
                        tb.pop();
                    }
                    tb.insertElementFor(startTag);
                    break;
                case "pre":
                case "listing":
                    if (tb.inButtonScope("p")) {
                        tb.processEndTag("p");
                    }
                    tb.insertElementFor(startTag);
                    tb.reader.matchConsume("\n");
                    tb.framesetOk(false);
                    break;
                case "dd":
                case "dt":
                    tb.framesetOk(false);
                    stack = tb.getStack();
                    let bottom = stack.length - 1;
                    let upper = bottom >= this.MaxStackScan ? bottom - this.MaxStackScan : 0;
                    for (let i = bottom; i >= upper; i--) {
                        el = stack[i];
                        if (inSorted(el.normalName(), C.DdDt)) {
                            tb.processEndTag(el.normalName());
                            break;
                        }
                        if (HtmlTreeBuilder.isSpecial(el) && !inSorted(el.normalName(), C.InBodyStartLiBreakers))
                            break;
                    }
                    if (tb.inButtonScope("p")) {
                        tb.processEndTag("p");
                    }
                    tb.insertElementFor(startTag);
                    break;
                case "optgroup":
                case "option":
                    if (tb.currentElementIs("option"))
                        tb.processEndTag("option");
                    tb.reconstructFormattingElements();
                    tb.insertElementFor(startTag);
                    break;
                case "rb":
                case "rtc":
                    if (tb.inScope("ruby")) {
                        tb.generateImpliedEndTags();
                        if (!tb.currentElementIs("ruby"))
                            tb.error(this);
                    }
                    tb.insertElementFor(startTag);
                    break;
                case "rp":
                case "rt":
                    if (tb.inScope("ruby")) {
                        tb.generateImpliedEndTags("rtc");
                        if (!tb.currentElementIs("rtc") && !tb.currentElementIs("ruby"))
                            tb.error(this);
                    }
                    tb.insertElementFor(startTag);
                    break;
                case "area":
                case "br":
                case "embed":
                case "img":
                case "keygen":
                case "wbr":
                    tb.reconstructFormattingElements();
                    tb.insertEmptyElementFor(startTag);
                    tb.framesetOk(false);
                    break;
                case "b":
                case "big":
                case "code":
                case "em":
                case "font":
                case "i":
                case "s":
                case "small":
                case "strike":
                case "strong":
                case "tt":
                case "u":
                    tb.reconstructFormattingElements();
                    el = tb.insertElementFor(startTag);
                    tb.pushActiveFormattingElements(el);
                    break;
                default:
                    let tag = tb.tagFor(startTag);
                    let textState = tag.textState();
                    if (textState !== null) {
                        handleTextState(startTag, tb, textState);
                    } else if (!tag.isKnownTag()) {
                        tb.insertElementFor(startTag);
                    } else if (inSorted(name, C.InBodyStartPClosers)) {
                        if (tb.inButtonScope("p")) tb.processEndTag("p");
                        tb.insertElementFor(startTag);
                    } else if (inSorted(name, C.InBodyStartToHead)) {
                        return tb.process(t, HS.InHead);
                    } else if (inSorted(name, C.InBodyStartApplets)) {
                        tb.reconstructFormattingElements();
                        tb.insertElementFor(startTag);
                        tb.insertMarkerToFormattingElements();
                        tb.framesetOk(false);
                    } else if (inSorted(name, C.InBodyStartMedia)) {
                        tb.insertEmptyElementFor(startTag);
                    } else if (inSorted(name, C.InBodyStartDrop)) {
                        tb.error(this);
                        return false;
                    } else {
                        tb.reconstructFormattingElements();
                        tb.insertElementFor(startTag);
                    }
            }
            return true;
        }
        MaxStackScan = 24
        inBodyEndTag(t: Token, tb: HtmlTreeBuilder): boolean {
            let endTag = t.asEndTag();
            let name = endTag.normalName();
            switch (name) {
                case "template":
                    tb.process(t, HS.InHead);
                    break;
                case "sarcasm":
                case "span":
                    return this.anyOtherEndTag(t, tb);
                case "li":
                    if (!tb.inListItemScope(name)) {
                        tb.error(this);
                        return false;
                    } else {
                        tb.generateImpliedEndTags(name);
                        if (!tb.currentElementIs(name))
                            tb.error(this);
                        tb.popStackToClose(name);
                    }
                    break;
                case "body":
                    if (!tb.inScope("body")) {
                        tb.error(this);
                        return false;
                    } else {
                        if (tb.onStackNot(C.InBodyEndOtherErrors))
                            tb.error(this);
                        tb.trackNodePosition(tb.getFromStack("body"), false);
                        tb.transition(HS.AfterBody);
                    }
                    break;
                case "html":
                    if (!tb.onStack("body")) {
                        tb.error(this);
                        return false;
                    } else {
                        if (tb.onStackNot(C.InBodyEndOtherErrors))
                            tb.error(this);
                        tb.transition(HS.AfterBody);
                        return tb.process(t);
                    }
                case "form":
                    if (!tb.onStack("template")) {
                        let currentForm = tb.getFormElement();
                        tb.setFormElement(null);
                        if (currentForm === null || !tb.inScope(name)) {
                            tb.error(this);
                            return false;
                        }
                        tb.generateImpliedEndTags();
                        if (!tb.currentElementIs(name))
                            tb.error(this);
                        tb.removeFromStack(currentForm);
                    } else {
                        if (!tb.inScope(name)) {
                            tb.error(this);
                            return false;
                        }
                        tb.generateImpliedEndTags();
                        if (!tb.currentElementIs(name)) tb.error(this);
                        tb.popStackToClose(name);
                    }
                    break;
                case "p":
                    if (!tb.inButtonScope(name)) {
                        tb.error(this);
                        tb.processStartTag(name);
                        return tb.process(endTag);
                    } else {
                        tb.generateImpliedEndTags(name);
                        if (!tb.currentElementIs(name))
                            tb.error(this);
                        tb.popStackToClose(name);
                    }
                    break;
                case "dd":
                case "dt":
                    if (!tb.inScope(name)) {
                        tb.error(this);
                        return false;
                    } else {
                        tb.generateImpliedEndTags(name);
                        if (!tb.currentElementIs(name))
                            tb.error(this);
                        tb.popStackToClose(name);
                    }
                    break;
                case "h1":
                case "h2":
                case "h3":
                case "h4":
                case "h5":
                case "h6":
                    if (!tb.hasHeadingInScope()) {
                        tb.error(this);
                        return false;
                    } else {
                        tb.generateImpliedEndTags(name);
                        if (!tb.currentElementIs(name))
                            tb.error(this);
                        tb.popStackToClose(C.Headings);
                    }
                    break;
                case "br":
                    tb.error(this);
                    tb.processStartTag("br");
                    return false;
                default:
                    if (inSorted(name, C.InBodyEndAdoptionFormatters)) {
                        return this.inBodyEndTagAdoption(t, tb);
                    } else if (inSorted(name, C.InBodyEndClosers)) {
                        if (!tb.inScope(name)) {
                            tb.error(this);
                            return false;
                        } else {
                            tb.generateImpliedEndTags();
                            if (!tb.currentElementIs(name))
                                tb.error(this);
                            tb.popStackToClose(name);
                        }
                    } else if (inSorted(name, C.InBodyStartApplets)) {
                        if (!tb.inScope("name")) {
                            if (!tb.inScope(name)) {
                                tb.error(this);
                                return false;
                            }
                            tb.generateImpliedEndTags();
                            if (!tb.currentElementIs(name))
                                tb.error(this);
                            tb.popStackToClose(name);
                            tb.clearFormattingElementsToLastMarker();
                        }
                    } else {
                        return this.anyOtherEndTag(t, tb);
                    }
            }
            return true;
        }
        anyOtherEndTag(t: Token, tb: HtmlTreeBuilder): boolean {
            let name = t.asEndTag().normalName_;
            let stack = tb.getStack();
            let elFromStack = tb.getFromStack(name);
            if (elFromStack === null) {
                tb.error(this);
                return false;
            }
            for (let pos = stack.length - 1; pos >= 0; pos--) {
                let node = stack[pos];
                if (node.nameIs(name)) {
                    tb.generateImpliedEndTags(name);
                    if (!tb.currentElementIs(name))
                        tb.error(this);
                    tb.popStackToClose(name);
                    break;
                } else {
                    if (HtmlTreeBuilder.isSpecial(node)) {
                        tb.error(this);
                        return false;
                    }
                }
            }
            return true;
        }
        inBodyEndTagAdoption(t: Token, tb: HtmlTreeBuilder): boolean {
            let endTag = t.asEndTag();
            let subject = endTag.normalName_;
            if (jeq(tb.currentElement().normalName(), subject) && !tb.isInActiveFormattingElements(tb.currentElement())) {
                tb.pop();
                return true;
            }
            let outer = 0;
            while (true) {
                if (outer >= 8) {
                    return true;
                }
                outer++;
                let formatEl: any = null;
                for (let i = tb.formattingElements.length - 1; i >= 0; i--) {
                    let next = tb.formattingElements[i];
                    if (next === null)
                        break;
                    if (jeq(next.normalName(), subject)) {
                        formatEl = next;
                        break;
                    }
                }
                if (formatEl === null) {
                    return this.anyOtherEndTag(t, tb);
                }
                if (!tb.onStack(formatEl)) {
                    tb.error(this);
                    tb.removeFromActiveFormattingElements(formatEl);
                    return true;
                }
                if (!tb.inScope(formatEl.normalName())) {
                    tb.error(this);
                    return false;
                } else if (tb.currentElement() !== formatEl) {
                    tb.error(this);
                }
                let furthestBlock: any = null;
                let stack = tb.getStack();
                let fei = stack.lastIndexOf(formatEl);
                if (fei !== -1) {
                    for (let i = fei + 1; i < stack.length; i++) {
                        let el = stack[i];
                        if (HtmlTreeBuilder.isSpecial(el)) {
                            furthestBlock = el;
                            break;
                        }
                    }
                }
                if (furthestBlock === null) {
                    while (tb.currentElement() !== formatEl) {
                        tb.pop();
                    }
                    tb.pop();
                    tb.removeFromActiveFormattingElements(formatEl);
                    return true;
                }
                let commonAncestor = tb.aboveOnStack(formatEl);
                if (commonAncestor === null) { tb.error(this); return true; }
                let bookmark = tb.positionOfElement(formatEl);
                let el = furthestBlock;
                let lastEl = furthestBlock;
                let inner = 0;
                while (true) {
                    inner++;
                    if (!tb.onStack(el)) {
                        el = el.parent();
                    } else {
                        el = tb.aboveOnStack(el);
                    }
                    if (el === null || el.nameIs("body")) {
                        tb.error(this);
                        break;
                    }
                    if (el === formatEl) {
                        break;
                    }
                    if (inner > 3 && tb.isInActiveFormattingElements(el)) {
                        tb.removeFromActiveFormattingElements(el);
                        break;
                    }
                    if (!tb.isInActiveFormattingElements(el)) {
                        tb.removeFromStack(el);
                        continue;
                    }
                    if (!tb.onStack(el)) {
                        tb.error(this);
                        tb.removeFromActiveFormattingElements(el);
                        break;
                    }
                    let replacement = new Element(tb.tagFor(el.nodeName(), el.normalName(), tb.defaultNamespace(), ParseSettings.preserveCase), tb.getBaseUri());
                    tb.replaceActiveFormattingElement(el, replacement);
                    tb.replaceOnStack(el, replacement);
                    el = replacement;
                    if (lastEl === furthestBlock) {
                        bookmark = tb.positionOfElement(el) + 1;
                    }
                    el.appendChild(lastEl);
                    lastEl = el;
                }
                commonAncestor.appendChild(lastEl);
                let adoptor = new Element(formatEl.tag(), tb.getBaseUri());
                adoptor.attributes().addAll(formatEl.attributes());
                for (const child of furthestBlock.childNodes()) {
                    adoptor.appendChild(child);
                }
                furthestBlock.appendChild(adoptor);
                tb.removeFromActiveFormattingElements(formatEl);
                tb.pushWithBookmark(adoptor, bookmark);
                tb.removeFromStack(formatEl);
                tb.insertOnStackAfter(furthestBlock, adoptor);
            }
        }
})('InBody')

HS.Text = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.isCharacter()) {
                tb.insertCharacterNode(t.asCharacter());
            } else if (t.isEOF()) {
                tb.error(this);
                tb.pop();
                tb.transition(tb.originalState());
                if (tb.state_() === HS.Text)
                    tb.transition(HS.InBody);
                return tb.process(t);
            } else if (t.isEndTag()) {
                tb.pop();
                tb.transition(tb.originalState());
            }
            return true;
        }
})('Text')

HS.InTable = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.isCharacter() && inSorted(tb.currentElement().normalName(), C.InTableFoster)) {
                tb.resetPendingTableCharacters();
                tb.markInsertionMode();
                tb.transition(HS.InTableText);
                return tb.process(t);
            } else if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
                return true;
            } else if (t.isDoctype()) {
                tb.error(this);
                return false;
            } else if (t.isStartTag()) {
                let startTag = t.asStartTag();
                let name = startTag.normalName();
                if (jeq(name, "caption")) {
                    tb.clearStackToTableContext();
                    tb.insertMarkerToFormattingElements();
                    tb.insertElementFor(startTag);
                    tb.transition(HS.InCaption);
                } else if (jeq(name, "colgroup")) {
                    tb.clearStackToTableContext();
                    tb.insertElementFor(startTag);
                    tb.transition(HS.InColumnGroup);
                } else if (jeq(name, "col")) {
                    tb.clearStackToTableContext();
                    tb.processStartTag("colgroup");
                    return tb.process(t);
                } else if (inSorted(name, C.InTableToBody)) {
                    tb.clearStackToTableContext();
                    tb.insertElementFor(startTag);
                    tb.transition(HS.InTableBody);
                } else if (inSorted(name, C.InTableAddBody)) {
                    tb.clearStackToTableContext();
                    tb.processStartTag("tbody");
                    return tb.process(t);
                } else if (jeq(name, "table")) {
                    tb.error(this);
                    if (!tb.inTableScope(name)) {
                        return false;
                    } else {
                        tb.popStackToClose(name);
                        if (!tb.resetInsertionMode()) {
                            tb.insertElementFor(startTag);
                            return true;
                        }
                        return tb.process(t);
                    }
                } else if (inSorted(name, C.InTableToHead)) {
                    return tb.process(t, HS.InHead);
                } else if (jeq(name, "noscript")) {
                    tb.startNoscript(startTag);
                } else if (jeq(name, "input")) {
                    if (!(startTag.hasAttributes() && equalsIgnoreCase(startTag.attributes!.get("type"), "hidden"))) {
                        return this.anythingElse(t, tb);
                    } else {
                        tb.insertEmptyElementFor(startTag);
                    }
                } else if (jeq(name, "form")) {
                    tb.error(this);
                    if (tb.getFormElement() !== null || tb.onStack("template"))
                        return false;
                    else {
                        tb.insertFormElement(startTag, false, false);
                    }
                } else {
                    return this.anythingElse(t, tb);
                }
                return true;
            } else if (t.isEndTag()) {
                let endTag = t.asEndTag();
                let name = endTag.normalName();
                if (jeq(name, "table")) {
                    if (!tb.inTableScope(name)) {
                        tb.error(this);
                        return false;
                    } else {
                        tb.popStackToClose("table");
                        tb.resetInsertionMode();
                    }
                } else if (inSorted(name, C.InTableEndErr)) {
                    tb.error(this);
                    return false;
                } else if (jeq(name, "template")) {
                    tb.process(t, HS.InHead);
                } else {
                    return this.anythingElse(t, tb);
                }
                return true;
            } else if (t.isEOF()) {
                if (tb.currentElementIs("html"))
                    tb.error(this);
                return true;
            }
            return this.anythingElse(t, tb);
        }
        anythingElse(t: Token, tb: HtmlTreeBuilder): boolean {
            tb.error(this);
            tb.setFosterInserts(true);
            tb.process(t, HS.InBody);
            tb.setFosterInserts(false);
            return true;
        }
})('InTable')

HS.InTableText = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.type === 'Character') {
                tb.addPendingTableCharacters(t.asCharacter());
            } else {
                if (tb.getPendingTableCharacters().length > 0) {
                    let og = tb.currentToken;
                    for (const c of tb.getPendingTableCharacters()) {
                        tb.currentToken = c;
                        if (!isWhitespaceToken(c)) {
                            tb.error(this);
                            if (inSorted(tb.currentElement().normalName(), C.InTableFoster)) {
                                tb.setFosterInserts(true);
                                tb.process(c, HS.InBody);
                                tb.setFosterInserts(false);
                            } else {
                                tb.process(c, HS.InBody);
                            }
                        } else
                            tb.insertCharacterNode(c);
                    }
                    tb.currentToken = og;
                    tb.resetPendingTableCharacters();
                }
                tb.transition(tb.originalState());
                return tb.process(t);
            }
            return true;
        }
})('InTableText')

HS.InCaption = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.isEndTag() && jeq(t.asEndTag().normalName(), "caption")) {
                if (!tb.inTableScope("caption")) {
                    tb.error(this);
                    return false;
                } else {
                    tb.generateImpliedEndTags();
                    if (!tb.currentElementIs("caption")) tb.error(this);
                    tb.popStackToClose("caption");
                    tb.clearFormattingElementsToLastMarker();
                    tb.transition(HS.InTable);
                }
            } else if ((
                    t.isStartTag() && inSorted(t.asStartTag().normalName(), C.InCellCol) ||
                            t.isEndTag() && jeq(t.asEndTag().normalName(), "table"))
                    ) {
                if (!tb.inTableScope("caption")) {
                    tb.error(this);
                    return false;
                }
                tb.generateImpliedEndTags(false);
                if (!tb.currentElementIs("caption")) tb.error(this);
                tb.popStackToClose("caption");
                tb.clearFormattingElementsToLastMarker();
                tb.transition(HS.InTable);
                HS.InTable.process(t, tb);
            } else if (t.isEndTag() && inSorted(t.asEndTag().normalName(), C.InCaptionIgnore)) {
                tb.error(this);
                return false;
            } else {
                return tb.process(t, HS.InBody);
            }
            return true;
        }
})('InCaption')

HS.InColumnGroup = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (isWhitespaceToken(t)) {
                tb.insertCharacterNode(t.asCharacter());
                return true;
            }
            switch (t.type) {
                case 'Comment':
                    tb.insertCommentNode(t.asComment());
                    break;
                case 'Doctype':
                    tb.error(this);
                    break;
                case 'StartTag':
                    let startTag = t.asStartTag();
                    switch (startTag.normalName()) {
                        case "html":
                            return tb.process(t, HS.InBody);
                        case "col":
                            tb.insertEmptyElementFor(startTag);
                            break;
                        case "template":
                            tb.process(t, HS.InHead);
                            break;
                        default:
                            return this.anythingElse(t, tb);
                    }
                    break;
                case 'EndTag':
                    let endTag = t.asEndTag();
                    let name = endTag.normalName();
                    switch (name) {
                        case "colgroup":
                            if (!tb.currentElementIs(name)) {
                                tb.error(this);
                                return false;
                            } else {
                                tb.pop();
                                tb.transition(HS.InTable);
                            }
                            break;
                        case "template":
                            tb.process(t, HS.InHead);
                            break;
                        default:
                            return this.anythingElse(t, tb);
                    }
                    break;
                case 'EOF':
                    if (tb.currentElementIs("html"))
                        return true;
                    else
                        return this.anythingElse(t, tb);
                default:
                    return this.anythingElse(t, tb);
            }
            return true;
        }
        anythingElse(t: Token, tb: HtmlTreeBuilder): boolean {
            if (!tb.currentElementIs("colgroup")) {
                tb.error(this);
                return false;
            }
            tb.pop();
            tb.transition(HS.InTable);
            tb.process(t);
            return true;
        }
})('InColumnGroup')

HS.InTableBody = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            let name: any;
            switch (t.type) {
                case 'StartTag':
                    let startTag = t.asStartTag();
                    name = startTag.normalName();
                    if (jeq(name, "tr")) {
                        tb.clearStackToTableBodyContext();
                        tb.insertElementFor(startTag);
                        tb.transition(HS.InRow);
                    } else if (inSorted(name, C.InCellNames)) {
                        tb.error(this);
                        tb.processStartTag("tr");
                        return tb.process(startTag);
                    } else if (inSorted(name, C.InTableBodyExit)) {
                        return this.exitTableBody(t, tb);
                    } else
                        return this.anythingElse(t, tb);
                    break;
                case 'EndTag':
                    let endTag = t.asEndTag();
                    name = endTag.normalName();
                    if (inSorted(name, C.InTableEndIgnore)) {
                        if (!tb.inTableScope(name)) {
                            tb.error(this);
                            return false;
                        } else {
                            tb.clearStackToTableBodyContext();
                            tb.pop();
                            tb.transition(HS.InTable);
                        }
                    } else if (jeq(name, "table")) {
                        return this.exitTableBody(t, tb);
                    } else if (inSorted(name, C.InTableBodyEndIgnore)) {
                        tb.error(this);
                        return false;
                    } else
                        return this.anythingElse(t, tb);
                    break;
                default:
                    return this.anythingElse(t, tb);
            }
            return true;
        }
        exitTableBody(t: Token, tb: HtmlTreeBuilder): boolean {
            if (!(tb.inTableScope("tbody") || tb.inTableScope("thead") || tb.inTableScope("tfoot"))) {
                tb.error(this);
                return false;
            }
            tb.clearStackToTableBodyContext();
            tb.processEndTag(tb.currentElement().normalName());
            return tb.process(t);
        }
        anythingElse(t: Token, tb: HtmlTreeBuilder): boolean {
            return tb.process(t, HS.InTable);
        }
})('InTableBody')

HS.InRow = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.isStartTag()) {
                let startTag = t.asStartTag();
                let name = startTag.normalName();
                if (inSorted(name, C.InCellNames)) {
                    tb.clearStackToTableRowContext();
                    tb.insertElementFor(startTag);
                    tb.transition(HS.InCell);
                    tb.insertMarkerToFormattingElements();
                } else if (inSorted(name, C.InRowMissing)) {
                    if (!tb.inTableScope("tr")) {
                        tb.error(this);
                        return false;
                    }
                    tb.clearStackToTableRowContext();
                    tb.pop();
                    tb.transition(HS.InTableBody);
                    return tb.process(t);
                } else {
                    return this.anythingElse(t, tb);
                }
            } else if (t.isEndTag()) {
                let endTag = t.asEndTag();
                let name = endTag.normalName();
                if (jeq(name, "tr")) {
                    if (!tb.inTableScope(name)) {
                        tb.error(this);
                        return false;
                    }
                    tb.clearStackToTableRowContext();
                    tb.pop();
                    tb.transition(HS.InTableBody);
                } else if (jeq(name, "table")) {
                    if (!tb.inTableScope("tr")) {
                        tb.error(this);
                        return false;
                    }
                    tb.clearStackToTableRowContext();
                    tb.pop();
                    tb.transition(HS.InTableBody);
                    return tb.process(t);
                } else if (inSorted(name, C.InTableToBody)) {
                    if (!tb.inTableScope(name)) {
                        tb.error(this);
                        return false;
                    }
                    if (!tb.inTableScope("tr")) {
                        return false;
                    }
                    tb.clearStackToTableRowContext();
                    tb.pop();
                    tb.transition(HS.InTableBody);
                    return tb.process(t);
                } else if (inSorted(name, C.InRowIgnore)) {
                    tb.error(this);
                    return false;
                } else {
                    return this.anythingElse(t, tb);
                }
            } else {
                return this.anythingElse(t, tb);
            }
            return true;
        }
        anythingElse(t: Token, tb: HtmlTreeBuilder): boolean {
            return tb.process(t, HS.InTable);
        }
})('InRow')

HS.InCell = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.isEndTag()) {
                let endTag = t.asEndTag();
                let name = endTag.normalName();
                if (inSorted(name, C.InCellNames)) {
                    if (!tb.inTableScope(name)) {
                        tb.error(this);
                        tb.transition(HS.InRow);
                        return false;
                    }
                    tb.generateImpliedEndTags();
                    if (!tb.currentElementIs(name))
                        tb.error(this);
                    tb.popStackToClose(name);
                    tb.clearFormattingElementsToLastMarker();
                    tb.transition(HS.InRow);
                } else if (inSorted(name, C.InCellBody)) {
                    tb.error(this);
                    return false;
                } else if (inSorted(name, C.InCellTable)) {
                    if (!tb.inTableScope(name)) {
                        tb.error(this);
                        return false;
                    }
                    this.closeCell(tb);
                    return tb.process(t);
                } else {
                    return this.anythingElse(t, tb);
                }
            } else if (t.isStartTag() &&
                    inSorted(t.asStartTag().normalName(), C.InCellCol)) {
                if (!(tb.inTableScope("td") || tb.inTableScope("th"))) {
                    tb.error(this);
                    return false;
                }
                this.closeCell(tb);
                return tb.process(t);
            } else {
                return this.anythingElse(t, tb);
            }
            return true;
        }
        anythingElse(t: Token, tb: HtmlTreeBuilder): boolean {
            return tb.process(t, HS.InBody);
        }
        closeCell(tb: HtmlTreeBuilder): void {
            if (tb.inTableScope("td"))
                tb.processEndTag("td");
            else
                tb.processEndTag("th");
        }
})('InCell')

HS.InSelect = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            let name: any;
            switch (t.type) {
                case 'Character':
                    tb.insertCharacterNode(t.asCharacter());
                    break;
                case 'Comment':
                    tb.insertCommentNode(t.asComment());
                    break;
                case 'Doctype':
                    tb.error(this);
                    return false;
                case 'StartTag':
                    let start = t.asStartTag();
                    name = start.normalName();
                    if (jeq(name, "html"))
                        return tb.process(start, HS.InBody);
                    else if (jeq(name, "option")) {
                        if (tb.currentElementIs("option"))
                            tb.processEndTag("option");
                        tb.insertElementFor(start);
                    } else if (jeq(name, "optgroup")) {
                        if (tb.currentElementIs("option"))
                            tb.processEndTag("option");
                        if (tb.currentElementIs("optgroup"))
                            tb.processEndTag("optgroup");
                        tb.insertElementFor(start);
                    } else if (jeq(name, "select")) {
                        tb.error(this);
                        return tb.processEndTag("select");
                    } else if (inSorted(name, C.InSelectEnd)) {
                        tb.error(this);
                        if (!tb.inSelectScope("select"))
                            return false;
                        do {
                            tb.popStackToClose("select");
                            tb.resetInsertionMode();
                        } while (tb.inSelectScope("select"));
                        return tb.process(start);
                    } else if (jeq(name, "script") || jeq(name, "template")) {
                        return tb.process(t, HS.InHead);
                    } else if (jeq(name, "noscript")) {
                        tb.startNoscript(start);
                    } else {
                        return this.anythingElse(t, tb);
                    }
                    break;
                case 'EndTag':
                    let end = t.asEndTag();
                    name = end.normalName();
                    switch (name) {
                        case "optgroup":
                            if (tb.currentElementIs("option") && tb.aboveOnStack(tb.currentElement()) !== null && tb.aboveOnStack(tb.currentElement())!.nameIs("optgroup"))
                                tb.processEndTag("option");
                            if (tb.currentElementIs("optgroup"))
                                tb.pop();
                            else
                                tb.error(this);
                            break;
                        case "option":
                            if (tb.currentElementIs("option"))
                                tb.pop();
                            else
                                tb.error(this);
                            break;
                        case "select":
                            if (!tb.inSelectScope(name)) {
                                tb.error(this);
                                return false;
                            } else {
                                tb.popStackToClose(name);
                                tb.resetInsertionMode();
                            }
                            break;
                        case "template":
                            return tb.process(t, HS.InHead);
                        default:
                            return this.anythingElse(t, tb);
                    }
                    break;
                case 'EOF':
                    if (!tb.currentElementIs("html"))
                        tb.error(this);
                    break;
                default:
                    return this.anythingElse(t, tb);
            }
            return true;
        }
        anythingElse(t: Token, tb: HtmlTreeBuilder): boolean {
            tb.error(this);
            return false;
        }
})('InSelect')

HS.InSelectInTable = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.isStartTag() && inSorted(t.asStartTag().normalName(), C.InSelectTableEnd)) {
                tb.error(this);
                tb.popStackToClose("select");
                tb.resetInsertionMode();
                return tb.process(t);
            } else if (t.isEndTag() && inSorted(t.asEndTag().normalName(), C.InSelectTableEnd)) {
                tb.error(this);
                if (tb.inTableScope(t.asEndTag().normalName())) {
                    tb.popStackToClose("select");
                    tb.resetInsertionMode();
                    return (tb.process(t));
                } else
                    return false;
            } else {
                return tb.process(t, HS.InSelect);
            }
        }
})('InSelectInTable')

HS.InTemplate = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            let name: any;
            switch (t.type) {
                case 'Character':
                case 'Comment':
                case 'Doctype':
                    tb.process(t, HS.InBody);
                    break;
                case 'StartTag':
                    name = t.asStartTag().normalName();
                    if (inSorted(name, C.InTemplateToHead))
                        tb.process(t, HS.InHead);
                    else if (inSorted(name, C.InTemplateToTable)) {
                        tb.popTemplateMode();
                        tb.pushTemplateMode(HS.InTable);
                        tb.transition(HS.InTable);
                        return tb.process(t);
                    }
                    else if (jeq(name, "col")) {
                        tb.popTemplateMode();
                        tb.pushTemplateMode(HS.InColumnGroup);
                        tb.transition(HS.InColumnGroup);
                        return tb.process(t);
                    } else if (jeq(name, "tr")) {
                        tb.popTemplateMode();
                        tb.pushTemplateMode(HS.InTableBody);
                        tb.transition(HS.InTableBody);
                        return tb.process(t);
                    } else if (jeq(name, "td") || jeq(name, "th")) {
                        tb.popTemplateMode();
                        tb.pushTemplateMode(HS.InRow);
                        tb.transition(HS.InRow);
                        return tb.process(t);
                    } else {
                        tb.popTemplateMode();
                        tb.pushTemplateMode(HS.InBody);
                        tb.transition(HS.InBody);
                        return tb.process(t);
                    }
                    break;
                case 'EndTag':
                    name = t.asEndTag().normalName();
                    if (jeq(name, "template"))
                        tb.process(t, HS.InHead);
                    else {
                        tb.error(this);
                        return false;
                    }
                    break;
                case 'EOF':
                    if (!tb.onStack("template")) {
                        return true;
                    }
                    tb.error(this);
                    tb.popStackToClose("template");
                    tb.clearFormattingElementsToLastMarker();
                    tb.popTemplateMode();
                    tb.resetInsertionMode();
                    if (tb.state_() !== HS.InTemplate && tb.templateModeSize() < 12)
                        return tb.process(t);
                    else return true;
                default:
                    validateWtf("Unexpected state: " + t.type);
            }
            return true;
        }
})('InTemplate')

HS.AfterBody = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            let html = tb.getFromStack("html");
            if (isWhitespaceToken(t)) {
                if (html !== null)
                    tb.insertCharacterToElement(t.asCharacter(), html);
                else
                    tb.process(t, HS.InBody);
            } else if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
            } else if (t.isDoctype()) {
                tb.error(this);
                return false;
            } else if (t.isStartTag() && jeq(t.asStartTag().normalName(), "html")) {
                return tb.process(t, HS.InBody);
            } else if (t.isEndTag() && jeq(t.asEndTag().normalName(), "html")) {
                if (tb.isFragmentParsing()) {
                    tb.error(this);
                    return false;
                } else {
                    if (html !== null) tb.trackNodePosition(html, false);
                    tb.transition(HS.AfterAfterBody);
                }
            } else if (t.isEOF()) {
            } else {
                tb.error(this);
                tb.resetBody();
                return tb.process(t);
            }
            return true;
        }
})('AfterBody')

HS.InFrameset = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (isWhitespaceToken(t)) {
                tb.insertCharacterNode(t.asCharacter());
            } else if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
            } else if (t.isDoctype()) {
                tb.error(this);
                return false;
            } else if (t.isStartTag()) {
                let start = t.asStartTag();
                switch (start.normalName()) {
                    case "html":
                        return tb.process(start, HS.InBody);
                    case "frameset":
                        tb.insertElementFor(start);
                        break;
                    case "frame":
                        tb.insertEmptyElementFor(start);
                        break;
                    case "noframes":
                        return tb.process(start, HS.InHead);
                    default:
                        tb.error(this);
                        return false;
                }
            } else if (t.isEndTag() && jeq(t.asEndTag().normalName(), "frameset")) {
                if (!tb.currentElementIs("frameset")) {
                    tb.error(this);
                    return false;
                } else {
                    tb.pop();
                    if (!tb.isFragmentParsing() && !tb.currentElementIs("frameset")) {
                        tb.transition(HS.AfterFrameset);
                    }
                }
            } else if (t.isEOF()) {
                if (!tb.currentElementIs("html")) {
                    tb.error(this);
                    return true;
                }
            } else {
                tb.error(this);
                return false;
            }
            return true;
        }
})('InFrameset')

HS.AfterFrameset = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (isWhitespaceToken(t)) {
                tb.insertCharacterNode(t.asCharacter());
            } else if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
            } else if (t.isDoctype()) {
                tb.error(this);
                return false;
            } else if (t.isStartTag() && jeq(t.asStartTag().normalName(), "html")) {
                return tb.process(t, HS.InBody);
            } else if (t.isEndTag() && jeq(t.asEndTag().normalName(), "html")) {
                tb.transition(HS.AfterAfterFrameset);
            } else if (t.isStartTag() && jeq(t.asStartTag().normalName(), "noframes")) {
                return tb.process(t, HS.InHead);
            } else if (t.isEOF()) {
            } else {
                tb.error(this);
                return false;
            }
            return true;
        }
})('AfterFrameset')

HS.AfterAfterBody = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
            } else if (t.isDoctype() || (t.isStartTag() && jeq(t.asStartTag().normalName(), "html"))) {
                return tb.process(t, HS.InBody);
            } else if (isWhitespaceToken(t)) {
                let doc = tb.getDocument();
                tb.insertCharacterToElement(t.asCharacter(), doc);
            }else if (t.isEOF()) {
            } else {
                tb.error(this);
                tb.resetBody();
                return tb.process(t);
            }
            return true;
        }
})('AfterAfterBody')

HS.AfterAfterFrameset = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            if (t.isComment()) {
                tb.insertCommentNode(t.asComment());
            } else if (t.isDoctype() || isWhitespaceToken(t) || (t.isStartTag() && jeq(t.asStartTag().normalName(), "html"))) {
                return tb.process(t, HS.InBody);
            } else if (t.isEOF()) {
            } else if (t.isStartTag() && jeq(t.asStartTag().normalName(), "noframes")) {
                return tb.process(t, HS.InHead);
            } else {
                tb.error(this);
                return false;
            }
            return true;
        }
})('AfterAfterFrameset')

HS.ForeignContent = new (class extends HState {
        process(t: Token, tb: HtmlTreeBuilder): boolean {
            switch (t.type) {
                case 'Character':
                    let c = t.asCharacter();
                    if (isWhitespaceToken(c))
                        tb.insertCharacterNode(c);
                    else {
                        tb.insertCharacterNode(c, true);
                        tb.framesetOk(false);
                    }
                    break;
                case 'Comment':
                    tb.insertCommentNode(t.asComment());
                    break;
                case 'Doctype':
                    tb.error(this);
                    break;
                case 'StartTag':
                    let start = t.asStartTag();
                    if (inArr(start.normalName_, C.InForeignToHtml))
                        return this.processAsHtml(t, tb);
                    if (jeq(start.normalName_, "font") && (
                        start.hasAttributeIgnoreCase("color")
                            || start.hasAttributeIgnoreCase("face")
                            || start.hasAttributeIgnoreCase("size")))
                        return this.processAsHtml(t, tb);
                    let namespace = tb.currentElement().tag().namespace();
                    tb.insertForeignElementFor(start, namespace);
                    let textState = tb.tagFor(start.tagName.value(), start.normalName_, namespace, tb.settings).textState();
                    if (textState !== null) {
                        if (jeq(start.normalName_, "script"))
                            tb.tokeniser.transition(S.ScriptData);
                        else
                            tb.tokeniser.transition(textState);
                    }
                    break;
                case 'EndTag':
                    let end = t.asEndTag();
                    if (jeq(end.normalName_, "br") || jeq(end.normalName_, "p"))
                        return this.processAsHtml(t, tb);
                    if (jeq(end.normalName_, "script") && tb.currentElementIs("script", NamespaceSvg)) {
                        tb.pop();
                        return true;
                    }
                    let stack = tb.getStack();
                    if ((stack.length === 0))
                        validateWtf("Stack unexpectedly empty");
                    let i = stack.length - 1;
                    let el = stack[i];
                    if (!el.nameIs(end.normalName_))
                        tb.error(this);
                    while (i !== 0) {
                        if (el.nameIs(end.normalName_)) {
                            tb.popStackToCloseAnyNamespace(el.normalName());
                            return true;
                        }
                        i--;
                        el = stack[i];
                        if (jeq(el.tag().namespace(), NamespaceHtml)) {
                            return this.processAsHtml(t, tb);
                        }
                    }
                    break;
                case 'EOF':
                    break;
                default:
                    validateWtf("Unexpected state: " + t.type);
            }
            return true;
        }
        processAsHtml(t: Token, tb: HtmlTreeBuilder): boolean {
            return tb.state_().process(t, tb);
        }
})('ForeignContent')

// ---------------------------------------------------------------------------
// select (sous-ensemble de QueryParser / Evaluator)
// ---------------------------------------------------------------------------

export class SelectorParseException extends IllegalStateException {}

abstract class Evaluator {
  abstract matches(root: Element, element: Element): boolean
}

class TagEvaluator extends Evaluator {
  constructor(private readonly tagName: string) {
    super()
  }

  matches(_root: Element, element: Element): boolean {
    return element.nameIs(this.tagName)
  }
}

class TagEndsWith extends Evaluator {
  constructor(private readonly tagName: string) {
    super()
  }

  matches(_root: Element, element: Element): boolean {
    return element.normalName().endsWith(this.tagName)
  }
}

class AllElements extends Evaluator {
  matches(): boolean {
    return true
  }
}

class AttributeEvaluator extends Evaluator {
  constructor(private readonly key: string) {
    super()
  }

  matches(_root: Element, element: Element): boolean {
    return element.hasAttr(this.key)
  }
}

class AttributeWithValue extends Evaluator {
  private readonly key: string
  private readonly value: string

  constructor(key: string, value: string) {
    super()
    if (key.length === 0) throw new IllegalArgumentException('String must not be empty')
    this.key = normalize(key)
    const quoted = (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))
    if (quoted) {
      if (!(value.length > 1)) throw new IllegalArgumentException('Quoted value must have content')
      value = value.substring(1, value.length - 1)
    }
    this.value = lowerCase(value) // case-insensitive match
  }

  matches(_root: Element, element: Element): boolean {
    return element.hasAttr(this.key) && equalsIgnoreCase(this.value, element.attr(this.key))
  }
}

class And extends Evaluator {
  constructor(readonly evaluators: Evaluator[]) {
    super()
  }

  matches(root: Element, element: Element): boolean {
    return this.evaluators.every((e) => e.matches(root, element))
  }
}

class Or extends Evaluator {
  constructor(readonly evaluators: Evaluator[]) {
    super()
  }

  matches(root: Element, element: Element): boolean {
    return this.evaluators.some((e) => e.matches(root, element))
  }
}

class Ancestor extends Evaluator {
  constructor(private readonly evaluator: Evaluator) {
    super()
  }

  matches(root: Element, element: Element): boolean {
    if (root === element) return false
    for (let parent = element.parent(); parent !== null; parent = parent.parent()) {
      if (this.evaluator.matches(root, parent)) return true
      if (parent === root) break
    }
    return false
  }
}

class ImmediateParentRun extends Evaluator {
  readonly evaluators: Evaluator[] = []

  constructor(evaluator: Evaluator) {
    super()
    this.evaluators.push(evaluator)
  }

  add(evaluator: Evaluator): void {
    this.evaluators.push(evaluator)
  }

  matches(root: Element, node: Element): boolean {
    if (node === root) return false // cannot match as the second eval (first parent test) would be above the root
    let n: Element | null = node
    for (let i = this.evaluators.length - 1; i >= 0; --i) {
      if (n === null) return false
      const evaluator = this.evaluators[i] as Evaluator
      if (!evaluator.matches(root, n)) return false
      n = n.parent()
    }
    return true
  }
}

/** Sous-ensemble de `TokenQueue` */
class TokenQueue {
  private pos = 0

  constructor(private readonly q: string) {}

  isEmpty(): boolean {
    return this.pos >= this.q.length
  }

  current(): string {
    return this.isEmpty() ? EOF : (this.q[this.pos] as string)
  }

  consume(): string {
    const c = this.current()
    this.pos++
    return c
  }

  matches(seq: string): boolean {
    const r = new CharacterReader(this.q.substring(this.pos))
    return r.matchesIgnoreCase(seq)
  }

  matchesAny(...seq: string[]): boolean {
    return !this.isEmpty() && seq.includes(this.q[this.pos] as string)
  }

  matchChomp(seq: string): boolean {
    if (seq.length === 1) {
      if (!this.isEmpty() && this.q[this.pos] === seq) {
        this.pos++
        return true
      }
      return false
    }
    if (this.matches(seq)) {
      this.pos += seq.length
      return true
    }
    return false
  }

  consumeWhitespace(): boolean {
    let seen = false
    while (!this.isEmpty() && isWhitespaceChar(this.current())) {
      this.pos++
      seen = true
    }
    return seen
  }

  matchesWord(): boolean {
    const c = this.current()
    return c !== EOF && LETTER_OR_DIGIT.test(c)
  }

  /** `consumeElementSelector` (identifiant CSS, sans séquences d'échappement : PORT) */
  consumeElementSelector(): string {
    const start = this.pos
    while (!this.isEmpty()) {
      const c = this.current()
      const code = c.charCodeAt(0)
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || code >= 0x80 || c === '-' || c === '_' || c === '*' || c === '|') this.pos++
      else break
    }
    return this.q.substring(start, this.pos)
  }

  consumeToAny(...seq: string[]): string {
    const start = this.pos
    out: while (!this.isEmpty()) {
      for (const s of seq) if (this.matches(s)) break out
      this.pos++
    }
    return this.q.substring(start, this.pos)
  }

  remainder(): string {
    const r = this.q.substring(this.pos)
    this.pos = this.q.length
    return r
  }

  chompBalanced(open: string, close: string): string {
    let accum = ''
    let depth = 0
    let prev = ''
    let inSingle = false
    let inDouble = false
    let inRegexQE = false
    const mark = this.pos
    do {
      if (this.isEmpty()) break
      const c = this.consume()
      if (prev === '\\') {
        if (c === 'Q') inRegexQE = true
        else if (c === 'E') inRegexQE = false
        accum += c
      } else {
        if (c === "'" && c !== open && !inDouble) inSingle = !inSingle
        else if (c === '"' && c !== open && !inSingle) inDouble = !inDouble

        if (inSingle || inDouble || inRegexQE) {
          accum += c
        } else if (c === open) {
          depth++
          if (depth > 1) accum += c // don't include the outer match pair in the return
        } else if (c === close) {
          depth--
          if (depth > 0) accum += c
        } else {
          accum += c
        }
      }
      prev = c
    } while (depth > 0)
    if (depth > 0) {
      // ran out of queue before seeing enough )
      this.pos = mark
      throw new IllegalArgumentException("Did not find balanced marker at '" + accum + "'")
    }
    return accum
  }
}

const Combinators = ['>', '+', '~']
const AttributeEvals = ['=', '!=', '^=', '$=', '*=', '~=']
const SequenceEnders = [',', ')']

class QueryParser {
  private readonly tq: TokenQueue
  private readonly query: string

  private constructor(query: string) {
    if (query.length === 0) throw new IllegalArgumentException('String must not be empty')
    query = javaTrim(query)
    this.query = query
    this.tq = new TokenQueue(query)
  }

  static parse(query: string): Evaluator {
    try {
      return new QueryParser(query).parse()
    } catch (e) {
      if (e instanceof IllegalArgumentException) throw new SelectorParseException(e.message)
      throw e
    }
  }

  private parse(): Evaluator {
    const evaluator = this.parseSelectorGroup()
    this.tq.consumeWhitespace()
    if (!this.tq.isEmpty()) throw new SelectorParseException(`Could not parse query '${this.query}': unexpected token at '${this.tq.remainder()}'`)
    return evaluator
  }

  private parseSelectorGroup(): Evaluator {
    let left = this.parseSelector()
    while (this.tq.matchChomp(',')) {
      const right = this.parseSelector()
      left = new Or([left, right])
    }
    return left
  }

  private parseSelector(): Evaluator {
    this.tq.consumeWhitespace()
    if (this.tq.matchesAny(...Combinators)) throw new SelectorParseException('PORT: Root combinator not supported')
    let left = this.parseSimpleSequence()
    for (;;) {
      let combinator = ''
      if (this.tq.consumeWhitespace()) combinator = ' ' // maybe descendant?
      if (this.tq.matchesAny(...Combinators))
        // no, explicit
        combinator = this.tq.consume()
      else if (this.tq.matchesAny(...SequenceEnders)) break
      if (combinator !== '') {
        const right = this.parseSimpleSequence()
        left = QueryParser.combinator(left, combinator, right)
      } else {
        break
      }
    }
    return left
  }

  private parseSimpleSequence(): Evaluator {
    let left: Evaluator | null = null
    this.tq.consumeWhitespace()
    if (this.tq.matchesWord() || this.tq.matches('*|')) left = this.byTag()
    else if (this.tq.matchChomp('*')) left = new AllElements()
    for (;;) {
      const right = this.parseSubclass()
      if (right !== null) left = QueryParser.and(left, right)
      else break
    }
    if (left === null) throw new SelectorParseException(`Could not parse query '${this.query}': unexpected token at '${this.tq.remainder()}'`)
    return left
  }

  private static combinator(left: Evaluator, combinator: string, right: Evaluator): Evaluator {
    switch (combinator) {
      case '>': {
        const run = left instanceof ImmediateParentRun ? left : new ImmediateParentRun(left)
        run.add(right)
        return run
      }
      case ' ':
        return QueryParser.and(new Ancestor(left), right)
      default:
        throw new SelectorParseException(`PORT: combinator '${combinator}' not supported`)
    }
  }

  private parseSubclass(): Evaluator | null {
    if (this.tq.matches('[')) return this.byAttribute()
    if (this.tq.matchesAny('#', '.', ':')) throw new SelectorParseException(`PORT: selector not supported: ${this.query}`)
    return null
  }

  private static and(left: Evaluator | null, right: Evaluator): Evaluator {
    if (left === null) return right
    if (left instanceof And) {
      left.evaluators.push(right)
      return left
    }
    return new And([left, right])
  }

  private byTag(): Evaluator {
    let tagName = normalize(this.tq.consumeElementSelector())
    if (tagName.length === 0) throw new IllegalArgumentException('String must not be empty')
    if (tagName.startsWith('*|')) {
      // namespaces: wildcard match equals(tagName) or ending in ":"+tagName
      const plainTag = tagName.substring(2) // strip *|
      return new Or([new TagEvaluator(plainTag), new TagEndsWith(':' + plainTag)])
    } else if (tagName.endsWith('|*')) {
      throw new SelectorParseException('PORT: ns|* not supported')
    } else if (tagName.includes('|')) {
      // flip "abc|def" to "abc:def"
      tagName = tagName.replaceAll('|', ':')
    }
    return new TagEvaluator(tagName)
  }

  private byAttribute(): Evaluator {
    const cq = new TokenQueue(this.tq.chompBalanced('[', ']'))
    let key = cq.consumeToAny(...AttributeEvals) // eq, not, start, end, contain, match, (no val)
    key = normalize(key)
    if (key.length === 0) throw new IllegalArgumentException('String must not be empty')
    cq.consumeWhitespace()
    if (cq.isEmpty()) {
      if (key.startsWith('^') || key === '*') throw new SelectorParseException('PORT: attribute prefix selector not supported')
      return new AttributeEvaluator(key)
    }
    if (cq.matchChomp('=')) return new AttributeWithValue(key, cq.remainder())
    throw new SelectorParseException(`PORT: attribute selector not supported: ${this.query}`)
  }
}

// ---------------------------------------------------------------------------
// Jsoup.clean(bodyHtml, Safelist.none()) et sortie body().html()
// ---------------------------------------------------------------------------

/** `Parser.parseBodyFragment(bodyHtml, baseUri)` */
function parseBodyFragment(bodyHtml: string, baseUri: string): Document {
  const doc = Document.createShell(baseUri)
  const body = doc.body()
  const nodeList = new HtmlTreeBuilder().parseFragment(bodyHtml, body, baseUri)
  body.appendChildren(nodeList)
  return doc
}

/**
 * `Cleaner.clean(dirty)` avec `Safelist.none()` : aucune balise n'est sûre, seuls les TextNode (et CDataNode) sont
 * recopiés, dans l'ordre du parcours, directement sous le <body> propre ; DataNode, commentaires, etc. sont écartés.
 */
function cleanTexts(dirty: Document): string[] {
  const texts: string[] = []
  const traverse = (node: Node) => {
    if (node instanceof TextNode) texts.push(node.getWholeText())
    else if (node instanceof Element) for (const child of node.childNodes()) traverse(child)
  }
  traverse(dirty.body())
  return texts
}

/** `Entities.appendEscaped` (mode base, UTF-8, texte) */
function appendEscaped(codePoint: number, accum: string[]): void {
  if (codePoint < 0x10000) {
    const c = codePoint
    switch (c) {
      case 0x26:
        accum.push('&amp;')
        break
      case 0xa0:
        accum.push('&nbsp;')
        break
      case 0x3c:
        accum.push('&lt;')
        break
      case 0x3e:
        accum.push('&gt;')
        break
      case 0x09:
      case 0x0a:
      case 0x0d:
        accum.push(String.fromCharCode(c))
        break
      default:
        if (c < 0x20 || (c >= 0xd800 && c <= 0xdfff)) appendEncoded(accum, codePoint)
        else accum.push(String.fromCharCode(c))
    }
  } else {
    accum.push(String.fromCodePoint(codePoint))
  }
}

function appendEncoded(accum: string[], codePoint: number): void {
  const name = Entities.base.nameForCodepoint(codePoint)
  if (name !== '') accum.push('&', name, ';')
  else accum.push('&#x', codePoint.toString(16), ';')
}

const Normalise = 0x4
const TrimLeading = 0x8
const TrimTrailing = 0x10

/** `Entities.doEscape` */
function doEscape(data: string, accum: string[], options: number): void {
  let lastWasWhite = false
  let reachedNonWhite = false
  let skipped = false
  for (let offset = 0; offset < data.length; ) {
    const codePoint = data.codePointAt(offset) as number
    offset += codePoint > 0xffff ? 2 : 1
    if ((options & Normalise) !== 0) {
      if (isWhitespaceChar(codePoint)) {
        if ((options & TrimLeading) !== 0 && !reachedNonWhite) continue
        if (lastWasWhite) continue
        if ((options & TrimTrailing) !== 0) {
          skipped = true
          continue
        }
        accum.push(' ')
        lastWasWhite = true
        continue
      } else {
        lastWasWhite = false
        reachedNonWhite = true
        if (skipped) {
          accum.push(' ') // wasn't the end, so need to place a normalized space
          skipped = false
        }
      }
    }
    appendEscaped(codePoint, accum)
  }
}

/**
 * Sortie `body().html()` (Printer.Pretty) d'un <body> ne contenant que des TextNode (cas de Safelist.none()) :
 * chaque nœud est normalisé ; début rogné pour le premier, fin rognée pour le dernier ou si le prochain nœud non
 * blanc commence par un blanc ; le résultat est rogné (String.trim).
 */
function printTextNodes(texts: string[]): string {
  const accum: string[] = []
  const isBlank = (i: number) => isBlankString(texts[i] as string)
  texts.forEach((text, i) => {
    let options = Normalise
    // textTrim : le parent (body) est un bloc
    if (i === 0) options |= TrimLeading
    if (i === texts.length - 1) {
      options |= TrimTrailing
    } else {
      let next = i + 1
      while (next < texts.length && isBlank(next)) next++
      if (next < texts.length && isWhitespaceChar((texts[next] as string).codePointAt(0) as number)) options |= TrimTrailing
    }
    doEscape(text, accum, options)
  })
  return javaTrim(accum.join(''))
}

export class Safelist {
  private constructor() {}

  /** `Safelist.none()` : aucune balise autorisée, texte seul */
  static none(): Safelist {
    return new Safelist()
  }
}

export class Parser {
  private constructor() {}

  static xmlParser(): Parser {
    return new Parser()
  }
}

export const Jsoup = {
  /** `Jsoup.parse(html, baseUri, Parser.xmlParser())` */
  parse(html: string, baseUri: string, _parser: Parser): Document {
    return new XmlTreeBuilder().parse(html, baseUri)
  },

  /** `Jsoup.clean(bodyHtml, Safelist.none())` */
  clean(bodyHtml: string, _safelist: Safelist): string {
    const dirty = parseBodyFragment(bodyHtml, '')
    return printTextNodes(cleanTexts(dirty))
  },
}

const HtmlTagSet = TagSet.initHtmlDefault()
