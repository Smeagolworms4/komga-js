// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/BookImporter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { TaskEmitter } from '../../application/tasks/TaskEmitter.js'
import type { Book } from '../model/Book.js'
import { CodedException, PathContainedInPath, withCode } from '../model/Exceptions.js'
import { CopyMode } from '../model/CopyMode.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { HistoricalEvent } from '../model/HistoricalEvent.js'
import { Media } from '../model/Media.js'
import { SearchContext } from '../model/SearchContext.js'
import type { Series } from '../model/Series.js'
import { Sidecar } from '../model/Sidecar.js'
import { ThumbnailBook } from '../model/ThumbnailBook.js'
import { BookMetadataRepository } from '../persistence/BookMetadataRepository.js'
import { BookRepository } from '../persistence/BookRepository.js'
import { HistoricalEventRepository } from '../persistence/HistoricalEventRepository.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { MediaRepository } from '../persistence/MediaRepository.js'
import { ReadListRepository } from '../persistence/ReadListRepository.js'
import { ReadProgressRepository } from '../persistence/ReadProgressRepository.js'
import { SeriesRepository } from '../persistence/SeriesRepository.js'
import { SidecarRepository } from '../persistence/SidecarRepository.js'
import { ThumbnailBookRepository } from '../persistence/ThumbnailBookRepository.js'
import { toIndexedMap } from '../../language/LanguageUtils.js'
import { FileNotFoundException } from '../../port/java-io.js'
import { pathToUrl, urlToPath } from '../../port/java-net.js'
import {
  FileAlreadyExistsException,
  NoSuchFileException,
  copyTo,
  createLink,
  deleteExisting,
  deleteIfExists,
  exists,
  moveTo,
  notExists,
  pathExtension,
  pathName,
  pathNameWithoutExtension,
  pathParent,
  pathResolve,
  pathStartsWith,
  pathsGet,
  readAttributes,
} from '../../port/java-nio-file.js'
import { replaceIgnoreCase } from '../../port/kotlin-text.js'
import { IllegalArgumentException, IllegalStateException, nn, str } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { BookLifecycle } from './BookLifecycle.js'
import { FileSystemScanner, getUpdatedTime } from './FileSystemScanner.js'
import { SeriesLifecycle } from './SeriesLifecycle.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.BookImporter')

export class BookImporter {
  constructor(
    private readonly bookLifecycle: BookLifecycle,
    private readonly fileSystemScanner: FileSystemScanner,
    private readonly seriesLifecycle: SeriesLifecycle,
    private readonly bookRepository: BookRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly metadataRepository: BookMetadataRepository,
    private readonly thumbnailBookRepository: ThumbnailBookRepository,
    private readonly readProgressRepository: ReadProgressRepository,
    private readonly readListRepository: ReadListRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly sidecarRepository: SidecarRepository,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly taskEmitter: TaskEmitter,
    private readonly historicalEventRepository: HistoricalEventRepository,
    private readonly seriesRepository: SeriesRepository,
  ) {}

