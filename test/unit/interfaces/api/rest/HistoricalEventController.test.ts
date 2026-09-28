// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/HistoricalEventControllerOracleTest.kt
import { HistoricalEventController } from '../../../../../src/interfaces/api/rest/HistoricalEventController.js'
import { Order, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { sql } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/HistoricalEventController')

const db = new OracleDb()
const controller = new HistoricalEventController(db.historicalEventDtoDao)

func('getHistoricalEvents', () => {
  kase('empty', () => controller.getHistoricalEvents(PageRequest.of(0, 20)))
  kase('default sort is timestamp desc', () => {
    sql(
      db,
      "INSERT INTO HISTORICAL_EVENT (ID, TYPE, BOOK_ID, SERIES_ID, TIMESTAMP) VALUES ('E1', 'BookFileDeleted', 'B1', 'S1', '2020-01-01 10:00:00.0')",
      "INSERT INTO HISTORICAL_EVENT (ID, TYPE, BOOK_ID, SERIES_ID, TIMESTAMP) VALUES ('E2', 'SeriesFolderDeleted', NULL, 'S2', '2021-06-01 10:00:00.0')",
      "INSERT INTO HISTORICAL_EVENT (ID, TYPE, BOOK_ID, SERIES_ID, TIMESTAMP) VALUES ('E3', 'BookImported', 'B3', 'S1', '2019-12-31 23:59:59.5')",
      "INSERT INTO HISTORICAL_EVENT_PROPERTIES (ID, KEY, VALUE) VALUES ('E1', 'reason', 'gone'), ('E1', 'name', '/a/b.cbz'), ('E3', 'upgrade', 'No')",
    )
    return controller.getHistoricalEvents(PageRequest.of(0, 20))
  })
  kase('unsorted pageable', () => controller.getHistoricalEvents(Pageable.ofSize(2)))
  kase('second page', () => controller.getHistoricalEvents(PageRequest.of(1, 2)))
  kase('sort by type asc', () => controller.getHistoricalEvents(PageRequest.of(0, 20, Sort.by('type'))))
  kase('sort by seriesId desc then timestamp', () => controller.getHistoricalEvents(PageRequest.of(0, 20, Sort.by(Order.desc('seriesId'), Order.asc('timestamp')))))
  kase('page beyond', () => controller.getHistoricalEvents(PageRequest.of(5, 2)))
})
