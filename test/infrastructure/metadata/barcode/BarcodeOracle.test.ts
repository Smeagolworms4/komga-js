// Oracle (sans jumeau Kotlin) : IsbnBarcodeProvider comparé à la vraie classe de Komga (ImageIO + ZXing 3.5.4)
// sur des variantes de page (réduction, rotation 90/180/270, niveaux de gris, CMJN, WebP, PNG indexé avec alpha,
// image négative, JPEG tronqué, octets invalides). fixtures/barcode/list.json passé dans Komga par
// fixtures/barcode-oracle.jsh (tools/jshell-komga.sh, lancé depuis la racine du projet) -> fixtures/barcode-oracle.json.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../src/domain/service/BookAnalyzer.js', () => ({ BookAnalyzer: class BookAnalyzer {} }))

const { IsbnBarcodeProvider } = await import('../../../../src/infrastructure/metadata/barcode/IsbnBarcodeProvider.js')
const { ISBNValidator } = await import('../../../../src/port/commons-validator.js')
const { BookWithMedia } = await import('../../../../src/domain/model/BookWithMedia.js')
const { Media } = await import('../../../../src/domain/model/Media.js')
const { BookPage } = await import('../../../../src/domain/model/BookPage.js')
const { makeBook } = await import('../../../domain/model/Utils.js')

const oracle = JSON.parse(readFileSync(new URL('../fixtures/barcode-oracle.json', import.meta.url), 'utf8')) as Record<string, { decode: string | null; isbn: string | null }>

describe('BarcodeOracle', () => {
  it('matches Komga on every fixture', async () => {
    let current = new Uint8Array(0)
    const provider = new IsbnBarcodeProvider({ getPageContent: async () => current } as never, new ISBNValidator(true))
    const book = new BookWithMedia({ book: makeBook('Book1'), media: new Media({ pages: [new BookPage({ fileName: 'page', mediaType: 'image/jpeg' })] }) })
    const mismatches: unknown[] = []
    for (const [file, expected] of Object.entries(oracle)) {
      current = new Uint8Array(readFileSync(file))
      const isbn = (await provider.getBookMetadataFromBook(book))?.isbn ?? null
      if (isbn !== expected.isbn) mismatches.push({ file, isbn, expected: expected.isbn })
    }
    expect(mismatches).toEqual([])
    expect(Object.keys(oracle).length).toBeGreaterThan(10)
  }, 120000)
})
