// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/SeriesSearchHelperOracleTest.kt
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { SearchCondition } from '../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SeriesSearchHelper } from '../../../../src/infrastructure/jooq/SeriesSearchHelper.js'
import { RequiredJoin } from '../../../../src/infrastructure/jooq/RequiredJoin.js'
import { csAlias } from '../../../../src/infrastructure/jooq/Utils.js'
import type { Condition, Select } from '../../../../src/port/jooq/core.js'
import { Tables } from '../../../../src/port/jooq/generated/main/Tables.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { insert, render, user } from './JooqSamples.js'

const { func, kase } = oracle('infrastructure/jooq/SeriesSearchHelper')

const db = new OracleDb()
const s = Tables.SERIES
const sm = Tables.SERIES_METADATA
const bma = Tables.BOOK_METADATA_AGGREGATION
const rps = Tables.READ_PROGRESS_SERIES

/** séries retenues par une condition, les tables jointes dans l'ordre de l'ensemble */
function query([condition, joins]: [Condition, Set<RequiredJoin>]) {
  let q: Select = db.dsl.select(s.ID).from(s)
  for (const j of joins) {
    if (j === RequiredJoin.SeriesMetadata) q = q.leftJoin(sm).on(s.ID.eq(sm.SERIES_ID))
    else if (j === RequiredJoin.BookMetadataAggregation) q = q.leftJoin(bma).on(s.ID.eq(bma.SERIES_ID))
    else if (j instanceof RequiredJoin.ReadProgress) q = q.leftJoin(rps).on(s.ID.eq(rps.SERIES_ID).and(rps.USER_ID.eq(j.userId)))
    else if (j instanceof RequiredJoin.Collection) {
      const cs = csAlias(j.collectionId)
      q = q.leftJoin(cs).on(s.ID.eq(cs.SERIES_ID))
    }
  }
  return q.where(condition).orderBy(s.ID)
}

function run(p: [Condition, Set<RequiredJoin>]): unknown[] {
  const q = query(p)
  return [...render(q), p[1], q.fetch(s.ID)]
}

const parse = (json: string): SearchCondition.Series => db.mapper.readValue<SearchCondition.Series>(json, { class: SearchCondition.Series })
const Helper = SeriesSearchHelper
const F = { base: 'toCondition@27', search: 'toCondition@21', libs: 'toConditionInternal@33', internal: 'toConditionInternal@39' }
const idx = { readStatus: 13, combined: 56, libraryIsNot: 5 }
const duplicateJoins = '{"allOf":[{"title":{"operator":"is","value":"x"}},{"publisher":{"operator":"is","value":"y"}}]}'

const conditions = [
  '{"allOf":[]}',
  '{"anyOf":[]}',
  '{"allOf":[{"libraryId":{"operator":"is","value":"L1"}},{"deleted":{"operator":"isFalse"}}]}',
  '{"anyOf":[{"libraryId":{"operator":"is","value":"L2"}},{"oneShot":{"operator":"isTrue"}}]}',
  '{"anyOf":[{"allOf":[{"libraryId":{"operator":"is","value":"L1"}},{"ageRating":{"operator":"greaterThan","value":12}}]},{"seriesStatus":{"operator":"is","value":"HIATUS"}}]}',
  '{"libraryId":{"operator":"isNot","value":"L1"}}',
  '{"deleted":{"operator":"isTrue"}}',
  '{"deleted":{"operator":"isFalse"}}',
  '{"releaseDate":{"operator":"after","dateTime":"2020-05-01T12:00:00Z"}}',
  '{"releaseDate":{"operator":"before","dateTime":"2020-05-02T01:30:00+02:00"}}',
  '{"releaseDate":{"operator":"isNull"}}',
  '{"releaseDate":{"operator":"isNotNull"}}',
  '{"readStatus":{"operator":"is","value":"UNREAD"}}',
  '{"readStatus":{"operator":"is","value":"READ"}}',
  '{"readStatus":{"operator":"is","value":"IN_PROGRESS"}}',
  '{"readStatus":{"operator":"isNot","value":"UNREAD"}}',
  '{"readStatus":{"operator":"isNot","value":"READ"}}',
  '{"readStatus":{"operator":"isNot","value":"IN_PROGRESS"}}',
  '{"seriesStatus":{"operator":"is","value":"ONGOING"}}',
  '{"seriesStatus":{"operator":"isNot","value":"ENDED"}}',
  '{"tag":{"operator":"is","value":"action"}}',
  '{"tag":{"operator":"isNot","value":"ACTION"}}',
  '{"tag":{"operator":"isNull"}}',
  '{"tag":{"operator":"isNotNull"}}',
  '{"author":{"operator":"is","value":{"name":"alice"}}}',
  '{"author":{"operator":"is","value":{"role":"writer"}}}',
  '{"author":{"operator":"is","value":{"name":"ALICE","role":"WRITER"}}}',
  '{"author":{"operator":"is","value":{}}}',
  '{"author":{"operator":"isNot","value":{"name":"bob"}}}',
  '{"author":{"operator":"isNot","value":{}}}',
  '{"oneShot":{"operator":"isTrue"}}',
  '{"oneShot":{"operator":"isFalse"}}',
  '{"ageRating":{"operator":"is","value":12}}',
  '{"ageRating":{"operator":"isNot","value":16}}',
  '{"ageRating":{"operator":"lessThan","value":12}}',
  '{"ageRating":{"operator":"isNull"}}',
  '{"ageRating":{"operator":"isNotNull"}}',
  '{"collectionId":{"operator":"is","value":"C1"}}',
  '{"collectionId":{"operator":"isNot","value":"C1"}}',
  '{"complete":{"operator":"isTrue"}}',
  '{"complete":{"operator":"isFalse"}}',
  '{"genre":{"operator":"is","value":"comedy"}}',
  '{"genre":{"operator":"isNot","value":"comedy"}}',
  '{"genre":{"operator":"isNull"}}',
  '{"genre":{"operator":"isNotNull"}}',
  '{"language":{"operator":"is","value":"EN"}}',
  '{"language":{"operator":"isNot","value":"en"}}',
  '{"publisher":{"operator":"is","value":"glenat"}}',
  '{"publisher":{"operator":"isNot","value":"dargaud"}}',
  '{"sharingLabel":{"operator":"is","value":"kids"}}',
  '{"sharingLabel":{"operator":"isNot","value":"kids"}}',
  '{"sharingLabel":{"operator":"isNull"}}',
  '{"sharingLabel":{"operator":"isNotNull"}}',
  '{"title":{"operator":"contains","value":"a"}}',
  '{"title":{"operator":"is","value":"ALPHA"}}',
  '{"titleSort":{"operator":"beginsWith","value":"e"}}',
  '{"allOf":[{"collectionId":{"operator":"is","value":"C1"}},{"readStatus":{"operator":"is","value":"READ"}},{"title":{"operator":"contains","value":"a"}}]}',
  '{"allOf":[{"title":{"operator":"doesNotContain","value":"z"}},{"seriesStatus":{"operator":"isNot","value":"ABANDONED"}},{"releaseDate":{"operator":"isNotNull"}}]}',
  '{"anyOf":[{"collectionId":{"operator":"is","value":"C1"}},{"collectionId":{"operator":"is","value":"C2"}}]}',
]

