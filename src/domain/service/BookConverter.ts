// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/BookConverter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { dirname, join } from 'node:path'
import type { Book } from '../model/Book.js'
import { restoreHashFrom } from '../model/BookPage.js'
import { BookWithMedia } from '../model/BookWithMedia.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { BookConversionException, MediaNotReadyException, MediaUnsupportedException } from '../model/Exceptions.js'
import { HistoricalEvent } from '../model/HistoricalEvent.js'
import type { Library } from '../model/Library.js'
import { Media } from '../model/Media.js'
import { MediaType } from '../model/MediaType.js'
import { BookRepository } from '../persistence/BookRepository.js'
import { HistoricalEventRepository } from '../persistence/HistoricalEventRepository.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { MediaRepository } from '../persistence/MediaRepository.js'
import { notEquals } from '../../language/LanguageUtils.js'
import { FilenameUtils } from '../../port/commons-io.js'
import { useAsync } from '../../port/java-io.js'
import { IllegalStateException, str } from '../../port/kotlin.js'
import {
  FileAlreadyExistsException,
  FileNotFoundException,
  deleteIfExists,
  exists,
  extension,
  moveTo,
  nameWithoutExtension,
  notExists,
} from '../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../port/logging.js'
import { TransactionTemplate } from '../../port/spring-tx.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { Deflater, ZipArchiveOutputStream, zipArchiveEntry } from '../../port/zip-output.js'
import { BookAnalyzer } from './BookAnalyzer.js'
import { FileSystemScanner } from './FileSystemScanner.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.BookConverter')

export const CBZ_EXTENSION = 'cbz'

export class BookConverter {
  private readonly convertibleTypes = [MediaType.RAR_4.type, MediaType.RAR_5.type]

  private readonly mediaTypeToExtension = new Map(
    [MediaType.RAR_4, MediaType.RAR_5, MediaType.ZIP, MediaType.PDF, MediaType.EPUB].map((it) => [it.type, it.fileExtension] as [string, string]),
  )

  private readonly failedConversions: string[] = []
  private readonly skippedRepairs: string[] = []

  constructor(
    private readonly bookAnalyzer: BookAnalyzer,
    private readonly fileSystemScanner: FileSystemScanner,
    private readonly bookRepository: BookRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly transactionTemplate: TransactionTemplate,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly historicalEventRepository: HistoricalEventRepository,
  ) {}

  getConvertibleBooks(library: Library): Book[] {
    if (library.convertToCbz) {
      const it = this.bookRepository.findAllByLibraryIdAndMediaTypes(library.id, this.convertibleTypes)
      logger.info(() => `Found ${it.length} books to convert`)
      return it
    } else {
      logger.info(() => 'CBZ conversion is not enabled, skipping')
      return []
    }
  }

  // PORT: async (BookAnalyzer.getFileContent, BookAnalyzer.analyze)
  async convertToCbz(book: Book): Promise<void> {
    // perform various checks
    if (!this.libraryRepository.findById(book.libraryId).convertToCbz)
      return logger.info(() => 'Book conversion is disabled for the library, it may have changed since the task was submitted, skipping')

    if (this.failedConversions.includes(book.id)) return logger.info(() => 'Book conversion already failed before, skipping')

    const scannedBook = this.fileSystemScanner.scanFile(book.path)
    if (scannedBook !== null) {
      if (notEquals(scannedBook.fileLastModified, book.fileLastModified)) return logger.info(() => 'Book has changed on disk, skipping')
    } else throw new FileNotFoundException(`File not found: ${book.path}`)

    const media = this.mediaRepository.findById(book.id)

    if (!this.convertibleTypes.includes(media.mediaType as string))
      throw new MediaUnsupportedException(`${str(media.mediaType)} cannot be converted. Must be one of ${str(this.convertibleTypes)}`)

    if (media.status !== Media.Status.READY) throw new MediaNotReadyException()

    // perform conversion
    const destinationFilename = `${nameWithoutExtension(book.path)}.${CBZ_EXTENSION}`
    const destinationPath = join(dirname(book.path), destinationFilename)
    if (exists(destinationPath)) throw new FileAlreadyExistsException(`Destination file already exists: ${destinationPath}`)

    logger.info(() => `Copying archive content to ${destinationPath}`)
    await useAsync(new ZipArchiveOutputStream(destinationPath), async (zipStream) => {
      zipStream.setMethod(ZipArchiveOutputStream.DEFLATED)
      zipStream.setLevel(Deflater.NO_COMPRESSION)

      // PORT: forEach -> for..of (lecture asynchrone de chaque entrée)
      for (const entry of new Set([...media.pages.map((it) => it.fileName), ...media.files.map((it) => it.fileName)])) {
        zipStream.putArchiveEntry(zipArchiveEntry(entry))
        zipStream.write(await this.bookAnalyzer.getFileContent(new BookWithMedia({ book: book, media: media }), entry))
        zipStream.closeArchiveEntry()
      }
    })

    // perform checks on new file
    const convertedBook =
      this.fileSystemScanner.scanFile(destinationPath)?.copy({
        id: book.id,
        seriesId: book.seriesId,
        libraryId: book.libraryId,
      }) ?? null
    if (convertedBook === null) throw new IllegalStateException(`Newly converted book could not be scanned: ${destinationFilename}`)

    const convertedMedia = await this.bookAnalyzer.analyze(convertedBook, this.libraryRepository.findById(book.libraryId).analyzeDimensions)

    try {
      if (convertedMedia.status !== Media.Status.READY) throw new BookConversionException('Converted file could not be analyzed, aborting conversion')
      else if (convertedMedia.mediaType !== MediaType.ZIP.type) throw new BookConversionException('Converted file is not a zip file, aborting conversion')
      else if (
        // PORT: Pair(nom, mediaType) -> clé chaîne pour containsAll
        !containsAll(
          convertedMedia.pages.map((it) => pairKey(FilenameUtils.getName(it.fileName), it.mediaType)),
          media.pages.map((it) => pairKey(FilenameUtils.getName(it.fileName), it.mediaType)),
        )
      )
        throw new BookConversionException('Converted file does not contain all pages from existing file, aborting conversion')
      else if (
        !containsAll(
          convertedMedia.files.map((it) => FilenameUtils.getName(it.fileName)),
          media.files.map((it) => FilenameUtils.getName(it.fileName)),
        )
      )
        throw new BookConversionException('Converted file does not contain all files from existing file, aborting conversion')
    } catch (e) {
      if (e instanceof BookConversionException) {
        deleteIfExists(destinationPath)
        this.failedConversions.push(book.id)
      }
      throw e
    }

    if (deleteIfExists(book.path)) {
      logger.info(() => `Deleted old file: ${book.path}`)
      this.historicalEventRepository.insert(new HistoricalEvent.BookFileDeleted({ book: book, reason: 'File was deleted after conversion to CBZ' }))
    }

    const mediaWithHashes = convertedMedia.copy({ pages: restoreHashFrom(convertedMedia.pages, media.pages) })

    this.transactionTemplate.executeWithoutResult(() => {
      this.bookRepository.update(convertedBook)
      this.mediaRepository.update(mediaWithHashes)
    })

    this.historicalEventRepository.insert(new HistoricalEvent.BookConverted({ book: convertedBook, previous: book }))
    this.eventPublisher.publishEvent(new DomainEvent.BookUpdated({ book: convertedBook }))
  }

