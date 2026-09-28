// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/BookLifecycleTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
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
import { ZonedDateTime } from '@js-joda/core'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BookPage } from '../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { Media } from '../../../src/domain/model/Media.js'
import { MediaExtensionEpub } from '../../../src/domain/model/MediaExtension.js'
import { MediaFile } from '../../../src/domain/model/MediaFile.js'
import { R2Device } from '../../../src/domain/model/R2Device.js'
import { R2Locator } from '../../../src/domain/model/R2Locator.js'
import { R2Progression } from '../../../src/domain/model/R2Progression.js'
import { ThumbnailBook } from '../../../src/domain/model/ThumbnailBook.js'
import { BookRepository } from '../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../src/domain/persistence/MediaRepository.js'
import { ReadProgressRepository } from '../../../src/domain/persistence/ReadProgressRepository.js'
import { SeriesRepository } from '../../../src/domain/persistence/SeriesRepository.js'
import { ThumbnailBookRepository } from '../../../src/domain/persistence/ThumbnailBookRepository.js'
import { BookAnalyzer } from '../../../src/domain/service/BookAnalyzer.js'
import { BookLifecycle } from '../../../src/domain/service/BookLifecycle.js'
import { SeriesLifecycle } from '../../../src/domain/service/SeriesLifecycle.js'
import '../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../src/infrastructure/jooq/tasks/TasksDao.js'
import { pathToUrl } from '../../../src/port/java.js'
import { IllegalArgumentException, IllegalStateException, eq, kFloat, nn } from '../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { makeBook, makeBookPage, makeLibrary, makeSeries } from '../model/Utils.js'
import { any, clearMocks, every, mockk, verify } from '../../support/mockk.js'

/** `catchThrowable { }` */
function catchThrowable(block: () => unknown): unknown {
  try {
    block()
    return null
  } catch (e) {
    return e
  }
}

/**
 * PORT: Jimfs.newFileSystem(Configuration.unix()).use { fs -> } -> répertoire temporaire réel supprimé à la fin
 * (`fs.getPath("/root")` devient `<tmp>/root`)
 */
function withTempFileSystem(block: (fsRoot: string) => void): void {
  const fsRoot = mkdtempSync(join(tmpdir(), 'komga-jimfs-'))
  try {
    block(fsRoot)
  } finally {
    rmSync(fsRoot, { recursive: true, force: true })
  }
}

/** `Files.createFile(path)` */
function createFile(path: string): void {
  closeSync(openSync(path, 'wx'))
}

