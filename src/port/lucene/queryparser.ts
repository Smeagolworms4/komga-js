// Support de portage : org.apache.lucene.queryparser.classic (Lucene 9.9.1) : QueryParser (analyseur JavaCC généré,
// porté ligne à ligne, lookahead jj_2_x / jj_3R compris), QueryParserBase, MultiFieldQueryParser, ParseException,
// TokenMgrError, ainsi que org.apache.lucene.util.QueryBuilder.
// PORT: QueryParserTokenManager (automate généré par JavaCC) est remplacé par un analyseur lexical écrit à partir de
// la grammaire QueryParser.jj (mêmes jetons, états lexicaux DEFAULT/Boost/Range, correspondance la plus longue puis
// ordre de déclaration). Les messages d'erreur de ParseException sont simplifiés (Komga ne les expose pas).
// Ce fichier n'a pas de jumeau Kotlin.
import { Exception, IllegalArgumentException, RuntimeException, UnsupportedOperationException } from '../kotlin.js'
import type { Analyzer } from './analysis.js'
import { Term } from './document.js'
import { javaParseFloat } from './JavaCharacter.js'
import {
  BooleanClause,
  BooleanQuery,
  BoostQuery,
  FuzzyQuery,
  MatchAllDocsQuery,
  PhraseQuery,
  PrefixQuery,
  type Query,
  RegexpQuery,
  TermQuery,
  TermRangeQuery,
  TooManyClauses,
  WildcardQuery,
} from './search.js'

// ---------------------------------------------------------------------------
// QueryParserConstants
// ---------------------------------------------------------------------------

export const EOF = 0
export const AND = 8
export const OR = 9
export const NOT = 10
export const PLUS = 11
export const MINUS = 12
export const BAREOPER = 13
export const LPAREN = 14
export const RPAREN = 15
export const COLON = 16
export const STAR = 17
export const CARAT = 18
export const QUOTED = 19
export const TERM = 20
export const FUZZY_SLOP = 21
export const PREFIXTERM = 22
export const WILDTERM = 23
export const REGEXPTERM = 24
export const RANGEIN_START = 25
export const RANGEEX_START = 26
export const NUMBER = 27
export const RANGE_TO = 28
export const RANGEIN_END = 29
export const RANGEEX_END = 30
export const RANGE_QUOTED = 31
export const RANGE_GOOP = 32

const LEX_BOOST = 0
const LEX_RANGE = 1
const LEX_DEFAULT = 2

export class Token {
  kind = 0
  image = ''
  next: Token | null = null
}

export class ParseException extends Exception {}

export class TokenMgrError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenMgrError'
  }
}

// ---------------------------------------------------------------------------
// QueryParserTokenManager
// ---------------------------------------------------------------------------

const TERM_START_EXCLUDED = new Set([' ', '\t', '\n', '\r', '\u3000', '+', '-', '!', '(', ')', ':', '^', '[', ']', '"', '{', '}', '~', '*', '?', '\\', '/'])
const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\u3000'])

class QueryParserTokenManager {
  private pos = 0
  curLexState = LEX_DEFAULT

  constructor(private readonly input: string) {}

  /** longueur de <_TERM_START_CHAR> en i (0 si absent) */
  private termStartChar(i: number): number {
    const s = this.input
    if (i >= s.length) return 0
    if (s[i] === '\\') return i + 1 < s.length ? 2 : 0
    return TERM_START_EXCLUDED.has(s[i] as string) ? 0 : 1
  }

  /** longueur de <_TERM_CHAR> en i */
  private termChar(i: number): number {
    const n = this.termStartChar(i)
    if (n > 0) return n
    const c = this.input[i]
    return c === '-' || c === '+' ? 1 : 0
  }

  private termRun(i: number): number {
    let j = i
    for (let n = this.termChar(j); n > 0; n = this.termChar(j)) j += n
    return j
  }

  private digits(i: number): number {
    let j = i
    while (j < this.input.length && (this.input[j] as string) >= '0' && (this.input[j] as string) <= '9') j++
    return j
  }

  /** candidats [type (-1 = SKIP), longueur] dans l'ordre de déclaration de la grammaire */
  private candidates(): [number, number][] {
    const s = this.input
    const i = this.pos
    const c = s[i] as string
    const out: [number, number][] = []
    if (this.curLexState === LEX_BOOST) {
      const d = this.digits(i)
      if (d > i) {
        let end = d
        if (s[d] === '.') {
          const d2 = this.digits(d + 1)
          if (d2 > d + 1) end = d2
        }
        out.push([NUMBER, end - i])
      }
      return out
    }
    // <DEFAULT, Range> SKIP
    if (WHITESPACE.has(c)) out.push([-1, 1])
    if (this.curLexState === LEX_DEFAULT) {
      if (s.startsWith('AND', i)) out.push([AND, 3])
      else if (s.startsWith('&&', i)) out.push([AND, 2])
      if (s.startsWith('OR', i)) out.push([OR, 2])
      else if (s.startsWith('||', i)) out.push([OR, 2])
      if (s.startsWith('NOT', i)) out.push([NOT, 3])
      else if (c === '!') out.push([NOT, 1])
      if (c === '+') out.push([PLUS, 1])
      if (c === '-') out.push([MINUS, 1])
      if ((c === '+' || c === '-' || c === '!') && WHITESPACE.has(s[i + 1] as string)) out.push([BAREOPER, 2])
      if (c === '(') out.push([LPAREN, 1])
      if (c === ')') out.push([RPAREN, 1])
      if (c === ':') out.push([COLON, 1])
      if (c === '*') out.push([STAR, 1])
      if (c === '^') out.push([CARAT, 1])
      if (c === '"') {
        let j = i + 1
        while (j < s.length && s[j] !== '"') {
          if (s[j] === '\\') {
            if (j + 1 >= s.length) break
            j += 2
          } else j++
        }
        if (j < s.length && s[j] === '"') out.push([QUOTED, j + 1 - i])
      }
      const tsc = this.termStartChar(i)
      if (tsc > 0) out.push([TERM, this.termRun(i + tsc) - i])
      if (c === '~') out.push([FUZZY_SLOP, this.termRun(i + 1) - i])
      if (c === '*') out.push([PREFIXTERM, 1])
      if (tsc > 0) {
        const j = this.termRun(i + tsc)
        if (s[j] === '*') out.push([PREFIXTERM, j + 1 - i])
      }
      if (tsc > 0 || c === '*' || c === '?') {
        let j = i + (tsc > 0 ? tsc : 1)
        while (true) {
          const n = this.termChar(j)
          if (n > 0) j += n
          else if (s[j] === '*' || s[j] === '?') j++
          else break
        }
        out.push([WILDTERM, j - i])
      }
      if (c === '/') {
        let last = -1
        for (let j = i + 1; j < s.length; j++) {
          if (s[j] === '/') {
            last = j
            if (!(s[j - 1] === '\\' && j - 1 > i)) break
          }
        }
        if (last >= 0) out.push([REGEXPTERM, last + 1 - i])
      }
      if (c === '[') out.push([RANGEIN_START, 1])
      if (c === '{') out.push([RANGEEX_START, 1])
    } else {
      // Range
      if (s.startsWith('TO', i)) out.push([RANGE_TO, 2])
      if (c === ']') out.push([RANGEIN_END, 1])
      if (c === '}') out.push([RANGEEX_END, 1])
      if (c === '"') {
        let last = -1
        for (let j = i + 1; j < s.length; j++) {
          if (s[j] === '"') {
            if (j > i + 1) last = j
            if (!(s[j - 1] === '\\' && j - 1 > i)) break
          }
        }
        if (last >= 0) out.push([RANGE_QUOTED, last + 1 - i])
      }
      let j = i
      while (j < s.length && s[j] !== ' ' && s[j] !== ']' && s[j] !== '}') j++
      if (j > i) out.push([RANGE_GOOP, j - i])
    }
    return out
  }

