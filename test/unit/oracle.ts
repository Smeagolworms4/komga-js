// Support des tests unitaires à oracle (sans jumeau Kotlin).
//
// Chaque fichier `test/unit/<p>/X.test.ts` rejoue, sur la fonction portée, les cas enregistrés par le test Kotlin
// `org.gotson.komga.oracle.<p>.XOracleTest` (fork Komga, branche unit-oracles) dans `test/unit/fixtures/<p>/X.json`,
// et exige la même forme canonique (voir canon.ts). Même structure qu'en Kotlin :
//
//   const { func, kase } = oracle('language/LanguageUtils')
//   func('toIndexedMap', () => {
//     kase('empty', () => toIndexedMap([]))
//   })
//
// `func` = describe au nom exact de la fonction Kotlin ; `kase` = it au nom exact du cas Kotlin
// (clé "<fonction>: <cas>" dans la fixture). Un cas de la fixture qui n'est pas rejoué fait échouer le fichier.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { type Canon, canon, canonThrowable } from './canon.js'

const FIXTURES = new URL('./fixtures/', import.meta.url)

export function oracle(fixture: string) {
  const expected = JSON.parse(readFileSync(new URL(`${fixture}.json`, FIXTURES), 'utf8')) as Record<string, Canon>
  const replayed = new Set<string>()
  let prefix: string | null = null

  it('oracle: every Kotlin case is replayed', () => {
    expect(Object.keys(expected).filter((k) => !replayed.has(k))).toEqual([])
  })

  /** Regroupe les cas de la fonction Kotlin `name` (`func("name") { ... }` côté Kotlin) */
  function func(name: string, block: () => void): void {
    if (prefix !== null) throw new Error('Nested func() is not supported')
    describe(name, () => {
      prefix = name
      try {
        block()
      } finally {
        prefix = null
      }
    })
  }

  function key(name: string): string {
    if (prefix === null) throw new Error('kase() must be called inside func()')
    const k = `${prefix}: ${name}`
    if (replayed.has(k)) throw new Error(`Duplicate oracle case: ${k}`)
    replayed.add(k)
    return k
  }

  /** Rejoue le cas `name` : la forme canonique du résultat (ou de l'exception) doit être celle de la fixture */
  function kase(name: string, block: () => unknown): void {
    const k = key(name)
    it(name, async () => {
      expect(Object.hasOwn(expected, k), `case missing from fixture ${fixture}.json (rerun tools/run-kotlin-oracles.sh)`).toBe(true)
      let actual: Canon
      try {
        actual = canon(await block())
      } catch (e) {
        actual = canonThrowable(e)
      }
      expect(actual).toStrictEqual(expected[k])
    })
  }

  /** Écart assumé (voir PORTING.md, « Écarts connus et assumés ») : le cas est déclaré mais pas comparé */
  function deviation(name: string, reason: string): void {
    const k = key(name)
    it.skip(`${name} (deviation: ${reason})`, () => {
      expect(Object.hasOwn(expected, k)).toBe(true)
    })
  }

  return { func, kase, deviation }
}

/** Contenu déterministe des fichiers de test, même générateur que `oracleBytes` côté Kotlin */
export function oracleBytes(size: number): Uint8Array {
  const b = new Uint8Array(size)
  for (let i = 0; i < size; i++) b[i] = (i * 31 + 7) & 0xff
  return b
}

let tempDirPath: string | null = null
afterAll(() => {
  if (tempDirPath !== null) rmSync(tempDirPath, { recursive: true, force: true })
  tempDirPath = null
})
/** Répertoire temporaire des fichiers des cas (`tempDir` côté Kotlin), supprimé après le fichier de test */
export function tempDir(): string {
  tempDirPath ??= mkdtempSync(join(tmpdir(), 'oracle'))
  return tempDirPath
}

/** Nom de l'exception levée par `block` (null sinon), comme `exceptionType` côté Kotlin */
export async function exceptionType(block: () => unknown): Promise<string | null> {
  try {
    await block()
    return null
  } catch (e) {
    return e instanceof Error ? e.name : typeof e
  }
}
