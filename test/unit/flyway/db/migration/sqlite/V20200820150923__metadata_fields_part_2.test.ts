// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/flyway/db/migration/sqlite/V20200820150923__metadata_fields_part_2OracleTest.kt
// La migration s'exécute sur une base migrée jusqu'à la version précédente (20200820141405), remplie par chaque cas
import { V20200820150923__metadata_fields_part_2 } from '../../../../../../src/flyway/db/migration/sqlite/V20200820150923__metadata_fields_part_2.js'
import { exec, mainConnectionAt, query } from '../../../../db.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('flyway/db/migration/sqlite/V20200820150923__metadata_fields_part_2')

const connection = mainConnectionAt('20200820141405')
const context = { connection }
const rows = (sql: string) => query(connection, sql)

func('migrate', () => {
  kase('no book metadata', () => {
    return rows('select count(*) from SERIES_METADATA')
  })
  kase('aggregates per series', () => {
    exec(
      connection,
      "insert into LIBRARY(ID, NAME, ROOT) values ('L1', 'lib', 'file:/lib')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S1', '2020-01-01 00:00:00', 's1', 'file:/lib/S1', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S2', '2020-01-01 00:00:00', 's2', 'file:/lib/S2', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S3', '2020-01-01 00:00:00', 's3', 'file:/lib/S3', 'L1')",
      "insert into SERIES_METADATA(SERIES_ID, STATUS, TITLE, TITLE_SORT) values ('S1','ONGOING','s1','s1'), ('S2','ONGOING','s2','s2'), ('S3','ONGOING','s3','s3')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B1', '2020-01-01 00:00:00', 'book B1', 'file:/lib/S1/B1.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B2', '2020-01-01 00:00:00', 'book B2', 'file:/lib/S1/B2.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B3', '2020-01-01 00:00:00', 'book B3', 'file:/lib/S1/B3.cbz', 'S1', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B4', '2020-01-01 00:00:00', 'book B4', 'file:/lib/S2/B4.cbz', 'S2', 'L1')",
      "insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID) values ('B5', '2020-01-01 00:00:00', 'book B5', 'file:/lib/S3/B5.cbz', 'S3', 'L1')",
      "insert into BOOK_METADATA(BOOK_ID, TITLE, NUMBER, NUMBER_SORT, AGE_RATING, AGE_RATING_LOCK, PUBLISHER, PUBLISHER_LOCK, READING_DIRECTION, READING_DIRECTION_LOCK) values ('B1','t1','1',1.0,12,0,'Pub A',0,'LEFT_TO_RIGHT',1)",
      "insert into BOOK_METADATA(BOOK_ID, TITLE, NUMBER, NUMBER_SORT, AGE_RATING, AGE_RATING_LOCK, PUBLISHER, PUBLISHER_LOCK, READING_DIRECTION, READING_DIRECTION_LOCK) values ('B2','t2','2',2.5,16,1,'Pub B',1,'RIGHT_TO_LEFT',0)",
      "insert into BOOK_METADATA(BOOK_ID, TITLE, NUMBER, NUMBER_SORT, AGE_RATING, AGE_RATING_LOCK, PUBLISHER, PUBLISHER_LOCK, READING_DIRECTION, READING_DIRECTION_LOCK) values ('B3','t3','3',3.0,null,0,'',0,'RIGHT_TO_LEFT',0)",
      "insert into BOOK_METADATA(BOOK_ID, TITLE, NUMBER, NUMBER_SORT, AGE_RATING, AGE_RATING_LOCK, PUBLISHER, PUBLISHER_LOCK, READING_DIRECTION, READING_DIRECTION_LOCK) values ('B4','t4','1',1.0,null,0,'',0,null,0)",
      "insert into BOOK_METADATA(BOOK_ID, TITLE, NUMBER, NUMBER_SORT, AGE_RATING, AGE_RATING_LOCK, PUBLISHER, PUBLISHER_LOCK, READING_DIRECTION, READING_DIRECTION_LOCK) values ('B5','t5','x',-1.0,0,0,'Ünï',0,'WEBTOON',0)",
    )
    new V20200820150923__metadata_fields_part_2().migrate(context)
    return rows('select SERIES_ID, AGE_RATING, AGE_RATING_LOCK, PUBLISHER, PUBLISHER_LOCK, READING_DIRECTION, READING_DIRECTION_LOCK from SERIES_METADATA order by SERIES_ID')
  })
})
