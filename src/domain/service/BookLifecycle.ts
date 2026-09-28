// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/BookLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { fileReadBytes } from '../../port/java-io.js'
import { dirname } from 'node:path'
import type { Book } from '../model/Book.js'
import { BookAction } from '../model/BookAction.js'
import { BookWithMedia } from '../model/BookWithMedia.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { ImageConversionException, MediaNotReadyException, NoThumbnailFoundException } from '../model/Exceptions.js'
import { HistoricalEvent } from '../model/HistoricalEvent.js'
import type { KomgaUser } from '../model/KomgaUser.js'
import { MarkSelectedPreference } from '../model/MarkSelectedPreference.js'
import { Media } from '../model/Media.js'
import { MediaExtensionEpub } from '../model/MediaExtension.js'
import { MediaProfile } from '../model/MediaProfile.js'
import type { R2Progression } from '../model/R2Progression.js'
import { ReadProgress } from '../model/ReadProgress.js'
import { SearchCondition } from '../model/SearchCondition.js'
import { SearchContext } from '../model/SearchContext.js'
import { SearchOperator } from '../model/SearchOperator.js'
import { ThumbnailBook } from '../model/ThumbnailBook.js'
import { TypedBytes } from '../model/TypedBytes.js'
import { BookMetadataRepository } from '../persistence/BookMetadataRepository.js'
import { BookProjectionRepository } from '../persistence/BookProjectionRepository.js'
import { BookRepository } from '../persistence/BookRepository.js'
import { HistoricalEventRepository } from '../persistence/HistoricalEventRepository.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { MediaRepository } from '../persistence/MediaRepository.js'
import { ReadListRepository } from '../persistence/ReadListRepository.js'
import { ReadProgressRepository } from '../persistence/ReadProgressRepository.js'
import { ThumbnailBookRepository } from '../persistence/ThumbnailBookRepository.js'
import { KomgaSettingsProvider } from '../../infrastructure/configuration/KomgaSettingsProvider.js'
import { Hasher } from '../../infrastructure/hash/Hasher.js'
import { KoreaderHasher } from '../../infrastructure/hash/KoreaderHasher.js'
import { ImageConverter } from '../../infrastructure/image/ImageConverter.js'
import { ImageType } from '../../infrastructure/image/ImageType.js'
import { uriToFilePath, urlToPath } from '../../port/java.js'
import { IllegalArgumentException, IndexOutOfBoundsException, check, eq, isBlank, kFloat, mapNotNull, maxByOrNull, minByOrNull, nn, require } from '../../port/kotlin.js'
import { deleteIfExists, exists, isWritable, listDirectoryEntries, notExists } from '../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../port/logging.js'
import { Pageable } from '../../port/spring-data.js'
import { javaUrlDecode } from '../../port/spring-security-web.js'
import { TransactionTemplate } from '../../port/spring-tx.js'
import { ApplicationEventPublisher, type Token, component } from '../../port/spring.js'
import { BookAnalyzer } from './BookAnalyzer.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.BookLifecycle')

export class BookLifecycle {
  private readonly resizeTargetFormat = ImageType.JPEG

  constructor(
    private readonly bookRepository: BookRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly bookMetadataRepository: BookMetadataRepository,
    private readonly bookProjectionRepository: BookProjectionRepository,
    private readonly readProgressRepository: ReadProgressRepository,
    private readonly thumbnailBookRepository: ThumbnailBookRepository,
    private readonly readListRepository: ReadListRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly bookAnalyzer: BookAnalyzer,
    private readonly imageConverter: ImageConverter,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly transactionTemplate: TransactionTemplate,
    private readonly hasher: Hasher,
    private readonly hasherKoreader: KoreaderHasher,
    private readonly historicalEventRepository: HistoricalEventRepository,
    private readonly komgaSettingsProvider: KomgaSettingsProvider,
    // @Qualifier("pdfImageType")
    private readonly pdfImageType: ImageType,
  ) {}

