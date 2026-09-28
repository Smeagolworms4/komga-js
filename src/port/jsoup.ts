// Support de portage : sous-ensemble de jsoup 1.23.1 utilisé par Komga, sans jumeau Kotlin.
//  - Parser.xmlParser() : analyse par htmlparser2 (mode XML : casse conservée, pas de règles HTML implicites,
//    une balise fermante ferme l'élément ouvert de même nom le plus proche, sinon est ignorée, comme XmlTreeBuilder),
//    entités HTML décodées comme le Tokeniser de jsoup (bibliothèque `entities`) ;
//  - Parser.htmlParser() : parse5 (HTML5), positions de source (`setTrackPosition(true)`) ;
//  - sélecteurs jsoup (QueryParser) : balise (insensible à la casse), `*|balise`, `*`, `.classe`, `#id`, `[attr]`,
//    `[attr=valeur]`, `:root`, combinateurs ` ` et `>`, groupes `,` ; mêmes règles (valeurs d'attribut insensibles
//    à la casse, `:root` = élément de contexte, élément de contexte inclus dans les résultats) ;
//  - Element.text() : algorithme TextAccumulator de jsoup (normalisation des espaces, aucune balise « bloc » en XML).
// Vérifié contre la vraie bibliothèque (jshell) : test/port/jsoup.test.ts.
import { decodeHTML, decodeHTMLAttribute } from 'entities'
import { Parser as Html2Parser } from 'htmlparser2'
import { parse as parse5 } from 'parse5'
import { IllegalArgumentException } from './kotlin.js'
import { InputStream } from './java-io.js'

// ---------------------------------------------------------------------------
// Nœuds
// ---------------------------------------------------------------------------

export abstract class Node {
  parent: Element | null = null

  nextSibling(): Node | null {
    if (this.parent === null) return null
    const i = this.parent.childNodes.indexOf(this)
    return this.parent.childNodes[i + 1] ?? null
  }
}

export class TextNode extends Node {
  constructor(
    readonly text: string,
    readonly cdata = false,
  ) {
    super()
  }

  getWholeText(): string {
    return this.text
  }
}

export class LeafNode extends Node {}

export class Attribute {
  constructor(
    readonly key: string,
    readonly value: string,
  ) {}
}

export class Range {
  constructor(
    private readonly start: number,
    private readonly end: number,
  ) {}

  startPos(): number {
    return this.start
  }

  endPos(): number {
    return this.end
  }
}

/** Éléments bloc du jeu de balises HTML de jsoup (pour text() sur un document HTML) */
const HTML_BLOCK = new Set(
  'html head body frameset script noscript style meta link title frame noframes section nav aside hgroup header footer p h1 h2 h3 h4 h5 h6 br button ul ol pre div blockquote hr address figure figcaption form fieldset ins del dl dt dd li table caption thead tfoot tbody colgroup col tr th td video audio canvas details menu plaintext template article main center template dir applet marquee listing svg math'.split(
    ' ',
  ),
)

export class Element extends Node {
  readonly childNodes: Node[] = []
  /** fin de la balise ouvrante dans la source (setTrackPosition) */
  startTagEnd = -1
  startTagStart = -1

  constructor(
    readonly tagName: string,
    private readonly attrs: Attribute[],
    private readonly html: boolean,
  ) {
    super()
  }

  /** `normalName()` : nom en minuscules */
  normalName(): string {
    return this.tagName.toLowerCase()
  }

  nameIs(normalName: string): boolean {
    return this.normalName() === normalName
  }

  isBlock(): boolean {
    return this.html && HTML_BLOCK.has(this.normalName())
  }

  children(): Element[] {
    return this.childNodes.filter((c): c is Element => c instanceof Element)
  }

  appendChild(n: Node): void {
    n.parent = this
    this.childNodes.push(n)
  }

  attributes(): Attribute[] {
    return this.attrs
  }

  /** `attr(key)` : insensible à la casse, "" si absent */
  attr(key: string): string {
    const k = key.toLowerCase()
    return this.attrs.find((a) => a.key.toLowerCase() === k)?.value ?? ''
  }

  hasAttr(key: string): boolean {
    const k = key.toLowerCase()
    return this.attrs.some((a) => a.key.toLowerCase() === k)
  }

  id(): string {
    return this.attr('id')
  }

  hasClass(className: string): boolean {
    const classAttr = this.attr('class')
    const want = className.toLowerCase()
    return classAttr
      .split(/[ \t\n\r\f]+/)
      .filter((c) => c.length > 0)
      .some((c) => c.toLowerCase() === want)
  }

  sourceRange(): Range {
    return new Range(this.startTagStart, this.startTagEnd)
  }

