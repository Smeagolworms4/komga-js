// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/LibraryContentLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { TaskEmitter } from '../../application/tasks/TaskEmitter.js'
import type { Book } from '../model/Book.js'
import { BookMetadataPatchCapability } from '../model/BookMetadataPatch.js'
import { DirectoryNotFoundException } from '../model/Exceptions.js'
import { DomainEvent } from '../model/DomainEvent.js'
import type { Library } from '../model/Library.js'
import { Media } from '../model/Media.js'
import { SearchCondition } from '../model/SearchCondition.js'
import { SearchContext } from '../model/SearchContext.js'
import { SearchOperator } from '../model/SearchOperator.js'
import type { Series } from '../model/Series.js'
import { Sidecar } from '../model/Sidecar.js'
import { ThumbnailBook } from '../model/ThumbnailBook.js'
import { ThumbnailSeries } from '../model/ThumbnailSeries.js'
import { BookMetadataRepository } from '../persistence/BookMetadataRepository.js'
import { BookRepository } from '../persistence/BookRepository.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { MediaRepository } from '../persistence/MediaRepository.js'
import { ReadListRepository } from '../persistence/ReadListRepository.js'
import { ReadProgressRepository } from '../persistence/ReadProgressRepository.js'
import { SeriesCollectionRepository } from '../persistence/SeriesCollectionRepository.js'
import { SeriesMetadataRepository } from '../persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../persistence/SeriesRepository.js'
import { SidecarRepository } from '../persistence/SidecarRepository.js'
import { ThumbnailBookRepository } from '../persistence/ThumbnailBookRepository.js'
import { ThumbnailSeriesRepository } from '../persistence/ThumbnailSeriesRepository.js'
import { KomgaSettingsProvider } from '../../infrastructure/configuration/KomgaSettingsProvider.js'
import { Hasher } from '../../infrastructure/hash/Hasher.js'
import { notEquals, toIndexedMap } from '../../language/LanguageUtils.js'
import { urlToPath } from '../../port/java-net.js'
import { contains, distinct, distinctBy, eq, firstOrNull, isNotBlank, mapNotNull, nn, str } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { Pageable } from '../../port/spring-data.js'
import { TransactionTemplate } from '../../port/spring-tx.js'
import { BookLifecycle } from './BookLifecycle.js'
import { FileSystemScanner } from './FileSystemScanner.js'
import { ReadListLifecycle } from './ReadListLifecycle.js'
import { SeriesCollectionLifecycle } from './SeriesCollectionLifecycle.js'
import { SeriesLifecycle } from './SeriesLifecycle.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.LibraryContentLifecycle')

// PORT: `containsAll` de Kotlin (égalité `==`)
function containsAll<T>(self: readonly T[], elements: readonly T[]): boolean {
  return elements.every((e) => contains(self, e))
}

export class LibraryContentLifecycle {
  constructor(
    private readonly fileSystemScanner: FileSystemScanner,
    private readonly seriesRepository: SeriesRepository,
    private readonly bookRepository: BookRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly bookLifecycle: BookLifecycle,
    private readonly mediaRepository: MediaRepository,
    private readonly seriesLifecycle: SeriesLifecycle,
    private readonly collectionLifecycle: SeriesCollectionLifecycle,
    private readonly readListLifecycle: ReadListLifecycle,
    private readonly sidecarRepository: SidecarRepository,
    private readonly komgaSettingsProvider: KomgaSettingsProvider,
    private readonly taskEmitter: TaskEmitter,
    private readonly transactionTemplate: TransactionTemplate,
    private readonly hasher: Hasher,
    private readonly bookMetadataRepository: BookMetadataRepository,
    private readonly seriesMetadataRepository: SeriesMetadataRepository,
    private readonly readListRepository: ReadListRepository,
    private readonly readProgressRepository: ReadProgressRepository,
    private readonly collectionRepository: SeriesCollectionRepository,
    private readonly thumbnailBookRepository: ThumbnailBookRepository,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly thumbnailSeriesRepository: ThumbnailSeriesRepository,
  ) {}

