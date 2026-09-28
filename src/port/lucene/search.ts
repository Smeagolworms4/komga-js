// Support de portage : sous-ensemble de org.apache.lucene.search (Lucene 9.9.1) utilisé par Komga (directement ou
// via le QueryParser classique) : Query et ses réécritures (BooleanQuery.rewrite porté règle par règle, BoostQuery,
// ConstantScoreQuery, PhraseQuery, MultiTermQuery et CONSTANT_SCORE_BLENDED_REWRITE, FuzzyQuery et
// TopTermsBlendedFreqScoringRewrite / BlendedTermQuery), IndexSearcher.search(query, n), TopDocs, SearcherManager.
//
// Score : BM25Similarity (k1 = 1.2, b = 0.75, discountOverlaps) calculé en flottants 32 bits (Math.fround à chaque
// opération float de Java). La combinaison des scores reprend Boolean2ScorerSupplier : conjonction et disjonction
// = somme en double convertie en float, ReqOptSumScorer = somme float. Tri : score décroissant puis numéro de
// document croissant (TopScoreDocCollector).
// PORT: les scorers itératifs de Lucene (WAND, block-max...) sont remplacés par une évaluation par ensembles
// (document -> score) donnant les mêmes documents et les mêmes scores.
// Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException, IllegalStateException, RuntimeException } from '../kotlin.js'
import { compareTerms } from './analysis.js'
import { Term } from './document.js'
import { type CollectionStatistics, type DocRecord, type FieldData, type IndexReader, type IndexWriter, SmallFloat } from './index.js'
import { RegExp } from './RegExp.js'

const f = Math.fround

// ---------------------------------------------------------------------------
// Similarité BM25
// ---------------------------------------------------------------------------

const LENGTH_TABLE = new Float32Array(256)
for (let i = 0; i < 256; i++) LENGTH_TABLE[i] = SmallFloat.byte4ToInt(i)

type TermStatistics = { term: string; docFreq: number; totalTermFreq: number }

export class BM25Scorer {
  private readonly weight: number

  constructor(
    boost: number,
    idf: number,
    private readonly cache: Float32Array,
  ) {
    this.weight = f(boost * idf)
  }

  score(freq: number, encodedNorm: number): number {
    const normInverse = this.cache[encodedNorm & 0xff] as number
    return f(this.weight - f(this.weight / f(1 + f(freq * normInverse))))
  }
}

export class BM25Similarity {
  private readonly k1 = f(1.2)
  private readonly b = f(0.75)

  idf(docFreq: number, docCount: number): number {
    return f(Math.log(1 + (docCount - docFreq + 0.5) / (docFreq + 0.5)))
  }

  avgFieldLength(collectionStats: CollectionStatistics): number {
    return f(collectionStats.sumTotalTermFreq / collectionStats.docCount)
  }

  scorer(boost: number, collectionStats: CollectionStatistics, ...termStats: TermStatistics[]): BM25Scorer {
    let idf: number
    if (termStats.length === 1) idf = this.idf((termStats[0] as TermStatistics).docFreq, collectionStats.docCount)
    else {
      let sum = 0 // sum into a double before casting into a float
      for (const stat of termStats) sum += this.idf(stat.docFreq, collectionStats.docCount)
      idf = f(sum)
    }
    const avgdl = this.avgFieldLength(collectionStats)
    const cache = new Float32Array(256)
    const k1 = this.k1
    const b = this.b
    for (let i = 0; i < cache.length; i++) {
      cache[i] = f(1 / f(k1 * f(f(1 - b) + f(f(b * (LENGTH_TABLE[i] as number)) / avgdl))))
    }
    return new BM25Scorer(boost, idf, cache)
  }
}

// ---------------------------------------------------------------------------
// Query / Weight
// ---------------------------------------------------------------------------

export enum ScoreMode {
  COMPLETE = 'COMPLETE',
  COMPLETE_NO_SCORES = 'COMPLETE_NO_SCORES',
  TOP_SCORES = 'TOP_SCORES',
}

function needsScores(m: ScoreMode): boolean {
  return m !== ScoreMode.COMPLETE_NO_SCORES
}

/** Résultat d'un Weight : documents correspondants -> score */
export type Hits = Map<number, number>

export abstract class Weight {
  abstract scores(): Hits
}

class EmptyWeight extends Weight {
  scores(): Hits {
    return new Map()
  }
}

export abstract class Query {
  rewrite(_searcher: IndexSearcher): Query {
    return this
  }

  abstract createWeight(searcher: IndexSearcher, scoreMode: ScoreMode, boost: number): Weight

  /** Clé d'égalité (equals/hashCode de Lucene) */
  abstract key(): string

  equals(other: Query): boolean {
    return this.key() === other.key()
  }

  /** Nombre de feuilles comptées par IndexSearcher.getNumClausesCheckVisitor */
  visitCount(): number {
    return 1
  }

  abstract toString(field?: string | null): string
}

export class TooManyClauses extends RuntimeException {
  constructor(message = `maxClauseCount is set to ${IndexSearcher.maxClauseCount}`) {
    super(message)
  }
}

export class TooManyNestedClauses extends TooManyClauses {
  constructor() {
    super(`Query contains too many nested clauses; maxClauseCount is set to ${IndexSearcher.maxClauseCount}`)
  }
}

// ---------------------------------------------------------------------------
// MatchAllDocsQuery / MatchNoDocsQuery / ConstantScoreQuery / BoostQuery
// ---------------------------------------------------------------------------

export class MatchAllDocsQuery extends Query {
  createWeight(searcher: IndexSearcher, _scoreMode: ScoreMode, boost: number): Weight {
    return new (class extends Weight {
      scores(): Hits {
        const m: Hits = new Map()
        for (const d of searcher.reader.liveDocs()) m.set(d.id, boost)
        return m
      }
    })()
  }

  key(): string {
    return 'MatchAllDocsQuery'
  }

  toString(): string {
    return '*:*'
  }
}

export class MatchNoDocsQuery extends Query {
  constructor(private readonly reason = '') {
    super()
  }

  createWeight(): Weight {
    return new EmptyWeight()
  }

  key(): string {
    return 'MatchNoDocsQuery'
  }

  toString(): string {
    return `MatchNoDocsQuery("${this.reason}")`
  }
}

export class ConstantScoreQuery extends Query {
  constructor(readonly query: Query) {
    super()
  }

  rewrite(searcher: IndexSearcher): Query {
    let rewritten = this.query.rewrite(searcher)

    // Do some extra simplifications that are legal since scores are not needed on the wrapped
    // query.
    if (rewritten instanceof BoostQuery) {
      rewritten = rewritten.query
    } else if (rewritten instanceof ConstantScoreQuery) {
      rewritten = rewritten.query
    } else if (rewritten instanceof BooleanQuery) {
      rewritten = rewritten.rewriteNoScoring()
    }

    if (rewritten.constructor === MatchNoDocsQuery) {
      // bubble up MatchNoDocsQuery
      return rewritten
    }

    if (rewritten !== this.query) {
      return new ConstantScoreQuery(rewritten)
    }

    if (rewritten.constructor === ConstantScoreQuery) {
      return rewritten
    }

    if (rewritten.constructor === BoostQuery) {
      return new ConstantScoreQuery((rewritten as BoostQuery).query)
    }

    return super.rewrite(searcher)
  }

  createWeight(searcher: IndexSearcher, scoreMode: ScoreMode, boost: number): Weight {
    const inner = searcher.createWeight(this.query, ScoreMode.COMPLETE_NO_SCORES, 1)
    const score = needsScores(scoreMode) ? boost : 0
    return new (class extends Weight {
      scores(): Hits {
        const m: Hits = new Map()
        for (const d of inner.scores().keys()) m.set(d, score)
        return m
      }
    })()
  }

  key(): string {
    return `ConstantScore(${this.query.key()})`
  }

  visitCount(): number {
    return this.query.visitCount()
  }

  toString(field?: string | null): string {
    return `ConstantScore(${this.query.toString(field)})`
  }
}

export class BoostQuery extends Query {
  readonly boost: number

