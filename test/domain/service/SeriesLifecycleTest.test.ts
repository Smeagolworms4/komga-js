// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/SeriesLifecycleTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
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
import '../../../src/domain/service/SeriesLifecycle.js'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { BookMetadata } from '../../../src/domain/model/BookMetadata.js'
import { Dimension } from '../../../src/domain/model/Dimension.js'
import type { Media } from '../../../src/domain/model/Media.js'
import { ThumbnailBook } from '../../../src/domain/model/ThumbnailBook.js'
import { ThumbnailSeries } from '../../../src/domain/model/ThumbnailSeries.js'
import { BookMetadataAggregationRepository } from '../../../src/domain/persistence/BookMetadataAggregationRepository.js'
import { BookMetadataRepository } from '../../../src/domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../src/domain/persistence/BookRepository.js'
import { LibraryRepository } from '../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../src/domain/persistence/MediaRepository.js'
import { SeriesMetadataRepository } from '../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../src/domain/persistence/SeriesRepository.js'
import { ThumbnailBookRepository } from '../../../src/domain/persistence/ThumbnailBookRepository.js'
import { ThumbnailSeriesRepository } from '../../../src/domain/persistence/ThumbnailSeriesRepository.js'
import { BookLifecycle } from '../../../src/domain/service/BookLifecycle.js'
import { SeriesLifecycle } from '../../../src/domain/service/SeriesLifecycle.js'
import { DataAccessException } from '../../../src/port/jooq/exceptions.js'
import { pathToUrl } from '../../../src/port/java-net.js'
import { Exception, IllegalArgumentException, RuntimeException, first, sortedBy } from '../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { any, clearMocks, every, match, verify } from '../../support/mockk.js'
import { makeBook, makeLibrary, makeSeries } from '../model/Utils.js'

// PORT: catchThrowable d'AssertJ
function catchThrowable(f: () => unknown): unknown {
  try {
    f()
    return null
  } catch (e) {
    return e
  }
}