  analyzeAndPersist(book: Book): Set<BookAction> {
    logger.info(() => `Analyze and persist book: ${book}`)
    const media = this.bookAnalyzer.analyze(book, this.libraryRepository.findById(book.libraryId).analyzeDimensions)

    this.transactionTemplate.executeWithoutResult(() => {
      // if the number of pages has changed, delete all read progress for that book
      const previous = this.mediaRepository.findById(book.id)
      if (previous.status === Media.Status.OUTDATED && previous.pageCount !== media.pageCount) {
        const adjustedProgress = this.readProgressRepository
          .findAllByBookId(book.id)
          .map((it) => it.copy({ page: it.completed ? media.pageCount : 1 }))
        if (adjustedProgress.length > 0) {
          logger.info(() => 'Number of pages differ, adjust read progress for book')
          this.readProgressRepository.save(adjustedProgress)
        }
      }

      this.mediaRepository.update(media)
    })

    this.eventPublisher.publishEvent(new DomainEvent.BookUpdated({ book: book }))

    return media.status === Media.Status.READY ? new Set([BookAction.GENERATE_THUMBNAIL, BookAction.REFRESH_METADATA]) : new Set()
  }

  hashAndPersist(book: Book): void {
    if (!this.libraryRepository.findById(book.libraryId).hashFiles)
      return logger.info(() => 'File hashing is disabled for the library, it may have changed since the task was submitted, skipping')

    logger.info(() => `Hash and persist book: ${book}`)
    if (isBlank(book.fileHash)) {
      const hash = this.hasher.computeHash(book.path)
      this.bookRepository.update(book.copy({ fileHash: hash }))
    } else {
      logger.info(() => 'Book already has a hash, skipping')
    }
  }

  hashKoreaderAndPersist(book: Book): void {
    if (!this.libraryRepository.findById(book.libraryId).hashKoreader)
      return logger.info(() => 'File hashing for Koreader is disabled for the library, it may have changed since the task was submitted, skipping')

    logger.info(() => `Hash Koreader and persist book: ${book}`)
    if (isBlank(book.fileHashKoreader)) {
      const hash = this.hasherKoreader.computeHash(book.path)
      this.bookRepository.update(book.copy({ fileHashKoreader: hash }))
    } else {
      logger.info(() => 'Book already has a Koreader hash, skipping')
    }
  }

  // PORT: async (BookAnalyzer.hashPages)
  async hashPagesAndPersist(book: Book): Promise<void> {
    if (!this.libraryRepository.findById(book.libraryId).hashPages)
      return logger.info(() => 'Page hashing is disabled for the library, it may have changed since the task was submitted, skipping')

    logger.info(() => `Hash and persist pages for book: ${book}`)

    this.mediaRepository.update(await this.bookAnalyzer.hashPages(new BookWithMedia({ book: book, media: this.mediaRepository.findById(book.id) })))
  }

  // PORT: async (BookAnalyzer.generateThumbnail)
  async generateThumbnailAndPersist(book: Book): Promise<void> {
    logger.info(() => `Generate thumbnail and persist for book: ${book}`)
    try {
      this.addThumbnailForBook(
        await this.bookAnalyzer.generateThumbnail(new BookWithMedia({ book: book, media: this.mediaRepository.findById(book.id) })),
        MarkSelectedPreference.IF_NONE_OR_GENERATED,
      )
    } catch (ex) {
      if (ex instanceof NoThumbnailFoundException) {
        logger.error(() => 'Error while creating thumbnail')
      } else {
        logger.error(ex as Error, () => 'Error while creating thumbnail')
      }
    }
  }

