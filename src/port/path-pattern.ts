// Support de portage : org.springframework.web.util.pattern (PathPatternParser / PathPattern) et
// org.springframework.http.server.PathContainer (Spring Framework 6.2), tels qu'utilisés par le
// RequestMappingHandlerMapping, les ResourceHandlerRegistry / InterceptorRegistry et Komga (EtagFilterConfiguration).
// Ce fichier n'a pas de jumeau Kotlin.
//
// Sémantique reproduite :
// - éléments : séparateur, littéral, `?` / `*` dans un segment, `*` (segment entier, au moins un caractère sauf en fin
//   de motif), `**` (reste du chemin, en fin de motif uniquement), `{var}`, `{var:regex}`, `{*reste}` ;
// - pas de correspondance optionnelle du séparateur final (défaut de Spring 6) ; sensible à la casse ;
// - `combine` et `SPECIFICITY_COMPARATOR` identiques à PathPattern.
import { IllegalArgumentException } from './kotlin.js'

/** `org.springframework.web.util.pattern.PatternParseException` */
export class PatternParseException extends IllegalArgumentException {}

/** `PathContainer` : chemin découpé en séparateurs et segments (valeurs décodées, paramètres `;` retirés) */
export class PathContainer {
  private constructor(
    readonly value: string,
    readonly elements: readonly PathElement[],
  ) {}

  static parsePath(path: string): PathContainer {
    const elements: PathElement[] = []
    let i = 0
    while (i < path.length) {
      if (path[i] === '/') {
        elements.push({ separator: true, value: '/', valueToMatch: '/' })
        i++
        continue
      }
      let j = path.indexOf('/', i)
      if (j < 0) j = path.length
      const raw = path.slice(i, j)
      const semi = raw.indexOf(';')
      const withoutParams = semi >= 0 ? raw.slice(0, semi) : raw
      elements.push({ separator: false, value: raw, valueToMatch: decodeSegment(withoutParams) })
      i = j
    }
    return new PathContainer(path, elements)
  }
}

type PathElement = { separator: boolean; value: string; valueToMatch: string }

function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// ---------------------------------------------------------------------------
// Éléments du motif
// ---------------------------------------------------------------------------

type Ctx = {
  elements: readonly PathElement[]
  variables: Map<string, string> | null
}

abstract class PElement {
  next: PElement | null = null
  constructor(readonly pos: number) {}
  abstract matches(pathIndex: number, ctx: Ctx): boolean
  abstract get normalizedLength(): number
  get captureCount(): number {
    return 0
  }
  get wildcardCount(): number {
    return 0
  }
  get score(): number {
    return this.wildcardCount * 100 + this.captureCount
  }
  isNoMorePattern(): boolean {
    return this.next === null
  }
}

class SeparatorElement extends PElement {
  matches(pathIndex: number, ctx: Ctx): boolean {
    if (pathIndex < ctx.elements.length && (ctx.elements[pathIndex] as PathElement).separator) {
      if (this.isNoMorePattern()) return pathIndex + 1 === ctx.elements.length
      return (this.next as PElement).matches(pathIndex + 1, ctx)
    }
    return false
  }
  get normalizedLength(): number {
    return 1
  }
}

function segmentAt(pathIndex: number, ctx: Ctx): string | null {
  const e = ctx.elements[pathIndex]
  if (e === undefined || e.separator) return null
  return e.valueToMatch
}

function afterSegment(el: PElement, pathIndex: number, ctx: Ctx): boolean {
  if (el.isNoMorePattern()) return pathIndex === ctx.elements.length
  return (el.next as PElement).matches(pathIndex, ctx)
}

class LiteralElement extends PElement {
  constructor(
    pos: number,
    readonly text: string,
  ) {
    super(pos)
  }
  matches(pathIndex: number, ctx: Ctx): boolean {
    const seg = segmentAt(pathIndex, ctx)
    if (seg === null || seg !== this.text) return false
    return afterSegment(this, pathIndex + 1, ctx)
  }
  get normalizedLength(): number {
    return this.text.length
  }
}

class WildcardElement extends PElement {
  matches(pathIndex: number, ctx: Ctx): boolean {
    let segmentData: string | null = null
    if (pathIndex < ctx.elements.length) {
      const e = ctx.elements[pathIndex] as PathElement
      if (e.separator) return false
      segmentData = e.valueToMatch
      pathIndex++
    }
    if (this.isNoMorePattern()) return pathIndex === ctx.elements.length
    // Within a path (e.g. /aa/*/bb) there must be at least one character to match the wildcard
    if (segmentData === null || segmentData.length === 0) return false
    return (this.next as PElement).matches(pathIndex, ctx)
  }
  get normalizedLength(): number {
    return 1
  }
  get wildcardCount(): number {
    return 1
  }
}

