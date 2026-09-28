// Support de portage : org.apache.lucene.util.automaton.RegExp (Lucene 9.9.1) pour RegexpQuery (drapeaux RegExp.ALL).
// L'analyseur syntaxique est porté ligne à ligne (mêmes règles, mêmes exceptions IllegalArgumentException) ;
// PORT: au lieu de construire un automate, l'expression est évaluée directement sur les points de code d'un terme
// (ensembles de positions de fin), ce qui donne le même langage reconnu, complément (~) et intersection (&) compris.
// Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException, NumberFormatException } from '../kotlin.js'

export const INTERSECTION = 0x0001
export const COMPLEMENT = 0x0002
export const EMPTY = 0x0004
export const ANYSTRING = 0x0008
export const AUTOMATON = 0x0010
export const INTERVAL = 0x0020
export const ALL = 0xff
export const NONE = 0x0000

type Node =
  | { kind: 'UNION' | 'CONCATENATION' | 'INTERSECTION'; exp1: Node; exp2: Node }
  | { kind: 'OPTIONAL' | 'COMPLEMENT'; exp1: Node }
  | { kind: 'REPEAT'; exp1: Node; min: number; max: number } // max = -1 : illimité
  | { kind: 'CHAR'; c: number }
  | { kind: 'CHAR_RANGE'; from: number; to: number }
  | { kind: 'ANYCHAR' | 'EMPTY' | 'ANYSTRING' }
  | { kind: 'STRING'; s: number[] }
  | { kind: 'AUTOMATON'; s: string }
  | { kind: 'INTERVAL'; min: number; max: number; digits: number }

/** `Integer.parseInt` (chiffres décimaux uniquement ici) */
function parseInt32(s: string): number {
  const n = Number(s)
  if (!/^\d+$/.test(s) || n > 2147483647) throw new NumberFormatException(`For input string: "${s}"`)
  return n
}

function cps(s: string): number[] {
  return Array.from(s, (c) => c.codePointAt(0) as number)
}

export class RegExp {
  private readonly originalString: string
  private readonly flags: number
  private pos = 0
  readonly root: Node

  constructor(s: string, syntaxFlags: number = ALL) {
    if (syntaxFlags > ALL) {
      throw new IllegalArgumentException('Illegal syntax flag')
    }
    this.flags = syntaxFlags
    this.originalString = s
    let e: Node
    if (s.length === 0) e = { kind: 'STRING', s: [] }
    else {
      e = this.parseUnionExp()
      if (this.pos < this.originalString.length) throw new IllegalArgumentException(`end-of-string expected at position ${this.pos}`)
    }
    this.root = e
    // toAutomaton(provider = DEFAULT_PROVIDER) : un automate nommé n'est jamais trouvé
    RegExp.checkAutomata(e)
  }

  private static checkAutomata(n: Node): void {
    if (n.kind === 'AUTOMATON') throw new IllegalArgumentException(`'${n.s}' not found`)
    if ('exp1' in n) RegExp.checkAutomata(n.exp1)
    if ('exp2' in n) RegExp.checkAutomata(n.exp2)
  }

  private peek(s: string): boolean {
    return this.more() && s.indexOf(String.fromCodePoint(this.originalString.codePointAt(this.pos) as number)) !== -1
  }

  private match(c: number): boolean {
    if (this.pos >= this.originalString.length) return false
    if (this.originalString.codePointAt(this.pos) === c) {
      this.pos += c >= 0x10000 ? 2 : 1
      return true
    }
    return false
  }

  private more(): boolean {
    return this.pos < this.originalString.length
  }

  private next(): number {
    if (!this.more()) throw new IllegalArgumentException('unexpected end-of-string')
    const ch = this.originalString.codePointAt(this.pos) as number
    this.pos += ch >= 0x10000 ? 2 : 1
    return ch
  }

  private check(flag: number): boolean {
    return (this.flags & flag) !== 0
  }

  private parseUnionExp(): Node {
    return this.iterativeParseExp(
      () => this.parseInterExp(),
      () => this.match(0x7c /* | */),
      (a, b) => ({ kind: 'UNION', exp1: a, exp2: b }),
    )
  }

