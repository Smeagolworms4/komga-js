// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/search/MultilingualAnalyzerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { MultiLingualAnalyzer } from '../../../src/infrastructure/search/MultiLingualAnalyzer.js'
import { getTokens } from './Utils.js'

describe('MultilingualAnalyzerTest', () => {
  const analyzer = new MultiLingualAnalyzer()

  it('english text', () => {
    // given
    const text = 'The incredible adventures of Batman, the man who is also a bat!'

    // when
    const tokens = getTokens(analyzer, text)

    // then
    expect(tokens).toEqual(['the', 'incredible', 'adventures', 'of', 'batman', 'the', 'man', 'who', 'is', 'also', 'a', 'bat'])
  })

  it('accents', () => {
    // given
    const text = 'Éric èl rojo'

    // when
    const tokens = getTokens(analyzer, text)

    // then
    expect([...tokens].sort()).toEqual(['eric', 'el', 'rojo'].sort())
  })

  it('isbn', () => {
    // given
    const text = '9782413016878'

    // when
    const tokens = getTokens(analyzer, text)

    // then
    expect(tokens).toEqual(['9782413016878'])
  })

  it('single letter', () => {
    // given
    const text = 'J'

    // when
    const tokens = getTokens(analyzer, text)

    // then
    expect(tokens).toEqual(['j'])
  })

  it('chinese mixed', () => {
    // given
    const text = '[不道德公會][河添太一 ][東立]Vol.04-搬运'

    // when
    const tokens = getTokens(analyzer, text)

    // then
    expect(tokens).toEqual(['不道', '道德', '德公', '公會', '河添', '添太', '太一', '東立', 'vol', '04', '搬运'])
  })

  it('chinese only', () => {
    // given
    const text = '不道德公會河添太一東立搬运'

    // when
    const tokens = getTokens(analyzer, text)

    // then
    expect(tokens).toEqual(['不道', '道德', '德公', '公會', '會河', '河添', '添太', '太一', '一東', '東立', '立搬', '搬运'])
  })

  it('hiragana only', () => {
    // given
    const text = '探偵はもう、死んでいる。'

    // when
    const tokens = getTokens(analyzer, text)

    // then
    expect(tokens).toEqual(['探偵', '偵は', 'はも', 'もう', '死ん', 'んで', 'でい', 'いる'])
  })

  it('katakana only', () => {
    // given
    const text = 'ワンパンマン'

    // when
    const tokens = getTokens(analyzer, text)

    // then
    expect(tokens).toEqual(['ワン', 'ンパ', 'パン', 'ンマ', 'マン'])
  })

  it('korean only', () => {
    // given
    const text = '고교생을 환불해 주세요'

    // when
    const tokens = getTokens(analyzer, text)

    // then
    expect(tokens).toEqual(['고교', '교생', '생을', '환불', '불해', '주세', '세요'])
  })
})
