// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/ReadListMatcherOracleTest.kt
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { ReadListRequest, ReadListRequestBook } from '../../../../src/domain/model/ReadListRequest.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { ReadListMatcher } from '../../../../src/domain/service/ReadListMatcher.js'
import { sortedMapOf } from '../../../../src/port/extra-metadata.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { book, date, library, metadata, series } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/ReadListMatcher')

const db = new OracleDb()
const matcher = new ReadListMatcher(db.readListDao, db.readListRequestDao)
const req = (s: string[], number: string) => new ReadListRequestBook({ series: new Set(s), number })

func('matchReadListRequest', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1'))
    db.seriesDao.insert(series('S1', 'L1'))
    db.seriesMetadataDao.insert(new SeriesMetadata({ title: 'Batman', seriesId: 'S1', createdDate: date }))
    db.seriesDao.insert(series('S2', 'L1'))
    db.seriesMetadataDao.insert(new SeriesMetadata({ title: 'Robin', seriesId: 'S2', createdDate: date }))
    for (const it of [book('B1', 'S1', 'L1', undefined, undefined, 1), book('B2', 'S1', 'L1', undefined, undefined, 2), book('B3', 'S2', 'L1', undefined, undefined, 1)]) {
      db.bookDao.insert(it)
      db.bookMetadataDao.insert(metadata(it))
    }
    db.readListDao.insert(new ReadList({ name: 'Existing', bookIds: sortedMapOf<number, string>([0, 'B1']), id: 'RL1', createdDate: date }))
    return db.bookDao.count()
  })
  kase('new name, no books', () => matcher.matchReadListRequest(new ReadListRequest({ name: 'New', books: [] })))
  kase('existing name', () => matcher.matchReadListRequest(new ReadListRequest({ name: 'Existing', books: [] })))
  kase('existing name other case', () => matcher.matchReadListRequest(new ReadListRequest({ name: 'existing', books: [] })))
  kase('books matched', () =>
    matcher.matchReadListRequest(
      new ReadListRequest({
        name: 'List',
        books: [req(['Batman'], '1'), req(['Robin', 'Batman'], '1'), req(['batman'], '2'), req(['Unknown'], '1'), req(['Batman'], '9'), req([], '1')],
      }),
    ),
  )
})
