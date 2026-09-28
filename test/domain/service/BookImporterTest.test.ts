// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/BookImporterTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: Jimfs (système de fichiers en mémoire) -> répertoire temporaire réel par test : "/source" et "/library/series"
// deviennent <tmp>/source et <tmp>/library/series. Le contexte Spring (base SQLite, ressources) utilise aussi node:fs,
// node:fs ne peut donc pas être redirigé comme dans FileSystemScannerTest. Les chemins restent hors de toute
// bibliothèque existante ("file:/library" n'est pas un préfixe du répertoire temporaire), comme avec Jimfs.
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
import '../../../src/domain/service/BookImporter.js'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TaskEmitter } from '../../../src/application/tasks/TaskEmitter.js'
import { BookPage } from '../../../src/domain/model/BookPage.js'
import { CopyMode } from '../../../src/domain/model/CopyMode.js'
import { Dimension } from '../../../src/domain/model/Dimension.js'
import { PathContainedInPath } from '../../../src/domain/model/Exceptions.js'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { MarkSelectedPreference } from '../../../src/domain/model/MarkSelectedPreference.js'
import { Media } from '../../../src/domain/model/Media.js'
import { ReadList } from '../../../src/domain/model/ReadList.js'
import { SearchContext } from '../../../src/domain/model/SearchContext.js'
import { ThumbnailBook } from '../../../src/domain/model/ThumbnailBook.js'
import { BookMetadataRepository } from '../../../src/domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../src/domain/persistence/MediaRepository.js'
import { ReadListRepository } from '../../../src/domain/persistence/ReadListRepository.js'
import { ReadProgressRepository } from '../../../src/domain/persistence/ReadProgressRepository.js'
import { SeriesRepository } from '../../../src/domain/persistence/SeriesRepository.js'
import { BookImporter } from '../../../src/domain/service/BookImporter.js'
import { BookLifecycle } from '../../../src/domain/service/BookLifecycle.js'
import { ReadListLifecycle } from '../../../src/domain/service/ReadListLifecycle.js'
import { SeriesLifecycle } from '../../../src/domain/service/SeriesLifecycle.js'
import { toIndexedMap } from '../../../src/language/LanguageUtils.js'
import { FileAlreadyExistsException, FileNotFoundException } from '../../../src/port/java-nio-file.js'
import { pathToUrl } from '../../../src/port/java-net.js'
import { nn, sortedBy } from '../../../src/port/kotlin.js'
import '../../../src/infrastructure/kobo/KepubConverter.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { any, clearMocks, every, mockk, verify } from '../../support/mockk.js'
import { makeBook, makeLibrary, makeSeries } from '../model/Utils.js'

function catchThrowable(block: () => unknown): unknown {
  try {
    block()
    return null
  } catch (e) {
    return e
  }
}

// PORT: Jimfs.newFileSystem(Configuration.unix()).use { fs -> ... } -> répertoire temporaire supprimé à la fin
function withFileSystem(block: (getPath: (p: string) => string) => void): void {
  const fs = mkdtempSync(join(tmpdir(), 'komga-jimfs-'))
  try {
    block((p) => join(fs, p))
  } finally {
    rmSync(fs, { recursive: true, force: true })
  }
}

// PORT: kotlin.io.path createDirectory / createDirectories / createFile
function createDirectory(p: string): string {
  mkdirSync(p)
  return p
}
function createDirectories(p: string): string {
  mkdirSync(p, { recursive: true })
  return p
}
function createFile(p: string): string {
  writeFileSync(p, '', { flag: 'wx' })
  return p
}

