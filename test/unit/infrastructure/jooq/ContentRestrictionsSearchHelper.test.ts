// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/ContentRestrictionsSearchHelperOracleTest.kt
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { ContentRestrictionsSearchHelper } from '../../../../src/infrastructure/jooq/ContentRestrictionsSearchHelper.js'
import { Tables } from '../../../../src/port/jooq/generated/main/Tables.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { insert, render } from './JooqSamples.js'

const { func, kase } = oracle('infrastructure/jooq/ContentRestrictionsSearchHelper')

const db = new OracleDb()
const s = Tables.SERIES
const sm = Tables.SERIES_METADATA

function run(r: ContentRestrictions): unknown[] {
  const [condition, joins] = new ContentRestrictionsSearchHelper(r).toCondition()
  const q = db.dsl.select(s.ID).from(s).leftJoin(sm).on(s.ID.eq(sm.SERIES_ID)).where(condition).orderBy(s.ID)
  return [...render(q), joins, q.fetch(s.ID)]
}

const age = (a: number, restriction: AllowExclude) => new AgeRestriction({ age: a, restriction })

func('toCondition', () => {
  kase('sample rows', () => insert(db))
  kase('none', () => run(new ContentRestrictions()))
  kase('allow only 12', () => run(new ContentRestrictions({ ageRestriction: age(12, AllowExclude.ALLOW_ONLY) })))
  kase('allow only 0', () => run(new ContentRestrictions({ ageRestriction: age(0, AllowExclude.ALLOW_ONLY) })))
  kase('allow only negative', () => run(new ContentRestrictions({ ageRestriction: age(-1, AllowExclude.ALLOW_ONLY) })))
  kase('exclude 16', () => run(new ContentRestrictions({ ageRestriction: age(16, AllowExclude.EXCLUDE) })))
  kase('exclude 0', () => run(new ContentRestrictions({ ageRestriction: age(0, AllowExclude.EXCLUDE) })))
  kase('labels allow', () => run(new ContentRestrictions({ labelsAllow: new Set(['kids']) })))
  kase('labels allow case and blank', () => run(new ContentRestrictions({ labelsAllow: new Set(['ADULT', ' ', '']) })))
  kase('labels exclude', () => run(new ContentRestrictions({ labelsExclude: new Set(['adult']) })))
  kase('labels exclude several', () => run(new ContentRestrictions({ labelsExclude: new Set(['Kids', 'teen']) })))
  kase('labels allow and exclude', () => run(new ContentRestrictions({ labelsAllow: new Set(['kids', 'teen']), labelsExclude: new Set(['teen', 'adult']) })))
  kase('labels allow all excluded', () => run(new ContentRestrictions({ labelsAllow: new Set(['teen']), labelsExclude: new Set(['TEEN']) })))
  kase('age allow and labels allow', () => run(new ContentRestrictions({ ageRestriction: age(12, AllowExclude.ALLOW_ONLY), labelsAllow: new Set(['kids']) })))
  kase('age allow and labels exclude', () => run(new ContentRestrictions({ ageRestriction: age(16, AllowExclude.ALLOW_ONLY), labelsExclude: new Set(['adult']) })))
  kase('age exclude and labels allow', () => run(new ContentRestrictions({ ageRestriction: age(16, AllowExclude.EXCLUDE), labelsAllow: new Set(['adult']) })))
  kase('age exclude and labels exclude', () => run(new ContentRestrictions({ ageRestriction: age(16, AllowExclude.EXCLUDE), labelsExclude: new Set(['kids']) })))
  kase('everything', () =>
    run(new ContentRestrictions({ ageRestriction: age(18, AllowExclude.ALLOW_ONLY), labelsAllow: new Set(['kids', 'adult']), labelsExclude: new Set(['teen']) })),
  )
})