  getNextToken(): Token {
    while (true) {
      if (this.pos >= this.input.length) {
        const t = new Token()
        t.kind = EOF
        return t
      }
      let best: [number, number] | null = null
      for (const cand of this.candidates()) if (best === null || cand[1] > best[1]) best = cand
      if (best === null)
        throw new TokenMgrError(`Lexical error at line 1, column ${this.pos + 1}.  Encountered: "${this.input[this.pos]}"`)
      const [kind, len] = best
      const image = this.input.substr(this.pos, len)
      this.pos += len
      if (kind === -1) continue
      switch (kind) {
        case CARAT:
          this.curLexState = LEX_BOOST
          break
        case NUMBER:
        case RANGEIN_END:
        case RANGEEX_END:
          this.curLexState = LEX_DEFAULT
          break
        case RANGEIN_START:
        case RANGEEX_START:
          this.curLexState = LEX_RANGE
          break
      }
      const t = new Token()
      t.kind = kind
      t.image = image
      return t
    }
  }
}

// ---------------------------------------------------------------------------
// QueryBuilder
// ---------------------------------------------------------------------------

type Tok = { term: string; posInc: number; posLen: number }

export class QueryBuilder {
  protected enablePositionIncrements = true
  protected enableGraphQueries = true

  constructor(protected analyzer: Analyzer | null) {}

  getAnalyzer(): Analyzer {
    return this.analyzer as Analyzer
  }

  setAnalyzer(analyzer: Analyzer): void {
    this.analyzer = analyzer
  }

  protected createFieldQuery(analyzer: Analyzer, operator: BooleanClause.Occur, field: string, queryText: string, quoted: boolean, phraseSlop: number): Query | null {
    // Use the analyzer to get all the tokens, and then build an appropriate
    // query based on the analysis chain.
    // PORT: CachingTokenFilter -> liste des jetons
    const source = analyzer.tokenStream(field, queryText)
    const tokens: Tok[] = []
    try {
      source.reset()
      while (source.incrementToken())
        tokens.push({ term: source.attributes.termAtt.toString(), posInc: source.attributes.positionIncrement, posLen: source.attributes.positionLength })
      source.end()
    } finally {
      source.close()
    }

    // phase 1: read through the stream and assess the situation:
    // counting the number of tokens/positions and marking if we have any synonyms.
    const numTokens = tokens.length
    let positionCount = 0
    let hasSynonyms = false
    let isGraph = false
    for (const t of tokens) {
      if (t.posInc !== 0) positionCount += t.posInc
      else hasSynonyms = true
      if (this.enableGraphQueries && t.posLen > 1) isGraph = true
    }

    // phase 2: based on token count, presence of synonyms, and options
    // formulate a single term, boolean, or phrase.
    if (numTokens === 0) {
      return null
    } else if (numTokens === 1) {
      // single term
      return this.newTermQuery(new Term(field, (tokens[0] as Tok).term))
    } else if (isGraph) {
      // PORT: graphes de jetons non produits par les analyseurs de Komga
      throw new UnsupportedOperationException('graph token streams are not supported')
    } else if (quoted && positionCount > 1) {
      // phrase
      if (hasSynonyms) {
        throw new UnsupportedOperationException('MultiPhraseQuery is not supported')
      } else {
        // simple phrase
        return this.analyzePhrase(field, tokens, phraseSlop)
      }
    } else {
      // boolean
      if (positionCount === 1) {
        throw new UnsupportedOperationException('SynonymQuery is not supported')
      } else {
        // complex case: multiple positions
        return this.analyzeMultiBoolean(field, tokens, operator)
      }
    }
  }

  protected analyzeMultiBoolean(field: string, tokens: Tok[], operator: BooleanClause.Occur): Query {
    const q = this.newBooleanQuery()
    let currentQuery: string[] = []
    const add = () => {
      if (currentQuery.length === 0) return
      if (currentQuery.length === 1) q.add(this.newTermQuery(new Term(field, currentQuery[0] as string)), operator)
      else throw new UnsupportedOperationException('SynonymQuery is not supported')
    }
    for (const t of tokens) {
      if (t.posInc !== 0) {
        add()
        currentQuery = []
      }
      currentQuery.push(t.term)
    }
    add()
    return q.build()
  }

  protected analyzePhrase(field: string, tokens: Tok[], slop: number): Query {
    const builder = new PhraseQuery.Builder()
    builder.setSlop(slop)
    let position = -1
    for (const t of tokens) {
      if (this.enablePositionIncrements) position += t.posInc
      else position += 1
      builder.add(new Term(field, t.term), position)
    }
    return builder.build()
  }

  protected newBooleanQuery(): InstanceType<typeof BooleanQuery.Builder> {
    return new BooleanQuery.Builder()
  }

  protected newTermQuery(term: Term): Query {
    return new TermQuery(term)
  }
}

// ---------------------------------------------------------------------------
// QueryParserBase
// ---------------------------------------------------------------------------

export enum Operator {
  OR = 'OR',
  AND = 'AND',
}

const CONJ_NONE = 0
const CONJ_AND = 1
const CONJ_OR = 2

const MOD_NONE = 0
const MOD_NOT = 10
const MOD_REQ = 11

/** `(int) f` de Java */
function floatToInt(v: number): number {
  if (Number.isNaN(v)) return 0
  if (v >= 2147483647) return 2147483647
  if (v <= -2147483648) return -2147483648
  return Math.trunc(v)
}

export abstract class QueryParserBase extends QueryBuilder {
  static readonly AND_OPERATOR = Operator.AND
  static readonly OR_OPERATOR = Operator.OR

  operator: Operator = Operator.OR
  allowLeadingWildcard = false
  protected field: string | null = null
  phraseSlop = 0
  fuzzyMinSim: number = FuzzyQuery.defaultMaxEdits
  fuzzyPrefixLength: number = FuzzyQuery.defaultPrefixLength
  autoGeneratePhraseQueries = false

  protected constructor() {
    super(null)
  }

  init(f: string | null, a: Analyzer): void {
    this.setAnalyzer(a)
    this.field = f
    this.setAutoGeneratePhraseQueries(false)
  }

