// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/ReadListController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Author } from '../../../domain/model/Author.js'
import type { Book } from '../../../domain/model/Book.js'
import { BookSearch } from '../../../domain/model/BookSearch.js'
import { CodedException, DuplicateNameException } from '../../../domain/model/Exceptions.js'
import { Dimension } from '../../../domain/model/Dimension.js'
import { DomainEvent } from '../../../domain/model/DomainEvent.js'
import { Media } from '../../../domain/model/Media.js'
import { MediaType as KomgaMediaType } from '../../../domain/model/MediaType.js'
import { ReadList } from '../../../domain/model/ReadList.js'
import { ReadStatus } from '../../../domain/model/ReadStatus.js'
import { SearchCondition } from '../../../domain/model/SearchCondition.js'
import { SearchContext } from '../../../domain/model/SearchContext.js'
import { SearchOperator } from '../../../domain/model/SearchOperator.js'
import { ThumbnailReadList } from '../../../domain/model/ThumbnailReadList.js'
import { BookRepository } from '../../../domain/persistence/BookRepository.js'
import { ReadListRepository } from '../../../domain/persistence/ReadListRepository.js'
import { ThumbnailReadListRepository } from '../../../domain/persistence/ThumbnailReadListRepository.js'
import { BookLifecycle } from '../../../domain/service/BookLifecycle.js'
import { ReadListLifecycle } from '../../../domain/service/ReadListLifecycle.js'
import { ImageAnalyzer } from '../../../infrastructure/image/ImageAnalyzer.js'
import { UnpagedSorted } from '../../../infrastructure/jooq/UnpagedSorted.js'
import { ContentDetector } from '../../../infrastructure/mediacontainer/ContentDetector.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { Authors } from '../../../infrastructure/web/Authors.js'
import { toIndexedMap } from '../../../language/LanguageUtils.js'
import { registerClass } from '../../../port/jackson.js'
import { BufferedInputStream, ByteArrayInputStream, use } from '../../../port/java-io.js'
import { isNullOrBlank, isNullOrEmpty, nn } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { MultipartFile } from '../../../port/servlet.js'
import { ApplicationEventPublisher } from '../../../port/spring.js'
import { FileSystemResource } from '../../../port/spring-core-io.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import {
  CacheControl,
  type HttpHeaders,
  HttpStatus,
  MediaType,
  ResponseEntity,
  ResponseStatusException,
  type StreamingResponseBody,
  authenticationPrincipal,
  contentDisposition,
  pageable,
  pathVariable,
  requestBody,
  requestParam,
  restController,
  streamingResponseBody,
  withParameter,
} from '../../../port/spring-web.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { AuthorsAsQueryParam } from '../../../infrastructure/openapi/AuthorsAsQueryParam.js'
import { PageableAsQueryParam, PageableWithoutSortAsQueryParam } from '../../../infrastructure/openapi/PageableAnnotations.js'
import { JsonTypes } from '../../../port/jackson-mapper.js'
import { OpenApiTypes } from '../../../port/swagger-annotations.js'
import { Deflater, Zip64Mode, ZipArchiveOutputStream, zipArchiveEntry } from '../../../port/zip-output-stream.js'
import { BookDtoRepository } from '../persistence/BookDtoRepository.js'
import { ReadProgressDtoRepository } from '../persistence/ReadProgressDtoRepository.js'
import { BookDto, restrictUrl } from './dto/BookDto.js'
import { ReadListCreationDto } from './dto/ReadListCreationDto.js'
import { ReadListDto, toDto } from './dto/ReadListDto.js'
import { ReadListRequestMatchDto, toDto as toDtoMatch } from './dto/ReadListRequestMatchDto.js'
import { ReadListUpdateDto } from './dto/ReadListUpdateDto.js'
import { TachiyomiReadProgressDto } from './dto/TachiyomiReadProgressDto.js'
import { TachiyomiReadProgressUpdateDto } from './dto/TachiyomiReadProgressUpdateDto.js'
import { ThumbnailReadListDto, toDto as toDtoThumbnail } from './dto/ThumbnailReadListDto.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.api.rest.ReadListController')

