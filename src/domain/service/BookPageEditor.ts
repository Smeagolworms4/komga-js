// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/BookPageEditor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { dirname } from 'node:path'
import type { Book } from '../model/Book.js'
import { BookAction } from '../model/BookAction.js'
import { restoreHashFrom } from '../model/BookPage.js'
import type { BookPageNumbered } from '../model/BookPageNumbered.js'
import { BookWithMedia } from '../model/BookWithMedia.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { BookConversionException, MediaNotReadyException, MediaUnsupportedException } from '../model/Exceptions.js'
import { HistoricalEvent } from '../model/HistoricalEvent.js'
import { Media } from '../model/Media.js'
import { MediaType } from '../model/MediaType.js'
import { BookRepository } from '../persistence/BookRepository.js'
import { HistoricalEventRepository } from '../persistence/HistoricalEventRepository.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { MediaRepository } from '../persistence/MediaRepository.js'
import { PageHashRepository } from '../persistence/PageHashRepository.js'
import { notEquals } from '../../language/LanguageUtils.js'
import { FilenameUtils } from '../../port/commons-io.js'
import { IllegalStateException, mapNotNull, str } from '../../port/kotlin.js'
import { FileNotFoundException, createTempFile, deleteIfExists, moveTo } from '../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../port/logging.js'
import { TransactionTemplate } from '../../port/spring-tx.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { Deflater, ZipArchiveOutputStream, zipArchiveEntry } from '../../port/zip-output.js'
import { use } from '../../port/java-io.js'
import { BookAnalyzer } from './BookAnalyzer.js'
import { FileSystemScanner } from './FileSystemScanner.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.BookPageEditor')
const TEMP_PREFIX = 'komga_page_removal_'
const TEMP_SUFFIX = '.tmp'

export class BookPageEditor {
  private readonly convertibleTypes = [MediaType.ZIP.type]

  private readonly failedPageRemoval: string[] = []

  constructor(
    private readonly bookAnalyzer: BookAnalyzer,
    private readonly fileSystemScanner: FileSystemScanner,
    private readonly bookRepository: BookRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly pageHashRepository: PageHashRepository,
    private readonly transactionTemplate: TransactionTemplate,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly historicalEventRepository: HistoricalEventRepository,
  ) {}