  private parseInterExp(): Node {
    return this.iterativeParseExp(
      () => this.parseConcatExp(),
      () => this.check(INTERSECTION) && this.match(0x26 /* & */),
      (a, b) => ({ kind: 'INTERSECTION', exp1: a, exp2: b }),
    )
  }

  private parseConcatExp(): Node {
    return this.iterativeParseExp(
      () => this.parseRepeatExp(),
      () => this.more() && !this.peek(')|') && (!this.check(INTERSECTION) || !this.peek('&')),
      (a, b) => ({ kind: 'CONCATENATION', exp1: a, exp2: b }),
    )
  }

  private iterativeParseExp(gather: () => Node, stop: () => boolean, associativeReduce: (a: Node, b: Node) => Node): Node {
    let result = gather()
    while (stop() === true) {
      const e = gather()
      result = associativeReduce(result, e)
    }
    return result
  }

  private parseRepeatExp(): Node {
    let e = this.parseComplExp()
    while (this.peek('?*+{')) {
      if (this.match(0x3f /* ? */)) e = { kind: 'OPTIONAL', exp1: e }
      else if (this.match(0x2a /* * */)) e = { kind: 'REPEAT', exp1: e, min: 0, max: -1 }
      else if (this.match(0x2b /* + */)) e = { kind: 'REPEAT', exp1: e, min: 1, max: -1 }
      else if (this.match(0x7b /* { */)) {
        let start = this.pos
        while (this.peek('0123456789')) this.next()
        if (start === this.pos) throw new IllegalArgumentException(`integer expected at position ${this.pos}`)
        const n = parseInt32(this.originalString.substring(start, this.pos))
        let m = -1
        if (this.match(0x2c /* , */)) {
          start = this.pos
          while (this.peek('0123456789')) this.next()
          if (start !== this.pos) m = parseInt32(this.originalString.substring(start, this.pos))
        } else m = n
        if (!this.match(0x7d /* } */)) throw new IllegalArgumentException(`expected '}' at position ${this.pos}`)
        if (m !== -1 && n > m) {
          throw new IllegalArgumentException(`invalid repetition range(out of order): ${n}..${m}`)
        }
        if (m === -1) e = { kind: 'REPEAT', exp1: e, min: n, max: -1 }
        else e = { kind: 'REPEAT', exp1: e, min: n, max: m }
      }
    }
    return e
  }

  private parseComplExp(): Node {
    if (this.check(COMPLEMENT) && this.match(0x7e /* ~ */)) return { kind: 'COMPLEMENT', exp1: this.parseComplExp() }
    else return this.parseCharClassExp()
  }

  private parseCharClassExp(): Node {
    if (this.match(0x5b /* [ */)) {
      let negate = false
      if (this.match(0x5e /* ^ */)) negate = true
      let e = this.parseCharClasses()
      if (negate) e = { kind: 'INTERSECTION', exp1: { kind: 'ANYCHAR' }, exp2: { kind: 'COMPLEMENT', exp1: e } }
      if (!this.match(0x5d /* ] */)) throw new IllegalArgumentException(`expected ']' at position ${this.pos}`)
      return e
    } else return this.parseSimpleExp()
  }

  private parseCharClasses(): Node {
    let e = this.parseCharClass()
    while (this.more() && !this.peek(']')) e = { kind: 'UNION', exp1: e, exp2: this.parseCharClass() }
    return e
  }

  private parseCharClass(): Node {
    const predefinedExp = this.matchPredefinedCharacterClass()
    if (predefinedExp !== null) {
      return predefinedExp
    }

    const c = this.parseCharExp()
    if (this.match(0x2d /* - */)) return RegExp.makeCharRange(c, this.parseCharExp())
    else return { kind: 'CHAR', c }
  }

  private static makeCharRange(from: number, to: number): Node {
    if (from > to) throw new IllegalArgumentException(`invalid range: from (${from}) cannot be > to (${to})`)
    return { kind: 'CHAR_RANGE', from, to }
  }

