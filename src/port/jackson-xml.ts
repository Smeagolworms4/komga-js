// Support de portage : com.fasterxml.jackson.dataformat.xml.XmlMapper (jackson-dataformat-xml 2.21.4, Woodstox 7.1.1),
// tel qu'utilisé par Komga. Ce fichier n'a pas de jumeau Kotlin.
//
// Points d'extension (XmlFactory, XmlMapper, MappingJackson2XmlHttpMessageConverter) utilisés par Komga pour l'OPDS v1 :
// la sérialisation XML elle-même (DTO OPDS v1) appartient à la couche web : elle obtient ses writers par
// `XmlFactory.createXmlWriter(writer)`, ce qui applique la configuration des namespaces (NamespaceXmlFactory).
//
// Lecture (`XmlMapper().readValue`, ComicInfo.xml et listes ComicRack) :
//
// Portage à plat, sur le chemin de lecture :
//  - lecteur StAX (Woodstox) : saxes (analyseur XML strict, espaces de noms), avec la configuration de XmlFactory
//    (IS_NAMESPACE_AWARE, IS_COALESCING, SUPPORT_DTD=false) et la détection d'encodage de Woodstox ;
//    comme Woodstox (lecture paresseuse), une erreur située après la fin de l'élément racine n'est jamais vue ;
//  - deser.XmlTokenStream et deser.FromXmlParser (nextToken, isExpectedStartArrayToken, isExpectedNumberIntToken,
//    xsi:nil) ; l'enveloppement virtuel (listes non enveloppées, `addVirtualWrapping`) n'est pas porté :
//    aucune classe lue par Komga n'a de liste non enveloppée ;
//  - XmlMapper : coercitions (ACCEPT_EMPTY_STRING_AS_NULL_OBJECT, blanc -> vide, chaîne vide -> null pour les
//    entiers), XmlDeserializationContext.extractScalarFromObject ;
//  - jackson-databind : BeanDeserializer (vanilla, setters), StringDeserializer, NumberDeserializers.IntegerDeserializer,
//    FactoryBasedEnumDeserializer (@JsonCreator à un argument String), CollectionDeserializer.
// Les classes sont décrites par les mêmes métadonnées que pour le JSON : `jsonProperties` (types des propriétés),
// `json` (@JsonProperty -> rename, @JsonIgnoreProperties(ignoreUnknown), @JsonCreator -> creator,
// @JsonSetter(nulls = AS_EMPTY) -> nullsAsEmpty) et `jacksonXml` (@JacksonXmlProperty / @JacksonXmlElementWrapper).
// Équivalence vérifiée contre les vraies classes (jshell) : test/infrastructure/metadata/comicrack/XmlOracle.test.ts.
import { SaxesParser } from 'saxes'
import { jsonMetaOf } from './jackson.js'
import {
  InvalidFormatException,
  JsonMappingException,
  JsonParseException,
  type JsonType,
  MismatchedInputException,
  jsonPropertiesOf,
} from './jackson-mapper.js'
import { KEnum } from './kotlin.js'

/** `UnrecognizedPropertyException` */
export class UnrecognizedPropertyException extends MismatchedInputException {}

// ---------------------------------------------------------------------------
// Annotations XML (@JacksonXmlProperty, @JacksonXmlElementWrapper, @JacksonXmlRootElement)
// ---------------------------------------------------------------------------

export type JacksonXmlMeta = {
  /** @JacksonXmlProperty(localName = ...) */
  localName?: Record<string, string>
  /** @JacksonXmlProperty(isAttribute = true) : sans effet en lecture */
  isAttribute?: string[]
  /** @JacksonXmlElementWrapper(useWrapping = ..., localName = ...) */
  wrapper?: Record<string, { useWrapping?: boolean; localName?: string }>
  /** @JacksonXmlRootElement(localName = ...) : sans effet en lecture (le nom de la racine n'est pas vérifié) */
  rootElement?: string
}

const xmlMeta = new WeakMap<object, JacksonXmlMeta>()

export function jacksonXml(cls: object, m: JacksonXmlMeta): void {
  xmlMeta.set(cls, { ...(xmlMeta.get(cls) ?? {}), ...m })
}

function xmlMetaOf(cls: object): JacksonXmlMeta {
  return xmlMeta.get(cls) ?? {}
}

// ---------------------------------------------------------------------------
// Lecteur StAX (Woodstox) : événements
// ---------------------------------------------------------------------------

const START_ELEMENT = 1
const END_ELEMENT = 2
const PROCESSING_INSTRUCTION = 3
const CHARACTERS = 4
const COMMENT = 5
const END_DOCUMENT = 8

type Attr = { ns: string; local: string; value: string }
type Ev =
  | { type: typeof START_ELEMENT; ns: string; local: string; attrs: Attr[]; empty: boolean }
  | { type: typeof END_ELEMENT; ns: string; local: string }
  | { type: typeof CHARACTERS; text: string }
  | { type: typeof COMMENT | typeof PROCESSING_INSTRUCTION }
  | { type: typeof END_DOCUMENT }
  | { type: 'error'; message: string }

const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance'

