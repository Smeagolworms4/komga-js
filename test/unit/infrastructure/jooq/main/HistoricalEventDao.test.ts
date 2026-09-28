// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/HistoricalEventDaoOracleTest.kt
import { HistoricalEvent } from '../../../../../src/domain/model/HistoricalEvent.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { book, series } from './seed.js'

const { func, kase } = oracle('infrastructure/jooq/main/HistoricalEventDao')

const db = new OracleDb()
const dao = db.historicalEventDao

const events = () => stable(db.rawQuery('select ID, TYPE, BOOK_ID, SERIES_ID, TIMESTAMP is not null from HISTORICAL_EVENT order by TYPE, BOOK_ID, SERIES_ID'))

const properties = () =>
  db.rawQuery('select e.TYPE, p.KEY, p.VALUE from HISTORICAL_EVENT_PROPERTIES p join HISTORICAL_EVENT e on e.ID = p.ID order by e.TYPE, p.KEY, p.VALUE')

func('insert', () => {
  kase('book file deleted', () => {
    dao.insert(new HistoricalEvent.BookFileDeleted({ book: book('B1', 'S1', 'L1'), reason: 'File was removed' }))
    return [events(), properties()]
  })
  kase('series folder deleted with unicode path', () => {
    dao.insert(new HistoricalEvent.SeriesFolderDeleted({ seriesId: 'S2', seriesPath: '/données/漫画 série', reason: 'Folder was removed' }))
    return [events(), properties()]
  })
  kase('series folder deleted from series', () => {
    dao.insert(new HistoricalEvent.SeriesFolderDeleted({ series: series('S3', 'L1', 'Ünïcode'), reason: '' }))
    return properties()
  })
  kase('book imported', () => {
    dao.insert(new HistoricalEvent.BookImported({ book: book('B2', 'S1', 'L1'), series: series('S1', 'L1'), source: '/import/B2.cbz', upgrade: true }))
    dao.insert(new HistoricalEvent.BookImported({ book: book('B3', 'S1', 'L1', { ext: 'epub' }), series: series('S1', 'L1'), source: '/import/B3.epub', upgrade: false }))
    return [events(), properties()]
  })
  kase('book converted', () => {
    dao.insert(new HistoricalEvent.BookConverted({ book: book('B4', 'S1', 'L1', { ext: 'cbz' }), previous: book('B4', 'S1', 'L1', { ext: 'zip' }) }))
    return properties().filter((it) => it[0] === 'BookConverted')
  })
  kase('same event twice', () => {
    const event = new HistoricalEvent.BookFileDeleted({ book: book('B9', 'S9', 'L9'), reason: 'twice' })
    dao.insert(event)
    return exceptionType(() => dao.insert(event))
  })
  kase('counts', () => db.rawQuery('select (select count(*) from HISTORICAL_EVENT), (select count(*) from HISTORICAL_EVENT_PROPERTIES)'))
})
