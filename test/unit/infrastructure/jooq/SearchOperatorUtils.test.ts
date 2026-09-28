// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/SearchOperatorUtilsOracleTest.kt
import '@js-joda/timezone'
import { Duration, type LocalDate, ZoneId, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { SearchOperator } from '../../../../src/domain/model/SearchOperator.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import {
  toConditionBoolean,
  toConditionDate,
  toConditionEquality,
  toConditionEqualityConverter,
  toConditionEqualityString,
  toConditionNumeric,
  toConditionNumericNullable,
  toConditionStringOp,
} from '../../../../src/infrastructure/jooq/SearchOperatorUtils.js'
import type { Condition, Field } from '../../../../src/port/jooq/core.js'
import { Tables } from '../../../../src/port/jooq/generated/main/Tables.js'
import { OracleDb } from '../../db.js'
import { oracle, stable } from '../../oracle.js'
import { insert, render, renderBinds } from './JooqSamples.js'

const { func, kase } = oracle('infrastructure/jooq/SearchOperatorUtils')

const db = new OracleDb()
const s = Tables.SERIES
const sm = Tables.SERIES_METADATA
const bma = Tables.BOOK_METADATA_AGGREGATION
const b = Tables.BOOK
const bm = Tables.BOOK_METADATA

const series = (c: Condition) => db.dsl.select(s.ID).from(s).leftJoin(sm).on(s.ID.eq(sm.SERIES_ID)).leftJoin(bma).on(s.ID.eq(bma.SERIES_ID)).where(c).orderBy(s.ID)

const books = (c: Condition) => db.dsl.select(b.ID).from(b).leftJoin(bm).on(b.ID.eq(bm.BOOK_ID)).where(c).orderBy(b.ID)

/** requête rendue et séries retenues */
const onSeries = (c: Condition) => [...render(series(c)), series(c).fetch(s.ID)]

const onBooks = (c: Condition) => [...render(books(c)), books(c).fetch(b.ID)]

const eqString = (op: SearchOperator.Equality<string>, field: Field<string>, ignoreCase: boolean | null = null) =>
  ignoreCase === null ? toConditionEqualityString(op, field) : toConditionEqualityString(op, field, { ignoreCase })

const is = <T>(value: T) => new SearchOperator.Is<T>({ value })
const isNot = <T>(value: T) => new SearchOperator.IsNot<T>({ value })

func('toCondition@10', () => {
  kase('sample rows', () => insert(db))
  kase('is', () => onSeries(eqString(is('dargaud'), sm.PUBLISHER)))
  kase('is, default ignoreCase', () => onSeries(eqString(is('Dargaud'), sm.PUBLISHER, null)))
  kase('is ignoring case', () => onSeries(eqString(is('DARGAUD'), sm.PUBLISHER, true)))
  kase('is ignoring case and accents', () => onSeries(eqString(is('glenat'), sm.PUBLISHER, true)))
  kase('is not', () => onSeries(eqString(isNot('dargaud'), sm.PUBLISHER, false)))
  kase('is not ignoring case', () => onSeries(eqString(isNot('DARGAUD'), sm.PUBLISHER, true)))
  kase('is empty string', () => onSeries(eqString(is(''), sm.PUBLISHER, true)))
  kase('language', () => onSeries(eqString(is('en'), sm.LANGUAGE, true)))
})

func('toCondition@18', () => {
  kase('is int', () => onSeries(toConditionEquality(is(12), sm.AGE_RATING)))
  kase('is not int excludes null', () => onSeries(toConditionEquality(isNot(12), sm.AGE_RATING)))
  kase('is string', () => onSeries(toConditionEquality(is('S2'), s.ID)))
  kase('is not string', () => onSeries(toConditionEquality(isNot('S2'), s.ID)))
  kase('is boolean', () => onSeries(toConditionEquality(is(true), s.ONESHOT)))
  kase('is not boolean', () => onSeries(toConditionEquality(isNot(true), s.ONESHOT)))
  kase('is null value', () => onSeries(toConditionEquality(is<number | null>(null), sm.AGE_RATING as Field<number | null>)))
})