  abstract ReInit(input: string): void

  abstract TopLevelQuery(field: string | null): Query | null

  /** Parses a query string, returning a Query. */
  parse(query: string): Query {
    this.ReInit(query)
    try {
      // TopLevelQuery is a Query followed by the end-of-input (EOF)
      const res = this.TopLevelQuery(this.field)
      return res !== null ? res : this.newBooleanQuery().build()
    } catch (tme) {
      if (tme instanceof ParseException || tme instanceof TokenMgrError) {
        // rethrow to include the original query:
        throw new ParseException(`Cannot parse '${query}': ${tme.message}`, tme)
      }
      if (tme instanceof TooManyClauses) {
        throw new ParseException(`Cannot parse '${query}': too many boolean clauses`, tme)
      }
      throw tme
    }
  }

  getField(): string | null {
    return this.field
  }

  getAutoGeneratePhraseQueries(): boolean {
    return this.autoGeneratePhraseQueries
  }

  setAutoGeneratePhraseQueries(value: boolean): void {
    this.autoGeneratePhraseQueries = value
  }

  setDefaultOperator(op: Operator): void {
    this.operator = op
  }

  getDefaultOperator(): Operator {
    return this.operator
  }

  protected addClause(clauses: BooleanClause[], conj: number, mods: number, q: Query | null): void {
    let required: boolean
    let prohibited: boolean

    // If this term is introduced by AND, make the preceding term required,
    // unless it's already prohibited
    if (clauses.length > 0 && conj === CONJ_AND) {
      const c = clauses[clauses.length - 1] as BooleanClause
      if (!c.isProhibited()) clauses[clauses.length - 1] = new BooleanClause(c.query, BooleanClause.Occur.MUST)
    }

    if (clauses.length > 0 && this.operator === Operator.AND && conj === CONJ_OR) {
      // If this term is introduced by OR, make the preceding term optional,
      // unless it's prohibited (that means we leave -a OR b but +a OR b-->a OR b)
      // notice if the input is a OR b, first term is parsed as required; without
      // this modification a OR b would parsed as +a OR b
      const c = clauses[clauses.length - 1] as BooleanClause
      if (!c.isProhibited()) clauses[clauses.length - 1] = new BooleanClause(c.query, BooleanClause.Occur.SHOULD)
    }

    // We might have been passed a null query; the term might have been
    // filtered away by the analyzer.
    if (q === null) return

    if (this.operator === Operator.OR) {
      // We set REQUIRED if we're introduced by AND or +; PROHIBITED if
      // introduced by NOT or -; make sure not to set both.
      prohibited = mods === MOD_NOT
      required = mods === MOD_REQ
      if (conj === CONJ_AND && !prohibited) {
        required = true
      }
    } else {
      // We set PROHIBITED if we're introduced by NOT or -; We set REQUIRED
      // if not PROHIBITED and not introduced by OR
      prohibited = mods === MOD_NOT
      required = !prohibited && conj !== CONJ_OR
    }
    if (required && !prohibited) clauses.push(this.newBooleanClause(q, BooleanClause.Occur.MUST))
    else if (!required && !prohibited) clauses.push(this.newBooleanClause(q, BooleanClause.Occur.SHOULD))
    else if (!required && prohibited) clauses.push(this.newBooleanClause(q, BooleanClause.Occur.MUST_NOT))
    else throw new RuntimeException('Clause cannot be both required and prohibited')
  }

  protected addMultiTermClauses(clauses: BooleanClause[], q: Query | null): void {
    // We might have been passed a null query; the term might have been
    // filtered away by the analyzer.
    if (q === null) {
      return
    }
    let allNestedTermQueries = false
    if (q instanceof BooleanQuery) {
      allNestedTermQueries = true
      for (const clause of q.clauses()) {
        if (!(clause.query instanceof TermQuery)) {
          allNestedTermQueries = false
          break
        }
      }
    }
    if (allNestedTermQueries) {
      clauses.push(...(q as BooleanQuery).clauses())
    } else {
      const occur = this.operator === Operator.OR ? BooleanClause.Occur.SHOULD : BooleanClause.Occur.MUST
      if (q instanceof BooleanQuery) {
        for (const clause of q.clauses()) {
          clauses.push(this.newBooleanClause(clause.query, occur))
        }
      } else {
        clauses.push(this.newBooleanClause(q, occur))
      }
    }
  }

  // PORT: surcharges getFieldQuery(String, String, boolean) / getFieldQuery(String, String, int)
  // -> getFieldQuery / getFieldQuerySlop
  protected getFieldQuery(field: string | null, queryText: string, quoted: boolean): Query | null {
    return this.newFieldQuery(this.getAnalyzer(), field as string, queryText, quoted)
  }

  protected newFieldQuery(analyzer: Analyzer, field: string, queryText: string, quoted: boolean): Query | null {
    const occur = this.operator === Operator.AND ? BooleanClause.Occur.MUST : BooleanClause.Occur.SHOULD
    return this.createFieldQuery(analyzer, occur, field, queryText, quoted || this.autoGeneratePhraseQueries, this.phraseSlop)
  }

  protected getFieldQuerySlop(field: string | null, queryText: string, slop: number): Query | null {
    let query = this.getFieldQuery(field, queryText, true)

    if (query instanceof PhraseQuery) {
      query = this.addSlopToPhrase(query, slop)
    }

    return query
  }

  private addSlopToPhrase(query: PhraseQuery, slop: number): PhraseQuery {
    const builder = new PhraseQuery.Builder()
    builder.setSlop(slop)
    const terms = query.getTerms()
    const positions = query.getPositions()
    for (let i = 0; i < terms.length; ++i) {
      builder.add(terms[i] as Term, positions[i] as number)
    }

    return builder.build()
  }

  // PORT: les dates (DateFormat SHORT indulgent) ne sont converties que si une résolution de date est
  // configurée (dateResolution, jamais le cas dans Komga : DateTools lève alors une exception ignorée)
  protected getRangeQuery(field: string | null, part1: string | null, part2: string | null, startInclusive: boolean, endInclusive: boolean): Query | null {
    return this.newRangeQuery(field as string, part1, part2, startInclusive, endInclusive)
  }

  protected newBooleanClause(q: Query, occur: BooleanClause.Occur): BooleanClause {
    return new BooleanClause(q, occur)
  }

  protected newPrefixQuery(prefix: Term): Query {
    return new PrefixQuery(prefix)
  }

  protected newRegexpQuery(regexp: Term): Query {
    return new RegexpQuery(regexp)
  }

  protected newFuzzyQuery(term: Term, minimumSimilarity: number, prefixLength: number): Query {
    // FuzzyQuery doesn't yet allow constant score rewrite
    const text = term.text()
    const numEdits = FuzzyQuery.floatToEdits(minimumSimilarity, Array.from(text).length)
    return new FuzzyQuery(term, numEdits, prefixLength)
  }

