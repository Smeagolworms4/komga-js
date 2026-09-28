// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/flyway/db/migration/sqlite/V20240422132621__fix_read_progress_locatorsOracleTest.kt
// La migration s'exécute sur une base migrée jusqu'à la version précédente (20231214163213), remplie par chaque cas
import { gunzipSync } from 'node:zlib'
import { V20240422132621__fix_read_progress_locators } from '../../../../../../src/flyway/db/migration/sqlite/V20240422132621__fix_read_progress_locators.js'
import { exec, mainConnectionAt, query } from '../../../../db.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('flyway/db/migration/sqlite/V20240422132621__fix_read_progress_locators')

const connection = mainConnectionAt('20231214163213')
const context = { connection }
const rows = (sql: string) =>
  query(connection, sql).map((r) => r.map((v) => {
      if (!(v instanceof Uint8Array)) return v
      try {
        return gunzipSync(v).toString('utf8')
      } catch {
        return v
      }
    }),
  )

func('migrate', () => {
  kase('no locator', () => {
    new V20240422132621__fix_read_progress_locators().migrate(context)
    return rows('select count(*) from READ_PROGRESS')
  })
  kase('fixes hrefs', () => {
    exec(
      connection,
      "insert into LIBRARY(ID, NAME, ROOT) values ('L1', 'lib', 'file:/lib')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S1', '2020-01-01 00:00:00', 's1', 'file:/lib/S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B1', '2020-01-01 00:00:00', 'book B1', 'file:/lib/S1/B1.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B2', '2020-01-01 00:00:00', 'book B2', 'file:/lib/S1/B2.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B3', '2020-01-01 00:00:00', 'book B3', 'file:/lib/S1/B3.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B4', '2020-01-01 00:00:00', 'book B4', 'file:/lib/S1/B4.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B5', '2020-01-01 00:00:00', 'book B5', 'file:/lib/S1/B5.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B6', '2020-01-01 00:00:00', 'book B6', 'file:/lib/S1/B6.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B7', '2020-01-01 00:00:00', 'book B7', 'file:/lib/S1/B7.cbz', 'S1', 'L1')",
      "insert into USER(ID, EMAIL, PASSWORD) values ('U1', 'a@b.c', 'p')",
      "insert into READ_PROGRESS(BOOK_ID, USER_ID, PAGE, COMPLETED, LOCATOR) values ('B1', 'U1', 1, 0, X'1F8B08000000000002031D8C410AC2301000FFB2E0C9D24D2AF59063C1B3822F88219A60749764954AE9DF4D739C19980542F677301044D820267236052A6286F1A8145A8EF8D578237A169C34665FE8939DC7F369BA5CD185DDA0743F077925E8407EECEBCB32A7E8AC447A634BFBB9E56DBEC9026601CEF4A8B752198CEAC70E984A94868775FD03A3A1E1C499000000')",
      "insert into READ_PROGRESS(BOOK_ID, USER_ID, PAGE, COMPLETED, LOCATOR) values ('B2', 'U1', 1, 0, X'1F8B0800000000000203AB562AA92C4855B2522A49AD28D1CF28C9CD51D2512AC92CC90189E5E52B6414A5A629D50200ABF4246726000000')",
      "insert into READ_PROGRESS(BOOK_ID, USER_ID, PAGE, COMPLETED, LOCATOR) values ('B3', 'U1', 1, 0, X'1F8B0800000000000203AB56CA284A4D53B252F277750A08D64FCC294A4D4CA9D4ABC828C9CD51D2512AA92C48054A261614E46426279664E6E7E983A5B42B80D2B500880059E93D000000')",
      "insert into READ_PROGRESS(BOOK_ID, USER_ID, PAGE, COMPLETED, LOCATOR) values ('B4', 'U1', 1, 0, X'1F8B0800000000000203AB56CA284A4D53B2524AD42F4A2DCE2F2D4A4ED54F423093F52A324A7273947494B2F393F2830B12F3804AB381DC92D48A1225AB6AA58CCCF48C1C200672940EAF54AAAD05000D7F0C5651000000')",
      "insert into READ_PROGRESS(BOOK_ID, USER_ID, PAGE, COMPLETED, LOCATOR) values ('B5', 'U1', 1, 0, X'1F8B0800000000000203AB56CA284A4D53B2CA2BCDC9D1512AA92C4855B2522A51AA05003089378D18000000')",
      "insert into READ_PROGRESS(BOOK_ID, USER_ID, PAGE, COMPLETED, LOCATOR) values ('B6', 'U1', 1, 0, X'0102')",
      "insert into READ_PROGRESS(BOOK_ID, USER_ID, PAGE, COMPLETED, LOCATOR) values ('B7', 'U1', 1, 0, null)",
    )
    new V20240422132621__fix_read_progress_locators().migrate(context)
    return rows('select BOOK_ID, LOCATOR from READ_PROGRESS order by BOOK_ID')
  })
})