/** Détection d'encodage de Woodstox (BOM, puis pseudo-attribut `encoding` de la déclaration XML) */
function decode(src: Uint8Array | string): string {
  if (typeof src === 'string') return src
  const b = Buffer.from(src.buffer, src.byteOffset, src.byteLength)
  const fatal = (enc: string, bytes: Uint8Array) => {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(bytes)
    } catch (e) {
      throw new JsonParseException(`Invalid ${enc} byte sequence: ${(e as Error).message}`, e)
    }
  }
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return fatal('utf-8', b.subarray(3))
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return fatal('utf-16be', b.subarray(2))
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return fatal('utf-16le', b.subarray(2))
  if (b.length >= 4 && b[0] === 0x00 && b[1] === 0x3c && b[2] === 0x00 && b[3] === 0x3f) return fatal('utf-16be', b)
  if (b.length >= 4 && b[0] === 0x3c && b[1] === 0x00 && b[2] === 0x3f && b[3] === 0x00) return fatal('utf-16le', b)
  // déclaration XML en ASCII
  const head = b.subarray(0, Math.min(b.length, 200)).toString('latin1')
  const m = /^<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(head)
  const enc = (m?.[1] ?? 'UTF-8').toUpperCase()
  if (enc === 'ISO-8859-1' || enc === 'LATIN1' || enc === 'ISO8859-1' || enc === 'ISO-LATIN-1') return b.toString('latin1')
  if (enc === 'UTF-8' || enc === 'UTF8') return fatal('utf-8', b)
  try {
    return fatal(enc.toLowerCase(), b)
  } catch (e) {
    if (e instanceof JsonParseException) throw e
    throw new JsonParseException(`Unsupported encoding: ${enc}`, e)
  }
}

/** Analyse complète en événements StAX ; la première erreur devient un événement `error` (lu paresseusement). */
function readEvents(text: string): Ev[] {
  const events: Ev[] = []
  let failed = false
  let depth = 0
  let pendingText: string | null = null
  const flush = () => {
    if (pendingText !== null) {
      // IS_COALESCING : texte et CDATA contigus fusionnés
      if (depth > 0) events.push({ type: CHARACTERS, text: pendingText })
      pendingText = null
    }
  }
  class Abort extends Error {}
  const parser = new SaxesParser({ xmlns: true })
  parser.on('error', (e) => {
    if (!failed) {
      failed = true
      flush()
      events.push({ type: 'error', message: e.message })
    }
    throw new Abort()
  })
  parser.on('text', (t) => {
    pendingText = (pendingText ?? '') + t
  })
  parser.on('cdata', (t) => {
    pendingText = (pendingText ?? '') + t
  })
  parser.on('comment', () => {
    flush()
    if (depth > 0) events.push({ type: COMMENT })
  })
  parser.on('processinginstruction', () => {
    flush()
    if (depth > 0) events.push({ type: PROCESSING_INSTRUCTION })
  })
  parser.on('opentag', (tag) => {
    flush()
    const attrs: Attr[] = []
    for (const a of Object.values(tag.attributes)) {
      // déclarations d'espaces de noms : pas des attributs pour un lecteur StAX avec espaces de noms
      if (a.prefix === 'xmlns' || a.name === 'xmlns') continue
      attrs.push({ ns: a.uri ?? '', local: a.local, value: a.value })
    }
    events.push({ type: START_ELEMENT, ns: tag.uri ?? '', local: tag.local ?? tag.name, attrs, empty: tag.isSelfClosing })
    depth++
  })
  parser.on('closetag', (tag) => {
    flush()
    depth--
    events.push({ type: END_ELEMENT, ns: tag.uri ?? '', local: tag.local ?? tag.name })
  })
  try {
    parser.write(text).close()
  } catch (e) {
    if (!(e instanceof Abort)) {
      if (!failed) events.push({ type: 'error', message: (e as Error).message })
      failed = true
    }
  }
  if (!failed) events.push({ type: END_DOCUMENT })
  return events
}

/** Sous-ensemble de `XMLStreamReader2` (Woodstox) sur une liste d'événements */
class XmlStreamReader {
  private i = 0

  constructor(private readonly events: Ev[]) {}

  private get ev(): Ev {
    return this.events[this.i] as Ev
  }

  private check(ev: Ev): Ev {
    if (ev.type === 'error') throw new JsonParseException(ev.message)
    return ev
  }

  /** `_initializeXmlReader` : avance jusqu'au premier START_ELEMENT */
  initialize(): void {
    const ev = this.check(this.ev)
    if (ev.type === START_ELEMENT) return
    if (ev.type === END_DOCUMENT) throw new JsonParseException('Unexpected EOF in prolog')
    throw new JsonParseException('Expected START_ELEMENT')
  }

  getEventType(): number {
    return this.ev.type as number
  }

  hasNext(): boolean {
    return this.ev.type !== END_DOCUMENT
  }

  next(): number {
    this.i++
    return this.check(this.ev).type as number
  }

  isEmptyElement(): boolean {
    const ev = this.ev
    return ev.type === START_ELEMENT && ev.empty
  }

  getLocalName(): string {
    return (this.ev as { local: string }).local
  }

  getNamespaceURI(): string {
    return (this.ev as { ns: string }).ns
  }

  getText(): string {
    return (this.ev as { text: string }).text
  }

  private attrs(): Attr[] {
    return (this.ev as { attrs: Attr[] }).attrs
  }

  getAttributeCount(): number {
    return this.attrs().length
  }

  getAttributeLocalName(i: number): string {
    return (this.attrs()[i] as Attr).local
  }

  getAttributeNamespace(i: number): string {
    return (this.attrs()[i] as Attr).ns
  }

