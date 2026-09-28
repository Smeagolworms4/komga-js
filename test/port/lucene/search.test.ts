// Test différentiel : résultats de recherche (identifiants, ordre, scores) du pipeline de LuceneHelper.searchEntitiesIds
// (MultiFieldQueryParser opérateur AND sur "<recherche> *:*", filtre sur le type, IndexSearcher.search(query, 1000))
// exécuté avec le vrai Lucene 9.9.1 et les analyseurs de Komga (tools/jshell-komga.sh), comparé au portage.
// fixtures/search-results.json.gz : corpus de documents (livres, séries, collections, listes de lecture, version
// d'index), suppressions/mises à jour, requêtes valides et invalides, résultats Java [id, bits du score float].
// Ce fichier n'a pas de jumeau Kotlin.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { MultiLingualAnalyzer } from '../../../src/infrastructure/search/MultiLingualAnalyzer.js'
import { MultiLingualNGramAnalyzer } from '../../../src/infrastructure/search/MultiLingualNGramAnalyzer.js'
import { Document, Field, StringField, Term, TextField } from '../../../src/port/lucene/document.js'
import { IndexWriter, IndexWriterConfig } from '../../../src/port/lucene/index.js'
import { MultiFieldQueryParser, ParseException, QueryParser } from '../../../src/port/lucene/queryparser.js'
import { BooleanClause, BooleanQuery, SearcherFactory, SearcherManager, TermQuery } from '../../../src/port/lucene/search.js'
import { ByteBuffersDirectory } from '../../../src/port/lucene/store.js'

type F = [string, string, string]
type Fixture = {
  corpus: { docs: F[][]; ops: (['d', string, string] | ['u', string, string, F[][]])[]; queries: string[] }
  results: { q: string; entity: string; status: 'ok' | 'parse' | 'error'; error?: string; hits?: [string, number][] }[]
}

const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/search-results.json.gz', import.meta.url))).toString('utf8')) as Fixture

function toDoc(d: F[]): Document {
  const doc = new Document()
  for (const [n, v, k] of d) {
    const st = k === 'T' || k === 'S' ? Field.Store.YES : Field.Store.NO
    doc.add(k.toLowerCase() === 't' ? new TextField(n, v, st) : new StringField(n, v, st))
  }
  return doc
}

const floatBits = (x: number) => {
  const b = new DataView(new ArrayBuffer(4))
  b.setFloat32(0, x)
  return b.getInt32(0)
}

const ENTITIES: Record<string, [string, string[]]> = {
  book: ['book_id', ['title', 'isbn']],
  series: ['series_id', ['title']],
  collection: ['collection_id', ['name']],
  readlist: ['readlist_id', ['name']],
}

describe('Lucene search (differential vs Lucene 9.9.1)', () => {
  it('returns the same ids, order and scores as Komga', () => {
    const w = new IndexWriter(new ByteBuffersDirectory(), new IndexWriterConfig(new MultiLingualNGramAnalyzer(3, 10, true)))
    w.addDocuments(fixture.corpus.docs.map(toDoc))
    for (const op of fixture.corpus.ops) {
      if (op[0] === 'd') w.deleteDocuments(new Term(op[1], op[2]))
      else w.updateDocument(new Term(op[1], op[2]), toDoc(op[3] as unknown as F[]))
    }
    w.commit()
    const sm = new SearcherManager(w, new SearcherFactory())
    const searchAnalyzer = new MultiLingualAnalyzer()

    const mismatches: string[] = []
    let scoreMismatches = 0
    const stats = { ok: 0, parse: 0, error: 0 }
    for (const r of fixture.results) {
      const [idField, fields] = ENTITIES[r.entity] as [string, string[]]
      let status: string
      let hits: [string, number][] = []
      let error = ''
      try {
        const p = new MultiFieldQueryParser(fields, searchAnalyzer)
        p.setDefaultOperator(QueryParser.Operator.AND)
        const fieldsQuery = p.parse(`${r.q} *:*`)
        const bq = new BooleanQuery.Builder().add(fieldsQuery, BooleanClause.Occur.MUST).add(new TermQuery(new Term('type', r.entity)), BooleanClause.Occur.MUST).build()
        const s = sm.acquire()
        const td = s.search(bq, 1000)
        hits = td.scoreDocs.map((sd) => [s.storedFields().document(sd.doc).get(idField) as string, floatBits(sd.score)])
        status = 'ok'
      } catch (e) {
        if (e instanceof ParseException) status = 'parse'
        else {
          status = 'error'
          error = (e as Error).constructor.name
        }
      }
      stats[status as keyof typeof stats]++
      const label = `${r.entity} ${JSON.stringify(r.q)}`
      if (status === 'error' && r.status === 'error' && error !== r.error) mismatches.push(`${label}: error ${error} != ${r.error}`)
      if (status !== r.status) {
        mismatches.push(`${label}: status ${status}${error ? `(${error})` : ''} != ${r.status}${r.error ? `(${r.error})` : ''}`)
        continue
      }
      if (status !== 'ok') continue
      const expected = r.hits as [string, number][]
      const ids = hits.map((h) => h[0])
      const expectedIds = expected.map((h) => h[0])
      if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) mismatches.push(`${label}: ids ${JSON.stringify(ids.slice(0, 10))}... != ${JSON.stringify(expectedIds.slice(0, 10))}... (${ids.length} vs ${expectedIds.length})`)
      else if (JSON.stringify(hits) !== JSON.stringify(expected)) scoreMismatches++
    }
    console.log(`searches: ${fixture.results.length}, ok ${stats.ok}, ParseException ${stats.parse}, other exceptions ${stats.error}, mismatches ${mismatches.length}, score mismatches ${scoreMismatches}`)
    expect(fixture.results.length).toBeGreaterThan(2000)
    expect(mismatches).toEqual([])
    expect(scoreMismatches).toBe(0)
    expect(stats.parse).toBeGreaterThan(0)
  }, 120_000)
})