  /** `text()` : TextAccumulator de jsoup */
  text(): string {
    let accum = ''
    const lastCharIsWhitespace = (): boolean => accum.length !== 0 && accum.charAt(accum.length - 1) === ' '
    const visit = (node: Node): void => {
      if (node instanceof TextNode) {
        if (node.cdata || preserveWhitespace(node.parent)) accum += node.getWholeText()
        else accum = appendNormalisedWhitespace(accum, node.getWholeText(), lastCharIsWhitespace())
      } else if (node instanceof Element) {
        // head
        if (accum.length > 0 && (node.isBlock() || node.nameIs('br')) && !lastCharIsWhitespace()) accum += ' '
        for (const c of node.childNodes) visit(c)
        // tail
        const next = node.nextSibling()
        const needsTrailing = !(!node.isBlock()) || node.children().some((c) => c.isBlock())
        if (node !== this && needsTrailing && (next instanceof TextNode || (next instanceof Element && !next.isBlock())) && !lastCharIsWhitespace()) accum += ' '
      }
    }
    for (const c of this.childNodes) visit(c)
    // l'élément lui-même : head/tail sans effet au début d'un accumulateur vide, et pas de voisin traité
    return javaTrim(accum)
  }

  select(query: string): Element[] {
    const evaluator = QueryParser.parse(query)
    const out: Element[] = []
    const walk = (el: Element): void => {
      if (evaluator(this, el)) out.push(el)
      for (const c of el.childNodes) if (c instanceof Element) walk(c)
    }
    walk(this)
    return out
  }

  selectFirst(query: string): Element | null {
    return this.select(query)[0] ?? null
  }

  getElementsByTag(tagName: string): Element[] {
    const t = tagName.trim().toLowerCase()
    if (t.length === 0) throw new IllegalArgumentException('String must not be empty')
    const out: Element[] = []
    const walk = (el: Element): void => {
      if (el.nameIs(t)) out.push(el)
      for (const c of el.childNodes) if (c instanceof Element) walk(c)
    }
    walk(this)
    return out
  }

  getElementsByClass(className: string): Element[] {
    const out: Element[] = []
    const walk = (el: Element): void => {
      if (el.hasClass(className)) out.push(el)
      for (const c of el.childNodes) if (c instanceof Element) walk(c)
    }
    walk(this)
    return out
  }
}

export class Document extends Element {
  constructor(html: boolean) {
    super('#root', [], html)
  }

  private htmlEl(): Element {
    const el = this.children().find((e) => e.nameIs('html'))
    if (el !== undefined) return el
    const created = new Element('html', [], false)
    this.appendChild(created)
    return created
  }

  /** `body()` : crée html/body si absents, comme jsoup */
  body(): Element {
    const html = this.htmlEl()
    const el = html.children().find((e) => e.nameIs('body') || e.nameIs('frameset'))
    if (el !== undefined) return el
    const created = new Element('body', [], false)
    html.appendChild(created)
    return created
  }
}

function preserveWhitespace(node: Element | null): boolean {
  // pre, textarea... en HTML ; aucune balise en XML
  let el = node
  let i = 0
  while (el !== null && i < 6) {
    if ((el as unknown as { html: boolean }).html && (el.nameIs('pre') || el.nameIs('textarea') || el.nameIs('plaintext') || el.nameIs('listing') || el.nameIs('title'))) return true
    el = el.parent
    i++
  }
  return false
}

function isActuallyWhitespace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 12 || c === 13 || c === 160
}

function appendNormalisedWhitespace(accum: string, string: string, stripLeading: boolean): string {
  let lastWasWhite = false
  let reachedNonWhite = false
  let out = accum
  for (const ch of string) {
    const c = ch.codePointAt(0) as number
    if (isActuallyWhitespace(c)) {
      if ((stripLeading && !reachedNonWhite) || lastWasWhite) continue
      out += ' '
      lastWasWhite = true
    } else if (!(c === 8203 || c === 173)) {
      out += ch
      lastWasWhite = false
      reachedNonWhite = true
    }
  }
  return out
}

function javaTrim(s: string): string {
  let a = 0
  let b = s.length
  while (a < b && s.charCodeAt(a) <= 32) a++
  while (b > a && s.charCodeAt(b - 1) <= 32) b--
  return s.substring(a, b)
}

// ---------------------------------------------------------------------------
// Sélecteurs
// ---------------------------------------------------------------------------

type Evaluator = (root: Element, el: Element) => boolean

class QueryParser {
  private static readonly cache = new Map<string, Evaluator>()

  static parse(query: string): Evaluator {
    let e = QueryParser.cache.get(query)
    if (e === undefined) {
      e = new QueryParser(query).parseGroups()
      QueryParser.cache.set(query, e)
    }
    return e
  }

  private i = 0

  private constructor(private readonly q: string) {}