  constructor(
    readonly query: Query,
    boost: number,
  ) {
    super()
    boost = f(boost)
    if (!Number.isFinite(boost) || boost < 0 || Object.is(boost, -0)) {
      throw new IllegalArgumentException(`boost must be a positive float, got ${boost}`)
    }
    this.boost = boost
  }

  rewrite(searcher: IndexSearcher): Query {
    const rewritten = this.query.rewrite(searcher)

    if (this.boost === 1) {
      return rewritten
    }

    if (rewritten.constructor === BoostQuery) {
      const inner = rewritten as BoostQuery
      return new BoostQuery(inner.query, f(this.boost * inner.boost))
    }

    if (rewritten.constructor === MatchNoDocsQuery) {
      // bubble up MatchNoDocsQuery
      return rewritten
    }

    if (this.boost === 0 && rewritten.constructor !== ConstantScoreQuery) {
      // so that we pass needScores=false
      return new BoostQuery(new ConstantScoreQuery(rewritten), 0)
    }

    if (this.query !== rewritten) {
      return new BoostQuery(rewritten, this.boost)
    }

    return super.rewrite(searcher)
  }

  createWeight(searcher: IndexSearcher, scoreMode: ScoreMode, boost: number): Weight {
    return this.query.createWeight(searcher, scoreMode, f(this.boost * boost))
  }

  key(): string {
    return `Boost(${this.query.key()},${this.boost})`
  }

  visitCount(): number {
    return this.query.visitCount()
  }

  toString(field?: string | null): string {
    return `(${this.query.toString(field)})^${this.boost}`
  }
}

// ---------------------------------------------------------------------------
// TermQuery
// ---------------------------------------------------------------------------

export type TermStates = { docFreq: number; totalTermFreq: number }

export class TermQuery extends Query {
  constructor(
    readonly term: Term,
    /** statistiques imposées (BlendedTermQuery), sinon calculées */
    readonly perReaderTermState: TermStates | null = null,
  ) {
    super()
  }

  createWeight(searcher: IndexSearcher, scoreMode: ScoreMode, boost: number): Weight {
    const term = this.term
    const termStates = this.perReaderTermState ?? searcher.reader.termStates(term)
    let simScorer: BM25Scorer | null = null
    if (needsScores(scoreMode) && termStates.docFreq > 0) {
      const collectionStats = searcher.collectionStatistics(term.field) as CollectionStatistics
      simScorer = searcher.similarity.scorer(boost, collectionStats, { term: term.bytes, docFreq: termStates.docFreq, totalTermFreq: termStates.totalTermFreq })
    }
    return new (class extends Weight {
      scores(): Hits {
        const m: Hits = new Map()
        for (const d of searcher.reader.postings(term.field, term.bytes)) {
          const fd = d.fields.get(term.field) as FieldData
          const freq = fd.indexOptions === 'DOCS' ? 1 : (fd.terms.get(term.bytes) as number[]).length
          const norm = fd.norm === -1 ? 1 : fd.norm
          m.set(d.id, simScorer === null ? 0 : simScorer.score(freq, norm))
        }
        return m
      }
    })()
  }

  getTerm(): Term {
    return this.term
  }

  key(): string {
    return `TermQuery(${JSON.stringify([this.term.field, this.term.bytes])})`
  }

  toString(field?: string | null): string {
    return this.term.field === field ? this.term.bytes : this.term.toString()
  }
}

// ---------------------------------------------------------------------------
// BooleanQuery
// ---------------------------------------------------------------------------

export class BooleanClause {
  constructor(
    readonly query: Query,
    readonly occur: BooleanClause.Occur,
  ) {}

  getQuery(): Query {
    return this.query
  }

  getOccur(): BooleanClause.Occur {
    return this.occur
  }

  isProhibited(): boolean {
    return BooleanClause.Occur.MUST_NOT === this.occur
  }

  isRequired(): boolean {
    return this.occur === BooleanClause.Occur.MUST || this.occur === BooleanClause.Occur.FILTER
  }

  isScoring(): boolean {
    return this.occur === BooleanClause.Occur.MUST || this.occur === BooleanClause.Occur.SHOULD
  }
}

export namespace BooleanClause {
  // ordre de l'enum Java (EnumMap)
  export enum Occur {
    MUST = 'MUST',
    FILTER = 'FILTER',
    SHOULD = 'SHOULD',
    MUST_NOT = 'MUST_NOT',
  }
}

const OCCURS = [BooleanClause.Occur.MUST, BooleanClause.Occur.FILTER, BooleanClause.Occur.SHOULD, BooleanClause.Occur.MUST_NOT]

export class BooleanQuery extends Query implements Iterable<BooleanClause> {
  private constructor(
    readonly minimumNumberShouldMatch: number,
    private readonly clausesL: readonly BooleanClause[],
  ) {
    super()
  }

  static Builder = class Builder {
    private minimumNumberShouldMatch = 0
    private readonly clauses: BooleanClause[] = []

    setMinimumNumberShouldMatch(min: number): this {
      this.minimumNumberShouldMatch = min
      return this
    }

    add(clauseOrQuery: BooleanClause | Query, occur?: BooleanClause.Occur): this {
      const clause = clauseOrQuery instanceof BooleanClause ? clauseOrQuery : new BooleanClause(clauseOrQuery, occur as BooleanClause.Occur)
      // We do the final deep check for max clauses count limit during
      // IndexSearcher.rewrite but do this check to short
      // circuit in case a single query holds more than numClauses
      if (this.clauses.length >= IndexSearcher.maxClauseCount) {
        throw new TooManyClauses()
      }
      this.clauses.push(clause)
      return this
    }

    build(): BooleanQuery {
      return new BooleanQuery(this.minimumNumberShouldMatch, [...this.clauses])
    }
  }

  getMinimumNumberShouldMatch(): number {
    return this.minimumNumberShouldMatch
  }

  clauses(): readonly BooleanClause[] {
    return this.clausesL
  }

  getClauses(occur: BooleanClause.Occur): Query[] {
    return this.clausesL.filter((c) => c.occur === occur).map((c) => c.query)
  }

  [Symbol.iterator](): Iterator<BooleanClause> {
    return this.clausesL[Symbol.iterator]()
  }

  isPureDisjunction(): boolean {
    return this.clausesL.length === this.getClauses(BooleanClause.Occur.SHOULD).length && this.minimumNumberShouldMatch <= 1
  }

