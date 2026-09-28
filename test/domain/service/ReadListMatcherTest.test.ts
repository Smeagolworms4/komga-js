// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/ReadListMatcherTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires
import '../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import '../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../src/infrastructure/jooq/main/SidecarDao.js'
import '../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailBookDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailSeriesDao.js'
import '../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import '../../../src/infrastructure/jooq/tasks/TasksDao.js'
import '../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../src/infrastructure/search/LuceneHelper.js'
import '../../../src/infrastructure/search/SearchIndexLifecycle.js'
import '../../../src/infrastructure/jooq/main/ReadListRequestDao.js'
import '../../../src/infrastructure/metadata/barcode/IsbnConfiguration.js'
import '../../../src/infrastructure/jooq/main/ThumbnailReadListDao.js'
import '../../../src/domain/service/SeriesLifecycle.js'
import '../../../src/domain/service/ReadListLifecycle.js'
import '../../../src/domain/service/ReadListMatcher.js'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TaskEmitter } from '../../../src/application/tasks/TaskEmitter.js'
import { Book } from '../../../src/domain/model/Book.js'
import { ReadList } from '../../../src/domain/model/ReadList.js'
import { ReadListRequest, ReadListRequestBook, type ReadListRequestBookMatches } from '../../../src/domain/model/ReadListRequest.js'
import { BookMetadataRepository } from '../../../src/domain/persistence/BookMetadataRepository.js'
import { LibraryRepository } from '../../../src/domain/persistence/LibraryRepository.js'
import { ReadListRepository } from '../../../src/domain/persistence/ReadListRepository.js'
import { SeriesMetadataRepository } from '../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../src/domain/persistence/SeriesRepository.js'
import { ReadListLifecycle } from '../../../src/domain/service/ReadListLifecycle.js'
import { ReadListMatcher } from '../../../src/domain/service/ReadListMatcher.js'
import { SeriesLifecycle } from '../../../src/domain/service/SeriesLifecycle.js'
import { eq, isBlank } from '../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { any, clearMocks, every, mockk, ofType } from '../../support/mockk.js'
import { makeBook, makeLibrary, makeSeries } from '../model/Utils.js'