  private parseGroups(): Evaluator {
    const groups: Evaluator[] = [this.parseSelector()]
    while (this.i < this.q.length) {
      if (this.q[this.i] !== ',') throw new IllegalArgumentException(`Could not parse query '${this.q}'`)
      this.i++
      groups.push(this.parseSelector())
    }
    if (groups.length === 1) return groups[0] as Evaluator
    return (root, el) => groups.some((g) => g(root, el))
  }

  private skipWs(): boolean {
    const s = this.i
    while (this.i < this.q.length && /\s/.test(this.q[this.i] as string)) this.i++
    return this.i > s
  }

  /** séquence de sélecteurs composés et de combinateurs, évaluée de droite à gauche */
  private parseSelector(): Evaluator {
    const parts: Evaluator[] = []
    const combinators: string[] = []
    this.skipWs()
    parts.push(this.parseCompound())
    for (;;) {
      const ws = this.skipWs()
      const c = this.q[this.i]
      if (c === undefined || c === ',') break
      if (c === '>') {
        this.i++
        this.skipWs()
        combinators.push('>')
      } else if (ws) combinators.push(' ')
      else throw new IllegalArgumentException(`Could not parse query '${this.q}'`)
      parts.push(this.parseCompound())
    }
    if (parts.length === 1) return parts[0] as Evaluator
    const matchFrom = (root: Element, el: Element, idx: number): boolean => {
      if (!(parts[idx] as Evaluator)(root, el)) return false
      if (idx === 0) return true
      const comb = combinators[idx - 1]
      if (comb === '>') {
        const p = el.parent
        return p !== null && matchFrom(root, p, idx - 1)
      }
      // descendant (StructuralEvaluator.Ancestor) : ancêtres jusqu'à la racine incluse
      for (let p = el.parent; p !== null; p = p.parent) {
        if (matchFrom(root, p, idx - 1)) return true
        if (p === root) break
      }
      return false
    }
    // ImmediateParentRun / Ancestor : le premier test ne peut pas porter sur la racine
    return (root, el) => el !== root && matchFrom(root, el, parts.length - 1)
  }

  private parseCompound(): Evaluator {
    const evals: Evaluator[] = []
    while (this.i < this.q.length) {
      const c = this.q[this.i] as string
      if (c === '.') {
        this.i++
        const name = this.consumeIdent()
        evals.push((_r, el) => el.hasClass(name))
      } else if (c === '#') {
        this.i++
        const id = this.consumeIdent()
        evals.push((_r, el) => el.id() === id)
      } else if (c === '[') {
        const end = this.q.indexOf(']', this.i)
        if (end < 0) throw new IllegalArgumentException(`Did not find balanced marker at '${this.q}'`)
        const body = this.q.substring(this.i + 1, end)
        this.i = end + 1
        const eq = body.indexOf('=')
        if (eq < 0) {
          const key = body.trim().toLowerCase()
          evals.push((_r, el) => el.hasAttr(key))
        } else {
          const key = body.substring(0, eq).trim().toLowerCase()
          let value = body.substring(eq + 1).trim()
          if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.substring(1, value.length - 1)
          const lv = value.toLowerCase()
          evals.push((_r, el) => el.hasAttr(key) && el.attr(key).toLowerCase() === lv)
        }
      } else if (c === ':') {
        if (this.q.startsWith(':root', this.i)) {
          this.i += 5
          evals.push((root, el) => root === el)
        } else throw new IllegalArgumentException(`Could not parse query '${this.q}': unexpected token at '${this.q.substring(this.i)}'`)
      } else if (c === '*' && this.q[this.i + 1] !== '|') {
        this.i++
        evals.push(() => true)
      } else if (/[\w*|:-]/.test(c)) {
        const tag = this.consumeElementSelector().trim().toLowerCase()
        if (tag.startsWith('*|')) {
          const plain = tag.substring(2)
          evals.push((_r, el) => el.nameIs(plain) || el.normalName().endsWith(`:${plain}`))
        } else {
          const t = tag.replace('|', ':')
          evals.push((_r, el) => el.nameIs(t))
        }
      } else break
    }
    if (evals.length === 0) throw new IllegalArgumentException(`Could not parse query '${this.q}'`)
    return (root, el) => evals.every((e) => e(root, el))
  }

  private consumeIdent(): string {
    const s = this.i
    while (this.i < this.q.length && /[\w-]/.test(this.q[this.i] as string)) this.i++
    return this.q.substring(s, this.i)
  }

  /** `consumeElementSelector` : lettres, chiffres, `*|`, `|`, `_`, `-`, `:` (hors pseudo `:root`) */
  private consumeElementSelector(): string {
    const s = this.i
    while (this.i < this.q.length) {
      const c = this.q[this.i] as string
      if (/[\w|_-]/.test(c) || (c === '*' && this.q[this.i + 1] === '|')) this.i++
      else if (c === ':' && !this.q.startsWith(':root', this.i)) this.i++
      else break
    }
    return this.q.substring(s, this.i)
  }
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

export class Parser {
  private trackPosition = false

