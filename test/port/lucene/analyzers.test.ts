// Test différentiel : jetons produits par MultiLingualAnalyzer et MultiLingualNGramAnalyzer(3, 10, true) de Komga
// (Lucene 9.9.1, relevés par tools/jshell-komga.sh) comparés à ceux du portage.
// fixtures/analyzer-tokens.json.gz :
// - full : chaînes choisies à la main + chaînes aléatoires (latin accentué, CJK, kana, hangul, thaï, emoji, chiffres,
//   ponctuation, formes pleine/demi-chasse...), avec tous les jetons [terme, incrément de position, début, fin, type]
//   et le résultat de Analyzer.normalize ;
// - sweep : empreintes SHA-1 des jetons pour un balayage de tous les points de code (plans 0-2, 14, 16).
// Ce fichier n'a pas de jumeau Kotlin.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { Analyzer } from '../../../src/port/lucene/analysis.js'
import { MultiLingualAnalyzer } from '../../../src/infrastructure/search/MultiLingualAnalyzer.js'
import { MultiLingualNGramAnalyzer } from '../../../src/infrastructure/search/MultiLingualNGramAnalyzer.js'

type Tok = [string, number, number, number, string]
type Fixture = {
  full: { text: string; std: Tok[]; ngram: Tok[]; normalize: string }[]
  sweep: [string, string, string][]
}

const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/analyzer-tokens.json.gz', import.meta.url))).toString('utf8')) as Fixture

function tokens(a: Analyzer, text: string): Tok[] {
  const out: Tok[] = []
  const ts = a.tokenStream('text', text)
  const at = ts.attributes
  ts.reset()
  while (ts.incrementToken()) out.push([at.termAtt.toString(), at.positionIncrement, at.startOffset, at.endOffset, at.type])
  ts.end()
  out.push(['<END>', at.positionIncrement, at.startOffset, at.endOffset, ''])
  ts.close()
  return out
}

function digest(toks: unknown[][]): string {
  let s = ''
  for (const t of toks) {
    for (const x of t) s += `${x}\u0001`
    s += '\u0002'
  }
  // String.getBytes(UTF_8) de Java remplace les demi-codets isolés par '?'
  const wellFormed = s.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '?')
  return createHash('sha1').update(Buffer.from(wellFormed, 'utf8')).digest('hex')
}

/** mêmes chaînes que le générateur du relevé Java */
function sweepInputs(): string[] {
  const sweep: string[] = []
  for (let base = 0; base <= 0x10ffff; base += 64) {
    if (base >= 0x30000 && base < 0xe0000) continue
    if (base >= 0xe1000 && base < 0x10fff0) continue
    let s = ''
    for (let cp = base; cp < base + 64 && cp <= 0x10ffff; cp++) {
      const c = String.fromCodePoint(cp)
      s += `a${c}b ${c}${c} 1${c} ${c}　`
    }
    sweep.push(s)
  }
  return sweep
}

describe('Lucene analyzers (differential vs Lucene 9.9.1)', () => {
  const std = new MultiLingualAnalyzer()
  const ngram = new MultiLingualNGramAnalyzer(3, 10, true)

  it('produces the same tokens as Komga on the corpus', () => {
    const mismatches: string[] = []
    for (const e of fixture.full) {
      const a = tokens(std, e.text)
      const b = tokens(ngram, e.text)
      if (JSON.stringify(a) !== JSON.stringify(e.std)) mismatches.push(`std ${JSON.stringify(e.text)}: ${JSON.stringify(a)} != ${JSON.stringify(e.std)}`)
      if (JSON.stringify(b) !== JSON.stringify(e.ngram)) mismatches.push(`ngram ${JSON.stringify(e.text)}: ${JSON.stringify(b)} != ${JSON.stringify(e.ngram)}`)
      const n = std.normalizeText('f', e.text)
      if (n !== e.normalize) mismatches.push(`normalize ${JSON.stringify(e.text)}: ${JSON.stringify(n)} != ${JSON.stringify(e.normalize)}`)
    }
    expect(fixture.full.length).toBeGreaterThan(3000)
    expect(mismatches.slice(0, 20)).toEqual([])
  }, 60_000)

  it('produces the same tokens as Komga on every code point', () => {
    const inputs = sweepInputs()
    expect(inputs.length).toBe(fixture.sweep.length)
    const mismatches: string[] = []
    inputs.forEach((s, i) => {
      const [dStd, dNgram, dNorm] = fixture.sweep[i] as [string, string, string]
      const base = (s.codePointAt(1) as number).toString(16)
      if (digest(tokens(std, s)) !== dStd) mismatches.push(`std block U+${base}`)
      if (digest(tokens(ngram, s)) !== dNgram) mismatches.push(`ngram block U+${base}`)
      if (digest([[std.normalizeText('f', s)]]) !== dNorm) mismatches.push(`normalize block U+${base}`)
    })
    expect(mismatches.slice(0, 50)).toEqual([])
  }, 120_000)
})
