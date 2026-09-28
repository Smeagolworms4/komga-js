// EpubExtractor : résultats relevés sur la vraie classe Komga (jshell, tools/jshell-komga.sh) pour les epubs de
// fixtures/epub (epubs de test de Komga et epubs fabriqués : divina KCC avec svg/img, texte au-delà du seuil,
// images dans le spine, kepub avec koboSpan, CRLF et caractères hors BMP, OPF préfixé, OPF dans un sous-dossier,
// couvertures EPUB 2/3, nav/ncx/guide, entités et CDATA, epubs cassés). KepubConverter indisponible.
// Les floats (progressions) sont comparés bit à bit (Float.floatToIntBits).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { Book } from '../../../../src/domain/model/Book.js'
import type { EpubTocEntry } from '../../../../src/domain/model/EpubTocEntry.js'
import { ImageAnalyzer } from '../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ContentDetector } from '../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { epub, getPackageFileContent } from '../../../../src/infrastructure/mediacontainer/epub/Epub.js'
import { EpubExtractor } from '../../../../src/infrastructure/mediacontainer/epub/EpubExtractor.js'
import { setLogLevel } from '../../../../src/port/logging.js'
import { TikaConfig } from '../../../../src/port/tika.js'


const dir = fileURLToPath(new URL('../fixtures/epub', import.meta.url))

function bits(f: number | null | undefined): number {
  const b = new DataView(new ArrayBuffer(4))
  b.setFloat32(0, f as number)
  return b.getInt32(0)
}

function toc(l: EpubTocEntry[]): unknown[] {
  return l.map((e) => ({ title: e.title, href: e.href, children: toc(e.children) }))
}

function safe(f: () => unknown): unknown {
  try {
    return f()
  } catch (t) {
    return `EXC ${(t as Error).constructor.name}`
  }
}

describe('EpubExtractorOracle', () => {
  setLogLevel('ERROR')
  const ex = new EpubExtractor(new ContentDetector(new TikaConfig()), new ImageAnalyzer(), { isAvailable: false } as never, 15)
  const book = {} as Book

  it('gives the same results as Komga on the epub fixtures', () => {
    const lines = readFileSync(`${dir}.java.jsonl`, 'utf8').trim().split('\n')
    const mismatches: string[] = []
    for (const line of lines) {
      const exp = JSON.parse(line) as { file: string }
      const p = `${dir}/${exp.file}`
      const res: Record<string, unknown> = { file: exp.file }
      res.isEpub = ex.isEpub(p)
      res.cover = safe(() => {
        const c = ex.getCover(p)
        return c === null ? null : `${c.mediaType} ${c.bytes.length} ${crc32(c.bytes)}`
      })
      res.packageContentLength = safe(() => getPackageFileContent(p)?.length ?? null)
      try {
        epub(p, (e) => {
          const resources = ex.getResources(e)
          res.resources = resources.map((r) => [r.fileName, r.mediaType, r.subType?.name ?? 'null', r.fileSize])
          const withSize = resources.filter((r) => r.fileSize !== null)
          const isKepub = ex.isKepub(e, withSize)
          res.isKepub = isKepub
          res.toc = safe(() => toc(ex.getToc(e)))
          res.pageList = safe(() => toc(ex.getPageList(e)))
          res.landmarks = safe(() => toc(ex.getLandmarks(e)))
          res.divina = safe(() => ex.getDivinaPages(e, false).map((bp) => [bp.fileName, bp.mediaType, bp.fileSize]))
          const fixed = ex.isFixedLayout(e)
          res.isFixedLayout = fixed
          res.pageCount = ex.computePageCount(e)
          for (let mode = 0; mode < 3; mode++) {
            const fl = mode === 1 ? true : mode === 2 ? false : fixed
            const kp = mode === 2 ? true : isKepub
            res[`positions${mode}`] = safe(() =>
              ex
                .computePositions(e, book, withSize, fl, kp)
                .map((loc) => [loc.href, loc.type, loc.koboSpan, bits(loc.locations?.progression), loc.locations?.position, bits(loc.locations?.totalProgression)]),
            )
          }
        })
      } catch (t) {
        res.epubErr = (t as Error).constructor.name
      }
      if (JSON.stringify(res) !== JSON.stringify(exp)) mismatches.push(`${exp.file}\njava=${JSON.stringify(exp)}\nts  =${JSON.stringify(res)}`)
    }
    expect(mismatches).toEqual([])
    expect(lines.length).toBe(14)
  })
})
