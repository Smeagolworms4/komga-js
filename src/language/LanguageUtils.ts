// @port-of komga/src/main/kotlin/org/gotson/komga/language/LanguageUtils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '@js-joda/timezone'
import { ChronoUnit, LocalDate, LocalDateTime, ZoneId, ZoneOffset, ZonedDateTime, type TemporalUnit } from '@js-joda/core'
import { SortedMap } from '../port/extra-metadata.js'
import { NoSuchElementException, equalsIgnoreCase, isNotBlank, LinkedHashMap, maxByOrNull, trim } from '../port/kotlin.js'

export function toIndexedMap<T>(list: readonly T[]): SortedMap<number, T> {
  const m = new SortedMap<number, T>()
  list.forEach((e, i) => m.set(i, e))
  return m
}

export interface Enumeration<T> {
  hasMoreElements(): boolean
  nextElement(): T
}

export function toEnumeration<T>(list: readonly T[]): Enumeration<T> {
  return new (class implements Enumeration<T> {
    count = 0

    hasMoreElements(): boolean {
      return this.count < list.length
    }

    nextElement(): T {
      if (this.count < list.length) {
        return list[this.count++] as T
      }
      throw new NoSuchElementException('List enumeration asked for more elements than present')
    }
  })()
}

export function mostFrequent<T, R>(list: Iterable<T>, transform: (t: T) => R | null | undefined): R | null {
  // PORT: groupingBy { it }.eachCount() -> LinkedHashMap (ordre d'insertion, clés comparées par equals())
  const counts = new LinkedHashMap<R, number>()
  for (const e of list) {
    const r = transform(e)
    if (r !== null && r !== undefined) counts.set(r, (counts.get(r) ?? 0) + 1)
  }
  return maxByOrNull(counts, ([, v]) => v)?.[0] ?? null
}

export function lowerNotBlank(list: Iterable<string>): string[] {
  return [...list].map((it) => trim(it.toLowerCase())).filter((it) => isNotBlank(it))
}

export function notEquals(
  self: LocalDateTime,
  other: LocalDateTime,
  precision: TemporalUnit = ChronoUnit.MILLIS,
): boolean {
  return !self.truncatedTo(precision).equals(other.truncatedTo(precision))
}

// PORT: StringUtils.stripAccents (commons-lang3 3.20.0) = NFKD, convertRemainingAccentCharacters,
// puis suppression de \p{InCombiningDiacriticalMarks} (U+0300..U+036F). Table vérifiée avec la lib Java.
const REMAINING_ACCENTS: Record<string, string> = {
  'Đ': 'D',
  'đ': 'd',
  'Ł': 'L',
  'ł': 'l',
  'Ŧ': 'T',
  'ŧ': 't',
  'Ɨ': 'I',
  'Ʉ': 'U',
  'ɨ': 'i',
  'ʉ': 'u',
  'ᵻ': 'I',
  'ᵾ': 'U',
}

/**
 * Warning: This affects the Unicode code points of Korean Hangul.
 */
export function stripAccents(s: string): string {
  if (s.length === 0) return s
  return s
    .normalize('NFKD')
    .replace(/[ĐđŁłŦŧƗɄɨʉᵻᵾ]/g, (c) => REMAINING_ACCENTS[c] ?? c)
    .replace(/[̀-ͯ]+/g, '')
}

export function toDate(self: LocalDate): Date {
  return new Date(self.atStartOfDay(ZoneId.of('Z')).toInstant().toEpochMilli())
}

/**
 * Converts a LocalDateTime (current timezone) to a LocalDateTime (UTC)
 * Warning: this is not idempotent
 */
export function toUTC(self: LocalDateTime): LocalDateTime {
  return self.atZone(ZoneId.systemDefault()).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime()
}

/**
 * Converts a LocalDateTime (current timezone) to a ZonedDateTime
 */
export function toUTCZoned(self: LocalDateTime): ZonedDateTime {
  return self.atZone(ZoneId.systemDefault()).withZoneSameInstant(ZoneOffset.UTC)
}

/**
 * Converts a LocalDateTime (UTC) to a ZonedDateTime
 */
export function toZonedDateTime(self: LocalDateTime): ZonedDateTime {
  return self.atZone(ZoneId.of('Z')).withZoneSameInstant(ZoneId.systemDefault())
}

/**
 * Converts a LocalDateTime (UTC) to a LocalDateTime (current timezone)
 */
export function toCurrentTimeZone(self: LocalDateTime): LocalDateTime {
  return self.atZone(ZoneId.of('Z')).withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime()
}

export function containsString(list: Iterable<string>, s: string, ignoreCase: boolean = false): boolean {
  for (const it of list) if (ignoreCase ? equalsIgnoreCase(it, s) : it === s) return true
  return false
}
