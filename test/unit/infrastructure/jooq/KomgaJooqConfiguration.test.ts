// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/KomgaJooqConfigurationOracleTest.kt
import { afterAll } from 'vitest'
import { KomgaJooqConfiguration } from '../../../../src/infrastructure/jooq/KomgaJooqConfiguration.js'
import { DSL, type DSLContext } from '../../../../src/port/jooq/dsl.js'
import { SQLDataType } from '../../../../src/port/jooq/types.js'
import { type DataSource, HikariDataSource, SQLiteDataSource } from '../../../../src/port/sqlite.js'
import { query } from '../../db.js'
import { exceptionType, oracle } from '../../oracle.js'
import { render } from './JooqSamples.js'

const { func, kase } = oracle('infrastructure/jooq/KomgaJooqConfiguration')

const opened: HikariDataSource[] = []
afterAll(() => opened.forEach((it) => it.close()))

function dataSource(): HikariDataSource {
  const s = new SQLiteDataSource()
  s.setUrl('jdbc:sqlite::memory:')
  const ds = new HikariDataSource(s)
  opened.push(ds)
  return ds
}

/** une requête rendue et exécutée, une table créée par le contexte et vue par la source de données */
function check(ds: DataSource, dsl: DSLContext): unknown[] {
  dsl.execute('create table T (A varchar, B int)')
  dsl.insertInto(DSL.table(DSL.name('T')), DSL.field(DSL.name('A')), DSL.field(DSL.name('B'))).values('x', 1).execute()
  return [render(dsl.selectOne()), dsl.selectOne().fetchOne()?.value1(), query(ds.getConnection(), 'select A, B from T'), dsl.fetchCount(DSL.table(DSL.name('T')))]
}

const conf = new KomgaJooqConfiguration()

func('mainDslContextRW', () => {
  kase('context', () => {
    const ds = dataSource()
    return check(ds, conf.mainDslContextRW(ds))
  })
})
func('mainDslContextRO', () => {
  kase('context', () => {
    const ds = dataSource()
    return check(ds, conf.mainDslContextRO(ds))
  })
})
func('tasksDslContextRW', () => {
  kase('context', () => {
    const ds = dataSource()
    return check(ds, conf.tasksDslContextRW(ds))
  })
})
func('tasksDslContextRO', () => {
  kase('context', () => {
    const ds = dataSource()
    return check(ds, conf.tasksDslContextRO(ds))
  })
})
func('createDslContext', () => {
  kase('sqlite rendering', () =>
    render(
      conf
        .mainDslContextRW(dataSource())
        .select(DSL.field(DSL.name('A')))
        .from(DSL.table(DSL.name('T')))
        .where(DSL.field(DSL.name('B'), SQLDataType.INTEGER).gt(1))
        .limit(2)
        .offset(3),
    ),
  )
  kase('sql error', async () => (await exceptionType(() => conf.mainDslContextRW(dataSource()).execute('select * from NOPE'))) !== null)
})
