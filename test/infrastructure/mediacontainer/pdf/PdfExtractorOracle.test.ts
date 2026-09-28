// PdfExtractor : résultats relevés sur la vraie classe Komga (PDFBox 3.0.8, jshell, tools/jshell-komga.sh)
// pour fixtures/pdf (MediaBox héritée ou absente, CropBox partielle/hors MediaBox, coordonnées inversées,
// tableaux incomplets ou non numériques, /Rotate 90/180/270/-90/45/450/90.0, chiffrement AES/RC4 avec mot de passe
// utilisateur vide ou non, xref absente, fichier non PDF) : nombre de pages, dimensions, scaleDimension,
// type et taille des images rendues (résolution 400, JPEG), erreurs.
// Écart connu : nombre réel en notation exponentielle (`1e3`, hors norme PDF) lu par PDFBox, refusé par mupdf (weird-5.pdf).
// Écart accepté : pixels et octets des images et du PDF extrait (mupdf au lieu de PDFBox).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ImageType } from '../../../../src/infrastructure/image/ImageType.js'
import { PdfExtractor } from '../../../../src/infrastructure/mediacontainer/pdf/PdfExtractor.js'

const dir = fileURLToPath(new URL('../fixtures/pdf', import.meta.url))
const KNOWN_DEVIATIONS = new Set(['weird-5.pdf'])

/** dimensions d'un JPEG (marqueur SOFn) */
function jpegSize(b: Uint8Array): string {
  let i = 2
  while (i < b.length) {
    const marker = b[i + 1] as number
    const len = ((b[i + 2] as number) << 8) | (b[i + 3] as number)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return `${((b[i + 7] as number) << 8) | (b[i + 8] as number)}x${((b[i + 5] as number) << 8) | (b[i + 6] as number)}`
    }
    i += 2 + len
  }
  return 'unknown'
}

describe('PdfExtractorOracle', () => {
  const ex = new PdfExtractor(ImageType.JPEG, 400)

  it('gives the same pages, dimensions, rendered image sizes and errors as Komga', () => {
    const lines = readFileSync(`${dir}.java.jsonl`, 'utf8').trim().split('\n')
    const mismatches: string[] = []
    for (const line of lines) {
      const exp = JSON.parse(line) as Record<string, unknown>
      if (KNOWN_DEVIATIONS.has(exp.file as string)) continue
      const p = `${dir}/${exp.file as string}`
      const res: Record<string, unknown> = { file: exp.file }
      try {
        const pages = ex.getPages(p, true)
        res.pages = pages.map((e) => {
          const d = e.dimension!
          const sd = ex.scaleDimension(d)
          return [e.name, d.width, d.height, sd.width, sd.height]
        })
        res.pagesNoDim = ex.getPages(p, false).map((e) => `${e.name}:${e.dimension}`)
        const imgs: string[] = []
        for (let i = 1; i <= Math.min(pages.length, 8); i++) {
          try {
            const tb = ex.getPageContentAsImage(p, i)
            imgs.push(`${tb.mediaType} ${jpegSize(tb.bytes)}`)
          } catch (t) {
            imgs.push(`EXC ${(t as Error).constructor.name}`)
          }
        }
        res.images = imgs
        const tb = ex.getPageContentAsPdf(p, 1)
        // PORT: seul le type est comparé (octets du PDF produit par mupdf)
        res.pdf = tb.mediaType
        exp.pdf = (exp.pdf as string).split(' ')[0]
      } catch (t) {
        res.error = (t as Error).constructor.name
      }
      if (JSON.stringify(res) !== JSON.stringify(exp)) mismatches.push(`java=${JSON.stringify(exp)}\nts  =${JSON.stringify(res)}`)
    }
    expect(mismatches).toEqual([])
    expect(lines.length).toBe(21)
  }, 120_000)
})