  protected newRangeQuery(field: string, part1: string | null, part2: string | null, startInclusive: boolean, endInclusive: boolean): Query {
    const start = part1 === null ? null : this.getAnalyzer().normalizeText(field, part1)
    const end = part2 === null ? null : this.getAnalyzer().normalizeText(field, part2)
    return new TermRangeQuery(field, start, end, startInclusive, endInclusive)
  }

  protected newMatchAllDocsQuery(): Query {
    return new MatchAllDocsQuery()
  }

  protected newWildcardQuery(t: Term): Query {
    return new WildcardQuery(t)
  }

  protected getBooleanQuery(clauses: BooleanClause[]): Query | null {
    if (clauses.length === 0) {
      return null // all clause words were filtered away by the analyzer.
    }
    const query = this.newBooleanQuery()
    for (const clause of clauses) {
      query.add(clause)
    }
    return query.build()
  }

  protected getWildcardQuery(field: string | null, termStr: string): Query | null {
    if ('*' === field) {
      if ('*' === termStr) return this.newMatchAllDocsQuery()
    }
    if (!this.allowLeadingWildcard && (termStr.startsWith('*') || termStr.startsWith('?')))
      throw new ParseException("'*' or '?' not allowed as first character in WildcardQuery")

    const t = new Term(field as string, this.analyzeWildcard(field as string, termStr))
    return this.newWildcardQuery(t)
  }

  private analyzeWildcard(field: string, termStr: string): string {
    // best effort to not pass the wildcard characters and escaped characters through #normalize
    const WILDCARD_PATTERN = /(\\.)|([?*]+)/gs
    let sb = ''
    let last = 0
    for (const m of termStr.matchAll(WILDCARD_PATTERN)) {
      if ((m.index as number) > 0) {
        const chunk = termStr.substring(last, m.index)
        sb += this.getAnalyzer().normalizeText(field, chunk)
      }
      // append the matched group - without normalizing
      sb += m[0]
      last = (m.index as number) + m[0].length
    }
    if (last < termStr.length) {
      const chunk = termStr.substring(last)
      sb += this.getAnalyzer().normalizeText(field, chunk)
    }
    return sb
  }

  protected getRegexpQuery(field: string | null, termStr: string): Query | null {
    // We need to pass the whole string to #normalize, which will not work with
    // custom attribute factories for the binary term impl, and may not work
    // with some analyzers
    const term = this.getAnalyzer().normalizeText(field as string, termStr)
    const t = new Term(field as string, term)
    return this.newRegexpQuery(t)
  }

  protected getPrefixQuery(field: string | null, termStr: string): Query | null {
    if (!this.allowLeadingWildcard && termStr.startsWith('*')) throw new ParseException("'*' not allowed as first character in PrefixQuery")
    const term = this.getAnalyzer().normalizeText(field as string, termStr)
    const t = new Term(field as string, term)
    return this.newPrefixQuery(t)
  }

  protected getFuzzyQuery(field: string | null, termStr: string, minSimilarity: number): Query | null {
    const term = this.getAnalyzer().normalizeText(field as string, termStr)
    const t = new Term(field as string, term)
    return this.newFuzzyQuery(t, minSimilarity, this.fuzzyPrefixLength)
  }

  // extracted from the .jj grammar
  handleBareTokenQuery(qfield: string | null, term: Token, fuzzySlop: Token | null, prefix: boolean, wildcard: boolean, fuzzy: boolean, regexp: boolean): Query | null {
    let q: Query | null

    const termImage = this.discardEscapeChar(term.image)
    if (wildcard) {
      q = this.getWildcardQuery(qfield, term.image)
    } else if (prefix) {
      q = this.getPrefixQuery(qfield, this.discardEscapeChar(term.image.substring(0, term.image.length - 1)))
    } else if (regexp) {
      q = this.getRegexpQuery(qfield, term.image.substring(1, term.image.length - 1))
    } else if (fuzzy) {
      q = this.handleBareFuzzy(qfield, fuzzySlop as Token, termImage)
    } else {
      q = this.getFieldQuery(qfield, termImage, false)
    }
    return q
  }

  protected getFuzzyDistance(fuzzyToken: Token, _termStr: string): number {
    try {
      return javaParseFloat(fuzzyToken.image.substring(1))
    } catch {
      return this.fuzzyMinSim
    }
  }

  handleBareFuzzy(qfield: string | null, fuzzySlop: Token, termImage: string): Query | null {
    const fms = this.getFuzzyDistance(fuzzySlop, termImage)
    if (fms < 0) {
      throw new ParseException('Minimum similarity for a FuzzyQuery has to be between 0.0f and 1.0f !')
    } else if (fms >= 1 && fms !== floatToInt(fms)) {
      throw new ParseException('Fractional edit distances are not allowed!')
    }
    return this.getFuzzyQuery(qfield, termImage, fms)
  }

  // extracted from the .jj grammar
  handleQuotedTerm(qfield: string | null, term: Token, fuzzySlop: Token | null): Query | null {
    let s = this.phraseSlop // default
    if (fuzzySlop !== null) {
      try {
        s = floatToInt(javaParseFloat(fuzzySlop.image.substring(1)))
      } catch {
        // ignored
      }
    }
    return this.getFieldQuerySlop(qfield, this.discardEscapeChar(term.image.substring(1, term.image.length - 1)), s)
  }

  // extracted from the .jj grammar
  handleBoost(q: Query | null, boost: Token | null): Query | null {
    if (boost !== null) {
      let f = 1.0
      try {
        f = javaParseFloat(boost.image)
      } catch {
        /* Should this be handled somehow? (defaults to "no boost", if
         * boost number is invalid)
         */
      }

      // avoid boosting null queries, such as those caused by stop words
      if (q !== null) {
        q = new BoostQuery(q, f)
      }
    }
    return q
  }

  /** Returns a String where the escape char has been removed, or kept only once if there was a double escape. */
  discardEscapeChar(input: string): string {
    const output: number[] = []
    // We remember whether the last processed character was
    // an escape character
    let lastCharWasEscapeChar = false
    // The multiplier the current unicode digit must be multiplied with.
    // E. g. the first digit must be multiplied with 16^3, the second with 16^2...
    let codePointMultiplier = 0
    // Used to calculate the codepoint of the escaped unicode character
    let codePoint = 0

    for (let i = 0; i < input.length; i++) {
      const curChar = input.charAt(i)
      if (codePointMultiplier > 0) {
        codePoint += QueryParserBase.hexToInt(curChar) * codePointMultiplier
        codePointMultiplier >>>= 4
        if (codePointMultiplier === 0) {
          output.push(codePoint)
          codePoint = 0
        }
      } else if (lastCharWasEscapeChar) {
        if (curChar === 'u') {
          // found an escaped unicode character
          codePointMultiplier = 16 * 16 * 16
        } else {
          // this character was escaped
          output.push(curChar.charCodeAt(0))
        }
        lastCharWasEscapeChar = false
      } else {
        if (curChar === '\\') {
          lastCharWasEscapeChar = true
        } else {
          output.push(curChar.charCodeAt(0))
        }
      }
    }

    if (codePointMultiplier > 0) {
      throw new ParseException('Truncated unicode escape sequence.')
    }

    if (lastCharWasEscapeChar) {
      throw new ParseException('Term can not end with escape character.')
    }

    let s = ''
    for (let i = 0; i < output.length; i += 4096) s += String.fromCharCode(...output.slice(i, i + 4096))
    return s
  }

