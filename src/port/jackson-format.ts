// Support de portage : `@JsonFormat(pattern = ...)` sur les types java.time (sérialiseurs JSR-310 de Jackson avec
// un DateTimeFormatter.ofPattern(pattern)). Ce fichier n'a pas de jumeau Kotlin.
import { DateTimeFormatter, LocalDate, LocalDateTime } from '@js-joda/core'
import type { JsonType } from './jackson-mapper.js'

/** `@JsonFormat(pattern = "...")` sur une propriété `LocalDateTime` */
export function jsonFormatLocalDateTime(pattern: string): JsonType {
  const f = DateTimeFormatter.ofPattern(pattern)
  return {
    scalar: `LocalDateTime(${pattern})`,
    read: (s: string) => LocalDateTime.parse(s, f),
    write: (v: LocalDateTime) => v.format(f),
  }
}

/** `@JsonFormat(pattern = "...")` sur une propriété `LocalDate` */
export function jsonFormatLocalDate(pattern: string): JsonType {
  const f = DateTimeFormatter.ofPattern(pattern)
  return {
    scalar: `LocalDate(${pattern})`,
    read: (s: string) => LocalDate.parse(s, f),
    write: (v: LocalDate) => v.format(f),
  }
}
