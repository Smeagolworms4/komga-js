// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/language/LanguageUtilsOracleTest.kt (fork Komga, branche unit-oracles)
import { ChronoUnit, LocalDate, LocalDateTime } from '@js-joda/core'
import {
  containsString,
  lowerNotBlank,
  mostFrequent,
  notEquals,
  stripAccents,
  toCurrentTimeZone,
  toDate,
  toEnumeration,
  toIndexedMap,
  toUTC,
  toUTCZoned,
  toZonedDateTime,
} from '../../../src/language/LanguageUtils.js'
import { oracle } from '../oracle.js'

const { func, kase, deviation } = oracle('language/LanguageUtils')

const dates = new Map([
  ['winter', LocalDateTime.of(2021, 1, 15, 10, 20, 30)],
  ['summer', LocalDateTime.of(2021, 7, 15, 10, 20, 30, 123456789)],
  ['dst gap', LocalDateTime.of(2021, 3, 28, 2, 30)],
  ['dst overlap', LocalDateTime.of(2021, 10, 31, 2, 30)],
  ['midnight', LocalDateTime.of(2000, 1, 1, 0, 0)],
  ['epoch', LocalDateTime.of(1970, 1, 1, 0, 0, 0, 1000000)],
  ['old', LocalDateTime.of(1900, 6, 1, 12, 0)],
  ['far', LocalDateTime.of(9999, 12, 31, 23, 59, 59, 999999999)],
])

func('toIndexedMap', () => {
  kase('empty', () => toIndexedMap<string>([]))
  kase('strings', () => toIndexedMap(['a', 'b', 'c']))
  kase('duplicates and nulls', () => toIndexedMap(['x', null, 'x', null]))
  kase('single', () => toIndexedMap([42]))
})

func('toEnumeration', () => {
  kase('empty', () => toEnumeration<string>([]).hasMoreElements())
  kase('drain', () => {
    const e = toEnumeration(['a', 'b', 'c'])
    const out: string[] = []
    while (e.hasMoreElements()) out.push(e.nextElement())
    return out
  })
})

func('hasMoreElements', () => {
  kase('sequence', () => {
    const e = toEnumeration([1, 2])
    return [e.hasMoreElements(), e.nextElement(), e.hasMoreElements(), e.nextElement(), e.hasMoreElements(), e.hasMoreElements()]
  })
})

func('nextElement', () => {
  kase('empty list', () => toEnumeration<number>([]).nextElement())
  kase('after the end', () => {
    const e = toEnumeration(['a'])
    e.nextElement()
    return e.nextElement()
  })
  kase('null element', () => toEnumeration<string | null>([null]).nextElement())
})

func('mostFrequent', () => {
  kase('empty', () => mostFrequent<string, string>([], (it) => it))
  kase('identity', () => mostFrequent(['a', 'b', 'b', 'c'], (it) => it))
  kase('tie keeps first', () => mostFrequent(['x', 'y', 'y', 'x', 'z'], (it) => it))
  kase('all transformed to null', () => mostFrequent<string, string>(['a', 'b'], () => null))
  kase('some null', () => mostFrequent(['a', '', '', 'b', ''], (it) => (it.length === 0 ? null : it)))
  kase('transform', () => mostFrequent(['aa', 'b', 'cc', 'ddd', 'e'], (it) => it.length))
  kase('set source', () => mostFrequent(new Set([3, 1, 4, 5, 9, 2, 6]), (it) => it % 2 === 0))
})

func('lowerNotBlank', () => {
  kase('empty', () => lowerNotBlank([]))
  kase('mixed', () => lowerNotBlank(['  ABC ', '', '   ', 'Déjà Vu', '\tTab\n']))
  kase('unicode spaces', () => lowerNotBlank([' ', ' x ', '\u001C', '﻿', '​', '　Ab　', '\u0085']))
  kase('special lowercase', () => lowerNotBlank(['İSTANBUL', 'ΣΑΣ', 'ΌΣΟΣ Σ', 'ǅ', 'ẞ', 'Ⅻ', 'ＡＢＣ']))
  kase('keeps order and duplicates', () => lowerNotBlank(['b', 'A', 'b', 'a']))
})