class CaptureVariableElement extends PElement {
  constructor(
    pos: number,
    readonly variableName: string,
    readonly constraint: RegExp | null,
  ) {
    super(pos)
  }
  matches(pathIndex: number, ctx: Ctx): boolean {
    const seg = segmentAt(pathIndex, ctx)
    if (seg === null || seg.length === 0) return false
    if (this.constraint && !this.constraint.test(seg)) return false
    const ok = afterSegment(this, pathIndex + 1, ctx)
    if (ok && ctx.variables) ctx.variables.set(this.variableName, seg)
    return ok
  }
  get normalizedLength(): number {
    return 1
  }
  get captureCount(): number {
    return 1
  }
}

/** Segment mêlant littéraux, `?`, `*` et `{var}` */
class RegexElement extends PElement {
  private readonly regex: RegExp
  private readonly names: string[] = []
  private readonly wildcards: number
  private readonly len: number

  constructor(pos: number, text: string) {
    super(pos)
    let re = ''
    let wildcards = 0
    let len = 0
    let i = 0
    while (i < text.length) {
      const c = text[i] as string
      if (c === '{') {
        const end = findClosingBrace(text, i)
        const inner = text.slice(i + 1, end)
        const colon = inner.indexOf(':')
        const name = colon >= 0 ? inner.slice(0, colon) : inner
        this.names.push(name)
        re += colon >= 0 ? `(${inner.slice(colon + 1)})` : '(.*)'
        len += 1
        i = end + 1
      } else if (c === '*') {
        re += '.*'
        wildcards++
        len += 1
        i++
      } else if (c === '?') {
        re += '.'
        len += 1
        i++
      } else {
        re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        len += 1
        i++
      }
    }
    this.regex = new RegExp(`^${re}$`, 's')
    this.wildcards = wildcards
    this.len = len
  }
  matches(pathIndex: number, ctx: Ctx): boolean {
    const seg = segmentAt(pathIndex, ctx)
    if (seg === null) return false
    const m = this.regex.exec(seg)
    if (!m) return false
    const ok = afterSegment(this, pathIndex + 1, ctx)
    if (ok && ctx.variables) this.names.forEach((n, k) => ctx.variables?.set(n, m[k + 1] ?? ''))
    return ok
  }
  get normalizedLength(): number {
    return this.len
  }
  get captureCount(): number {
    return this.names.length
  }
  get wildcardCount(): number {
    return this.wildcards
  }
}

/** `/**` : zéro ou plusieurs segments jusqu'à la fin */
class WildcardTheRestElement extends PElement {
  matches(pathIndex: number, ctx: Ctx): boolean {
    // If there is more data, it must start with the separator
    if (pathIndex < ctx.elements.length && !(ctx.elements[pathIndex] as PathElement).separator) return false
    return true
  }
  get normalizedLength(): number {
    return 1
  }
  get wildcardCount(): number {
    return 1
  }
}

/** `/{*var}` */
class CaptureTheRestElement extends PElement {
  constructor(
    pos: number,
    readonly variableName: string,
  ) {
    super(pos)
  }
  matches(pathIndex: number, ctx: Ctx): boolean {
    if (pathIndex < ctx.elements.length && !(ctx.elements[pathIndex] as PathElement).separator) return false
    if (ctx.variables) {
      let s = ''
      for (let i = pathIndex; i < ctx.elements.length; i++) {
        const e = ctx.elements[i] as PathElement
        s += e.separator ? '/' : e.valueToMatch
      }
      ctx.variables.set(this.variableName, s)
    }
    return true
  }
  get normalizedLength(): number {
    return 1
  }
  get captureCount(): number {
    return 1
  }
}

function findClosingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  throw new PatternParseException(`Missing closing '}' in pattern '${text}'`)
}

// ---------------------------------------------------------------------------
// PathPattern
// ---------------------------------------------------------------------------

export class PathPattern {
  readonly capturedVariableCount: number
  readonly normalizedLength: number
  readonly score: number
  readonly catchAll: boolean
  readonly endsWithSeparatorWildcard: boolean

