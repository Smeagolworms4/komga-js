// String.toIntOrNull() / String.toFloatOrNull() de la stdlib Kotlin (JVM) et java.net.URI(str).getHost() :
// résultats relevés sur les vraies bibliothèques (jshell, tools/jshell-komga.sh).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseJavaUri } from '../../src/port/java-uri.js'
import { toFloatOrNull, toIntOrNull } from '../../src/port/kotlin-numbers.js'

const oracle = JSON.parse(readFileSync(new URL('./fixtures/kotlin-numbers-java-uri.json', import.meta.url), 'utf8')) as {
  nums: { in: string; int: number | null; float: number | string | null }[]
  uris: { in: string; ok: boolean; host?: string | null }[]
}

function floatBits(f: number): number | string {
  if (Number.isNaN(f)) return 'NaN'
  if (!Number.isFinite(f)) return f > 0 ? 'Infinity' : '-Infinity'
  const b = new DataView(new ArrayBuffer(4))
  b.setFloat32(0, f)
  return b.getInt32(0)
}

describe('kotlin-numbers', () => {
  it('toIntOrNull matches Kotlin', () => {
    expect(oracle.nums.filter((o) => toIntOrNull(o.in) !== o.int)).toEqual([])
  })

  it('toFloatOrNull matches Kotlin', () => {
    expect(
      oracle.nums.filter((o) => {
        const f = toFloatOrNull(o.in)
        return (f === null ? null : floatBits(f)) !== o.float
      }),
    ).toEqual([])
  })

  it('java.net.URI parsing and host match Java', () => {
    expect(
      oracle.uris.filter((o) => {
        try {
          const p = parseJavaUri(o.in)
          return !o.ok || p.host !== o.host
        } catch {
          return o.ok
        }
      }),
    ).toEqual([])
  })
})
