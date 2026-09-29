// Vérification de Hasher / KoreaderHasher contre les empreintes calculées par Komga (JVM).
// Oracle : tools/jshell-komga.sh, Hasher().computeHash(String|Path) et KoreaderHasher().computeHash(Path)
// sur des chaînes choisies et sur tous les fichiers de test/resources (fixtures/hash-oracle.json).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Hasher } from '../../src/infrastructure/hash/Hasher.js'
import { KoreaderHasher } from '../../src/infrastructure/hash/KoreaderHasher.js'
import { ByteArrayInputStream } from '../../src/port/java-io.js'

const here = dirname(fileURLToPath(import.meta.url))
const oracle = JSON.parse(readFileSync(join(here, 'fixtures/hash-oracle.json'), 'utf8')) as {
  strings: { input: string | { repeat: string; count: number }; xxh3_128: string }[]
  files: { path: string; xxh3_128: string; koreader: string }[]
}
const resources = join(here, '../resources')

describe('hash oracle', () => {
  const hasher = new Hasher()
  const koreaderHasher = new KoreaderHasher()

  it('computeHash(String) matches Komga', () => {
    for (const s of oracle.strings) {
      const input = typeof s.input === 'string' ? s.input : s.input.repeat.repeat(s.input.count)
      expect(hasher.computeHashOfString(input), JSON.stringify(s.input).slice(0, 40)).toBe(s.xxh3_128)
    }
  })

  it('computeHash(InputStream) matches Komga', () => {
    expect(hasher.computeHash(ByteArrayInputStream.ofString('hello'))).toBe('b5e9c1ad071b3e7fc779cfaa5e523818')
  })

  it('computeHash(Path) matches Komga', async () => {
    for (const f of oracle.files) expect(await hasher.computeHash(join(resources, f.path)), f.path).toBe(f.xxh3_128)
  })

  it('KoreaderHasher.computeHash(Path) matches Komga', async () => {
    for (const f of oracle.files) expect(await koreaderHasher.computeHash(join(resources, f.path)), f.path).toBe(f.koreader)
  })
})