  addThumbnailForBook(thumbnail: ThumbnailBook, markSelected: MarkSelectedPreference): ThumbnailBook {
    switch (thumbnail.type) {
      case ThumbnailBook.Type.GENERATED: {
        // only one generated thumbnail is allowed
        this.thumbnailBookRepository.deleteByBookIdAndType(thumbnail.bookId, ThumbnailBook.Type.GENERATED)
        this.thumbnailBookRepository.insert(thumbnail.copy({ selected: false }))
        break
      }

      case ThumbnailBook.Type.SIDECAR: {
        // delete existing thumbnail with the same url
        this.thumbnailBookRepository
          .findAllByBookIdAndType(thumbnail.bookId, new Set([ThumbnailBook.Type.SIDECAR]))
          .filter((it) => eq(it.url, thumbnail.url))
          .forEach((it) => {
            this.thumbnailBookRepository.delete(it.id)
          })
        this.thumbnailBookRepository.insert(thumbnail.copy({ selected: false }))
        break
      }

      case ThumbnailBook.Type.USER_UPLOADED: {
        this.thumbnailBookRepository.insert(thumbnail.copy({ selected: false }))
        break
      }
    }

    let selected: boolean
    switch (markSelected) {
      case MarkSelectedPreference.YES:
        selected = true
        break
      case MarkSelectedPreference.IF_NONE_OR_GENERATED: {
        const selectedThumbnail = this.thumbnailBookRepository.findSelectedByBookIdOrNull(thumbnail.bookId)
        selected = selectedThumbnail === null || selectedThumbnail.type === ThumbnailBook.Type.GENERATED
        break
      }

      case MarkSelectedPreference.NO:
      default:
        selected = false
    }

    if (selected) this.thumbnailBookRepository.markSelected(thumbnail)
    else this.thumbnailsHouseKeeping(thumbnail.bookId)

    const newThumbnail = thumbnail.copy({ selected: selected })
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailBookAdded({ thumbnail: newThumbnail }))
    return newThumbnail
  }

  deleteThumbnailForBook(thumbnail: ThumbnailBook): void {
    require(thumbnail.type === ThumbnailBook.Type.USER_UPLOADED, () => 'Only uploaded thumbnails can be deleted')
    this.thumbnailBookRepository.delete(thumbnail.id)
    this.thumbnailsHouseKeeping(thumbnail.bookId)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailBookDeleted({ thumbnail: thumbnail }))
  }

  getThumbnail(bookId: string): ThumbnailBook | null {
    const selected = this.thumbnailBookRepository.findSelectedByBookIdOrNull(bookId)

    if (selected === null || !selected.exists()) {
      this.thumbnailsHouseKeeping(bookId)
      return this.thumbnailBookRepository.findSelectedByBookIdOrNull(bookId)
    }

    return selected
  }

  // PORT: async (ImageConverter.resizeImageToByteArray)
  async getThumbnailBytes(bookId: string, resizeTo: number | null = null): Promise<TypedBytes | null> {
    const it = this.getThumbnail(bookId)
    if (it !== null) {
      let thumbnailBytes: Uint8Array
      if (it.thumbnail !== null) thumbnailBytes = it.thumbnail
      else if (it.url !== null) thumbnailBytes = fileReadBytes(uriToFilePath(it.url)) // PORT: File(uri).readBytes() : FileNotFoundException comme la JVM
      else return null

      if (resizeTo !== null) {
        try {
          return new TypedBytes({
            bytes: await this.imageConverter.resizeImageToByteArray(thumbnailBytes, this.resizeTargetFormat, resizeTo),
            mediaType: this.resizeTargetFormat.mediaType,
          })
        } catch (e) {
          logger.error(e as Error, () => `Resize thumbnail of book ${bookId} to ${resizeTo}: failed`)
        }
      }

      return new TypedBytes({ bytes: thumbnailBytes, mediaType: it.mediaType })
    }
    return null
  }

  // PORT: async (getThumbnailBytes)
  async getThumbnailBytesOriginal(bookId: string): Promise<TypedBytes | null> {
    const thumbnail = this.getThumbnail(bookId)
    if (thumbnail === null) return null
    if (thumbnail.type === ThumbnailBook.Type.GENERATED) {
      const book = this.bookRepository.findByIdOrNull(bookId)
      if (book === null) return null
      const media = this.mediaRepository.findById(book.id)
      return this.bookAnalyzer.getPoster(new BookWithMedia({ book: book, media: media }))
    } else {
      return await this.getThumbnailBytes(bookId)
    }
  }

  getThumbnailBytesByThumbnailId(thumbnailId: string): TypedBytes | null {
    const thumbnail = this.thumbnailBookRepository.findByIdOrNull(thumbnailId)
    if (thumbnail === null) return null
    const bytes = this.getBytesFromThumbnailBook(thumbnail)
    return bytes !== null ? new TypedBytes({ bytes: bytes, mediaType: thumbnail.mediaType }) : null
  }

  private getBytesFromThumbnailBook(thumbnail: ThumbnailBook): Uint8Array | null {
    if (thumbnail.thumbnail !== null) return thumbnail.thumbnail
    else if (thumbnail.url !== null) return fileReadBytes(uriToFilePath(thumbnail.url)) // PORT: File(uri).readBytes() : FileNotFoundException comme la JVM
    else return null
  }

  private thumbnailsHouseKeeping(bookId: string): void {
    logger.info(() => `House keeping thumbnails for book: ${bookId}`)
    const all = mapNotNull(this.thumbnailBookRepository.findAllByBookId(bookId), (it) => {
      if (!it.exists()) {
        logger.warn(() => "Thumbnail doesn't exist, removing entry")
        this.thumbnailBookRepository.delete(it.id)
        return null
      } else {
        return it
      }
    })

    const selected = all.filter((it) => it.selected)
    if (selected.length > 1) {
      logger.info(() => 'More than one thumbnail is selected, removing extra ones')
      this.thumbnailBookRepository.markSelected(nn(selected[0]))
    } else if (selected.length === 0 && all.length > 0) {
      logger.info(() => 'Book has no selected thumbnail, choosing one automatically')
      this.thumbnailBookRepository.markSelected(nn(all[0]))
    }
  }

  findBookThumbnailsToRegenerate(forBiggerResultOnly: boolean): string[] {
    if (forBiggerResultOnly) {
      return this.thumbnailBookRepository.findAllBookIdsByThumbnailTypeAndDimensionSmallerThan(ThumbnailBook.Type.GENERATED, this.komgaSettingsProvider.thumbnailSize.maxEdge)
    } else {
      return this.bookRepository
        .findAll(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }), SearchContext.empty(), Pageable.unpaged())
        .content.map((it) => it.id)
    }
  }

  // @Throws(ImageConversionException::class, MediaNotReadyException::class, IndexOutOfBoundsException::class)
  // PORT: async (ImageConverter.resizeImageToByteArray / convertImage)
  async getBookPage(
    book: Book,
    number: number,
    { convertTo = null, resizeTo = null }: { convertTo?: ImageType | null; resizeTo?: number | null } = {},
  ): Promise<TypedBytes> {
    const media = this.mediaRepository.findById(book.id)
    const pageContent = this.bookAnalyzer.getPageContent(new BookWithMedia({ book: book, media: media }), number)
    const pageMediaType = media.profile === MediaProfile.PDF ? this.pdfImageType.mediaType : nn(media.pages[number - 1]).mediaType

    if (resizeTo !== null) {
      let convertedPage: Uint8Array
      try {
        convertedPage = await this.imageConverter.resizeImageToByteArray(pageContent, this.resizeTargetFormat, resizeTo)
      } catch (e) {
        logger.error(e as Error, () => `Resize page #${number} of book ${book} to ${resizeTo}: failed`)
        throw e
      }
      return new TypedBytes({ bytes: convertedPage, mediaType: this.resizeTargetFormat.mediaType })
    } else {
      if (convertTo !== null) {
        const it = convertTo
        // PORT: bloc `convertTo?.let { ... return@let }` -> bloc conditionnel (return@let = sortie du bloc)
        convert: {
          const msg = `Convert page #${number} of book ${book} from ${pageMediaType} to ${it.mediaType}`
          if (!this.imageConverter.supportedReadMediaTypes.includes(pageMediaType)) {
            throw new ImageConversionException(`${msg}: unsupported read format ${pageMediaType}`)
          }
          if (!this.imageConverter.supportedWriteMediaTypes.includes(it.mediaType)) {
            throw new ImageConversionException(`${msg}: unsupported write format ${it.mediaType}`)
          }
          if (pageMediaType === it.mediaType) {
            logger.warn(() => `${msg}: same format, no need for conversion`)
            break convert
          }

          logger.info(() => msg)
          let convertedPage: Uint8Array
          try {
            convertedPage = await this.imageConverter.convertImage(pageContent, it.imageIOFormat)
          } catch (e) {
            logger.error(e as Error, () => `${msg}: conversion failed`)
            throw e
          }
          return new TypedBytes({ bytes: convertedPage, mediaType: it.mediaType })
        }
      }

      return new TypedBytes({ bytes: pageContent, mediaType: pageMediaType })
    }
  }

  deleteOne(book: Book): void {
    logger.info(() => `Delete book id: ${book.id}`)

    this.transactionTemplate.executeWithoutResult(() => {
      this.readProgressRepository.deleteByBookId(book.id)
      this.readListRepository.removeBookFromAll(book.id)

      this.mediaRepository.delete(book.id)
      this.thumbnailBookRepository.deleteByBookId(book.id)
      this.bookMetadataRepository.delete(book.id)
      this.bookProjectionRepository.delete(book.id)

      this.bookRepository.delete(book.id)
    })

    this.eventPublisher.publishEvent(new DomainEvent.BookDeleted({ book: book }))
  }

  softDeleteMany(books: Book[]): void {
    logger.info(() => `Soft delete books: ${strList(books)}`)
    const deletedDate = LocalDateTime.now()
    this.bookRepository.update(books.map((it) => it.copy({ deletedDate: deletedDate })))

    books.forEach((it) => this.eventPublisher.publishEvent(new DomainEvent.BookUpdated({ book: it })))
  }

  deleteMany(books: Book[]): void {
    const bookIds = books.map((it) => it.id)
    logger.info(() => `Delete book ids: ${strList(bookIds)}`)

    this.transactionTemplate.executeWithoutResult(() => {
      this.readProgressRepository.deleteByBookIds(bookIds)
      this.readListRepository.removeBooksFromAll(bookIds)

      this.mediaRepository.delete(bookIds)
      this.thumbnailBookRepository.deleteByBookIds(bookIds)
      this.bookMetadataRepository.delete(bookIds)
      this.bookProjectionRepository.delete(bookIds)

      this.bookRepository.delete(bookIds)
    })

    books.forEach((it) => this.eventPublisher.publishEvent(new DomainEvent.BookDeleted({ book: it })))
  }

  markReadProgress(book: Book, user: KomgaUser, page: number): void {
    const media = this.mediaRepository.findById(book.id)
    require(page >= 1 && page <= media.pageCount, () => `Page argument (${page}) must be within 1 and book page count (${media.pageCount})`)

    let locator = null
    if (media.profile === MediaProfile.EPUB) {
      require(media.epubDivinaCompatible, () => 'epub book is not Divina compatible')

      const ext = this.mediaRepository.findExtensionByIdOrNull(book.id)
      if (!(ext instanceof MediaExtensionEpub)) {
        const e = new IllegalArgumentException('Epub extension not found')
        logger.error(() => `Epub extension not found for book ${book.id}. Book should be re-analyzed.`)
        throw e
      }
      const extension = ext
      // PORT: List.get hors limites -> IndexOutOfBoundsException
      locator = elementAt(extension.positions, page - 1)
    } else {
      locator = null
    }

    const progress = new ReadProgress({ bookId: book.id, userId: user.id, page: page, completed: page === media.pageCount, locator: locator })

    this.readProgressRepository.save(progress)
    this.eventPublisher.publishEvent(new DomainEvent.ReadProgressChanged({ progress: progress }))
  }

  markReadProgressCompleted(bookId: string, user: KomgaUser): void {
    const media = this.mediaRepository.findById(bookId)

    const progress = new ReadProgress({ bookId: bookId, userId: user.id, page: media.pageCount, completed: true })
    this.readProgressRepository.save(progress)
    this.eventPublisher.publishEvent(new DomainEvent.ReadProgressChanged({ progress: progress }))
  }

  deleteReadProgress(book: Book, user: KomgaUser): void {
    const progress = this.readProgressRepository.findByBookIdAndUserIdOrNull(book.id, user.id)
    if (progress !== null) {
      this.readProgressRepository.delete(book.id, user.id)
      this.eventPublisher.publishEvent(new DomainEvent.ReadProgressDeleted({ progress: progress }))
    }
  }

  markProgression(book: Book, user: KomgaUser, newProgression: R2Progression): void {
    const savedProgress = this.readProgressRepository.findByBookIdAndUserIdOrNull(book.id, user.id)
    if (savedProgress !== null) {
      check(newProgression.modified.withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime().isAfter(savedProgress.readDate), () => 'Progression is older than existing')
    }

    const media = this.mediaRepository.findById(book.id)
    // PORT: requireNotNull(x) { msg } -> require(x !== null) { msg }
    require(media.profile !== null, () => 'Media has no profile')
    let progress: ReadProgress
    switch (nn(media.profile)) {
      case MediaProfile.DIVINA:
      case MediaProfile.PDF: {
        const position = newProgression.locator.locations?.position ?? null
        require(position !== null && position >= 1 && position <= media.pageCount, () => `Page argument (${newProgression.locator.locations?.position ?? null}) must be within 1 and book page count (${media.pageCount})`)
        progress = new ReadProgress({
          bookId: book.id,
          userId: user.id,
          page: nn(nn(newProgression.locator.locations).position),
          completed: nn(newProgression.locator.locations).position === media.pageCount,
          readDate: newProgression.modified.withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime(),
          deviceId: newProgression.device.id,
          deviceName: newProgression.device.name,
          locator: newProgression.locator,
        })
        break
      }

      case MediaProfile.EPUB:
      default: {
        const href = javaUrlDecode(removeSuffix(replaceAfter(newProgression.locator.href, '#', ''), '#'))
        require(
          media.files.map((it) => it.fileName).includes(href),
          () => `Resource does not exist in book: ${href}`,
        )
        // PORT: requireNotNull(x) { msg } -> require(x !== null) { msg }
        require((newProgression.locator.locations?.progression ?? null) !== null, () => 'location.progression is required')

        const ext = this.mediaRepository.findExtensionByIdOrNull(book.id)
        if (!(ext instanceof MediaExtensionEpub)) {
          const e = new IllegalArgumentException('Epub extension not found')
          logger.error(() => `Epub extension not found for book ${book.id}. Book should be re-analyzed.`)
          throw e
        }
        const extension = ext
        // match progression with positions
        const matchingPositions = extension.positions.filter((it) => it.href === href)
        const newProg = nn(nn(newProgression.locator.locations).progression)
        let matchedPosition
        if (extension.isFixedLayout && matchingPositions.length === 1) {
          matchedPosition = nn(matchingPositions[0])
        } else {
          matchedPosition =
            matchingPositions.find((it) => nn(it.locations).progression === newProg) ??
            (() => {
              // no exact match
              const before = maxByOrNull(
                matchingPositions.filter((it) => nn(nn(it.locations).progression) < newProg),
                (it) => nn(nn(it.locations).position),
              )
              const after = minByOrNull(
                matchingPositions.filter((it) => nn(nn(it.locations).progression) > newProg),
                (it) => nn(nn(it.locations).position),
              )
              if (before === null || after === null || nn(nn(before.locations).position) > nn(nn(after.locations).position))
                throw new IllegalArgumentException('Invalid progression')
              return before
            })()
        }

        const totalProgression = matchedPosition.locations?.totalProgression ?? null
        progress = new ReadProgress({
          bookId: book.id,
          userId: user.id,
          // PORT: Int * Float -> Float (float32), puis roundToInt()
          page: totalProgression !== null ? roundToInt(kFloat(media.pageCount * totalProgression)) : 0,
          completed: totalProgression !== null ? totalProgression >= kFloat(0.99) : false,
          readDate: newProgression.modified.withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime(),
          deviceId: newProgression.device.id,
          deviceName: newProgression.device.name,
          locator: newProgression.locator.copy({
            // use the type we have instead of the one provided
            type: matchedPosition.type,
            // if no koboSpan is provided, use the one we matched
            koboSpan: newProgression.locator.koboSpan ?? matchedPosition.koboSpan,
            // don't trust the provided total progression, the one from Kobo can be wrong
            locations: newProgression.locator.locations?.copy({ totalProgression: totalProgression }) ?? null,
          }),
        })
      }
    }

    this.readProgressRepository.save(progress)
    this.eventPublisher.publishEvent(new DomainEvent.ReadProgressChanged({ progress: progress }))
  }

  deleteBookFiles(book: Book): void {
    if (notExists(book.path)) return logger.info(() => `Cannot delete book file, path does not exist: ${book.path}`)
    if (!isWritable(book.path)) return logger.info(() => `Cannot delete book file, path is not writable: ${book.path}`)

    const thumbnails = mapNotNull(this.thumbnailBookRepository.findAllByBookIdAndType(book.id, new Set([ThumbnailBook.Type.SIDECAR])), (it) =>
      it.url !== null ? urlToPath(it.url) : null,
    ).filter((it) => exists(it) && isWritable(it))

    if (deleteIfExists(book.path)) {
      logger.info(() => `Deleted file: ${book.path}`)
      this.historicalEventRepository.insert(new HistoricalEvent.BookFileDeleted({ book: book, reason: 'File was deleted by user request' }))
    }
    thumbnails.forEach((it) => {
      if (deleteIfExists(it)) logger.info(() => `Deleted file: ${it}`)
    })

    if (listDirectoryEntries(dirname(book.path)).length === 0)
      if (deleteIfExists(dirname(book.path))) {
        logger.info(() => `Deleted directory: ${dirname(book.path)}`)
        this.historicalEventRepository.insert(
          new HistoricalEvent.SeriesFolderDeleted({ seriesId: book.seriesId, seriesPath: dirname(book.path), reason: 'Folder was deleted because it was empty' }),
        )
      }

    this.softDeleteMany([book])
  }
}

