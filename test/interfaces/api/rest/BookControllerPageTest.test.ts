// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/BookControllerPageTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { TypedBytes } from '../../../../src/domain/model/TypedBytes.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../../src/domain/persistence/MediaRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { BookAnalyzer } from '../../../../src/domain/service/BookAnalyzer.js'
import { BookLifecycle } from '../../../../src/domain/service/BookLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { first } from '../../../../src/port/kotlin.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { any, clearMocks, every, mockk } from '../../../support/mockk.js'
import { MockMvc, type MockMvcResultMatchersDsl, closeContext, mockMvcTest } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

describe('BookControllerPageTest', () => {
  // @MockkBean
  const mockAnalyzer = mockk(BookAnalyzer)

  // @SpringBootTest @AutoConfigureMockMvc(printOnlyOnFailure = false) ; @SpykBean bookLifecycle
  const ctx = mockMvcTest({}, [
    { type: BookAnalyzer, instance: mockAnalyzer },
    { type: BookLifecycle, spyk: true },
  ])
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const mediaRepository = ctx.getBean(MediaRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const bookRepository = ctx.getBean(BookRepository)
  const mockMvc = ctx.getBean(MockMvc)

  // @SpykBean
  const bookLifecycle = ctx.getBean(BookLifecycle)

  const library = makeLibrary({ id: '1' })

  beforeAll(() => {
    libraryRepository.insert(library)
  })

  afterAll(async () => {
    for (const it of libraryRepository.findAll()) {
      libraryLifecycle.deleteLibrary(it)
    }
    await closeContext(ctx)
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
    // PORT: les @MockkBean / @SpykBean sont réinitialisés après chaque test
    clearMocks(mockAnalyzer, bookLifecycle)
  })

  // @ParameterizedTest @MethodSource("arguments")
  it.each(argumentsSource())(
    'given pdf book when getting page with Accept header then returns page in correct format',
    withMockCustomUser({}, async (bookType: string, acceptTypes: string[], success: boolean, resultType: string | null) => {
      {
        const series = makeSeries('series', { libraryId: library.id })
        const created = seriesLifecycle.createSeries(series)
        const books = [makeBook('1', { libraryId: library.id })]
        seriesLifecycle.addBooks(created, books)
      }

      const book = first(bookRepository.findAll())
      {
        const it = mediaRepository.findById(book.id)
        mediaRepository.update(
          it.copy({
            status: Media.Status.READY,
            mediaType: bookType,
            pages: [new BookPage({ fileName: 'file', mediaType: 'image/jpeg' })],
          }),
        )
      }

      every(() => mockAnalyzer.getPageContentRaw(any(), 1)).returns(new TypedBytes({ bytes: new Uint8Array(0), mediaType: 'application/pdf' }))
      // PORT: getBookPage(book, number, convertTo, resizeTo) -> (book, number, { convertTo, resizeTo }) ; asynchrone
      every(() => bookLifecycle.getBookPage(any(), 1, any())).returns(Promise.resolve(new TypedBytes({ bytes: new Uint8Array(0), mediaType: 'image/jpeg' })))

      await mockMvc
        .get(`/api/v1/books/${book.id}/pages/1`, (r) => {
          if (acceptTypes.length > 0) r.accept = acceptTypes
        })
        .andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => (success ? s.isOk() : s.isBadRequest()))
          if (resultType !== null) m.header((h) => h.string('Content-Type', resultType))
        })
    }),
  )

  // PORT: org.springframework.http.MediaType -> chaîne (MediaType.toString())
  // PORT: fun arguments() (nom réservé en mode strict)
  function argumentsSource(): [string, string[], boolean, string | null][] {
    return [
      // PDF book: request nothing, get image
      ['application/pdf', [], true, 'image/jpeg'],
      // PDF book: request PDF, get PDF
      ['application/pdf', [MediaType.APPLICATION_PDF_VALUE], true, 'application/pdf'],
      // PDF book: request PDF + others, get PDF
      ['application/pdf', [MediaType.APPLICATION_PDF_VALUE, 'image/*'], true, 'application/pdf'],
      // PDF book: request image, get image
      ['application/pdf', ['image/*'], true, 'image/jpeg'],
      // PDF book: request unhandled image, still get image. We don't check image subtypes.
      ['application/pdf', ['image/avif'], true, 'image/jpeg'],
      // PDF book: request random, get image. We ignore non-pdf types.
      ['application/pdf', [MediaType.APPLICATION_ATOM_XML_VALUE], true, 'image/jpeg'],
      // PDF book: request PDF with lower priority than image, get image
      ['application/pdf', [MediaType.IMAGE_JPEG_VALUE, MediaType.APPLICATION_PDF_VALUE], true, 'image/jpeg'],
      // PDF book: request PDF with lower quality than image, get image
      ['application/pdf', ['application/pdf;q=0.5', MediaType.IMAGE_JPEG_VALUE], true, 'image/jpeg'],
      // PDF book: request PDF with higher quality than image, get pdf
      ['application/pdf', ['image/jpeg;q=0.5', 'application/pdf;q=0.8'], true, 'application/pdf'],
    ]
  }
})