  private static expandPredefined(from: number): Node {
    // See https://docs.oracle.com/javase/tutorial/essential/regex/pre_char_classes.html
    switch (String.fromCodePoint(from)) {
      case 'd':
        return new RegExp('[0-9]').root // digit
      case 'D':
        return new RegExp('[^0-9]').root // non-digit
      case 's':
        return new RegExp('[ \t\n\r]').root // whitespace
      case 'S':
        return new RegExp('[^\\s]').root // non-whitespace
      case 'w':
        return new RegExp('[a-zA-Z_0-9]').root // word
      case 'W':
        return new RegExp('[^\\w]').root // non-word
      default:
        throw new IllegalArgumentException(`invalid character class ${from}`)
    }
  }

  private matchPredefinedCharacterClass(): Node | null {
    // See https://docs.oracle.com/javase/tutorial/essential/regex/pre_char_classes.html
    if (this.match(0x5c /* \ */)) {
      if (this.peek('dDwWsS')) {
        return RegExp.expandPredefined(this.next())
      }

      if (this.peek('\\')) {
        return { kind: 'CHAR', c: this.next() }
      }

      // From https://docs.oracle.com/javase/8/docs/api/java/util/regex/Pattern.html#bs
      // "It is an error to use a backslash prior to any alphabetic character that does not denote
      // an escaped construct;"
      if (this.peek('abcefghijklmnopqrtuvxyz') || this.peek('ABCEFGHIJKLMNOPQRTUVXYZ')) {
        throw new IllegalArgumentException(`invalid character class \\${String.fromCodePoint(this.next())}`)
      }
    }

    return null
  }

  private parseSimpleExp(): Node {
    if (this.match(0x2e /* . */)) return { kind: 'ANYCHAR' }
    else if (this.check(EMPTY) && this.match(0x23 /* # */)) return { kind: 'EMPTY' }
    else if (this.check(ANYSTRING) && this.match(0x40 /* @ */)) return { kind: 'ANYSTRING' }
    else if (this.match(0x22 /* " */)) {
      const start = this.pos
      while (this.more() && !this.peek('"')) this.next()
      if (!this.match(0x22)) throw new IllegalArgumentException(`expected '"' at position ${this.pos}`)
      return { kind: 'STRING', s: cps(this.originalString.substring(start, this.pos - 1)) }
    } else if (this.match(0x28 /* ( */)) {
      if (this.match(0x29 /* ) */)) return { kind: 'STRING', s: [] }
      const e = this.parseUnionExp()
      if (!this.match(0x29)) throw new IllegalArgumentException(`expected ')' at position ${this.pos}`)
      return e
    } else if ((this.check(AUTOMATON) || this.check(INTERVAL)) && this.match(0x3c /* < */)) {
      const start = this.pos
      while (this.more() && !this.peek('>')) this.next()
      if (!this.match(0x3e /* > */)) throw new IllegalArgumentException(`expected '>' at position ${this.pos}`)
      const s = this.originalString.substring(start, this.pos - 1)
      const i = s.indexOf('-')
      if (i === -1) {
        if (!this.check(AUTOMATON)) throw new IllegalArgumentException(`interval syntax error at position ${this.pos - 1}`)
        return { kind: 'AUTOMATON', s }
      } else {
        if (!this.check(INTERVAL)) throw new IllegalArgumentException(`illegal identifier at position ${this.pos - 1}`)
        try {
          if (i === 0 || i === s.length - 1 || i !== s.lastIndexOf('-')) throw new NumberFormatException()
          const smin = s.substring(0, i)
          const smax = s.substring(i + 1)
          let imin = parseIntJava(smin)
          let imax = parseIntJava(smax)
          let digits: number
          if (smin.length === smax.length) digits = smin.length
          else digits = 0
          if (imin > imax) {
            const t = imin
            imin = imax
            imax = t
          }
          return { kind: 'INTERVAL', min: imin, max: imax, digits }
        } catch (e) {
          if (e instanceof NumberFormatException) throw new IllegalArgumentException(`interval syntax error at position ${this.pos - 1}`, e)
          throw e
        }
      }
    } else {
      const predefined = this.matchPredefinedCharacterClass()
      if (predefined !== null) {
        return predefined
      }
      return { kind: 'CHAR', c: this.parseCharExp() }
    }
  }