  /** `clauseSets` : multiensembles pour MUST/SHOULD, ensembles pour FILTER/MUST_NOT */
  private clauseSet(occur: BooleanClause.Occur): Query[] {
    const qs = this.getClauses(occur)
    if (occur === BooleanClause.Occur.FILTER || occur === BooleanClause.Occur.MUST_NOT) {
      const seen = new Set<string>()
      return qs.filter((q) => {
        const k = q.key()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    }
    return qs
  }

  /** Rewrite to a BooleanQuery that doesn't need scores (MUST -> FILTER) */
  rewriteNoScoring(): BooleanQuery {
    let actuallyRewritten = false
    const newQuery = new BooleanQuery.Builder().setMinimumNumberShouldMatch(this.minimumNumberShouldMatch)

    const keepShould = this.minimumNumberShouldMatch > 0 || this.clauseSet(BooleanClause.Occur.MUST).length + this.clauseSet(BooleanClause.Occur.FILTER).length === 0

    for (const clause of this.clausesL) {
      const query = clause.query
      // NOTE: rewritingNoScoring() should not call rewrite(), otherwise this
      // method could run in exponential time with the depth of the query as
      // every new level would rewrite 2x more than its parent level.
      let rewritten = query
      if (rewritten instanceof BoostQuery) {
        rewritten = rewritten.query
      }
      if (rewritten instanceof ConstantScoreQuery) {
        rewritten = rewritten.query
      }
      if (rewritten instanceof BooleanQuery) {
        rewritten = rewritten.rewriteNoScoring()
      }
      const occur = clause.occur
      if (occur === BooleanClause.Occur.SHOULD && keepShould === false) {
        // ignore clause
        actuallyRewritten = true
      } else if (occur === BooleanClause.Occur.MUST) {
        // replace MUST clauses with FILTER clauses
        newQuery.add(rewritten, BooleanClause.Occur.FILTER)
        actuallyRewritten = true
      } else if (query !== rewritten) {
        newQuery.add(rewritten, occur)
        actuallyRewritten = true
      } else {
        newQuery.add(clause)
      }
    }

    if (actuallyRewritten === false) {
      return this
    }

    return newQuery.build()
  }

  rewrite(searcher: IndexSearcher): Query {
    const Occur = BooleanClause.Occur
    const clauses = this.clausesL
    const minimumNumberShouldMatch = this.minimumNumberShouldMatch
    if (clauses.length === 0) {
      return new MatchNoDocsQuery('empty BooleanQuery')
    }

    // optimize 1-clause queries
    if (clauses.length === 1) {
      const c = clauses[0] as BooleanClause
      const query = c.query
      if (minimumNumberShouldMatch === 1 && c.occur === Occur.SHOULD) {
        return query
      } else if (minimumNumberShouldMatch === 0) {
        switch (c.occur) {
          case Occur.SHOULD:
          case Occur.MUST:
            return query
          case Occur.FILTER:
            // no scoring clauses, so return a score of 0
            return new BoostQuery(new ConstantScoreQuery(query), 0)
          case Occur.MUST_NOT:
            // no positive clauses
            return new MatchNoDocsQuery('pure negative BooleanQuery')
        }
      }
    }

    // recursively rewrite
    {
      const builder = new BooleanQuery.Builder()
      builder.setMinimumNumberShouldMatch(minimumNumberShouldMatch)
      let actuallyRewritten = false
      for (const clause of clauses) {
        const query = clause.query
        const occur = clause.occur
        let rewritten: Query
        if (occur === Occur.FILTER || occur === Occur.MUST_NOT) {
          // Clauses that are not involved in scoring can get some extra simplifications
          rewritten = new ConstantScoreQuery(query).rewrite(searcher)
          if (rewritten instanceof ConstantScoreQuery) {
            rewritten = rewritten.query
          }
        } else {
          rewritten = query.rewrite(searcher)
        }
        if (rewritten !== query || query.constructor === MatchNoDocsQuery) {
          // rewrite clause
          actuallyRewritten = true
          if (rewritten.constructor === MatchNoDocsQuery) {
            switch (occur) {
              case Occur.SHOULD:
              case Occur.MUST_NOT:
                // the clause can be safely ignored
                break
              case Occur.MUST:
              case Occur.FILTER:
                return rewritten
            }
          } else {
            builder.add(rewritten, occur)
          }
        } else {
          // leave as-is
          builder.add(clause)
        }
      }
      if (actuallyRewritten) {
        return builder.build()
      }
    }

    const clauseSets = new Map<BooleanClause.Occur, Query[]>()
    for (const o of OCCURS) clauseSets.set(o, this.clauseSet(o))
    const cs = (o: BooleanClause.Occur) => clauseSets.get(o) as Query[]
    const containsQ = (qs: Query[], q: Query) => qs.some((x) => x.equals(q))

    // remove duplicate FILTER and MUST_NOT clauses
    {
      let clauseCount = 0
      for (const queries of clauseSets.values()) {
        clauseCount += queries.length
      }
      if (clauseCount !== clauses.length) {
        // since clauseSets implicitly deduplicates FILTER and MUST_NOT
        // clauses, this means there were duplicates
        const rewritten = new BooleanQuery.Builder()
        rewritten.setMinimumNumberShouldMatch(minimumNumberShouldMatch)
        for (const [occur, queries] of clauseSets) {
          for (const query of queries) {
            rewritten.add(query, occur)
          }
        }
        return rewritten.build()
      }
    }

    // Check whether some clauses are both required and excluded
    const mustNotClauses = cs(Occur.MUST_NOT)
    if (mustNotClauses.length > 0) {
      if (mustNotClauses.some((q) => containsQ(cs(Occur.MUST), q) || containsQ(cs(Occur.FILTER), q))) {
        return new MatchNoDocsQuery('FILTER or MUST clause also in MUST_NOT')
      }
      if (containsQ(mustNotClauses, new MatchAllDocsQuery())) {
        return new MatchNoDocsQuery('MUST_NOT clause is MatchAllDocsQuery')
      }
    }

    // remove FILTER clauses that are also MUST clauses or that match all documents
    if (cs(Occur.FILTER).length > 0) {
      let filters = [...cs(Occur.FILTER)]
      let modified = false
      if (filters.length > 1 || cs(Occur.MUST).length > 0) {
        const before = filters.length
        filters = filters.filter((q) => !q.equals(new MatchAllDocsQuery()))
        modified = filters.length !== before
      }
      const before = filters.length
      filters = filters.filter((q) => !containsQ(cs(Occur.MUST), q))
      modified = modified || filters.length !== before
      if (modified) {
        const builder = new BooleanQuery.Builder()
        builder.setMinimumNumberShouldMatch(minimumNumberShouldMatch)
        for (const clause of clauses) {
          if (clause.occur !== Occur.FILTER) {
            builder.add(clause)
          }
        }
        for (const filter of filters) {
          builder.add(filter, Occur.FILTER)
        }
        return builder.build()
      }
    }

    // convert FILTER clauses that are also SHOULD clauses to MUST clauses
    if (cs(Occur.SHOULD).length > 0 && cs(Occur.FILTER).length > 0) {
      const filters = cs(Occur.FILTER)
      const shoulds = cs(Occur.SHOULD)

      const intersection = filters.filter((q) => containsQ(shoulds, q))

      if (intersection.length > 0) {
        const builder = new BooleanQuery.Builder()
        let minShouldMatch = minimumNumberShouldMatch

        for (const clause of clauses) {
          if (containsQ(intersection, clause.query)) {
            if (clause.occur === Occur.SHOULD) {
              builder.add(new BooleanClause(clause.query, Occur.MUST))
              minShouldMatch--
            }
          } else {
            builder.add(clause)
          }
        }

        builder.setMinimumNumberShouldMatch(Math.max(0, minShouldMatch))
        return builder.build()
      }
    }

    // Deduplicate SHOULD clauses by summing up their boosts
    // PORT: ordre d'insertion (LinkedHashMap) au lieu de l'ordre de hachage de HashMap : seul l'ordre de sommation change
    if (cs(Occur.SHOULD).length > 0 && minimumNumberShouldMatch <= 1) {
      const shouldClauses = new Map<string, [Query, number]>()
      for (let query of cs(Occur.SHOULD)) {
        let boost = 1
        while (query instanceof BoostQuery) {
          boost *= query.boost
          query = query.query
        }
        const k = query.key()
        const e = shouldClauses.get(k)
        shouldClauses.set(k, [e?.[0] ?? query, (e?.[1] ?? 0) + boost])
      }
      if (shouldClauses.size !== cs(Occur.SHOULD).length) {
        const builder = new BooleanQuery.Builder().setMinimumNumberShouldMatch(minimumNumberShouldMatch)
        for (const [q, b] of shouldClauses.values()) {
          let query = q
          const boost = f(b)
          if (boost !== 1) {
            query = new BoostQuery(query, boost)
          }
          builder.add(query, Occur.SHOULD)
        }
        for (const clause of clauses) {
          if (clause.occur !== Occur.SHOULD) {
            builder.add(clause)
          }
        }
        return builder.build()
      }
    }

    // Deduplicate MUST clauses by summing up their boosts
    if (cs(Occur.MUST).length > 0) {
      const mustClauses = new Map<string, [Query, number]>()
      for (let query of cs(Occur.MUST)) {
        let boost = 1
        while (query instanceof BoostQuery) {
          boost *= query.boost
          query = query.query
        }
        const k = query.key()
        const e = mustClauses.get(k)
        mustClauses.set(k, [e?.[0] ?? query, (e?.[1] ?? 0) + boost])
      }
      if (mustClauses.size !== cs(Occur.MUST).length) {
        const builder = new BooleanQuery.Builder().setMinimumNumberShouldMatch(minimumNumberShouldMatch)
        for (const [q, b] of mustClauses.values()) {
          let query = q
          const boost = f(b)
          if (boost !== 1) {
            query = new BoostQuery(query, boost)
          }
          builder.add(query, Occur.MUST)
        }
        for (const clause of clauses) {
          if (clause.occur !== Occur.MUST) {
            builder.add(clause)
          }
        }
        return builder.build()
      }
    }

    // Rewrite queries whose single scoring clause is a MUST clause on a
    // MatchAllDocsQuery to a ConstantScoreQuery
    {
      const musts = cs(Occur.MUST)
      const filters = cs(Occur.FILTER)
      if (musts.length === 1 && filters.length > 0) {
        let must = musts[0] as Query
        let boost = 1
        if (must instanceof BoostQuery) {
          boost = must.boost
          must = must.query
        }
        if (must.constructor === MatchAllDocsQuery) {
          // our single scoring clause matches everything: rewrite to a CSQ on the filter
          // ignore SHOULD clause for now
          let builder = new BooleanQuery.Builder()
          for (const clause of clauses) {
            switch (clause.occur) {
              case Occur.FILTER:
              case Occur.MUST_NOT:
                builder.add(clause)
                break
              default:
                // ignore
                break
            }
          }
          let rewritten: Query = builder.build()
          rewritten = new ConstantScoreQuery(rewritten)
          if (boost !== 1) {
            rewritten = new BoostQuery(rewritten, boost)
          }

          // now add back the SHOULD clauses
          builder = new BooleanQuery.Builder().setMinimumNumberShouldMatch(minimumNumberShouldMatch).add(rewritten, Occur.MUST)
          for (const query of cs(Occur.SHOULD)) {
            builder.add(query, Occur.SHOULD)
          }
          rewritten = builder.build()
          return rewritten
        }
      }
    }

    // Flatten nested disjunctions, this is important for block-max WAND to perform well
    if (minimumNumberShouldMatch <= 1) {
      const builder = new BooleanQuery.Builder()
      builder.setMinimumNumberShouldMatch(minimumNumberShouldMatch)
      let actuallyRewritten = false
      for (const clause of clauses) {
        if (clause.occur === Occur.SHOULD && clause.query instanceof BooleanQuery) {
          const innerQuery = clause.query
          if (innerQuery.isPureDisjunction()) {
            actuallyRewritten = true
            for (const innerClause of innerQuery.clauses()) {
              builder.add(innerClause)
            }
          } else {
            builder.add(clause)
          }
        } else {
          builder.add(clause)
        }
      }
      if (actuallyRewritten) {
        return builder.build()
      }
    }

    // SHOULD clause count less than or equal to minimumNumberShouldMatch
    // Important(this can only be processed after nested clauses have been flattened)
    {
      const shoulds = cs(Occur.SHOULD)
      if (shoulds.length > 0) {
        if (shoulds.length < minimumNumberShouldMatch) {
          return new MatchNoDocsQuery('SHOULD clause count less than minimumNumberShouldMatch')
        }

        if (shoulds.length === minimumNumberShouldMatch) {
          const builder = new BooleanQuery.Builder()
          for (const clause of clauses) {
            if (clause.occur === Occur.SHOULD) {
              builder.add(clause.query, Occur.MUST)
            } else {
              builder.add(clause)
            }
          }

          return builder.build()
        }
      }
    }

    return super.rewrite(searcher)
  }

  createWeight(searcher: IndexSearcher, scoreMode: ScoreMode, boost: number): Weight {
    const Occur = BooleanClause.Occur
    const weighted = this.clausesL.map((c) => ({
      clause: c,
      weight: searcher.createWeight(c.query, c.isScoring() ? scoreMode : ScoreMode.COMPLETE_NO_SCORES, boost),
    }))
    const query = this
    return new (class extends Weight {
      scores(): Hits {
        let minShouldMatch = query.minimumNumberShouldMatch
        const scorers = new Map<BooleanClause.Occur, Hits[]>()
        for (const o of OCCURS) scorers.set(o, [])
        const sc = (o: BooleanClause.Occur) => scorers.get(o) as Hits[]
        for (const wc of weighted) {
          const subScorer = wc.weight.scores()
          // PORT: un scorer nul (terme absent) correspond à un ensemble vide
          if (subScorer.size === 0) {
            if (wc.clause.isRequired()) {
              return new Map()
            }
          } else {
            sc(wc.clause.occur).push(subScorer)
          }
        }

        // scorer simplifications:

        if (sc(Occur.SHOULD).length === minShouldMatch) {
          // any optional clauses are in fact required
          sc(Occur.MUST).push(...sc(Occur.SHOULD))
          scorers.set(Occur.SHOULD, [])
          minShouldMatch = 0
        }

        if (sc(Occur.FILTER).length === 0 && sc(Occur.MUST).length === 0 && sc(Occur.SHOULD).length === 0) {
          // no required and optional clauses.
          return new Map()
        } else if (sc(Occur.SHOULD).length < minShouldMatch) {
          return new Map()
        }

        if (needsScores(scoreMode) === false && minShouldMatch === 0 && sc(Occur.MUST).length + sc(Occur.FILTER).length > 0) {
          // Purely optional clauses are useless without scoring.
          scorers.set(Occur.SHOULD, [])
        }

        return boolean2Scores(sc(Occur.MUST), sc(Occur.FILTER), sc(Occur.SHOULD), sc(Occur.MUST_NOT), scoreMode, minShouldMatch)
      }
    })()
  }

  key(): string {
    // equals : minimumNumberShouldMatch et clauseSets (indépendant de l'ordre des clauses)
    const parts = OCCURS.map((o) => `${o}[${this.clauseSet(o).map((q) => q.key()).sort().join(',')}]`)
    return `BooleanQuery(${this.minimumNumberShouldMatch};${parts.join(';')})`
  }

  visitCount(): number {
    let n = 0
    for (const o of OCCURS) for (const q of this.clauseSet(o)) n += q.visitCount()
    return n
  }

  toString(field?: string | null): string {
    const parts = this.clausesL.map((c) => {
      const prefix = c.occur === BooleanClause.Occur.MUST ? '+' : c.occur === BooleanClause.Occur.MUST_NOT ? '-' : c.occur === BooleanClause.Occur.FILTER ? '#' : ''
      const sub = c.query instanceof BooleanQuery ? `(${c.query.toString(field)})` : c.query.toString(field)
      return prefix + sub
    })
    let s = parts.join(' ')
    if (this.minimumNumberShouldMatch > 0) s = `(${s})~${this.minimumNumberShouldMatch}`
    return s
  }
}

/** Boolean2ScorerSupplier.get : combinaison des ensembles de résultats */
function boolean2Scores(must: Hits[], filter: Hits[], should: Hits[], mustNot: Hits[], scoreMode: ScoreMode, minShouldMatch: number): Hits {
  const req = (): Hits => {
    if (filter.length + must.length === 1) {
      if (must.length === 1) return must[0] as Hits
      // Scores are needed but we only have a filter clause
      const m: Hits = new Map()
      for (const d of (filter[0] as Hits).keys()) m.set(d, 0)
      return m
    }
    const all = [...filter, ...must]
    let smallest = all[0] as Hits
    for (const h of all) if (h.size < smallest.size) smallest = h
    const m: Hits = new Map()
    outer: for (const d of smallest.keys()) {
      for (const h of all) if (!h.has(d)) continue outer
      let sum = 0
      for (const h of must) sum += h.get(d) as number
      m.set(d, f(sum))
    }
    return m
  }
  const excl = (main: Hits): Hits => {
    if (mustNot.length === 0) return main
    const m: Hits = new Map()
    outer: for (const [d, s] of main) {
      for (const h of mustNot) if (h.has(d)) continue outer
      m.set(d, s)
    }
    return m
  }
  const opt = (msm: number): Hits => {
    if (should.length === 1) return should[0] as Hits
    const count = new Map<number, number>()
    const sums = new Map<number, number>()
    for (const h of should)
      for (const [d, s] of h) {
        count.set(d, (count.get(d) ?? 0) + 1)
        sums.set(d, (sums.get(d) ?? 0) + s)
      }
    const m: Hits = new Map()
    for (const [d, c] of count) if (c >= Math.max(1, msm)) m.set(d, f(sums.get(d) as number))
    return m
  }

  let result: Hits
  if (should.length === 0) {
    // pure conjunction
    result = excl(req())
  } else if (filter.length === 0 && must.length === 0) {
    // pure disjunction
    result = excl(opt(minShouldMatch))
  } else if (minShouldMatch > 0) {
    const r = excl(req())
    const o = opt(minShouldMatch)
    result = new Map()
    for (const [d, s] of r) if (o.has(d)) result.set(d, f(s + (o.get(d) as number)))
  } else {
    // ReqOptSumScorer
    const r = excl(req())
    const o = opt(minShouldMatch)
    result = new Map()
    for (const [d, s] of r) {
      let score = s
      const os = o.get(d)
      if (os !== undefined) score = f(score + os)
      result.set(d, score)
    }
  }
  if (scoreMode === ScoreMode.TOP_SCORES && should.length === 0 && must.length === 0) {
    // no scoring clauses but scores are needed so we wrap the scorer in a constant score
    for (const d of result.keys()) result.set(d, 0)
  }
  return result
}

// ---------------------------------------------------------------------------
// PhraseQuery
// ---------------------------------------------------------------------------

export class PhraseQuery extends Query {
  constructor(
    readonly slop: number,
    readonly terms: readonly Term[],
    readonly positions: readonly number[],
  ) {
    super()
    if (terms.length !== positions.length) {
      throw new IllegalArgumentException('Must have as many terms as positions')
    }
    if (slop < 0) {
      throw new IllegalArgumentException(`Slop must be >= 0, got ${slop}`)
    }
    for (let i = 1; i < terms.length; ++i) {
      if ((terms[i - 1] as Term).field !== (terms[i] as Term).field) {
        throw new IllegalArgumentException('All terms should have the same field')
      }
    }
    for (const position of positions) {
      if (position < 0) {
        throw new IllegalArgumentException(`Positions must be >= 0, got ${positions}`)
      }
    }
    for (let i = 1; i < positions.length; ++i) {
      if ((positions[i] as number) < (positions[i - 1] as number)) {
        throw new IllegalArgumentException(`Positions should not go backwards, got ${positions[i - 1]} before ${positions[i]}`)
      }
    }
  }

  static Builder = class Builder {
    private slop = 0
    private readonly terms: Term[] = []
    private readonly positions: number[] = []

    setSlop(slop: number): this {
      this.slop = slop
      return this
    }

    add(term: Term, position: number = this.positions.length === 0 ? 0 : (this.positions[this.positions.length - 1] as number) + 1): this {
      if (position < 0) {
        throw new IllegalArgumentException(`Positions must be >= 0, got ${position}`)
      }
      if (this.positions.length !== 0) {
        const lastPosition = this.positions[this.positions.length - 1] as number
        if (position < lastPosition) {
          throw new IllegalArgumentException(`Positions must be added in order, got ${position} after ${lastPosition}`)
        }
      }
      if (this.terms.length !== 0 && term.field !== (this.terms[0] as Term).field) {
        throw new IllegalArgumentException(`All terms must be on the same field, got ${term.field} and ${(this.terms[0] as Term).field}`)
      }
      this.terms.push(term)
      this.positions.push(position)
      return this
    }

    build(): PhraseQuery {
      return new PhraseQuery(this.slop, [...this.terms], [...this.positions])
    }
  }

  getTerms(): Term[] {
    return [...this.terms]
  }

  getPositions(): number[] {
    return [...this.positions]
  }

  getSlop(): number {
    return this.slop
  }

  get field(): string | null {
    return this.terms.length === 0 ? null : (this.terms[0] as Term).field
  }

  rewrite(searcher: IndexSearcher): Query {
    if (this.terms.length === 0) {
      return new MatchNoDocsQuery('empty PhraseQuery')
    } else if (this.terms.length === 1) {
      return new TermQuery(this.terms[0] as Term)
    } else if (this.positions[0] !== 0) {
      const p0 = this.positions[0] as number
      return new PhraseQuery(
        this.slop,
        this.terms,
        this.positions.map((p) => p - p0),
      )
    } else {
      return super.rewrite(searcher)
    }
  }

  createWeight(searcher: IndexSearcher, scoreMode: ScoreMode, boost: number): Weight {
    const field = this.field as string
    const terms = this.terms
    const positions = this.positions
    const slop = this.slop
    const phrase = this
    // getStats
    const states = terms.map((t) => searcher.reader.termStates(t))
    let stats: { score(freq: number, norm: number): number } = { score: () => 1 }
    if (needsScores(scoreMode)) {
      const termStats: TermStatistics[] = []
      terms.forEach((t, i) => {
        const ts = states[i] as TermStates
        if (ts.docFreq > 0) termStats.push({ term: t.bytes, docFreq: ts.docFreq, totalTermFreq: ts.totalTermFreq })
      })
      if (termStats.length > 0) stats = searcher.similarity.scorer(boost, searcher.collectionStatistics(field) as CollectionStatistics, ...termStats)
    }
    return new (class extends Weight {
      scores(): Hits {
        const reader = searcher.reader
        const m: Hits = new Map()
        if (!reader.hasField(field)) return m
        if (reader.fieldIndexOptions(field) === 'DOCS') {
          throw new IllegalStateException(`field "${field}" was indexed without position data; cannot run PhraseQuery (phrase=${phrase.toString()})`)
        }
        // term doesnt exist in this segment
        if (states.some((s) => s.docFreq === 0)) return m
        const lists = terms.map((t) => reader.postings(field, t.bytes))
        let smallest = lists[0] as DocRecord[]
        for (const l of lists) if (l.length < smallest.length) smallest = l
        const sets = lists.map((l) => new Set(l.map((d) => d.id)))
        for (const d of smallest) {
          if (!sets.every((s) => s.has(d.id))) continue
          const fd = d.fields.get(field) as FieldData
          const pos = terms.map((t) => fd.terms.get(t.bytes) as number[])
          const freq = slop === 0 ? exactPhraseFreq(pos, positions) : sloppyPhraseFreq(pos, positions, terms, slop)
          if (freq === 0) continue
          m.set(d.id, stats.score(freq, fd.norm === -1 ? 1 : fd.norm))
        }
        return m
      }
    })()
  }

  key(): string {
    return `PhraseQuery(${this.slop};${JSON.stringify(this.terms.map((t) => [t.field, t.bytes]))};${this.positions.join(',')})`
  }

  toString(field?: string | null): string {
    const f0 = this.field
    let s = f0 !== null && f0 !== field ? `${f0}:` : ''
    s += `"${this.terms.map((t) => t.bytes).join(' ')}"`
    if (this.slop !== 0) s += `~${this.slop}`
    return s
  }
}

/** ExactPhraseMatcher : nombre de positions p telles que chaque terme i est en p + offset_i */
function exactPhraseFreq(pos: number[][], offsets: readonly number[]): number {
  const lead = pos[0] as number[]
  const offset0 = offsets[0] as number
  const sets = pos.map((p) => new Set(p))
  let freq = 0
  for (const p of lead) {
    const phrasePos = p - offset0
    let ok = true
    for (let j = 1; j < pos.length && ok; j++) if (!(sets[j] as Set<number>).has(phrasePos + (offsets[j] as number))) ok = false
    if (ok) freq = f(freq + 1)
  }
  return freq
}

/** PhrasePositions */
class PhrasePositions {
  position = 0 // position in doc
  count = 0 // remaining pos in this doc
  rptGroup = -1 // >=0 indicates that this is a repeating PP
  rptInd = 0 // index in the rptGroup
  private upTo = 0

  constructor(
    private readonly postings: number[],
    readonly offset: number, // position in phrase
    readonly ord: number, // unique across all PhrasePositions instances
    readonly term: Term, // for repetitions initialization
  ) {}

  firstPosition(): void {
    this.count = this.postings.length // read first pos
    this.upTo = 0
    this.nextPosition()
  }

  nextPosition(): boolean {
    if (this.count-- > 0) {
      // read subsequent pos's
      this.position = (this.postings[this.upTo++] as number) - this.offset
      return true
    } else {
      return false
    }
  }
}

/** PhraseQueue.lessThan */
function ppLessThan(pp1: PhrasePositions, pp2: PhrasePositions): boolean {
  if (pp1.position === pp2.position)
    if (pp1.offset === pp2.offset) {
      // same doc and pp.position, so decide by actual term positions.
      return pp1.ord < pp2.ord
    } else {
      return pp1.offset < pp2.offset
    }
  else {
    return pp1.position < pp2.position
  }
}

/** File de priorité (PhraseQueue) : l'ordre ppLessThan est total, la structure interne n'influe pas */
class PhraseQueue {
  private items: PhrasePositions[] = []
  add(pp: PhrasePositions): void {
    this.items.push(pp)
  }
  private minIndex(): number {
    let best = 0
    for (let i = 1; i < this.items.length; i++) if (ppLessThan(this.items[i] as PhrasePositions, this.items[best] as PhrasePositions)) best = i
    return best
  }
  top(): PhrasePositions {
    return this.items[this.minIndex()] as PhrasePositions
  }
  pop(): PhrasePositions {
    const i = this.minIndex()
    const pp = this.items[i] as PhrasePositions
    this.items.splice(i, 1)
    return pp
  }
  clear(): void {
    this.items = []
  }
  size(): number {
    return this.items.length
  }
}

/**
 * SloppyPhraseMatcher (sans les termes multiples par position, que PhraseQuery ne produit pas) : somme des
 * sloppyWeight = 1 / (1 + matchLength) des correspondances de longueur <= slop.
 */
function sloppyPhraseFreq(pos: number[][], offsets: readonly number[], terms: readonly Term[], slop: number): number {
  const phrasePositions = pos.map((p, i) => new PhrasePositions(p, offsets[i] as number, i, terms[i] as Term))
  const pq = new PhraseQueue()
  let end = 0
  let hasRpts = false
  let rptGroups: PhrasePositions[][] = []
  let rptStack: PhrasePositions[] = []

  const tpPos = (pp: PhrasePositions) => pp.position + pp.offset
  const advancePP = (pp: PhrasePositions): boolean => {
    if (!pp.nextPosition()) {
      return false
    }
    if (pp.position > end) {
      end = pp.position
    }
    return true
  }
  const lesser = (pp: PhrasePositions, pp2: PhrasePositions): PhrasePositions => {
    if (pp.position < pp2.position || (pp.position === pp2.position && pp.offset < pp2.offset)) {
      return pp
    }
    return pp2
  }
  const collide = (pp: PhrasePositions): number => {
    const t = tpPos(pp)
    const rg = rptGroups[pp.rptGroup] as PhrasePositions[]
    for (const pp2 of rg) {
      if (pp2 !== pp && tpPos(pp2) === t) {
        return pp2.rptInd
      }
    }
    return -1
  }
  const advanceRpts = (ppIn: PhrasePositions): boolean => {
    let pp = ppIn
    if (pp.rptGroup < 0) {
      return true // not a repeater
    }
    const rg = rptGroups[pp.rptGroup] as PhrasePositions[]
    const bits = new Set<number>() // for re-queuing after collisions are resolved
    const k0 = pp.rptInd
    let k: number
    while ((k = collide(pp)) >= 0) {
      pp = lesser(pp, rg[k] as PhrasePositions) // always advance the lesser of the (only) two colliding pps
      if (!advancePP(pp)) {
        return false // exhausted
      }
      if (k !== k0) {
        // careful: mark only those currently in the queue
        bits.add(k) // mark that pp2 need to be re-queued
      }
    }
    // collisions resolved, now re-queue
    // empty (partially) the queue until seeing all pps advanced for resolving collisions
    let n = 0
    while (bits.size > 0) {
      const pp2 = pq.pop()
      rptStack[n++] = pp2
      if (pp2.rptGroup >= 0 && bits.has(pp2.rptInd)) {
        bits.delete(pp2.rptInd)
      }
    }
    // add back to queue
    for (let i = n - 1; i >= 0; i--) {
      pq.add(rptStack[i] as PhrasePositions)
    }
    return true
  }
  const placeFirstPositions = () => {
    for (const pp of phrasePositions) pp.firstPosition()
  }
  const fillQueue = () => {
    pq.clear()
    for (const pp of phrasePositions) {
      if (pp.position > end) {
        end = pp.position
      }
      pq.add(pp)
    }
  }
  const advanceRepeatGroups = (): boolean => {
    for (const rg of rptGroups) {
      // simpler, we know exactly how much to advance
      for (let j = 1; j < rg.length; j++) {
        for (let k = 0; k < j; k++) {
          if (!(rg[j] as PhrasePositions).nextPosition()) {
            return false // PPs exhausted
          }
        }
      }
    }
    return true // PPs available
  }
  // initFirstTime (repetitions : même terme à plusieurs positions de la phrase)
  const initPhrasePositions = (): boolean => {
    end = -2147483648
    placeFirstPositions()
    const tcnt = new Map<string, number>()
    for (const pp of phrasePositions) tcnt.set(pp.term.bytes, (tcnt.get(pp.term.bytes) ?? 0) + 1)
    hasRpts = [...tcnt.values()].some((c) => c >= 2)
    if (hasRpts) {
      rptStack = new Array(phrasePositions.length)
      const rpp = phrasePositions.filter((pp) => (tcnt.get(pp.term.bytes) as number) >= 2)
      const res: PhrasePositions[][] = []
      for (let i = 0; i < rpp.length; i++) {
        const pp = rpp[i] as PhrasePositions
        if (pp.rptGroup >= 0) continue // already marked as a repetition
        const t = tpPos(pp)
        for (let j = i + 1; j < rpp.length; j++) {
          const pp2 = rpp[j] as PhrasePositions
          if (pp2.rptGroup >= 0 || pp2.offset === pp.offset || tpPos(pp2) !== t) {
            continue
          }
          // a repetition
          let g = pp.rptGroup
          if (g < 0) {
            g = res.length
            pp.rptGroup = g
            res.push([pp])
          }
          pp2.rptGroup = g
          ;(res[g] as PhrasePositions[]).push(pp2)
        }
      }
      rptGroups = res.map((rg) => [...rg].sort((a, b) => a.offset - b.offset))
      for (const rg of rptGroups) rg.forEach((pp, j) => (pp.rptInd = j))
      if (!advanceRepeatGroups()) {
        return false // PPs exhausted
      }
    }
    fillQueue()
    return true // PPs available
  }

  let positioned = initPhrasePositions()
  let matchLength = 2147483647
  let freq = 0

  const nextMatch = (): boolean => {
    if (!positioned) {
      return false
    }
    let pp = pq.pop()
    matchLength = end - pp.position
    let next = pq.top().position
    while (advancePP(pp)) {
      if (hasRpts && !advanceRpts(pp)) {
        break // pps exhausted
      }
      if (pp.position > next) {
        // done minimizing current match-length
        pq.add(pp)
        if (matchLength <= slop) {
          return true
        }
        pp = pq.pop()
        next = pq.top().position
        matchLength = end - pp.position
      } else {
        const matchLength2 = end - pp.position
        if (matchLength2 < matchLength) {
          matchLength = matchLength2
        }
      }
    }
    positioned = false
    return matchLength <= slop
  }

  while (nextMatch()) freq = f(freq + f(1 / f(1 + matchLength)))
  return freq
}

// ---------------------------------------------------------------------------
// MultiTermQuery
// ---------------------------------------------------------------------------

export abstract class MultiTermQuery extends Query {
  protected constructor(readonly field: string) {
    super()
  }

  /** Le terme est-il accepté par l'automate de la requête ? */
  abstract acceptsTerm(term: string): boolean

  /** CONSTANT_SCORE_BLENDED_REWRITE */
  rewrite(_searcher: IndexSearcher): Query {
    return new MultiTermQueryConstantScoreBlendedWrapper(this)
  }

  createWeight(searcher: IndexSearcher, scoreMode: ScoreMode, boost: number): Weight {
    return new MultiTermQueryConstantScoreBlendedWrapper(this).createWeight(searcher, scoreMode, boost)
  }
}

export class MultiTermQueryConstantScoreBlendedWrapper extends Query {
  constructor(readonly query: MultiTermQuery) {
    super()
  }

  createWeight(searcher: IndexSearcher, scoreMode: ScoreMode, boost: number): Weight {
    const query = this.query
    const score = needsScores(scoreMode) ? boost : 0
    return new (class extends Weight {
      scores(): Hits {
        const m: Hits = new Map()
        const reader = searcher.reader
        for (const term of reader.terms(query.field)) {
          if (!query.acceptsTerm(term)) continue
          for (const d of reader.postings(query.field, term)) m.set(d.id, score)
        }
        return m
      }
    })()
  }

  key(): string {
    return `MTQConstantScoreBlendedWrapper(${this.query.key()})`
  }

  toString(field?: string | null): string {
    return this.query.toString(field)
  }
}

function cpArray(s: string): number[] {
  return Array.from(s, (c) => c.codePointAt(0) as number)
}

/** WildcardQuery : `*` suite quelconque, `?` un point de code, `\` échappement */
export class WildcardQuery extends MultiTermQuery {
  static readonly WILDCARD_STRING = 0x2a
  static readonly WILDCARD_CHAR = 0x3f
  static readonly WILDCARD_ESCAPE = 0x5c

  private readonly pattern: ({ any: true } | { one: true } | { c: number })[]

  constructor(readonly term: Term) {
    super(term.field)
    // toAutomaton
    const pattern: ({ any: true } | { one: true } | { c: number })[] = []
    const cps = cpArray(term.text())
    for (let i = 0; i < cps.length; i++) {
      const c = cps[i] as number
      switch (c) {
        case WildcardQuery.WILDCARD_STRING:
          pattern.push({ any: true })
          break
        case WildcardQuery.WILDCARD_CHAR:
          pattern.push({ one: true })
          break
        case WildcardQuery.WILDCARD_ESCAPE:
          // add the next codepoint instead, if it exists
          if (i + 1 < cps.length) {
            pattern.push({ c: cps[++i] as number })
            break
          } // else fallthru, lenient parsing with a trailing \
          pattern.push({ c })
          break
        default:
          pattern.push({ c })
      }
    }
    this.pattern = pattern
  }

  acceptsTerm(term: string): boolean {
    const s = cpArray(term)
    const p = this.pattern
    // correspondance glob par programmation dynamique
    let cur = new Uint8Array(s.length + 1)
    cur[0] = 1
    for (const tok of p) {
      const next = new Uint8Array(s.length + 1)
      if ('any' in tok) {
        let reach = 0
        for (let j = 0; j <= s.length; j++) {
          if (cur[j]) reach = 1
          next[j] = reach
        }
      } else {
        for (let j = 0; j < s.length; j++) if (cur[j] && ('one' in tok || s[j] === tok.c)) next[j + 1] = 1
      }
      cur = next
    }
    return cur[s.length] === 1
  }

  key(): string {
    return `WildcardQuery(${JSON.stringify([this.term.field, this.term.bytes])})`
  }

  toString(field?: string | null): string {
    return (this.field !== field ? `${this.field}:` : '') + this.term.text()
  }
}

/** PrefixQuery (préfixe d'octets UTF-8 = préfixe de points de code) */
export class PrefixQuery extends MultiTermQuery {
  constructor(readonly prefix: Term) {
    super(prefix.field)
  }

  acceptsTerm(term: string): boolean {
    return term.startsWith(this.prefix.bytes)
  }

  key(): string {
    return `PrefixQuery(${JSON.stringify([this.prefix.field, this.prefix.bytes])})`
  }

  toString(field?: string | null): string {
    return (this.field !== field ? `${this.field}:` : '') + this.prefix.text() + '*'
  }
}

/** TermRangeQuery (bornes comparées dans l'ordre des octets UTF-8) */
export class TermRangeQuery extends MultiTermQuery {
  constructor(
    field: string,
    readonly lowerTerm: string | null,
    readonly upperTerm: string | null,
    readonly includeLower: boolean,
    readonly includeUpper: boolean,
  ) {
    super(field)
  }

  acceptsTerm(term: string): boolean {
    if (this.lowerTerm !== null) {
      const c = compareTerms(term, this.lowerTerm)
      if (c < 0 || (c === 0 && !this.includeLower)) return false
    }
    if (this.upperTerm !== null) {
      const c = compareTerms(term, this.upperTerm)
      if (c > 0 || (c === 0 && !this.includeUpper)) return false
    }
    return true
  }

  key(): string {
    return `TermRangeQuery(${JSON.stringify([this.field, this.lowerTerm, this.upperTerm, this.includeLower, this.includeUpper])})`
  }

  toString(field?: string | null): string {
    return `${this.field !== field ? `${this.field}:` : ''}${this.includeLower ? '[' : '{'}${this.lowerTerm ?? '*'} TO ${this.upperTerm ?? '*'}${this.includeUpper ? ']' : '}'}`
  }
}

/** RegexpQuery (RegExp.ALL) */
export class RegexpQuery extends MultiTermQuery {
  private readonly regexp: RegExp

  constructor(readonly term: Term) {
    super(term.field)
    this.regexp = new RegExp(term.text())
  }

  acceptsTerm(term: string): boolean {
    return this.regexp.run(term)
  }

  key(): string {
    return `RegexpQuery(${JSON.stringify([this.term.field, this.term.bytes])})`
  }

  toString(field?: string | null): string {
    return `${this.field !== field ? `${this.field}:` : ''}/${this.term.text()}/`
  }
}

/** Distance de Damerau-Levenshtein restreinte (LevenshteinAutomata avec transpositions) */
function editDistance(a: number[], b: number[], transpositions: boolean): number {
  const n = a.length
  const m = b.length
  const d: number[][] = []
  for (let i = 0; i <= n; i++) {
    d.push(new Array<number>(m + 1).fill(0))
    ;(d[i] as number[])[0] = i
  }
  for (let j = 0; j <= m; j++) (d[0] as number[])[j] = j
  for (let i = 1; i <= n; i++) {
    const row = d[i] as number[]
    const prev = d[i - 1] as number[]
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + cost)
      if (transpositions && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, ((d[i - 2] as number[])[j - 2] as number) + 1)
      row[j] = v
    }
  }
  return (d[n] as number[])[m] as number
}

