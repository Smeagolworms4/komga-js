// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/datasource/FlywaySessionsMigrationInitializerOracleTest.kt
import { afterAll } from 'vitest'
import { FlywaySessionsMigrationInitializer } from '../../../../src/infrastructure/datasource/FlywaySessionsMigrationInitializer.js'
import { HikariDataSource, SQLiteDataSource } from '../../../../src/port/sqlite.js'
import { exec, query } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/datasource/FlywaySessionsMigrationInitializer')

const sqlite = new SQLiteDataSource()
sqlite.setUrl('jdbc:sqlite::memory:')
const dataSource = new HikariDataSource(sqlite)
afterAll(() => dataSource.close())

const q = (sql: string) => query(dataSource.getConnection(), sql)

const history = () => q('select installed_rank, version, description, type, script, checksum, success from flyway_schema_history order by installed_rank')

func('afterPropertiesSet', () => {
  kase('empty database', () => q('select count(*) from sqlite_master'))
  kase('migrates the sessions database', () => {
    new FlywaySessionsMigrationInitializer(dataSource).afterPropertiesSet()
    return q("select type, name, tbl_name from sqlite_master where name not like 'sqlite_%' order by type, name")
  })
  kase('schema history', () => history())
  kase('session table columns', () => q('select name, type, "notnull", dflt_value, pk from pragma_table_info(\'SPRING_SESSION\') order by cid'))
  kase('session attributes table columns', () => q('select name, type, "notnull", dflt_value, pk from pragma_table_info(\'SPRING_SESSION_ATTRIBUTES\') order by cid'))
  kase('idempotent', () => {
    new FlywaySessionsMigrationInitializer(dataSource).afterPropertiesSet()
    return history()
  })
  kase('session tables usable', () => {
    exec(
      dataSource.getConnection(),
      "insert into SPRING_SESSION(PRIMARY_ID, SESSION_ID, CREATION_TIME, LAST_ACCESS_TIME, MAX_INACTIVE_INTERVAL, EXPIRY_TIME, PRINCIPAL_NAME) values ('p', 's', 1, 2, 3, 4, 'user')",
    )
    exec(dataSource.getConnection(), "insert into SPRING_SESSION_ATTRIBUTES(SESSION_PRIMARY_ID, ATTRIBUTE_NAME, ATTRIBUTE_BYTES) values ('p', 'a', x'00')")
    return q('select S.SESSION_ID, S.PRINCIPAL_NAME, SA.ATTRIBUTE_NAME, length(SA.ATTRIBUTE_BYTES) from SPRING_SESSION S join SPRING_SESSION_ATTRIBUTES SA on S.PRIMARY_ID = SA.SESSION_PRIMARY_ID')
  })
})
