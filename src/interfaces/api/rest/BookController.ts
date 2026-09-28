// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/BookController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDate, ZoneOffset } from '@js-joda/core'
import { HIGHEST_PRIORITY, HIGH_PRIORITY, LOWEST_PRIORITY } from '../../../application/tasks/Task.js'
import { TaskEmitter } from '../../../application/tasks/TaskEmitter.js'
import { BookSearch } from '../../../domain/model/BookSearch.js'
import { Dimension } from '../../../domain/model/Dimension.js'
import { DomainEvent } from '../../../domain/model/DomainEvent.js'
import { EntityNotFoundException, ImageConversionException, MediaNotReadyException } from '../../../domain/model/Exceptions.js'
import { MarkSelectedPreference } from '../../../domain/model/MarkSelectedPreference.js'
import { Media } from '../../../domain/model/Media.js'
import { MediaExtensionEpub } from '../../../domain/model/MediaExtension.js'
import { MediaProfile } from '../../../domain/model/MediaProfile.js'
import { ReadStatus } from '../../../domain/model/ReadStatus.js'
import { SearchCondition } from '../../../domain/model/SearchCondition.js'
import { SearchContext } from '../../../domain/model/SearchContext.js'
import { SearchOperator } from '../../../domain/model/SearchOperator.js'
import { ThumbnailBook } from '../../../domain/model/ThumbnailBook.js'
import { BookMetadataRepository } from '../../../domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../domain/persistence/BookRepository.js'
import { MediaRepository } from '../../../domain/persistence/MediaRepository.js'
import { ReadListRepository } from '../../../domain/persistence/ReadListRepository.js'
import { ThumbnailBookRepository } from '../../../domain/persistence/ThumbnailBookRepository.js'
import { BookAnalyzer } from '../../../domain/service/BookAnalyzer.js'
import { BookLifecycle } from '../../../domain/service/BookLifecycle.js'
import { ImageAnalyzer } from '../../../infrastructure/image/ImageAnalyzer.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { PageableAsQueryParam, PageableWithoutSortAsQueryParam } from '../../../infrastructure/openapi/PageableAnnotations.js'
import { UnpagedSorted } from '../../../infrastructure/jooq/UnpagedSorted.js'
import { ContentDetector } from '../../../infrastructure/mediacontainer/ContentDetector.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { getMediaTypeOrDefault } from '../../../infrastructure/web/Utils.js'
import { registerClass } from '../../../port/jackson.js'
import { type JavaType, JsonTypes } from '../../../port/jackson-mapper.js'
import { ByteArrayInputStream } from '../../../port/java-io.js'
import { NoSuchFileException as NioNoSuchFileException } from '../../../port/java-nio-file.js'
import { distinct, IllegalArgumentException, IndexOutOfBoundsException, isNullOrBlank, isNullOrEmpty, mapNotNull, nn } from '../../../port/kotlin.js'
import { NoSuchFileException } from '../../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../../port/logging.js'
import { ParsedMediaType } from '../../../port/media-type.js'
import type { HttpServletRequest, MultipartFile } from '../../../port/servlet.js'
import { MultipartFile as MultipartFileClass } from '../../../port/servlet.js'
import { ApplicationEventPublisher } from '../../../port/spring.js'
import { Order, type Page, PageImpl, PageRequest, Pageable, Sort } from '../../../port/spring-data.js'
import {
  HttpStatus,
  MediaType,
  ResponseEntity,
  ResponseStatusException,
  type WebRequest,
  authenticationPrincipal,
  pageable,
  pathVariable,
  request as requestArg,
  requestBody,
  requestHeader,
  requestParam,
  restController,
  webRequest,
  withParameter,
} from '../../../port/spring-web.js'
import { ServletWebRequest } from '../../../port/spring-web-filter.js'
import { CommonBookController } from '../CommonBookController.js'
import { ContentRestrictionChecker } from '../ContentRestrictionChecker.js'
import { MEDIATYPE_DIVINA_JSON_VALUE, MEDIATYPE_POSITION_LIST_JSON, MEDIATYPE_POSITION_LIST_JSON_VALUE, MEDIATYPE_WEBPUB_JSON_VALUE } from '../dto/Constants.js'
import { WPPublicationDto } from '../dto/WepPub.js'
import { getBookLastModified, setNotModified } from '../Utils.js'
import { WebPubGenerator } from '../WebPubGenerator.js'
import { BookDtoRepository } from '../persistence/BookDtoRepository.js'
import { BookDto, restrictUrl } from './dto/BookDto.js'
import { BookImportBatchDto } from './dto/BookImportBatchDto.js'
import { BookMetadataUpdateDto, patch } from './dto/BookMetadataUpdateDto.js'
import { PageDto } from './dto/PageDto.js'
import { R2Positions } from './dto/R2Positions.js'
import { ReadListDto, toDto as readListToDto } from './dto/ReadListDto.js'
import { ReadProgressUpdateDto } from './dto/ReadProgressUpdateDto.js'
import { ThumbnailBookDto, toDto as thumbnailBookToDto } from './dto/ThumbnailBookDto.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.api.rest.BookController')

