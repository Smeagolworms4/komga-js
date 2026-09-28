// Support de test : évaluateur JsonPath reproduisant Jayway JsonPath 2.9 (configuration par défaut : json-smart,
// sans option), utilisé par `jsonPath(..)` de MockMvc (test/support/mockmvc.ts). Ce fichier n'a pas de jumeau Kotlin.
//
// Pris en charge :
// - racine `$` (un chemin sans `$` ni `@` est préfixé par `$.`, comme PathCompiler) ;
// - `.name`, `['name']`, `["name"]`, `['a','b']` (plusieurs propriétés -> objet réduit), `.*`, `[*]`, `..name`, `..*`,
//   `..[..]` ; `.[..]` (point suivi d'un crochet, ex. `$.content.[*].['id']`) ;
// - index `[n]`, `[-n]`, listes `[0,2]`, tranches `[a:b]`, `[:b]`, `[a:]` ;
// - filtres `[?(<expr>)]` : `@.x` (existence), `==`, `!=`, `<`, `<=`, `>`, `>=`, `=~ /re/flags`, `in`, `nin`,
//   `contains`, `size`, `empty`, `&&`, `||`, `!`, parenthèses ; opérandes : chaînes '..' ou "..", nombres,
//   true/false/null, listes `[..]`, chemins `@..` et `$..` ;
// - fonctions finales `length()`, `size()`, `min()`, `max()`, `avg()`, `sum()`, `keys()`, `first()`, `last()`.
// Chemin « défini » (sans joker, balayage, filtre, tranche ni liste d'index) : résultat unique, et PathNotFoundException
// si une propriété, un index ou une valeur manque ; chemin indéfini : liste des valeurs trouvées (manques ignorés).

export class PathNotFoundException extends Error {
  override name = 'PathNotFoundException'
}

export class InvalidPathException extends Error {
  override name = 'InvalidPathException'
}

type Token =
  | { kind: 'prop'; names: string[] }
  | { kind: 'wildcard' }
  | { kind: 'index'; indexes: number[] }
  | { kind: 'slice'; from: number | null; to: number | null }
  | { kind: 'filter'; expr: FilterExpr }
  | { kind: 'scan'; next: Token }
  | { kind: 'function'; name: string }

type FilterExpr =
  | { kind: 'and' | 'or'; left: FilterExpr; right: FilterExpr }
  | { kind: 'not'; expr: FilterExpr }
  | { kind: 'exists'; operand: Operand }
  | { kind: 'cmp'; op: string; left: Operand; right: Operand }

type Operand = { kind: 'literal'; value: unknown } | { kind: 'path'; path: CompiledPath; relative: boolean } | { kind: 'regex'; re: RegExp }

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

class Parser {
  pos = 0
  constructor(readonly src: string) {}

  peek(n = 0): string {
    return this.src.charAt(this.pos + n)
  }

  eof(): boolean {
    return this.pos >= this.src.length
  }

  skipWs(): void {
    while (!this.eof() && /\s/.test(this.peek())) this.pos++
  }

  error(msg: string): never {
    throw new InvalidPathException(`${msg} at position ${this.pos} in path ${this.src}`)
  }

  expect(s: string): void {
    this.skipWs()
    if (!this.src.startsWith(s, this.pos)) this.error(`Expected '${s}'`)
    this.pos += s.length
  }

