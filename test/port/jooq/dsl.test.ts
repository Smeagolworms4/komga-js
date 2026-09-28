// Tests du portage jOOQ sur une base Komga migrée. Les SQL attendus et les formats de stockage
// ont été relevés sur jOOQ 3.19.35 + sqlite-jdbc 3.53.2.1 (voir PORTING.md).
import { LocalDate, LocalDateTime } from '@js-joda/core'
import Database from 'better-sqlite3'
import { beforeAll, describe, expect, it } from 'vitest'
import { DSL, DSLContext, transactional } from '../../../src/port/jooq/dsl.js'
import { Keys, Tables } from '../../../src/port/jooq/generated/main/Tables.js'
import { MAIN_CODE_MIGRATIONS } from '../../../src/port/flyway-migrations.js'
import { Flyway } from '../../../src/port/flyway.js'
import type { Condition } from '../../../src/port/jooq/core.js'

const l = Tables.LIBRARY
const le = Tables.LIBRARY_EXCLUSIONS
let db: Database.Database
let dsl: DSLContext

function sqlOf(c: Condition): string {
  return dsl.selectOne().from(l).where(c).getSQL()
}

beforeAll(() => {
  db = new Database(':memory:')
  db.loadExtension('build/komgasqlite.so')
  db.pragma('foreign_keys = ON')
  new Flyway(db, {
    sqlLocations: ['resources/db/migration/sqlite'],
    codeMigrations: MAIN_CODE_MIGRATIONS,
    codePackage: 'db.migration.sqlite',
    placeholders: { 'library-file-hashing': 'true', 'library-scan-startup': 'false', 'delete-empty-collections': 'true', 'delete-empty-read-lists': 'true' },
  }).migrate()
  dsl = new DSLContext(db)
})

describe('jooq port', () => {
  it('renders conditions like jOOQ', () => {
    expect(sqlOf(l.NAME.eq(null))).toContain('LIBRARY.NAME = ?')
    expect(sqlOf(l.NAME.in([]))).toContain('LIBRARY.NAME in ()')
    expect(sqlOf(l.NAME.notIn([]))).toContain('LIBRARY.NAME not in ()')
    expect(sqlOf(DSL.noCondition().and(l.NAME.eq('x')))).toMatch(/where LIBRARY.NAME = \?$/)
    expect(sqlOf(DSL.noCondition())).not.toContain('where')
    expect(sqlOf(DSL.falseCondition().or(l.NAME.eq('x')))).toContain('(1 = 0 or LIBRARY.NAME = ?)')
    expect(sqlOf(l.NAME.contains('a'))).toContain(`like (('%' || "replace"("replace"("replace"(?, '!', '!!'), '%', '!%'), '_', '!_')) || '%') escape '!'`)
    expect(dsl.select(l.NAME).from(l).orderBy(l.NAME, l.ID).seek('x', 'y').limit(10).getSQL()).toContain('(LIBRARY.NAME, LIBRARY.ID) > (?, ?)')
  })

  it('stores values like jOOQ + sqlite-jdbc and reads them back', () => {
    const created = LocalDateTime.of(2024, 3, 5, 7, 8, 9, 123456789)
    dsl.insertInto(l).set(l.ID, 'L1').set(l.NAME, 'lib').set(l.ROOT, 'file:/lib').set(l.CREATED_DATE, created).set(l.LAST_MODIFIED_DATE, LocalDateTime.of(2024, 3, 5, 7, 8, 9)).set(l.HASH_FILES, false).execute()
    const raw = db.prepare('select CREATED_DATE, LAST_MODIFIED_DATE, HASH_FILES, typeof(HASH_FILES) t from LIBRARY').get() as Record<string, unknown>
    expect(raw).toEqual({ CREATED_DATE: '2024-03-05 07:08:09.123456789', LAST_MODIFIED_DATE: '2024-03-05 07:08:09.0', HASH_FILES: 0, t: 'integer' })

    const rec = dsl.selectFrom(l).where(l.ID.eq('L1')).fetchOneInto(l)
    expect(rec?.createdDate.toString()).toBe('2024-03-05T07:08:09.123')
    expect(rec?.hashFiles).toBe(false)
    expect(rec?.name).toBe('lib')
  })

  it('joins with onKey and groups like fetchGroups', () => {
    dsl.insertInto(le).set(le.LIBRARY_ID, 'L1').set(le.EXCLUSION, '#recycle').execute()
    dsl.insertInto(le).set(le.LIBRARY_ID, 'L1').set(le.EXCLUSION, '@eaDir').execute()
    const groups = dsl
      .select()
      .from(l)
      .leftJoin(le)
      .onKey()
      .fetchGroups(
        (it) => it.into(l),
        (it) => it.into(le),
      )
    expect(groups.size).toBe(1)
    const [lr, ler] = [...groups][0] ?? []
    expect(lr?.id).toBe('L1')
    expect(ler?.map((it: { exclusion: string }) => it.exclusion).sort()).toEqual(['#recycle', '@eaDir'])
    expect(Keys.LIBRARY_EXCLUSIONS__FK_LIBRARY_EXCLUSIONS_PK_LIBRARY).toBeDefined()
  })

  it('aggregates, aliases, batches and counts', () => {
    const b = dsl.batch(dsl.insertInto(le, le.LIBRARY_ID, le.EXCLUSION).values(null, null))
    for (const e of ['a', 'b', 'c']) b.bind('L1', e)
    expect(b.execute()).toEqual([1, 1, 1])
    expect(dsl.fetchCount(dsl.selectFrom(le))).toBe(5)
    const c = DSL.count(le.EXCLUSION).as('n')
    expect(dsl.select(le.LIBRARY_ID, c).from(le).groupBy(le.LIBRARY_ID).fetchOne()?.get(c)).toBe(5)
    const l2 = l.as('l2')
    expect(dsl.select(l2.NAME).from(l2).where(l2.ID.eq('L1')).fetchOne(l2.NAME)).toBe('lib')
  })

  it('upserts with onDuplicateKeyUpdate and rolls back transactions', () => {
    const s = Tables.SERVER_SETTINGS
    dsl.insertInto(s).set(s.KEY, 'k').set(s.VALUE, 'v1').onDuplicateKeyUpdate().set(s.VALUE, 'v2').execute()
    dsl.insertInto(s).set(s.KEY, 'k').set(s.VALUE, 'v1').onDuplicateKeyUpdate().set(s.VALUE, 'v2').execute()
    expect(dsl.select(s.VALUE).from(s).where(s.KEY.eq('k')).fetchOne(s.VALUE)).toBe('v2')
    expect(() =>
      transactional(db, () => {
        dsl.update(s).set(s.VALUE, 'v3').where(s.KEY.eq('k')).execute()
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(dsl.select(s.VALUE).from(s).where(s.KEY.eq('k')).fetchOne(s.VALUE)).toBe('v2')
  })

  it('sorts with the ICU collation and reads dates', () => {
    expect(dsl.select(DSL.val(LocalDate.of(2024, 1, 2))).fetchOne()?.value1<LocalDate>().toString()).toBe('2024-01-02')
    for (const [i, n] of ['b', 'É', 'a', 'e', 'Z'].entries())
      dsl.insertInto(l).set(l.ID, `S${i}`).set(l.NAME, n).set(l.ROOT, `file:/s${i}`).execute()
    const sorted = dsl.select(l.NAME).from(l).where(l.ID.like('S%')).orderBy(l.NAME.collate('COLLATION_UNICODE_3')).fetch(l.NAME)
    expect(sorted).toEqual(['a', 'b', 'e', 'É', 'Z'])
  })
})
