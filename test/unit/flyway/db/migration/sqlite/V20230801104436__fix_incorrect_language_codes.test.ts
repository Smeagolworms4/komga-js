// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/flyway/db/migration/sqlite/V20230801104436__fix_incorrect_language_codesOracleTest.kt
// La migration s'exécute sur une base migrée jusqu'à la version précédente (20230724114349), remplie par chaque cas
import { V20230801104436__fix_incorrect_language_codes } from '../../../../../../src/flyway/db/migration/sqlite/V20230801104436__fix_incorrect_language_codes.js'
import { exec, mainConnectionAt, query } from '../../../../db.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('flyway/db/migration/sqlite/V20230801104436__fix_incorrect_language_codes')

const connection = mainConnectionAt('20230724114349')
const context = { connection }
const rows = (sql: string) => query(connection, sql)

func('migrate', () => {
  kase('no language', () => {
    new V20230801104436__fix_incorrect_language_codes().migrate(context)
    return rows('select count(*) from SERIES_METADATA')
  })
  kase('normalizes codes', () => {
    exec(
      connection,
      "insert into LIBRARY(ID, NAME, ROOT) values ('L1', 'lib', 'file:/lib')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S1', '2020-01-01 00:00:00', 's1', 'file:/lib/S1', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S2', '2020-01-01 00:00:00', 's2', 'file:/lib/S2', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S3', '2020-01-01 00:00:00', 's3', 'file:/lib/S3', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S4', '2020-01-01 00:00:00', 's4', 'file:/lib/S4', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S5', '2020-01-01 00:00:00', 's5', 'file:/lib/S5', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S6', '2020-01-01 00:00:00', 's6', 'file:/lib/S6', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S7', '2020-01-01 00:00:00', 's7', 'file:/lib/S7', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S8', '2020-01-01 00:00:00', 's8', 'file:/lib/S8', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S9', '2020-01-01 00:00:00', 's9', 'file:/lib/S9', 'L1')",
      "insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID) values ('S10', '2020-01-01 00:00:00', 's10', 'file:/lib/S10', 'L1')",
      "insert into SERIES_METADATA(SERIES_ID, STATUS, TITLE, TITLE_SORT, LANGUAGE) values ('S1','ONGOING','t','t','en'), ('S2','ONGOING','t','t','EN'), ('S3','ONGOING','t','t','fr_FR'), ('S4','ONGOING','t','t','zh-hant-tw'), ('S5','ONGOING','t','t',''), ('S6','ONGOING','t','t','  '), ('S7','ONGOING','t','t','english'), ('S8','ONGOING','t','t','ja-jp'), ('S9','ONGOING','t','t','en-GB-oed'), ('S10','ONGOING','t','t','i-klingon')",
    )
    new V20230801104436__fix_incorrect_language_codes().migrate(context)
    return rows('select SERIES_ID, LANGUAGE from SERIES_METADATA order by cast(substr(SERIES_ID, 2) as integer)')
  })
})
func('normalize', () => {
  const m = new V20230801104436__fix_incorrect_language_codes() as unknown as { normalize(v: string | null): string }
  kase('null', () => m.normalize(null))
  kase('[en]', () => m.normalize('en'))
  kase('[EN]', () => m.normalize('EN'))
  kase('[fr_FR]', () => m.normalize('fr_FR'))
  kase('[fr-FR]', () => m.normalize('fr-FR'))
  kase('[zh-hant-tw]', () => m.normalize('zh-hant-tw'))
  kase('[]', () => m.normalize(''))
  kase('[   ]', () => m.normalize('   '))
  kase('[english]', () => m.normalize('english'))
  kase('[x]', () => m.normalize('x'))
  kase('[123]', () => m.normalize('123'))
  kase('[und]', () => m.normalize('und'))
  kase('[i-klingon]', () => m.normalize('i-klingon'))
  kase('[iw]', () => m.normalize('iw'))
  kase('[en-GB-oed]', () => m.normalize('en-GB-oed'))
  kase('[zh-min-nan]', () => m.normalize('zh-min-nan'))
  kase('[de-DE-1996]', () => m.normalize('de-DE-1996'))
  kase('[ja_JP]', () => m.normalize('ja_JP'))
  kase('[EN-us]', () => m.normalize('EN-us'))
  kase('[sgn-BE-FR]', () => m.normalize('sgn-BE-FR'))
  kase('[qaa]', () => m.normalize('qaa'))
  kase('[a-b-c]', () => m.normalize('a-b-c'))
  kase('[é]', () => m.normalize('é'))
})