  static hexToInt(c: string): number {
    if ('0' <= c && c <= '9') {
      return c.charCodeAt(0) - 0x30
    } else if ('a' <= c && c <= 'f') {
      return c.charCodeAt(0) - 0x61 + 10
    } else if ('A' <= c && c <= 'F') {
      return c.charCodeAt(0) - 0x41 + 10
    } else {
      throw new ParseException(`Non-hex character in Unicode escape sequence: ${c}`)
    }
  }

  /** Returns a String where those characters that QueryParser expects to be escaped are escaped by a preceding \. */
  static escape(s: string): string {
    let sb = ''
    for (const c of s) {
      // These characters are part of the query syntax and must be escaped
      if ('\\+-!():^[]"{}~*?|&/'.includes(c)) sb += '\\'
      sb += c
    }
    return sb
  }
}

// ---------------------------------------------------------------------------
// QueryParser (généré par JavaCC)
// ---------------------------------------------------------------------------

class LookaheadSuccess extends Error {}
const jj_ls = new LookaheadSuccess()

const disallowedPostMultiTerm = new Set([COLON, STAR, FUZZY_SLOP, CARAT, AND, OR])
function allowedPostMultiTerm(tokenKind: number): boolean {
  return disallowedPostMultiTerm.has(tokenKind) === false
}

export class QueryParser extends QueryParserBase {
  static readonly Operator = Operator
  /** default split on whitespace behavior */
  static readonly DEFAULT_SPLIT_ON_WHITESPACE = false

  private splitOnWhitespace = QueryParser.DEFAULT_SPLIT_ON_WHITESPACE

  token_source!: QueryParserTokenManager
  token!: Token
  private jj_ntk = -1
  private jj_scanpos: Token | null = null
  private jj_lastpos: Token | null = null
  private jj_la = 0
  private jj_lookingAhead = false
  private jj_semLA = false

  /** Create a query parser. */
  constructor(f: string | null, a: Analyzer) {
    super()
    this.ReInit('')
    this.init(f, a)
  }

  setAutoGeneratePhraseQueries(value: boolean): void {
    if (this.splitOnWhitespace === false && value === true) {
      throw new IllegalArgumentException('setAutoGeneratePhraseQueries(true) is disallowed when getSplitOnWhitespace() == false')
    }
    this.autoGeneratePhraseQueries = value
  }

  getSplitOnWhitespace(): boolean {
    return this.splitOnWhitespace
  }

  setSplitOnWhitespace(splitOnWhitespace: boolean): void {
    if (splitOnWhitespace === false && this.getAutoGeneratePhraseQueries() === true) {
      throw new IllegalArgumentException('setSplitOnWhitespace(false) is disallowed when getAutoGeneratePhraseQueries() == true')
    }
    this.splitOnWhitespace = splitOnWhitespace
  }

  private ntk(): number {
    return this.jj_ntk === -1 ? this.jj_ntk_f() : this.jj_ntk
  }

  // *   Query  ::= ( Clause )*
  // *   Clause ::= ["+", "-"] [<TERM> ":"] ( <TERM> | "(" Query ")" )
  Conjunction(): number {
    let ret = CONJ_NONE
    switch (this.ntk()) {
      case AND:
      case OR: {
        switch (this.ntk()) {
          case AND:
            this.jj_consume_token(AND)
            ret = CONJ_AND
            break
          case OR:
            this.jj_consume_token(OR)
            ret = CONJ_OR
            break
          default:
            this.jj_consume_token(-1)
            throw new ParseException()
        }
        break
      }
      default:
    }
    return ret
  }

  Modifiers(): number {
    let ret = MOD_NONE
    switch (this.ntk()) {
      case NOT:
      case PLUS:
      case MINUS: {
        switch (this.ntk()) {
          case PLUS:
            this.jj_consume_token(PLUS)
            ret = MOD_REQ
            break
          case MINUS:
            this.jj_consume_token(MINUS)
            ret = MOD_NOT
            break
          case NOT:
            this.jj_consume_token(NOT)
            ret = MOD_NOT
            break
          default:
            this.jj_consume_token(-1)
            throw new ParseException()
        }
        break
      }
      default:
    }
    return ret
  }

  // This makes sure that there is no garbage after the query string
  TopLevelQuery(field: string | null): Query | null {
    const q = this.Query(field)
    this.jj_consume_token(0)
    return q
  }

  Query(field: string | null): Query | null {
    const clauses: BooleanClause[] = []
    let q: Query | null
    let firstQuery: Query | null = null
    let conj: number
    let mods: number
    if (this.jj_2_1(2)) {
      firstQuery = this.MultiTerm(field, clauses)
    } else {
      switch (this.ntk()) {
        case NOT:
        case PLUS:
        case MINUS:
        case BAREOPER:
        case LPAREN:
        case STAR:
        case QUOTED:
        case TERM:
        case PREFIXTERM:
        case WILDTERM:
        case REGEXPTERM:
        case RANGEIN_START:
        case RANGEEX_START:
        case NUMBER: {
          mods = this.Modifiers()
          q = this.Clause(field)
          this.addClause(clauses, CONJ_NONE, mods, q)
          if (mods === MOD_NONE) {
            firstQuery = q
          }
          break
        }
        default:
          this.jj_consume_token(-1)
          throw new ParseException()
      }
    }
    label_1: while (true) {
      switch (this.ntk()) {
        case AND:
        case OR:
        case NOT:
        case PLUS:
        case MINUS:
        case BAREOPER:
        case LPAREN:
        case STAR:
        case QUOTED:
        case TERM:
        case PREFIXTERM:
        case WILDTERM:
        case REGEXPTERM:
        case RANGEIN_START:
        case RANGEEX_START:
        case NUMBER:
          break
        default:
          break label_1
      }
      if (this.jj_2_2(2)) {
        this.MultiTerm(field, clauses)
      } else {
        switch (this.ntk()) {
          case AND:
          case OR:
          case NOT:
          case PLUS:
          case MINUS:
          case BAREOPER:
          case LPAREN:
          case STAR:
          case QUOTED:
          case TERM:
          case PREFIXTERM:
          case WILDTERM:
          case REGEXPTERM:
          case RANGEIN_START:
          case RANGEEX_START:
          case NUMBER: {
            conj = this.Conjunction()
            mods = this.Modifiers()
            q = this.Clause(field)
            this.addClause(clauses, conj, mods, q)
            break
          }
          default:
            this.jj_consume_token(-1)
            throw new ParseException()
        }
      }
    }
    if (clauses.length === 1 && firstQuery !== null) {
      return firstQuery
    } else {
      return this.getBooleanQuery(clauses)
    }
  }