  /** Suite de segments après la racine, jusqu'à `stop` (fin de chaîne pour un chemin principal) */
  parseSegments(stop: (p: Parser) => boolean): Token[] {
    const tokens: Token[] = []
    while (!this.eof() && !stop(this)) {
      const c = this.peek()
      if (c === '.' && this.peek(1) === '.') {
        this.pos += 2
        let next: Token
        if (this.peek() === '[') next = this.parseBracket()
        else if (this.peek() === '*') {
          this.pos++
          next = { kind: 'wildcard' }
        } else next = { kind: 'prop', names: [this.parseName()] }
        tokens.push({ kind: 'scan', next })
      } else if (c === '.') {
        this.pos++
        if (this.peek() === '[') tokens.push(this.parseBracket())
        else if (this.peek() === '*') {
          this.pos++
          tokens.push({ kind: 'wildcard' })
        } else {
          const name = this.parseName()
          if (this.peek() === '(' && this.peek(1) === ')') {
            this.pos += 2
            tokens.push({ kind: 'function', name })
          } else tokens.push({ kind: 'prop', names: [name] })
        }
      } else if (c === '[') tokens.push(this.parseBracket())
      else this.error(`Unexpected character '${c}'`)
    }
    return tokens
  }

  parseName(): string {
    const start = this.pos
    while (!this.eof() && !/[.[\]()\s=!<>&|,]/.test(this.peek())) this.pos++
    if (this.pos === start) this.error('Path must not end with a \'.\' or \'..\'')
    return this.src.slice(start, this.pos)
  }

  parseQuoted(): string {
    const q = this.peek()
    this.pos++
    let out = ''
    while (!this.eof() && this.peek() !== q) {
      if (this.peek() === '\\') {
        this.pos++
        out += this.peek()
      } else out += this.peek()
      this.pos++
    }
    if (this.eof()) this.error('Unterminated string')
    this.pos++
    return out
  }

  parseBracket(): Token {
    this.expect('[')
    this.skipWs()
    let token: Token
    const c = this.peek()
    if (c === '?') {
      this.pos++
      this.expect('(')
      const expr = this.parseOr()
      this.expect(')')
      token = { kind: 'filter', expr }
    } else if (c === '*') {
      this.pos++
      token = { kind: 'wildcard' }
    } else if (c === "'" || c === '"') {
      const names = [this.parseQuoted()]
      this.skipWs()
      while (this.peek() === ',') {
        this.pos++
        this.skipWs()
        names.push(this.parseQuoted())
        this.skipWs()
      }
      token = { kind: 'prop', names }
    } else {
      const start = this.pos
      while (!this.eof() && this.peek() !== ']') this.pos++
      const body = this.src.slice(start, this.pos).replace(/\s/g, '')
      if (body.includes(':')) {
        const [a, b] = body.split(':')
        token = { kind: 'slice', from: a ? Number(a) : null, to: b ? Number(b) : null }
      } else {
        const indexes = body.split(',').map((s) => {
          if (!/^-?\d+$/.test(s)) this.error(`Invalid index '${s}'`)
          return Number(s)
        })
        token = { kind: 'index', indexes }
      }
    }
    this.expect(']')
    return token
  }

  // --- filtres ---

  parseOr(): FilterExpr {
    let left = this.parseAnd()
    for (;;) {
      this.skipWs()
      if (!this.src.startsWith('||', this.pos)) return left
      this.pos += 2
      left = { kind: 'or', left, right: this.parseAnd() }
    }
  }

  parseAnd(): FilterExpr {
    let left = this.parseUnary()
    for (;;) {
      this.skipWs()
      if (!this.src.startsWith('&&', this.pos)) return left
      this.pos += 2
      left = { kind: 'and', left, right: this.parseUnary() }
    }
  }

  parseUnary(): FilterExpr {
    this.skipWs()
    if (this.peek() === '!' && this.peek(1) !== '=') {
      this.pos++
      return { kind: 'not', expr: this.parseUnary() }
    }
    if (this.peek() === '(') {
      this.pos++
      const e = this.parseOr()
      this.expect(')')
      return e
    }
    const left = this.parseOperand()
    this.skipWs()
    const m = /^(==|!=|<=|>=|=~|<|>|in\b|nin\b|contains\b|size\b|empty\b|subsetof\b|anyof\b|noneof\b)/.exec(this.src.slice(this.pos))
    if (!m) return { kind: 'exists', operand: left }
    const op = m[1] as string
    this.pos += op.length
    const right = this.parseOperand()
    return { kind: 'cmp', op, left, right }
  }