describe('ReadListMatcherTest', () => {
  // @MockkBean private lateinit var mockTaskEmitter: TaskEmitter
  const mockTaskEmitter = mockk<TaskEmitter>(TaskEmitter)

  const ctx = springBootTest({}, [{ type: TaskEmitter, instance: mockTaskEmitter }])
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const readListLifecycle = ctx.getBean(ReadListLifecycle)
  const readListRepository = ctx.getBean(ReadListRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const readListMatcher = ctx.getBean(ReadListMatcher)
  afterAll(() => closeContext(ctx))

  // PORT: springmockk réinitialise les @MockkBean après chaque test, après les méthodes @AfterEach
  // (les hooks afterEach de Vitest s'exécutent dans l'ordre inverse de leur déclaration)
  afterEach(() => clearMocks(mockTaskEmitter))

  const library = makeLibrary()

  beforeAll(() => {
    libraryRepository.insert(library)
  })

  beforeEach(() => {
    every(() => mockTaskEmitter.refreshBookMetadata(ofType<Book>(Book), any())).justRuns()
  })

  afterAll(() => {
    libraryRepository.deleteAll()
  })

  afterEach(() => {
    readListRepository.deleteAll()
    seriesLifecycle.deleteMany(seriesRepository.findAll())
  })

  describe('Match', () => {
    // PORT: Map -> objet { seriesId: bookIds } (égalité de Map Kotlin indépendante de l'ordre)
    function mapIds(self: Iterable<ReadListRequestBookMatches>): Record<string, string[]>[] {
      return [...self].map((it) => Object.fromEntries([...it.matches].map(([series, books]) => [series.id, books.map((book) => book.id)])))
    }

    it('given request with existing series and books when matching then all requests are matched with a single result', () => {
      // given
      const booksSeries1 = [makeBook('book1', { libraryId: library.id }), makeBook('book5', { libraryId: library.id })]
      const series1 = makeSeries('batman', { libraryId: library.id })
      {
        const s = series1
        seriesLifecycle.createSeries(s)
        seriesLifecycle.addBooks(s, booksSeries1)
        seriesLifecycle.sortBooks(s)
        const it = seriesMetadataRepository.findById(s.id)
        seriesMetadataRepository.update(it.copy({ title: 'Batman: White Knight' }))
      }

      const booksSeries2 = [makeBook('book1', { libraryId: library.id }), makeBook('book2', { libraryId: library.id })]
      const series2 = makeSeries('joker', { libraryId: library.id })
      {
        const s = series2
        seriesLifecycle.createSeries(s)
        seriesLifecycle.addBooks(s, booksSeries2)
        seriesLifecycle.sortBooks(s)

        const it = bookMetadataRepository.findById(booksSeries2[0]!.id)
        bookMetadataRepository.update(it.copy({ number: '0025' }))
      }

      const request = new ReadListRequest({
        name: 'readlist request',
        books: [
          new ReadListRequestBook({ series: new Set(['Batman: White Knight']), number: '1' }),
          new ReadListRequestBook({ series: new Set(['joker']), number: '02' }),
          new ReadListRequestBook({ series: new Set(['Batman: White Knight']), number: '2' }),
          new ReadListRequestBook({ series: new Set(['joker']), number: '25' }),
        ],
      })

      // when
      const result = readListMatcher.matchReadListRequest(request)

      // then
      {
        const readListMatch = result.readListMatch
        expect(readListMatch.name).toBe(request.name)
        expect(isBlank(readListMatch.errorCode)).toBe(true)
      }
      expect(result.requests).toHaveLength(4)
      expect(eq(result.requests.map((it) => it.request), request.books)).toBe(true)
      expect(mapIds(result.requests)).toEqual([
        { [series1.id]: [booksSeries1[0]!.id] },
        { [series2.id]: [booksSeries2[1]!.id] },
        { [series1.id]: [booksSeries1[1]!.id] },
        { [series2.id]: [booksSeries2[0]!.id] },
      ])
    })

    it('given request with existing read list when matching then result has no readlist name and appropriate error code but correct matches', () => {
      // given
      const booksSeries1 = [makeBook('book1', { libraryId: library.id }), makeBook('book5', { libraryId: library.id })]
      const series1 = makeSeries('batman', { libraryId: library.id })
      {
        const s = series1
        seriesLifecycle.createSeries(s)
        seriesLifecycle.addBooks(s, booksSeries1)
        seriesLifecycle.sortBooks(s)
        const it = seriesMetadataRepository.findById(s.id)
        seriesMetadataRepository.update(it.copy({ title: 'Batman: White Knight' }))
      }

      const booksSeries2 = [makeBook('book1', { libraryId: library.id }), makeBook('book2', { libraryId: library.id })]
      const series2 = makeSeries('joker', { libraryId: library.id })
      {
        const s = series2
        seriesLifecycle.createSeries(s)
        seriesLifecycle.addBooks(s, booksSeries2)
        seriesLifecycle.sortBooks(s)

        const it = bookMetadataRepository.findById(booksSeries2[0]!.id)
        bookMetadataRepository.update(it.copy({ number: '0025' }))
      }

      readListLifecycle.addReadList(new ReadList({ name: 'my ReadList' }))

      const request = new ReadListRequest({
        name: 'my readlist',
        books: [
          new ReadListRequestBook({ series: new Set(['batman: white knight']), number: '1' }),
          new ReadListRequestBook({ series: new Set(['joker']), number: '2' }),
          new ReadListRequestBook({ series: new Set(['BATMAN: WHITE KNIGHT']), number: '2' }),
          new ReadListRequestBook({ series: new Set(['joker']), number: '25' }),
        ],
      })

      // when
      const result = readListMatcher.matchReadListRequest(request)

      // then
      {
        const readListMatch = result.readListMatch
        expect(readListMatch.name).toBe(request.name)
        expect(readListMatch.errorCode).toBe('ERR_1009')
      }
      expect(result.requests).toHaveLength(4)
      expect(eq(result.requests.map((it) => it.request), request.books)).toBe(true)
      expect(mapIds(result.requests)).toEqual([
        { [series1.id]: [booksSeries1[0]!.id] },
        { [series2.id]: [booksSeries2[1]!.id] },
        { [series1.id]: [booksSeries1[1]!.id] },
        { [series2.id]: [booksSeries2[0]!.id] },
      ])
    })

    it('given request and some matching series or books when matching then returns all matches', () => {
      // given
      const booksSeries1 = [makeBook('book1', { libraryId: library.id }), makeBook('book5', { libraryId: library.id })]
      const series1 = makeSeries('batman', { libraryId: library.id })
      {
        const s = series1
        seriesLifecycle.createSeries(s)
        seriesLifecycle.addBooks(s, booksSeries1)
        seriesLifecycle.sortBooks(s)

        const it = bookMetadataRepository.findById(booksSeries1[0]!.id)
        bookMetadataRepository.update(it.copy({ number: '2' }))
      }

      const booksSeries2 = [makeBook('book1', { libraryId: library.id }), makeBook('book2', { libraryId: library.id })]
      const series2 = makeSeries('joker', { libraryId: library.id })
      {
        const s = series2
        seriesLifecycle.createSeries(s)
        seriesLifecycle.addBooks(s, booksSeries2)
        seriesLifecycle.sortBooks(s)
      }
      {
        const s = makeSeries('joker', { libraryId: library.id })
        seriesLifecycle.createSeries(s)
      }

      const request = new ReadListRequest({
        name: 'readlist',
        books: [
          new ReadListRequestBook({ series: new Set(['tokyo ghost']), number: '1' }),
          new ReadListRequestBook({ series: new Set(['batman']), number: '3' }),
          new ReadListRequestBook({ series: new Set(['joker']), number: '2' }),
          new ReadListRequestBook({ series: new Set(['batman']), number: '2' }),
        ],
      })

      // when
      const result = readListMatcher.matchReadListRequest(request)

      // then
      {
        const readListMatch = result.readListMatch
        expect(readListMatch.name).toBe(request.name)
        expect(isBlank(readListMatch.errorCode)).toBe(true)
      }
      expect(result.requests).toHaveLength(4)
      expect(eq(result.requests.map((it) => it.request), request.books)).toBe(true)
      expect(mapIds(result.requests)).toEqual([{}, {}, { [series2.id]: [booksSeries2[1]!.id] }, { [series1.id]: [booksSeries1[0]!.id, booksSeries1[1]!.id] }])
    })
  })
})