export class FuzzyQuery extends MultiTermQuery {
  static readonly defaultMaxEdits = 2
  static readonly defaultPrefixLength = 0
  static readonly defaultMaxExpansions = 50
  static readonly defaultTranspositions = true
  static readonly MAXIMUM_SUPPORTED_DISTANCE = 2

  constructor(
    readonly term: Term,
    readonly maxEdits: number = FuzzyQuery.defaultMaxEdits,
    readonly prefixLength: number = FuzzyQuery.defaultPrefixLength,
    readonly maxExpansions: number = FuzzyQuery.defaultMaxExpansions,
    readonly transpositions: boolean = FuzzyQuery.defaultTranspositions,
  ) {
    super(term.field)
    if (maxEdits < 0 || maxEdits > FuzzyQuery.MAXIMUM_SUPPORTED_DISTANCE) {
      throw new IllegalArgumentException(`maxEdits must be between 0 and ${FuzzyQuery.MAXIMUM_SUPPORTED_DISTANCE}`)
    }
    if (prefixLength < 0) {
      throw new IllegalArgumentException('prefixLength cannot be negative.')
    }
    if (maxExpansions <= 0) {
      throw new IllegalArgumentException('maxExpansions must be positive.')
    }
  }

  /** Helper function to convert from "minimumSimilarity" fractions to raw edit distances. */
  static floatToEdits(minimumSimilarity: number, termLen: number): number {
    if (minimumSimilarity >= 1) {
      return Math.trunc(Math.min(minimumSimilarity, FuzzyQuery.MAXIMUM_SUPPORTED_DISTANCE))
    } else if (minimumSimilarity === 0) {
      return 0 // 0 means exact, not infinite # of edits!
    } else {
      return Math.min(Math.trunc((1 - minimumSimilarity) * termLen), FuzzyQuery.MAXIMUM_SUPPORTED_DISTANCE)
    }
  }

