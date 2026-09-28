// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/BCP47TagValidatorTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { BCP47TagValidator } from '../../../src/domain/model/BCP47TagValidator.js'

describe('BCP47TagValidatorTest', () => {
  it.each(languagesNormalized())('given source languageTag when normalizing then result is expected', (source, expected) => {
    expect(BCP47TagValidator.normalize(source)).toBe(expected)
  })

  function languagesNormalized(): [string | null, string][] {
    return [
      [null, ''],
      ['', ''],
      ['fra', 'fr'],
      ['fra-be', 'fr-BE'],
      ['JA', 'ja'],
      ['en-us', 'en-US'],
      ['zh-Hans', 'zh-Hans'],
      ['zh-HK', 'zh-HK'],
    ]
  }

  it.each(languagesValid())('given source languageTag when validating then result is expected', (source, expected) => {
    expect(BCP47TagValidator.isValid(source)).toBe(expected)
  })

  function languagesValid(): [string | null, boolean][] {
    return [
      [null, false],
      ['', false],
      ['fra', true],
      ['fra-BE', true],
      ['en-us', true],
      ['JA', true],
      ['jp-JP', false],
      ['ja-JP', true],
      ['zh-Hans', true],
    ]
  }
})