export class ReadListController {
  constructor(
    private readonly readListRepository: ReadListRepository,
    private readonly readListLifecycle: ReadListLifecycle,
    private readonly bookDtoRepository: BookDtoRepository,
    private readonly bookRepository: BookRepository,
    private readonly readProgressDtoRepository: ReadProgressDtoRepository,
    private readonly thumbnailReadListRepository: ThumbnailReadListRepository,
    private readonly contentDetector: ContentDetector,
    private readonly imageAnalyzer: ImageAnalyzer,
    private readonly bookLifecycle: BookLifecycle,
    private readonly eventPublisher: ApplicationEventPublisher,
  ) {}

  // @Operation(summary = "List readlists", tags = [OpenApiConfiguration.TagNames.READLISTS])
  // @PageableAsQueryParam
  getReadLists(principal: KomgaPrincipal, searchTerm: string | null, libraryIds: string[] | null, unpaged: boolean = false, page: Pageable): Page<ReadListDto> {
    const sort = page.sort.isSorted ? page.sort : !isNullOrBlank(searchTerm) ? Sort.by('relevance') : Sort.by(Sort.Order.asc('name'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.readListRepository
      .findAll(new SearchContext(principal.user), pageRequest, { belongsToLibraryIds: principal.user.getAuthorizedLibraryIds(libraryIds), search: searchTerm })
      .map((it) => toDto(it))
  }

  // @Operation(summary = "Get readlist details", tags = [OpenApiConfiguration.TagNames.READLISTS])
  getReadListById(principal: KomgaPrincipal, id: string): ReadListDto {
    const it = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    return (it !== null ? toDto(it) : null) ?? throwNotFound()
  }

  // @Operation(summary = "Get readlist's poster image", tags = [OpenApiConfiguration.TagNames.READLIST_POSTER])
  // @ApiResponse(content = [Content(schema = Schema(type = "string", format = "binary"))])
  // PORT: async (ReadListLifecycle.getThumbnailBytes génère une mosaïque avec sharp)
  async getReadListThumbnail(principal: KomgaPrincipal, id: string): Promise<ResponseEntity<Uint8Array>> {
    const it = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (it !== null) {
      return ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(60 * 60, { cachePrivate: true })) // PORT: CacheControl.maxAge(1, TimeUnit.HOURS).cachePrivate()
        .body(await this.readListLifecycle.getThumbnailBytes(it))
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @Operation(summary = "Get readlist poster image", tags = [OpenApiConfiguration.TagNames.READLIST_POSTER])
  // @ApiResponse(content = [Content(schema = Schema(type = "string", format = "binary"))])
  getReadListThumbnailById(principal: KomgaPrincipal, id: string, thumbnailId: string): Uint8Array {
    const it = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (it !== null) {
      const poster = this.thumbnailReadListRepository.findByIdOrNull(thumbnailId)
      if (poster !== null) {
        if (poster.readListId !== it.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
        return poster.thumbnail
      }
      throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @Operation(summary = "List readlist's posters", tags = [OpenApiConfiguration.TagNames.READLIST_POSTER])
  getReadListThumbnails(principal: KomgaPrincipal, id: string): ThumbnailReadListDto[] {
    const it = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (it !== null) {
      return this.thumbnailReadListRepository.findAllByReadListId(id).map((it) => toDtoThumbnail(it))
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @Operation(summary = "Add readlist poster", tags = [OpenApiConfiguration.TagNames.READLIST_POSTER])
  addUserUploadedReadListThumbnail(principal: KomgaPrincipal, id: string, file: MultipartFile, selected: boolean = true): ThumbnailReadListDto {
    const readList = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (readList !== null) {
      // PORT: file.inputStream.buffered() -> BufferedInputStream(ByteArrayInputStream(file.bytes))
      const mediaType = use(new BufferedInputStream(new ByteArrayInputStream(file.bytes)), (it) => this.contentDetector.detectMediaType(it))
      if (!this.contentDetector.isImage(mediaType)) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE)

      return toDtoThumbnail(
        this.readListLifecycle.addThumbnail(
          new ThumbnailReadList({
            readListId: readList.id,
            thumbnail: file.bytes,
            type: ThumbnailReadList.Type.USER_UPLOADED,
            selected: selected,
            fileSize: file.bytes.length,
            mediaType: mediaType,
            dimension: this.imageAnalyzer.getDimension(new BufferedInputStream(new ByteArrayInputStream(file.bytes))) ?? new Dimension({ width: 0, height: 0 }),
          }),
        ),
      )
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @Operation(summary = "Mark readlist poster as selected", tags = [OpenApiConfiguration.TagNames.READLIST_POSTER])
  markReadListThumbnailSelected(principal: KomgaPrincipal, id: string, thumbnailId: string): void {
    const readList = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (readList === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const poster = this.thumbnailReadListRepository.findByIdOrNull(thumbnailId)
    // PORT: le `?.let` interne vaut null si le poster est absent : `?: throw` s'applique aussi
    if (poster === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (poster.readListId !== readList.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    this.readListLifecycle.markSelectedThumbnail(poster)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailReadListAdded({ thumbnail: poster.copy({ selected: true }) }))
  }

  // @Operation(summary = "Delete readlist poster", tags = [OpenApiConfiguration.TagNames.READLIST_POSTER])
  deleteUserUploadedReadListThumbnail(principal: KomgaPrincipal, id: string, thumbnailId: string): void {
    const readList = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (readList === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const poster = this.thumbnailReadListRepository.findByIdOrNull(thumbnailId)
    if (poster === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (poster.readListId !== readList.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    this.readListLifecycle.deleteThumbnail(poster)
  }

  // @Operation(summary = "Create readlist", tags = [OpenApiConfiguration.TagNames.READLISTS])
  createReadList(readList: ReadListCreationDto): ReadListDto {
    try {
      return toDto(
        this.readListLifecycle.addReadList(
          new ReadList({
            name: readList.name,
            summary: readList.summary,
            ordered: readList.ordered,
            bookIds: toIndexedMap(readList.bookIds),
          }),
        ),
      )
    } catch (e) {
      if (e instanceof DuplicateNameException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      throw e
    }
  }

  // @Operation(summary = "Match ComicRack list", tags = [OpenApiConfiguration.TagNames.COMICRACK])
  matchComicRackList(file: MultipartFile): ReadListRequestMatchDto {
    try {
      return toDtoMatch(this.readListLifecycle.matchComicRackList(file.bytes))
    } catch (e) {
      if (e instanceof CodedException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.code)
      throw e
    }
  }

  // @Operation(summary = "Update readlist", tags = [OpenApiConfiguration.TagNames.READLISTS])
  updateReadListById(principal: KomgaPrincipal, id: string, readList: ReadListUpdateDto): void {
    const existing = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (existing === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const updated = existing.copy({
      name: readList.name ?? existing.name,
      summary: readList.summary ?? existing.summary,
      ordered: readList.ordered ?? existing.ordered,
      bookIds: (readList.bookIds !== null ? toIndexedMap(readList.bookIds) : null) ?? existing.bookIds,
    })
    try {
      this.readListLifecycle.updateReadList(updated)
    } catch (e) {
      if (e instanceof DuplicateNameException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      throw e
    }
  }

  // @Operation(summary = "Delete readlist", tags = [OpenApiConfiguration.TagNames.READLISTS])
  deleteReadListById(principal: KomgaPrincipal, id: string): void {
    const it = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (it === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.readListLifecycle.deleteReadList(it)
  }

  // @Operation(summary = "List readlist's books", tags = [OpenApiConfiguration.TagNames.READLIST_BOOKS])
  // @PageableWithoutSortAsQueryParam
  // @AuthorsAsQueryParam
  getBooksByReadListId(
    id: string,
    principal: KomgaPrincipal,
    libraryIds: string[] | null,
    readStatus: ReadStatus[] | null,
    tags: string[] | null,
    mediaStatus: Media.Status[] | null,
    deleted: boolean | null,
    unpaged: boolean = false,
    authors: Author[] | null,
    page: Pageable,
  ): Page<BookDto> {
    const readList = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (readList === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const sort = readList.ordered ? Sort.by(Sort.Order.asc('readList.number')) : Sort.by(Sort.Order.asc('metadata.releaseDate'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    const bookSearch = new BookSearch({
      condition: new SearchCondition.AllOfBook({
        conditions: (() => {
          const list: SearchCondition.Book[] = []
          list.push(new SearchCondition.ReadListId({ operator: new SearchOperator.Is({ value: readList.id }) }))
          if (!isNullOrEmpty(libraryIds)) list.push(new SearchCondition.AnyOfBook({ conditions: libraryIds.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(readStatus)) list.push(new SearchCondition.AnyOfBook({ conditions: readStatus.map((it) => new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(mediaStatus)) list.push(new SearchCondition.AnyOfBook({ conditions: mediaStatus.map((it) => new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(tags)) list.push(new SearchCondition.AnyOfBook({ conditions: tags.map((it) => new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(authors))
            list.push(
              new SearchCondition.AnyOfBook({
                conditions: authors.map((it) => new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: it.name, role: it.role }) }) })),
              }),
            )
          if (deleted !== null) list.push(new SearchCondition.Deleted({ operator: deleted ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
          return list
        })(),
      }),
    })
    return this.bookDtoRepository.findAll(bookSearch, new SearchContext(principal.user), pageRequest).map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  // @Operation(summary = "Get previous book in readlist", tags = [OpenApiConfiguration.TagNames.READLIST_BOOKS])
  getBookSiblingPreviousInReadList(principal: KomgaPrincipal, id: string, bookId: string): BookDto {
    const it = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    const result = it !== null ? this.bookDtoRepository.findPreviousInReadListOrNull(it, bookId, new SearchContext(principal.user)) : null
    return (result !== null ? restrictUrl(result, !principal.user.isAdmin) : null) ?? throwNotFound()
  }

  // @Operation(summary = "Get next book in readlist", tags = [OpenApiConfiguration.TagNames.READLIST_BOOKS])
  getBookSiblingNextInReadList(principal: KomgaPrincipal, id: string, bookId: string): BookDto {
    const it = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    const result = it !== null ? this.bookDtoRepository.findNextInReadListOrNull(it, bookId, new SearchContext(principal.user)) : null
    return (result !== null ? restrictUrl(result, !principal.user.isAdmin) : null) ?? throwNotFound()
  }

  // @Operation(summary = "Get readlist read progress (Mihon)", description = "Mihon specific, due to how read progress is handled in Mihon.", tags = [OpenApiConfiguration.TagNames.MIHON])
  getMihonReadProgressByReadListId(id: string, principal: KomgaPrincipal): TachiyomiReadProgressDto {
    const readList = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (readList === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    return this.readProgressDtoRepository.findProgressByReadList(readList.id, principal.user.id)
  }

  // @Operation(summary = "Update readlist read progress (Mihon)", description = "Mihon specific, due to how read progress is handled in Mihon.", tags = [OpenApiConfiguration.TagNames.MIHON])
  updateMihonReadProgressByReadListId(id: string, readProgress: TachiyomiReadProgressUpdateDto, principal: KomgaPrincipal): void {
    const readList = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (readList === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.bookDtoRepository
      .findAll(
        new BookSearch({ condition: new SearchCondition.ReadListId({ operator: new SearchOperator.Is({ value: readList.id }) }) }),
        new SearchContext(principal.user),
        new UnpagedSorted(Sort.by(Sort.Order.asc('readList.number'))),
      )
      .content.filter((_, index) => index < readProgress.lastBookRead)
      .forEach((book) => {
        if (book.readProgress?.completed !== true) this.bookLifecycle.markReadProgressCompleted(book.id, principal.user)
      })
  }

  // @Operation(summary = "Download readlist", description = "Download the whole readlist as a ZIP file.", tags = [OpenApiConfiguration.TagNames.READLISTS])
  downloadReadListAsZip(principal: KomgaPrincipal, id: string): ResponseEntity<StreamingResponseBody> {
    const readList = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (readList === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)

    const books = new Map<number, Book>()
    for (const [key, value] of readList.bookIds) {
      const book = this.bookRepository.findByIdOrNull(value)
      if (book !== null) books.set(key, book)
    }

    // PORT: StreamingResponseBody asynchrone (écritures avec contre-pression), `use` -> try/finally
    const streamingResponse = streamingResponseBody(async (responseStream) => {
      const zipStream = new ZipArchiveOutputStream(responseStream)
      try {
        zipStream.setMethod(ZipArchiveOutputStream.DEFLATED)
        zipStream.setLevel(Deflater.NO_COMPRESSION)
        zipStream.setUseZip64(Zip64Mode.Always)
        for (const [index, book] of books) {
          const file = new FileSystemResource(book.path)
          if (!file.exists()) {
            logger.warn(() => `Book file not found, skipping archive entry: ${file.path}`)
            continue
          }

          logger.debug(() => `Adding file to zip archive: ${file.path}`)
          // PORT: file.inputStream.use { IOUtils.copyLarge(it, zipStream, ByteArray(8192)) } -> itération du flux de lecture
          const it = file.getInputStream()
          try {
            await zipStream.putArchiveEntry(zipArchiveEntry(`${index + 1} - ${nn(file.filename)}`))
            for await (const chunk of it) await zipStream.write(chunk as Buffer)
            await zipStream.closeArchiveEntry()
          } finally {
            it.destroy()
          }
        }
      } finally {
        await zipStream.close()
      }
    })

    return ResponseEntity.ok()
      .headersFrom((it: HttpHeaders) => it.setContentDisposition(contentDisposition('attachment', readList.name + '.zip', true)))
      .contentType(MediaType.parseMediaType(KomgaMediaType.ZIP.type))
      .body(streamingResponse)
  }
}

// PORT: `?: throw ResponseStatusException(HttpStatus.NOT_FOUND)` en position d'expression
function throwNotFound(): never {
  throw new ResponseStatusException(HttpStatus.NOT_FOUND)
}

// PORT: noms qualifiés des enums convertis (messages d'erreur de conversion de Spring)
registerClass('org.gotson.komga.domain.model.ReadStatus', ReadStatus as never)
registerClass('org.gotson.komga.domain.model.Media$Status', Media.Status as never)

const nullableList = (t: Parameters<typeof requestParam>[1]) => ({ nullable: { list: t } }) as Parameters<typeof requestParam>[1]
const optional = { required: false, nullable: true }

// @RestController
restController(ReadListController, {
  inject: [
    ReadListRepository,
    ReadListLifecycle,
    BookDtoRepository,
    BookRepository,
    ReadProgressDtoRepository,
    ThumbnailReadListRepository,
    ContentDetector,
    ImageAnalyzer,
    BookLifecycle,
    ApplicationEventPublisher,
  ],
  javaName: 'org.gotson.komga.interfaces.api.rest.ReadListController',
  requestMapping: { path: ['api/v1/readlists'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  handlers: {
    getReadLists: {
      mapping: { method: 'GET' },
      args: [
        authenticationPrincipal(),
        requestParam('search', { nullable: 'String' }, optional),
        requestParam('library_id', nullableList('String'), optional),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: ReadListDto }] },
      openapi: { operation: { summary: 'List readlists', tags: [OpenApiConfiguration.TagNames.READLISTS] }, parameters: [...PageableAsQueryParam] },
    },
    getReadListById: {
      mapping: { method: 'GET', path: ['{id}'] },
      args: [authenticationPrincipal(), pathVariable('id')],
      returns: { class: ReadListDto },
      openapi: { operation: { summary: 'Get readlist details', tags: [OpenApiConfiguration.TagNames.READLISTS] } },
    },
    getReadListThumbnail: {
      mapping: { method: 'GET', path: ['{id}/thumbnail'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('id')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: "Get readlist's poster image", tags: [OpenApiConfiguration.TagNames.READLIST_POSTER] }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getReadListThumbnailById: {
      mapping: { method: 'GET', path: ['{id}/thumbnails/{thumbnailId}'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('id'), pathVariable('thumbnailId')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get readlist poster image', tags: [OpenApiConfiguration.TagNames.READLIST_POSTER] }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getReadListThumbnails: {
      mapping: { method: 'GET', path: ['{id}/thumbnails'], produces: [MediaType.APPLICATION_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('id')],
      returns: { list: { class: ThumbnailReadListDto } },
      openapi: { operation: { summary: "List readlist's posters", tags: [OpenApiConfiguration.TagNames.READLIST_POSTER] } },
    },
    addUserUploadedReadListThumbnail: {
      mapping: { method: 'POST', path: ['{id}/thumbnails'], consumes: [MediaType.MULTIPART_FORM_DATA_VALUE] },
      preAuthorize: "hasRole('ADMIN')",
      args: [authenticationPrincipal(), pathVariable('id'), requestParam('file', { class: MultipartFile }), requestParam('selected', 'Boolean', { hasDefault: true })],
      returns: { class: ThumbnailReadListDto },
      openapi: { operation: { summary: 'Add readlist poster', tags: [OpenApiConfiguration.TagNames.READLIST_POSTER] } },
    },
    markReadListThumbnailSelected: {
      mapping: { method: 'PUT', path: ['{id}/thumbnails/{thumbnailId}/selected'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [authenticationPrincipal(), pathVariable('id'), pathVariable('thumbnailId')],
      openapi: { operation: { summary: 'Mark readlist poster as selected', tags: [OpenApiConfiguration.TagNames.READLIST_POSTER] } },
    },
    deleteUserUploadedReadListThumbnail: {
      mapping: { method: 'DELETE', path: ['{id}/thumbnails/{thumbnailId}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [authenticationPrincipal(), pathVariable('id'), pathVariable('thumbnailId')],
      openapi: { operation: { summary: 'Delete readlist poster', tags: [OpenApiConfiguration.TagNames.READLIST_POSTER] } },
    },
    createReadList: {
      mapping: { method: 'POST' },
      preAuthorize: "hasRole('ADMIN')",
      args: [requestBody({ class: ReadListCreationDto }, { valid: true })],
      returns: { class: ReadListDto },
      openapi: { operation: { summary: 'Create readlist', tags: [OpenApiConfiguration.TagNames.READLISTS] } },
      signature:
        'public org.gotson.komga.interfaces.api.rest.dto.ReadListDto org.gotson.komga.interfaces.api.rest.ReadListController.createReadList(org.gotson.komga.interfaces.api.rest.dto.ReadListCreationDto)',
    },
    matchComicRackList: {
      mapping: { method: 'POST', path: ['match/comicrack'], consumes: [MediaType.MULTIPART_FORM_DATA_VALUE] },
      preAuthorize: "hasRole('ADMIN')",
      args: [requestParam('file', { class: MultipartFile })],
      returns: { class: ReadListRequestMatchDto },
      openapi: { operation: { summary: 'Match ComicRack list', tags: [OpenApiConfiguration.TagNames.COMICRACK] } },
    },
    updateReadListById: {
      mapping: { method: 'PATCH', path: ['{id}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [authenticationPrincipal(), pathVariable('id'), requestBody({ class: ReadListUpdateDto }, { valid: true })],
      openapi: { operation: { summary: 'Update readlist', tags: [OpenApiConfiguration.TagNames.READLISTS] } },
      signature:
        'public void org.gotson.komga.interfaces.api.rest.ReadListController.updateReadListById(org.gotson.komga.infrastructure.security.KomgaPrincipal,java.lang.String,org.gotson.komga.interfaces.api.rest.dto.ReadListUpdateDto)',
    },
    deleteReadListById: {
      mapping: { method: 'DELETE', path: ['{id}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [authenticationPrincipal(), pathVariable('id')],
      openapi: { operation: { summary: 'Delete readlist', tags: [OpenApiConfiguration.TagNames.READLISTS] } },
    },
    getBooksByReadListId: {
      mapping: { method: 'GET', path: ['{id}/books'] },
      args: [
        pathVariable('id'),
        authenticationPrincipal(),
        requestParam('library_id', nullableList('String'), optional),
        requestParam('read_status', nullableList({ enum: ReadStatus }), optional),
        requestParam('tag', nullableList('String'), optional),
        requestParam('media_status', nullableList({ enum: Media.Status }), optional),
        requestParam('deleted', { nullable: 'Boolean' }, optional),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(Authors(), { hidden: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: BookDto }] },
      openapi: { operation: { summary: "List readlist's books", tags: [OpenApiConfiguration.TagNames.READLIST_BOOKS] }, parameters: [...PageableWithoutSortAsQueryParam, ...AuthorsAsQueryParam] },
    },
    getBookSiblingPreviousInReadList: {
      mapping: { method: 'GET', path: ['{id}/books/{bookId}/previous'] },
      args: [authenticationPrincipal(), pathVariable('id'), pathVariable('bookId')],
      returns: { class: BookDto },
      openapi: { operation: { summary: 'Get previous book in readlist', tags: [OpenApiConfiguration.TagNames.READLIST_BOOKS] } },
    },
    getBookSiblingNextInReadList: {
      mapping: { method: 'GET', path: ['{id}/books/{bookId}/next'] },
      args: [authenticationPrincipal(), pathVariable('id'), pathVariable('bookId')],
      returns: { class: BookDto },
      openapi: { operation: { summary: 'Get next book in readlist', tags: [OpenApiConfiguration.TagNames.READLIST_BOOKS] } },
    },
    getMihonReadProgressByReadListId: {
      mapping: { method: 'GET', path: ['{id}/read-progress/tachiyomi'] },
      args: [pathVariable('id'), authenticationPrincipal()],
      returns: { class: TachiyomiReadProgressDto },
      openapi: { operation: { summary: 'Get readlist read progress (Mihon)', description: 'Mihon specific, due to how read progress is handled in Mihon.', tags: [OpenApiConfiguration.TagNames.MIHON] } },
    },
    updateMihonReadProgressByReadListId: {
      mapping: { method: 'PUT', path: ['{id}/read-progress/tachiyomi'] },
      responseStatus: HttpStatus.NO_CONTENT,
      args: [pathVariable('id'), requestBody({ class: TachiyomiReadProgressUpdateDto }, { valid: true }), authenticationPrincipal()],
      openapi: { operation: { summary: 'Update readlist read progress (Mihon)', description: 'Mihon specific, due to how read progress is handled in Mihon.', tags: [OpenApiConfiguration.TagNames.MIHON] } },
      signature:
        'public void org.gotson.komga.interfaces.api.rest.ReadListController.updateMihonReadProgressByReadListId(java.lang.String,org.gotson.komga.interfaces.api.rest.dto.TachiyomiReadProgressUpdateDto,org.gotson.komga.infrastructure.security.KomgaPrincipal)',
    },
    downloadReadListAsZip: {
      mapping: { method: 'GET', path: ['{id}/file'], produces: [MediaType.APPLICATION_OCTET_STREAM_VALUE] },
      preAuthorize: "hasRole('FILE_DOWNLOAD')",
      args: [authenticationPrincipal(), pathVariable('id')],
      returns: OpenApiTypes.StreamingResponseBody,
      openapi: { operation: { summary: 'Download readlist', description: 'Download the whole readlist as a ZIP file.', tags: [OpenApiConfiguration.TagNames.READLISTS] } },
    },
  },
})