  getAttributeValue(i: number): string {
    return (this.attrs()[i] as Attr).value
  }

  /** `skipElement()` : depuis un START_ELEMENT, jusqu'à son END_ELEMENT */
  skipElement(): void {
    let depth = 1
    while (depth > 0) {
      const t = this.next()
      if (t === START_ELEMENT) depth++
      else if (t === END_ELEMENT) depth--
    }
  }

  close(): void {}
}

// ---------------------------------------------------------------------------
// deser.XmlTokenStream
// ---------------------------------------------------------------------------

const XML_START_ELEMENT = 1
const XML_END_ELEMENT = 2
const XML_ATTRIBUTE_NAME = 3
const XML_ATTRIBUTE_VALUE = 4
const XML_TEXT = 5
const XML_ROOT_TEXT = 7
const XML_END = 8

// FromXmlParser.Feature : valeurs par défaut (EMPTY_ELEMENT_AS_NULL désactivé, PROCESS_XSI_NIL activé,
// AUTO_DETECT_XSI_TYPE désactivé)
const EMPTY_ELEMENT_AS_NULL = false
const PROCESS_XSI_NIL = true

function allWs(str: string | null): boolean {
  const len = str === null ? 0 : str.length
  if (len > 0) {
    for (let i = 0; i < len; ++i) {
      if ((str as string).charCodeAt(i) > 0x20) {
        return false
      }
    }
  }
  return true
}

class XmlTokenStream {
  private currentState = 0
  private attributeCount = 0
  private xsiNilFound = false
  private startElementAfterText = false
  private nextAttributeIndex = 0
  private localName = ''
  private namespaceURI = ''
  private textValue: string | null = null
  private repeatCurrentToken = false

  constructor(private readonly xmlReader: XmlStreamReader) {}

  initialize(): number {
    this.checkXsiAttributes()
    this.decodeElementName(this.xmlReader.getNamespaceURI(), this.xmlReader.getLocalName())
    if (this.xmlReader.isEmptyElement() && EMPTY_ELEMENT_AS_NULL && !this.xsiNilFound && this.attributeCount < 1) {
      this.textValue = null
      this.startElementAfterText = false
      return (this.currentState = XML_ROOT_TEXT)
    }
    return (this.currentState = XML_START_ELEMENT)
  }

  next(): number {
    if (this.repeatCurrentToken) {
      this.repeatCurrentToken = false
      return this.currentState
    }
    return this._next()
  }

  getText(): string | null {
    return this.textValue
  }

  getLocalName(): string {
    return this.localName
  }

  hasXsiNil(): boolean {
    return this.xsiNilFound
  }

  pushbackCurrentToken(): void {
    this.repeatCurrentToken = true
  }

  markAsStreamEnd(): void {
    this.currentState = XML_END
  }

  skipAttributes(): void {
    switch (this.currentState) {
      case XML_ATTRIBUTE_NAME:
        this.attributeCount = 0
        this.currentState = XML_START_ELEMENT
        break
      case XML_START_ELEMENT:
        break
      case XML_TEXT:
        break
      default:
        throw new Error(`Current state not XML_START_ELEMENT or XML_ATTRIBUTE_NAME but ${this.currentState}`)
    }
  }

  private _next(): number {
    switch (this.currentState) {
      case XML_ATTRIBUTE_VALUE:
      case XML_START_ELEMENT: {
        if (this.currentState === XML_ATTRIBUTE_VALUE) ++this.nextAttributeIndex
        if (this.xsiNilFound) {
          this.xsiNilFound = false
          this.xmlReader.skipElement()
          return this.handleEndElement()
        }
        if (this.nextAttributeIndex < this.attributeCount) {
          this.decodeElementName(
            this.xmlReader.getAttributeNamespace(this.nextAttributeIndex),
            this.xmlReader.getAttributeLocalName(this.nextAttributeIndex),
          )
          this.textValue = this.xmlReader.getAttributeValue(this.nextAttributeIndex)
          return (this.currentState = XML_ATTRIBUTE_NAME)
        }
        // otherwise need to find START/END_ELEMENT or text
        const text = this.collectUntilTag()
        const startElementNext = this.xmlReader.getEventType() === START_ELEMENT
        // If we have no/all-whitespace text followed by START_ELEMENT, ignore text
        if (startElementNext) {
          if (allWs(text)) {
            this.startElementAfterText = false
            return this.initStartElement()
          }
          this.startElementAfterText = true
          this.textValue = text
          return (this.currentState = XML_TEXT)
        }
        // For END_ELEMENT we will return text, if any
        if (text !== null) {
          this.startElementAfterText = false
          this.textValue = text
          return (this.currentState = XML_TEXT)
        }
        this.startElementAfterText = false
        return this.handleEndElement()
      }
      case XML_ATTRIBUTE_NAME:
        // if we just returned name, will need to just send value next
        return (this.currentState = XML_ATTRIBUTE_VALUE)
      case XML_TEXT:
        // mixed text with other elements
        if (this.startElementAfterText) {
          this.startElementAfterText = false
          return this.initStartElement()
        }
        // text followed by END_ELEMENT
        return this.handleEndElement()
      case XML_ROOT_TEXT:
        this.xmlReader.close()
        return (this.currentState = XML_END)
      case XML_END:
        return XML_END
    }
    // Ok: must be END_ELEMENT; see what tag we get (or end)
    switch (this.skipAndCollectTextUntilTag()) {
      case END_DOCUMENT:
        this.xmlReader.close()
        return (this.currentState = XML_END)
      case END_ELEMENT:
        if (!allWs(this.textValue)) {
          return (this.currentState = XML_TEXT)
        }
        return this.handleEndElement()
    }
    if (!allWs(this.textValue)) {
      this.startElementAfterText = true
      return (this.currentState = XML_TEXT)
    }
    // START_ELEMENT...
    return this.initStartElement()
  }