  scanRootFolder(library: Library, { scanDeep = false }: { scanDeep?: boolean } = {}): void {
    logger.info(() => `Scan root folder for library: ${str(library)}`)
    // measureTime
    const start = performance.now()
    {
      let scanResult
      try {
        scanResult = this.fileSystemScanner.scanRootFolder(urlToPath(library.root), {
          forceDirectoryModifiedTime: library.scanForceModifiedTime,
          oneshotsDir: library.oneshotsDirectory,
          scanCbx: library.scanCbx,
          scanPdf: library.scanPdf,
          scanEpub: library.scanEpub,
          directoryExclusions: library.scanDirectoryExclusions,
        })
      } catch (e) {
        if (e instanceof DirectoryNotFoundException) {
          const it = library.copy({ unavailableDate: LocalDateTime.now() })
          this.libraryRepository.update(it)
          this.eventPublisher.publishEvent(new DomainEvent.LibraryUpdated({ library: it }))
        }
        throw e
      }

      if (library.unavailableDate !== null) {
        const it = library.copy({ unavailableDate: null })
        this.libraryRepository.update(it)
        this.eventPublisher.publishEvent(new DomainEvent.LibraryUpdated({ library: it }))
      }

      // PORT: toMap() : Map à clés par identité (copies de Series à id unique)
      const scannedSeries = new Map<Series, Book[]>(
        [...scanResult.series].map(([series, books]) => [series.copy({ libraryId: library.id }), books.map((it) => it.copy({ libraryId: library.id }))] as const),
      )

      // delete series that don't exist anymore
      if (scannedSeries.size === 0) {
        logger.info(() => 'Scan returned no series, soft deleting all existing series')
        const series = this.seriesRepository.findAllByLibraryId(library.id)
        this.seriesLifecycle.softDeleteMany(series)
      } else {
        const urls = [...scannedSeries.keys()].map((it) => it.url)
        const series = this.seriesRepository.findAllNotDeletedByLibraryIdAndUrlNotIn(library.id, urls)
        if (series.length > 0) {
          logger.info(() => `Soft deleting series not on disk anymore: ${str(series)}`)
          this.seriesLifecycle.softDeleteMany(series)
        }
      }

      // delete books that don't exist anymore. We need to do this now, so trash bin can work
      let seriesToSortAndRefresh: Series[]
      {
        const urls = [...scannedSeries.values()].flat().map((it) => it.url)
        const books = this.bookRepository.findAllNotDeletedByLibraryIdAndUrlNotIn(library.id, urls)
        if (books.length > 0) {
          logger.info(() => `Soft deleting books not on disk anymore: ${str(books)}`)
          this.bookLifecycle.softDeleteMany(books)
          seriesToSortAndRefresh = mapNotNull(
            distinct(books.map((it) => it.seriesId)),
            (it) => this.seriesRepository.findByIdOrNull(it),
          )
        } else {
          seriesToSortAndRefresh = []
        }
      }
      // we store the url of all the series that had deleted books
      // this can be used to detect changed series even if their file modified date did not change, for example because of NFS/SMB cache
      const seriesUrlWithDeletedBooks = seriesToSortAndRefresh.map((it) => it.url)

      scannedSeries.forEach((newBooks, newSeries) => {
        const existingSeries = this.seriesRepository.findNotDeletedByLibraryIdAndUrlOrNull(library.id, newSeries.url)

        // if series does not exist, save it
        if (existingSeries === null) {
          logger.info(() => `Adding new series: ${str(newSeries)}`)
          const createdSeries = this.seriesLifecycle.createSeries(newSeries)
          this.seriesLifecycle.addBooks(createdSeries, newBooks)
          this.tryRestoreSeries(createdSeries, newBooks)
          this.tryRestoreBooks(newBooks)
          seriesToSortAndRefresh.push(createdSeries)
        } else {
          // if series already exists, update it
          logger.debug(() => `Scanned series already exists. Scanned: ${str(newSeries)}, Existing: ${str(existingSeries)}`)
          const seriesChanged =
            notEquals(newSeries.fileLastModified, existingSeries.fileLastModified) || existingSeries.deletedDate !== null || contains(seriesUrlWithDeletedBooks, newSeries.url)
          if (seriesChanged) {
            logger.info(() => `Series changed on disk, updating: ${str(existingSeries)}`)
            this.seriesRepository.update(existingSeries.copy({ fileLastModified: newSeries.fileLastModified, deletedDate: null }))
          }
          if (scanDeep || seriesChanged) {
            // update list of books with existing entities if they exist
            const existingBooks = this.bookRepository.findAllBySeriesId(existingSeries.id)
            logger.debug(() => `Existing books: ${str(existingBooks)}`)

            // update existing books
            newBooks.forEach((newBook) => {
              logger.debug(() => `Trying to match scanned book by url: ${str(newBook)}`)
              const existingBook = existingBooks.find((it) => eq(it.url, newBook.url) && it.deletedDate === null)
              if (existingBook !== undefined) {
                logger.debug(() => `Matched existing book: ${str(existingBook)}`)
                if (notEquals(newBook.fileLastModified, existingBook.fileLastModified)) {
                  const hash = existingBook.fileSize === newBook.fileSize && isNotBlank(existingBook.fileHash) ? this.hasher.computeHash(newBook.path) : null
                  if (hash === existingBook.fileHash) {
                    logger.info(() => `Book changed on disk, but still has the same hash, no need to reset media status: ${str(existingBook)}`)
                    const updatedBook = existingBook.copy({
                      fileLastModified: newBook.fileLastModified,
                      fileSize: newBook.fileSize,
                      fileHash: hash,
                    })
                    this.bookRepository.update(updatedBook)
                  } else {
                    logger.info(() => `Book changed on disk, update and reset media status: ${str(existingBook)}`)
                    const updatedBook = existingBook.copy({
                      fileLastModified: newBook.fileLastModified,
                      fileSize: newBook.fileSize,
                      fileHash: hash ?? '',
                    })
                    this.transactionTemplate.executeWithoutResult(() => {
                      const it = this.mediaRepository.findById(existingBook.id)
                      this.mediaRepository.update(it.copy({ status: Media.Status.OUTDATED }))
                      this.bookRepository.update(updatedBook)
                    })
                  }
                }
              }
            })

            // add new books
            const existingBooksUrls = existingBooks.filter((it) => !(it.deletedDate !== null)).map((it) => it.url)
            const booksToAdd = newBooks.filter((newBook) => !contains(existingBooksUrls, newBook.url))
            logger.info(() => `Adding new books: ${str(booksToAdd)}`)
            this.seriesLifecycle.addBooks(existingSeries, booksToAdd)
            this.tryRestoreBooks(booksToAdd)
            seriesToSortAndRefresh.push(existingSeries)
          }
        }
      })

      // for all series where books have been removed or added, trigger a sort and refresh metadata
      distinctBy(seriesToSortAndRefresh, (it) => it.id).forEach((it) => {
        this.seriesLifecycle.sortBooks(it)
        this.taskEmitter.refreshSeriesMetadata(it.id)
      })

      const existingSidecars = this.sidecarRepository.findAll()
      scanResult.sidecars.forEach((newSidecar) => {
        const existingSidecar = firstOrNull(existingSidecars, (it) => eq(it.url, newSidecar.url))
        if (existingSidecar === null || notEquals(existingSidecar.lastModifiedTime, newSidecar.lastModifiedTime)) {
          switch (newSidecar.source) {
            case Sidecar.Source.SERIES: {
              const series = this.seriesRepository.findNotDeletedByLibraryIdAndUrlOrNull(library.id, newSidecar.parentUrl)
              if (series !== null) {
                logger.info(() => `Sidecar changed on disk (${str(newSidecar.url)}, refresh Series for ${str(newSidecar.type)}: ${str(series)}`)
                switch (newSidecar.type) {
                  case Sidecar.Type.ARTWORK:
                    this.taskEmitter.refreshSeriesLocalArtwork(series.id)
                    break
                  case Sidecar.Type.METADATA:
                    this.taskEmitter.refreshSeriesMetadata(series.id)
                    break
                }
              }
              break
            }

            case Sidecar.Source.BOOK: {
              const book = this.bookRepository.findNotDeletedByLibraryIdAndUrlOrNull(library.id, newSidecar.parentUrl)
              if (book !== null) {
                logger.info(() => `Sidecar changed on disk (${str(newSidecar.url)}, refresh Book for ${str(newSidecar.type)}: ${str(book)}`)
                switch (newSidecar.type) {
                  case Sidecar.Type.ARTWORK:
                    this.taskEmitter.refreshBookLocalArtwork(book)
                    break
                  case Sidecar.Type.METADATA:
                    this.taskEmitter.refreshBookMetadata(book)
                    break
                }
              }
              break
            }
          }
          this.sidecarRepository.save(library.id, newSidecar)
        }
      })

      // cleanup sidecars that don't exist anymore
      {
        const newSidecarsUrls = scanResult.sidecars.map((it) => it.url)
        const sidecars = existingSidecars.filter((existing) => !contains(newSidecarsUrls, existing.url))
        this.sidecarRepository.deleteByLibraryIdAndUrls(
          library.id,
          sidecars.map((it) => it.url),
        )
      }

      if (library.emptyTrashAfterScan) this.emptyTrash(library)
      else this.cleanupEmptySets()
    }
    {
      const it = performance.now() - start
      // PORT: format de kotlin.time.Duration.toString() approché (millisecondes)
      logger.info(() => `Library updated in ${it.toFixed(3)}ms`)
    }

    this.eventPublisher.publishEvent(new DomainEvent.LibraryScanned({ library: library }))
  }

