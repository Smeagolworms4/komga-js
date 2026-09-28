// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/flyway/db/migration/sqlite/V20200810154730__thumbnails_part_2OracleTest.kt
// La migration s'exécute sur une base migrée jusqu'à la version précédente (20200810154729), remplie par chaque cas
import { V20200810154730__thumbnails_part_2 } from '../../../../../../src/flyway/db/migration/sqlite/V20200810154730__thumbnails_part_2.js'
import { exec, mainConnectionAt, query } from '../../../../db.js'
import { oracle, stable } from '../../../../oracle.js'

const { func, kase } = oracle('flyway/db/migration/sqlite/V20200810154730__thumbnails_part_2')

const connection = mainConnectionAt('20200810154729')
const context = { connection }
const rows = (sql: string) => query(connection, sql)

func('migrate', () => {
  kase('empty media', () => {
    new V20200810154730__thumbnails_part_2().migrate(context)
    return rows('select count(*) from THUMBNAIL_BOOK')
  })
  kase('copies thumbnails', () => {
    exec(
      connection,
      "insert into LIBRARY(ID, NAME, ROOT) values ('L1', 'lib', 'file:/lib')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S1', '2020-01-01 00:00:00', 's1', 'file:/lib/S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B1', '2020-01-01 00:00:00', 'book B1', 'file:/lib/S1/B1.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B2', '2020-01-01 00:00:00', 'book B2', 'file:/lib/S1/B2.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B3', '2020-01-01 00:00:00', 'book B3', 'file:/lib/S1/B3.cbz', 'S1', 'L1')",
      "insert into MEDIA(BOOK_ID, STATUS, THUMBNAIL) values ('B1', 'READY', X'0102FF')",
      "insert into MEDIA(BOOK_ID, STATUS, THUMBNAIL) values ('B2', 'ERROR', null)",
      "insert into MEDIA(BOOK_ID, STATUS, THUMBNAIL) values ('B3', 'READY', X'')",
    )
    new V20200810154730__thumbnails_part_2().migrate(context)
    return stable(rows('select ID, THUMBNAIL, SELECTED, TYPE, BOOK_ID, URL from THUMBNAIL_BOOK order by BOOK_ID'))
  })
  kase('ids are distinct', () => {
    return rows('select count(distinct ID), count(*) from THUMBNAIL_BOOK')
  })
})
