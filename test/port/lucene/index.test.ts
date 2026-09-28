// Tests du support Lucene : persistance du répertoire d'index (format KomgaJS), lecteur quasi temps réel,
// SearcherManager, DateTools. Ce fichier n'a pas de jumeau Kotlin.
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MultiLingualAnalyzer } from '../../../src/infrastructure/search/MultiLingualAnalyzer.js'
import { MultiLingualNGramAnalyzer } from '../../../src/infrastructure/search/MultiLingualNGramAnalyzer.js'
import { DateTools, Document, Field, StringField, Term, TextField } from '../../../src/port/lucene/document.js'
import { DirectoryReader, IndexNotFoundException, IndexUpgrader, IndexWriter, IndexWriterConfig, SmallFloat } from '../../../src/port/lucene/index.js'
import { QueryParser } from '../../../src/port/lucene/queryparser.js'
import { SearcherFactory, SearcherManager, TermQuery } from '../../../src/port/lucene/search.js'
import { ByteBuffersDirectory, FSDirectory, INDEX_FILE, LockObtainFailedException, SingleInstanceLockFactory } from '../../../src/port/lucene/store.js'

function doc(id: string, title: string): Document {
  const d = new Document()
  d.add(new TextField('title', title, Field.Store.NO))
  d.add(new StringField('type', 'book', Field.Store.NO))
  d.add(new StringField('book_id', id, Field.Store.YES))
  return d
}

function ids(sm: SearcherManager, term: Term): string[] {
  const s = sm.acquire()
  return s.search(new TermQuery(term), 100).scoreDocs.map((sd) => s.storedFields().document(sd.doc).get('book_id') as string)
}

const analyzer = () => new MultiLingualNGramAnalyzer(3, 10, true)