func('toCondition@24', () => {
  kase('is status', () => onSeries(toConditionEqualityConverter(is(SeriesMetadata.Status.ONGOING), sm.STATUS, (it) => it.name)))
  kase('is not status', () => onSeries(toConditionEqualityConverter(isNot(SeriesMetadata.Status.ONGOING), sm.STATUS, (it) => it.name)))
  kase('converter', () => onSeries(toConditionEqualityConverter(is(5), s.ID, (it) => `S${it}`)))
  kase('converter to lower case', () => onSeries(toConditionEqualityConverter(is(SeriesMetadata.Status.HIATUS), sm.STATUS, (it) => it.name.toLowerCase())))
})

func('toCondition@32', () => {
  kase('begins with', () => onSeries(toConditionStringOp(new SearchOperator.BeginsWith({ value: 'e' }), sm.TITLE)))
  kase('begins with accent', () => onSeries(toConditionStringOp(new SearchOperator.BeginsWith({ value: 'ÉL' }), sm.TITLE)))
  kase('does not begin with', () => onSeries(toConditionStringOp(new SearchOperator.DoesNotBeginWith({ value: 'e' }), sm.TITLE)))
  kase('ends with', () => onSeries(toConditionStringOp(new SearchOperator.EndsWith({ value: 'A' }), sm.TITLE)))
  kase('ends with wildcard characters', () => onSeries(toConditionStringOp(new SearchOperator.EndsWith({ value: '%_x' }), sm.TITLE)))
  kase('does not end with', () => onSeries(toConditionStringOp(new SearchOperator.DoesNotEndWith({ value: 'a' }), sm.TITLE)))
  kase('contains', () => onSeries(toConditionStringOp(new SearchOperator.Contains({ value: 'ça' }), sm.TITLE)))
  kase('contains percent', () => onSeries(toConditionStringOp(new SearchOperator.Contains({ value: '%' }), sm.TITLE)))
  kase('contains underscore', () => onSeries(toConditionStringOp(new SearchOperator.Contains({ value: '_' }), sm.TITLE)))
  kase('contains escape character', () => onSeries(toConditionStringOp(new SearchOperator.Contains({ value: '!' }), sm.TITLE)))
  kase('contains empty', () => onSeries(toConditionStringOp(new SearchOperator.Contains({ value: '' }), sm.TITLE)))
  kase('does not contain', () => onSeries(toConditionStringOp(new SearchOperator.DoesNotContain({ value: 'A' }), sm.TITLE)))
  kase('is', () => onSeries(toConditionStringOp(is('ALPHA'), sm.TITLE)))
  kase('is with accents', () => onSeries(toConditionStringOp(is('elan vital'), sm.TITLE)))
  kase('is not', () => onSeries(toConditionStringOp(isNot('elan vital'), sm.TITLE)))
  kase('title sort', () => onSeries(toConditionStringOp(new SearchOperator.BeginsWith({ value: 'be' }), sm.TITLE_SORT)))
})