  parseOperand(): Operand {
    this.skipWs()
    const c = this.peek()
    if (c === "'" || c === '"') return { kind: 'literal', value: this.parseQuoted() }
    if (c === '@' || c === '$') {
      this.pos++
      const tokens = this.parseSegments((p) => {
        const ch = p.peek()
        return /[\s)=!<>&|,\]]/.test(ch) && !(ch === ']' && false)
      })
      return { kind: 'path', path: new CompiledPath(`${c}`, tokens), relative: c === '@' }
    }
    if (c === '/') {
      this.pos++
      let src = ''
      while (!this.eof() && this.peek() !== '/') {
        if (this.peek() === '\\') {
          src += this.peek()
          this.pos++
        }
        src += this.peek()
        this.pos++
      }
      this.pos++
      let flags = ''
      while (/[a-z]/i.test(this.peek())) {
        flags += this.peek()
        this.pos++
      }
      return { kind: 'regex', re: new RegExp(src, flags) }
    }
    if (c === '[') {
      this.pos++
      const values: unknown[] = []
      this.skipWs()
      while (this.peek() !== ']') {
        const o = this.parseOperand()
        values.push(o.kind === 'literal' ? o.value : null)
        this.skipWs()
        if (this.peek() === ',') this.pos++
        this.skipWs()
      }
      this.pos++
      return { kind: 'literal', value: values }
    }
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(this.src.slice(this.pos))
    if (!m) this.error('Invalid filter operand')
    this.pos += (m[1] as string).length
    const s = m[1] as string
    return { kind: 'literal', value: s === 'true' ? true : s === 'false' ? false : s === 'null' ? null : Number(s) }
  }
}

// ---------------------------------------------------------------------------
// Évaluation
// ---------------------------------------------------------------------------

function typeOrder(v: unknown): string {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v
}

function compare(op: string, l: unknown, r: unknown, lMissing: boolean): boolean {
  switch (op) {
    case '==':
      if (lMissing) return false
      return typeOrder(l) === typeOrder(r) && JSON.stringify(l) === JSON.stringify(r)
    case '!=':
      if (lMissing) return true
      return !(typeOrder(l) === typeOrder(r) && JSON.stringify(l) === JSON.stringify(r))
    case '<':
    case '<=':
    case '>':
    case '>=': {
      if (lMissing || l === null || r === null || typeof l !== typeof r || (typeof l !== 'number' && typeof l !== 'string')) return false
      const a = l as number | string
      const b = r as number | string
      return op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b
    }
    case '=~':
      return !lMissing && typeof l === 'string' && r instanceof RegExp && r.test(l)
    case 'in':
      return !lMissing && Array.isArray(r) && r.some((x) => compare('==', l, x, false))
    case 'nin':
      return !lMissing && Array.isArray(r) && !r.some((x) => compare('==', l, x, false))
    case 'contains':
      if (lMissing) return false
      if (typeof l === 'string') return typeof r === 'string' && l.includes(r)
      return Array.isArray(l) && l.some((x) => compare('==', x, r, false))
    case 'size':
      return !lMissing && (Array.isArray(l) || typeof l === 'string') && l.length === r
    case 'empty':
      return !lMissing && (Array.isArray(l) || typeof l === 'string') && (l.length === 0) === r
    case 'subsetof':
      return !lMissing && Array.isArray(l) && Array.isArray(r) && l.every((x) => r.some((y) => compare('==', x, y, false)))
    case 'anyof':
      return !lMissing && Array.isArray(l) && Array.isArray(r) && l.some((x) => r.some((y) => compare('==', x, y, false)))
    case 'noneof':
      return !lMissing && Array.isArray(l) && Array.isArray(r) && !l.some((x) => r.some((y) => compare('==', x, y, false)))
    default:
      throw new InvalidPathException(`Unsupported operator ${op}`)
  }
}