describe('BookImporterTest', () => {
  // @MockkBean private lateinit var mockTackReceiver: TaskEmitter
  const mockTackReceiver = mockk(TaskEmitter)

  const ctx = springBootTest({}, [
    { type: TaskEmitter, instance: mockTackReceiver },
  ])
  const bookImporter = ctx.getBean(BookImporter)
  const bookRepository = ctx.getBean(BookRepository)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const readProgressRepository = ctx.getBean(ReadProgressRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const mediaRepository = ctx.getBean(MediaRepository)
  const metadataRepository = ctx.getBean(BookMetadataRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const readListRepository = ctx.getBean(ReadListRepository)
  const readListLifecycle = ctx.getBean(ReadListLifecycle)

  const library = makeLibrary({ name: 'lib', path: 'file:/library' })
  const user1 = new KomgaUser({ email: 'user1@example.org', password: '' })
  const user2 = new KomgaUser({ email: 'user2@example.org', password: '' })

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

  beforeEach(() => {
    // PORT: refreshBookMetadata(any<Book>(), any(), any()) : les paramètres par défaut Kotlin sont un objet
    // optionnel en TS (souvent absent de l'appel), seul le premier argument est filtré
    every(() => mockTackReceiver.refreshBookMetadata(any())).justRuns()
    every(() => mockTackReceiver.refreshBookLocalArtwork(any())).justRuns()
  })

  afterEach(() => {
    // clear repository
    seriesLifecycle.deleteMany(seriesRepository.findAll())
    // PORT: @MockkBean est réinitialisé après chaque test
    clearMocks(mockTackReceiver)
  })

  it('given non-existent source file when importing then exception is thrown', () => {
    // given
    const sourceFile = '/non-existent'

    // when
    const thrown = catchThrowable(() => {
      bookImporter.importBook(sourceFile, makeSeries('a series'), CopyMode.COPY)
    })

    // then
    expect((thrown as Error).cause).toBeInstanceOf(FileNotFoundException)
  })

  it('given existing target when importing then exception is thrown', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'source.cbz'))
      const destDir = createDirectory(getPath('/dest'))
      createFile(join(destDir, 'source.cbz'))

      const series = makeSeries('dest', { url: pathToUrl(destDir) })

      // when
      const thrown = catchThrowable(() => {
        bookImporter.importBook(sourceFile, series, CopyMode.COPY)
      })

      // then
      expect((thrown as Error).cause).toBeInstanceOf(FileAlreadyExistsException)
    })
  })

  it('given existing target when importing with destination name then exception is thrown', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'source.cbz'))
      const destDir = createDirectory(getPath('/dest'))
      createFile(join(destDir, 'dest.cbz'))

      const series = makeSeries('dest').copy({ url: pathToUrl(destDir) })

      // when
      const thrown = catchThrowable(() => {
        bookImporter.importBook(sourceFile, series, CopyMode.COPY, { destinationName: 'dest' })
      })

      // then
      expect((thrown as Error).cause).toBeInstanceOf(FileAlreadyExistsException)
    })
  })

  it('given source file part of a Komga library when importing then exception is thrown', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'source.cbz'))
      const destDir = createDirectory(getPath('/dest'))

      const series = makeSeries('dest').copy({ url: pathToUrl(destDir) })

      const libraryJimfs = makeLibrary({ name: 'jimfs', url: pathToUrl(sourceDir) })
      libraryRepository.insert(libraryJimfs)

      // when
      const thrown = catchThrowable(() => {
        bookImporter.importBook(sourceFile, series, CopyMode.COPY)
      })

      // then
      expect(thrown).toBeInstanceOf(PathContainedInPath)

      libraryRepository.delete(libraryJimfs.id)
    })
  })

  it('given book when importing then book is imported and series is sorted', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, '2.cbz'))
      const destDir = createDirectories(getPath('/library/series'))

      const existingBooks = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
      const series = makeSeries('series', { url: pathToUrl(destDir), libraryId: library.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, existingBooks)
      seriesLifecycle.sortBooks(series)

      // when
      bookImporter.importBook(sourceFile, series, CopyMode.COPY)

      // then
      const books = sortedBy(bookRepository.findAllBySeriesId(series.id), (it) => it.number)
      expect(books).toHaveLength(3)
      expect(books[0]!.id).toBe(existingBooks[0]!.id)
      expect(books[2]!.id).toBe(existingBooks[1]!.id)

      {
        const it = books[1]!
        expect(it.id).not.toBe(existingBooks[0]!.id)
        expect(it.id).not.toBe(existingBooks[1]!.id)
        expect(it.number).toBe(2)
        expect(it.name).toBe('2')

        const newMedia = mediaRepository.findById(it.id)
        expect(newMedia.status).toBe(Media.Status.UNKNOWN)
      }
    })
  })

  it('given book with sidecars when importing then book and sidecars are imported', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'book 2.cbz'))
      createFile(join(sourceDir, 'book 2.jpg'))
      createFile(join(sourceDir, 'BOOK 2-1.jpg'))
      const destDir = createDirectories(getPath('/library/series'))

      const existingBooks = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
      const series = makeSeries('series', { url: pathToUrl(destDir), libraryId: library.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, existingBooks)
      seriesLifecycle.sortBooks(series)

      // when
      bookImporter.importBook(sourceFile, series, CopyMode.COPY)

      // then
      verify({ exactly: 2 }, () => mockTackReceiver.refreshBookLocalArtwork(any()))

      expect(existsSync(join(destDir, 'book 2.cbz'))).toBe(true)
      expect(existsSync(join(destDir, 'book 2.jpg'))).toBe(true)
      expect(existsSync(join(destDir, 'BOOK 2-1.jpg'))).toBe(true)
    })
  })

  it('given book with sidecars when importing with destination name then book and sidecars are imported', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'book 2.cbz'))
      createFile(join(sourceDir, 'book 2.jpg'))
      createFile(join(sourceDir, 'BOOK 2-1.jpg'))
      const destDir = createDirectories(getPath('/library/series'))

      const existingBooks = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
      const series = makeSeries('series', { url: pathToUrl(destDir), libraryId: library.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, existingBooks)
      seriesLifecycle.sortBooks(series)

      // when
      bookImporter.importBook(sourceFile, series, CopyMode.COPY, { destinationName: 'book 5' })

      // then
      verify({ exactly: 2 }, () => mockTackReceiver.refreshBookLocalArtwork(any()))

      expect(existsSync(join(destDir, 'book 5.cbz'))).toBe(true)
      expect(existsSync(join(destDir, 'book 5.jpg'))).toBe(true)
      expect(existsSync(join(destDir, 'book 5-1.jpg'))).toBe(true)
    })
  })

  it('given existing book when importing with upgrade then existing book and sidecars are deleted', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'source.cbz'))
      const destDir = createDirectories(getPath('/library/series'))
      const existingFile = createFile(join(destDir, '4.cbz'))
      const existingSidecar = createFile(join(destDir, '4.jpg'))
      const existingSidecar2 = createFile(join(destDir, '4-1.jpg'))

      const bookToUpgrade = makeBook('2', { libraryId: library.id, url: pathToUrl(existingFile) })
      const otherBooks = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
      const series = makeSeries('series', { url: pathToUrl(destDir), libraryId: library.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [bookToUpgrade, ...otherBooks])
      seriesLifecycle.sortBooks(series)

      // when
      bookImporter.importBook(sourceFile, series, CopyMode.MOVE, { upgradeBookId: bookToUpgrade.id })

      // then
      const books = sortedBy(bookRepository.findAllBySeriesId(series.id), (it) => it.number)
      expect(books).toHaveLength(3)
      expect(books[0]!.id).toBe(otherBooks[0]!.id)
      expect(books[1]!.id).toBe(otherBooks[1]!.id)
      expect(books[2]!.id).not.toBe(bookToUpgrade.id)

      expect(bookRepository.findByIdOrNull(bookToUpgrade.id)).toBeNull()

      const upgradedMedia = mediaRepository.findById(books[2]!.id)
      expect(upgradedMedia.status).toBe(Media.Status.OUTDATED)

      expect(existsSync(sourceFile)).toBe(false)

      expect(existsSync(existingFile)).toBe(false)
      expect(existsSync(existingSidecar)).toBe(false)
      expect(existsSync(existingSidecar2)).toBe(false)
    })
  })

  it('given existing book with metadata when importing with upgrade then metadata is kept', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'source.cbz'))
      const destDir = createDirectories(getPath('/library/series'))
      const existingFile = createFile(join(destDir, '4.cbz'))

      const bookToUpgrade = makeBook('2', { libraryId: library.id, url: pathToUrl(existingFile) })
      const otherBooks = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
      const series = makeSeries('series', { url: pathToUrl(destDir), libraryId: library.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [bookToUpgrade, ...otherBooks])
      seriesLifecycle.sortBooks(series)

      {
        const it = metadataRepository.findById(bookToUpgrade.id)
        metadataRepository.update(
          it.copy({
            summary: 'a summary',
            number: 'HS',
            numberLock: true,
            numberSort: 100,
            numberSortLock: true,
          }),
        )
      }

      bookLifecycle.addThumbnailForBook(
        new ThumbnailBook({
          thumbnail: new Uint8Array(10),
          type: ThumbnailBook.Type.USER_UPLOADED,
          mediaType: 'image/jpeg',
          fileSize: 10,
          dimension: new Dimension({ width: 1, height: 1 }),
          bookId: bookToUpgrade.id,
        }),
        MarkSelectedPreference.YES,
      )

      // when
      bookImporter.importBook(sourceFile, series, CopyMode.MOVE, { upgradeBookId: bookToUpgrade.id })

      // then
      const books = sortedBy(bookRepository.findAllBySeriesId(series.id), (it) => it.number)
      expect(books).toHaveLength(3)
      expect(books[0]!.id).toBe(otherBooks[0]!.id)
      expect(books[1]!.id).toBe(otherBooks[1]!.id)
      expect(books[2]!.id).not.toBe(bookToUpgrade.id)

      expect(bookRepository.findByIdOrNull(bookToUpgrade.id)).toBeNull()

      const upgradedMedia = mediaRepository.findById(books[2]!.id)
      expect(upgradedMedia.status).toBe(Media.Status.OUTDATED)

      {
        const it = metadataRepository.findById(books[2]!.id)
        expect(it.summary).toBe('a summary')
        expect(it.number).toBe('HS')
        expect(it.numberLock).toBe(true)
        expect(it.numberSort).toBe(100)
        expect(it.numberSortLock).toBe(true)
      }

      const thumbnail = bookLifecycle.getThumbnail(books[2]!.id)
      expect(thumbnail).not.toBeNull()
      expect(nn(thumbnail).type).toBe(ThumbnailBook.Type.USER_UPLOADED)
      expect(nn(thumbnail).fileSize).toBe(10)

      expect(existsSync(sourceFile)).toBe(false)
    })
  })

  it('given existing book when importing with upgrade and same name then existing book is replaced', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'source.cbz'))
      const destDir = createDirectories(getPath('/library/series'))
      const existingFile = createFile(join(destDir, '2.cbz'))

      const bookToUpgrade = makeBook('2', { libraryId: library.id, url: pathToUrl(existingFile) })
      const otherBooks = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
      const series = makeSeries('series', { url: pathToUrl(destDir), libraryId: library.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [bookToUpgrade, ...otherBooks])
      seriesLifecycle.sortBooks(series)

      // when
      bookImporter.importBook(sourceFile, series, CopyMode.COPY, { destinationName: '2', upgradeBookId: bookToUpgrade.id })

      // then
      const books = sortedBy(bookRepository.findAllBySeriesId(series.id), (it) => it.number)
      expect(books).toHaveLength(3)
      expect(books[0]!.id).toBe(otherBooks[0]!.id)
      expect(books[1]!.id).not.toBe(bookToUpgrade.id)
      expect(books[2]!.id).toBe(otherBooks[1]!.id)

      expect(bookRepository.findByIdOrNull(bookToUpgrade.id)).toBeNull()

      const upgradedMedia = mediaRepository.findById(books[1]!.id)
      expect(upgradedMedia.status).toBe(Media.Status.OUTDATED)

      expect(existsSync(sourceFile)).toBe(true)
    })
  })

  it('given book with read progress when importing with upgrade then read progress is kept', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'source.cbz'))
      const destDir = createDirectories(getPath('/library/series'))
      const existingFile = createFile(join(destDir, '1.cbz'))

      const bookToUpgrade = makeBook('1', { libraryId: library.id, url: pathToUrl(existingFile) })
      const series = makeSeries('series', { url: pathToUrl(destDir), libraryId: library.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [bookToUpgrade])
      seriesLifecycle.sortBooks(series)

      {
        const media = mediaRepository.findById(bookToUpgrade.id)
        mediaRepository.update(
          media.copy({
            status: Media.Status.READY,
            pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
            pageCount: 10,
          }),
        )
      }

      bookLifecycle.markReadProgressCompleted(bookToUpgrade.id, user1)
      bookLifecycle.markReadProgress(bookToUpgrade, user2, 4)

      // when
      bookImporter.importBook(sourceFile, series, CopyMode.MOVE, { upgradeBookId: bookToUpgrade.id })

      // then
      const books = sortedBy(bookRepository.findAllBySeriesId(series.id), (it) => it.number)
      expect(books).toHaveLength(1)

      const progress = readProgressRepository.findAllByBookId(books[0]!.id)
      expect(progress).toHaveLength(2)
      {
        const it = nn(progress.find((it) => it.userId === user1.id))
        expect(it.completed).toBe(true)
      }
      {
        const it = nn(progress.find((it) => it.userId === user2.id))
        expect(it.completed).toBe(false)
        expect(it.page).toBe(4)
      }
    })
  })

  it('given book part of a read list when importing with upgrade then imported book replaces upgraded book in the read list', () => {
    withFileSystem((getPath) => {
      // given
      const sourceDir = createDirectory(getPath('/source'))
      const sourceFile = createFile(join(sourceDir, 'source.cbz'))
      const destDir = createDirectories(getPath('/library/series'))
      const existingFile = createFile(join(destDir, '1.cbz'))

      const bookToUpgrade = makeBook('1', { libraryId: library.id, url: pathToUrl(existingFile) })
      const series = makeSeries('series', { url: pathToUrl(destDir), libraryId: library.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [bookToUpgrade])
      seriesLifecycle.sortBooks(series)

      const readList = new ReadList({
        name: 'readlist',
        bookIds: toIndexedMap([bookToUpgrade.id]),
      })
      readListLifecycle.addReadList(readList)

      // when
      bookImporter.importBook(sourceFile, series, CopyMode.MOVE, { upgradeBookId: bookToUpgrade.id })

      // then
      const books = sortedBy(bookRepository.findAllBySeriesId(series.id), (it) => it.number)
      expect(books).toHaveLength(1)

      {
        const it = nn(readListRepository.findByIdOrNull(readList.id, SearchContext.empty()))
        expect(it.bookIds.size).toBe(1)
        expect(it.bookIds.get(0)).toBe(books[0]!.id)
      }
    })
  })
})