  /** Boost (similarité) du terme s'il est accepté, sinon null (FuzzyTermsEnum) */
  termBoost(candidate: string): number | null {
    const text = this.term.text()
    // getTermsEnum : SingleTermsEnum si maxEdits == 0 (boost par défaut 1)
    if (this.maxEdits === 0) return candidate === this.term.bytes ? 1 : null
    const q = cpArray(text)
    const t = cpArray(candidate)
    const prefixLength = Math.min(this.prefixLength, q.length)
    if (t.length < prefixLength) return null
    for (let i = 0; i < prefixLength; i++) if (t[i] !== q[i]) return null
    // la distance d'édition est au moins la différence de longueur
    if (Math.abs(t.length - q.length) > this.maxEdits) return null
    const ed = editDistance(q.slice(prefixLength), t.slice(prefixLength), this.transpositions)
    if (ed > this.maxEdits) return null
    if (ed === 0) return 1
    const minTermLength = Math.min(t.length, q.length)
    return f(1 - f(ed / minTermLength))
  }

  acceptsTerm(term: string): boolean {
    return this.termBoost(term) !== null
  }

  /** TopTermsBlendedFreqScoringRewrite(maxExpansions) */
  rewrite(searcher: IndexSearcher): Query {
    const maxSize = Math.min(this.maxExpansions, IndexSearcher.maxClauseCount)
    const candidates: { term: string; boost: number }[] = []
    for (const term of searcher.reader.terms(this.field)) {
      const boost = this.termBoost(term)
      if (boost !== null) candidates.push({ term, boost })
    }
    // meilleurs termes : boost décroissant, puis terme croissant
    candidates.sort((a, b) => (a.boost !== b.boost ? b.boost - a.boost : compareTerms(a.term, b.term)))
    const selected = candidates.slice(0, maxSize).sort((a, b) => compareTerms(a.term, b.term))
    const builder = new BlendedTermQuery.Builder()
    for (const st of selected) {
      const term = new Term(this.field, st.term)
      // We allow negative term scores (fuzzy query does this, for example) while collecting the terms,
      // but truncate such boosts to 0.0f when building the query:
      builder.add(term, Math.max(0, st.boost), searcher.reader.termStates(term))
    }
    return builder.build()
  }

