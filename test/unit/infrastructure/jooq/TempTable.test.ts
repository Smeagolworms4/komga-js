// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/TempTableOracleTest.kt
import { TempTable, use } from '../../../../src/infrastructure/jooq/TempTable.js'
import type { QueryPart } from '../../../../src/port/jooq/core.js'
import { Tables } from '../../../../src/port/jooq/generated/main/Tables.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle } from '../../oracle.js'
import { insert, render } from './JooqSamples.js'

const { func, kase } = oracle('infrastructure/jooq/TempTable')

const db = new OracleDb()
const s = Tables.SERIES

const tempTables = () => db.rawQuery("select count(*) from sqlite_temp_master where type = 'table'")

const strings = (t: TempTable) =>
  t
    .selectTempStrings()
    .fetch()
    .map((it) => it.value1())

/** le nom généré est remplacé, il contient un TSID */
const renderTemp = (t: TempTable, q: QueryPart) => render(q).map((it) => (typeof it === 'string' ? it.replaceAll(t.name, '<temp>') : it))

const also = <T>(v: T, block: () => void): T => {
  block()
  return v
}

const NAME = /^temp_[0-9A-HJKMNP-TV-Z]{13}$/

func('create', () => {
  kase('sample rows', () => insert(db))
  kase('creates a temporary table', () => {
    const t = new TempTable(db.dsl)
    t.create()
    return also([tempTables(), strings(t)], () => t.close())
  })
  kase('twice', async () => {
    const t = new TempTable(db.dsl)
    t.create()
    return also(await exceptionType(() => t.create()), () => t.close())
  })
  kase('not null error message', () => {
    const t = new TempTable(db.dsl)
    t.create()
    let r: string | null
    try {
      db.dsl.execute(`insert into ${t.name} values (null)`)
      r = null
    } catch (e) {
      r = (e as Error).message.replaceAll(t.name, '<temp>')
    }
    t.close()
    return r
  })
  kase('unique error message', () => {
    try {
      db.dsl.execute("insert into LIBRARY(ID, NAME, ROOT) values ('L1', 'x', 'y')")
      return null
    } catch (e) {
      return (e as Error).message
    }
  })
  kase('column accepts no null', async () => {
    const t = new TempTable(db.dsl)
    t.create()
    return also(await exceptionType(() => db.dsl.execute(`insert into ${t.name} values (null)`)), () => t.close())
  })
})

func('insertTempStrings', () => {
  kase('creates the table when needed', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(10, ['a'])
    return also([tempTables(), strings(t)], () => t.close())
  })
  kase('several chunks', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(2, ['e', 'd', 'c', 'b', 'a'])
    return also(strings(t), () => t.close())
  })
  kase('chunk size 1', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(1, new Set(['x', 'y']))
    return also(strings(t), () => t.close())
  })
  kase('duplicates, empty and unicode strings', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(3, ['a', 'a', '', 'Ça été', '漫画', "it's", '"q"'])
    return also(strings(t), () => t.close())
  })
  kase('empty collection creates the table', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(5, [])
    return also([tempTables(), strings(t)], () => t.close())
  })
  kase('called twice appends', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(5, ['1', '2'])
    t.insertTempStrings(5, ['3'])
    return also(strings(t), () => t.close())
  })
  kase('after create', () => {
    const t = new TempTable(db.dsl)
    t.create()
    t.insertTempStrings(5, ['z'])
    return also(strings(t), () => t.close())
  })
  kase('chunk size 0', async () => {
    const t = new TempTable(db.dsl)
    return also([await exceptionType(() => t.insertTempStrings(0, ['a'])), tempTables()], () => t.close())
  })
  kase('chunk size 0 with empty collection', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(0, [])
    return also(strings(t), () => t.close())
  })
  kase('many values', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(
      7,
      Array.from({ length: 100 }, (_, i) => `v${i + 1}`),
    )
    const it = strings(t)
    return also([it.length, it[0], it[it.length - 1]], () => t.close())
  })
})

func('selectTempStrings', () => {
  kase('render', () => {
    const t = new TempTable(db.dsl)
    return renderTemp(t, t.selectTempStrings())
  })
  kase('as sub-select', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(10, ['S3', 'S1', 'nope'])
    return also(db.dsl.select(s.ID).from(s).where(s.ID.in(t.selectTempStrings())).orderBy(s.ID).fetch(s.ID), () => t.close())
  })
  kase('render as sub-select', () => {
    const t = new TempTable(db.dsl)
    return renderTemp(t, db.dsl.select(s.ID).from(s).where(s.ID.notIn(t.selectTempStrings())))
  })
  kase('table not created', () => {
    const t = new TempTable(db.dsl)
    return exceptionType(() => t.selectTempStrings().fetch())
  })
})

func('close', () => {
  kase('drops the table', () => {
    const t = new TempTable(db.dsl)
    t.insertTempStrings(10, ['a'])
    const before = tempTables()
    t.close()
    return [before, tempTables()]
  })
  kase('not created', () => {
    const t = new TempTable(db.dsl)
    t.close()
    return tempTables()
  })
  kase('twice', () => {
    const t = new TempTable(db.dsl)
    t.create()
    t.close()
    t.close()
    return tempTables()
  })
  kase('use', () => [
    use(new TempTable(db.dsl), (it) => {
      it.insertTempStrings(10, ['u'])
      return strings(it)
    }),
    tempTables(),
  ])
})

func('generateName', () => {
  kase('format', () => NAME.test(new TempTable(db.dsl).name))
  kase('unique', () => new Set(Array.from({ length: 20 }, () => new TempTable(db.dsl).name)).size)
})

func('withTempTable', () => {
  kase('inserts the values', () =>
    use(TempTable.withTempTable(db.dsl, 2, ['S2', 'S6', 'S2']), (t) => [
      db.dsl.select(s.ID).from(s).where(s.ID.in(t.selectTempStrings())).orderBy(s.ID).fetch(s.ID),
      strings(t),
    ]),
  )
  kase('empty collection', () =>
    use(TempTable.withTempTable(db.dsl, 2, new Set()), (t) => db.dsl.select(s.ID).from(s).where(s.ID.notIn(t.selectTempStrings())).orderBy(s.ID).fetch(s.ID)),
  )
  kase('dropped after use', () => tempTables())
  kase('generated name', () => use(TempTable.withTempTable(db.dsl, 1, ['a']), (it) => NAME.test(it.name)))
})