  private collectUntilTag(): string | null {
    if (this.xmlReader.isEmptyElement()) {
      this.xmlReader.next()
      if (EMPTY_ELEMENT_AS_NULL) {
        return null
      }
      return ''
    }
    let chars: string | null = null
    main_loop: while (this.xmlReader.hasNext()) {
      switch (this.xmlReader.next()) {
        case START_ELEMENT:
          break main_loop
        case END_ELEMENT:
        case END_DOCUMENT:
          break main_loop
        case CHARACTERS:
          chars = (chars ?? '') + this.xmlReader.getText()
          break
        default:
        // any other type (proc instr, comment etc) is just ignored
      }
    }
    return chars === null ? '' : chars
  }

  private skipAndCollectTextUntilTag(): number {
    let chars: string | null = null
    while (this.xmlReader.hasNext()) {
      const type = this.xmlReader.next()
      switch (type) {
        case START_ELEMENT:
        case END_ELEMENT:
        case END_DOCUMENT:
          this.textValue = chars === null ? '' : chars
          return type
        case CHARACTERS:
          chars = (chars ?? '') + this.xmlReader.getText()
          break
        default:
      }
    }
    throw new JsonParseException('Expected to find a tag, instead reached end of input')
  }

  private initStartElement(): number {
    const ns = this.xmlReader.getNamespaceURI()
    const localName = this.xmlReader.getLocalName()
    this.checkXsiAttributes()
    // PORT: enveloppement virtuel (_currentWrapper) non porté (aucune liste non enveloppée)
    this.decodeElementName(ns, localName)
    return (this.currentState = XML_START_ELEMENT)
  }

  private checkXsiAttributes(): void {
    const count = this.xmlReader.getAttributeCount()
    this.attributeCount = count
    // [dataformat-xml#354]: xsi:nil handling; at first only if first attribute
    if (count >= 1) {
      if (PROCESS_XSI_NIL && this.xmlReader.getAttributeLocalName(0) === 'nil') {
        if (this.xmlReader.getAttributeNamespace(0) === XSI_NAMESPACE) {
          // need to skip, regardless of value
          this.nextAttributeIndex = 1
          // but only mark as nil marker if enabled
          this.xsiNilFound = this.xmlReader.getAttributeValue(0) === 'true'
          return
        }
      }
    }
    this.nextAttributeIndex = 0
    this.xsiNilFound = false
  }

  private decodeElementName(namespaceURI: string, localName: string): void {
    // XmlNameProcessors.newPassthroughProcessor()
    this.namespaceURI = namespaceURI
    this.localName = localName
  }

  private handleEndElement(): number {
    this.localName = ''
    this.namespaceURI = ''
    return (this.currentState = XML_END_ELEMENT)
  }
}

// ---------------------------------------------------------------------------
// deser.FromXmlParser
// ---------------------------------------------------------------------------

export type JsonToken = 'START_OBJECT' | 'END_OBJECT' | 'START_ARRAY' | 'END_ARRAY' | 'FIELD_NAME' | 'VALUE_STRING' | 'VALUE_NUMBER_INT' | 'VALUE_NULL'

class XmlReadContext {
  currentName: string | null = null

  private constructor(
    readonly parent: XmlReadContext | null,
    public type: 'ROOT' | 'OBJECT' | 'ARRAY',
  ) {}

  static createRootContext(): XmlReadContext {
    return new XmlReadContext(null, 'ROOT')
  }

  createChildObjectContext(): XmlReadContext {
    return new XmlReadContext(this, 'OBJECT')
  }

  createChildArrayContext(): XmlReadContext {
    return new XmlReadContext(this, 'ARRAY')
  }

  getParent(): XmlReadContext {
    return this.parent as XmlReadContext
  }

  inArray(): boolean {
    return this.type === 'ARRAY'
  }

  inObject(): boolean {
    return this.type === 'OBJECT'
  }

  convertToArray(): void {
    this.type = 'ARRAY'
  }

  valueStarted(): void {}
}

/** `_isIntNumber` (copié de StdDeserializer) */
function isIntNumber(text: string): number {
  const len = text.length
  if (len > 0) {
    const c = text.charAt(0)
    // skip leading negative sign, do NOT allow leading plus
    const start = c === '-' ? 1 : 0
    for (let i = start; i < len; ++i) {
      const ch = text.charCodeAt(i)
      if (ch > 0x39 || ch < 0x30) {
        return -1
      }
    }
    return len - start
  }
  return 0
}

export class FromXmlParser {
  private parsingContext = XmlReadContext.createRootContext()
  private readonly xmlTokens: XmlTokenStream
  private currToken: JsonToken | null = null
  private nextTokenValue: JsonToken | null = null
  private mayBeLeaf = false
  private nextIsLeadingMixed = false
  private currText: string | null = null
  // PORT: Int/Long/BigInteger -> bigint (seule la vérification de plage int est utilisée)
  private numberValue: bigint | null = null
  private readonly cfgNameForTextElement = ''