  key(): string {
    return `FuzzyQuery(${JSON.stringify([this.term.field, this.term.bytes, this.maxEdits, this.prefixLength, this.maxExpansions, this.transpositions])})`
  }

  toString(field?: string | null): string {
    return `${this.field !== field ? `${this.field}:` : ''}${this.term.text()}~${this.maxEdits}`
  }
}

/** BlendedTermQuery avec BOOLEAN_REWRITE */
export class BlendedTermQuery extends Query {
  private constructor(
    private readonly terms: Term[],
    private readonly boosts: number[],
    private readonly contexts: TermStates[],
  ) {
    super()
  }

  static Builder = class Builder {
    private readonly terms: Term[] = []
    private readonly boosts: number[] = []
    private readonly contexts: TermStates[] = []

    add(term: Term, boost: number, context: TermStates): this {
      if (this.terms.length >= IndexSearcher.maxClauseCount) {
        throw new TooManyClauses()
      }
      this.terms.push(term)
      this.boosts.push(f(boost))
      this.contexts.push(context)
      return this
    }

    build(): BlendedTermQuery {
      return new BlendedTermQuery(this.terms, this.boosts, this.contexts)
    }
  }

  rewrite(_searcher: IndexSearcher): Query {
    // Compute aggregated doc freq and total term freq
    // df will be the max of all doc freqs
    // ttf will be the sum of all total term freqs
    let df = 0
    let ttf = 0
    for (const ctx of this.contexts) {
      df = Math.max(df, ctx.docFreq)
      ttf += ctx.totalTermFreq
    }

    const termQueries: Query[] = this.terms.map((t, i) => {
      let q: Query = new TermQuery(t, { docFreq: df, totalTermFreq: ttf })
      if (this.boosts[i] !== 1) {
        q = new BoostQuery(q, this.boosts[i] as number)
      }
      return q
    })
    // BOOLEAN_REWRITE
    const merged = new BooleanQuery.Builder()
    for (const query of termQueries) {
      merged.add(query, BooleanClause.Occur.SHOULD)
    }
    return merged.build()
  }

