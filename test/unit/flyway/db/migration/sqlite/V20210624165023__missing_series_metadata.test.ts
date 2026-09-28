// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/flyway/db/migration/sqlite/V20210624165023__missing_series_metadataOracleTest.kt
// La migration s'exécute sur une base migrée jusqu'à la version précédente (20210617114814), remplie par chaque cas
import { V20210624165023__missing_series_metadata } from '../../../../../../src/flyway/db/migration/sqlite/V20210624165023__missing_series_metadata.js'
import { exec, mainConnectionAt, query } from '../../../../db.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('flyway/db/migration/sqlite/V20210624165023__missing_series_metadata')

const connection = mainConnectionAt('20210617114814')
const context = { connection }
const rows = (sql: string) => query(connection, sql)

func('migrate', () => {
  kase('nothing missing', () => {
    new V20210624165023__missing_series_metadata().migrate(context)
    return rows('select count(*) from SERIES_METADATA')
  })
  kase('creates metadata and aggregation', () => {
    exec(
      connection,
      "insert into LIBRARY(ID, NAME, ROOT) values ('L1', 'lib', 'file:/lib')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S1', '2020-01-01 00:00:00', 'Déjà vu', 'file:/lib/S1', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S2', '2020-01-01 00:00:00', 'with metadata', 'file:/lib/S2', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S3', '2020-01-01 00:00:00', 'Ünïcödé Ωmega', 'file:/lib/S3', 'L1')",
      "insert into SERIES_METADATA(SERIES_ID, STATUS, TITLE, TITLE_SORT) values ('S2','ENDED','kept','kept')",
      "insert into BOOK_METADATA_AGGREGATION(SERIES_ID) values ('S2')",
    )
    new V20210624165023__missing_series_metadata().migrate(context)
    return [rows('select SERIES_ID, STATUS, TITLE, TITLE_SORT, READING_DIRECTION, AGE_RATING from SERIES_METADATA order by SERIES_ID'), rows('select SERIES_ID, RELEASE_DATE, SUMMARY from BOOK_METADATA_AGGREGATION order by SERIES_ID')]
  })
  kase('second run is a no-op', () => {
    new V20210624165023__missing_series_metadata().migrate(context)
    return rows('select count(*) from SERIES_METADATA')
  })
})