// PORT: Jimfs.newFileSystem(Configuration.unix()).use { fs -> } -> répertoire temporaire du système de fichiers réel, supprimé après usage
function withFileSystem(block: (fs: { getPath: (p: string) => string }) => void): void {
  const base = mkdtempSync(join(tmpdir(), 'jimfs'))
  try {
    block({ getPath: (p: string) => join(base, p) })
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
}

// PORT: any<Collection<T>>() : distingue la surcharge Collection (une seule méthode `insert` en TS)
function anyCollection<T>(): Iterable<T> {
  return match<Iterable<T>>((it) => it !== null && typeof it === 'object' && Symbol.iterator in it, 'any<Collection>()')
}

describe('SeriesLifecycleTest', () => {
  const ctx = springBootTest({}, [
    // @SpykBean private lateinit var bookLifecycle: BookLifecycle
    { type: BookLifecycle, spyk: true },
    // @SpykBean private lateinit var seriesMetadataRepository: SeriesMetadataRepository
    { type: SeriesMetadataRepository, spyk: true },
    // @SpykBean private lateinit var bookMetadataAggregationRepository: BookMetadataAggregationRepository
    { type: BookMetadataAggregationRepository, spyk: true },
    // @SpykBean private lateinit var mediaRepository: MediaRepository
    { type: MediaRepository, spyk: true },
    // @SpykBean private lateinit var bookMetadataRepository: BookMetadataRepository
    { type: BookMetadataRepository, spyk: true },
  ])
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const bookRepository = ctx.getBean(BookRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const thumbnailSeriesRepository = ctx.getBean(ThumbnailSeriesRepository)
  const thumbnailBookRepository = ctx.getBean(ThumbnailBookRepository)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const bookMetadataAggregationRepository = ctx.getBean(BookMetadataAggregationRepository)
  const mediaRepository = ctx.getBean(MediaRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  afterAll(() => closeContext(ctx))

  // PORT: springmockk réinitialise les @SpykBean après chaque test, après les méthodes @AfterEach
  // (les hooks afterEach de Vitest s'exécutent dans l'ordre inverse de leur déclaration)
  afterEach(() => clearMocks(bookLifecycle, seriesMetadataRepository, bookMetadataAggregationRepository, mediaRepository, bookMetadataRepository))

  const library = makeLibrary()

  beforeAll(() => {
    libraryRepository.insert(library)
  })

  afterAll(() => {
    libraryRepository.deleteAll()
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
  })

  it('given series with unordered books when saving then books are ordered with natural sort', () => {
    // given
    const books = [
      makeBook('book 1', { libraryId: library.id }),
      makeBook('boôk 05', { libraryId: library.id }),
      makeBook('  book 3', { libraryId: library.id }),
      makeBook('book   4   ', { libraryId: library.id }),
      makeBook('book  6', { libraryId: library.id }),
      makeBook('book  002', { libraryId: library.id }),
    ]
    const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
    seriesLifecycle.addBooks(createdSeries, books)

    // when
    seriesLifecycle.sortBooks(createdSeries)

    // then
    expect(seriesRepository.count()).toBe(1)
    expect(bookRepository.count()).toBe(6)

    const savedBooks = sortedBy(bookRepository.findAllBySeriesId(createdSeries.id), (it) => it.number)
    expect(savedBooks.map((it) => it.name)).toEqual(['book 1', 'book  002', '  book 3', 'book   4   ', 'boôk 05', 'book  6'])
    expect(savedBooks.map((it) => it.number)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('given series when removing a book then remaining books are indexed in sequence', () => {
    // given
    const books = [
      makeBook('book 1', { libraryId: library.id }),
      makeBook('book 2', { libraryId: library.id }),
      makeBook('book 3', { libraryId: library.id }),
      makeBook('book 4', { libraryId: library.id }),
    ]
    const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
    seriesLifecycle.addBooks(createdSeries, books)
    seriesLifecycle.sortBooks(createdSeries)

    // when
    const book = first(bookRepository.findAllBySeriesId(createdSeries.id), (it) => it.name === 'book 2')
    bookLifecycle.deleteOne(book)
    seriesLifecycle.sortBooks(createdSeries)

    // then
    expect(seriesRepository.count()).toBe(1)
    expect(bookRepository.count()).toBe(3)

    const savedBooks = sortedBy(bookRepository.findAllBySeriesId(createdSeries.id), (it) => it.number)
    expect(savedBooks.map((it) => it.name)).toEqual(['book 1', 'book 3', 'book 4'])
    expect(savedBooks.map((it) => it.number)).toEqual([1, 2, 3])
  })

  it('given series when adding a book then all books are indexed in sequence', () => {
    // given
    const books = [
      makeBook('book 1', { libraryId: library.id }),
      makeBook('book 2', { libraryId: library.id }),
      makeBook('book 4', { libraryId: library.id }),
      makeBook('book 5', { libraryId: library.id }),
    ]
    const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
    seriesLifecycle.addBooks(createdSeries, books)
    seriesLifecycle.sortBooks(createdSeries)

    // when
    const book = makeBook('book 3', { libraryId: library.id })
    seriesLifecycle.addBooks(createdSeries, [book])
    seriesLifecycle.sortBooks(createdSeries)

    // then
    expect(seriesRepository.count()).toBe(1)
    expect(bookRepository.count()).toBe(5)

    const savedBooks = sortedBy(bookRepository.findAllBySeriesId(createdSeries.id), (it) => it.number)
    expect(savedBooks.map((it) => it.name)).toEqual(['book 1', 'book 2', 'book 3', 'book 4', 'book 5'])
    expect(savedBooks.map((it) => it.number)).toEqual([1, 2, 3, 4, 5])
  })

  describe('Transactions', () => {
    it('given series when saving and an exception occur while saving metadata then series is not saved', () => {
      // given
      const series = makeSeries('series', { libraryId: library.id })
      every(() => seriesMetadataRepository.insert(any())).throws(new DataAccessException(''))

      // when
      const thrown = catchThrowable(() => seriesLifecycle.createSeries(series))

      // then
      expect(thrown).toBeInstanceOf(RuntimeException)
      expect(bookMetadataAggregationRepository.count()).toBe(0)
      expect(seriesMetadataRepository.count()).toBe(0)
      expect(seriesRepository.count()).toBe(0)
    })

    it('given series when saving and an exception occur while saving metadata aggregation then series is not saved', () => {
      // given
      const series = makeSeries('series', { libraryId: library.id })
      every(() => bookMetadataAggregationRepository.insert(any())).throws(new DataAccessException(''))

      // when
      const thrown = catchThrowable(() => seriesLifecycle.createSeries(series))

      // then
      expect(thrown).toBeInstanceOf(RuntimeException)
      expect(bookMetadataAggregationRepository.count()).toBe(0)
      expect(seriesMetadataRepository.count()).toBe(0)
      expect(seriesRepository.count()).toBe(0)
    })

    it('given series when adding books and an exception occur while saving media then books are not saved', () => {
      const books = [makeBook('book 1', { libraryId: library.id })]
      const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))

      every(() => mediaRepository.insert(anyCollection<Media>())).throws(new DataAccessException(''))

      // when
      const thrown = catchThrowable(() => seriesLifecycle.addBooks(createdSeries, books))

      // then
      expect(thrown).toBeInstanceOf(Exception)
      expect(mediaRepository.count()).toBe(0)
      expect(bookMetadataRepository.count()).toBe(0)
      expect(bookRepository.count()).toBe(0)
    })

    it('given series when adding books and an exception occur while saving metadata then books are not saved', () => {
      const books = [makeBook('book 1', { libraryId: library.id })]
      const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))

      every(() => bookMetadataRepository.insert(anyCollection<BookMetadata>())).throws(new DataAccessException(''))

      // when
      const thrown = catchThrowable(() => seriesLifecycle.addBooks(createdSeries, books))

      // then
      expect(thrown).toBeInstanceOf(Exception)
      expect(mediaRepository.count()).toBe(0)
      expect(bookMetadataRepository.count()).toBe(0)
      expect(bookRepository.count()).toBe(0)
    })
  })

  it('given a sidecar thumbnail when deleting then IllegarlArgumentException is thrown', () => {
    const thumbnail = new ThumbnailSeries({ type: ThumbnailSeries.Type.SIDECAR, fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })

    const thrown = catchThrowable(() => seriesLifecycle.deleteThumbnailForSeries(thumbnail))

    expect(thrown).toBeInstanceOf(IllegalArgumentException)
  })

  it('given a series when deleting series then series directory is deleted', () => {
    withFileSystem((fs) => {
      // given
      const root = fs.getPath('/root')
      mkdirSync(root)
      const seriesPath = join(root, 'series')
      mkdirSync(seriesPath)
      const book1Path = join(seriesPath, 'book1.cbz')
      writeFileSync(book1Path, '')
      const book2Path = join(seriesPath, 'book2.cbz')
      writeFileSync(book2Path, '')
      const bookSidecarPath = join(seriesPath, 'sidecar1.png')
      writeFileSync(bookSidecarPath, '')

      const series = makeSeries('series', { libraryId: library.id, url: pathToUrl(seriesPath) })
      const books = [makeBook('1', { libraryId: library.id, url: pathToUrl(book1Path) }), makeBook('2', { libraryId: library.id, url: pathToUrl(book2Path) })]
      const bookSidecar = new ThumbnailBook({ bookId: books[0]!.id, type: ThumbnailBook.Type.SIDECAR, url: pathToUrl(bookSidecarPath), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })

      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, books)
      thumbnailBookRepository.insert(bookSidecar)

      // when
      seriesLifecycle.deleteSeriesFiles(series)

      // then
      // UPSTREAM-BUG: assertThat(Boolean) sans assertion, ne vérifie rien
      expect(!existsSync(seriesPath))
    })
  })

  it('given a series with a series sidecar when deleting series then series directory is deleted', () => {
    withFileSystem((fs) => {
      // given
      const root = fs.getPath('/root')
      mkdirSync(root)
      const seriesPath = join(root, 'series')
      mkdirSync(seriesPath)
      const book1Path = join(seriesPath, 'book1.cbz')
      writeFileSync(book1Path, '')
      const book2Path = join(seriesPath, 'book2.cbz')
      writeFileSync(book2Path, '')
      const bookSidecarPath = join(seriesPath, 'sidecar1.png')
      writeFileSync(bookSidecarPath, '')
      const seriesSidecarPath = join(seriesPath, 'cover.png')
      writeFileSync(seriesSidecarPath, '')

      const series = makeSeries('series', { libraryId: library.id, url: pathToUrl(seriesPath) })
      const books = [makeBook('1', { libraryId: library.id, url: pathToUrl(book1Path) }), makeBook('2', { libraryId: library.id, url: pathToUrl(book2Path) })]
      const bookSidecar = new ThumbnailBook({ bookId: books[0]!.id, type: ThumbnailBook.Type.SIDECAR, url: pathToUrl(bookSidecarPath), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })
      const seriesSidecar = new ThumbnailSeries({ seriesId: series.id, type: ThumbnailSeries.Type.SIDECAR, url: pathToUrl(seriesSidecarPath), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })

      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, books)
      thumbnailBookRepository.insert(bookSidecar)
      thumbnailSeriesRepository.insert(seriesSidecar)

      // when
      seriesLifecycle.deleteSeriesFiles(series)

      // then
      // UPSTREAM-BUG: assertThat(Boolean) sans assertion, ne vérifie rien
      expect(!existsSync(seriesPath))
    })
  })

  it('given a series directory with unrelated files when deleting series then series directory should not be deleted', () => {
    withFileSystem((fs) => {
      // given
      const root = fs.getPath('/root')
      mkdirSync(root)
      const seriesPath = join(root, 'series')
      mkdirSync(seriesPath)
      const book1Path = join(seriesPath, 'book1.cbz')
      writeFileSync(book1Path, '')
      const book2Path = join(seriesPath, 'book2.cbz')
      writeFileSync(book2Path, '')
      const filePath = join(seriesPath, 'file.txt')
      writeFileSync(filePath, '')
      const bookSidecarPath = join(seriesPath, 'sidecar1.png')
      writeFileSync(bookSidecarPath, '')
      const seriesSidecarPath = join(seriesPath, 'cover.png')
      writeFileSync(seriesSidecarPath, '')

      const series = makeSeries('series', { libraryId: library.id, url: pathToUrl(seriesPath) })
      const books = [makeBook('1', { libraryId: library.id, url: pathToUrl(book1Path) }), makeBook('2', { libraryId: library.id, url: pathToUrl(book2Path) })]
      const bookSidecar = new ThumbnailBook({ bookId: books[0]!.id, type: ThumbnailBook.Type.SIDECAR, url: pathToUrl(bookSidecarPath), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })
      const seriesSidecar = new ThumbnailSeries({ seriesId: series.id, type: ThumbnailSeries.Type.SIDECAR, url: pathToUrl(seriesSidecarPath), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })

      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, books)
      thumbnailBookRepository.insert(bookSidecar)
      thumbnailSeriesRepository.insert(seriesSidecar)

      // when
      seriesLifecycle.deleteSeriesFiles(series)

      // then
      // UPSTREAM-BUG: assertThat(Boolean) sans assertion, ne vérifie rien
      expect(existsSync(seriesPath))
      expect(existsSync(filePath))
      expect(!existsSync(book1Path))
      expect(!existsSync(book2Path))
      expect(!existsSync(bookSidecarPath))
      expect(!existsSync(seriesSidecarPath))
    })
  })

  it('given a non-existent series directory when deleting series then it returns', () => {
    // given
    const seriesPath = '/non-existent'
    const series = makeSeries('series', { libraryId: library.id, url: pathToUrl(seriesPath) })

    // when
    seriesLifecycle.deleteSeriesFiles(series)

    // then
    verify({ exactly: 0 }, () => bookLifecycle.softDeleteMany(any()))
  })

  it('given a series and a non-existent sidecar file when deleting series then series should be deleted', () => {
    withFileSystem((fs) => {
      // given
      const root = fs.getPath('/root')
      mkdirSync(root)
      const seriesPath = join(root, 'series')
      mkdirSync(seriesPath)
      const book1Path = join(seriesPath, 'book1.cbz')
      writeFileSync(book1Path, '')
      const book2Path = join(seriesPath, 'book2.cbz')
      writeFileSync(book2Path, '')
      const bookSidecarPath = join(seriesPath, 'sidecar1.png')
      writeFileSync(bookSidecarPath, '')
      const seriesSidecarPath = join(seriesPath, 'cover.png')

      const series = makeSeries('series', { libraryId: library.id, url: pathToUrl(seriesPath) })
      const books = [makeBook('1', { libraryId: library.id, url: pathToUrl(book1Path) }), makeBook('2', { libraryId: library.id, url: pathToUrl(book2Path) })]
      const bookSidecar = new ThumbnailBook({ bookId: books[0]!.id, type: ThumbnailBook.Type.SIDECAR, url: pathToUrl(bookSidecarPath), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })
      const seriesSidecar = new ThumbnailSeries({ seriesId: series.id, type: ThumbnailSeries.Type.SIDECAR, url: pathToUrl(seriesSidecarPath), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })

      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, books)
      thumbnailBookRepository.insert(bookSidecar)
      thumbnailSeriesRepository.insert(seriesSidecar)

      // when
      seriesLifecycle.deleteSeriesFiles(series)

      // then
      // UPSTREAM-BUG: assertThat(Boolean) sans assertion, ne vérifie rien
      expect(!existsSync(seriesPath))
    })
  })
})