  constructor(
    readonly patternString: string,
    private readonly head: PElement | null,
  ) {
    let captured = 0
    let len = 0
    let score = 0
    let e = head
    let last: PElement | null = null
    let beforeLast: PElement | null = null
    while (e) {
      captured += e.captureCount
      len += e.normalizedLength
      score += e.score
      beforeLast = last
      last = e
      e = e.next
    }
    this.capturedVariableCount = captured
    this.normalizedLength = len
    this.score = score
    this.catchAll = head instanceof WildcardTheRestElement || head instanceof CaptureTheRestElement
    this.endsWithSeparatorWildcard = last instanceof WildcardElement && beforeLast instanceof SeparatorElement && last.next === null
  }

  getPatternString(): string {
    return this.patternString
  }

  toString(): string {
    return this.patternString
  }

  hasPatternSyntax(): boolean {
    let e = this.head
    while (e) {
      if (!(e instanceof SeparatorElement) && !(e instanceof LiteralElement)) return true
      e = e.next
    }
    return false
  }

  matches(path: PathContainer | string): boolean {
    const p = typeof path === 'string' ? PathContainer.parsePath(path) : path
    if (this.head === null) return !hasText(p)
    if (!hasText(p)) {
      if (this.head instanceof WildcardTheRestElement || this.head instanceof CaptureTheRestElement) return true
      return false
    }
    return this.head.matches(0, { elements: p.elements, variables: null })
  }

  /** Variables capturées, ou null si le chemin ne correspond pas */
  matchAndExtract(path: PathContainer | string): Map<string, string> | null {
    const p = typeof path === 'string' ? PathContainer.parsePath(path) : path
    const variables = new Map<string, string>()
    if (this.head === null) return !hasText(p) ? variables : null
    if (!hasText(p) && !(this.head instanceof WildcardTheRestElement || this.head instanceof CaptureTheRestElement)) return null
    if (this.head instanceof CaptureTheRestElement && !hasText(p)) variables.set(this.head.variableName, '')
    return this.head.matches(0, { elements: p.elements, variables }) ? variables : null
  }

  /** `extractPathWithinPattern` : partie du chemin couverte par la première section à motif */
  extractPathWithinPattern(path: PathContainer | string): string {
    const p = typeof path === 'string' ? PathContainer.parsePath(path) : path
    const els = p.elements
    let startIndex = 0
    // Find first path element that is not a separator or a literal (i.e. the first pattern based element)
    let e = this.head
    while (e && (e instanceof SeparatorElement || e instanceof LiteralElement)) {
      e = e.next
      startIndex++
    }
    if (e === null) return '' // there is no pattern piece
    // Skip leading separators that would be in the result
    while (startIndex < els.length && (els[startIndex] as PathElement).separator) startIndex++
    let endIndex = els.length
    // Skip trailing separators that would be in the result
    while (endIndex > 0 && (els[endIndex - 1] as PathElement).separator) endIndex--
    return els
      .slice(startIndex, Math.max(startIndex, endIndex))
      .map((x) => x.value)
      .join('')
  }

  combine(pattern2: PathPattern): PathPattern {
    // If one of them is empty the result is the other. If both empty the result is ""
    if (!this.patternString) {
      if (!pattern2.patternString) return PathPatternParser.defaultInstance.parse('')
      return pattern2
    }
    if (!pattern2.patternString) return this
    // /* + /hotel => /hotel
    // /*.* + /*.html => /*.html
    // However:
    // /usr + /user => /usr/user
    // /{foo} + /bar => /{foo}/bar
    if (this.patternString !== pattern2.patternString && this.capturedVariableCount === 0 && this.matches(PathContainer.parsePath(pattern2.patternString))) return pattern2
    // /hotels/* + /booking => /hotels/booking
    // /hotels/* + booking => /hotels/booking
    if (this.endsWithSeparatorWildcard) return PathPatternParser.defaultInstance.parse(concat(this.patternString.slice(0, -2), pattern2.patternString))
    // /hotels + /booking => /hotels/booking
    // /hotels + booking => /hotels/booking
    const starDotPos1 = this.patternString.indexOf('*.') // Are there any file prefix/suffix things to consider?
    if (this.capturedVariableCount !== 0 || starDotPos1 === -1) return PathPatternParser.defaultInstance.parse(concat(this.patternString, pattern2.patternString))
    // /*.html + /hotel => /hotel.html
    // /*.html + /hotel.* => /hotel.html
    const firstExtension = this.patternString.slice(starDotPos1 + 1) // looking for the first extension
    const p2string = pattern2.patternString
    const dotPos2 = p2string.indexOf('.')
    const file2 = dotPos2 === -1 ? p2string : p2string.slice(0, dotPos2)
    const secondExtension = dotPos2 === -1 ? '' : p2string.slice(dotPos2)
    const firstExtensionWild = firstExtension === '.*' || firstExtension === ''
    const secondExtensionWild = secondExtension === '.*' || secondExtension === ''
    if (!firstExtensionWild && !secondExtensionWild) throw new IllegalArgumentException(`Cannot combine patterns: ${this.patternString} and ${pattern2}`)
    return PathPatternParser.defaultInstance.parse(file2 + (firstExtensionWild ? secondExtension : firstExtension))
  }