  importBook(
    sourceFile: string,
    series: Series,
    copyMode: CopyMode,
    { destinationName = null, upgradeBookId = null }: { destinationName?: string | null; upgradeBookId?: string | null } = {},
  ): Book {
    try {
      if (notExists(sourceFile)) throw withCode(new FileNotFoundException(`File not found: ${sourceFile}`), 'ERR_1018')
      if (series.oneshot && (upgradeBookId === null || upgradeBookId.length === 0)) throw new IllegalArgumentException('Destination series is oneshot but upgradeBookId is missing')

      this.libraryRepository.findAll().forEach((library) => {
        if (pathStartsWith(sourceFile, library.path)) throw new PathContainedInPath('Cannot import file that is part of an existing library', 'ERR_1019')
      })

      let bookToUpgrade: Book | null
      if (upgradeBookId !== null) {
        bookToUpgrade = this.bookRepository.findByIdOrNull(upgradeBookId)
        if (bookToUpgrade !== null) {
          if (bookToUpgrade.seriesId !== series.id) throw withCode(new IllegalArgumentException(`Book to upgrade (${upgradeBookId}) does not belong to series: ${str(series)}`), 'ERR_1020')
        }
      } else {
        bookToUpgrade = null
      }

      const destDir = series.oneshot ? nn(pathParent(series.path)) : series.path

      const destFile = pathResolve(destDir, destinationName !== null ? pathName(pathsGet(`${destinationName}.${pathExtension(sourceFile)}`)) : pathName(sourceFile))
      // PORT: associateWith -> Map (clés Sidecar distinctes)
      const sidecars = new Map<Sidecar, string>(
        this.fileSystemScanner
          .scanBookSidecars(sourceFile)
          .map((it) => [
            it,
            pathResolve(
              destDir,
              destinationName !== null ? replaceIgnoreCase(pathName(urlToPath(it.url)), pathNameWithoutExtension(sourceFile), destinationName) : pathName(urlToPath(it.url)),
            ),
          ]),
      )

      let deletedUpgradedFile = false
      if (bookToUpgrade?.path != null && destFile === bookToUpgrade.path) {
        logger.info(() => `Deleting existing file: ${bookToUpgrade.path}`)
        try {
          deleteExisting(bookToUpgrade.path)
          this.historicalEventRepository.insert(new HistoricalEvent.BookFileDeleted({ book: bookToUpgrade, reason: 'File was deleted to import an upgrade' }))
          deletedUpgradedFile = true
        } catch (e) {
          if (!(e instanceof NoSuchFileException)) throw e
          logger.warn(() => `Could not delete upgraded book: ${bookToUpgrade.path}`)
        }
      } else if (exists(destFile)) throw withCode(new FileAlreadyExistsException(`Destination file already exists: ${destFile}`), 'ERR_1021')
      // delete existing sidecars
      if (bookToUpgrade?.path != null) {
        this.fileSystemScanner.scanBookSidecars(bookToUpgrade.path).forEach((sidecar) => {
          const sidecarPath = urlToPath(sidecar.url)
          logger.info(() => `Deleting existing file: ${sidecarPath}`)
          deleteIfExists(sidecarPath)
        })
      }

      switch (copyMode) {
        case CopyMode.MOVE: {
          logger.info(() => `Moving file ${sourceFile} to ${destFile}`)
          moveTo(sourceFile, destFile)
          sidecars.forEach((value, key) => {
            const sourcePath = urlToPath(key.url)
            logger.info(() => `Moving file ${sourcePath} to ${value}`)
            moveTo(sourcePath, value, true)
          })
          break
        }

        case CopyMode.COPY: {
          logger.info(() => `Copying file ${sourceFile} to ${destFile}`)
          copyTo(sourceFile, destFile)
          sidecars.forEach((value, key) => {
            const sourcePath = urlToPath(key.url)
            logger.info(() => `Copying file ${sourcePath} to ${value}`)
            copyTo(sourcePath, value, true)
          })
          break
        }

        case CopyMode.HARDLINK:
          try {
            logger.info(() => `Hardlink file ${sourceFile} to ${destFile}`)
            createLink(destFile, sourceFile)
            sidecars.forEach((value, key) => {
              const sourcePath = urlToPath(key.url)
              logger.info(() => `Hardlink file ${sourcePath} to ${value}`)
              deleteIfExists(value)
              createLink(value, sourcePath)
            })
          } catch (e) {
            logger.warn(e as Error, () => 'Filesystem does not support hardlinks, copying instead')
            copyTo(sourceFile, destFile)
            sidecars.forEach((value, key) => {
              copyTo(urlToPath(key.url), value, true)
            })
          }
          break
      }

      const scanned = this.fileSystemScanner.scanFile(destFile)
      const importedBook =
        scanned?.copy({ libraryId: series.libraryId, oneshot: series.oneshot }) ??
        (() => {
          throw withCode(new IllegalStateException(`Newly imported book could not be scanned: ${destFile}`), 'ERR_1022')
        })()

      this.seriesLifecycle.addBooks(series, [importedBook])

      if (bookToUpgrade !== null) {
        // copy media and mark it as outdated
        {
          const it = this.mediaRepository.findById(bookToUpgrade.id)
          this.mediaRepository.update(
            it.copy({
              bookId: importedBook.id,
              status: Media.Status.OUTDATED,
            }),
          )
        }

        // copy metadata
        {
          const it = this.metadataRepository.findById(bookToUpgrade.id)
          this.metadataRepository.update(it.copy({ bookId: importedBook.id }))
        }

        // copy user uploaded thumbnails
        this.thumbnailBookRepository.findAllByBookIdAndType(bookToUpgrade.id, new Set([ThumbnailBook.Type.USER_UPLOADED])).forEach((deleted) => {
          this.thumbnailBookRepository.update(deleted.copy({ bookId: importedBook.id }))
        })

        // copy read progress
        this.readProgressRepository
          .findAllByBookId(bookToUpgrade.id)
          .map((it) => it.copy({ bookId: importedBook.id }))
          .forEach((it) => this.readProgressRepository.save(it))

        // replace upgraded book by imported book in read lists
        const upgradedId = bookToUpgrade.id
        this.readListRepository.findAllContainingBookId(bookToUpgrade.id, SearchContext.empty()).forEach((rl) => {
          this.readListRepository.update(
            rl.copy({
              bookIds: toIndexedMap([...rl.bookIds.values()].map((it) => (it === upgradedId ? importedBook.id : it))),
            }),
          )
        })

        // delete upgraded book file on disk if it has not been replaced earlier
        if (!deletedUpgradedFile && deleteIfExists(bookToUpgrade.path)) {
          logger.info(() => `Deleted existing file: ${bookToUpgrade.path}`)
          this.historicalEventRepository.insert(new HistoricalEvent.BookFileDeleted({ book: bookToUpgrade, reason: 'File was deleted to import an upgrade' }))
        }

        // delete upgraded book
        this.bookLifecycle.deleteOne(bookToUpgrade)

        // update series if one-shot, so it's not marked as not found during the next scan
        if (series.oneshot) {
          this.seriesRepository.update(series.copy({ url: importedBook.url, fileLastModified: importedBook.fileLastModified }))
        }
      }

      this.seriesLifecycle.sortBooks(series)

      sidecars.forEach((destPath, sourceSidecar) => {
        switch (sourceSidecar.type) {
          case Sidecar.Type.ARTWORK:
            this.taskEmitter.refreshBookLocalArtwork(importedBook)
            break
          case Sidecar.Type.METADATA:
            this.taskEmitter.refreshBookMetadata(importedBook)
            break
        }
        const destSidecar = sourceSidecar.copy({
          url: pathToUrl(destPath),
          parentUrl: pathToUrl(nn(pathParent(destPath))),
          lastModifiedTime: getUpdatedTime(readAttributes(destPath)),
        })
        this.sidecarRepository.save(importedBook.libraryId, destSidecar)
      })

      this.historicalEventRepository.insert(new HistoricalEvent.BookImported({ book: importedBook, series: series, source: sourceFile, upgrade: upgradeBookId !== null }))
      this.eventPublisher.publishEvent(new DomainEvent.BookImported({ book: importedBook, sourceFile: pathToUrl(sourceFile), success: true }))

      return importedBook
    } catch (e) {
      // PORT: message JS vide = message Kotlin null (exception construite sans message)
      const msg = e instanceof CodedException ? e.code : (e as Error).message || null
      this.eventPublisher.publishEvent(new DomainEvent.BookImported({ book: null, sourceFile: pathToUrl(sourceFile), success: false, message: msg }))
      throw e
    }
  }
}

// @Service
component(BookImporter, {
  inject: [
    BookLifecycle,
    FileSystemScanner,
    SeriesLifecycle,
    BookRepository,
    MediaRepository,
    BookMetadataRepository,
    ThumbnailBookRepository,
    ReadProgressRepository,
    ReadListRepository,
    LibraryRepository,
    SidecarRepository,
    ApplicationEventPublisher,
    TaskEmitter,
    HistoricalEventRepository,
    SeriesRepository,
  ],
})