describe('BookLifecycleTest', () => {
  // @MockkBean private lateinit var mockAnalyzer: BookAnalyzer
  const mockAnalyzerInstance = mockk(BookAnalyzer)
  // @SpykBean private lateinit var bookLifecycle: BookLifecycle
  const ctx = springBootTest({}, [
    { type: BookLifecycle, spyk: true },
    { type: BookAnalyzer, instance: mockAnalyzerInstance },
  ])
  const bookRepository = ctx.getBean(BookRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const readProgressRepository = ctx.getBean(ReadProgressRepository)
  const mediaRepository = ctx.getBean(MediaRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const thumbnailBookRepository = ctx.getBean(ThumbnailBookRepository)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const mockAnalyzer = ctx.getBean(BookAnalyzer)

  const library = makeLibrary()
  const user1 = new KomgaUser({ email: 'user1@example.org', password: '' })
  const user2 = new KomgaUser({ email: 'user2@example.org', password: '' })

  // PORT: springmockk réinitialise les @SpykBean/@MockkBean après chaque test (MockkClear.AFTER), après les @AfterEach :
  // enregistré en premier, ce afterEach s'exécute en dernier
  afterEach(() => {
    clearMocks(bookLifecycle, mockAnalyzer)
  })

  beforeAll(() => {
    libraryRepository.insert(library)

    userRepository.insert(user1)
    userRepository.insert(user2)
  })

  afterAll(async () => {
    libraryRepository.deleteAll()
    readProgressRepository.deleteAll()
    userRepository.deleteAll()
    await closeContext(ctx)
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
  })

  it('given outdated book with different number of pages than before when analyzing then existing incomplete read progress is reset to 1', () => {
    // given
    {
      const series = makeSeries('series', { libraryId: library.id })
      const created = seriesLifecycle.createSeries(series)
      const books = [makeBook('1', { libraryId: library.id })]
      seriesLifecycle.addBooks(created, books)
    }

    const book = nn(bookRepository.findAll()[0])
    {
      const media = mediaRepository.findById(book.id)
      mediaRepository.update(
        media.copy({
          status: Media.Status.OUTDATED,
          pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
          pageCount: 10,
        }),
      )
    }

    bookLifecycle.markReadProgressCompleted(book.id, user1)
    bookLifecycle.markReadProgress(book, user2, 4)

    expect(readProgressRepository.findAll()).toHaveLength(2)

    // when
    every(() => mockAnalyzer.analyze(any(), any())).returns(
      new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: [makeBookPage('1.jpg'), makeBookPage('2.jpg')], bookId: book.id }),
    )
    bookLifecycle.analyzeAndPersist(book)

    // then
    {
      const it = nn(readProgressRepository.findByBookIdAndUserIdOrNull(book.id, user1.id))
      expect(it.page).toBe(2)
      expect(it.completed).toBe(true)
    }
    {
      const it = nn(readProgressRepository.findByBookIdAndUserIdOrNull(book.id, user2.id))
      expect(it.page).toBe(1)
      expect(it.completed).toBe(false)
    }
  })

  it('given outdated book with same number of pages than before when analyzing then existing read progress is kept', () => {
    // given
    {
      const series = makeSeries('series', { libraryId: library.id })
      const created = seriesLifecycle.createSeries(series)
      const books = [makeBook('1', { libraryId: library.id })]
      seriesLifecycle.addBooks(created, books)
    }

    const book = nn(bookRepository.findAll()[0])
    {
      const media = mediaRepository.findById(book.id)
      mediaRepository.update(
        media.copy({
          status: Media.Status.OUTDATED,
          pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
          pageCount: 10,
        }),
      )
    }

    bookLifecycle.markReadProgressCompleted(book.id, user1)
    bookLifecycle.markReadProgress(book, user2, 4)

    expect(readProgressRepository.findAll()).toHaveLength(2)

    // when
    every(() => mockAnalyzer.analyze(any(), any())).returns(
      new Media({
        status: Media.Status.READY,
        mediaType: 'application/zip',
        pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
        bookId: book.id,
      }),
    )
    bookLifecycle.analyzeAndPersist(book)

    // then
    expect(readProgressRepository.findAll()).toHaveLength(2)
  })

  it('given a book with a sidecar when deleting book then all book files should be deleted', () => {
    withTempFileSystem((fs) => {
      // given
      const root = join(fs, 'root')
      mkdirSync(root)
      const seriesPath = join(root, 'series')
      mkdirSync(seriesPath)
      const bookPath = join(seriesPath, 'book1.cbz')
      createFile(bookPath)
      const sidecarPath = join(seriesPath, 'sidecar1.png')
      createFile(sidecarPath)

      const series = makeSeries('series', { libraryId: library.id, url: pathToUrl(seriesPath) })
      const book = makeBook('1', { libraryId: library.id, seriesId: series.id, url: pathToUrl(bookPath) })
      const sidecar = new ThumbnailBook({ bookId: book.id, type: ThumbnailBook.Type.SIDECAR, url: pathToUrl(sidecarPath), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })

      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [book])
      thumbnailBookRepository.insert(sidecar)

      // when
      bookLifecycle.deleteBookFiles(book)

      // then
      // UPSTREAM-BUG: assertThat(Files.notExists(...)) sans assertion terminale ne vérifie rien (reproduit)
      expect(!existsSync(bookPath))
      expect(!existsSync(sidecarPath))
    })
  })

  it('given a non-existent book file when deleting book then it returns', () => {
    // given
    const bookPath = '/non-existent'
    const book = makeBook('1', { libraryId: library.id, url: pathToUrl(bookPath) })

    // when
    bookLifecycle.deleteBookFiles(book)

    // then
    verify({ exactly: 0 }, () => bookLifecycle.softDeleteMany(any()))
  })

  it('given a book and a non-existent sidecar file when deleting book then book should be deleted', () => {
    withTempFileSystem((fs) => {
      // given
      const root = join(fs, 'root')
      mkdirSync(root)
      const seriesPath = join(root, 'series')
      mkdirSync(seriesPath)
      const bookPath = join(seriesPath, 'book1.cbz')
      createFile(bookPath)
      const sidecar1Path = join(seriesPath, 'sidecar1.png')
      createFile(sidecar1Path)
      const sidecar2Path = join(seriesPath, 'sidecar2.png')

      const series = makeSeries('series', { libraryId: library.id, url: pathToUrl(seriesPath) })
      const book = makeBook('1', { libraryId: library.id, seriesId: series.id, url: pathToUrl(bookPath) })
      const sidecar1 = new ThumbnailBook({ bookId: book.id, type: ThumbnailBook.Type.SIDECAR, url: pathToUrl(sidecar1Path), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })
      const sidecar2 = new ThumbnailBook({ bookId: book.id, type: ThumbnailBook.Type.SIDECAR, url: pathToUrl(sidecar2Path), fileSize: 0, mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) })

      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [book])
      thumbnailBookRepository.insert(sidecar1)
      thumbnailBookRepository.insert(sidecar2)

      // when
      bookLifecycle.deleteBookFiles(book)

      // then
      // UPSTREAM-BUG: assertion sans effet (reproduit)
      expect(!existsSync(seriesPath))
    })
  })

  it('given a single book file when deleting book then parent directory should be deleted', () => {
    withTempFileSystem((fs) => {
      // given
      const root = join(fs, 'root')
      mkdirSync(root)
      const seriesPath = join(root, 'series')
      mkdirSync(seriesPath)
      const bookPath = join(seriesPath, 'book1.cbz')
      createFile(bookPath)

      const series = makeSeries('series', { libraryId: library.id, url: pathToUrl(seriesPath) })
      const book = makeBook('1', { libraryId: library.id, seriesId: series.id, url: pathToUrl(bookPath) })

      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [book])

      // when
      bookLifecycle.deleteBookFiles(book)

      // then
      // UPSTREAM-BUG: assertion sans effet (reproduit)
      expect(!existsSync(seriesPath))
    })
  })

  it('given a single book file with unrelated files in directory when deleting book then parent directory should not be deleted', () => {
    withTempFileSystem((fs) => {
      // given
      const root = join(fs, 'root')
      mkdirSync(root)
      const seriesPath = join(root, 'series')
      mkdirSync(seriesPath)
      const bookPath = join(seriesPath, 'book1.cbz')
      createFile(bookPath)
      const filePath = join(seriesPath, 'file.txt')
      createFile(filePath)

      const series = makeSeries('series', { libraryId: library.id, url: pathToUrl(seriesPath) })
      const book = makeBook('1', { libraryId: library.id, seriesId: series.id, url: pathToUrl(bookPath) })

      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [book])

      // when
      bookLifecycle.deleteBookFiles(book)

      // then
      // UPSTREAM-BUG: assertions sans effet (reproduit)
      expect(existsSync(seriesPath))
      expect(existsSync(filePath))
      expect(!existsSync(bookPath))
    })
  })

  describe('Progression', () => {
    beforeEach(() => {
      const series = makeSeries('series', { libraryId: library.id })
      const created = seriesLifecycle.createSeries(series)
      const books = [makeBook('1', { libraryId: library.id })]
      seriesLifecycle.addBooks(created, books)
    })

    const device = new R2Device({ id: 'abc', name: 'device' })
    const epubResources = [
      new MediaFile({ fileName: 'ch1.xhtml', mediaType: 'application/xhtml+xml' }),
      new MediaFile({ fileName: 'ch2.xhtml', mediaType: 'application/xhtml+xml' }),
      new MediaFile({ fileName: 'ch3.xhtml', mediaType: 'application/xhtml+xml' }),
    ]

    function makeEpubPositions(): R2Locator[] {
      let startPosition = 1
      return epubResources.flatMap((file) =>
        Array.from(
          { length: 10 },
          (_, i) => new R2Locator({ href: file.fileName, type: nn(file.mediaType), locations: new R2Locator.Location({ position: startPosition++, progression: i + 1 }) }),
        ),
      )
    }

    it('given book when marking progress older than saved then it fails', () => {
      const book = nn(bookRepository.findAll()[0])
      {
        const media = mediaRepository.findById(book.id)
        mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: 'application/zip', pageCount: 10 }))
      }

      const progress = new R2Progression({ modified: ZonedDateTime.now(), device: device, locator: new R2Locator({ href: '', type: '', locations: new R2Locator.Location({ position: 5 }) }) })

      bookLifecycle.markProgression(book, user1, progress)

      // when
      const thrown = catchThrowable(() => {
        bookLifecycle.markProgression(book, user1, progress.copy({ modified: progress.modified.minusHours(1) }))
      })

      // then
      expect(thrown).toBeInstanceOf(IllegalStateException)
      expect((thrown as Error).message).toContain('older than existing')
    })

    it.each(['application/zip', 'application/pdf'])('given divina or pdf book when marking progress over the page count then it fails', (mediaType) => {
      const book = nn(bookRepository.findAll()[0])
      {
        const media = mediaRepository.findById(book.id)
        mediaRepository.update(media.copy({ status: Media.Status.READY, pageCount: 10, mediaType: mediaType }))
      }

      // when
      const thrown = catchThrowable(() => {
        bookLifecycle.markProgression(
          book,
          user1,
          new R2Progression({ modified: ZonedDateTime.now(), device: device, locator: new R2Locator({ href: '', type: '', locations: new R2Locator.Location({ position: 15 }) }) }),
        )
      })

      // then
      expect(thrown).toBeInstanceOf(IllegalArgumentException)
      expect((thrown as Error).message).toContain('must be within 1 and book page count')
    })

    it('given epub book when marking progress with non-existing href then it fails', () => {
      const book = nn(bookRepository.findAll()[0])
      {
        const media = mediaRepository.findById(book.id)
        mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: 'application/epub+zip', files: epubResources }))
      }

      // when
      const thrown = catchThrowable(() => {
        bookLifecycle.markProgression(
          book,
          user1,
          new R2Progression({ modified: ZonedDateTime.now(), device: device, locator: new R2Locator({ href: 'ch5.xhtml', type: '', locations: new R2Locator.Location({ position: 15 }) }) }),
        )
      })

      // then
      expect(thrown).toBeInstanceOf(IllegalArgumentException)
      expect((thrown as Error).message).toContain('Resource does not exist in book')
    })

    it('given epub book when marking progress without location progression then it fails', () => {
      const book = nn(bookRepository.findAll()[0])
      {
        const media = mediaRepository.findById(book.id)
        mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: 'application/epub+zip', files: epubResources }))
      }

      // when
      const thrown = catchThrowable(() => {
        bookLifecycle.markProgression(
          book,
          user1,
          new R2Progression({ modified: ZonedDateTime.now(), device: device, locator: new R2Locator({ href: 'ch1.xhtml', type: '', locations: new R2Locator.Location({ position: 15 }) }) }),
        )
      })

      // then
      expect(thrown).toBeInstanceOf(IllegalArgumentException)
      expect((thrown as Error).message).toContain('location.progression is required')
    })

    it('given epub book without extension when marking progress then it fails', () => {
      const book = nn(bookRepository.findAll()[0])
      {
        const media = mediaRepository.findById(book.id)
        mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: 'application/epub+zip', files: epubResources }))
      }

      // when
      const thrown = catchThrowable(() => {
        bookLifecycle.markProgression(
          book,
          user1,
          new R2Progression({ modified: ZonedDateTime.now(), device: device, locator: new R2Locator({ href: 'ch1.xhtml', type: '', locations: new R2Locator.Location({ progression: 0.3 }) }) }),
        )
      })

      // then
      expect(thrown).toBeInstanceOf(IllegalArgumentException)
      expect((thrown as Error).message).toContain('extension not found')
    })

    it('given epub book when marking progress with exact position then it succeeds', () => {
      const book = nn(bookRepository.findAll()[0])
      const epubPositions = makeEpubPositions()
      {
        const media = mediaRepository.findById(book.id)
        mediaRepository.update(
          media.copy({ status: Media.Status.READY, mediaType: 'application/epub+zip', files: epubResources, extension: new MediaExtensionEpub({ positions: epubPositions }) }),
        )
      }

      // when
      const newProgression = new R2Progression({ modified: ZonedDateTime.now(), device: device, locator: nn(epubPositions[0]) })
      expect(() => bookLifecycle.markProgression(book, user1, newProgression)).not.toThrow()
      const savedProgression = readProgressRepository.findByBookIdAndUserIdOrNull(book.id, user1.id)

      // then
      expect(savedProgression).not.toBeNull()
      expect(eq(nn(savedProgression).locator, newProgression.locator)).toBe(true)
    })

    it('given epub book when marking progress with skewed position then it succeeds', () => {
      const book = nn(bookRepository.findAll()[0])
      const epubPositions = makeEpubPositions()
      {
        const media = mediaRepository.findById(book.id)
        mediaRepository.update(
          media.copy({ status: Media.Status.READY, mediaType: 'application/epub+zip', files: epubResources, extension: new MediaExtensionEpub({ positions: epubPositions }) }),
        )
      }

      // when
      const newProgression = new R2Progression({
        modified: ZonedDateTime.now(),
        device: device,
        locator: (() => {
          const it = nn(epubPositions[0])
          return it.copy({ locations: nn(it.locations).copy({ progression: kFloat(nn(nn(it.locations).progression) + kFloat(0.5)) }) })
        })(),
      })
      expect(() => bookLifecycle.markProgression(book, user1, newProgression)).not.toThrow()
      const savedProgression = readProgressRepository.findByBookIdAndUserIdOrNull(book.id, user1.id)

      // then
      expect(savedProgression).not.toBeNull()
      expect(eq(nn(savedProgression).locator, newProgression.locator)).toBe(true)
    })
  })
})