const contexts: [string, SearchContext][] = [
  ['empty', SearchContext.empty()],
  ['anonymous', SearchContext.ofAnonymousUser()],
  ['user', new SearchContext(user('U1'))],
  ['user with one library', new SearchContext(user('U1', new Set(['L1'])))],
  ['user with no library', new SearchContext(user('U1', new Set()))],
  [
    'user with libraries and age restriction',
    new SearchContext(user('U1', new Set(['L1', 'L2']), new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }) }))),
  ],
  ['user with excluded label', new SearchContext(user('U2', null, new ContentRestrictions({ labelsExclude: new Set(['adult']) })))],
  [
    'user with allowed label and excluded age',
    new SearchContext(
      user('U1', null, new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 16, restriction: AllowExclude.EXCLUDE }), labelsAllow: new Set(['kids']) })),
    ),
  ],
]
const ctx = (i: number) => (contexts[i] as [string, SearchContext])[1]
const cond = (i: number) => parse(conditions[i] as string)

func(F.base, () => {
  kase('sample rows', () => insert(db))
  for (const [name, context] of contexts) kase(name, () => run(new Helper(context).toCondition()))
})

func(F.search, () => {
  kase('null condition', () => run(new Helper(new SearchContext(user('U1'))).toCondition(null)))
  kase('null condition, restricted user', () => run(new Helper(ctx(5)).toCondition(null)))
  for (const json of conditions) {
    kase(json, () => {
      const condition = parse(json)
      return [condition, ...run(new Helper(new SearchContext(user('U1'))).toCondition(condition))]
    })
  }
  kase('read status without user', () => run(new Helper(SearchContext.empty()).toCondition(cond(idx.readStatus))))
  kase('read status, anonymous', () => run(new Helper(SearchContext.ofAnonymousUser()).toCondition(cond(idx.readStatus))))
  kase('read status, other user', () => run(new Helper(new SearchContext(user('U2'))).toCondition(cond(idx.readStatus))))
  kase('restricted user and conditions', () => run(new Helper(ctx(6)).toCondition(cond(idx.combined))))
  kase('user with one library and library condition', () => run(new Helper(ctx(3)).toCondition(cond(idx.libraryIsNot))))
})

func(F.libs, () => {
  kase('no library restriction', () => run(new Helper(new SearchContext(user('U1'))).toCondition()))
  kase('empty library list', () => run(new Helper(new SearchContext(user('U1', new Set()))).toCondition()))
  kase('one library', () => run(new Helper(new SearchContext(user('U1', new Set(['L2'])))).toCondition()))
  kase('several libraries', () => run(new Helper(new SearchContext(user('U1', new Set(['L3', 'L1', 'L9'])))).toCondition()))
})

func(F.internal, () => {
  kase('nested empty groups', () => run(new Helper(SearchContext.empty()).toCondition(parse('{"allOf":[{"anyOf":[]},{"allOf":[]}]}'))))
  kase('single condition group', () => run(new Helper(SearchContext.empty()).toCondition(parse('{"anyOf":[{"deleted":{"operator":"isTrue"}}]}'))))
  kase('duplicate joins', () => run(new Helper(SearchContext.empty()).toCondition(parse(duplicateJoins))))
})