  /** `PathPattern.SPECIFICITY_COMPARATOR` */
  static readonly SPECIFICITY_COMPARATOR = (p1: PathPattern | null, p2: PathPattern | null): number => {
    if (p1 === null) return p2 === null ? 0 : 1
    if (p2 === null) return -1
    const c1 = p1.catchAll ? 1 : 0
    const c2 = p2.catchAll ? 1 : 0
    if (c1 !== c2) return c1 - c2
    const n1 = p1.catchAll ? -p1.normalizedLength : 0
    const n2 = p2.catchAll ? -p2.normalizedLength : 0
    if (n1 !== n2) return n1 - n2
    if (p1.score !== p2.score) return p1.score - p2.score
    return -p1.normalizedLength - -p2.normalizedLength
  }
}

function hasText(p: PathContainer): boolean {
  return p.elements.length > 0
}

function concat(path1: string, path2: string): string {
  const path1EndsWithSeparator = path1.endsWith('/')
  const path2StartsWithSeparator = path2.startsWith('/')
  if (path1EndsWithSeparator && path2StartsWithSeparator) return path1 + path2.slice(1)
  if (path1EndsWithSeparator || path2StartsWithSeparator) return path1 + path2
  return `${path1}/${path2}`
}

// ---------------------------------------------------------------------------
// PathPatternParser
// ---------------------------------------------------------------------------

export class PathPatternParser {
  static readonly defaultInstance = new PathPatternParser()

  /** `initFullPathPattern` : préfixe `/` manquant (RequestMappingInfo) */
  initFullPathPattern(pattern: string): string {
    return pattern && !pattern.startsWith('/') ? `/${pattern}` : pattern
  }

  parse(pattern: string): PathPattern {
    let head: PElement | null = null
    let tail: PElement | null = null
    const push = (e: PElement) => {
      if (tail && (tail instanceof WildcardTheRestElement || tail instanceof CaptureTheRestElement))
        throw new PatternParseException(`No more pattern data allowed after {*...} or ** pattern element: ${pattern}`)
      if (tail) tail.next = e
      else head = e
      tail = e
    }
    let i = 0
    while (i < pattern.length) {
      if (pattern[i] === '/') {
        // `/**` ou `/{*var}` en fin de motif : l'élément inclut le séparateur
        const rest = pattern.slice(i + 1)
        const segEnd = rest.indexOf('/')
        const seg = segEnd < 0 ? rest : rest.slice(0, segEnd)
        if (seg === '**' && segEnd < 0) {
          push(new WildcardTheRestElement(i))
          i = pattern.length
          continue
        }
        if (seg.startsWith('{*') && seg.endsWith('}') && segEnd < 0) {
          push(new CaptureTheRestElement(i, seg.slice(2, -1)))
          i = pattern.length
          continue
        }
        push(new SeparatorElement(i))
        i++
        continue
      }
      let j = i
      // un segment se termine au prochain '/' hors accolades
      let depth = 0
      while (j < pattern.length && !(pattern[j] === '/' && depth === 0)) {
        if (pattern[j] === '{') depth++
        else if (pattern[j] === '}') depth--
        j++
      }
      const seg = pattern.slice(i, j)
      if (seg === '*') push(new WildcardElement(i))
      else if (seg === '**') {
        // `**` au milieu du motif : Spring 6 le traite comme un joker de segment (et le déconseille)
        push(new WildcardElement(i))
      } else if (/^\{[^{}*]+\}$/.test(seg) || (/^\{[^{}*:]+:.*\}$/.test(seg) && findClosingBrace(seg, 0) === seg.length - 1)) {
        const inner = seg.slice(1, -1)
        const colon = inner.indexOf(':')
        push(
          new CaptureVariableElement(i, colon >= 0 ? inner.slice(0, colon) : inner, colon >= 0 ? new RegExp(`^(?:${inner.slice(colon + 1)})$`, 's') : null),
        )
      } else if (/[*?{]/.test(seg)) push(new RegexElement(i, seg))
      else push(new LiteralElement(i, seg))
      i = j
    }
    return new PathPattern(pattern, head)
  }
}