function evalOperand(o: Operand, current: unknown, root: unknown): { value: unknown; missing: boolean } {
  if (o.kind === 'literal') return { value: o.value, missing: false }
  if (o.kind === 'regex') return { value: o.re, missing: false }
  const r = o.path.evaluate(o.relative ? current : root, root, { lenient: true })
  if (r.values.length === 0) return { value: null, missing: true }
  return { value: o.path.isDefinite() ? r.values[0] : r.values, missing: false }
}

function evalFilter(e: FilterExpr, current: unknown, root: unknown): boolean {
  switch (e.kind) {
    case 'and':
      return evalFilter(e.left, current, root) && evalFilter(e.right, current, root)
    case 'or':
      return evalFilter(e.left, current, root) || evalFilter(e.right, current, root)
    case 'not':
      return !evalFilter(e.expr, current, root)
    case 'exists': {
      const v = evalOperand(e.operand, current, root)
      if (e.operand.kind !== 'path') return v.value !== false && v.value !== null
      return !v.missing
    }
    case 'cmp': {
      const l = evalOperand(e.left, current, root)
      const r = evalOperand(e.right, current, root)
      return compare(e.op, l.value, r.value, l.missing)
    }
  }
}

function applyFunction(name: string, v: unknown): unknown {
  const nums = (): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [])
  switch (name) {
    case 'length':
    case 'size':
      if (Array.isArray(v) || typeof v === 'string') return v.length
      if (isObject(v)) return Object.keys(v).length
      throw new InvalidPathException(`Invalid property: length() function applied to ${typeOrder(v)}`)
    case 'min':
      return Math.min(...nums())
    case 'max':
      return Math.max(...nums())
    case 'sum':
      return nums().reduce((a, b) => a + b, 0)
    case 'avg': {
      const n = nums()
      return n.reduce((a, b) => a + b, 0) / n.length
    }
    case 'keys':
      return isObject(v) ? Object.keys(v) : null
    case 'first':
      return Array.isArray(v) ? v[0] : null
    case 'last':
      return Array.isArray(v) ? v[v.length - 1] : null
    default:
      throw new InvalidPathException(`Function with name: ${name} does not exist.`)
  }
}

function isDefiniteToken(t: Token): boolean {
  switch (t.kind) {
    case 'prop':
      return t.names.length === 1
    case 'index':
      return t.indexes.length === 1
    case 'function':
      return true
    default:
      return false
  }
}

export class CompiledPath {
  constructor(
    readonly root: string,
    readonly tokens: Token[],
    readonly text: string = '',
  ) {}

  isDefinite(): boolean {
    return this.tokens.every(isDefiniteToken)
  }

  /** Valeurs trouvées (dans l'ordre du document) */
  evaluate(start: unknown, root: unknown, { lenient = false }: { lenient?: boolean } = {}): { values: unknown[] } {
    // opérande de filtre : un manque n'est jamais une erreur
    const definite = this.isDefinite() && !lenient
    let nodes: unknown[] = [start]
    let upstreamDefinite = true
    for (let i = 0; i < this.tokens.length; i++) {
      const t = this.tokens[i] as Token
      if (t.kind === 'function') {
        // fonction appliquée au résultat du chemin qui précède (liste si indéfini)
        const input = upstreamDefinite ? nodes[0] : nodes
        if (upstreamDefinite && nodes.length === 0) {
          if (lenient) return { values: [] }
          throw new PathNotFoundException(`No results for path: ${this.text}`)
        }
        nodes = [applyFunction(t.name, input)]
        continue
      }
      const out: unknown[] = []
      for (const n of nodes) this.step(t, n, root, out, upstreamDefinite && definite)
      nodes = out
      upstreamDefinite = upstreamDefinite && isDefiniteToken(t)
    }
    return { values: nodes }
  }

