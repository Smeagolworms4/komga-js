// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/TransientBookLifecycleTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires ; SpringBootTest d'abord pour que la migration
// Flyway soit créée avant KomgaSettingsProvider (qui lit la base dans son constructeur)
import '../../SpringBootTest.js'
import '../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../src/port/spring-tx.js'
import '../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import '../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailBookDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailSeriesDao.js'
import '../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../src/infrastructure/jooq/main/PageHashDao.js'
import '../../../src/infrastructure/jooq/main/SidecarDao.js'
import '../../../src/infrastructure/cache/TransientBookCache.js'
import '../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../src/infrastructure/search/LuceneHelper.js'
import '../../../src/infrastructure/metadata/barcode/IsbnConfiguration.js'
import '../../../src/infrastructure/metadata/comicrack/ComicInfoProvider.js'
import '../../../src/domain/service/SeriesLifecycle.js'
import '../../../src/domain/service/BookLifecycle.js'
import '../../../src/domain/service/TransientBookLifecycle.js'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { BookMetadataPatch } from '../../../src/domain/model/BookMetadataPatch.js'
import { Media } from '../../../src/domain/model/Media.js'
import { SeriesMetadataPatch } from '../../../src/domain/model/SeriesMetadataPatch.js'
import { TransientBook } from '../../../src/domain/model/TransientBook.js'
import { LibraryRepository } from '../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../src/domain/persistence/SeriesRepository.js'
import { SeriesLifecycle } from '../../../src/domain/service/SeriesLifecycle.js'
import { TransientBookLifecycle } from '../../../src/domain/service/TransientBookLifecycle.js'
import { BookMetadataProvider } from '../../../src/infrastructure/metadata/BookMetadataProvider.js'
import { ComicInfoProvider } from '../../../src/infrastructure/metadata/comicrack/ComicInfoProvider.js'
import { KepubConverter } from '../../../src/infrastructure/kobo/KepubConverter.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../model/Utils.js'

describe('TransientBookLifecycleTest', () => {
  // TEMPORAIRE : KepubConverter n'est pas encore un bean (bouchon de l'agent mediacontainer)
  const ctx = springBootTest({}, [{ type: KepubConverter, instance: new KepubConverter() }])
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const transientBookLifecycle = ctx.getBean(TransientBookLifecycle)

  const library = makeLibrary()

  // @SpykBean private lateinit var mockProvider: ComicInfoProvider
  // PORT: le bean réel est espionné en place (vi.spyOn) : un espion enregistré par springBootTest() sous le type
  // ComicInfoProvider ne serait pas injecté dans les List<BookMetadataProvider> / List<SeriesMetadataFromBookProvider>
  const mockProvider = ctx.getBeansOfType(BookMetadataProvider).find((it) => it instanceof ComicInfoProvider) as ComicInfoProvider

  // PORT: springmockk réinitialise les @SpykBean après chaque test (MockkClear.AFTER), après les @AfterEach
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeAll(() => {
    libraryRepository.insert(library)
  })

  afterAll(() => {
    libraryRepository.deleteAll()
    closeContext(ctx)
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
  })

  it('when getting metadata for transient book then the most specific series name is matched first', async () => {
    seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))
    const seriesExact = makeSeries('Batman', { libraryId: library.id })
    seriesLifecycle.createSeries(seriesExact)
    seriesLifecycle.createSeries(makeSeries('Batman and Robin (2022)', { libraryId: library.id }))

    const book = new TransientBook({ book: makeBook('whatever'), media: new Media() })

    vi.spyOn(mockProvider, 'getBookMetadataFromBook').mockReturnValue(
      new BookMetadataPatch({ title: null, summary: null, number: null, numberSort: 15, releaseDate: null, authors: null, isbn: null, links: null, tags: null, readLists: [] }),
    )
    vi.spyOn(mockProvider, 'getSeriesMetadataFromBook').mockReturnValue(
      new SeriesMetadataPatch({
        title: 'BATMAN',
        titleSort: null,
        status: null,
        summary: null,
        readingDirection: null,
        publisher: null,
        ageRating: null,
        language: null,
        genres: null,
        totalBookCount: null,
        collections: new Set(),
      }),
    )

    const [seriesId, number] = await transientBookLifecycle.getMetadata(book)

    expect(seriesId).toBe(seriesExact.id)
    expect(number).toBe(15)
  })

  it('when getting metadata for transient book without series then no series is matched', async () => {
    seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))
    const seriesExact = makeSeries('Batman', { libraryId: library.id })
    seriesLifecycle.createSeries(seriesExact)
    seriesLifecycle.createSeries(makeSeries('Batman and Robin (2022)', { libraryId: library.id }))

    const book = new TransientBook({ book: makeBook('whatever'), media: new Media() })

    vi.spyOn(mockProvider, 'getBookMetadataFromBook').mockReturnValue(
      new BookMetadataPatch({ title: null, summary: null, number: null, numberSort: null, releaseDate: null, authors: null, isbn: null, links: null, tags: null, readLists: [] }),
    )
    vi.spyOn(mockProvider, 'getSeriesMetadataFromBook').mockReturnValue(
      new SeriesMetadataPatch({
        title: null,
        titleSort: null,
        status: null,
        summary: null,
        readingDirection: null,
        publisher: null,
        ageRating: null,
        language: null,
        genres: null,
        totalBookCount: null,
        collections: new Set(),
      }),
    )

    const [seriesId, number] = await transientBookLifecycle.getMetadata(book)

    expect(seriesId).toBeNull()
    expect(number).toBeNull()
  })

  it('when getting metadata for transient book with blank series then no series is matched', async () => {
    seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))
    const seriesExact = makeSeries('Batman', { libraryId: library.id })
    seriesLifecycle.createSeries(seriesExact)
    seriesLifecycle.createSeries(makeSeries('Batman and Robin (2022)', { libraryId: library.id }))

    const book = new TransientBook({ book: makeBook('whatever'), media: new Media() })

    vi.spyOn(mockProvider, 'getBookMetadataFromBook').mockReturnValue(
      new BookMetadataPatch({ title: null, summary: null, number: null, numberSort: null, releaseDate: null, authors: null, isbn: null, links: null, tags: null, readLists: [] }),
    )
    vi.spyOn(mockProvider, 'getSeriesMetadataFromBook').mockReturnValue(
      new SeriesMetadataPatch({
        title: ' ',
        titleSort: null,
        status: null,
        summary: null,
        readingDirection: null,
        publisher: null,
        ageRating: null,
        language: null,
        genres: null,
        totalBookCount: null,
        collections: new Set(),
      }),
    )

    const [seriesId, number] = await transientBookLifecycle.getMetadata(book)

    expect(seriesId).toBeNull()
    expect(number).toBeNull()
  })
})