/** Affichage Kotlin d'une liste (`"$list"`) */
function strList(l: unknown[]): string {
  return `[${l.map((it) => String(it)).join(', ')}]`
}

/** `list[index]` : IndexOutOfBoundsException hors limites */
function elementAt<T>(l: readonly T[], index: number): T {
  if (index < 0 || index >= l.length) throw new IndexOutOfBoundsException(`Index ${index} out of bounds for length ${l.length}`)
  return l[index] as T
}

/** `String.replaceAfter(delimiter, replacement)` */
function replaceAfter(s: string, delimiter: string, replacement: string): string {
  const i = s.indexOf(delimiter)
  return i === -1 ? s : s.substring(0, i + delimiter.length) + replacement
}

/** `String.removeSuffix(suffix)` */
function removeSuffix(s: string, suffix: string): string {
  return s.endsWith(suffix) ? s.substring(0, s.length - suffix.length) : s
}

/** `Float.roundToInt()` */
function roundToInt(x: number): number {
  if (Number.isNaN(x)) throw new IllegalArgumentException('Cannot round NaN value.')
  return Math.round(x)
}

// @Service
component(BookLifecycle, {
  // PORT: constructeur privé de l'enum ImageType : conversion explicite en jeton d'injection
  inject: [
    BookRepository,
    MediaRepository,
    BookMetadataRepository,
    BookProjectionRepository,
    ReadProgressRepository,
    ThumbnailBookRepository,
    ReadListRepository,
    LibraryRepository,
    BookAnalyzer,
    ImageConverter,
    ApplicationEventPublisher,
    TransactionTemplate,
    Hasher,
    KoreaderHasher,
    HistoricalEventRepository,
    KomgaSettingsProvider,
    { type: ImageType as unknown as Token, qualifier: 'pdfImageType' },
  ],
})