  /**
   * This will try to match newSeries with a deleted series.
   * Series are matched if:
   * - they have the same number of books
   * - all the books are matched by file size and file hash
   *
   * If a series is matched, the following will be restored from the deleted series to the new series:
   * - Collections
   * - Metadata. The metadata title will only be copied if locked. If not locked, the folder name is used.
   * - all books, via #tryRestoreBooks
   */
  private tryRestoreSeries(newSeries: Series, newBooks: Book[]): void {
    logger.info(() => `Try to restore series: ${str(newSeries)}`)
    const bookSizes = newBooks.map((it) => it.fileSize)

    const deletedCandidates = mapNotNull(
      this.seriesRepository.findAll(new SearchCondition.Deleted({ operator: SearchOperator.IsTrue }), SearchContext.empty(), Pageable.unpaged()).content,
      (deletedCandidate) => {
        const deletedBooks = this.bookRepository.findAllBySeriesId(deletedCandidate.id)
        const deletedBooksSizes = deletedBooks.map((it) => it.fileSize)
        if (
          newBooks.length === deletedBooks.length &&
          containsAll(bookSizes, deletedBooksSizes) &&
          containsAll(deletedBooksSizes, bookSizes) &&
          deletedBooks.every((it) => isNotBlank(it.fileHash))
        ) {
          return [deletedCandidate, deletedBooks] as const
        } else {
          return null
        }
      },
    )
    logger.debug(() => `Deleted series candidates: ${str(deletedCandidates)}`)

    if (deletedCandidates.length > 0) {
      const newBooksWithHash = newBooks.map((book) => nn(this.bookRepository.findByIdOrNull(book.id)).copy({ fileHash: this.hasher.computeHash(book.path) }))
      this.bookRepository.update(newBooksWithHash)

      const match =
        deletedCandidates.find(
          ([, books]) =>
            containsAll(
              books.map((it) => it.fileHash),
              newBooksWithHash.map((it) => it.fileHash),
            ) &&
            containsAll(
              newBooksWithHash.map((it) => it.fileHash),
              books.map((it) => it.fileHash),
            ),
        ) ?? null

      if (match !== null) {
        // restore series
        logger.info(() => `Match found, restore ${str(match)} into ${str(newSeries)}`)
        this.transactionTemplate.executeWithoutResult(() => {
          // copy metadata
          {
            const deleted = this.seriesMetadataRepository.findById(match[0].id)
            const newlyAdded = this.seriesMetadataRepository.findById(newSeries.id)
            this.seriesMetadataRepository.update(
              deleted.copy({
                seriesId: newSeries.id,
                title: deleted.titleLock ? deleted.title : newlyAdded.title,
                titleSort: deleted.titleSortLock ? deleted.titleSort : newlyAdded.titleSort,
              }),
            )
          }

          // copy user uploaded thumbnails
          this.thumbnailSeriesRepository.findAllBySeriesIdIdAndType(match[0].id, ThumbnailSeries.Type.USER_UPLOADED).forEach((deleted) => {
            this.thumbnailSeriesRepository.update(deleted.copy({ seriesId: newSeries.id }))
          })

          // replace deleted series by new series in collections
          this.collectionRepository.findAllContainingSeriesId(match[0].id, SearchContext.empty()).forEach((col) => {
            this.collectionRepository.update(
              col.copy({
                seriesIds: col.seriesIds.map((it) => (it === match[0].id ? newSeries.id : it)),
              }),
            )
          })

          this.tryRestoreBooks(newBooksWithHash)

          // delete upgraded series
          this.seriesLifecycle.deleteMany([match[0]])
        })
      }
    }
  }