  Clause(field: string | null): Query | null {
    let q: Query | null
    let fieldToken: Token
    let boost: Token | null = null
    if (this.jj_2_3(2)) {
      switch (this.ntk()) {
        case TERM:
          fieldToken = this.jj_consume_token(TERM)
          this.jj_consume_token(COLON)
          field = this.discardEscapeChar(fieldToken.image)
          break
        case STAR:
          this.jj_consume_token(STAR)
          this.jj_consume_token(COLON)
          field = '*'
          break
        default:
          this.jj_consume_token(-1)
          throw new ParseException()
      }
    }
    switch (this.ntk()) {
      case BAREOPER:
      case STAR:
      case QUOTED:
      case TERM:
      case PREFIXTERM:
      case WILDTERM:
      case REGEXPTERM:
      case RANGEIN_START:
      case RANGEEX_START:
      case NUMBER:
        q = this.Term(field)
        break
      case LPAREN: {
        this.jj_consume_token(LPAREN)
        q = this.Query(field)
        this.jj_consume_token(RPAREN)
        switch (this.ntk()) {
          case CARAT:
            this.jj_consume_token(CARAT)
            boost = this.jj_consume_token(NUMBER)
            break
          default:
        }
        break
      }
      default:
        this.jj_consume_token(-1)
        throw new ParseException()
    }
    return this.handleBoost(q, boost)
  }

  Term(field: string | null): Query | null {
    let term: Token
    let boost: Token | null = null
    let fuzzySlop: Token | null = null
    let goop1: Token
    let goop2: Token
    let prefix = false
    let wildcard = false
    let fuzzy = false
    let regexp = false
    let startInc = false
    let endInc = false
    let q: Query | null
    switch (this.ntk()) {
      case BAREOPER:
      case STAR:
      case TERM:
      case PREFIXTERM:
      case WILDTERM:
      case REGEXPTERM:
      case NUMBER: {
        switch (this.ntk()) {
          case TERM:
            term = this.jj_consume_token(TERM)
            break
          case STAR:
            term = this.jj_consume_token(STAR)
            wildcard = true
            break
          case PREFIXTERM:
            term = this.jj_consume_token(PREFIXTERM)
            prefix = true
            break
          case WILDTERM:
            term = this.jj_consume_token(WILDTERM)
            wildcard = true
            break
          case REGEXPTERM:
            term = this.jj_consume_token(REGEXPTERM)
            regexp = true
            break
          case NUMBER:
            term = this.jj_consume_token(NUMBER)
            break
          case BAREOPER:
            term = this.jj_consume_token(BAREOPER)
            term.image = term.image.substring(0, 1)
            break
          default:
            this.jj_consume_token(-1)
            throw new ParseException()
        }
        switch (this.ntk()) {
          case CARAT:
          case FUZZY_SLOP: {
            switch (this.ntk()) {
              case CARAT:
                this.jj_consume_token(CARAT)
                boost = this.jj_consume_token(NUMBER)
                switch (this.ntk()) {
                  case FUZZY_SLOP:
                    fuzzySlop = this.jj_consume_token(FUZZY_SLOP)
                    fuzzy = true
                    break
                  default:
                }
                break
              case FUZZY_SLOP:
                fuzzySlop = this.jj_consume_token(FUZZY_SLOP)
                fuzzy = true
                switch (this.ntk()) {
                  case CARAT:
                    this.jj_consume_token(CARAT)
                    boost = this.jj_consume_token(NUMBER)
                    break
                  default:
                }
                break
              default:
                this.jj_consume_token(-1)
                throw new ParseException()
            }
            break
          }
          default:
        }
        q = this.handleBareTokenQuery(field, term, fuzzySlop, prefix, wildcard, fuzzy, regexp)
        break
      }
      case RANGEIN_START:
      case RANGEEX_START: {
        switch (this.ntk()) {
          case RANGEIN_START:
            this.jj_consume_token(RANGEIN_START)
            startInc = true
            break
          case RANGEEX_START:
            this.jj_consume_token(RANGEEX_START)
            break
          default:
            this.jj_consume_token(-1)
            throw new ParseException()
        }
        switch (this.ntk()) {
          case RANGE_GOOP:
            goop1 = this.jj_consume_token(RANGE_GOOP)
            break
          case RANGE_QUOTED:
            goop1 = this.jj_consume_token(RANGE_QUOTED)
            break
          case RANGE_TO:
            goop1 = this.jj_consume_token(RANGE_TO)
            break
          default:
            this.jj_consume_token(-1)
            throw new ParseException()
        }
        this.jj_consume_token(RANGE_TO)
        switch (this.ntk()) {
          case RANGE_GOOP:
            goop2 = this.jj_consume_token(RANGE_GOOP)
            break
          case RANGE_QUOTED:
            goop2 = this.jj_consume_token(RANGE_QUOTED)
            break
          case RANGE_TO:
            goop2 = this.jj_consume_token(RANGE_TO)
            break
          default:
            this.jj_consume_token(-1)
            throw new ParseException()
        }
        switch (this.ntk()) {
          case RANGEIN_END:
            this.jj_consume_token(RANGEIN_END)
            endInc = true
            break
          case RANGEEX_END:
            this.jj_consume_token(RANGEEX_END)
            break
          default:
            this.jj_consume_token(-1)
            throw new ParseException()
        }
        switch (this.ntk()) {
          case CARAT:
            this.jj_consume_token(CARAT)
            boost = this.jj_consume_token(NUMBER)
            break
          default:
        }
        let startOpen = false
        let endOpen = false
        if (goop1.kind === RANGE_QUOTED) {
          goop1.image = goop1.image.substring(1, goop1.image.length - 1)
        } else if ('*' === goop1.image) {
          startOpen = true
        }
        if (goop2.kind === RANGE_QUOTED) {
          goop2.image = goop2.image.substring(1, goop2.image.length - 1)
        } else if ('*' === goop2.image) {
          endOpen = true
        }
        q = this.getRangeQuery(field, startOpen ? null : this.discardEscapeChar(goop1.image), endOpen ? null : this.discardEscapeChar(goop2.image), startInc, endInc)
        break
      }
      case QUOTED: {
        term = this.jj_consume_token(QUOTED)
        switch (this.ntk()) {
          case CARAT:
          case FUZZY_SLOP: {
            switch (this.ntk()) {
              case CARAT:
                this.jj_consume_token(CARAT)
                boost = this.jj_consume_token(NUMBER)
                switch (this.ntk()) {
                  case FUZZY_SLOP:
                    fuzzySlop = this.jj_consume_token(FUZZY_SLOP)
                    fuzzy = true
                    break
                  default:
                }
                break
              case FUZZY_SLOP:
                fuzzySlop = this.jj_consume_token(FUZZY_SLOP)
                fuzzy = true
                switch (this.ntk()) {
                  case CARAT:
                    this.jj_consume_token(CARAT)
                    boost = this.jj_consume_token(NUMBER)
                    break
                  default:
                }
                break
              default:
                this.jj_consume_token(-1)
                throw new ParseException()
            }
            break
          }
          default:
        }
        q = this.handleQuotedTerm(field, term, fuzzySlop)
        break
      }
      default:
        this.jj_consume_token(-1)
        throw new ParseException()
    }
    void fuzzy
    return this.handleBoost(q, boost)
  }

