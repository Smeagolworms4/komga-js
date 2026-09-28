// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/search/Utils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Analyzer } from '../../../src/port/lucene/analysis.js'

export function getTokens(self: Analyzer, text: string): string[] {
  const tokenStream = self.tokenStream('text', text)

  const tokens: string[] = []
  // use
  const ts = tokenStream
  try {
    ts.reset()
    while (ts.incrementToken()) {
      ts.reflectWith((_, key, value) => {
        if (key === 'term') tokens.push(String(value))
      })
    }
    ts.end()
  } finally {
    ts.close()
  }

  return tokens
}
