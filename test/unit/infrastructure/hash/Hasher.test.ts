// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/hash/HasherOracleTest.kt
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hasher } from '../../../../src/infrastructure/hash/Hasher.js'
import { ByteArrayInputStream } from '../../../../src/port/java-io.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/hash/Hasher')

const hasher = new Hasher()
const sizes = [0, 1, 15, 16, 17, 128, 129, 240, 241, 1024, 8191, 8192, 8193, 20000, 100_000]

func('computeHash@17', () => {
  for (const n of sizes) {
    kase(`file of ${n} bytes`, () => {
      const f = join(tempDir(), `file-${n}`)
      writeFileSync(f, oracleBytes(n))
      return hasher.computeHash(f)
    })
  }
  kase('missing file', () => exceptionType(() => hasher.computeHash(join(tempDir(), 'missing'))))
})

// PORT: surcharge computeHash(string: String) = computeHashOfString
func('computeHash@23', () => {
  for (const s of ['', 'a', 'komga', 'é', '日本語', '😀', 'a'.repeat(10000), 'line1\nline2\r\n']) {
    // Kotlin s.take(20) : 20 unités UTF-16
    kase(`'${s.slice(0, 20)}' (${s.length})`, () => hasher.computeHashOfString(s))
  }
})

func('computeHash@25', () => {
  for (const n of sizes) kase(`stream of ${n} bytes`, () => hasher.computeHash(new ByteArrayInputStream(oracleBytes(n))))
})

func('toHexString', () => {
  kase('empty', () => hasher.toHexString(new Uint8Array(0)))
  kase('all bytes', () => hasher.toHexString(Uint8Array.from({ length: 256 }, (_, i) => i)))
})
