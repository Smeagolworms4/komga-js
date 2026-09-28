// ZipExtractor / RarExtractor : résultats relevés sur les vraies classes Komga (jshell, tools/jshell-komga.sh) :
// getEntries(path, false) (noms, types, tailles, commentaires d'erreur, ordre naturel) puis getEntryStream pour
// chaque entrée (longueur et CRC32 des octets, ou exception).
//  - zip : archives de test/port/fixtures/zip (méthodes, chiffrement, noms, ZIP64, archives cassées...) ;
//  - rar : fixtures/rar (RAR4/RAR5, solides, chiffrées, multi-volumes, noms `\`/`/`/UTF-8/ISO-8859-1, doublons,
//    CRC d'en-tête ou de données faux, archives tronquées, signature future, fichier non RAR).
// Écart connu : IMPLODING (zip, PKZIP 1.x) non porté.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { MediaUnsupportedException } from '../../../../src/domain/model/Exceptions.js'
import { ContentDetector } from '../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import type { DivinaExtractor } from '../../../../src/infrastructure/mediacontainer/divina/DivinaExtractor.js'
import { RarExtractor } from '../../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import { ZipExtractor } from '../../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import { setLogLevel } from '../../../../src/port/logging.js'
import { TikaConfig } from '../../../../src/port/tika.js'

const NOT_PORTED = new Set(['implode-method.zip'])

function check(ex: DivinaExtractor, dir: string, jsonl: string, expectedCount: number): void {
  const lines = readFileSync(jsonl, 'utf8').trim().split('\n')
  const mismatches: string[] = []
  for (const line of lines) {
    const exp = JSON.parse(line) as { file: string }
    if (NOT_PORTED.has(exp.file)) continue
    const p = `${dir}/${exp.file}`
    const res: Record<string, unknown> = { file: exp.file }
    try {
      res.entries = ex.getEntries(p, false).map((e) => {
        const m: Record<string, unknown> = { name: e.name, mediaType: e.mediaType, fileSize: e.fileSize, comment: e.comment }
        try {
          const b = ex.getEntryStream(p, e.name)
          m.len = b.length
          m.crc = crc32(b)
        } catch (t) {
          const x = t as Error
          m.streamErr = `${x.constructor.name}: ${x.message === '' ? 'null' : x.message}`
        }
        return m
      })
    } catch (t) {
      if (t instanceof MediaUnsupportedException) res.unsupported = t.code
      else res.error = (t as Error).constructor.name
    }
    if (JSON.stringify(res) !== JSON.stringify(exp)) mismatches.push(`java=${JSON.stringify(exp)}\nts  =${JSON.stringify(res)}`)
  }
  expect(mismatches).toEqual([])
  expect(lines.length).toBe(expectedCount)
}

describe('DivinaExtractorOracle', () => {
  setLogLevel('ERROR')
  const contentDetector = new ContentDetector(new TikaConfig())
  const imageAnalyzer = { getDimension: () => null } as never

  it('ZipExtractor gives the same entries and contents as Komga', () => {
    check(new ZipExtractor(contentDetector, imageAnalyzer), fileURLToPath(new URL('../../../port/fixtures/zip', import.meta.url)), fileURLToPath(new URL('../fixtures/zip-extractor.java.jsonl', import.meta.url)), 42)
  })

  it('RarExtractor gives the same entries and contents as Komga', () => {
    check(new RarExtractor(contentDetector, imageAnalyzer), fileURLToPath(new URL('../fixtures/rar', import.meta.url)), fileURLToPath(new URL('../fixtures/rar.java.jsonl', import.meta.url)), 25)
  })
})
