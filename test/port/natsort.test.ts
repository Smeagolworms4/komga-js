// net.greypanther.natsort 1.1 : résultats relevés sur la vraie bibliothèque (jshell, tools/jshell-komga.sh)
// pour toutes les paires d'un jeu de chaînes (chiffres, casse, Unicode, débordement de long...).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CaseInsensitiveSimpleNaturalComparator, SimpleNaturalComparator } from '../../src/port/natsort.js'

const oracle = JSON.parse(readFileSync(new URL('./fixtures/natsort-oracle.json', import.meta.url), 'utf8')) as { strings: string[]; results: string }

describe('natsort', () => {
  it('CaseInsensitiveSimpleNaturalComparator and SimpleNaturalComparator match natural-comparator 1.1', () => {
    const ci = CaseInsensitiveSimpleNaturalComparator.getInstance()
    const cs = SimpleNaturalComparator.getInstance()
    const expected = oracle.results.split(';')
    const mismatches: string[] = []
    let k = 0
    for (const a of oracle.strings)
      for (const b of oracle.strings) {
        const got = `${Math.sign(ci(a, b))},${Math.sign(cs(a, b))}`
        if (got !== expected[k]) mismatches.push(`${JSON.stringify(a)} ${JSON.stringify(b)} java=${expected[k]} ts=${got}`)
        k++
      }
    expect(k).toBe(expected.length)
    expect(mismatches).toEqual([])
  })
})