describe('Lucene index support', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), 'komgajs-lucene-'))
    dirs.push(d)
    return join(d, 'lucene')
  }

  it('reports no index before the first commit', () => {
    const dir = new ByteBuffersDirectory()
    expect(DirectoryReader.indexExists(dir)).toBe(false)
    const w = new IndexWriter(dir, new IndexWriterConfig(analyzer()))
    w.addDocument(doc('1', 'batman'))
    expect(DirectoryReader.indexExists(dir)).toBe(false)
    w.commit()
    expect(DirectoryReader.indexExists(dir)).toBe(true)
  })

  it('searcher sees changes only after refresh', () => {
    const w = new IndexWriter(new ByteBuffersDirectory(), new IndexWriterConfig(analyzer()))
    const sm = new SearcherManager(w, new SearcherFactory())
    w.addDocument(doc('1', 'batman'))
    expect(ids(sm, new Term('title', 'batman'))).toEqual([])
    sm.maybeRefresh()
    expect(ids(sm, new Term('title', 'batman'))).toEqual(['1'])
    const old = sm.acquire()
    w.updateDocument(new Term('book_id', '1'), doc('1', 'robin'))
    sm.maybeRefreshBlocking()
    expect(ids(sm, new Term('title', 'batman'))).toEqual([])
    expect(ids(sm, new Term('title', 'robin'))).toEqual(['1'])
    // l'ancien lecteur reste une vue figée
    expect(old.search(new TermQuery(new Term('title', 'batman')), 10).scoreDocs).toHaveLength(1)
  })

  it('persists commits on disk and reopens them', () => {
    const path = tmp()
    const dir = FSDirectory.open(path, new SingleInstanceLockFactory())
    expect(DirectoryReader.indexExists(dir)).toBe(false)
    const w = new IndexWriter(dir, new IndexWriterConfig(analyzer()))
    w.addDocuments([doc('1', 'batman returns'), doc('2', 'robin'), doc('3', 'batman begins')])
    w.commit()
    w.deleteDocuments(new Term('book_id', '2'))
    w.updateDocument(new Term('book_id', '3'), doc('3', 'joker'))
    w.commit()
    w.addDocument(doc('4', 'batman forever')) // non validé
    // comme Lucene : l'IndexWriter ouvert tient le verrou d'écriture du Directory
    expect(() => new IndexUpgrader(dir, new IndexWriterConfig(analyzer()), true).upgrade()).toThrow(LockObtainFailedException)
    expect(() => new IndexUpgrader(new ByteBuffersDirectory(), new IndexWriterConfig(analyzer()), true).upgrade()).toThrow(IndexNotFoundException)

    const dir2 = FSDirectory.open(path)
    expect(DirectoryReader.indexExists(dir2)).toBe(true)
    const w2 = new IndexWriter(dir2, new IndexWriterConfig(analyzer()))
    const sm = new SearcherManager(w2)
    expect(ids(sm, new Term('title', 'batman'))).toEqual(['1'])
    expect(ids(sm, new Term('title', 'bat'))).toEqual(['1'])
    expect(ids(sm, new Term('title', 'joker'))).toEqual(['3'])
    expect(ids(sm, new Term('type', 'book')).sort()).toEqual(['1', '3'])
  })

  it('ignores an interrupted commit and a foreign index', () => {
    const path = tmp()
    const w = new IndexWriter(FSDirectory.open(path), new IndexWriterConfig(analyzer()))
    w.addDocument(doc('1', 'batman'))
    w.commit()
    appendFileSync(join(path, INDEX_FILE), '{"ops":[["a",[["title","rob')
    const w2 = new IndexWriter(FSDirectory.open(path), new IndexWriterConfig(analyzer()))
    const sm = new SearcherManager(w2)
    expect(ids(sm, new Term('type', 'book'))).toEqual(['1'])
    // le fichier a été réécrit sans la ligne incomplète
    expect(readFileSync(join(path, INDEX_FILE), 'utf8').endsWith('\n')).toBe(true)

    const foreign = tmp()
    rmSync(foreign, { recursive: true, force: true })
    writeFileSync(`${foreign}.dummy`, '')
    expect(DirectoryReader.indexExists(FSDirectory.open(foreign))).toBe(false)
  })

  it('commits pending changes on close', () => {
    const path = tmp()
    const w = new IndexWriter(FSDirectory.open(path), new IndexWriterConfig(analyzer()))
    w.addDocument(doc('1', 'batman'))
    w.destroy()
    expect(w.isOpen()).toBe(false)
    const sm = new SearcherManager(new IndexWriter(FSDirectory.open(path), new IndexWriterConfig(analyzer())))
    expect(ids(sm, new Term('type', 'book'))).toEqual(['1'])
  })

  // recherches (identifiant, score) sur des requêtes de termes, de phrases, de préfixes et floues
  const QUERIES = ['batman', 'bat', 'robin', '"dark knight"', '"knight returns"~2', 'batm*', 'jokr~1', 'volume 7', 'volume', '1233']
  function results(sm: SearcherManager): string[][] {
    const s = sm.acquire()
    return QUERIES.map((q) =>
      s
        .search(new QueryParser('title', new MultiLingualAnalyzer()).parse(q), 10_000)
        .scoreDocs.map((sd) => `${s.storedFields().document(sd.doc).get('book_id')}:${sd.score}`),
    )
  }
  const TITLES = ['batman returns', 'the dark knight returns', 'robin and batman', 'joker', 'dark knight rises']
  const title = (i: number) => `${TITLES[i % TITLES.length]} volume ${i % 97} ${i}`

  it('keeps many postings per term and compacts deleted documents', () => {
    const path = tmp()
    const w = new IndexWriter(FSDirectory.open(path), new IndexWriterConfig(analyzer()))
    // 6 000 documents : longues listes de postings (tranches chaînées, plusieurs blocs) et un gros commit sur plusieurs lignes
    w.addDocuments(Array.from({ length: 6000 }, (_, i) => doc(String(i), title(i))))
    w.commit()
    const lines = readFileSync(join(path, INDEX_FILE), 'utf8').split('\n')
    expect(lines).toHaveLength(1 + 6 + 1)
    expect(lines.slice(1, 6).every((l) => l.endsWith(',"more":true}'))).toBe(true)
    // suppression des deux tiers : compactage au commit
    for (let i = 0; i < 6000; i++) if (i % 3 !== 0) w.deleteDocuments(new Term('book_id', String(i)))
    w.updateDocument(new Term('book_id', '3'), doc('3', 'batman begins'))
    w.commit()
    const sm = new SearcherManager(w)
    const got = results(sm)
    expect(got.map((r) => r.length)).toEqual([801, 801, 400, 800, 400, 801, 399, 1999, 1999, 1])
    expect(got[0]?.length).toBe(Array.from({ length: 6000 }, (_, i) => i).filter((i) => i % 3 === 0 && (i === 3 || title(i).includes('batman'))).length)

    // même index construit directement avec les seuls documents restants : mêmes résultats et scores
    const fresh = new IndexWriter(new ByteBuffersDirectory(), new IndexWriterConfig(analyzer()))
    for (let i = 0; i < 6000; i += 3) if (i !== 3) fresh.addDocument(doc(String(i), title(i)))
    fresh.addDocument(doc('3', 'batman begins'))
    expect(got).toEqual(results(new SearcherManager(fresh)))
    // index rouvert depuis le journal
    expect(results(new SearcherManager(new IndexWriter(FSDirectory.open(path), new IndexWriterConfig(analyzer()))))).toEqual(got)
  })

  it('ignores a commit whose lines were not all written', () => {
    const path = tmp()
    const w = new IndexWriter(FSDirectory.open(path), new IndexWriterConfig(analyzer()))
    w.addDocument(doc('a', 'batman'))
    w.commit()
    w.addDocuments(Array.from({ length: 2500 }, (_, i) => doc(String(i), title(i))))
    w.commit()
    // perte de la dernière ligne du commit
    const lines = readFileSync(join(path, INDEX_FILE), 'utf8').split('\n')
    writeFileSync(join(path, INDEX_FILE), `${lines.slice(0, -2).join('\n')}\n`)
    const sm = new SearcherManager(new IndexWriter(FSDirectory.open(path), new IndexWriterConfig(analyzer())))
    expect(ids(sm, new Term('type', 'book'))).toEqual(['a'])
    expect(readFileSync(join(path, INDEX_FILE), 'utf8').split('\n')).toHaveLength(3)
  })

  it('adds a block of documents all or nothing', () => {
    const w = new IndexWriter(new ByteBuffersDirectory(), new IndexWriterConfig(analyzer()))
    w.addDocument(doc('1', 'batman'))
    const immense = new Document()
    immense.add(new StringField('book_id', 'x'.repeat(40_000), Field.Store.YES))
    expect(() => w.addDocuments([doc('2', 'batman returns'), doc('3', 'batman begins'), immense])).toThrow(/immense term/)
    const sm = new SearcherManager(w)
    expect(ids(sm, new Term('title', 'batman'))).toEqual(['1'])
    expect(sm.acquire().getIndexReader().numDocs()).toBe(1)
    expect(sm.acquire().collectionStatistics('title')?.docCount).toBe(1)
  })

  it('encodes norms like SmallFloat', () => {
    expect(SmallFloat.intToByte4(0)).toBe(0)
    expect(SmallFloat.intToByte4(23)).toBe(23)
    expect(SmallFloat.byte4ToInt(SmallFloat.intToByte4(1000))).toBeLessThanOrEqual(1000)
    for (let i = 0; i < 256; i++) expect(SmallFloat.intToByte4(SmallFloat.byte4ToInt(i))).toBe(i)
  })

  it('formats years like DateTools', () => {
    expect(DateTools.dateToString(new Date(Date.UTC(2021, 0, 1)), DateTools.Resolution.YEAR)).toBe('2021')
    expect(DateTools.dateToString(new Date(Date.UTC(999, 5, 1)), DateTools.Resolution.YEAR)).toBe('0999')
  })
})