  private step(t: Token, n: unknown, root: unknown, out: unknown[], strict: boolean): void {
    switch (t.kind) {
      case 'prop':
        if (!isObject(n)) {
          if (strict) throw new PathNotFoundException(`Expected to find an object with property ['${t.names[0]}'] in path ${this.text} but found '${n === null ? 'null' : Array.isArray(n) ? 'net.minidev.json.JSONArray' : typeof n}'. This is not a json object according to the JsonProvider: 'com.jayway.jsonpath.spi.json.JsonSmartJsonProvider'.`)
          return
        }
        if (t.names.length === 1) {
          const name = t.names[0] as string
          if (Object.hasOwn(n, name)) out.push(n[name])
          else if (strict) throw new PathNotFoundException(`No results for path: ${this.text}`)
        } else {
          const o: Record<string, unknown> = {}
          for (const name of t.names) if (Object.hasOwn(n, name)) o[name] = n[name]
          out.push(o)
        }
        return
      case 'wildcard':
        if (Array.isArray(n)) out.push(...n)
        else if (isObject(n)) out.push(...Object.values(n))
        return
      case 'index':
        if (!Array.isArray(n)) {
          if (strict) throw new PathNotFoundException(`Filter: [${t.indexes.join(',')}] can only be applied to arrays. Current context is: ${JSON.stringify(n)}`)
          return
        }
        for (const i of t.indexes) {
          const idx = i < 0 ? n.length + i : i
          if (idx >= 0 && idx < n.length) out.push(n[idx])
          else if (strict) throw new PathNotFoundException(`Index out of bounds when evaluating path ${this.text}`)
        }
        return
      case 'slice': {
        if (!Array.isArray(n)) return
        const len = n.length
        let from = t.from ?? 0
        let to = t.to ?? len
        if (from < 0) from = Math.max(0, len + from)
        if (to < 0) to = Math.max(0, len + to)
        out.push(...n.slice(from, Math.min(to, len)))
        return
      }
      case 'filter':
        if (Array.isArray(n)) {
          for (const x of n) if (evalFilter(t.expr, x, root)) out.push(x)
        } else if (isObject(n) && evalFilter(t.expr, n, root)) out.push(n)
        return
      case 'scan':
        this.scan(t.next, n, root, out)
        return
      case 'function':
        return
    }
  }

  /** `..` : le nœud lui-même puis ses descendants (ScanPathToken) */
  private scan(next: Token, n: unknown, root: unknown, out: unknown[]): void {
    if (next.kind === 'prop' && next.names.length === 1) {
      if (isObject(n) && Object.hasOwn(n, next.names[0] as string)) out.push(n[next.names[0] as string])
    } else if (next.kind === 'wildcard') {
      if (Array.isArray(n)) out.push(...n)
      else if (isObject(n)) out.push(...Object.values(n))
    } else this.step(next, n, root, out, false)
    const children = Array.isArray(n) ? n : isObject(n) ? Object.values(n) : []
    for (const c of children) if (c !== null && typeof c === 'object') this.scan(next, c, root, out)
  }
}

/** `com.jayway.jsonpath.JsonPath` */
export class JsonPath {
  private constructor(private readonly path: CompiledPath) {}

  static compile(expression: string): JsonPath {
    let src = expression.trim()
    if (!src.startsWith('$') && !src.startsWith('@')) src = `$.${src}`
    const p = new Parser(src)
    const root = p.peek()
    p.pos++
    const tokens = p.parseSegments(() => false)
    return new JsonPath(new CompiledPath(root, tokens, src))
  }

  isDefinite(): boolean {
    return this.path.isDefinite()
  }

  /** `read(json)` : valeur (chemin défini, sinon PathNotFoundException) ou liste des valeurs (chemin indéfini) */
  read(json: unknown): unknown {
    const r = this.path.evaluate(json, json)
    if (this.path.isDefinite()) {
      if (r.values.length === 0) throw new PathNotFoundException(`No results for path: ${this.path.text}`)
      return r.values[0]
    }
    return r.values
  }

  static read(json: unknown, expression: string): unknown {
    return JsonPath.compile(expression).read(json)
  }
}
