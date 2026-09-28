// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/pdf/PdfExtractorOracleTest.kt
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import type { TypedBytes } from '../../../../../src/domain/model/TypedBytes.js'
import { ImageAnalyzer } from '../../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ImageType } from '../../../../../src/infrastructure/image/ImageType.js'
import { PdfExtractor } from '../../../../../src/infrastructure/mediacontainer/pdf/PdfExtractor.js'
import { ByteArrayInputStream } from '../../../../../src/port/java-io.js'
import { exceptionType, oracle, tempDir } from '../../../oracle.js'
import { fixture, komgaRes } from '../samples.js'

const { func, kase, deviation } = oracle('infrastructure/mediacontainer/pdf/PdfExtractor')

const jpeg = new PdfExtractor(ImageType.JPEG, 400)
const png = new PdfExtractor(ImageType.PNG, 150)
const komga = new PdfExtractor(ImageType.JPEG, 1536)
const imageAnalyzer = new ImageAnalyzer()

const pdfs = ['enc-owner.pdf', 'enc-owner-rc4.pdf', 'enc-user.pdf', 'inherited.pdf', 'komga.pdf', 'nomediabox.pdf', 'not-a-pdf.pdf', 'no-xref.pdf', 'rotate-inherited.pdf', 'weird-0.pdf', 'weird-10.pdf', 'weird-1.pdf', 'weird-2.pdf', 'weird-3.pdf', 'weird-4.pdf', 'weird-5.pdf', 'weird-6.pdf', 'weird-7.pdf', 'weird-8.pdf', 'weird-9.pdf', 'weird-boxes.pdf']

// Écart connu (PORTING.md) : nombre réel en notation exponentielle (`1e3`, hors norme PDF) lu par PDFBox, refusé par mupdf
const WEIRD_5 = 'weird-5.pdf: nombre en notation exponentielle lu par PDFBox, refusé par mupdf'

/** Messages des bibliothèques PDF non comparables (PDFBox contre mupdf) : seul le type de l'exception est gardé */
function typeOnError(block: () => unknown): unknown {
  try {
    return block()
  } catch (e) {
    return ['throws', (e as Error).name]
  }
}

/** Pixels et octets rendus différents (écart accepté) : type et dimensions de l'image comparés */
const image = (tb: TypedBytes) => [tb.mediaType, imageAnalyzer.getDimension(new ByteArrayInputStream(tb.bytes))]

function pdf(tb: TypedBytes): unknown {
  const f = join(tempDir(), 'extracted.pdf')
  writeFileSync(f, tb.bytes)
  return [tb.mediaType, jpeg.getPages(f, true)]
}

function write(name: string, content: string | Uint8Array): string {
  const p = join(tempDir(), name)
  writeFileSync(p, content)
  return p
}

func('getPages', () => {
  for (const p of pdfs) {
    for (const analyze of [true, false]) {
      const name = `${p} (analyze ${analyze})`
      if (p === 'weird-5.pdf') deviation(name, WEIRD_5)
      else kase(name, () => typeOnError(() => jpeg.getPages(fixture(`pdf/${p}`), analyze)))
    }
  }
  kase('komga resource', () => jpeg.getPages(komgaRes('pdf/komga.pdf'), true))
  kase('text file', () => typeOnError(() => jpeg.getPages(write('text.pdf', 'hello'), true)))
  kase('empty file', () => typeOnError(() => jpeg.getPages(write('empty.pdf', new Uint8Array(0)), true)))
  kase('missing file', () => exceptionType(() => jpeg.getPages(join(tempDir(), 'missing.pdf'), true)))
})

func('getPageContentAsImage', () => {
  for (const p of pdfs) {
    for (const n of [0, 1, 2, 5, 7, 8]) {
      if (p === 'weird-5.pdf') deviation(`${p} page ${n}`, WEIRD_5)
      // image de 2 000 000 × 400 pixels : OutOfMemoryError de la JVM avant l'encodeur JPEG (dépend de la taille du tas)
      else if (p === 'weird-7.pdf' && n === 1) deviation(`${p} page ${n}`, 'OutOfMemoryError selon le tas de la JVM, IIOException sinon')
      else kase(`${p} page ${n}`, () => typeOnError(() => image(jpeg.getPageContentAsImage(fixture(`pdf/${p}`), n))))
    }
  }
  for (const n of [1, 2, 3]) kase(`png komga.pdf page ${n}`, () => typeOnError(() => image(png.getPageContentAsImage(fixture('pdf/komga.pdf'), n))))
  kase('png weird-boxes.pdf page 1', () => typeOnError(() => image(png.getPageContentAsImage(fixture('pdf/weird-boxes.pdf'), 1))))
  kase('resolution 1536 komga.pdf page 1', () => typeOnError(() => image(komga.getPageContentAsImage(fixture('pdf/komga.pdf'), 1))))
})

func('getPageContentAsPdf', () => {
  for (const p of pdfs) {
    for (const n of [0, 1, 2, 7, 8]) {
      if (p === 'weird-5.pdf') deviation(`${p} page ${n}`, WEIRD_5)
      else kase(`${p} page ${n}`, () => typeOnError(() => pdf(jpeg.getPageContentAsPdf(fixture(`pdf/${p}`), n))))
    }
  }
})

// privée : getScale(PDPage), par la taille des images rendues
func('getScale@69', () => {
  for (const [r, label] of [[1, '1.0'], [72, '72.0'], [100, '100.0'], [333, '333.0']] as const) {
    kase(`resolution ${label}`, () => typeOnError(() => image(new PdfExtractor(ImageType.PNG, r).getPageContentAsImage(fixture('pdf/komga.pdf'), 1))))
  }
  kase('rotated page', () => typeOnError(() => image(new PdfExtractor(ImageType.PNG, 50).getPageContentAsImage(fixture('pdf/rotate-inherited.pdf'), 1))))
})

// privée : getScale(width, height), par scaleDimension
func('getScale@71', () => {
  for (const [r, label] of [[0, '0.0'], [1, '1.0'], [1536, '1536.0'], [-10, '-10.0'], [0.5, '0.5']] as const) {
    kase(`resolution ${label}`, () => new PdfExtractor(ImageType.JPEG, r).scaleDimension(new Dimension({ width: 600, height: 800 })))
  }
})

func('scaleDimension', () => {
  // prettier-ignore
  const dims = [[0, 0], [1, 1], [0, 100], [100, 0], [595, 842], [842, 595], [1536, 1536], [1000, 10], [10, 1000], [3, 7], [12345, 678], [-5, 10], [2147483647, 1], [1, 2147483647]] as const
  for (const [w, h] of dims) {
    kase(`${w}x${h}`, () => jpeg.scaleDimension(new Dimension({ width: w, height: h })))
    kase(`${w}x${h} at 1536`, () => komga.scaleDimension(new Dimension({ width: w, height: h })))
  }
})