func('notEquals', () => {
  const a = LocalDateTime.of(2021, 1, 1, 10, 0, 0, 123_456_789)
  kase('same', () => notEquals(a, a))
  kase('below millis', () => notEquals(a, a.withNano(123_999_999)))
  kase('different millis', () => notEquals(a, a.withNano(124_000_000)))
  kase('seconds precision, same', () => notEquals(a, a.withNano(999_000_000), ChronoUnit.SECONDS))
  kase('seconds precision, different', () => notEquals(a, a.plusSeconds(1), ChronoUnit.SECONDS))
  kase('days precision', () => notEquals(a, a.withHour(23), ChronoUnit.DAYS))
  kase('nanos precision', () => notEquals(a, a.plusNanos(1), ChronoUnit.NANOS))
  kase('minutes precision', () => notEquals(a, a.plusSeconds(59), ChronoUnit.MINUTES))
  kase('hours precision', () => notEquals(a, a.plusMinutes(60), ChronoUnit.HOURS))
  // js-joda lève DateTimeException (même message) où Java lève sa sous-classe UnsupportedTemporalTypeException ;
  // Komga ne tronque jamais au-delà du jour
  deviation('months precision (unsupported)', 'js-joda: DateTimeException instead of UnsupportedTemporalTypeException')
})

func('stripAccents', () => {
  const inputs = new Map([
    ['empty', ''],
    ['ascii', 'Hello, World!'],
    ['latin', 'éàüçÉÀÜÇ ñÑ ÿ'],
    ['angstrom', 'Ångström'],
    ['remaining', 'Đakovo đ Łódź ł Ŧŧ Ɨɨ Ʉʉ ᵻᵾ'],
    ['not decomposable', 'øØæÆœŒßı'],
    ['ligatures and compat', 'ﬁﬂ ① Ⅻ x² ½ ＡＢ ㎏'],
    ['hangul', '한국어'],
    ['japanese', 'がぎぐ パピプ'],
    ['vietnamese', 'Tiếng Việt'],
    ['greek', 'Άλφα ΐ ϊ'],
    ['cyrillic', 'Йй Ёё'],
    ['combining outside block', 'a᪰ e⃝ o᷀ u︠'],
    ['lone combining', '́abc̈'],
    ['emoji', '😀 👍🏽 é'],
    ['arabic', 'مَرْحَبًا'],
    ['hebrew', 'שָׁלוֹם'],
    ['devanagari', 'क़'],
    ['titlecase', 'ǅ ǈ'],
  ])
  for (const [name, s] of inputs) kase(name, () => stripAccents(s))
})

func('toDate', () => {
  kase('2020-01-01', () => toDate(LocalDate.of(2020, 1, 1)))
  kase('epoch', () => toDate(LocalDate.of(1970, 1, 1)))
  kase('before epoch', () => toDate(LocalDate.of(1900, 2, 28)))
  kase('leap day', () => toDate(LocalDate.of(2024, 2, 29)))
  kase('dst day', () => toDate(LocalDate.of(2021, 3, 28)))
  kase('year 1', () => toDate(LocalDate.of(1, 1, 1)))
  kase('year 9999', () => toDate(LocalDate.of(9999, 12, 31)))
})

func('toUTC', () => {
  for (const [name, d] of dates) kase(name, () => toUTC(d))
})
func('toUTCZoned', () => {
  for (const [name, d] of dates) kase(name, () => toUTCZoned(d))
})
func('toZonedDateTime', () => {
  for (const [name, d] of dates) kase(name, () => toZonedDateTime(d))
})
func('toCurrentTimeZone', () => {
  for (const [name, d] of dates) kase(name, () => toCurrentTimeZone(d))
})

// Kotlin `Iterable<String>.contains(s, ignoreCase)` = containsString (nom distinct de contains de port/kotlin)
func('contains', () => {
  const l = ['Alpha', 'beta', 'ÉTÉ', 'straße', 'İ', 'σ', 'ǅ', '']
  const queries = ['Alpha', 'alpha', 'BETA', 'été', 'STRASSE', 'i', 'ς', 'Σ', 'ǆ', 'Ǆ', '', ' ', 'gamma']
  for (const q of queries) {
    kase(`'${q}' case sensitive`, () => containsString(l, q))
    kase(`'${q}' ignore case`, () => containsString(l, q, true))
  }
  kase('empty list', () => containsString([], '', true))
  kase('set', () => containsString(new Set(['a', 'B']), 'b', true))
})