  removeHashedPages(book: Book, pagesToDelete: BookPageNumbered[]): BookAction | null {
    // perform various checks
    if (this.failedPageRemoval.includes(book.id)) {
      logger.info(() => 'Book page removal already failed before, skipping')
      return null
    }

    const scannedBook = this.fileSystemScanner.scanFile(book.path)
    if (scannedBook !== null) {
      if (notEquals(scannedBook.fileLastModified, book.fileLastModified)) {
        logger.info(() => `Book has changed on disk, skipping. Db: ${book.fileLastModified}. Scanned: ${scannedBook.fileLastModified}`)
        return null
      }
    } else throw new FileNotFoundException(`File not found: ${book.path}`)

    const media = this.mediaRepository.findById(book.id)

    if (!this.convertibleTypes.includes(media.mediaType as string))
      throw new MediaUnsupportedException(`${str(media.mediaType)} cannot be converted. Must be one of ${str(this.convertibleTypes)}`)

    if (media.status !== Media.Status.READY) throw new MediaNotReadyException()

    // create a temp file with the pages removed
    const pagesToKeep = media.pages.filter(
      (page, index) =>
        pagesToDelete.find(
          (candidate) =>
            candidate.fileHash === page.fileHash &&
            candidate.mediaType === page.mediaType &&
            candidate.fileName === page.fileName &&
            candidate.pageNumber === index + 1,
        ) === undefined,
    )
    if (media.pages.length !== pagesToKeep.length + pagesToDelete.length) {
      logger.info(() => `Should be removing ${pagesToDelete.length} pages from book, but count doesn't add up, skipping`)
      return null
    }

    logger.info(() => `Start removal of ${pagesToDelete.length} pages for book: ${book}`)
    logger.debug(() => `Pages: ${str(media.pages)}`)
    logger.debug(() => `Pages to delete: ${str(pagesToDelete)}`)
    logger.debug(() => `Pages to keep: ${str(pagesToKeep)}`)

    const tempFile = createTempFile(TEMP_PREFIX, TEMP_SUFFIX, dirname(book.path))
    logger.info(() => `Creating new file: ${tempFile}`)
    use(new ZipArchiveOutputStream(tempFile), (zipStream) => {
      zipStream.setMethod(ZipArchiveOutputStream.DEFLATED)
      zipStream.setLevel(Deflater.NO_COMPRESSION)

      new Set([...pagesToKeep.map((it) => it.fileName), ...media.files.map((it) => it.fileName)]).forEach((entry) => {
        zipStream.putArchiveEntry(zipArchiveEntry(entry))
        zipStream.write(this.bookAnalyzer.getFileContent(new BookWithMedia({ book: book, media: media }), entry))
        zipStream.closeArchiveEntry()
      })
    })

    // perform checks on new file
    const createdBook =
      this.fileSystemScanner.scanFile(tempFile)?.copy({
        id: book.id,
        seriesId: book.seriesId,
        libraryId: book.libraryId,
      }) ?? null
    if (createdBook === null) throw new IllegalStateException(`Newly created book could not be scanned: ${tempFile}`)

    const createdMedia = this.bookAnalyzer.analyze(createdBook, this.libraryRepository.findById(book.libraryId).analyzeDimensions)

    try {
      if (createdMedia.status !== Media.Status.READY) throw new BookConversionException('Created file could not be analyzed, aborting page removal')
      else if (createdMedia.mediaType !== MediaType.ZIP.type) throw new BookConversionException('Created file is not a zip file, aborting page removal')
      else if (
        // PORT: Pair(nom, mediaType) -> clé chaîne pour containsAll
        !containsAll(
          createdMedia.pages.map((it) => pairKey(FilenameUtils.getName(it.fileName), it.mediaType)),
          pagesToKeep.map((it) => pairKey(FilenameUtils.getName(it.fileName), it.mediaType)),
        )
      )
        throw new BookConversionException('Created file does not contain all pages to keep from existing file, aborting conversion')
      else if (
        !containsAll(
          createdMedia.files.map((it) => FilenameUtils.getName(it.fileName)),
          media.files.map((it) => FilenameUtils.getName(it.fileName)),
        )
      )
        throw new BookConversionException('Created file does not contain all files from existing file, aborting page removal')
    } catch (e) {
      if (e instanceof BookConversionException) {
        deleteIfExists(tempFile)
        this.failedPageRemoval.push(book.id)
      }
      throw e
    }

    moveTo(tempFile, book.path, true)
    const newBook =
      this.fileSystemScanner.scanFile(book.path)?.copy({
        id: book.id,
        seriesId: book.seriesId,
        libraryId: book.libraryId,
      }) ?? null
    if (newBook === null) throw new IllegalStateException(`Newly created book could not be scanned after replacing existing one: ${book.path}`)

    const mediaWithHashes = createdMedia.copy({ pages: restoreHashFrom(createdMedia.pages, media.pages) })

    this.transactionTemplate.executeWithoutResult(() => {
      this.bookRepository.update(newBook)
      this.mediaRepository.update(mediaWithHashes)
      mapNotNull(pagesToDelete, (it) => this.pageHashRepository.findKnown(it.fileHash)).forEach((it) =>
        this.pageHashRepository.update(it.copy({ deleteCount: it.deleteCount + 1 })),
      )
    })

    pagesToDelete.forEach((it) => this.historicalEventRepository.insert(new HistoricalEvent.DuplicatePageDeleted({ book: book, page: it })))
    this.eventPublisher.publishEvent(new DomainEvent.BookUpdated({ book: newBook }))

    return pagesToDelete.some((it) => it.pageNumber === 1) ? BookAction.GENERATE_THUMBNAIL : null
  }
}

function pairKey(first: string, second: string | null): string {
  return `${first}\u0000${second}`
}

function containsAll<T>(a: readonly T[], b: readonly T[]): boolean {
  return b.every((it) => a.includes(it))
}

// @Service
component(BookPageEditor, {
  inject: [
    BookAnalyzer,
    FileSystemScanner,
    BookRepository,
    MediaRepository,
    LibraryRepository,
    PageHashRepository,
    TransactionTemplate,
    ApplicationEventPublisher,
    HistoricalEventRepository,
  ],
})
