// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/BookMetadataAggregationDaoOracleTest.kt
import { LocalDate } from '@js-joda/core'
import { Author } from '../../../../../src/domain/model/Author.js'
import { BookMetadataAggregation } from '../../../../../src/domain/model/BookMetadataAggregation.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { library, series, sql } from './seed.js'

const { func, kase } = oracle('infrastructure/jooq/main/BookMetadataAggregationDao')

const db = new OracleDb()
const dao = db.bookMetadataAggregationDao

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const author = (name: string, role: string) => new Author({ name, role })

const full = new BookMetadataAggregation({
  authors: [author('  Jean Dupont ', ' WRITER '), author('Émilie Ünïcode', 'penciller'), author('漫画家', 'writer'), author('Jean Dupont', 'writer'), author('', '')],
  tags: new Set(['zeta', 'Alpha', 'ünïcode', '漫画', '']),
  releaseDate: LocalDate.of(1999, 12, 31),
  summary: 'Un résumé\nsur deux lignes',
  summaryNumber: '3',
  seriesId: 'S2',
})

const rows = (table: string) => db.rawQuery(`select * from ${table} order by SERIES_ID, rowid`)

func('count', () => {
  kase('empty', () => dao.count())
})

func('insert', () => {
  kase('defaults', () => {
    db.libraryDao.insert(library('L1'))
    range(1, 6).forEach((it) => db.seriesDao.insert(series(`S${it}`, 'L1')))
    db.seriesDao.insert(series('BIG', 'L1'))
    dao.insert(new BookMetadataAggregation({ seriesId: 'S1' }))
    return stable(dao.findById('S1'))
  })
  kase('all fields', () => {
    dao.insert(full)
    return stable(dao.findById('S2'))
  })
  kase('duplicate series', () => exceptionType(() => dao.insert(new BookMetadataAggregation({ seriesId: 'S1' }))))
  kase('unknown series', () => exceptionType(() => dao.insert(new BookMetadataAggregation({ seriesId: 'NOPE' }))))
  kase('more authors and tags than batch size', () => {
    dao.insert(
      new BookMetadataAggregation({
        authors: range(1, 1234).map((it) => author(`author ${it}`, it % 2 === 0 ? 'writer' : 'colorist')),
        tags: new Set(range(1, 1100).map((it) => `tag ${it}`)),
        seriesId: 'BIG',
      }),
    )
    const it = dao.findById('BIG')
    return [it.authors.length, it.tags.size, it.authors[it.authors.length - 1]!.name, [...it.tags][0]]
  })
  kase('stored values', () => {
    sql(db, "update BOOK_METADATA_AGGREGATION set CREATED_DATE = '2020-05-01 10:00:00', LAST_MODIFIED_DATE = '2020-05-02 11:30:00'")
    return db.rawQuery("select * from BOOK_METADATA_AGGREGATION where SERIES_ID <> 'BIG' order by SERIES_ID")
  })
})

func('insertAuthors', () => {
  kase('rows', () => rows("BOOK_METADATA_AGGREGATION_AUTHOR where SERIES_ID <> 'BIG'"))
  kase('no author', () => db.rawQuery("select count(*) from BOOK_METADATA_AGGREGATION_AUTHOR where SERIES_ID = 'S1'"))
})

func('insertTags', () => {
  kase('rows', () => rows("BOOK_METADATA_AGGREGATION_TAG where SERIES_ID <> 'BIG'"))
})

func('findById', () => {
  kase('existing', () => dao.findById('S2'))
  kase('missing', () => dao.findById('NOPE'))
})

func('findByIdOrNull', () => {
  kase('existing', () => dao.findByIdOrNull('S1'))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
  kase('series without aggregation', () => dao.findByIdOrNull('S3'))
  kase('empty id', () => dao.findByIdOrNull(''))
})