  private constructor(readonly xml: boolean) {}

  static xmlParser(): Parser {
    return new Parser(true)
  }

  static htmlParser(): Parser {
    return new Parser(false)
  }

  setTrackPosition(b: boolean): this {
    this.trackPosition = b
    return this
  }

  isTrackPosition(): boolean {
    return this.trackPosition
  }
}

/** Décodage des octets comme DataUtil.parseInputStream (charset null) : BOM, puis déclaration XML / meta charset */
function decodeBytes(bytes: Uint8Array, xml: boolean): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  const text = new TextDecoder('utf-8').decode(bytes)
  const head = text.substring(0, 5 * 1024)
  let charset: string | undefined
  if (xml) charset = /^\s*<\?xml[^>]*?encoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1]
  else charset = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1]
  if (charset !== undefined && !/^utf-?8$/i.test(charset)) {
    try {
      return new TextDecoder(charset.toLowerCase()).decode(bytes)
    } catch {
      // jeu de caractères inconnu : UTF-8
    }
  }
  return text
}

function parseXml(text: string): Document {
  const doc = new Document(false)
  const stack: Element[] = [doc]
  let pendingText = ''
  let inCdata = false
  const current = (): Element => stack[stack.length - 1] as Element
  const flush = (): void => {
    if (pendingText.length > 0) {
      current().appendChild(new TextNode(decodeHTML(pendingText)))
      pendingText = ''
    }
  }
  const attrs: Attribute[] = []
  const parser = new Html2Parser(
    {
      onattribute(name, value) {
        // attributes.deduplicate : le premier l'emporte
        if (!attrs.some((a) => a.key === name)) attrs.push(new Attribute(name, decodeHTMLAttribute(value)))
      },
      onopentag(name) {
        flush()
        const el = new Element(name, [...attrs], false)
        attrs.length = 0
        current().appendChild(el)
        stack.push(el)
      },
      onclosetag(name) {
        flush()
        // popStackToClose : l'élément ouvert de même nom le plus proche
        for (let i = stack.length - 1; i > 0; i--) {
          if ((stack[i] as Element).tagName === name) {
            stack.length = i
            return
          }
        }
      },
      ontext(data) {
        if (inCdata) current().appendChild(new TextNode(data, true))
        else pendingText += data
      },
      oncdatastart() {
        flush()
        inCdata = true
      },
      oncdataend() {
        inCdata = false
      },
      oncomment() {
        flush()
        current().appendChild(new LeafNode())
      },
      onprocessinginstruction() {
        flush()
      },
    },
    { xmlMode: true, decodeEntities: false, recognizeSelfClosing: true },
  )
  parser.write(text)
  parser.end()
  flush()
  return doc
}

type P5Node = {
  nodeName: string
  tagName?: string
  attrs?: { name: string; value: string }[]
  childNodes?: P5Node[]
  content?: P5Node
  value?: string
  sourceCodeLocation?: { startOffset: number; startTag?: { startOffset: number; endOffset: number } } | null
}

function parseHtml(text: string, track: boolean): Document {
  const doc = new Document(true)
  const root = parse5(text, { sourceCodeLocationInfo: track }) as unknown as P5Node
  const convert = (n: P5Node, into: Element): void => {
    for (const c of n.childNodes ?? []) {
      if (c.nodeName === '#text') into.appendChild(new TextNode(c.value ?? ''))
      else if (c.nodeName === '#comment' || c.nodeName === '#documentType') into.appendChild(new LeafNode())
      else if (c.tagName !== undefined) {
        const el = new Element(c.tagName, (c.attrs ?? []).map((a) => new Attribute(a.name, a.value)), true)
        if (c.sourceCodeLocation) {
          el.startTagStart = c.sourceCodeLocation.startTag?.startOffset ?? c.sourceCodeLocation.startOffset
          el.startTagEnd = c.sourceCodeLocation.startTag?.endOffset ?? -1
        }
        into.appendChild(el)
        convert(c.content ?? c, el)
      }
    }
  }
  convert(root, doc)
  return doc
}

export const Jsoup = {
  /**
   * `Jsoup.parse(InputStream, null, baseUri, parser)` / `Jsoup.parse(String, baseUri, parser)` /
   * `Jsoup.parse(String, parser)` (PORT: surcharges fusionnées)
   */
  parse(input: InputStream | string, ...args: (Parser | string | null)[]): Document {
    const p = (args.find((a) => a instanceof Parser) as Parser | undefined) ?? Parser.htmlParser()
    const text = typeof input === 'string' ? input : decodeBytes(input.readAllBytes(), p.xml)
    return p.xml ? parseXml(text) : parseHtml(text, p.isTrackPosition())
  },
}
