// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/search/MultiLingualAnalyzerOracleTest.kt
import { MultiLingualAnalyzer } from '../../../../src/infrastructure/search/MultiLingualAnalyzer.js'
import { oracle } from '../../oracle.js'
import { texts, tokens } from './searchSamples.js'

const { func, kase } = oracle('infrastructure/search/MultiLingualAnalyzer')

const analyzer = new MultiLingualAnalyzer()

// par Analyzer.tokenStream
func('createComponents', () => {
  for (const t of texts) kase(`'${t.slice(0, 40)}' (${t.length})`, () => tokens(analyzer, t))
  kase('other field name', () => tokens(analyzer, 'Batman Year One', 'isbn'))
})

// par Analyzer.normalize(field, text)
func('normalize', () => {
  for (const t of texts) kase(`'${t.slice(0, 40)}' (${t.length})`, () => analyzer.normalizeText('title', t))
})