  /**
   * This will try to match each book in newBooks with a deleted book.
   * Books are matched by file size, then by file hash.
   *
   * If a book is matched, the following will be restored from the deleted book to the new book:
   * - Media
   * - Read Progress
   * - Read Lists
   * - Metadata. The metadata title will only be copied if locked. If not locked, the filename is used, but a refresh for Title will be requested.
   */
  private tryRestoreBooks(newBooks: Book[]): void {
    logger.info(() => `Try to restore books: ${str(newBooks)}`)
    newBooks.forEach((bookToAdd) => {
      // try to find a deleted book that matches the file size
      const deletedCandidates = this.bookRepository.findAllDeletedByFileSize(bookToAdd.fileSize).filter((it) => isNotBlank(it.fileHash))
      logger.debug(() => `Deleted candidates: ${str(deletedCandidates)}`)

      if (deletedCandidates.length > 0) {
        // if the book has no hash, compute the hash and store it
        let bookWithHash: Book
        if (isNotBlank(bookToAdd.fileHash)) bookWithHash = bookToAdd
        else {
          bookWithHash = nn(this.bookRepository.findByIdOrNull(bookToAdd.id)).copy({ fileHash: this.hasher.computeHash(bookToAdd.path) })
          this.bookRepository.update(bookWithHash)
        }

        const match = deletedCandidates.find((it) => it.fileHash === bookWithHash.fileHash) ?? null

        if (match !== null) {
          // restore book
          logger.info(() => `Match found, restore ${str(match)} into ${str(bookToAdd)}`)
          this.transactionTemplate.executeWithoutResult(() => {
            // copy media
            this.mediaRepository.copy(match.id, bookToAdd.id)

            // copy generated and user uploaded thumbnails
            this.thumbnailBookRepository.findAllByBookIdAndType(match.id, new Set([ThumbnailBook.Type.GENERATED, ThumbnailBook.Type.USER_UPLOADED])).forEach((deleted) => {
              this.thumbnailBookRepository.update(deleted.copy({ bookId: bookToAdd.id }))
            })

            // copy metadata
            {
              const deleted = this.bookMetadataRepository.findById(match.id)
              const newlyAdded = this.bookMetadataRepository.findById(bookToAdd.id)
              this.bookMetadataRepository.update(
                deleted.copy({
                  bookId: bookToAdd.id,
                  title: deleted.titleLock ? deleted.title : newlyAdded.title,
                }),
              )
              if (!deleted.titleLock) this.taskEmitter.refreshBookMetadata(bookToAdd, { capabilities: new Set([BookMetadataPatchCapability.TITLE]) })
            }

            // copy read progress
            this.readProgressRepository
              .findAllByBookId(match.id)
              .map((it) => it.copy({ bookId: bookToAdd.id }))
              .forEach((it) => this.readProgressRepository.save(it))

            // replace deleted book by new book in read lists
            this.readListRepository.findAllContainingBookId(match.id, SearchContext.empty()).forEach((rl) => {
              this.readListRepository.update(
                rl.copy({
                  bookIds: toIndexedMap([...rl.bookIds.values()].map((it) => (it === match.id ? bookToAdd.id : it))),
                }),
              )
            })

            // delete soft-deleted book
            this.bookLifecycle.deleteOne(match)
          })
        }
      }
    })
  }

