// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/TestUtils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ChronoUnit, type LocalDateTime } from '@js-joda/core'
import { expect } from 'vitest'

// PORT: within(3, ChronoUnit.SECONDS) d'AssertJ -> assertion isCloseTo
export const offset = { amount: 3, unit: ChronoUnit.SECONDS }

/** `assertThat(actual).isCloseTo(expected, offset)` */
export function expectCloseTo(actual: LocalDateTime, expected: LocalDateTime, o: typeof offset = offset): void {
  const diff = Math.abs(actual.until(expected, o.unit))
  expect(diff, `${actual} close to ${expected} within ${o.amount} ${o.unit}`).toBeLessThanOrEqual(o.amount)
}
