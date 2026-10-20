// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/koreader/KoreaderUtilsTest.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { describe, expect, it } from 'vitest'
import { KoreaderUtils } from '../../../src/infrastructure/koreader/KoreaderUtils.js'

describe('KoreaderUtilsTest', () => {
  const progressStrings: [string, number | null][] = [
    ['/body/DocFragment[2]/body/section/p[3]/text().0', 1],
    ['/body/DocFragment/body/section/h2/text().0', 0],
    ['/body/body/section/h2/text().0', null],
  ]

  // @ParameterizedTest
  // @MethodSource("progressStrings")
  it.each(progressStrings)('given progress strings when parsing then correct resource is returned', (progress, expected) => {
    const actual = KoreaderUtils.parseResourceIndexFromProgressString(progress)
    expect(actual).toBe(expected)
  })
})
