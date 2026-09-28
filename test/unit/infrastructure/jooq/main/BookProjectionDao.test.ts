// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/BookProjectionDaoOracleTest.kt
import { BookProjection } from '../../../../../src/domain/model/BookProjection.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle } from '../../../oracle.js'
import { book, library, series } from './seed.js'

const { func, kase } = oracle('infrastructure/jooq/main/BookProjectionDao')

const db = new OracleDb()
const dao = db.bookProjectionDao

const rows = () =>
  db.rawQuery('select BOOK_ID, PROFILE, FILE_SIZE, CREATED_DATE is not null, LAST_MODIFIED_DATE is not null from BOOK_PROJECTION order by BOOK_ID, PROFILE')
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

func('save', () => {
  kase('new projection', () => {
    db.libraryDao.insert(library('L1'))
    db.seriesDao.insert(series('S1', 'L1'))
    db.bookDao.insert(range(1, 5).map((it) => book(`B${it}`, 'S1', 'L1')))
    dao.save(new BookProjection({ bookId: 'B1', profile: 'epub-kepub', fileSize: 1234 }))
    return rows()
  })
  kase('same key keeps the stored file size', () => {
    dao.save(new BookProjection({ bookId: 'B1', profile: 'epub-kepub', fileSize: 999 }))
    return rows()
  })
  kase('other profile', () => {
    dao.save(new BookProjection({ bookId: 'B1', profile: 'Ünïcode 漫画', fileSize: 0 }))
    return rows()
  })
  kase('large file size', () => {
    dao.save(new BookProjection({ bookId: 'B2', profile: 'epub-kepub', fileSize: 5_000_000_000 }))
    return rows()
  })
  kase('negative file size', () => {
    dao.save(new BookProjection({ bookId: 'B3', profile: '', fileSize: -1 }))
    return rows()
  })
  kase('unknown book', () => exceptionType(() => dao.save(new BookProjection({ bookId: 'NOPE', profile: 'epub-kepub', fileSize: 1 }))))
})

func('delete@35', () => {
  kase('existing', () => {
    dao.delete('B3')
    return rows()
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return rows().length
  })
  kase('all profiles of the book', () => {
    dao.delete('B1')
    return rows()
  })
})

func('delete@40', () => {
  kase('empty', () => {
    dao.save(new BookProjection({ bookId: 'B1', profile: 'a', fileSize: 1 }))
    dao.save(new BookProjection({ bookId: 'B4', profile: 'a', fileSize: 4 }))
    dao.save(new BookProjection({ bookId: 'B5', profile: 'a', fileSize: 5 }))
    dao.delete([])
    return rows().length
  })
  kase('several with missing', () => {
    dao.delete(['B2', 'NOPE', 'B2'])
    return rows()
  })
  kase('more than batch size', () => {
    dao.delete([...range(1, 2500).map((it) => `X${it}`), 'B4', ...range(2501, 3000).map((it) => `X${it}`)])
    return rows()
  })
  kase('set', () => {
    dao.delete(new Set(['B1', 'B5']))
    return rows()
  })
})
