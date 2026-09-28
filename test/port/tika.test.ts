// Détection Tika (tika-core 3.3.2 avec la configuration de Komga) : résultats relevés sur la vraie bibliothèque
// via ContentDetector de Komga (jshell, tools/jshell-komga.sh) :
//  - fixtures/tika-oracle.json.gz : 828 échantillons fabriqués (une signature par octet magique du registre,
//    texte/binaire, cas limites XML : prologue, DOCTYPE, espaces de noms, UTF-16, UTF-8 invalide, troncature à 64 Kio) ;
//  - fixtures/tika-extensions.tsv : mediaTypeToExtension pour tous les types, alias et sous-types du registre.
// Vérifié aussi hors dépôt sur 9 569 fichiers réels du système (25 par extension) : 0 écart.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ByteArrayInputStream } from '../../src/port/java-io.js'
import { Metadata, TikaConfig } from '../../src/port/tika.js'

describe('tika', () => {
  const tika = new TikaConfig()

  it('detects the same media types as Tika on crafted samples', () => {
    const samples = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/tika-oracle.json.gz', import.meta.url))).toString('utf8')) as { name: string; expected: string; data: string }[]
    const mismatches = samples
      .map((s) => ({ name: s.name, expected: s.expected, got: tika.detector.detect(new ByteArrayInputStream(Buffer.from(s.data, 'base64')), new Metadata()).toString() }))
      .filter((r) => r.got !== r.expected)
    expect(mismatches).toEqual([])
    expect(samples.length).toBe(828)
  })

  it('gives the same extensions as Tika for all registry types', () => {
    const lines = readFileSync(new URL('./fixtures/tika-extensions.tsv', import.meta.url), 'utf8').split('\n').slice(0, -1)
    const mismatches = lines
      .map((l) => {
        const tab = l.lastIndexOf('\t')
        const name = l.substring(0, tab)
        const expected = l.substring(tab + 1)
        let got: string
        try {
          got = tika.mimeRepository.forName(name).getExtension()
        } catch {
          got = '<null>'
        }
        return { name, expected, got }
      })
      .filter((r) => r.got !== r.expected)
    expect(mismatches).toEqual([])
    expect(lines.length).toBeGreaterThan(1800)
  })

  it('resets the stream after detection', () => {
    const s = new ByteArrayInputStream(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]))
    expect(tika.detector.detect(s, new Metadata()).toString()).toBe('image/png')
    expect(s.readBytes().length).toBe(10)
  })
})