func('toCondition@44', () => {
  const paris = ZoneId.of('Europe/Paris')
  const date = (op: SearchOperator.Date, field: Field<LocalDate>) => toConditionDate(op, field)
  const after = (dateTime: ZonedDateTime) => new SearchOperator.After({ dateTime })
  const before = (dateTime: ZonedDateTime) => new SearchOperator.Before({ dateTime })
  const inLast = (duration: Duration) => new SearchOperator.IsInTheLast({ duration })
  const notInLast = (duration: Duration) => new SearchOperator.IsNotInTheLast({ duration })
  kase('after', () => onSeries(date(after(ZonedDateTime.of(2020, 5, 1, 12, 0, 0, 0, ZoneOffset.UTC)), bma.RELEASE_DATE)))
  kase('after, converted to UTC date', () => onSeries(date(after(ZonedDateTime.of(2020, 5, 2, 1, 0, 0, 0, paris)), bma.RELEASE_DATE)))
  kase('after, far offset', () => onSeries(date(after(ZonedDateTime.of(2020, 5, 1, 20, 0, 0, 0, ZoneOffset.ofHours(-10))), bma.RELEASE_DATE)))
  kase('before', () => onSeries(date(before(ZonedDateTime.of(2020, 5, 2, 0, 0, 0, 0, ZoneOffset.UTC)), bma.RELEASE_DATE)))
  kase('before, converted to UTC date', () => onSeries(date(before(ZonedDateTime.of(2020, 5, 2, 1, 30, 0, 0, paris)), bma.RELEASE_DATE)))
  kase('is in the last day', () => stable(renderBinds(series(date(inLast(Duration.ofDays(1)), bma.RELEASE_DATE)))))
  kase('is in the last 47 hours', () => stable(renderBinds(series(date(inLast(Duration.ofHours(47)), bma.RELEASE_DATE)))))
  kase('is in the last day ids', () => series(date(inLast(Duration.ofDays(1)), bma.RELEASE_DATE)).fetch(s.ID))
  kase('is in the last 200 years ids', () => series(date(inLast(Duration.ofDays(73000)), bma.RELEASE_DATE)).fetch(s.ID))
  kase('is not in the last zero day', () => stable(renderBinds(series(date(notInLast(Duration.ZERO), bma.RELEASE_DATE)))))
  kase('is not in the last zero day ids', () => series(date(notInLast(Duration.ZERO), bma.RELEASE_DATE)).fetch(s.ID))
  kase('is not in the last 200 years ids', () => series(date(notInLast(Duration.ofDays(73000)), bma.RELEASE_DATE)).fetch(s.ID))
  kase('is in the last negative duration', () => stable(renderBinds(series(date(inLast(Duration.ofDays(-1)), bma.RELEASE_DATE)))))
  kase('is null', () => onSeries(date(SearchOperator.IsNull, bma.RELEASE_DATE)))
  kase('is not null', () => onSeries(date(SearchOperator.IsNotNull, bma.RELEASE_DATE)))
  kase('book release date', () => onBooks(date(before(ZonedDateTime.of(2020, 6, 15, 0, 0, 0, 0, ZoneOffset.UTC)), bm.RELEASE_DATE)))
})

func('toCondition@54', () => {
  kase('is', () => onSeries(toConditionNumericNullable(is(12), sm.AGE_RATING)))
  kase('is not includes null', () => onSeries(toConditionNumericNullable(isNot(12), sm.AGE_RATING)))
  kase('greater than is inclusive', () => onSeries(toConditionNumericNullable(new SearchOperator.GreaterThan({ value: 12 }), sm.AGE_RATING)))
  kase('less than is inclusive', () => onSeries(toConditionNumericNullable(new SearchOperator.LessThan({ value: 12 }), sm.AGE_RATING)))
  kase('is null', () => onSeries(toConditionNumericNullable(new SearchOperator.IsNullT<number>(), sm.AGE_RATING)))
  kase('is not null', () => onSeries(toConditionNumericNullable(new SearchOperator.IsNotNullT<number>(), sm.AGE_RATING)))
  kase('negative value', () => onSeries(toConditionNumericNullable(new SearchOperator.GreaterThan({ value: -5 }), sm.TOTAL_BOOK_COUNT)))
})

func('toCondition@64', () => {
  const f = Math.fround
  kase('is', () => onBooks(toConditionNumeric(is(f(1.0)), bm.NUMBER_SORT)))
  kase('is not', () => onBooks(toConditionNumeric(isNot(f(2.5)), bm.NUMBER_SORT)))
  kase('greater than is inclusive', () => onBooks(toConditionNumeric(new SearchOperator.GreaterThan({ value: f(2.5) }), bm.NUMBER_SORT)))
  kase('less than is inclusive', () => onBooks(toConditionNumeric(new SearchOperator.LessThan({ value: f(1) }), bm.NUMBER_SORT)))
  kase('float precision', () => onBooks(toConditionNumeric(new SearchOperator.GreaterThan({ value: f(0.1) }), bm.NUMBER_SORT)))
  kase('negative', () => onBooks(toConditionNumeric(new SearchOperator.LessThan({ value: f(-0.5) }), bm.NUMBER_SORT)))
})

func('toCondition@72', () => {
  kase('is true', () => onSeries(toConditionBoolean(SearchOperator.IsTrue, s.ONESHOT)))
  kase('is false', () => onSeries(toConditionBoolean(SearchOperator.IsFalse, s.ONESHOT)))
  kase('book', () => onBooks(toConditionBoolean(SearchOperator.IsTrue, b.ONESHOT)))
})
