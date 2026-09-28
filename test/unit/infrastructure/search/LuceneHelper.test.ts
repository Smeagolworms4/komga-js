// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/search/LuceneHelperOracleTest.kt
import { LuceneEntity, toDocument } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { Document, Field, StringField, Term } from '../../../../src/port/lucene/document.js'
import { exceptionType, oracle } from '../../oracle.js'
import { Index, books, collections, readLists, series } from './searchSamples.js'

const { func, kase } = oracle('infrastructure/search/LuceneHelper')

const corpus = (): Document[] => [...books.map(toDocument), ...series.map(toDocument), ...collections.map(toDocument), ...readLists.map(toDocument)]

function indexed(): Index {
  const index = new Index()
  index.helper.addDocuments(corpus())
  return index
}

function versionDoc(v: string): Document {
  const doc = new Document()
  doc.add(new StringField('index_version', v, Field.Store.YES))
  doc.add(new StringField('type', 'index_version', Field.Store.NO))
  return doc
}

function run<R>(index: Index, block: (index: Index) => void, result: (index: Index) => R): R {
  block(index)
  return result(index)
}

func('indexExists', () => {
  kase('new directory', () => new Index().helper.indexExists())
  kase('after setIndexVersion', () => run(new Index(), (it) => it.helper.setIndexVersion(1), (it) => it.helper.indexExists()))
  kase('after addDocuments', () => indexed().helper.indexExists())
  kase('after addDocuments of nothing', () => run(new Index(), (it) => it.helper.addDocuments([]), (it) => it.helper.indexExists()))
})

func('setIndexVersion', () => {
  for (const v of [1, 8, 0, -1, 2147483647]) kase(`${v}`, () => run(new Index(), (it) => it.helper.setIndexVersion(v), (it) => it.helper.getIndexVersion()))
  kase('twice', () =>
    run(
      new Index(),
      (it) => {
        it.helper.setIndexVersion(3)
        it.helper.setIndexVersion(5)
      },
      (it) => it.helper.getIndexVersion(),
    ),
  )
  kase('with documents', () => run(indexed(), (it) => it.helper.setIndexVersion(8), (it) => [it.helper.getIndexVersion(), it.searchAll()]))
})

func('getIndexVersion', () => {
  kase('empty index', () => new Index().helper.getIndexVersion())
  for (const v of ['abc', ' 7', '+7', '-3', '99999999999', '', '007']) {
    kase(`stored '${v}'`, () => run(new Index(), (it) => it.helper.updateDocument(new Term('type', 'index_version'), versionDoc(v)), (it) => it.helper.getIndexVersion()))
  }
})

func('searchEntitiesIds', () => {
  kase('empty index', () => new Index().searchAll())
  kase('corpus', () => indexed().searchAll())
})

func('upgradeIndex', () => {
  kase('corpus: the IndexWriter holds the lock', async () => {
    const it = indexed()
    return [await exceptionType(() => it.helper.upgradeIndex()), it.helper.indexExists(), it.searchAll([LuceneEntity.Book])]
  })
  kase('empty directory', () => exceptionType(() => new Index().helper.upgradeIndex()))
})

func('addDocument', () => {
  kase('one by one', () => {
    const index = new Index()
    return corpus()
      .slice(0, 3)
      .map((d) => {
        index.helper.addDocument(d)
        return index.searchAll([LuceneEntity.Book])
      })
  })
  kase('same document twice', () =>
    run(
      new Index(),
      (it) => {
        it.helper.addDocument(toDocument(books[0]!))
        it.helper.addDocument(toDocument(books[0]!))
      },
      (it) => it.searchAll([LuceneEntity.Book]),
    ),
  )
  kase('empty document', () => run(new Index(), (it) => it.helper.addDocument(new Document()), (it) => [it.helper.indexExists(), it.searchAll([LuceneEntity.Book])]))
})

func('addDocuments', () => {
  kase('corpus', () => indexed().searchAll([LuceneEntity.Series, LuceneEntity.Collection]))
  kase('in two batches', () =>
    run(
      new Index(),
      (it) => {
        it.helper.addDocuments(corpus().slice(0, 8))
        it.helper.addDocuments(corpus().slice(8))
      },
      (it) => it.searchAll(),
    ),
  )
})

func('updateDocument', () => {
  kase('replace a book', () => run(indexed(), (it) => it.helper.updateDocument(new Term('book_id', 'B1'), toDocument(books[1]!)), (it) => it.searchAllSorted([LuceneEntity.Book])))
  kase('unknown term adds', () => run(indexed(), (it) => it.helper.updateDocument(new Term('book_id', 'none'), toDocument(series[0]!)), (it) => it.searchAllSorted([LuceneEntity.Series])))
  kase('term matching several documents', () =>
    run(indexed(), (it) => it.helper.updateDocument(new Term('type', 'book'), toDocument(books[3]!)), (it) => it.searchAllSorted([LuceneEntity.Book])),
  )
})

func('deleteDocuments', () => {
  kase('one book', () => run(indexed(), (it) => it.helper.deleteDocuments(new Term('book_id', 'B1')), (it) => it.searchAllSorted([LuceneEntity.Book])))
  kase('all series', () => run(indexed(), (it) => it.helper.deleteDocuments(new Term('type', 'series')), (it) => it.searchAllSorted([LuceneEntity.Series, LuceneEntity.Book])))
  kase('unknown term', () => run(indexed(), (it) => it.helper.deleteDocuments(new Term('nothing', 'x')), (it) => it.searchAllSorted([LuceneEntity.ReadList])))
  kase('tokenized field term', () =>
    run(indexed(), (it) => it.helper.deleteDocuments(new Term('title', 'batman')), (it) => it.searchAllSorted([LuceneEntity.Book, LuceneEntity.Series])),
  )
})
