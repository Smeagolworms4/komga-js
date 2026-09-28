// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/LibraryContentLifecycleTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
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
import '../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../src/infrastructure/jooq/main/PageHashDao.js'
import '../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../src/infrastructure/jooq/main/SyncPointDao.js'
import '../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import '../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../src/infrastructure/jooq/tasks/TasksDao.js'
import '../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import '../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../src/infrastructure/cache/TransientBookCache.js'
import '../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../src/infrastructure/search/LuceneHelper.js'
import '../../../src/infrastructure/search/SearchIndexLifecycle.js'
import '../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import '../../../src/infrastructure/security/session/SessionConfiguration.js'
import '../../../src/infrastructure/metadata/barcode/IsbnConfiguration.js'
import '../../../src/infrastructure/metadata/comicrack/ComicInfoProvider.js'
import '../../../src/infrastructure/metadata/localartwork/LocalArtworkProvider.js'
import '../../../src/infrastructure/metadata/mylar/MylarSeriesProvider.js'
import '../../../src/infrastructure/jooq/main/ReadListRequestDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailReadListDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailSeriesCollectionDao.js'
import '../../../src/domain/service/FileSystemScanner.js'
import '../../../src/domain/service/SeriesLifecycle.js'
import '../../../src/domain/service/BookLifecycle.js'
import '../../../src/domain/service/ReadListLifecycle.js'
import '../../../src/domain/service/SeriesCollectionLifecycle.js'
import '../../../src/domain/service/KomgaUserLifecycle.js'
import '../../../src/domain/service/LibraryLifecycle.js'
import '../../../src/domain/service/LibraryContentLifecycle.js'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TaskEmitter } from '../../../src/application/tasks/TaskEmitter.js'
import type { Book } from '../../../src/domain/model/Book.js'
import { BookMetadataPatchCapability } from '../../../src/domain/model/BookMetadataPatch.js'
import { Dimension } from '../../../src/domain/model/Dimension.js'
import { DirectoryNotFoundException } from '../../../src/domain/model/Exceptions.js'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { MarkSelectedPreference } from '../../../src/domain/model/MarkSelectedPreference.js'
import { Media } from '../../../src/domain/model/Media.js'
import { ReadList } from '../../../src/domain/model/ReadList.js'
import type { ScanResult } from '../../../src/domain/model/ScanResult.js'
import { SearchContext } from '../../../src/domain/model/SearchContext.js'
import type { Series } from '../../../src/domain/model/Series.js'
import { SeriesCollection } from '../../../src/domain/model/SeriesCollection.js'
import { ThumbnailBook } from '../../../src/domain/model/ThumbnailBook.js'
import { ThumbnailSeries } from '../../../src/domain/model/ThumbnailSeries.js'
import { BookMetadataRepository } from '../../../src/domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../src/domain/persistence/MediaRepository.js'
import { ReadListRepository } from '../../../src/domain/persistence/ReadListRepository.js'
import { ReadProgressRepository } from '../../../src/domain/persistence/ReadProgressRepository.js'
import { SeriesCollectionRepository } from '../../../src/domain/persistence/SeriesCollectionRepository.js'
import { SeriesMetadataRepository } from '../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../src/domain/persistence/SeriesRepository.js'
import { ThumbnailBookRepository } from '../../../src/domain/persistence/ThumbnailBookRepository.js'
import { BookAnalyzer } from '../../../src/domain/service/BookAnalyzer.js'
import { BookLifecycle } from '../../../src/domain/service/BookLifecycle.js'
import { FileSystemScanner } from '../../../src/domain/service/FileSystemScanner.js'
import { KomgaUserLifecycle } from '../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryContentLifecycle } from '../../../src/domain/service/LibraryContentLifecycle.js'
import { LibraryLifecycle } from '../../../src/domain/service/LibraryLifecycle.js'
import { ReadListLifecycle } from '../../../src/domain/service/ReadListLifecycle.js'
import { SeriesCollectionLifecycle } from '../../../src/domain/service/SeriesCollectionLifecycle.js'
import { SeriesLifecycle } from '../../../src/domain/service/SeriesLifecycle.js'
import { Hasher } from '../../../src/infrastructure/hash/Hasher.js'
import { SeriesDtoRepository } from '../../../src/interfaces/api/persistence/SeriesDtoRepository.js'
import { toIndexedMap } from '../../../src/language/LanguageUtils.js'
import { URL, urlToPath } from '../../../src/port/java-net.js'
import { pathNameWithoutExtension } from '../../../src/port/java-nio-file.js'
import { first, isBlank, nn, partition, sortedBy } from '../../../src/port/kotlin.js'
import { Pageable } from '../../../src/port/spring-data.js'
import '../../../src/infrastructure/kobo/KepubConverter.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { any, capture, clearMocks, every, match, mockk, slot, verify } from '../../support/mockk.js'
import { toScanResult } from '../../Utils.js'
import { makeBook, makeBookPage, makeLibrary, makeSeries } from '../model/Utils.js'

function catchThrowable(block: () => unknown): unknown {
  try {
    block()
    return null
  } catch (e) {
    return e
  }
}

function sorted<T>(a: readonly T[]): T[] {
  return [...a].sort()
}

// PORT: mapOf(a to b, ...).toScanResult()
function scan(...entries: [Series, Book[]][]): ScanResult {
  return toScanResult(new Map(entries))
}