func('findOne', () => {
  kase('authors keep insertion order and duplicates', () => dao.findById('S2').authors.map((it) => [it.name, it.role]))
  kase('authors orphan rows are ignored', () => {
    sql(db, "insert into BOOK_METADATA_AGGREGATION_AUTHOR (NAME, ROLE, SERIES_ID) values ('orphan', 'writer', 'S3')")
    return dao.findByIdOrNull('S3')
  })
})

func('findTags', () => {
  kase('tags', () => dao.findById('S2').tags)
  kase('no tag', () => dao.findById('S1').tags)
  kase('orphan tags are read', () => {
    sql(db, "insert into BOOK_METADATA_AGGREGATION_TAG (TAG, SERIES_ID) values ('Mixed CASE', 'S1')")
    return dao.findById('S1').tags
  })
})

func('toDomain@147', () => {
  kase('dates in current time zone', () => {
    const it = dao.findById('S2')
    return [it.createdDate, it.lastModifiedDate, it.releaseDate]
  })
})

func('toDomain@161', () => {
  kase('author trimmed and lowercased', () => {
    const it = dao.findById('S2').authors[0]!
    return [it.name, it.role]
  })
  kase('stored raw author', () => {
    sql(db, "insert into BOOK_METADATA_AGGREGATION_AUTHOR (NAME, ROLE, SERIES_ID) values ('  Raw  ', ' INKER ', 'S1')")
    return dao.findById('S1').authors.map((it) => [it.name, it.role])
  })
})

func('update', () => {
  kase('all fields', () => {
    dao.update(full.copy({ authors: [author('Nouvel Auteur', 'Editor')], tags: new Set(['new']), releaseDate: null, summary: '', summaryNumber: '' }))
    return stable(dao.findById('S2'))
  })
  kase('remove authors and tags', () => {
    dao.update(dao.findById('S2').copy({ authors: [], tags: new Set(), releaseDate: LocalDate.of(2024, 2, 29) }))
    return stable(dao.findById('S2'))
  })
  kase('missing aggregation', () => {
    dao.update(new BookMetadataAggregation({ seriesId: 'S4', summary: 'x' }))
    return dao.findByIdOrNull('S4')
  })
  kase('missing aggregation with authors', () =>
    exceptionType(() => dao.update(new BookMetadataAggregation({ authors: [author('a', 'b')], seriesId: 'NOPE' }))),
  )
  kase('stored values', () =>
    db.rawQuery("select SERIES_ID, RELEASE_DATE, SUMMARY, SUMMARY_NUMBER, CREATED_DATE, LAST_MODIFIED_DATE > '2021' from BOOK_METADATA_AGGREGATION where SERIES_ID = 'S2'"),
  )
})

func('delete@130', () => {
  kase('existing', () => {
    dao.insert(full.copy({ seriesId: 'S5' }))
    dao.delete('S5')
    return [dao.findByIdOrNull('S5'), db.rawQuery("select count(*) from BOOK_METADATA_AGGREGATION_AUTHOR where SERIES_ID = 'S5'")]
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return dao.count()
  })
})

func('delete@137', () => {
  kase('empty', () => {
    dao.delete([])
    return dao.count()
  })
  kase('several', () => {
    dao.insert(full.copy({ seriesId: 'S5' }))
    dao.insert(full.copy({ seriesId: 'S6' }))
    dao.delete(['S5', 'NOPE', 'S6', 'S5'])
    return [dao.count(), db.rawQuery('select SERIES_ID, count(*) from BOOK_METADATA_AGGREGATION_TAG group by SERIES_ID order by SERIES_ID')]
  })
  kase('more than batch size', () => {
    dao.delete([...range(1, 1500).map((it) => `X${it}`), 'BIG', 'S1'])
    return [
      dao.count(),
      db.rawQuery('select SERIES_ID, count(*) from BOOK_METADATA_AGGREGATION_AUTHOR group by SERIES_ID order by SERIES_ID'),
      db.rawQuery('select SERIES_ID, count(*) from BOOK_METADATA_AGGREGATION_TAG group by SERIES_ID order by SERIES_ID'),
    ]
  })
})

func('count', () => {
  kase('after deletions', () => dao.count())
})