  emptyTrash(library: Library): void {
    logger.info(() => `Empty trash for library: ${str(library)}`)

    const seriesToDelete = this.seriesRepository.findAll(
      SearchCondition.AllOfSeries.of(
        new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }),
        new SearchCondition.Deleted({ operator: SearchOperator.IsTrue }),
      ),
      SearchContext.empty(),
      Pageable.unpaged(),
    ).content
    this.seriesLifecycle.deleteMany(seriesToDelete)

    const booksToDelete = this.bookRepository.findAll(
      SearchCondition.AllOfBook.of(
        new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }),
        new SearchCondition.Deleted({ operator: SearchOperator.IsTrue }),
      ),
      SearchContext.empty(),
      Pageable.unpaged(),
    ).content
    this.bookLifecycle.deleteMany(booksToDelete)
    distinct(booksToDelete.map((it) => it.seriesId)).forEach((seriesId) => {
      const it = this.seriesRepository.findByIdOrNull(seriesId)
      if (it !== null) this.seriesLifecycle.sortBooks(it)
    })

    this.cleanupEmptySets()
  }

  private cleanupEmptySets(): void {
    if (this.komgaSettingsProvider.deleteEmptyCollections) {
      this.collectionLifecycle.deleteEmptyCollections()
    }

    if (this.komgaSettingsProvider.deleteEmptyReadLists) {
      this.readListLifecycle.deleteEmptyReadLists()
    }
  }
}

// @Service
component(LibraryContentLifecycle, {
  inject: [
    FileSystemScanner,
    SeriesRepository,
    BookRepository,
    LibraryRepository,
    BookLifecycle,
    MediaRepository,
    SeriesLifecycle,
    SeriesCollectionLifecycle,
    ReadListLifecycle,
    SidecarRepository,
    KomgaSettingsProvider,
    TaskEmitter,
    TransactionTemplate,
    Hasher,
    BookMetadataRepository,
    SeriesMetadataRepository,
    ReadListRepository,
    ReadProgressRepository,
    SeriesCollectionRepository,
    ThumbnailBookRepository,
    ApplicationEventPublisher,
    ThumbnailSeriesRepository,
  ],
})