  constructor(xmlReader: XmlStreamReader) {
    this.xmlTokens = new XmlTokenStream(xmlReader)
    const firstToken = this.xmlTokens.initialize()
    if (this.xmlTokens.hasXsiNil()) {
      this.nextTokenValue = 'VALUE_NULL'
      this.xmlTokens.markAsStreamEnd()
    } else {
      switch (firstToken) {
        case XML_START_ELEMENT:
          this.nextTokenValue = 'START_OBJECT'
          break
        case XML_ROOT_TEXT:
          this.currText = this.xmlTokens.getText()
          this.nextTokenValue = this.currText === null ? 'VALUE_NULL' : 'VALUE_STRING'
          break
        default:
          throw new JsonParseException(`Internal problem: invalid starting state (${firstToken})`)
      }
    }
  }

  currentToken(): JsonToken | null {
    return this.currToken
  }

  hasToken(t: JsonToken): boolean {
    return this.currToken === t
  }

  isExpectedStartObjectToken(): boolean {
    return this.currToken === 'START_OBJECT'
  }

  currentName(): string {
    let name: string | null
    if (this.currToken === 'START_OBJECT' || this.currToken === 'START_ARRAY') {
      name = this.parsingContext.getParent().currentName
    } else {
      name = this.parsingContext.currentName
    }
    if (name === null) throw new Error(`Missing name, in state: ${this.currToken}`)
    return name
  }

  isExpectedStartArrayToken(): boolean {
    const t = this.currToken
    if (t === 'START_OBJECT') {
      this.currToken = 'START_ARRAY'
      this.parsingContext.convertToArray()
      if (this.nextTokenValue === 'END_OBJECT') {
        this.nextTokenValue = 'END_ARRAY'
      } else {
        this.nextTokenValue = null
      }
      this.xmlTokens.skipAttributes()
      return true
    }
    return t === 'START_ARRAY'
  }

  isExpectedNumberIntToken(): boolean {
    const t = this.currToken
    if (t === 'VALUE_STRING') {
      const text = javaTrim(this.currText as string)
      const len = isIntNumber(text)
      if (len > 0) {
        this.numberValue = BigInt(text)
        this.currToken = 'VALUE_NUMBER_INT'
        return true
      }
    }
    return t === 'VALUE_NUMBER_INT'
  }

  getIntValue(): number {
    const v = this.numberValue as bigint
    if (v < -2147483648n || v > 2147483647n) {
      throw new JsonParseException(`Numeric value (${this.getText()}) out of range of int (-2147483648 - 2147483647)`)
    }
    return Number(v)
  }

  getText(): string | null {
    if (this.currToken === null) {
      return null
    }
    switch (this.currToken) {
      case 'FIELD_NAME':
        return this.currentName()
      case 'VALUE_STRING':
        return this.currText
      default:
        return this.currToken
    }
  }

  nextToken(): JsonToken | null {
    this.numberValue = null
    if (this.nextTokenValue !== null) {
      const t = (this.currToken = this.nextTokenValue)
      this.nextTokenValue = null
      switch (t) {
        case 'START_OBJECT':
          this.parsingContext = this.parsingContext.createChildObjectContext()
          break
        case 'START_ARRAY':
          this.parsingContext = this.parsingContext.createChildArrayContext()
          break
        case 'END_OBJECT':
        case 'END_ARRAY':
          this.parsingContext = this.parsingContext.getParent()
          break
        case 'FIELD_NAME':
          if (this.nextIsLeadingMixed) {
            this.nextIsLeadingMixed = false
            this.parsingContext.currentName = this.cfgNameForTextElement
            this.nextTokenValue = 'VALUE_STRING'
          } else {
            this.parsingContext.currentName = this.xmlTokens.getLocalName()
          }
          break
        default:
          this.parsingContext.valueStarted()
      }
      return t
    }
    let token = this.xmlTokens.next()
    while (token === XML_START_ELEMENT) {
      if (this.mayBeLeaf) {
        this.nextTokenValue = 'FIELD_NAME'
        this.parsingContext = this.parsingContext.createChildObjectContext()
        return (this.currToken = 'START_OBJECT')
      }
      if (this.parsingContext.inArray()) {
        token = this.xmlTokens.next()
        this.mayBeLeaf = true
        continue
      }
      const name = this.xmlTokens.getLocalName()
      this.parsingContext.currentName = name
      // PORT: shouldWrap / repeatStartElement (enveloppement virtuel) non porté
      this.mayBeLeaf = true
      return (this.currToken = 'FIELD_NAME')
    }
    // Ok; beyond start element, what do we get?
    for (;;) {
      switch (token) {
        case XML_END_ELEMENT:
          if (this.mayBeLeaf) {
            this.mayBeLeaf = false
            if (this.parsingContext.inArray()) {
              this.nextTokenValue = 'END_OBJECT'
              this.parsingContext = this.parsingContext.createChildObjectContext()
              return (this.currToken = 'START_OBJECT')
            }
            if (this.currToken !== 'VALUE_NULL') {
              this.parsingContext.valueStarted()
              return (this.currToken = 'VALUE_NULL')
            }
          }
          this.currToken = this.parsingContext.inArray() ? 'END_ARRAY' : 'END_OBJECT'
          this.parsingContext = this.parsingContext.getParent()
          return this.currToken
        case XML_ATTRIBUTE_NAME:
          if (this.mayBeLeaf) {
            this.mayBeLeaf = false
            this.nextTokenValue = 'FIELD_NAME'
            this.currText = this.xmlTokens.getText()
            this.parsingContext = this.parsingContext.createChildObjectContext()
            return (this.currToken = 'START_OBJECT')
          }
          this.parsingContext.currentName = this.xmlTokens.getLocalName()
          return (this.currToken = 'FIELD_NAME')
        case XML_ATTRIBUTE_VALUE:
          this.currText = this.xmlTokens.getText()
          this.parsingContext.valueStarted()
          return (this.currToken = 'VALUE_STRING')
        case XML_TEXT:
          this.currText = this.xmlTokens.getText()
          if (this.mayBeLeaf) {
            this.mayBeLeaf = false
            token = this.xmlTokens.next()
            if (token === XML_END_ELEMENT) {
              if (this.parsingContext.inArray()) {
                if (allWs(this.currText)) {
                  this.nextTokenValue = 'END_OBJECT'
                  this.parsingContext = this.parsingContext.createChildObjectContext()
                  return (this.currToken = 'START_OBJECT')
                }
              }
              return (this.currToken = 'VALUE_STRING')
            }
            if (token !== XML_START_ELEMENT) {
              throw new JsonParseException(`Internal error: Expected END_ELEMENT (2) or START_ELEMENT (1), got event of type ${token}`)
            }
            this.xmlTokens.pushbackCurrentToken()
            this.parsingContext = this.parsingContext.createChildObjectContext()
          }
          if (this.parsingContext.inObject()) {
            if (this.currToken === 'FIELD_NAME') {
              this.nextIsLeadingMixed = true
              this.nextTokenValue = 'FIELD_NAME'
              return (this.currToken = 'START_OBJECT')
            } else if (allWs(this.currText)) {
              token = this.xmlTokens.next()
              continue
            }
          } else if (this.parsingContext.inArray()) {
            if (allWs(this.currText)) {
              token = this.xmlTokens.next()
              continue
            }
          }
          this.parsingContext.currentName = this.cfgNameForTextElement
          this.nextTokenValue = 'VALUE_STRING'
          return (this.currToken = 'FIELD_NAME')
        case XML_END:
          return (this.currToken = null)
        default:
          throw new JsonParseException(`Internal error: unknown token ${token}`)
      }
    }
  }