  /** Returns the first query if splitOnWhitespace=true or otherwise the entire produced query */
  MultiTerm(field: string | null, clauses: BooleanClause[]): Query | null {
    let followingText: Token
    let firstQuery: Query | null = null
    const text = this.jj_consume_token(TERM)
    if (this.splitOnWhitespace) {
      firstQuery = this.getFieldQuery(field, this.discardEscapeChar(text.image), false)
      this.addClause(clauses, CONJ_NONE, MOD_NONE, firstQuery)
    }
    if (this.getToken(1).kind === TERM && allowedPostMultiTerm(this.getToken(2).kind)) {
      // ok
    } else {
      this.jj_consume_token(-1)
      throw new ParseException()
    }
    label_2: while (true) {
      followingText = this.jj_consume_token(TERM)
      if (this.splitOnWhitespace) {
        const q = this.getFieldQuery(field, this.discardEscapeChar(followingText.image), false)
        this.addClause(clauses, CONJ_NONE, MOD_NONE, q)
      } else {
        // build up the text to send to analysis
        text.image += ` ${followingText.image}`
      }
      if (this.getToken(1).kind === TERM && allowedPostMultiTerm(this.getToken(2).kind)) {
        // continue
      } else {
        break label_2
      }
    }
    if (this.splitOnWhitespace === false) {
      firstQuery = this.getFieldQuery(field, this.discardEscapeChar(text.image), false)
      this.addMultiTermClauses(clauses, firstQuery)
    }
    return firstQuery
  }

  private jj_2_1(xla: number): boolean {
    this.jj_la = xla
    this.jj_lastpos = this.jj_scanpos = this.token
    try {
      return !this.jj_3_1()
    } catch (ls) {
      if (ls === jj_ls) return true
      throw ls
    }
  }

  private jj_2_2(xla: number): boolean {
    this.jj_la = xla
    this.jj_lastpos = this.jj_scanpos = this.token
    try {
      return !this.jj_3_2()
    } catch (ls) {
      if (ls === jj_ls) return true
      throw ls
    }
  }

  private jj_2_3(xla: number): boolean {
    this.jj_la = xla
    this.jj_lastpos = this.jj_scanpos = this.token
    try {
      return !this.jj_3_3()
    } catch (ls) {
      if (ls === jj_ls) return true
      throw ls
    }
  }

  private jj_3R_MultiTerm_391_3_6(): boolean {
    return false
  }

  private jj_3R_Clause_308_9_5(): boolean {
    if (this.jj_scan_token(STAR)) return true
    if (this.jj_scan_token(COLON)) return true
    return false
  }

  private jj_3R_Clause_307_7_4(): boolean {
    if (this.jj_scan_token(TERM)) return true
    if (this.jj_scan_token(COLON)) return true
    return false
  }

  private jj_3_2(): boolean {
    if (this.jj_3R_MultiTerm_383_3_3()) return true
    return false
  }

  private jj_3_1(): boolean {
    if (this.jj_3R_MultiTerm_383_3_3()) return true
    return false
  }

  private jj_3R_MultiTerm_393_5_7(): boolean {
    if (this.jj_scan_token(TERM)) return true
    return false
  }

  private jj_3_3(): boolean {
    const xsp = this.jj_scanpos
    if (this.jj_3R_Clause_307_7_4()) {
      this.jj_scanpos = xsp
      if (this.jj_3R_Clause_308_9_5()) return true
    }
    return false
  }

  private jj_3R_MultiTerm_383_3_3(): boolean {
    if (this.jj_scan_token(TERM)) return true
    this.jj_lookingAhead = true
    this.jj_semLA = this.getToken(1).kind === TERM && allowedPostMultiTerm(this.getToken(2).kind)
    this.jj_lookingAhead = false
    if (!this.jj_semLA || this.jj_3R_MultiTerm_391_3_6()) return true
    let xsp: Token | null
    if (this.jj_3R_MultiTerm_393_5_7()) return true
    while (true) {
      xsp = this.jj_scanpos
      if (this.jj_3R_MultiTerm_393_5_7()) {
        this.jj_scanpos = xsp
        break
      }
    }
    return false
  }

  ReInit(input: string): void {
    this.token_source = new QueryParserTokenManager(input)
    this.token = new Token()
    this.jj_ntk = -1
    this.jj_lookingAhead = false
  }

  private jj_consume_token(kind: number): Token {
    const oldToken = this.token
    if (oldToken.next !== null) this.token = oldToken.next
    else this.token = oldToken.next = this.token_source.getNextToken()
    this.jj_ntk = -1
    if (this.token.kind === kind) {
      return this.token
    }
    this.token = oldToken
    throw this.generateParseException()
  }

  private jj_scan_token(kind: number): boolean {
    const scanpos = this.jj_scanpos as Token
    if (this.jj_scanpos === this.jj_lastpos) {
      this.jj_la--
      if (scanpos.next === null) {
        this.jj_lastpos = this.jj_scanpos = scanpos.next = this.token_source.getNextToken()
      } else {
        this.jj_lastpos = this.jj_scanpos = scanpos.next
      }
    } else {
      this.jj_scanpos = scanpos.next
    }
    if ((this.jj_scanpos as Token).kind !== kind) return true
    if (this.jj_la === 0 && this.jj_scanpos === this.jj_lastpos) throw jj_ls
    return false
  }

  /** Get the next Token. */
  getNextToken(): Token {
    if (this.token.next !== null) this.token = this.token.next
    else this.token = this.token.next = this.token_source.getNextToken()
    this.jj_ntk = -1
    return this.token
  }

  /** Get the specific Token. */
  getToken(index: number): Token {
    let t = (this.jj_lookingAhead ? this.jj_scanpos : this.token) as Token
    for (let i = 0; i < index; i++) {
      if (t.next !== null) t = t.next
      else t = t.next = this.token_source.getNextToken()
    }
    return t
  }

  private jj_ntk_f(): number {
    const nt = this.token.next
    if (nt === null) return (this.jj_ntk = (this.token.next = this.token_source.getNextToken()).kind)
    else return (this.jj_ntk = nt.kind)
  }

  // PORT: message simplifié (pas de liste des jetons attendus)
  generateParseException(): ParseException {
    const next = this.token.next
    return new ParseException(`Encountered "${next?.image ?? ''}" (kind ${next?.kind ?? '?'})`)
  }
}

// ---------------------------------------------------------------------------
// MultiFieldQueryParser
// ---------------------------------------------------------------------------

/** A QueryParser which constructs queries to search multiple fields. */
export class MultiFieldQueryParser extends QueryParser {
  protected fields: string[]
  protected boosts: Map<string, number> | null

