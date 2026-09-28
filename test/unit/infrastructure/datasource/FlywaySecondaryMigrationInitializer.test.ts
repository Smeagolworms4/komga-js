// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/datasource/FlywaySecondaryMigrationInitializerOracleTest.kt
import { afterAll } from 'vitest'
import { FlywaySecondaryMigrationInitializer } from '../../../../src/infrastructure/datasource/FlywaySecondaryMigrationInitializer.js'
import { HikariDataSource, SQLiteDataSource } from '../../../../src/port/sqlite.js'
import { exec, query } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/datasource/FlywaySecondaryMigrationInitializer')

const sqlite = new SQLiteDataSource()
sqlite.setUrl('jdbc:sqlite::memory:')
const dataSource = new HikariDataSource(sqlite)
afterAll(() => dataSource.close())

const q = (sql: string) => query(dataSource.getConnection(), sql)

const history = () => q('select installed_rank, version, description, type, script, checksum, success from flyway_schema_history order by installed_rank')

func('afterPropertiesSet', () => {
  kase('empty database', () => q('select count(*) from sqlite_master'))
  kase('migrates the tasks database', () => {
    new FlywaySecondaryMigrationInitializer(dataSource).afterPropertiesSet()
    return q("select type, name, tbl_name from sqlite_master where name not like 'sqlite_%' order by type, name")
  })
  kase('schema history', () => history())
  kase('task table columns', () => q('select name, type, "notnull", dflt_value, pk from pragma_table_info(\'TASK\') order by cid'))
  kase('idempotent', () => {
    new FlywaySecondaryMigrationInitializer(dataSource).afterPropertiesSet()
    return history()
  })
  kase('task table usable', () => {
    exec(dataSource.getConnection(), "insert into TASK(ID, PRIORITY, CLASS, SIMPLE_TYPE, PAYLOAD) values ('t', 4, 'c', 's', '{}')")
    return q('select ID, PRIORITY, GROUP_ID, OWNER, length(CREATED_DATE) from TASK')
  })
})
