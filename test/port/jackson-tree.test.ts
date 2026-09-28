// Vérifie le formatage des nombres et l'arbre JSON façon Jackson contre des valeurs produites par la JVM (JDK 21).
// Fixture : <bits hex du double>|Double.toString(d)|Float.toString((float) d), générée avec jshell.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { javaDoubleToString, javaFloatToString, readTree, writeTree } from '../../src/port/jackson-tree.js'

describe('jackson-tree', () => {
  it('Double.toString and Float.toString match the JVM on 20018 values', () => {
    const lines = gunzipSync(readFileSync('test/port/fixtures/java-number-tostring.txt.gz')).toString('utf8').trim().split('\n')
    const b = new DataView(new ArrayBuffer(8))
    const mismatches: string[] = []
    for (const l of lines) {
      const [hex, jd, jf] = l.split('|') as [string, string, string]
      b.setBigUint64(0, BigInt(`0x${hex}`))
      const d = b.getFloat64(0)
      if (javaDoubleToString(d) !== jd || javaFloatToString(d) !== jf) mismatches.push(`${d}: java ${jd} ${jf}`)
    }
    expect(lines.length).toBe(20018)
    expect(mismatches).toEqual([])
  })

  it('readTree/writeTree keep number kinds, key order and Jackson escaping', () => {
    const json = '{"b":1,"2":1.0,"a":[0.0001,10000000,1e2,-0,12345678901234567890],"s":"é\\u0001\\n/"}'
    expect(writeTree(readTree(json))).toBe('{"b":1,"2":1.0,"a":[1.0E-4,10000000,100.0,0,12345678901234567890],"s":"é\\u0001\\n/"}')
  })
})