// PORT: java.nio.file.NoSuchFileException existe en deux classes de support (port/kotlin-io-path, port/java-nio-file)
function isNoSuchFileException(ex: unknown): boolean {
  return ex instanceof NoSuchFileException || ex instanceof NioNoSuchFileException
}

export class BookController {
  constructor(
    private readonly taskEmitter: TaskEmitter,
    private readonly bookAnalyzer: BookAnalyzer,
    private readonly bookLifecycle: BookLifecycle,
    private readonly bookRepository: BookRepository,
    private readonly bookMetadataRepository: BookMetadataRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly bookDtoRepository: BookDtoRepository,
    private readonly readListRepository: ReadListRepository,
    private readonly contentDetector: ContentDetector,
    private readonly imageAnalyzer: ImageAnalyzer,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly thumbnailBookRepository: ThumbnailBookRepository,
    private readonly webPubGenerator: WebPubGenerator,
    private readonly contentRestrictionChecker: ContentRestrictionChecker,
    private readonly commonBookController: CommonBookController,
  ) {}

  /** @deprecated use /v1/books/list instead */
  getAllBooksDeprecated(
    principal: KomgaPrincipal,
    searchTerm: string | null = null,
    libraryIds: string[] | null = null,
    mediaStatus: Media.Status[] | null = null,
    readStatus: ReadStatus[] | null = null,
    releasedAfter: LocalDate | null = null,
    tags: string[] | null = null,
    unpaged: boolean = false,
    page: Pageable,
  ): Page<BookDto> {
    const sort = page.sort.isSorted ? page.sort : !isNullOrBlank(searchTerm) ? Sort.by('relevance') : Sort.unsorted()

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    const conditions: SearchCondition.Book[] = []
    if (!isNullOrEmpty(libraryIds)) conditions.push(new SearchCondition.AnyOfBook({ conditions: libraryIds.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
    if (!isNullOrEmpty(mediaStatus)) conditions.push(new SearchCondition.AnyOfBook({ conditions: mediaStatus.map((it) => new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
    if (!isNullOrEmpty(readStatus)) conditions.push(new SearchCondition.AnyOfBook({ conditions: readStatus.map((it) => new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
    if (!isNullOrEmpty(tags)) conditions.push(new SearchCondition.AnyOfBook({ conditions: tags.map((it) => new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: it }) })) }))
    if (releasedAfter !== null) conditions.push(new SearchCondition.ReleaseDate({ operator: new SearchOperator.After({ dateTime: releasedAfter.atStartOfDay(ZoneOffset.UTC) }) }))
    const bookSearch = new BookSearch({
      condition: new SearchCondition.AllOfBook({ conditions: conditions }),
      fullTextSearch: searchTerm,
    })

    return this.bookDtoRepository.findAll(bookSearch, new SearchContext(principal.user), pageRequest).map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  getBooks(principal: KomgaPrincipal, search: BookSearch, unpaged: boolean = false, page: Pageable): Page<BookDto> {
    const sort = page.sort.isSorted ? page.sort : !isNullOrBlank(search.fullTextSearch) ? Sort.by('relevance') : Sort.unsorted()

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.bookDtoRepository.findAll(search, new SearchContext(principal.user), pageRequest).map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  getBooksLatest(principal: KomgaPrincipal, unpaged: boolean = false, page: Pageable): Page<BookDto> {
    const sort = Sort.by(Order.desc('lastModifiedDate'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.bookDtoRepository.findAll(new SearchContext(principal.user), pageRequest).map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  getBooksOnDeck(principal: KomgaPrincipal, libraryIds: string[] | null = null, page: Pageable): Page<BookDto> {
    return this.bookDtoRepository
      .findAllOnDeck(principal.user.id, principal.user.getAuthorizedLibraryIds(libraryIds), page, { restrictions: principal.user.restrictions })
      .map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  getBooksDuplicates(principal: KomgaPrincipal, unpaged: boolean = false, page: Pageable): Page<BookDto> {
    const sort = page.sort.isSorted ? page.sort : Sort.by(Order.asc('fileHash'))

    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.bookDtoRepository.findAllDuplicates(principal.user.id, pageRequest)
  }

  // @Throws(EntityNotFoundException::class)
  getBookById(principal: KomgaPrincipal, bookId: string): BookDto {
    const it = this.bookDtoRepository.findByIdOrNull(bookId, principal.user.id)
    if (it === null) throw new EntityNotFoundException()
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, it)

    return restrictUrl(it, !principal.user.isAdmin)
  }

  getBookSiblingPrevious(principal: KomgaPrincipal, bookId: string): BookDto {
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookId)

    const it = this.bookDtoRepository.findPreviousInSeriesOrNull(bookId, principal.user.id)
    return (it !== null ? restrictUrl(it, !principal.user.isAdmin) : null) ?? (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()
  }

  getBookSiblingNext(principal: KomgaPrincipal, bookId: string): BookDto {
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookId)

    const it = this.bookDtoRepository.findNextInSeriesOrNull(bookId, principal.user.id)
    return (it !== null ? restrictUrl(it, !principal.user.isAdmin) : null) ?? (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()
  }

  getReadListsByBookId(principal: KomgaPrincipal, bookId: string): ReadListDto[] {
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookId)

    return this.readListRepository.findAllContainingBookId(bookId, new SearchContext(principal.user)).map((it) => readListToDto(it))
  }

  // PORT: async (BookLifecycle.getThumbnailBytes)
  async getBookThumbnail(principal: KomgaPrincipal, bookId: string): Promise<Uint8Array> {
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookId)

    return (await this.bookLifecycle.getThumbnailBytes(bookId))?.bytes ?? (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()
  }

  getBookThumbnailById(principal: KomgaPrincipal, bookId: string, thumbnailId: string): Uint8Array {
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookId)
    this.contentRestrictionChecker.checkContentRestrictionBookThumbnail(principal.user, thumbnailId)

    return this.bookLifecycle.getThumbnailBytesByThumbnailId(thumbnailId)?.bytes ?? (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()
  }

  getBookThumbnails(principal: KomgaPrincipal, bookId: string): ThumbnailBookDto[] {
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookId)

    return this.thumbnailBookRepository.findAllByBookId(bookId).map((it) => thumbnailBookToDto(it))
  }

  addUserUploadedBookThumbnail(principal: KomgaPrincipal, bookId: string, file: MultipartFile, selected: boolean = true): ThumbnailBookDto {
    const book = this.bookRepository.findByIdOrNull(bookId) ?? (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()

    // PORT: file.inputStream.buffered().use { detectMediaType(it) } -> octets du fichier
    const mediaType = this.contentDetector.detectMediaType(file.bytes)
    if (!this.contentDetector.isImage(mediaType)) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE)

    return thumbnailBookToDto(
      this.bookLifecycle.addThumbnailForBook(
        new ThumbnailBook({
          bookId: book.id,
          thumbnail: file.bytes,
          type: ThumbnailBook.Type.USER_UPLOADED,
          selected: selected,
          fileSize: file.bytes.length,
          mediaType: mediaType,
          dimension: this.imageAnalyzer.getDimension(new ByteArrayInputStream(file.bytes)) ?? new Dimension({ width: 0, height: 0 }),
        }),
        selected ? MarkSelectedPreference.YES : MarkSelectedPreference.NO,
      ),
    )
  }

  markBookThumbnailSelected(principal: KomgaPrincipal, bookId: string, thumbnailId: string): void {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const poster = this.thumbnailBookRepository.findByIdOrNull(thumbnailId)
    if (poster === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (poster.bookId !== book.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    this.thumbnailBookRepository.markSelected(poster)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailBookAdded({ thumbnail: poster.copy({ selected: true }) }))
  }

  deleteUserUploadedBookThumbnail(principal: KomgaPrincipal, bookId: string, thumbnailId: string): void {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const poster = this.thumbnailBookRepository.findByIdOrNull(thumbnailId)
    if (poster === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (poster.bookId !== book.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    try {
      this.bookLifecycle.deleteThumbnailForBook(poster)
    } catch (e) {
      if (e instanceof IllegalArgumentException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      throw e
    }
  }

  getBookPages(principal: KomgaPrincipal, bookId: string): PageDto[] {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    const media = this.mediaRepository.findById(book.id)
    switch (media.status) {
      case Media.Status.UNKNOWN:
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book has not been analyzed yet')
      case Media.Status.OUTDATED:
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book is outdated and must be re-analyzed')

      case Media.Status.ERROR:
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book analysis failed')
      case Media.Status.UNSUPPORTED:
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book format is not supported')
      default: {
        // Media.Status.READY
        const pages = media.profile === MediaProfile.PDF ? this.bookAnalyzer.getPdfPagesDynamic(media) : media.pages
        return pages.map(
          (bookPage, index) =>
            new PageDto({
              number: index + 1,
              fileName: bookPage.fileName,
              mediaType: bookPage.mediaType,
              width: bookPage.dimension?.width ?? null,
              height: bookPage.dimension?.height ?? null,
              sizeBytes: bookPage.fileSize,
            }),
        )
      }
    }
  }

  // PORT: async (CommonBookController.getBookPageInternal) ; MutableList<MediaType> -> ParsedMediaType[]
  getBookPageByNumber(
    principal: KomgaPrincipal,
    request: ServletWebRequest,
    bookId: string,
    pageNumber: number,
    convertTo: string | null,
    zeroBasedIndex: boolean,
    acceptHeaders: ParsedMediaType[] | null,
    contentNegotiation: boolean,
  ): Promise<ResponseEntity<Uint8Array>> {
    return this.commonBookController.getBookPageInternal(bookId, zeroBasedIndex ? pageNumber + 1 : pageNumber, convertTo, request, principal, contentNegotiation ? acceptHeaders : null)
  }

  // PORT: async (BookLifecycle.getBookPage)
  async getBookPageThumbnailByNumber(principal: KomgaPrincipal, request: WebRequest, bookId: string, pageNumber: number): Promise<ResponseEntity<Uint8Array>> {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const media = this.mediaRepository.findById(bookId)
    if (request.checkNotModified(getBookLastModified(media))) {
      return setNotModified(ResponseEntity.status(HttpStatus.NOT_MODIFIED), media).body(new Uint8Array(0))
    }

    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    try {
      const pageContent = await this.bookLifecycle.getBookPage(book, pageNumber, { resizeTo: 300 })

      return setNotModified(ResponseEntity.ok().contentType(getMediaTypeOrDefault(pageContent.mediaType)), media).body(pageContent.bytes)
    } catch (ex) {
      if (ex instanceof IndexOutOfBoundsException) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'Page number does not exist')
      } else if (ex instanceof ImageConversionException) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, ex.message)
      } else if (ex instanceof MediaNotReadyException) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book analysis failed')
      } else if (isNoSuchFileException(ex)) {
        logger.warn(ex as Error, () => `File not found: ${book}`)
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'File not found, it may have moved')
      }
      throw ex
    }
  }

  getBookWebPubManifest(principal: KomgaPrincipal, bookId: string): ResponseEntity<WPPublicationDto> {
    const manifest = this.commonBookController.getWebPubManifestInternal(principal, bookId, this.webPubGenerator)
    return ResponseEntity.ok().contentType(manifest.mediaType).body(manifest)
  }

  getBookPositions(request: HttpServletRequest, principal: KomgaPrincipal, bookId: string): ResponseEntity<R2Positions> {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const media = this.mediaRepository.findById(book.id)

    if (new ServletWebRequest(request).checkNotModified(getBookLastModified(media))) {
      return setNotModified(ResponseEntity.status(HttpStatus.NOT_MODIFIED), media).body(null as unknown as R2Positions)
    }

    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    const ext = this.mediaRepository.findExtensionByIdOrNull(book.id)
    const extension = ext instanceof MediaExtensionEpub ? ext : (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()

    return setNotModified(ResponseEntity.ok().contentType(MEDIATYPE_POSITION_LIST_JSON), media).body(new R2Positions({ total: extension.positions.length, positions: extension.positions }))
  }

  getBookWebPubManifestEpub(principal: KomgaPrincipal, bookId: string): WPPublicationDto {
    return this.commonBookController.getWebPubManifestEpubInternal(principal, bookId, this.webPubGenerator)
  }

  getBookWebPubManifestPdf(principal: KomgaPrincipal, bookId: string): WPPublicationDto {
    return this.commonBookController.getWebPubManifestPdfInternal(principal, bookId, this.webPubGenerator)
  }

  getBookWebPubManifestDivina(principal: KomgaPrincipal, bookId: string): WPPublicationDto {
    return this.commonBookController.getWebPubManifestDivinaInternal(principal, bookId, this.webPubGenerator)
  }

  bookAnalyze(bookId: string): void {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.taskEmitter.analyzeBook(book, { priority: HIGH_PRIORITY })
  }

  bookRefreshMetadata(bookId: string): void {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.taskEmitter.refreshBookMetadata(book, { priority: HIGH_PRIORITY })
    this.taskEmitter.refreshBookLocalArtwork(book, { priority: HIGH_PRIORITY })
  }

  updateBookMetadata(bookId: string, newMetadata: BookMetadataUpdateDto): void {
    const existing = this.bookMetadataRepository.findByIdOrNull(bookId)
    if (existing === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const updated = patch(existing, newMetadata)
    this.bookMetadataRepository.update(updated)

    const updatedBook = this.bookRepository.findByIdOrNull(bookId)
    if (updatedBook !== null) {
      this.taskEmitter.aggregateSeriesMetadata(updatedBook.seriesId)
      this.eventPublisher.publishEvent(new DomainEvent.BookUpdated({ book: updatedBook }))
    }
  }

  updateBookMetadataByBatch(newMetadatas: Map<string, BookMetadataUpdateDto>): void {
    const updatedBooks = mapNotNull(newMetadatas, ([bookId, newMetadata]) => {
      const existing = this.bookMetadataRepository.findByIdOrNull(bookId)
      if (existing === null) return null
      const updated = patch(existing, newMetadata)
      this.bookMetadataRepository.update(updated)

      return this.bookRepository.findByIdOrNull(bookId)
    })

    updatedBooks.forEach((it) => this.eventPublisher.publishEvent(new DomainEvent.BookUpdated({ book: it })))
    distinct(updatedBooks.map((it) => it.seriesId)).forEach((it) => this.taskEmitter.aggregateSeriesMetadata(it))
  }

  markBookReadProgress(bookId: string, readProgress: ReadProgressUpdateDto, principal: KomgaPrincipal): void {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    try {
      if (readProgress.completed !== null && readProgress.completed) this.bookLifecycle.markReadProgressCompleted(book.id, principal.user)
      else this.bookLifecycle.markReadProgress(book, principal.user, nn(readProgress.page))
    } catch (e) {
      if (e instanceof IllegalArgumentException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      throw e
    }
  }

  deleteBookReadProgress(bookId: string, principal: KomgaPrincipal): void {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    this.bookLifecycle.deleteReadProgress(book, principal.user)
  }

  importBooks(bookImportBatch: BookImportBatchDto): void {
    bookImportBatch.books.forEach((it) => {
      try {
        this.taskEmitter.importBook(it.sourceFile, it.seriesId, bookImportBatch.copyMode, it.destinationName, it.upgradeBookId, { priority: HIGHEST_PRIORITY })
      } catch (e) {
        logger.error(e as Error, () => `Error while creating import task for: ${it}`)
      }
    })
  }

  deleteBookFile(bookId: string): void {
    this.taskEmitter.deleteBook(bookId, { priority: HIGHEST_PRIORITY })
  }

  booksRegenerateThumbnails(forBiggerResultOnly: boolean = false): void {
    this.taskEmitter.findBookThumbnailsToRegenerate(forBiggerResultOnly, { priority: LOWEST_PRIORITY })
  }
}

// PORT: noms qualifiés des enums convertis (messages d'erreur de conversion de Spring)
registerClass('org.gotson.komga.domain.model.Media$Status', Media.Status as never)
registerClass('org.gotson.komga.domain.model.ReadStatus', ReadStatus as never)

// PORT: org.springframework.http.MediaType (conversion String -> MediaType : MediaType.valueOf)
const MediaTypeParam: JavaType = {
  scalar: 'org.springframework.http.MediaType',
  read: (s: string) => ParsedMediaType.parse(s),
  write: (v: ParsedMediaType) => v.toString(),
}

// PORT: @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate (conversion par le formateur : message de ConversionFailedException)
const LocalDateIsoParam: JavaType = {
  scalar: 'LocalDate',
  read: (s: string) => {
    try {
      return LocalDate.parse(s)
    } catch {
      throw new IllegalArgumentException(
        `Failed to convert from type [java.lang.String] to type [@org.springframework.web.bind.annotation.RequestParam @org.springframework.format.annotation.DateTimeFormat java.time.LocalDate] for value [${s}]`,
      )
    }
  },
  write: (v: LocalDate) => v.toString(),
}

// @RestController
restController(BookController, {
  inject: [
    TaskEmitter,
    BookAnalyzer,
    BookLifecycle,
    BookRepository,
    BookMetadataRepository,
    MediaRepository,
    BookDtoRepository,
    ReadListRepository,
    ContentDetector,
    ImageAnalyzer,
    ApplicationEventPublisher,
    ThumbnailBookRepository,
    WebPubGenerator,
    ContentRestrictionChecker,
    CommonBookController,
  ],
  javaName: 'org.gotson.komga.interfaces.api.rest.BookController',
  requestMapping: { produces: [MediaType.APPLICATION_JSON_VALUE] },
  handlers: {
    getAllBooksDeprecated: {
      mapping: { method: 'GET', path: ['api/v1/books'] },
      args: [
        authenticationPrincipal(),
        requestParam('search', { nullable: 'String' }, { required: false, nullable: true }),
        requestParam('library_id', { nullable: { list: 'String' } }, { required: false, nullable: true }),
        requestParam('media_status', { nullable: { list: { enum: Media.Status } } }, { required: false, nullable: true }),
        requestParam('read_status', { nullable: { list: { enum: ReadStatus } } }, { required: false, nullable: true }),
        requestParam('released_after', { nullable: LocalDateIsoParam }, { required: false, nullable: true }),
        requestParam('tag', { nullable: { list: 'String' } }, { required: false, nullable: true }),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: BookDto }] },
      openapi: { operation: { summary: 'List books', description: 'Use POST /api/v1/books/list instead. Deprecated since 1.19.0.', tags: [OpenApiConfiguration.TagNames.BOOKS, OpenApiConfiguration.TagNames.DEPRECATED] }, deprecated: true, parameters: [...PageableAsQueryParam] },
    },
    getBooks: {
      mapping: { method: 'POST', path: ['api/v1/books/list'] },
      args: [authenticationPrincipal(), requestBody({ class: BookSearch }), requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }), withParameter(pageable(), { hidden: true })],
      signature:
        'public org.springframework.data.domain.Page<org.gotson.komga.interfaces.api.rest.dto.BookDto> org.gotson.komga.interfaces.api.rest.BookController.getBooks(org.gotson.komga.infrastructure.security.KomgaPrincipal,org.gotson.komga.domain.model.BookSearch,boolean,org.springframework.data.domain.Pageable)',
      returns: { class: PageImpl, args: [{ class: BookDto }] },
      openapi: { operation: { summary: 'List books', tags: [OpenApiConfiguration.TagNames.BOOKS] }, parameters: [...PageableAsQueryParam] },
    },
    getBooksLatest: {
      mapping: { method: 'GET', path: ['api/v1/books/latest'] },
      args: [authenticationPrincipal(), requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: BookDto }] },
      openapi: { operation: { summary: 'List latest books', description: 'Return newly added or updated books.', tags: [OpenApiConfiguration.TagNames.BOOKS] }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getBooksOnDeck: {
      mapping: { method: 'GET', path: ['api/v1/books/ondeck'] },
      args: [authenticationPrincipal(), requestParam('library_id', { nullable: { list: 'String' } }, { required: false, nullable: true }), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: BookDto }] },
      openapi: { operation: { summary: 'List books on deck', description: 'Return first unread book of series with at least one book read and no books in progress.', tags: [OpenApiConfiguration.TagNames.BOOKS] }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getBooksDuplicates: {
      mapping: { method: 'GET', path: ['api/v1/books/duplicates'] },
      preAuthorize: "hasRole('ADMIN')",
      args: [authenticationPrincipal(), requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: BookDto }] },
      openapi: { operation: { summary: 'List duplicate books', description: 'Return books that have the same file hash.', tags: [OpenApiConfiguration.TagNames.BOOKS] }, parameters: [...PageableAsQueryParam] },
    },
    getBookById: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}'] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: BookDto },
      openapi: { operation: { summary: 'Get book details', tags: [OpenApiConfiguration.TagNames.BOOKS] }, throws: [EntityNotFoundException] },
    },
    getBookSiblingPrevious: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/previous'] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: BookDto },
      openapi: { operation: { summary: 'Get previous book in series', tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    getBookSiblingNext: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/next'] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: BookDto },
      openapi: { operation: { summary: 'Get next book in series', tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    getReadListsByBookId: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/readlists'] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { list: { class: ReadListDto } },
      openapi: { operation: { summary: "List book's readlists", tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    getBookThumbnail: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/thumbnail'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: "Get book's poster image", tags: [OpenApiConfiguration.TagNames.BOOK_POSTER] }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getBookThumbnailById: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/thumbnails/{thumbnailId}'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId'), pathVariable('thumbnailId')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get book poster image', tags: [OpenApiConfiguration.TagNames.BOOK_POSTER] }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getBookThumbnails: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/thumbnails'], produces: [MediaType.APPLICATION_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { list: { class: ThumbnailBookDto } },
      openapi: { operation: { summary: 'List book posters', tags: [OpenApiConfiguration.TagNames.BOOK_POSTER] } },
    },
    addUserUploadedBookThumbnail: {
      mapping: { method: 'POST', path: ['api/v1/books/{bookId}/thumbnails'], consumes: [MediaType.MULTIPART_FORM_DATA_VALUE] },
      preAuthorize: "hasRole('ADMIN')",
      args: [authenticationPrincipal(), pathVariable('bookId'), requestParam('file', { class: MultipartFileClass }), requestParam('selected', 'Boolean', { hasDefault: true })],
      returns: { class: ThumbnailBookDto },
      openapi: { operation: { summary: 'Add book poster', tags: [OpenApiConfiguration.TagNames.BOOK_POSTER] } },
    },
    markBookThumbnailSelected: {
      mapping: { method: 'PUT', path: ['api/v1/books/{bookId}/thumbnails/{thumbnailId}/selected'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [authenticationPrincipal(), pathVariable('bookId'), pathVariable('thumbnailId')],
      openapi: { operation: { summary: 'Mark book poster as selected', tags: [OpenApiConfiguration.TagNames.BOOK_POSTER] } },
    },
    deleteUserUploadedBookThumbnail: {
      mapping: { method: 'DELETE', path: ['api/v1/books/{bookId}/thumbnails/{thumbnailId}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [authenticationPrincipal(), pathVariable('bookId'), pathVariable('thumbnailId')],
      openapi: { operation: { summary: 'Delete book poster', description: 'Only uploaded posters can be deleted.', tags: [OpenApiConfiguration.TagNames.BOOK_POSTER] } },
    },
    getBookPages: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/pages'] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { list: { class: PageDto } },
      openapi: { operation: { summary: 'List book pages', tags: [OpenApiConfiguration.TagNames.BOOK_PAGES] } },
    },
    getBookPageByNumber: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/pages/{pageNumber}'], produces: [MediaType.ALL_VALUE] },
      preAuthorize: "hasRole('PAGE_STREAMING')",
      args: [
        authenticationPrincipal(),
        webRequest(),
        pathVariable('bookId'),
        pathVariable('pageNumber', 'Int'),
        withParameter(requestParam('convert', { nullable: 'String' }, { required: false, nullable: true }), {
          description: 'Convert the image to the provided format.',
          schema: { allowableValues: ['jpeg', 'png'] },
        }),
        withParameter(requestParam('zero_based', 'Boolean', { defaultValue: 'false' }), {
          description: 'If set to true, pages will start at index 0. If set to false, pages will start at index 1.',
        }),
        withParameter(requestHeader('Accept', { nullable: { list: MediaTypeParam } }, { required: false, nullable: true }), {
          description:
            "Some very limited server driven content negotiation is handled. If a book is a PDF book, and the Accept header contains 'application/pdf' as a more specific type than other 'image/' types, a raw PDF page will be returned.",
        }),
        requestParam('contentNegotiation', 'Boolean', { defaultValue: 'true' }),
      ],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get book page image', tags: [OpenApiConfiguration.TagNames.BOOK_PAGES] }, responses: [{ content: [{ mediaType: 'image/*', schema: { type: 'string', format: 'binary' } }] }] },
    },
    getBookPageThumbnailByNumber: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/pages/{pageNumber}/thumbnail'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), webRequest(), pathVariable('bookId'), pathVariable('pageNumber', 'Int')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get book page thumbnail', description: 'The image is resized to 300px on the largest dimension.', tags: [OpenApiConfiguration.TagNames.BOOK_PAGES] }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getBookWebPubManifest: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/manifest'], produces: [MEDIATYPE_WEBPUB_JSON_VALUE, MEDIATYPE_DIVINA_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: WPPublicationDto },
      openapi: { operation: { summary: "Get book's WebPub manifest", tags: [OpenApiConfiguration.TagNames.BOOK_WEBPUB] } },
    },
    getBookPositions: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/positions'], produces: [MEDIATYPE_POSITION_LIST_JSON_VALUE] },
      args: [requestArg(), authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: R2Positions },
      openapi: { operation: { summary: "List book's positions", description: 'The Positions API is a proposed standard for OPDS 2 and Readium. It is used by the Epub Reader.', tags: [OpenApiConfiguration.TagNames.BOOK_WEBPUB] } },
    },
    getBookWebPubManifestEpub: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/manifest/epub'], produces: [MEDIATYPE_WEBPUB_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: WPPublicationDto },
      openapi: { operation: { summary: "Get book's WebPub manifest (Epub)", tags: [OpenApiConfiguration.TagNames.BOOK_WEBPUB] } },
    },
    getBookWebPubManifestPdf: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/manifest/pdf'], produces: [MEDIATYPE_WEBPUB_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: WPPublicationDto },
      openapi: { operation: { summary: "Get book's WebPub manifest (PDF)", tags: [OpenApiConfiguration.TagNames.BOOK_WEBPUB] } },
    },
    getBookWebPubManifestDivina: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/manifest/divina'], produces: [MEDIATYPE_DIVINA_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: WPPublicationDto },
      openapi: { operation: { summary: "Get book's WebPub manifest (DiViNa)", tags: [OpenApiConfiguration.TagNames.BOOK_WEBPUB] } },
    },
    bookAnalyze: {
      mapping: { method: 'POST', path: ['api/v1/books/{bookId}/analyze'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('bookId')],
      openapi: { operation: { summary: 'Analyze book', tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    bookRefreshMetadata: {
      mapping: { method: 'POST', path: ['api/v1/books/{bookId}/metadata/refresh'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('bookId')],
      openapi: { operation: { summary: 'Refresh book metadata', tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    updateBookMetadata: {
      mapping: { method: 'PATCH', path: ['api/v1/books/{bookId}/metadata'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [pathVariable('bookId'), withParameter(requestBody({ class: BookMetadataUpdateDto }, { valid: true }), {
          description: "Metadata fields to update. Set a field to null to unset the metadata. You can omit fields you don't want to update.",
        })],
      signature: 'public void org.gotson.komga.interfaces.api.rest.BookController.updateBookMetadata(java.lang.String,org.gotson.komga.interfaces.api.rest.dto.BookMetadataUpdateDto)',
      openapi: { operation: { summary: 'Update book metadata', description: "Set a field to null to unset the metadata. You can omit fields you don't want to update.", tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    updateBookMetadataByBatch: {
      mapping: { method: 'PATCH', path: ['api/v1/books/metadata'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [withParameter(requestBody({ map: { class: BookMetadataUpdateDto } }, { valid: true }), {
          description: "A map of book IDs which values are the metadata fields to update. Set a field to null to unset the metadata. You can omit fields you don't want to update.",
        })],
      signature: 'public void org.gotson.komga.interfaces.api.rest.BookController.updateBookMetadataByBatch(java.util.Map<java.lang.String, org.gotson.komga.interfaces.api.rest.dto.BookMetadataUpdateDto>)',
      openapi: { operation: { summary: 'Update book metadata in bulk', description: "Set a field to null to unset the metadata. You can omit fields you don't want to update.", tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    markBookReadProgress: {
      mapping: { method: 'PATCH', path: ['api/v1/books/{bookId}/read-progress'] },
      responseStatus: HttpStatus.NO_CONTENT,
      args: [pathVariable('bookId'), withParameter(requestBody({ class: ReadProgressUpdateDto }, { valid: true }), {
          description:
            'page can be omitted if completed is set to true. completed can be omitted, and will be set accordingly depending on the page passed and the total number of pages in the book.',
        }), authenticationPrincipal()],
      signature: 'public void org.gotson.komga.interfaces.api.rest.BookController.markBookReadProgress(java.lang.String,org.gotson.komga.interfaces.api.rest.dto.ReadProgressUpdateDto,org.gotson.komga.infrastructure.security.KomgaPrincipal)',
      openapi: { operation: { summary: "Mark book's read progress", description: 'Mark book as read and/or change page progress.', tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    deleteBookReadProgress: {
      mapping: { method: 'DELETE', path: ['api/v1/books/{bookId}/read-progress'] },
      responseStatus: HttpStatus.NO_CONTENT,
      args: [pathVariable('bookId'), authenticationPrincipal()],
      openapi: { operation: { summary: 'Mark book as unread', description: 'Mark book as unread', tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    importBooks: {
      mapping: { method: 'POST', path: ['api/v1/books/import'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [requestBody({ class: BookImportBatchDto })],
      signature: 'public void org.gotson.komga.interfaces.api.rest.BookController.importBooks(org.gotson.komga.interfaces.api.rest.dto.BookImportBatchDto)',
      openapi: { operation: { summary: 'Import books', tags: [OpenApiConfiguration.TagNames.BOOK_IMPORT] } },
    },
    deleteBookFile: {
      mapping: { method: 'DELETE', path: ['api/v1/books/{bookId}/file'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('bookId')],
      openapi: { operation: { summary: 'Delete book file', tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    booksRegenerateThumbnails: {
      mapping: { method: 'PUT', path: ['api/v1/books/thumbnails'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [requestParam('for_bigger_result_only', 'Boolean', { required: false, hasDefault: true })],
      openapi: { operation: { summary: 'Regenerate books posters', tags: [OpenApiConfiguration.TagNames.BOOK_POSTER] } },
    },
  },
})

