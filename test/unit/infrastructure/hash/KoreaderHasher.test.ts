// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/hash/KoreaderHasherOracleTest.kt
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { KoreaderHasher } from '../../../../src/infrastructure/hash/KoreaderHasher.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/hash/KoreaderHasher')

const hasher = new KoreaderHasher()
const sizes = [0, 1, 100, 1023, 1024, 1025, 2048, 4095, 4096, 4097, 16384, 70000, 262144, 262145, 1_100_000, 4_194_305]

func('computeHash', () => {
  for (const n of sizes) {
    kase(`file of ${n} bytes`, () => {
      const f = join(tempDir(), `koreader-${n}`)
      writeFileSync(f, oracleBytes(n))
      return hasher.computeHash(f)
    })
  }
  kase('missing file', () => exceptionType(() => hasher.computeHash(join(tempDir(), 'missing'))))
})

func('partialMd5', () => {
  kase('via computeHash, 5000 bytes', () => {
    const f = join(tempDir(), 'koreader-partial')
    writeFileSync(f, oracleBytes(5000))
    return hasher.computeHash(f)
  })
})