  createWeight(): Weight {
    throw new IllegalStateException('rewrite first')
  }

  key(): string {
    return `BlendedTermQuery(${JSON.stringify(this.terms.map((t, i) => [t.field, t.bytes, this.boosts[i]]))})`
  }

  toString(): string {
    return `Blended(${this.terms.map((t, i) => `${t.toString()}^${this.boosts[i]}`).join(' ')})`
  }
}

// ---------------------------------------------------------------------------
// IndexSearcher / TopDocs / SearcherManager
// ---------------------------------------------------------------------------

export class ScoreDoc {
  constructor(
    readonly doc: number,
    readonly score: number,
  ) {}
}

export class TopDocs {
  constructor(
    readonly totalHits: number,
    readonly scoreDocs: ScoreDoc[],
  ) {}
}

export class StoredFields {
  constructor(private readonly reader: IndexReader) {}

  document(docId: number) {
    return this.reader.document(docId)
  }
}

export class IndexSearcher {
  static maxClauseCount = 1024

  readonly similarity = new BM25Similarity()

  constructor(readonly reader: IndexReader) {}

  static getMaxClauseCount(): number {
    return IndexSearcher.maxClauseCount
  }

  getIndexReader(): IndexReader {
    return this.reader
  }

  storedFields(): StoredFields {
    return new StoredFields(this.reader)
  }

