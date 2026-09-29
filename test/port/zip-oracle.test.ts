// Vérification de port/commons-compress.ts (ZipFile, voir zip.ts) et de infrastructure/util/ZipFileUtils.getZipEntryBytes contre
// commons-compress 1.28 et la fonction Kotlin de Komga (jshell) : toutes les archives zip/epub/cbz de test/resources,
// dont les archives construites dans test/resources/port/zip (champs Unicode Path local / central, noms FAT, UTF-8 invalide,
// doublons, données préfixées, archive tronquée, fichier non zip). Contenu comparé par empreinte XXH3-128 (Hasher).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Hasher } from '../../src/infrastructure/hash/Hasher.js'
import { getZipEntryBytes } from '../../src/infrastructure/util/ZipFileUtils.js'
import { ZipFile } from '../../src/port/commons-compress.js'
import { ByteArrayInputStream } from '../../src/port/java-io.js'

type Err = { error: string; message: string }
const here = dirname(fileURLToPath(import.meta.url))
const oracle = JSON.parse(readFileSync(join(here, 'fixtures/zip-oracle.json'), 'utf8')) as {
  open: { file: string; ignoreLFH: boolean; result: Err | { name: string; size: number; dir: boolean; method: number; data: string | Err | null; getEntry: boolean }[] }[]
  getZipEntryBytes: { file: string; name: string; result: string | Err }[]
}
const resources = join(here, '../resources')
const hasher = new Hasher()
const err = (e: unknown): Err => ({ error: (e as Error).constructor.name, message: (e as Error).message })

describe('zip oracle', () => {
  it('ZipFile entries and contents match commons-compress', () => {
    for (const o of oracle.open) {
      let actual: unknown
      try {
        const zip = ZipFile.builder().setPath(join(resources, o.file)).setIgnoreLocalFileHeader(o.ignoreLFH).get()
        try {
          actual = zip.getEntries().map((e) => {
            let data: string | Err | null = null
            if (!e.isDirectory())
              try {
                data = hasher.computeHash(new ByteArrayInputStream(zip.getInputStream(e).readAllBytes()))
              } catch (x) {
                data = err(x)
              }
            return { name: e.name, size: e.size, dir: e.isDirectory(), method: e.method, data, getEntry: zip.getEntry(e.name) === e }
          })
        } finally {
          zip.close()
        }
      } catch (x) {
        actual = err(x)
      }
      expect(actual, `${o.file} ignoreLFH=${o.ignoreLFH}`).toEqual(o.result)
    }
  })

  it('getZipEntryBytes matches Komga', async () => {
    for (const o of oracle.getZipEntryBytes) {
      let actual: string | Err
      try {
        actual = hasher.computeHash(new ByteArrayInputStream(await getZipEntryBytes(join(resources, o.file), o.name)))
      } catch (x) {
        actual = err(x)
      }
      expect(actual, `${o.file} ${o.name}`).toEqual(o.result)
    }
  })
})