  constructor(fields: string[], analyzer: Analyzer, boosts: Map<string, number> | null = null) {
    super(null, analyzer)
    this.fields = fields
    this.boosts = boosts
  }

  protected getFieldQuerySlop(field: string | null, queryText: string, slop: number): Query | null {
    if (field === null) {
      const clauses: Query[] = []
      for (let i = 0; i < this.fields.length; i++) {
        let q = super.getFieldQuery(this.fields[i] as string, queryText, true)
        if (q !== null) {
          // If the user passes a map of boosts
          if (this.boosts !== null) {
            // Get the boost from the map and apply them
            const boost = this.boosts.get(this.fields[i] as string)
            if (boost !== undefined) {
              q = new BoostQuery(q, boost)
            }
          }
          q = this.applySlop(q, slop)
          clauses.push(q as Query)
        }
      }
      if (clauses.length === 0)
        // happens for stopwords
        return null
      return this.getMultiFieldQuery(clauses)
    }
    let q = super.getFieldQuery(field, queryText, true)
    q = this.applySlop(q, slop)
    return q
  }

  private applySlop(q: Query | null, slop: number): Query | null {
    if (q instanceof PhraseQuery) {
      const builder = new PhraseQuery.Builder()
      builder.setSlop(slop)
      const pq = q
      const terms = pq.getTerms()
      const positions = pq.getPositions()
      for (let i = 0; i < terms.length; ++i) {
        builder.add(terms[i] as Term, positions[i] as number)
      }
      q = builder.build()
    } else if (q instanceof BoostQuery) {
      let subQuery: Query | null = q.query
      subQuery = this.applySlop(subQuery, slop)
      q = new BoostQuery(subQuery as Query, q.boost)
    }
    return q
  }

  private applyBoost(q: Query | null, field: string): Query | null {
    if (this.boosts !== null) {
      const boost = this.boosts.get(field)
      if (boost !== undefined) {
        q = new BoostQuery(q as Query, boost)
      }
    }
    return q
  }

  protected getFieldQuery(field: string | null, queryText: string, quoted: boolean): Query | null {
    if (field === null) {
      const clauses: Query[] = []
      const fieldQueries: (Query | null)[] = new Array(this.fields.length).fill(null)
      let maxTerms = 0
      for (let i = 0; i < this.fields.length; i++) {
        const q = super.getFieldQuery(this.fields[i] as string, queryText, quoted)
        if (q !== null) {
          if (q instanceof BooleanQuery) {
            maxTerms = Math.max(maxTerms, q.clauses().length)
          } else {
            maxTerms = Math.max(1, maxTerms)
          }
          fieldQueries[i] = q
        }
      }
      for (let termNum = 0; termNum < maxTerms; termNum++) {
        const termClauses: Query[] = []
        for (let i = 0; i < this.fields.length; i++) {
          const fq = fieldQueries[i] as Query | null
          if (fq !== null) {
            let q: Query | null = null
            if (fq instanceof BooleanQuery) {
              const nestedClauses = fq.clauses()
              if (termNum < nestedClauses.length) {
                q = (nestedClauses[termNum] as BooleanClause).query
              }
            } else if (termNum === 0) {
              // e.g. TermQuery-s
              q = fq
            }
            if (q !== null) {
              if (this.boosts !== null) {
                // Get the boost from the map and apply them
                const boost = this.boosts.get(this.fields[i] as string)
                if (boost !== undefined) {
                  q = new BoostQuery(q, boost)
                }
              }
              termClauses.push(q)
            }
          }
        }
        if (maxTerms > 1) {
          if (termClauses.length > 0) {
            const builder = this.newBooleanQuery()
            for (const termClause of termClauses) {
              builder.add(termClause, BooleanClause.Occur.SHOULD)
            }
            clauses.push(builder.build())
          }
        } else {
          clauses.push(...termClauses)
        }
      }
      if (clauses.length === 0)
        // happens for stopwords
        return null
      return this.getMultiFieldQuery(clauses)
    }
    return super.getFieldQuery(field, queryText, quoted)
  }

  protected getFuzzyQuery(field: string | null, termStr: string, minSimilarity: number): Query | null {
    if (field === null) {
      const clauses: (Query | null)[] = []
      for (let i = 0; i < this.fields.length; i++) {
        clauses.push(this.getFuzzyQuery(this.fields[i] as string, termStr, minSimilarity))
      }
      return this.getMultiFieldQuery(clauses)
    }
    const q = super.getFuzzyQuery(field, termStr, minSimilarity)
    return this.applyBoost(q, field)
  }

  protected getPrefixQuery(field: string | null, termStr: string): Query | null {
    if (field === null) {
      const clauses: (Query | null)[] = []
      for (let i = 0; i < this.fields.length; i++) {
        clauses.push(this.getPrefixQuery(this.fields[i] as string, termStr))
      }
      return this.getMultiFieldQuery(clauses)
    }
    const q = super.getPrefixQuery(field, termStr)
    return this.applyBoost(q, field)
  }

  protected getWildcardQuery(field: string | null, termStr: string): Query | null {
    if (field === null) {
      const clauses: (Query | null)[] = []
      for (let i = 0; i < this.fields.length; i++) {
        clauses.push(this.getWildcardQuery(this.fields[i] as string, termStr))
      }
      return this.getMultiFieldQuery(clauses)
    }
    const q = super.getWildcardQuery(field, termStr)
    return this.applyBoost(q, field)
  }

  protected getRangeQuery(field: string | null, part1: string | null, part2: string | null, startInclusive: boolean, endInclusive: boolean): Query | null {
    if (field === null) {
      const clauses: (Query | null)[] = []
      for (let i = 0; i < this.fields.length; i++) {
        clauses.push(this.getRangeQuery(this.fields[i] as string, part1, part2, startInclusive, endInclusive))
      }
      return this.getMultiFieldQuery(clauses)
    }
    const q = super.getRangeQuery(field, part1, part2, startInclusive, endInclusive)
    return this.applyBoost(q, field)
  }

  protected getRegexpQuery(field: string | null, termStr: string): Query | null {
    if (field === null) {
      const clauses: (Query | null)[] = []
      for (let i = 0; i < this.fields.length; i++) {
        clauses.push(this.getRegexpQuery(this.fields[i] as string, termStr))
      }
      return this.getMultiFieldQuery(clauses)
    }
    const q = super.getRegexpQuery(field, termStr)
    return this.applyBoost(q, field)
  }

  // TODO: investigate more general approach by default, e.g. DisjunctionMaxQuery?
  protected getMultiFieldQuery(queries: (Query | null)[]): Query | null {
    if (queries.length === 0) {
      return null // all clause words were filtered away by the analyzer.
    }
    const query = this.newBooleanQuery()
    for (const sub of queries) {
      // PORT: BooleanClause(null) lève NullPointerException en Java
      if (sub === null) throw new IllegalArgumentException('Query must not be null')
      query.add(sub, BooleanClause.Occur.SHOULD)
    }
    return query.build()
  }
}
