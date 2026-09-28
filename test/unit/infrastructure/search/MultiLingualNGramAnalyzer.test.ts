// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/search/MultiLingualNGramAnalyzerOracleTest.kt
import { MultiLingualNGramAnalyzer } from '../../../../src/infrastructure/search/MultiLingualNGramAnalyzer.js'
import { oracle } from '../../oracle.js'
import { texts, tokens } from './searchSamples.js'

const { func, kase } = oracle('infrastructure/search/MultiLingualNGramAnalyzer')

const settings: [number, number, boolean][] = [
  [3, 10, true],
  [1, 2, false],
  [2, 2, true],
  [1, 1, false],
  [4, 3, true],
  [0, 2, false],
]

// par Analyzer.tokenStream
func('createComponents', () => {
  for (const [min, max, preserve] of settings) {
    const analyzer = new MultiLingualNGramAnalyzer(min, max, preserve)
    for (const t of texts) kase(`${min}-${max}-${preserve} '${t.slice(0, 40)}' (${t.length})`, () => tokens(analyzer, t))
  }
  kase('normalize is inherited', () => new MultiLingualNGramAnalyzer(3, 10, true).normalizeText('title', 'Ｂａｔｍａｎ Été'))
})
