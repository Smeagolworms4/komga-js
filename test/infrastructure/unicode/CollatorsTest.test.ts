// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/unicode/CollatorsTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { Collators } from '../../../src/infrastructure/unicode/Collators.js'

describe('CollatorsTest', () => {
  it('collator1', () => {
    expect(Collators.collator1.compare('café', 'cafe')).toBe(0) // accents ignored
    expect(Collators.collator1.compare('CAFE', 'cafe')).toBe(0) // case ignored
    expect(Collators.collator1.compare('안녕하세요', '안녕하세요')).toBe(0) // hangul
    expect(Collators.collator1.compare('あ', 'ア')).toBe(0) // katakana = hiragana
    expect(Collators.collator1.compare('が', 'か')).toBe(0) // dakuten
  })

  it('collator3', () => {
    expect(Collators.collator3.compare('café', 'cafe')).not.toBe(0) // accents not ignored
    expect(Collators.collator3.compare('CAFE', 'cafe')).not.toBe(0) // case not ignored
    expect(Collators.collator3.compare('안녕하세요', '안녕하세요')).toBe(0) // hangul
    expect(Collators.collator3.compare('あ', 'ア')).not.toBe(0) // katakana != hiragana
  })
})
