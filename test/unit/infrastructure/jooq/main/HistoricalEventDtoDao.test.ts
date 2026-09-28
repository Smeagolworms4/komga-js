// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/HistoricalEventDtoDaoOracleTest.kt
import { Direction, Order, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'

const { func, kase } = oracle('infrastructure/jooq/main/HistoricalEventDtoDao')

const db = new OracleDb()
const dao = db.historicalEventDtoDao

func('findAll', () => {
  kase('empty', () => dao.findAll(Pageable.unpaged()))
  kase('unpaged sorted by timestamp', () => {
    for (const s of [
      "insert into HISTORICAL_EVENT (ID, TYPE, BOOK_ID, SERIES_ID, TIMESTAMP) values ('E1', 'BookFileDeleted', 'B1', 'S1', '2021-01-01 10:00:00')",
      "insert into HISTORICAL_EVENT (ID, TYPE, BOOK_ID, SERIES_ID, TIMESTAMP) values ('E2', 'SeriesFolderDeleted', null, 'S2', '2021-03-01 10:00:00.123')",
      "insert into HISTORICAL_EVENT (ID, TYPE, BOOK_ID, SERIES_ID, TIMESTAMP) values ('E3', 'BookConverted', 'B3', 'S1', '2020-12-31 23:59:59')",
      "insert into HISTORICAL_EVENT (ID, TYPE, BOOK_ID, SERIES_ID, TIMESTAMP) values ('E4', 'DuplicatePageDeleted', 'B4', null, '2021-02-01 00:00:00')",
      "insert into HISTORICAL_EVENT_PROPERTIES (ID, KEY, VALUE) values ('E1', 'reason', 'Deleted')",
      "insert into HISTORICAL_EVENT_PROPERTIES (ID, KEY, VALUE) values ('E1', 'name', '/lib1/Batman 001.cbz')",
      "insert into HISTORICAL_EVENT_PROPERTIES (ID, KEY, VALUE) values ('E3', 'former file', 'é.cbr')",
      "insert into HISTORICAL_EVENT_PROPERTIES (ID, KEY, VALUE) values ('E4', 'page number', '3')",
    ])
      db.dsl.execute(s)
    return dao.findAll(Pageable.unpaged(Sort.by('timestamp')))
  })
  kase('paged descending', () => dao.findAll(PageRequest.of(1, 2, Sort.by(Direction.DESC, 'timestamp'))))
  kase('sorted by type', () => dao.findAll(PageRequest.of(0, 10, Sort.by('type'))).content.map((it) => it.id))
  kase('sorted by book then series', () =>
    dao.findAll(PageRequest.of(0, 10, Sort.by([Order.desc('bookId'), Order.asc('seriesId')]))).content.map((it) => it.id),
  )
  kase('unknown sort', () => {
    const it = dao.findAll(PageRequest.of(0, 1, Sort.by('nope')))
    return [it.totalElements, it.size, it.sort.isSorted]
  })
  kase('unpaged unsorted', () => {
    const it = dao.findAll(Pageable.unpaged())
    return [it.content.map((e) => e.id).sort(), it.totalElements, it.size]
  })
})