describe('LibraryContentLifecycleTest', () => {
  // @MockkBean
  const mockScanner = mockk(FileSystemScanner)
  const mockAnalyzer = mockk(BookAnalyzer)
  const mockHasher = mockk(Hasher)
  const mockTaskEmitter = mockk(TaskEmitter)

  const ctx = springBootTest({}, [
    { type: FileSystemScanner, instance: mockScanner },
    { type: BookAnalyzer, instance: mockAnalyzer },
    { type: Hasher, instance: mockHasher },
    { type: TaskEmitter, instance: mockTaskEmitter },
  ])
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const bookRepository = ctx.getBean(BookRepository)
  const libraryContentLifecycle = ctx.getBean(LibraryContentLifecycle)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const mediaRepository = ctx.getBean(MediaRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const readListRepository = ctx.getBean(ReadListRepository)
  const readListLifecycle = ctx.getBean(ReadListLifecycle)
  const collectionRepository = ctx.getBean(SeriesCollectionRepository)
  const collectionLifecycle = ctx.getBean(SeriesCollectionLifecycle)
  const readProgressRepository = ctx.getBean(ReadProgressRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const seriesDtoRepository = ctx.getBean(SeriesDtoRepository)
  const thumbnailBookRepository = ctx.getBean(ThumbnailBookRepository)

  const user = new KomgaUser({ email: 'user@example.org', password: '', id: '1' })

  beforeAll(() => {
    userRepository.insert(user)
  })

  beforeEach(() => {
    // PORT: les paramètres par défaut Kotlin sont un objet optionnel en TS : seul le premier argument est filtré
    every(() => mockTaskEmitter.refreshBookMetadata(any())).justRuns()
    every(() => mockTaskEmitter.refreshSeriesMetadata(any())).justRuns()
  })

  afterAll(() => {
    userRepository.findAll().forEach((it) => {
      userLifecycle.deleteUser(it)
    })
    closeContext(ctx)
  })

  afterEach(() => {
    // clear repositories
    libraryRepository.findAll().forEach((it) => {
      libraryLifecycle.deleteLibrary(it)
    })
    // PORT: les @MockkBean sont réinitialisés après chaque test
    clearMocks(mockScanner, mockAnalyzer, mockHasher, mockTaskEmitter)
  })

  describe('Scan', () => {
    it('given existing series when adding files and scanning then only updated books are persisted', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1')]]),
        scan([makeSeries('series'), [makeBook('book1'), makeBook('book2')]]),
      )
      libraryContentLifecycle.scanRootFolder(library)

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.name)).toEqual(['book1', 'book2'])
    })

    it('given existing series when removing files and scanning then updated books are persisted and removed books are marked as such', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1'), makeBook('book2')]]),
        scan([makeSeries('series'), [makeBook('book1')]]),
      )
      libraryContentLifecycle.scanRootFolder(library)

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(2)
      expect(allBooks.filter((it) => it.deletedDate === null).map((it) => it.name)).toEqual(['book1'])
      expect(allBooks.filter((it) => it.deletedDate !== null).map((it) => it.name)).toEqual(['book2'])
    })

    it('given existing series when updating files and scanning then books are updated', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1')]]),
        scan([makeSeries('series'), [makeBook('book1')]]),
      )
      libraryContentLifecycle.scanRootFolder(library)

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = bookRepository.findAll()

      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))
      verify({ exactly: 0 }, () => mockHasher.computeHash(any()))

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(1)
      const book = allBooks[0]!
      expect(book.name).toBe('book1')
      expect(book.lastModifiedDate.equals(book.createdDate)).toBe(false)
      const media = mediaRepository.findById(book.id)
      expect(media.status).toBe(Media.Status.OUTDATED)
    })

    it('given existing series when scanning and updated files have a different size then books are marked outdated', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1').copy({ fileSize: 1 })]]),
        scan([makeSeries('series'), [makeBook('book1').copy({ fileSize: 2 })]]),
      )
      libraryContentLifecycle.scanRootFolder(library)

      {
        const book = bookRepository.findAll()[0]!
        bookRepository.update(book.copy({ fileHash: 'hashed' }))
        mediaRepository.update(mediaRepository.findById(book.id).copy({ status: Media.Status.READY }))
      }

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = bookRepository.findAll()

      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))
      verify({ exactly: 0 }, () => mockHasher.computeHash(any()))

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(1)
      const book = allBooks[0]!
      expect(book.name).toBe('book1')
      expect(book.lastModifiedDate.equals(book.createdDate)).toBe(false)
      expect(isBlank(book.fileHash)).toBe(true)
      const media = mediaRepository.findById(book.id)
      expect(media.status).toBe(Media.Status.OUTDATED)
    })

    it('given existing series when scanning and updated files have the same hash then books are not marked outdated', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1')]]),
        scan([makeSeries('series'), [makeBook('book1')]]),
      )
      libraryContentLifecycle.scanRootFolder(library)

      {
        const book = bookRepository.findAll()[0]!
        bookRepository.update(book.copy({ fileHash: 'hashed' }))
        mediaRepository.update(mediaRepository.findById(book.id).copy({ status: Media.Status.READY }))
      }

      every(() => mockHasher.computeHash(any())).returns('hashed')

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = bookRepository.findAll()

      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))
      verify({ exactly: 1 }, () => mockHasher.computeHash(any()))

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(1)
      const book = allBooks[0]!
      expect(book.name).toBe('book1')
      expect(book.lastModifiedDate.equals(book.createdDate)).toBe(false)
      expect(book.fileHash).toBe('hashed')
      const media = mediaRepository.findById(book.id)
      expect(media.status).not.toBe(Media.Status.OUTDATED)
      expect(media.status).toBe(Media.Status.READY)
    })

    it('given existing series when deleting all books and scanning then Series and Books are marked as deleted', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(scan([makeSeries('series'), [makeBook('book1')]]), scan())
      libraryContentLifecycle.scanRootFolder(library)

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))

      const allSeries = seriesRepository.findAll()
      const allBooks = bookRepository.findAll()

      expect(allSeries.map((it) => it.deletedDate)).not.toContain(null)
      expect(allSeries).toHaveLength(1)
      expect(allBooks.map((it) => it.deletedDate)).not.toContain(null)
      expect(allBooks).toHaveLength(1)
    })

    it('given existing series when deleting all books of one series and scanning then series and its books are marked as deleted', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1')]], [makeSeries('series2'), [makeBook('book2')]]),
        scan([makeSeries('series'), [makeBook('book1')]]),
      )
      libraryContentLifecycle.scanRootFolder(library)

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))

      const [series, deletedSeries] = partition(seriesRepository.findAll(), (it) => it.deletedDate === null)
      const [books, deletedBooks] = partition(bookRepository.findAll(), (it) => it.deletedDate === null)

      expect(series).toHaveLength(1)
      expect(sorted(series.map((it) => it.name))).toEqual(['series'])

      expect(deletedSeries).toHaveLength(1)
      expect(sorted(deletedSeries.map((it) => it.name))).toEqual(['series2'])

      expect(books).toHaveLength(1)
      expect(sorted(books.map((it) => it.name))).toEqual(['book1'])

      expect(deletedBooks).toHaveLength(1)
      expect(sorted(deletedBooks.map((it) => it.name))).toEqual(['book2'])
    })

    it('given existing book with media when rescanning then media is kept intact', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book1 = makeBook('book1')
      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [book1]]),
        scan([makeSeries('series'), [makeBook('book1', { fileLastModified: book1.fileLastModified })]]),
      )
      libraryContentLifecycle.scanRootFolder(library)

      every(() => mockAnalyzer.analyze(any(), any())).returns(
        new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: [makeBookPage('1.jpg'), makeBookPage('2.jpg')], bookId: book1.id }),
      )
      bookRepository.findAll().map((it) => bookLifecycle.analyzeAndPersist(it))

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))
      verify({ exactly: 1 }, () => mockAnalyzer.analyze(any(), any()))

      {
        const book = bookRepository.findAll()[0]!
        expect(book.lastModifiedDate.equals(book.createdDate)).toBe(false)

        const media = mediaRepository.findById(book.id)
        expect(media.status).toBe(Media.Status.READY)
        expect(media.mediaType).toBe('application/zip')
        expect(media.pages).toHaveLength(2)
        expect(media.pages.map((it) => it.fileName)).toEqual(['1.jpg', '2.jpg'])
      }
    })

    it('given existing book with different last modified date and hash when rescanning then media is marked as outdated and hash is reset', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book1 = makeBook('book1')
      every(() => mockScanner.scanRootFolder(any())).returnsMany(scan([makeSeries('series'), [book1]]), scan([makeSeries('series'), [makeBook('book1')]]))
      libraryContentLifecycle.scanRootFolder(library)

      every(() => mockAnalyzer.analyze(any(), any())).returns(
        new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: [makeBookPage('1.jpg'), makeBookPage('2.jpg')], bookId: book1.id }),
      )
      every(() => mockHasher.computeHash(any())).returnsMany('abc', 'def')

      bookRepository.findAll().map((it) => {
        bookLifecycle.analyzeAndPersist(it)
        bookLifecycle.hashAndPersist(it)
      })

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))
      verify({ exactly: 1 }, () => mockAnalyzer.analyze(any(), any()))
      verify({ exactly: 2 }, () => mockHasher.computeHash(any()))

      {
        const book = bookRepository.findAll()[0]!
        expect(book.lastModifiedDate.equals(book.createdDate)).toBe(false)
        expect(book.fileHash).toBe('def')

        const media = mediaRepository.findById(book.id)
        expect(media.status).toBe(Media.Status.OUTDATED)
        expect(media.mediaType).toBe('application/zip')
        expect(media.pages).toHaveLength(2)
        expect(media.pages.map((it) => it.fileName)).toEqual(['1.jpg', '2.jpg'])
      }
    })

    it('given 2 libraries when deleting all books of one and scanning then the other library is kept intact', () => {
      // given
      const library1 = makeLibrary({ name: 'library1' })
      libraryRepository.insert(library1)
      const library2 = makeLibrary({ name: 'library2' })
      libraryRepository.insert(library2)

      every(() => mockScanner.scanRootFolder(urlToPath(library1.root))).returns(scan([makeSeries('series1'), [makeBook('book1')]]))

      every(() => mockScanner.scanRootFolder(urlToPath(library2.root))).returnsMany(scan([makeSeries('series2'), [makeBook('book2')]]), scan())

      libraryContentLifecycle.scanRootFolder(library1)
      libraryContentLifecycle.scanRootFolder(library2)

      expect(seriesRepository.count(), 'Series repository should not be empty').toBe(2)
      expect(bookRepository.count(), 'Book repository should not be empty').toBe(2)

      // when
      libraryContentLifecycle.scanRootFolder(library2)

      // then
      verify({ exactly: 1 }, () => mockScanner.scanRootFolder(urlToPath(library1.root)))
      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(urlToPath(library2.root)))

      const [seriesLib1, seriesLib2] = partition(seriesRepository.findAll(), (it) => it.libraryId === library1.id)
      const [booksLib1, booksLib2] = partition(bookRepository.findAll(), (it) => it.libraryId === library1.id)

      expect(seriesLib1.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      expect(sorted(seriesLib1.map((it) => it.name))).toEqual(['series1'])

      expect(seriesLib2.map((it) => it.deletedDate)).not.toContain(null)
      expect(sorted(seriesLib2.map((it) => it.name))).toEqual(['series2'])

      expect(booksLib1.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      expect(sorted(booksLib1.map((it) => it.name))).toEqual(['book1'])

      expect(booksLib2.map((it) => it.deletedDate)).not.toContain(null)
      expect(sorted(booksLib2.map((it) => it.name))).toEqual(['book2'])
    })

    it('given library with auto empty trash when scanning then removed series and books are deleted permanently', () => {
      // given
      const library = makeLibrary().copy({ emptyTrashAfterScan: true })
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1'), makeBook('book3')]], [makeSeries('series2'), [makeBook('book2')]]),
        scan([makeSeries('series'), [makeBook('book1')]]),
      )
      libraryContentLifecycle.scanRootFolder(library)

      // when
      libraryContentLifecycle.scanRootFolder(library)

      // then
      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))

      const [series, deletedSeries] = partition(seriesRepository.findAll(), (it) => it.deletedDate === null)
      const [books, deletedBooks] = partition(bookRepository.findAll(), (it) => it.deletedDate === null)

      expect(series).toHaveLength(1)
      expect(sorted(series.map((it) => it.name))).toEqual(['series'])

      expect(deletedSeries).toHaveLength(0)

      expect(books).toHaveLength(1)
      expect(sorted(books.map((it) => it.name))).toEqual(['book1'])

      expect(deletedBooks).toHaveLength(0)
    })

    it('given library when scanning and the root folder is not accessible then exception is thrown', () => {
      // given
      const library = makeLibrary().copy({ emptyTrashAfterScan: true })
      libraryRepository.insert(library)

      // PORT: `returns x andThenThrows e`
      const firstResult = scan([makeSeries('series'), [makeBook('book1'), makeBook('book3')]], [makeSeries('series2'), [makeBook('book2')]])
      let calls = 0
      every(() => mockScanner.scanRootFolder(any())).answers(() => {
        if (calls++ === 0) return firstResult
        throw new DirectoryNotFoundException('')
      })

      libraryContentLifecycle.scanRootFolder(library)

      // when
      const thrown = catchThrowable(() => libraryContentLifecycle.scanRootFolder(library))

      // then
      verify({ exactly: 2 }, () => mockScanner.scanRootFolder(any()))

      const [series, deletedSeries] = partition(seriesRepository.findAll(), (it) => it.deletedDate === null)
      const [books, deletedBooks] = partition(bookRepository.findAll(), (it) => it.deletedDate === null)

      expect(series).toHaveLength(2)
      expect(sorted(series.map((it) => it.name))).toEqual(sorted(['series', 'series2']))

      expect(deletedSeries).toHaveLength(0)

      expect(books).toHaveLength(3)
      expect(sorted(books.map((it) => it.name))).toEqual(sorted(['book1', 'book2', 'book3']))

      expect(deletedBooks).toHaveLength(0)

      expect((thrown as object).constructor).toBe(DirectoryNotFoundException)
    })
  })

  describe('Restore', () => {
    it('given existing series when removing files and scanning, restoring files and scanning then restored books are available and media status is not set to outdated', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book2 = makeBook('book2')

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1'), book2]]),
        scan([makeSeries('series'), [makeBook('book1')]]),
        scan([makeSeries('series'), [makeBook('book1'), makeBook('book2')]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book2.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          mediaRepository.update(mediaRepository.findById(it.id).copy({ status: Media.Status.READY }))
          bookMetadataRepository.update(bookMetadataRepository.findById(it.id).copy({ tags: new Set(['my-tag']) }))
          bookLifecycle.addThumbnailForBook(
            new ThumbnailBook({
              thumbnail: new Uint8Array(10),
              type: ThumbnailBook.Type.USER_UPLOADED,
              mediaType: 'image/jpeg',
              fileSize: 10,
              dimension: new Dimension({ width: 1, height: 1 }),
              bookId: it.id,
            }),
            MarkSelectedPreference.YES,
          )
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      libraryContentLifecycle.scanRootFolder(library) // deletion

      // when
      libraryContentLifecycle.scanRootFolder(library) // restore

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      verify({ exactly: 3 }, () => mockScanner.scanRootFolder(any()))

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)

      {
        const { id } = allBooks[allBooks.length - 1]!
        expect(mediaRepository.findById(id).status, 'Book media should be kept intact').toBe(Media.Status.READY)
        expect(sorted([...bookMetadataRepository.findById(id).tags])).toEqual(['my-tag'])
        const thumbnail = bookLifecycle.getThumbnail(id)
        expect(thumbnail).not.toBeNull()
        expect(nn(thumbnail).type).toBe(ThumbnailBook.Type.USER_UPLOADED)
        expect(nn(thumbnail).fileSize).toBe(10)
      }
    })

    it('given existing series when deleting all books and scanning then restoring and scanning then Series and Books are available and media status is not set to outdated', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1'), makeBook('book2')]]),
        scan(),
        scan([makeSeries('series'), [makeBook('book1'), makeBook('book2')]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      bookRepository.findAll().forEach((book) => {
        bookRepository.update(book.copy({ fileHash: `HASH-${book.name}` }))
        {
          const it = mediaRepository.findById(book.id)
          mediaRepository.update(it.copy({ status: Media.Status.READY }))
        }
      })

      seriesRepository.findAll().forEach((series) => {
        {
          const it = seriesMetadataRepository.findById(series.id)
          seriesMetadataRepository.update(it.copy({ language: 'en' }))
        }
        seriesLifecycle.addThumbnailForSeries(
          new ThumbnailSeries({
            thumbnail: new Uint8Array(10),
            type: ThumbnailSeries.Type.USER_UPLOADED,
            mediaType: 'image/jpeg',
            fileSize: 10,
            dimension: new Dimension({ width: 1, height: 1 }),
            seriesId: series.id,
          }),
          MarkSelectedPreference.YES,
        )
      })

      const slot_ = slot<string>()
      every(() => mockHasher.computeHash(capture(slot_))).answers(() => `HASH-${pathNameWithoutExtension(slot_.captured)}`)

      libraryContentLifecycle.scanRootFolder(library) // deletion

      // when
      libraryContentLifecycle.scanRootFolder(library) // restore

      // then
      verify({ exactly: 3 }, () => mockScanner.scanRootFolder(any()))

      const allSeries = seriesRepository.findAll()
      const allBooks = bookRepository.findAll()

      expect(allSeries.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      expect(allSeries).toHaveLength(1)

      allSeries.forEach((series) => {
        expect(seriesMetadataRepository.findById(series.id).language).toBe('en')
        const thumbnail = seriesLifecycle.getSelectedThumbnail(series.id)
        expect(thumbnail).not.toBeNull()
        expect(nn(thumbnail).type).toBe(ThumbnailSeries.Type.USER_UPLOADED)
        expect(nn(thumbnail).fileSize).toBe(10)
      })

      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      expect(allBooks).toHaveLength(2)

      allBooks.forEach((book) => {
        expect(mediaRepository.findById(book.id).status).toBe(Media.Status.READY)
      })
    })
  })

  describe('FileRename', () => {
    it('given existing series when renaming 1 file and scanning then renamed book media and generated thumbnails are kept', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book = makeBook('book').copy({ fileSize: 324 })
      const bookRenamed = makeBook('book3').copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [book, makeBook('book2')]]),
        scan([makeSeries('series'), [bookRenamed, makeBook('book2')]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          mediaRepository.update(mediaRepository.findById(it.id).copy({ status: Media.Status.READY }))
          bookLifecycle.addThumbnailForBook(
            new ThumbnailBook({ thumbnail: new Uint8Array(0), type: ThumbnailBook.Type.GENERATED, bookId: book.id, fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) }),
            MarkSelectedPreference.NO,
          )
          bookLifecycle.addThumbnailForBook(
            new ThumbnailBook({ url: new URL('file:/sidecar'), type: ThumbnailBook.Type.SIDECAR, bookId: book.id, fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) }),
            MarkSelectedPreference.NO,
          )
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 1 }, () => mockHasher.computeHash(any()))

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      {
        const { id, name } = allBooks[allBooks.length - 1]!
        expect(name, 'Book name should have changed to match the filename').toBe('book3')
        expect(mediaRepository.findById(id).status, 'Book media should be kept intact').toBe(Media.Status.READY)
        expect(thumbnailBookRepository.findAllByBookIdAndType(id, new Set([ThumbnailBook.Type.SIDECAR]))).toHaveLength(0)
        expect(thumbnailBookRepository.findAllByBookIdAndType(id, new Set([ThumbnailBook.Type.GENERATED]))).toHaveLength(1)
      }
    })

    it('given existing series when renaming 1 file and scanning but series modified time did not change then renamed book media and generated thumbnails are kept', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book = makeBook('book').copy({ fileSize: 324 })
      const bookRenamed = makeBook('book3').copy({ fileSize: 324 })
      const series = makeSeries('series')

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([series, [book, makeBook('book2')]]),
        scan([makeSeries('series').copy({ fileLastModified: series.fileLastModified }), [bookRenamed, makeBook('book2')]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          mediaRepository.update(mediaRepository.findById(it.id).copy({ status: Media.Status.READY }))
          bookLifecycle.addThumbnailForBook(
            new ThumbnailBook({ thumbnail: new Uint8Array(0), type: ThumbnailBook.Type.GENERATED, bookId: book.id, fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) }),
            MarkSelectedPreference.NO,
          )
          bookLifecycle.addThumbnailForBook(
            new ThumbnailBook({ url: new URL('file:/sidecar'), type: ThumbnailBook.Type.SIDECAR, bookId: book.id, fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) }),
            MarkSelectedPreference.NO,
          )
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 1 }, () => mockHasher.computeHash(any()))

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      {
        const { id, name } = allBooks[allBooks.length - 1]!
        expect(name, 'Book name should have changed to match the filename').toBe('book3')
        expect(mediaRepository.findById(id).status, 'Book media should be kept intact').toBe(Media.Status.READY)
        expect(thumbnailBookRepository.findAllByBookIdAndType(id, new Set([ThumbnailBook.Type.SIDECAR]))).toHaveLength(0)
        expect(thumbnailBookRepository.findAllByBookIdAndType(id, new Set([ThumbnailBook.Type.GENERATED]))).toHaveLength(1)
      }
    })

    it('given existing series when renaming 1 file and scanning then renamed book read progress is kept', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book = makeBook('book').copy({ fileSize: 324 })
      const bookRenamed = makeBook('book3').copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [book, makeBook('book2')]]),
        scan([makeSeries('series'), [bookRenamed, makeBook('book2')]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          bookLifecycle.markReadProgressCompleted(it.id, user)
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 1 }, () => mockHasher.computeHash(any()))

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      {
        const { id, name } = allBooks[allBooks.length - 1]!
        expect(name).toBe('book3')
        expect(readProgressRepository.findByBookIdAndUserIdOrNull(id, user.id)).not.toBeNull()
      }

      expect(readProgressRepository.findAll()).toHaveLength(1)
    })

    it('given existing series when renaming 1 file and scanning then renamed book is still in read lists', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book = makeBook('book').copy({ fileSize: 324 })
      const bookRenamed = makeBook('book3').copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [book, makeBook('book2')]]),
        scan([makeSeries('series'), [bookRenamed, makeBook('book2')]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          readListLifecycle.addReadList(new ReadList({ name: 'read list', bookIds: toIndexedMap([it.id]) }))
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 1 }, () => mockHasher.computeHash(any()))

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      {
        const { id, name } = allBooks[allBooks.length - 1]!
        expect(name).toBe('book3')

        const readLists = readListRepository.findAllContainingBookId(id, SearchContext.empty())
        expect(readLists).toHaveLength(1)
        expect(readLists[0]!.name).toBe('read list')
      }
    })

    it("given existing series when renaming 1 file with locked title and scanning then renamed book's title is not changed and book metadata is not refreshed for title", () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book = makeBook('book').copy({ fileSize: 324 })
      const bookRenamed = makeBook('book3').copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [book, makeBook('book2')]]),
        scan([makeSeries('series'), [bookRenamed, makeBook('book2')]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          bookMetadataRepository.update(
            bookMetadataRepository.findById(it.id).copy({
              title: 'Updated Title',
              titleLock: true,
            }),
          )
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 1 }, () => mockHasher.computeHash(any()))
      verify({ exactly: 0 }, () => mockTaskEmitter.refreshBookMetadata(bookRenamed, { capabilities: new Set([BookMetadataPatchCapability.TITLE]) }))

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      {
        const { id, name } = allBooks[allBooks.length - 1]!
        expect(name).toBe('book3')
        const it = bookMetadataRepository.findById(id)
        expect(it.title).toBe('Updated Title')
        expect(it.titleLock).toBe(true)
      }
    })

    it("given existing series when renaming 1 file and scanning then renamed book's title matches the filename and book metadata is refreshed for title only", () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book = makeBook('book').copy({ fileSize: 324 })
      const bookRenamed = makeBook('book3').copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [book, makeBook('book2')]]),
        scan([makeSeries('series'), [bookRenamed, makeBook('book2')]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 1 }, () => mockHasher.computeHash(any()))
      verify({ exactly: 1 }, () =>
        mockTaskEmitter.refreshBookMetadata(
          match<Book>((it) => it.id === bookRenamed.id),
          { capabilities: new Set([BookMetadataPatchCapability.TITLE]) },
        ),
      )

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
      {
        const { id, name } = allBooks[allBooks.length - 1]!
        expect(name).toBe('book3')
        expect(bookMetadataRepository.findById(id).title, 'Book metadata title should have changed to match the filename').toBe('book3')
      }
    })

    it('given series when renaming all files in its folder and scanning then series books media is kept', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1').copy({ fileSize: 1 })]]),
        scan([makeSeries('series1'), [makeBook('book2').copy({ fileSize: 1 })]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = seriesRepository.findAll()[0]!
        seriesMetadataRepository.update(seriesMetadataRepository.findById(it.id).copy({ summary: 'Summary' }))
      }

      bookRepository.findAll().forEach((book) => {
        bookRepository.update(book.copy({ fileHash: 'sameHash' }))
        {
          const it = mediaRepository.findById(book.id)
          mediaRepository.update(it.copy({ status: Media.Status.READY }))
        }
      })

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 1 }, () => mockHasher.computeHash(any()))

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      {
        const series1 = allSeries[0]!
        expect(series1.name).toBe('series1')
        expect(seriesMetadataRepository.findById(series1.id).summary).toBe('Summary')

        const books = bookRepository.findAllBySeriesId(series1.id)
        expect(books).toHaveLength(1)
        {
          const book = books[0]!
          expect(book.name).toBe('book2')
          expect(bookMetadataRepository.findById(book.id).title).toBe('book2')
          expect(mediaRepository.findById(book.id).status).toBe(Media.Status.READY)
        }
      }

      expect(allBooks).toHaveLength(1)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })

    it('given series when renaming all files in its folder but folder modified time is not changed and scanning then series books media is kept', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const series = makeSeries('series1')
      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([series, [makeBook('book1').copy({ fileSize: 1 })]]),
        scan([makeSeries('series1').copy({ fileLastModified: series.fileLastModified }), [makeBook('book2').copy({ fileSize: 1 })]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = seriesRepository.findAll()[0]!
        seriesMetadataRepository.update(seriesMetadataRepository.findById(it.id).copy({ summary: 'Summary' }))
      }

      bookRepository.findAll().forEach((book) => {
        bookRepository.update(book.copy({ fileHash: 'sameHash' }))
        {
          const it = mediaRepository.findById(book.id)
          mediaRepository.update(it.copy({ status: Media.Status.READY }))
        }
      })

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 1 }, () => mockHasher.computeHash(any()))

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      {
        const series1 = allSeries[0]!
        expect(series1.name).toBe('series1')
        expect(seriesMetadataRepository.findById(series1.id).summary).toBe('Summary')

        const books = bookRepository.findAllBySeriesId(series1.id)
        expect(books).toHaveLength(1)
        {
          const book = books[0]!
          expect(book.name).toBe('book2')
          expect(bookMetadataRepository.findById(book.id).title).toBe('book2')
          expect(mediaRepository.findById(book.id).status).toBe(Media.Status.READY)
        }
      }

      expect(allBooks).toHaveLength(1)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })
  })

  describe('FileMoveToAnotherFolder', () => {
    // @DisplayName("given 2 series when moving 1 file from 1 series to another and scanning then moved book's media is kept")
    it('file moved media kept', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book2 = makeBook('book2', { url: new URL('file:/series1/book2') }).copy({ fileSize: 324 })
      const book2Moved = makeBook('book2', { url: new URL('file:/series2/book2') }).copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1'), book2]], [makeSeries('series2'), [makeBook('book1')]]),
        scan([makeSeries('series1'), [makeBook('book1')]], [makeSeries('series2'), [makeBook('book1'), book2Moved]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book2.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          mediaRepository.update(mediaRepository.findById(it.id).copy({ status: Media.Status.READY }))
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(2)
      {
        const { id } = first(allSeries, (it) => it.name === 'series1')
        expect(bookRepository.findAllBySeriesId(id)).toHaveLength(1)
      }

      {
        const { id } = first(allSeries, (it) => it.name === 'series2')
        const books = bookRepository.findAllBySeriesId(id)
        expect(books).toHaveLength(2)

        {
          const it = first(books, (it) => it.name === 'book2')
          expect(mediaRepository.findById(it.id).status).toBe(Media.Status.READY)
        }
      }

      expect(allBooks).toHaveLength(3)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })

    it('given 2 series when moving 1 file from 1 series to another and scanning then moved book read progress is kept', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book2 = makeBook('book2', { url: new URL('file:/series1/book2') }).copy({ fileSize: 324 })
      const book2Moved = makeBook('book2', { url: new URL('file:/series2/book2') }).copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1'), book2]], [makeSeries('series2'), [makeBook('book1')]]),
        scan([makeSeries('series1'), [makeBook('book1')]], [makeSeries('series2'), [makeBook('book1'), book2Moved]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book2.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          bookLifecycle.markReadProgressCompleted(it.id, user)
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(2)
      {
        const { id } = first(allSeries, (it) => it.name === 'series1')
        expect(bookRepository.findAllBySeriesId(id)).toHaveLength(1)
      }

      {
        const { id } = first(allSeries, (it) => it.name === 'series2')
        const books = bookRepository.findAllBySeriesId(id)
        expect(books).toHaveLength(2)

        {
          const it = first(books, (it) => it.name === 'book2')
          expect(readProgressRepository.findByBookIdAndUserIdOrNull(it.id, user.id)).not.toBeNull()
        }
      }

      expect(allBooks).toHaveLength(3)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)

      expect(readProgressRepository.findAll()).toHaveLength(1)
    })

    it('given 2 series when moving 1 file from 1 series to another and scanning then moved book is still in read lists', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book2 = makeBook('book2', { url: new URL('file:/series1/book2') }).copy({ fileSize: 324 })
      const book2Moved = makeBook('book2', { url: new URL('file:/series2/book2') }).copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1'), book2]], [makeSeries('series2'), [makeBook('book1')]]),
        scan([makeSeries('series1'), [makeBook('book1')]], [makeSeries('series2'), [makeBook('book1'), book2Moved]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book2.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          readListLifecycle.addReadList(new ReadList({ name: 'read list', bookIds: toIndexedMap([it.id]) }))
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(2)
      {
        const { id } = first(allSeries, (it) => it.name === 'series1')
        expect(bookRepository.findAllBySeriesId(id)).toHaveLength(1)
      }

      {
        const { id } = first(allSeries, (it) => it.name === 'series2')
        const books = bookRepository.findAllBySeriesId(id)
        expect(books).toHaveLength(2)

        {
          const it = first(books, (it) => it.name === 'book2')
          const readLists = readListRepository.findAllContainingBookId(it.id, SearchContext.empty())
          expect(readLists).toHaveLength(1)
          expect(readLists[0]!.name).toBe('read list')
        }
      }

      expect(allBooks).toHaveLength(3)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })

    it("given 2 series when moving 1 file with locked title from 1 series to another and scanning then moved book's title is not changed and book metadata is not refreshed for title", () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book2 = makeBook('book2', { url: new URL('file:/series1/book2') }).copy({ fileSize: 324 })
      const book2Moved = makeBook('book2', { url: new URL('file:/series2/book2') }).copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1'), book2]], [makeSeries('series2'), [makeBook('book1')]]),
        scan([makeSeries('series1'), [makeBook('book1')]], [makeSeries('series2'), [makeBook('book1'), book2Moved]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book2.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
          bookMetadataRepository.update(
            bookMetadataRepository.findById(it.id).copy({
              title: 'Updated Title',
              titleLock: true,
            }),
          )
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 0 }, () => mockTaskEmitter.refreshBookMetadata(book2Moved, { capabilities: new Set([BookMetadataPatchCapability.TITLE]) }))

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(2)
      {
        const { id } = first(allSeries, (it) => it.name === 'series1')
        expect(bookRepository.findAllBySeriesId(id)).toHaveLength(1)
      }

      {
        const { id } = first(allSeries, (it) => it.name === 'series2')
        const books = bookRepository.findAllBySeriesId(id)
        expect(books).toHaveLength(2)

        {
          const book2 = first(books, (it) => it.name === 'book2')
          const it = bookMetadataRepository.findById(book2.id)
          expect(it.title).toBe('Updated Title')
          expect(it.titleLock).toBe(true)
        }
      }

      expect(allBooks).toHaveLength(3)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })

    // @DisplayName("given 2 series when moving 1 file from 1 series to another and scanning then moved book's title matches the filename and book metadata is refreshed for title only")
    it('file moved title refreshed', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      const book2 = makeBook('book2', { url: new URL('file:/series1/book2') }).copy({ fileSize: 324 })
      const book2Moved = makeBook('book2', { url: new URL('file:/series2/book2') }).copy({ fileSize: 324 })

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1'), book2]], [makeSeries('series2'), [makeBook('book1')]]),
        scan([makeSeries('series1'), [makeBook('book1')]], [makeSeries('series2'), [makeBook('book1'), book2Moved]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = bookRepository.findByIdOrNull(book2.id)
        if (it !== null) {
          bookRepository.update(it.copy({ fileHash: 'sameHash' }))
        }
      }

      every(() => mockHasher.computeHash(any())).returns('sameHash')

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 1 }, () =>
        mockTaskEmitter.refreshBookMetadata(
          match<Book>((it) => it.id === book2Moved.id),
          { capabilities: new Set([BookMetadataPatchCapability.TITLE]) },
        ),
      )

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(2)
      {
        const { id } = first(allSeries, (it) => it.name === 'series1')
        expect(bookRepository.findAllBySeriesId(id)).toHaveLength(1)
      }

      {
        const { id } = first(allSeries, (it) => it.name === 'series2')
        const books = bookRepository.findAllBySeriesId(id)
        expect(books).toHaveLength(2)

        {
          const it = first(books, (it) => it.name === 'book2')
          expect(bookMetadataRepository.findById(it.id).title).toBe('book2')
        }
      }

      expect(allBooks).toHaveLength(3)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })
  })

  describe('RenameFolder', () => {
    it('given series when renaming folder and scanning then renamed series books media is kept', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
        scan([makeSeries('series2'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      bookRepository.findAll().forEach((book) => {
        bookRepository.update(book.copy({ fileHash: `HASH-${book.name}` }))
        {
          const it = mediaRepository.findById(book.id)
          mediaRepository.update(it.copy({ status: Media.Status.READY }))
        }
      })

      const slot_ = slot<string>()
      every(() => mockHasher.computeHash(capture(slot_))).answers(() => `HASH-${pathNameWithoutExtension(slot_.captured)}`)

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      verify({ exactly: 2 }, () => mockHasher.computeHash(any()))

      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      {
        const series2 = allSeries[0]!
        expect(series2.name).toBe('series2')
        const books = bookRepository.findAllBySeriesId(series2.id)
        expect(books).toHaveLength(2)
        books.forEach((book) => {
          expect(mediaRepository.findById(book.id).status).toBe(Media.Status.READY)
        })
      }

      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })

    it('given series when renaming folder and scanning then renamed series read progress is kept', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
        scan([makeSeries('series2'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = seriesRepository.findAll()[0]!
        seriesLifecycle.markReadProgressCompleted(it.id, user)
      }

      bookRepository.findAll().forEach((book) => {
        bookRepository.update(book.copy({ fileHash: `HASH-${book.name}` }))
      })

      const slot_ = slot<string>()
      every(() => mockHasher.computeHash(capture(slot_))).answers(() => `HASH-${pathNameWithoutExtension(slot_.captured)}`)

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      {
        const series2 = allSeries[0]!
        expect(series2.name).toBe('series2')

        const seriesDto = seriesDtoRepository.findByIdOrNull(series2.id, user.id)
        if (seriesDto !== null) {
          expect(seriesDto.booksReadCount).toBe(2)
        }
      }

      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)

      expect(readProgressRepository.findAll()).toHaveLength(2)
    })

    it('given series when renaming folder and scanning then renamed series is still in collections', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
        scan([makeSeries('series2'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = seriesRepository.findAll()[0]!
        collectionLifecycle.addCollection(new SeriesCollection({ name: 'collection', seriesIds: [it.id] }))
      }

      bookRepository.findAll().forEach((book) => {
        bookRepository.update(book.copy({ fileHash: `HASH-${book.name}` }))
      })

      const slot_ = slot<string>()
      every(() => mockHasher.computeHash(capture(slot_))).answers(() => `HASH-${pathNameWithoutExtension(slot_.captured)}`)

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      {
        const series2 = allSeries[0]!
        expect(series2.name).toBe('series2')
        expect(bookRepository.findAllBySeriesId(series2.id)).toHaveLength(2)

        const collections = collectionRepository.findAllContainingSeriesId(series2.id, SearchContext.empty())
        expect(collections).toHaveLength(1)
        expect(collections[0]!.name).toBe('collection')
      }

      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })

    it('given series when renaming folder with locked title and scanning then renamed series title is not changed', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
        scan([makeSeries('series2'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      {
        const it = seriesRepository.findAll()[0]!
        seriesMetadataRepository.update(seriesMetadataRepository.findById(it.id).copy({ title: 'Updated', titleLock: true, titleSort: 'SortTitle', titleSortLock: true }))
      }

      bookRepository.findAll().forEach((book) => {
        bookRepository.update(book.copy({ fileHash: `HASH-${book.name}` }))
      })

      const slot_ = slot<string>()
      every(() => mockHasher.computeHash(capture(slot_))).answers(() => `HASH-${pathNameWithoutExtension(slot_.captured)}`)

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      {
        const series2 = allSeries[0]!
        expect(series2.name).toBe('series2')
        {
          const it = seriesMetadataRepository.findById(series2.id)
          expect(it.title).toBe('Updated')
          expect(it.titleLock).toBe(true)
          expect(it.titleSort).toBe('SortTitle')
          expect(it.titleSortLock).toBe(true)
        }
        expect(bookRepository.findAllBySeriesId(series2.id)).toHaveLength(2)
      }

      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })

    it('given series when renaming folder and scanning then renamed series title matches the folder name', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series1'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
        scan([makeSeries('series2'), [makeBook('book1').copy({ fileSize: 1 }), makeBook('book2').copy({ fileSize: 2 })]]),
      )
      libraryContentLifecycle.scanRootFolder(library) // creation

      bookRepository.findAll().forEach((book) => {
        bookRepository.update(book.copy({ fileHash: `HASH-${book.name}` }))
      })

      const slot_ = slot<string>()
      every(() => mockHasher.computeHash(capture(slot_))).answers(() => `HASH-${pathNameWithoutExtension(slot_.captured)}`)

      // when
      libraryContentLifecycle.scanRootFolder(library) // rename

      // then
      const allSeries = seriesRepository.findAll()
      const allBooks = sortedBy(bookRepository.findAll(), (it) => it.number)

      expect(allSeries).toHaveLength(1)
      {
        const series2 = allSeries[0]!
        expect(series2.name).toBe('series2')
        {
          const it = seriesMetadataRepository.findById(series2.id)
          expect(it.title).toBe('series2')
          expect(it.titleSort).toBe('series2')
        }
        expect(bookRepository.findAllBySeriesId(series2.id)).toHaveLength(2)
      }

      expect(allBooks).toHaveLength(2)
      expect(allBooks.map((it) => it.deletedDate).every((it) => it === null)).toBe(true)
    })
  })

  describe('EmptyTrash', () => {
    it('given library with deleted series and books when emptying the trash then deleted elements are permanently removed', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1'), makeBook('book3')]], [makeSeries('series2'), [makeBook('book2')]]),
        scan([makeSeries('series'), [makeBook('book1')]]),
      )
      for (let i = 0; i < 2; i++) libraryContentLifecycle.scanRootFolder(library)

      // when
      libraryContentLifecycle.emptyTrash(library)

      // then
      const [series, deletedSeries] = partition(seriesRepository.findAll(), (it) => it.deletedDate === null)
      const [books, deletedBooks] = partition(bookRepository.findAll(), (it) => it.deletedDate === null)

      expect(series).toHaveLength(1)
      expect(sorted(series.map((it) => it.name))).toEqual(['series'])
      expect(deletedSeries).toHaveLength(0)

      expect(books).toHaveLength(1)
      expect(sorted(books.map((it) => it.name))).toEqual(['book1'])
      expect(deletedBooks).toHaveLength(0)
    })

    it('given series with books when emptying the trash then the series is properly sorted', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(
        scan([makeSeries('series'), [makeBook('book1'), makeBook('book2'), makeBook('book3')]]),
        scan([makeSeries('series'), [makeBook('book2'), makeBook('book3')]]),
      )
      for (let i = 0; i < 2; i++) libraryContentLifecycle.scanRootFolder(library)

      // when
      libraryContentLifecycle.emptyTrash(library)

      // then
      const series = seriesRepository.findAll()[0]!
      const books = sortedBy(bookRepository.findAllBySeriesId(series.id), (it) => it.number)

      expect(books).toHaveLength(2)
      {
        const it = books[0]!
        expect(it.name).toBe('book2')
        expect(it.number).toBe(1)
      }
      {
        const it = books[books.length - 1]!
        expect(it.name).toBe('book3')
        expect(it.number).toBe(2)
      }
    })

    it('given collection and read list with deleted elements when emptying the trash then those sets are deleted', () => {
      // given
      const library = makeLibrary()
      libraryRepository.insert(library)

      every(() => mockScanner.scanRootFolder(any())).returnsMany(scan([makeSeries('series'), [makeBook('book1'), makeBook('book2'), makeBook('book3')]]), scan())
      for (let i = 0; i < 2; i++) libraryContentLifecycle.scanRootFolder(library)

      collectionRepository.insert(new SeriesCollection({ name: 'collection', seriesIds: [...seriesRepository.findAllIdsByLibraryId(library.id)] }))
      readListRepository.insert(new ReadList({ name: 'readlist', bookIds: toIndexedMap([...bookRepository.findAllIdsByLibraryId(library.id)]) }))

      // when
      libraryContentLifecycle.emptyTrash(library)

      // then
      const collections = collectionRepository.findAll(SearchContext.empty(), Pageable.unpaged())
      const readLists = readListRepository.findAll(SearchContext.empty(), Pageable.unpaged())

      expect(collections.content).toHaveLength(0)
      expect(readLists.content).toHaveLength(0)
    })
  })
})