  /** `nextFieldName()` */
  nextFieldName(): string | null {
    if (this.nextToken() === 'FIELD_NAME') {
      return this.currentName()
    }
    return null
  }

  /** `ParserMinimalBase.skipChildren()` */
  skipChildren(): void {
    if (this.currToken !== 'START_OBJECT' && this.currToken !== 'START_ARRAY') {
      return
    }
    let open = 1
    for (;;) {
      const t = this.nextToken()
      if (t === null) {
        throw new JsonParseException('Unexpected end-of-input while skipping children')
      }
      switch (t) {
        case 'START_OBJECT':
        case 'START_ARRAY':
          ++open
          break
        case 'END_OBJECT':
        case 'END_ARRAY':
          if (--open === 0) {
            return
          }
          break
        default:
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Nombres Java
// ---------------------------------------------------------------------------

/** `String.trim()` de Java */
function javaTrim(s: string): string {
  let st = 0
  let len = s.length
  while (st < len && s.charCodeAt(st) <= 0x20) st++
  while (st < len && s.charCodeAt(len - 1) <= 0x20) len--
  return s.substring(st, len)
}

const ND = /^\p{Nd}$/u

/** `Character.digit(ch, 10)` (unité UTF-16) */
function javaDigit(s: string, i: number): number {
  const c = s.charCodeAt(i)
  if (c >= 0x30 && c <= 0x39) return c - 0x30
  if (c >= 0xd800 && c <= 0xdfff) return -1
  if (!ND.test(String.fromCharCode(c))) return -1
  // les chiffres Unicode (Nd) forment des suites contiguës de 10 valeurs 0..9
  let start = c
  while (ND.test(String.fromCharCode(start - 1))) start--
  return (c - start) % 10
}

class NumberFormatException extends Error {}

/** `Long.parseLong(s)` (en bigint) */
function javaParseLong(s: string, min: bigint, max: bigint): bigint {
  const len = s.length
  if (len === 0) throw new NumberFormatException(`For input string: "${s}"`)
  let i = 0
  let neg = false
  const first = s.charAt(0)
  if (first < '0') {
    if (first === '-') neg = true
    else if (first !== '+') throw new NumberFormatException(`For input string: "${s}"`)
    if (len === 1) throw new NumberFormatException(`For input string: "${s}"`)
    i++
  }
  let r = 0n
  for (; i < len; i++) {
    const d = javaDigit(s, i)
    if (d < 0) throw new NumberFormatException(`For input string: "${s}"`)
    r = r * 10n + BigInt(d)
    if ((neg ? -r : r) < min || (neg ? -r : r) > max) throw new NumberFormatException(`For input string: "${s}"`)
  }
  return neg ? -r : r
}

// ---------------------------------------------------------------------------
// Désérialiseurs (jackson-databind)
// ---------------------------------------------------------------------------

type Deser = (p: FromXmlParser) => unknown

/** `XmlDeserializationContext.extractScalarFromObject` */
function extractScalarFromObject(p: FromXmlParser): string {
  let text = ''
  while (p.nextToken() === 'FIELD_NAME') {
    const propName = p.currentName()
    const t = p.nextToken()
    if (t === 'VALUE_STRING') {
      if (propName === '') {
        text = p.getText() as string
      }
    } else {
      p.skipChildren()
    }
  }
  return text
}

/** `StringDeserializer` */
function deserializeString(p: FromXmlParser): string | null {
  if (p.hasToken('VALUE_STRING')) return p.getText()
  const t = p.currentToken()
  if (t === 'START_OBJECT') return extractScalarFromObject(p)
  if (t === 'VALUE_NUMBER_INT') return p.getText()
  throw new MismatchedInputException(`Cannot deserialize value of type \`java.lang.String\` from ${t} token`)
}

/** `NumberDeserializers.IntegerDeserializer` (Integer, non primitif) */
function deserializeInteger(p: FromXmlParser): number | null {
  if (p.isExpectedNumberIntToken()) return p.getIntValue()
  let text: string
  switch (p.currentToken()) {
    case 'VALUE_STRING':
      text = p.getText() as string
      break
    case 'VALUE_NULL':
      return null
    case 'START_OBJECT':
      text = extractScalarFromObject(p)
      break
    default:
      throw new MismatchedInputException(`Cannot deserialize value of type \`java.lang.Integer\` from ${p.currentToken()} token`)
  }
  // _checkFromStringCoercion : chaîne vide ou blanche -> null (coercionConfigFor(LogicalType.Integer) de XmlMapper)
  if (text.length === 0 || allWs(text)) return null
  text = javaTrim(text)
  if (text === 'null') return null
  // _parseInteger(ctxt, text)
  try {
    if (text.length > 9) {
      const l = javaParseLong(text, -(2n ** 63n), 2n ** 63n - 1n)
      if (l < -2147483648n || l > 2147483647n) {
        throw new InvalidFormatException(`Cannot deserialize value of type \`java.lang.Integer\` from String "${text}": Overflow: numeric value (${text}) out of range of \`java.lang.Integer\``)
      }
      return Number(l)
    }
    return Number(javaParseLong(text, -2147483648n, 2147483647n))
  } catch (e) {
    if (e instanceof NumberFormatException)
      throw new InvalidFormatException(`Cannot deserialize value of type \`java.lang.Integer\` from String "${text}": not a valid \`java.lang.Integer\` value`)
    throw e
  }
}

/** `FactoryBasedEnumDeserializer` avec un @JsonCreator délégué à un argument String */
function enumDeser(creator: (value: string) => unknown): Deser {
  return (p) => {
    const value = deserializeString(p)
    return creator(value as string)
  }
}

type BeanProp = { name: string; deser: Deser; nullsAsEmpty: boolean; empty: () => unknown }

type BeanInfo = { cls: new () => object; props: Map<string, BeanProp>; ignoreUnknown: boolean }

const beanInfos = new WeakMap<object, BeanInfo>()

function unwrapNullable(t: JsonType): JsonType {
  return typeof t === 'object' && 'nullable' in t ? t.nullable : t
}

function deserializerFor(type: JsonType): Deser {
  const t = unwrapNullable(type)
  if (t === 'String') return deserializeString
  if (t === 'Int') return deserializeInteger
  if (typeof t === 'object' && 'enum' in t) {
    const creator = jsonMetaOf(t.enum).creator
    if (creator === undefined) throw new JsonMappingException('PORT: enum sans @JsonCreator non porté')
    return enumDeser(creator)
  }
  if (typeof t === 'object' && 'list' in t) return collectionDeser(deserializerFor(t.list))
  if (typeof t === 'object' && 'class' in t) return (p) => beanDeserialize(beanInfo(t.class), p)
  throw new JsonMappingException(`PORT: type non porté pour XmlMapper: ${JSON.stringify(t)}`)
}

function beanInfo(cls: object): BeanInfo {
  let info = beanInfos.get(cls)
  if (info) return info
  const meta = jsonMetaOf(cls)
  const xml = xmlMetaOf(cls)
  const props = new Map<string, BeanProp>()
  const pm = jsonPropertiesOf(cls)
  for (const [prop, type] of Object.entries(pm?.props ?? {})) {
    if (meta.ignore?.includes(prop)) continue
    // @JacksonXmlProperty(localName) puis @JsonProperty(value) ; un wrapper de même nom que la propriété est sans effet
    const wrapperName = xml.wrapper?.[prop]?.localName
    const name = wrapperName !== undefined && wrapperName.length > 0 ? wrapperName : (xml.localName?.[prop] ?? meta.rename?.[prop] ?? prop)
    const t = unwrapNullable(type)
    props.set(name, {
      name: prop,
      deser: deserializerFor(type),
      nullsAsEmpty: meta.nullsAsEmpty?.includes(prop) ?? false,
      empty: () => (typeof t === 'object' && 'list' in t ? [] : null),
    })
  }
  info = { cls: cls as new () => object, props, ignoreUnknown: meta.ignoreUnknown ?? false }
  beanInfos.set(cls, info)
  return info
}

/** `SettableBeanProperty.deserializeAndSet` */
function deserializeAndSet(prop: BeanProp, p: FromXmlParser, bean: object): void {
  let value: unknown
  if (p.hasToken('VALUE_NULL')) value = prop.nullsAsEmpty ? prop.empty() : null
  else value = prop.deser(p)
  ;(bean as Record<string, unknown>)[prop.name] = value
}

/** `BeanDeserializer.deserialize` (vanilla) */
function beanDeserialize(info: BeanInfo, p: FromXmlParser): object | null {
  if (p.isExpectedStartObjectToken()) {
    return vanillaDeserialize(info, p, p.nextToken())
  }
  const t = p.currentToken()
  switch (t) {
    case 'VALUE_STRING':
      return deserializeFromString(info, p)
    case 'VALUE_NULL':
      // deserializeFromNull : p.requiresCustomCodec() (XML) -> objet vide
      return vanillaDeserialize(info, p, 'END_OBJECT')
    case 'FIELD_NAME':
    case 'END_OBJECT':
      return vanillaDeserialize(info, p, t)
  }
  throw new MismatchedInputException(`Cannot deserialize value of type \`${info.cls.name}\` from ${t} token`)
}

function vanillaDeserialize(info: BeanInfo, p: FromXmlParser, t: JsonToken | null): object {
  const bean = new info.cls()
  if (t === 'FIELD_NAME' && p.hasToken('FIELD_NAME')) {
    let propName: string | null = p.currentName()
    do {
      p.nextToken()
      const prop = info.props.get(propName)
      if (prop !== undefined) {
        deserializeAndSet(prop, p, bean)
        continue
      }
      // handleUnknownVanilla
      if (!info.ignoreUnknown) {
        throw new UnrecognizedPropertyException(`Unrecognized field "${propName}" (class ${info.cls.name}), not marked as ignorable`)
      }
      p.skipChildren()
    } while ((propName = p.nextFieldName()) !== null)
  }
  return bean
}

/** `StdDeserializer._deserializeFromString` pour un bean sans créateur String */
function deserializeFromString(info: BeanInfo, p: FromXmlParser): object | null {
  const value = p.getText() as string
  // chaîne vide -> AsEmpty, blanche -> AsEmpty (setAcceptBlankAsEmpty) : bean vide
  if (value.length === 0 || allWs(value)) return new info.cls()
  throw new MismatchedInputException(
    `Cannot construct instance of \`${info.cls.name}\` (although at least one Creator exists): no String-argument constructor/factory method to deserialize from String value ('${value}')`,
  )
}

/** `CollectionDeserializer` (ArrayList) */
function collectionDeser(valueDes: Deser): Deser {
  return (p) => {
    if (p.isExpectedStartArrayToken()) {
      const result: unknown[] = []
      let t: JsonToken | null
      while ((t = p.nextToken()) !== 'END_ARRAY') {
        if (t === null) throw new JsonParseException('Unexpected end-of-input')
        result.push(t === 'VALUE_NULL' ? null : valueDes(p))
      }
      return result
    }
    if (p.hasToken('VALUE_STRING')) {
      const text = p.getText() as string
      // EmptyString -> AsEmpty, blanc -> AsEmpty
      if (text.length === 0 || allWs(text)) return []
    }
    // handleNonArray : ACCEPT_SINGLE_VALUE_AS_ARRAY désactivé
    throw new MismatchedInputException(`Cannot deserialize value of type \`java.util.ArrayList\` from ${p.currentToken()} token`)
  }
}

// ---------------------------------------------------------------------------
// XmlMapper
// ---------------------------------------------------------------------------

/** `javax.xml.stream.XMLStreamException` */
export class XMLStreamException extends Error {}

/** Sous-ensemble de `javax.xml.stream.XMLStreamWriter` utilisé pour la configuration des namespaces */
export interface XMLStreamWriter {
  setDefaultNamespace(uri: string): void
  setPrefix(prefix: string, uri: string): void
}

/** `com.fasterxml.jackson.dataformat.xml.XmlFactory` */
export class XmlFactory {
  /** `_createXmlWriter(ctxt, w)` / `createGenerator(...)` : writer StAX d'un nouveau générateur */
  createXmlWriter<W extends XMLStreamWriter>(w: W): W {
    return w
  }
}

/** `com.fasterxml.jackson.dataformat.xml.XmlMapper` */
export class XmlMapper {
  constructor(readonly factory: XmlFactory = new XmlFactory()) {}

  /** `readValue(src, X::class.java)` */
  readValue<T>(src: Uint8Array | string, type: JsonType): T {
    const text = decode(src)
    const reader = new XmlStreamReader(readEvents(text))
    reader.initialize()
    const p = new FromXmlParser(reader)
    // ObjectMapper._readMapAndClose
    const t = p.nextToken()
    if (t === 'VALUE_NULL') return null as T
    return deserializerFor(type)(p) as T
  }
}

/** `Jackson2ObjectMapperBuilder` (sous-ensemble : `createXmlMapper(true).factory(f).build()`) */
export class Jackson2ObjectMapperBuilder {
  private xml = false
  private _factory: XmlFactory = new XmlFactory()

  createXmlMapper(createXmlMapper: boolean): this {
    this.xml = createXmlMapper
    return this
  }

  factory(factory: XmlFactory): this {
    this._factory = factory
    return this
  }

  build(): XmlMapper {
    if (!this.xml) throw new Error('Jackson2ObjectMapperBuilder: only XML mappers are supported by this port')
    return new XmlMapper(this._factory)
  }
}

/** `org.springframework.http.converter.xml.MappingJackson2XmlHttpMessageConverter` */
export class MappingJackson2XmlHttpMessageConverter {
  constructor(readonly objectMapper: XmlMapper) {}
}