  getMismatchedExtensionBooks(library: Library): Book[] {
    return [...this.mediaTypeToExtension].flatMap(([mediaType, extension]) =>
      this.bookRepository.findAllByLibraryIdAndMismatchedExtension(library.id, mediaType, extension),
    )
  }

  repairExtension(book: Book): void {
    if (!this.libraryRepository.findById(book.libraryId).repairExtensions)
      return logger.info(() => 'Repair extensions is disabled for the library, it may have changed since the task was submitted, skipping')

    if (this.skippedRepairs.includes(book.id)) return logger.info(() => 'Extension repair has already been skipped before, skipping')

    if (notExists(book.path)) throw new FileNotFoundException(`File not found: ${book.path}`)

    const media = this.mediaRepository.findById(book.id)

    if (!this.mediaTypeToExtension.has(media.mediaType as string))
      throw new MediaUnsupportedException(`${str(media.mediaType)} cannot be repaired. Must be one of ${str([...this.mediaTypeToExtension.keys()])}`)

    if (extension(book.path).toLowerCase() === 'epub' && media.mediaType === MediaType.ZIP.type) {
      this.skippedRepairs.push(book.id)
      logger.info(() => `EPUB file detected as zip should not be repaired, skipping: ${book.path}`)
      return
    }

    const actualExtension = extension(book.path)
    const correctExtension = this.mediaTypeToExtension.get(media.mediaType as string) ?? null

    if (correctExtension === actualExtension) {
      logger.info(() => `MediaType (${str(media.mediaType)}) and extension (${actualExtension}) already match, skipping`)
      this.skippedRepairs.push(book.id)
    }

    const destinationFilename = `${nameWithoutExtension(book.path)}.${str(correctExtension)}`
    const destinationPath = join(dirname(book.path), destinationFilename)
    if (exists(destinationPath)) throw new FileAlreadyExistsException(`Destination file already exists: ${destinationPath}`)

    logger.info(() => `Renaming ${book.path} to ${destinationPath}`)
    moveTo(book.path, destinationPath)

    const repairedBook =
      this.fileSystemScanner.scanFile(destinationPath)?.copy({
        id: book.id,
        seriesId: book.seriesId,
        libraryId: book.libraryId,
      }) ?? null
    if (repairedBook === null) throw new IllegalStateException(`Repaired book could not be scanned: ${destinationFilename}`)

    this.bookRepository.update(repairedBook)
  }
}

function pairKey(first: string, second: string | null): string {
  return `${first}\u0000${second}`
}

function containsAll<T>(a: readonly T[], b: readonly T[]): boolean {
  return b.every((it) => a.includes(it))
}

// @Service
component(BookConverter, {
  inject: [
    BookAnalyzer,
    FileSystemScanner,
    BookRepository,
    MediaRepository,
    LibraryRepository,
    TransactionTemplate,
    ApplicationEventPublisher,
    HistoricalEventRepository,
  ],
})
