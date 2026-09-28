// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/barcode/IsbnBarcodeProviderOracleTest.kt
import { readFileSync } from 'node:fs'
import { BookWithMedia } from '../../../../../src/domain/model/BookWithMedia.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { MetadataPatchTarget } from '../../../../../src/domain/model/MetadataPatchTarget.js'
import type { BookAnalyzer } from '../../../../../src/domain/service/BookAnalyzer.js'
import { IsbnBarcodeProvider } from '../../../../../src/infrastructure/metadata/barcode/IsbnBarcodeProvider.js'
import { ISBNValidator } from '../../../../../src/port/commons-validator.js'
import { IllegalStateException } from '../../../../../src/port/kotlin.js'
import { oracle } from '../../../oracle.js'
import { komgaRes } from '../../mediacontainer/samples.js'
import { book, fixture, libraries } from '../metadataSamples.js'

const { func, kase } = oracle('infrastructure/metadata/barcode/IsbnBarcodeProvider')

const images: [string, Uint8Array][] = [
  ...['bottom-alpha.png', 'cmyk.jpg', 'eighth.png', 'empty.bin', 'garbage.bin', 'gray.jpg', 'half.jpg', 'negate.jpg', 'q5.jpg', 'rot180.jpg', 'rot270.jpg', 'rot90.jpg', 'truncated.jpg', 'webp.webp'].map((it): [string, Uint8Array] => [it, readFileSync(fixture(`barcode/${it}`))]),
  ['komga page_384.jpg', readFileSync(komgaRes('barcode/page_384.jpg'))],
  ['komga komga.png', readFileSync(komgaRes('barcode/komga.png'))],
]

const isbn = images.find((it) => it[0] === 'komga page_384.jpg')![1]
const blank = images.find((it) => it[0] === 'komga komga.png')![1]

/** Résultat, et pages demandées à l'analyseur de livre, dans l'ordre */
async function run(pageCount: number, content: (p: number) => Uint8Array, mediaType = 'application/zip'): Promise<unknown[]> {
  const requested: number[] = []
  const analyzer = {
    getPageContent: (_: unknown, p: number) => {
      requested.push(p)
      return content(p)
    },
  } as unknown as BookAnalyzer
  const b = new BookWithMedia({ book: book(), media: new Media({ mediaType, pageCount }) })
  return [await new IsbnBarcodeProvider(analyzer, new ISBNValidator(true)).getBookMetadataFromBook(b), requested]
}

func('getBookMetadataFromBook', () => {
  for (const [name, bytes] of images) kase(`single page ${name}`, () => run(1, () => bytes))
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 10]) kase(`${n} pages without barcode`, () => run(n, () => blank))
  for (const p of [1, 2, 3, 4, 5, 6, 8, 9, 10]) kase(`10 pages, barcode on page ${p}`, () => run(10, (it) => (it === p ? isbn : blank)))
  kase('barcode on two pages', () => run(10, (it) => (it === 1 || it === 9 ? isbn : blank)))
  kase('epub', () => run(3, () => isbn, 'application/epub+zip'))
  kase('pdf', () => run(2, (it) => (it === 2 ? isbn : blank), 'application/pdf'))
  kase('unknown media type', () => run(2, () => isbn, 'application/octet-stream'))
  kase('analyzer error then barcode', () =>
    run(3, (it) => {
      if (it === 3) throw new IllegalStateException('boom')
      return isbn
    }),
  )
  kase('not an image then barcode', () => run(3, (it) => (it === 3 ? Buffer.from('text') : isbn)))
})

func('shouldLibraryHandlePatch', () => {
  const provider = new IsbnBarcodeProvider({} as BookAnalyzer, new ISBNValidator(true))
  for (const [name, library] of libraries) {
    for (const target of MetadataPatchTarget.entries()) kase(`${name}, ${target}`, () => provider.shouldLibraryHandlePatch(library, target))
  }
})