  private parseCharExp(): number {
    this.match(0x5c /* \ */)
    return this.next()
  }

  /** Le terme (points de code) appartient-il au langage ? */
  run(term: string): boolean {
    const s = cps(term)
    const memo = new Map<Node, Map<number, Set<number>>>()
    return ends(this.root, s, 0, memo).has(s.length)
  }
}

/** `Integer.parseInt` avec signe (intervalles) */
function parseIntJava(s: string): number {
  if (!/^[+-]?\d+$/.test(s)) throw new NumberFormatException(`For input string: "${s}"`)
  const n = Number(s)
  if (n > 2147483647 || n < -2147483648) throw new NumberFormatException(`For input string: "${s}"`)
  return n
}

/** Ensemble des positions j telles que s[i..j) appartient au langage de n */
function ends(n: Node, s: number[], i: number, memo: Map<Node, Map<number, Set<number>>>): Set<number> {
  let m = memo.get(n)
  if (m === undefined) {
    m = new Map()
    memo.set(n, m)
  }
  const cached = m.get(i)
  if (cached !== undefined) return cached
  const r = new Set<number>()
  m.set(i, r)
  switch (n.kind) {
    case 'UNION':
      for (const j of ends(n.exp1, s, i, memo)) r.add(j)
      for (const j of ends(n.exp2, s, i, memo)) r.add(j)
      break
    case 'CONCATENATION':
      for (const j of ends(n.exp1, s, i, memo)) for (const k of ends(n.exp2, s, j, memo)) r.add(k)
      break
    case 'INTERSECTION': {
      const b = ends(n.exp2, s, i, memo)
      for (const j of ends(n.exp1, s, i, memo)) if (b.has(j)) r.add(j)
      break
    }
    case 'OPTIONAL':
      r.add(i)
      for (const j of ends(n.exp1, s, i, memo)) r.add(j)
      break
    case 'COMPLEMENT': {
      const a = ends(n.exp1, s, i, memo)
      for (let j = i; j <= s.length; j++) if (!a.has(j)) r.add(j)
      break
    }
    case 'REPEAT': {
      // positions atteintes après exactement k répétitions, ajoutées au résultat pour min <= k <= max
      let frontier = new Set<number>([i])
      for (let k = 0; ; k++) {
        if (k >= n.min) for (const j of frontier) r.add(j)
        if ((n.max !== -1 && k >= n.max) || frontier.size === 0) break
        const next = new Set<number>()
        for (const j of frontier) for (const e of ends(n.exp1, s, j, memo)) next.add(e)
        // plus rien de nouveau : les successeurs des positions déjà retenues ont déjà été explorés
        if (k >= n.min && [...next].every((j) => r.has(j))) break
        // avant le minimum, un ensemble stable le reste jusqu'au minimum
        if (k < n.min && next.size === frontier.size && [...next].every((j) => frontier.has(j))) k = Math.max(k, n.min - 1)
        frontier = next
      }
      break
    }
    case 'CHAR':
      if (i < s.length && s[i] === n.c) r.add(i + 1)
      break
    case 'CHAR_RANGE':
      if (i < s.length && (s[i] as number) >= n.from && (s[i] as number) <= n.to) r.add(i + 1)
      break
    case 'ANYCHAR':
      if (i < s.length) r.add(i + 1)
      break
    case 'EMPTY':
      break
    case 'ANYSTRING':
      for (let j = i; j <= s.length; j++) r.add(j)
      break
    case 'STRING': {
      let ok = i + n.s.length <= s.length
      for (let k = 0; ok && k < n.s.length; k++) if (s[i + k] !== n.s[k]) ok = false
      if (ok) r.add(i + n.s.length)
      break
    }
    case 'AUTOMATON':
      break
    case 'INTERVAL':
      for (let j = i + 1; j <= s.length; j++) {
        const c = s[j - 1] as number
        if (c < 0x30 || c > 0x39) break
        const len = j - i
        if (n.digits > 0 && len !== n.digits) continue
        const v = Number(String.fromCodePoint(...s.slice(i, j)))
        if (v >= n.min && v <= n.max) r.add(j)
      }
      break
  }
  return r
}