  collectionStatistics(field: string): CollectionStatistics | null {
    return this.reader.collectionStatistics(field)
  }

  /** Expert: called to re-write queries into primitive queries. */
  rewrite(original: Query): Query {
    let query = original
    for (let rewrittenQuery = query.rewrite(this); rewrittenQuery !== query; rewrittenQuery = query.rewrite(this)) {
      query = rewrittenQuery
    }
    // getNumClausesCheckVisitor : exception quand le nombre de feuilles dépasse maxClauseCount + 1
    if (query.visitCount() > IndexSearcher.maxClauseCount + 1) throw new TooManyNestedClauses()
    return query
  }

  createWeight(query: Query, scoreMode: ScoreMode, boost: number): Weight {
    return query.createWeight(this, scoreMode, boost)
  }

  /** Finds the top n hits for query. */
  search(query: Query, n: number): TopDocs {
    const rewritten = this.rewrite(query)
    const weight = this.createWeight(rewritten, ScoreMode.TOP_SCORES, 1)
    const hits = [...weight.scores()]
    hits.sort((a, b) => (a[1] !== b[1] ? b[1] - a[1] : a[0] - b[0]))
    return new TopDocs(
      hits.length,
      hits.slice(0, n).map(([doc, score]) => new ScoreDoc(doc, score)),
    )
  }
}

/** Factory class used by SearcherManager to create new IndexSearchers. */
export class SearcherFactory {
  newSearcher(reader: IndexReader, _previousReader: IndexReader | null): IndexSearcher {
    return new IndexSearcher(reader)
  }
}

/** Utility class to safely share IndexSearcher instances across multiple threads. */
export class SearcherManager {
  private current: IndexSearcher

  constructor(
    private readonly writer: IndexWriter,
    private readonly searcherFactory: SearcherFactory = new SearcherFactory(),
  ) {
    this.current = searcherFactory.newSearcher(writer.getReader(), null)
  }

  acquire(): IndexSearcher {
    return this.current
  }

  // PORT: pas de comptage de références (un seul fil d'exécution)
  release(_searcher: IndexSearcher): void {}

  maybeRefresh(): boolean {
    const reader = this.current.getIndexReader()
    if (reader.version !== this.writer.version || reader.maxDoc() !== this.writer.getReader().maxDoc()) {
      this.current = this.searcherFactory.newSearcher(this.writer.getReader(), reader)
    }
    return true
  }

  maybeRefreshBlocking(): void {
    this.maybeRefresh()
  }

  close(): void {}
}
