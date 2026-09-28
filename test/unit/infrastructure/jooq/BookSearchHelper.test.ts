// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/BookSearchHelperOracleTest.kt
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { SearchCondition } from '../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { BookSearchHelper } from '../../../../src/infrastructure/jooq/BookSearchHelper.js'
import { RequiredJoin } from '../../../../src/infrastructure/jooq/RequiredJoin.js'
import { rlbAlias } from '../../../../src/infrastructure/jooq/Utils.js'
import type { Condition, Select } from '../../../../src/port/jooq/core.js'
import { Tables } from '../../../../src/port/jooq/generated/main/Tables.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { insert, render, user } from './JooqSamples.js'

const { func, kase } = oracle('infrastructure/jooq/BookSearchHelper')

const db = new OracleDb()
const b = Tables.BOOK
const bm = Tables.BOOK_METADATA
const m = Tables.MEDIA
const rp = Tables.READ_PROGRESS
const sm = Tables.SERIES_METADATA

/** livres retenus par une condition, les tables jointes dans l'ordre de l'ensemble */
function query([condition, joins]: [Condition, Set<RequiredJoin>]) {
  let q: Select = db.dsl.select(b.ID).from(b)
  for (const j of joins) {
    if (j === RequiredJoin.BookMetadata) q = q.leftJoin(bm).on(b.ID.eq(bm.BOOK_ID))
    else if (j === RequiredJoin.Media) q = q.leftJoin(m).on(b.ID.eq(m.BOOK_ID))
    else if (j === RequiredJoin.SeriesMetadata) q = q.leftJoin(sm).on(b.SERIES_ID.eq(sm.SERIES_ID))
    else if (j instanceof RequiredJoin.ReadProgress) q = q.leftJoin(rp).on(b.ID.eq(rp.BOOK_ID).and(rp.USER_ID.eq(j.userId)))
    else if (j instanceof RequiredJoin.ReadList) {
      const rlb = rlbAlias(j.readListId)
      q = q.leftJoin(rlb).on(b.ID.eq(rlb.BOOK_ID))
    }
  }
  return q.where(condition).orderBy(b.ID)
}

function run(p: [Condition, Set<RequiredJoin>]): unknown[] {
  const q = query(p)
  return [...render(q), p[1], q.fetch(b.ID)]
}

const parse = (json: string): SearchCondition.Book => db.mapper.readValue<SearchCondition.Book>(json, { class: SearchCondition.Book })
const Helper = BookSearchHelper
const F = { base: 'toCondition@29', search: 'toCondition@23', libs: 'toConditionInternal@35', internal: 'toConditionInternal@41' }
const idx = { readStatus: 23, combined: 55, libraryIsNot: 5 }
const duplicateJoins = '{"allOf":[{"title":{"operator":"is","value":"x"}},{"numberSort":{"operator":"is","value":1}}]}'

const conditions = [
  '{"allOf":[]}',
  '{"anyOf":[]}',
  '{"allOf":[{"libraryId":{"operator":"is","value":"L1"}},{"deleted":{"operator":"isFalse"}}]}',
  '{"anyOf":[{"seriesId":{"operator":"is","value":"S3"}},{"oneShot":{"operator":"isTrue"}}]}',
  '{"anyOf":[{"allOf":[{"libraryId":{"operator":"is","value":"L1"}},{"numberSort":{"operator":"greaterThan","value":2.0}}]},{"mediaStatus":{"operator":"is","value":"ERROR"}}]}',
  '{"libraryId":{"operator":"isNot","value":"L1"}}',
  '{"seriesId":{"operator":"is","value":"S1"}}',
  '{"seriesId":{"operator":"isNot","value":"S1"}}',
  '{"readListId":{"operator":"is","value":"R1"}}',
  '{"readListId":{"operator":"isNot","value":"R1"}}',
  '{"title":{"operator":"contains","value":"e"}}',
  '{"title":{"operator":"is","value":"debut"}}',
  '{"title":{"operator":"endsWith","value":"%_X"}}',
  '{"deleted":{"operator":"isTrue"}}',
  '{"deleted":{"operator":"isFalse"}}',
  '{"releaseDate":{"operator":"after","dateTime":"2020-06-14T23:30:00-01:00"}}',
  '{"releaseDate":{"operator":"isNotNull"}}',
  '{"releaseDate":{"operator":"isNull"}}',
  '{"numberSort":{"operator":"greaterThan","value":1.0}}',
  '{"numberSort":{"operator":"lessThan","value":2.5}}',
  '{"numberSort":{"operator":"is","value":1}}',
  '{"numberSort":{"operator":"isNot","value":1.0}}',
  '{"readStatus":{"operator":"is","value":"UNREAD"}}',
  '{"readStatus":{"operator":"is","value":"READ"}}',
  '{"readStatus":{"operator":"is","value":"IN_PROGRESS"}}',
  '{"readStatus":{"operator":"isNot","value":"UNREAD"}}',
  '{"readStatus":{"operator":"isNot","value":"READ"}}',
  '{"readStatus":{"operator":"isNot","value":"IN_PROGRESS"}}',
  '{"mediaStatus":{"operator":"is","value":"READY"}}',
  '{"mediaStatus":{"operator":"isNot","value":"READY"}}',
  '{"mediaProfile":{"operator":"is","value":"DIVINA"}}',
  '{"mediaProfile":{"operator":"is","value":"PDF"}}',
  '{"mediaProfile":{"operator":"is","value":"EPUB"}}',
  '{"mediaProfile":{"operator":"isNot","value":"PDF"}}',
  '{"tag":{"operator":"is","value":"tag1"}}',
  '{"tag":{"operator":"is","value":"TAG2"}}',
  '{"tag":{"operator":"isNot","value":"tag1"}}',
  '{"tag":{"operator":"isNull"}}',
  '{"tag":{"operator":"isNotNull"}}',
  '{"author":{"operator":"is","value":{"name":"alice"}}}',
  '{"author":{"operator":"is","value":{"role":"writer"}}}',
  '{"author":{"operator":"is","value":{"name":"emile","role":"colorist"}}}',
  '{"author":{"operator":"is","value":{}}}',
  '{"author":{"operator":"isNot","value":{"name":"bob"}}}',
  '{"author":{"operator":"isNot","value":{}}}',
  '{"poster":{"operator":"is","value":{"type":"GENERATED"}}}',
  '{"poster":{"operator":"is","value":{"selected":true}}}',
  '{"poster":{"operator":"is","value":{"selected":false}}}',
  '{"poster":{"operator":"is","value":{"type":"SIDECAR","selected":false}}}',
  '{"poster":{"operator":"is","value":{}}}',
  '{"poster":{"operator":"isNot","value":{"type":"GENERATED"}}}',
  '{"poster":{"operator":"isNot","value":{"type":"USER_UPLOADED","selected":true}}}',
  '{"poster":{"operator":"isNot","value":{}}}',
  '{"oneShot":{"operator":"isTrue"}}',
  '{"oneShot":{"operator":"isFalse"}}',
  '{"allOf":[{"readListId":{"operator":"is","value":"R1"}},{"readStatus":{"operator":"is","value":"READ"}},{"mediaStatus":{"operator":"is","value":"READY"}}]}',
  '{"allOf":[{"title":{"operator":"doesNotBeginWith","value":"z"}},{"numberSort":{"operator":"lessThan","value":50}},{"releaseDate":{"operator":"isNotNull"}}]}',
  '{"anyOf":[{"readListId":{"operator":"is","value":"R1"}},{"readListId":{"operator":"is","value":"R2"}}]}',
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
