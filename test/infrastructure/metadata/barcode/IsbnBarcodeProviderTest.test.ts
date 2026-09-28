// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/metadata/barcode/IsbnBarcodeProviderTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// PORT: mockk<BookAnalyzer>() -> objet factice ; le module est remplacé (ses dépendances ne sont pas nécessaires ici)
vi.mock('../../../../src/domain/service/BookAnalyzer.js', () => ({ BookAnalyzer: class BookAnalyzer {} }))

const { BookPage } = await import('../../../../src/domain/model/BookPage.js')
const { BookWithMedia } = await import('../../../../src/domain/model/BookWithMedia.js')
const { Media } = await import('../../../../src/domain/model/Media.js')
const { IsbnBarcodeProvider } = await import('../../../../src/infrastructure/metadata/barcode/IsbnBarcodeProvider.js')
const { ISBNValidator } = await import('../../../../src/port/commons-validator.js')
const { makeBook } = await import('../../../domain/model/Utils.js')

describe('IsbnBarcodeProviderTest', () => {
  const mockAnalyzer = { getPageContent: vi.fn() }
  const isbnBarcodeProvider = new IsbnBarcodeProvider(mockAnalyzer as never, new ISBNValidator(true))

  it('given book page with barcode when getting book metadata then ISBN is returned', async () => {
    // given
    const file = readFileSync('test/resources/barcode/page_384.jpg')
    mockAnalyzer.getPageContent.mockResolvedValue(new Uint8Array(file))

    const book = makeBook('Book1')
    const media = new Media({ pages: [new BookPage({ fileName: 'page', mediaType: 'image/jpeg' })] })

    // when
    const patch = await isbnBarcodeProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))

    // then
    expect(patch?.isbn).toBe('9782811632397')
  })

  it('given invalid image page when getting book metadata then patch is null', async () => {
    // given
    mockAnalyzer.getPageContent.mockResolvedValue(new Uint8Array(0))

    const book = makeBook('Book1')
    const media = new Media({ pages: [new BookPage({ fileName: 'page', mediaType: 'image/jpeg' })] })

    // when
    const patch = await isbnBarcodeProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))

    // then
    expect(patch).toBeNull()
  })

  it('given page without barcode when getting book metadata then patch is null', async () => {
    // given
    const file = readFileSync('test/resources/barcode/komga.png')
    mockAnalyzer.getPageContent.mockResolvedValue(new Uint8Array(file))

    const book = makeBook('Book1')
    const media = new Media({ pages: [new BookPage({ fileName: 'page', mediaType: 'image/jpeg' })] })

    // when
    const patch = await isbnBarcodeProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))

    // then
    expect(patch).toBeNull()
  })
})
