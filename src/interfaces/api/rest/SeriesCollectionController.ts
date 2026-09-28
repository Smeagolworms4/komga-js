// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/SeriesCollectionController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ZoneOffset, ZonedDateTime } from '@js-joda/core'
import type { Author } from '../../../domain/model/Author.js'
import { Dimension } from '../../../domain/model/Dimension.js'
import { DomainEvent } from '../../../domain/model/DomainEvent.js'
import { DuplicateNameException } from '../../../domain/model/Exceptions.js'
import { ReadStatus } from '../../../domain/model/ReadStatus.js'
import { SearchCondition } from '../../../domain/model/SearchCondition.js'
import { SearchContext } from '../../../domain/model/SearchContext.js'
import { SearchOperator } from '../../../domain/model/SearchOperator.js'
import { SeriesCollection } from '../../../domain/model/SeriesCollection.js'
import { SeriesMetadata } from '../../../domain/model/SeriesMetadata.js'
import { SeriesSearch } from '../../../domain/model/SeriesSearch.js'
import { ThumbnailSeriesCollection } from '../../../domain/model/ThumbnailSeriesCollection.js'
import { SeriesCollectionRepository } from '../../../domain/persistence/SeriesCollectionRepository.js'
import { ThumbnailSeriesCollectionRepository } from '../../../domain/persistence/ThumbnailSeriesCollectionRepository.js'
import { SeriesCollectionLifecycle } from '../../../domain/service/SeriesCollectionLifecycle.js'
import { ImageAnalyzer } from '../../../infrastructure/image/ImageAnalyzer.js'
import { UnpagedSorted } from '../../../infrastructure/jooq/UnpagedSorted.js'
import { ContentDetector } from '../../../infrastructure/mediacontainer/ContentDetector.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { Authors } from '../../../infrastructure/web/Authors.js'
import { SeriesDtoRepository } from '../persistence/SeriesDtoRepository.js'
import { CollectionCreationDto } from './dto/CollectionCreationDto.js'
import { CollectionDto, toDto } from './dto/CollectionDto.js'
import { CollectionUpdateDto } from './dto/CollectionUpdateDto.js'
import { SeriesDto, restrictUrl } from './dto/SeriesDto.js'
import { ThumbnailSeriesCollectionDto, toDto as toDtoThumbnail } from './dto/ThumbnailSeriesCollectionDto.js'
import { registerClass } from '../../../port/jackson.js'
import { BufferedInputStream, ByteArrayInputStream, use } from '../../../port/java-io.js'
import { buildList, isNullOrBlank, isNullOrEmpty, mapNotNull } from '../../../port/kotlin.js'
import { toIntOrNull } from '../../../port/kotlin-numbers.js'
import { MultipartFile } from '../../../port/servlet.js'
import { ApplicationEventPublisher } from '../../../port/spring.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import {
  CacheControl,
  HttpStatus,
  MediaType,
  ResponseEntity,
  ResponseStatusException,
  authenticationPrincipal,
  pageable,
  pathVariable,
  requestBody,
  requestParam,
  restController,
  withParameter,
} from '../../../port/spring-web.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { AuthorsAsQueryParam } from '../../../infrastructure/openapi/AuthorsAsQueryParam.js'
import { PageableAsQueryParam, PageableWithoutSortAsQueryParam } from '../../../infrastructure/openapi/PageableAnnotations.js'
import { JsonTypes } from '../../../port/jackson-mapper.js'

// @RestController
// @RequestMapping("api/v1/collections", produces = [MediaType.APPLICATION_JSON_VALUE])
export class SeriesCollectionController {
  constructor(
    private readonly collectionRepository: SeriesCollectionRepository,
    private readonly collectionLifecycle: SeriesCollectionLifecycle,
    private readonly seriesDtoRepository: SeriesDtoRepository,
    private readonly contentDetector: ContentDetector,
    private readonly imageAnalyzer: ImageAnalyzer,
    private readonly thumbnailSeriesCollectionRepository: ThumbnailSeriesCollectionRepository,
    private readonly eventPublisher: ApplicationEventPublisher,
  ) {}

  // @Operation(summary = "List collections", tags = [OpenApiConfiguration.TagNames.COLLECTIONS])
  // @PageableAsQueryParam
  // @GetMapping
  getCollections(principal: KomgaPrincipal, searchTerm: string | null, libraryIds: string[] | null, unpaged: boolean = false, page: Pageable): Page<CollectionDto> {
    const sort = page.sort.isSorted ? page.sort : !isNullOrBlank(searchTerm) ? Sort.by('relevance') : Sort.by(Sort.Order.asc('name'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.collectionRepository
      .findAll(new SearchContext(principal.user), pageRequest, { belongsToLibraryIds: principal.user.getAuthorizedLibraryIds(libraryIds), search: searchTerm })
      .map((it) => toDto(it))
  }

  // @Operation(summary = "Get collection details", tags = [OpenApiConfiguration.TagNames.COLLECTIONS])
  // @GetMapping("{id}")
  getCollectionById(principal: KomgaPrincipal, id: string): CollectionDto {
    const it = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    return (it !== null ? toDto(it) : null) ?? throwNotFound()
  }

  // @Operation(summary = "Get collection's poster image", tags = [OpenApiConfiguration.TagNames.COLLECTION_POSTER])
  // @ApiResponse(content = [Content(schema = Schema(type = "string", format = "binary"))])
  // @GetMapping(value = ["{id}/thumbnail"], produces = [MediaType.IMAGE_JPEG_VALUE])
  // PORT: async (SeriesCollectionLifecycle.getThumbnailBytes génère une mosaïque avec sharp)
  async getCollectionThumbnail(principal: KomgaPrincipal, id: string): Promise<ResponseEntity<Uint8Array>> {
    const it = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (it !== null) {
      return ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(60 * 60, { cachePrivate: true })) // PORT: CacheControl.maxAge(1, TimeUnit.HOURS).cachePrivate()
        .body(await this.collectionLifecycle.getThumbnailBytes(it, principal.user.id))
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @Operation(summary = "Get collection poster image", tags = [OpenApiConfiguration.TagNames.COLLECTION_POSTER])
  // @ApiResponse(content = [Content(schema = Schema(type = "string", format = "binary"))])
  // @GetMapping(value = ["{id}/thumbnails/{thumbnailId}"], produces = [MediaType.IMAGE_JPEG_VALUE])
  getCollectionThumbnailById(principal: KomgaPrincipal, id: string, thumbnailId: string): Uint8Array {
    const collection = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (collection === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const poster = this.thumbnailSeriesCollectionRepository.findByIdOrNull(thumbnailId)
    if (poster === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (poster.collectionId !== collection.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    return poster.thumbnail
  }

  // @Operation(summary = "List collection's posters", tags = [OpenApiConfiguration.TagNames.COLLECTION_POSTER])
  // @GetMapping(value = ["{id}/thumbnails"], produces = [MediaType.APPLICATION_JSON_VALUE])
  getCollectionThumbnails(principal: KomgaPrincipal, id: string): ThumbnailSeriesCollectionDto[] {
    if (this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user)) !== null) {
      return this.thumbnailSeriesCollectionRepository.findAllByCollectionId(id).map((it) => toDtoThumbnail(it))
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @Operation(summary = "Add collection poster", tags = [OpenApiConfiguration.TagNames.COLLECTION_POSTER])
  // @PostMapping(value = ["{id}/thumbnails"], consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
  // @PreAuthorize("hasRole('ADMIN')")
  addUserUploadedCollectionThumbnail(principal: KomgaPrincipal, id: string, file: MultipartFile, selected: boolean = true): ThumbnailSeriesCollectionDto {
    const collection = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (collection !== null) {
      // PORT: file.inputStream.buffered() -> BufferedInputStream(ByteArrayInputStream(file.bytes))
      const mediaType = use(new BufferedInputStream(new ByteArrayInputStream(file.bytes)), (it) => this.contentDetector.detectMediaType(it))
      if (!this.contentDetector.isImage(mediaType)) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE)

      return toDtoThumbnail(
        this.collectionLifecycle.addThumbnail(
          new ThumbnailSeriesCollection({
            collectionId: collection.id,
            thumbnail: file.bytes,
            type: ThumbnailSeriesCollection.Type.USER_UPLOADED,
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

  // @Operation(summary = "Mark collection poster as selected", tags = [OpenApiConfiguration.TagNames.COLLECTION_POSTER])
  // @PutMapping("{id}/thumbnails/{thumbnailId}/selected")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.ACCEPTED)
  markCollectionThumbnailSelected(principal: KomgaPrincipal, id: string, thumbnailId: string): void {
    const collection = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (collection === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    // PORT: le `?.let` interne sans `?:` renvoie null si le poster est absent : le `?: throw` externe s'applique alors
    const poster = this.thumbnailSeriesCollectionRepository.findByIdOrNull(thumbnailId)
    if (poster === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (poster.collectionId !== collection.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    this.collectionLifecycle.markSelectedThumbnail(poster)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailSeriesCollectionAdded({ thumbnail: poster.copy({ selected: true }) }))
  }

  // @Operation(summary = "Delete collection poster", tags = [OpenApiConfiguration.TagNames.COLLECTION_POSTER])
  // @DeleteMapping("{id}/thumbnails/{thumbnailId}")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.ACCEPTED)
  deleteUserUploadedCollectionThumbnail(principal: KomgaPrincipal, id: string, thumbnailId: string): void {
    const collection = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (collection === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const poster = this.thumbnailSeriesCollectionRepository.findByIdOrNull(thumbnailId)
    if (poster === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (poster.collectionId !== collection.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    this.collectionLifecycle.deleteThumbnail(poster)
  }

  // @Operation(summary = "Create collection", tags = [OpenApiConfiguration.TagNames.COLLECTIONS])
  // @PostMapping
  // @PreAuthorize("hasRole('ADMIN')")
  createCollection(collection: CollectionCreationDto): CollectionDto {
    try {
      return toDto(
        this.collectionLifecycle.addCollection(
          new SeriesCollection({
            name: collection.name,
            ordered: collection.ordered,
            seriesIds: collection.seriesIds,
          }),
        ),
      )
    } catch (e) {
      if (e instanceof DuplicateNameException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      throw e
    }
  }

  // @Operation(summary = "Update collection", tags = [OpenApiConfiguration.TagNames.COLLECTIONS])
  // @PatchMapping("{id}")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  updateCollectionById(principal: KomgaPrincipal, id: string, collection: CollectionUpdateDto): void {
    const existing = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (existing === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const updated = existing.copy({
      name: collection.name ?? existing.name,
      ordered: collection.ordered ?? existing.ordered,
      seriesIds: collection.seriesIds ?? existing.seriesIds,
    })
    try {
      this.collectionLifecycle.updateCollection(updated)
    } catch (e) {
      if (e instanceof DuplicateNameException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      throw e
    }
  }

  // @Operation(summary = "Delete collection", tags = [OpenApiConfiguration.TagNames.COLLECTIONS])
  // @DeleteMapping("{id}")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  deleteCollectionById(principal: KomgaPrincipal, id: string): void {
    const it = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (it === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.collectionLifecycle.deleteCollection(it)
  }

  // @Operation(summary = "List collection's series", tags = [OpenApiConfiguration.TagNames.COLLECTION_SERIES])
  // @PageableWithoutSortAsQueryParam
  // @AuthorsAsQueryParam
  // @GetMapping("{id}/series")
  getSeriesByCollectionId(
    id: string,
    principal: KomgaPrincipal,
    libraryIds: string[] | null,
    metadataStatus: SeriesMetadata.Status[] | null,
    readStatus: ReadStatus[] | null,
    publishers: string[] | null,
    languages: string[] | null,
    genres: string[] | null,
    tags: string[] | null,
    ageRatings: string[] | null,
    releaseYears: string[] | null,
    deleted: boolean | null,
    complete: boolean | null,
    unpaged: boolean = false,
    authors: Author[] | null,
    page: Pageable,
  ): Page<SeriesDto> {
    const collection = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (collection === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const sort = collection.ordered ? Sort.by(Sort.Order.asc('collection.number')) : Sort.by(Sort.Order.asc('metadata.titleSort'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    const search = new SeriesSearch({
      condition: new SearchCondition.AllOfSeries({
        conditions: buildList<SearchCondition.Series>((list) => {
          list.push(new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: collection.id }) }))
          if (!isNullOrEmpty(libraryIds)) list.push(new SearchCondition.AnyOfSeries({ conditions: libraryIds.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (deleted !== null) list.push(new SearchCondition.Deleted({ operator: deleted ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
          if (complete !== null) list.push(new SearchCondition.Complete({ operator: complete ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
          if (!isNullOrEmpty(metadataStatus)) list.push(new SearchCondition.AnyOfSeries({ conditions: metadataStatus.map((it) => new SearchCondition.SeriesStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(publishers)) list.push(new SearchCondition.AnyOfSeries({ conditions: publishers.map((it) => new SearchCondition.Publisher({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(languages)) list.push(new SearchCondition.AnyOfSeries({ conditions: languages.map((it) => new SearchCondition.Language({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(tags)) list.push(new SearchCondition.AnyOfSeries({ conditions: tags.map((it) => new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(genres)) list.push(new SearchCondition.AnyOfSeries({ conditions: genres.map((it) => new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(ageRatings))
            list.push(
              new SearchCondition.AnyOfSeries({
                conditions: ageRatings.map((it) => {
                  const ageRating = toIntOrNull(it)
                  return ageRating !== null ? new SearchCondition.AgeRating({ operator: new SearchOperator.Is({ value: ageRating }) }) : new SearchCondition.AgeRating({ operator: new SearchOperator.IsNullT() })
                }),
              }),
            )
          if (!isNullOrEmpty(releaseYears))
            list.push(
              new SearchCondition.AnyOfSeries({
                conditions: mapNotNull(releaseYears, (it) => toIntOrNull(it)).map((releaseYear) =>
                  SearchCondition.AllOfSeries.of(
                    new SearchCondition.ReleaseDate({ operator: new SearchOperator.After({ dateTime: ZonedDateTime.of(releaseYear - 1, 12, 31, 12, 0, 0, 0, ZoneOffset.UTC) }) }),
                    new SearchCondition.ReleaseDate({ operator: new SearchOperator.Before({ dateTime: ZonedDateTime.of(releaseYear + 1, 1, 1, 12, 0, 0, 0, ZoneOffset.UTC) }) }),
                  ),
                ),
              }),
            )
          if (!isNullOrEmpty(readStatus)) list.push(new SearchCondition.AnyOfSeries({ conditions: readStatus.map((it) => new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(authors))
            list.push(new SearchCondition.AnyOfSeries({ conditions: authors.map((it) => new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: it.name, role: it.role }) }) })) }))
        }),
      }),
    })

    return this.seriesDtoRepository.findAll(search, new SearchContext(principal.user), pageRequest).map((it) => restrictUrl(it, !principal.user.isAdmin))
  }
}

// PORT: `?: throw ResponseStatusException(HttpStatus.NOT_FOUND)` en position d'expression
function throwNotFound(): never {
  throw new ResponseStatusException(HttpStatus.NOT_FOUND)
}

// PORT: noms qualifiés Java des enums, pour les messages d'erreur de conversion des paramètres
registerClass('org.gotson.komga.domain.model.SeriesMetadata$Status', SeriesMetadata.Status as never)
registerClass('org.gotson.komga.domain.model.ReadStatus', ReadStatus as never)

const nullableList = (t: Parameters<typeof requestParam>[1]) => ({ nullable: { list: t } }) as Parameters<typeof requestParam>[1]
const optional = { required: false, nullable: true }

// PORT: annotations Spring (@RestController, @RequestMapping, @GetMapping..., @RequestParam, @PreAuthorize...)
restController(SeriesCollectionController, {
  inject: [SeriesCollectionRepository, SeriesCollectionLifecycle, SeriesDtoRepository, ContentDetector, ImageAnalyzer, ThumbnailSeriesCollectionRepository, ApplicationEventPublisher],
  javaName: 'org.gotson.komga.interfaces.api.rest.SeriesCollectionController',
  requestMapping: { path: ['api/v1/collections'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  handlers: {
    getCollections: {
      mapping: { method: 'GET' },
      args: [
        authenticationPrincipal(),
        requestParam('search', { nullable: 'String' }, optional),
        requestParam('library_id', nullableList('String'), optional),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: CollectionDto }] },
      openapi: { operation: { summary: 'List collections', tags: [OpenApiConfiguration.TagNames.COLLECTIONS] }, parameters: [...PageableAsQueryParam] },
    },
    getCollectionById: {
      mapping: { method: 'GET', path: ['{id}'] },
      args: [authenticationPrincipal(), pathVariable('id')],
      returns: { class: CollectionDto },
      openapi: { operation: { summary: 'Get collection details', tags: [OpenApiConfiguration.TagNames.COLLECTIONS] } },
    },
    getCollectionThumbnail: {
      mapping: { method: 'GET', path: ['{id}/thumbnail'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('id')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: "Get collection's poster image", tags: [OpenApiConfiguration.TagNames.COLLECTION_POSTER] }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getCollectionThumbnailById: {
      mapping: { method: 'GET', path: ['{id}/thumbnails/{thumbnailId}'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('id'), pathVariable('thumbnailId')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get collection poster image', tags: [OpenApiConfiguration.TagNames.COLLECTION_POSTER] }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getCollectionThumbnails: {
      mapping: { method: 'GET', path: ['{id}/thumbnails'], produces: [MediaType.APPLICATION_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('id')],
      returns: { list: { class: ThumbnailSeriesCollectionDto } },
      openapi: { operation: { summary: "List collection's posters", tags: [OpenApiConfiguration.TagNames.COLLECTION_POSTER] } },
    },
    addUserUploadedCollectionThumbnail: {
      mapping: { method: 'POST', path: ['{id}/thumbnails'], consumes: [MediaType.MULTIPART_FORM_DATA_VALUE] },
      preAuthorize: "hasRole('ADMIN')",
      args: [authenticationPrincipal(), pathVariable('id'), requestParam('file', { class: MultipartFile }), requestParam('selected', 'Boolean', { hasDefault: true })],
      returns: { class: ThumbnailSeriesCollectionDto },
      openapi: { operation: { summary: 'Add collection poster', tags: [OpenApiConfiguration.TagNames.COLLECTION_POSTER] } },
    },
    markCollectionThumbnailSelected: {
      mapping: { method: 'PUT', path: ['{id}/thumbnails/{thumbnailId}/selected'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [authenticationPrincipal(), pathVariable('id'), pathVariable('thumbnailId')],
      openapi: { operation: { summary: 'Mark collection poster as selected', tags: [OpenApiConfiguration.TagNames.COLLECTION_POSTER] } },
    },
    deleteUserUploadedCollectionThumbnail: {
      mapping: { method: 'DELETE', path: ['{id}/thumbnails/{thumbnailId}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [authenticationPrincipal(), pathVariable('id'), pathVariable('thumbnailId')],
      openapi: { operation: { summary: 'Delete collection poster', tags: [OpenApiConfiguration.TagNames.COLLECTION_POSTER] } },
    },
    createCollection: {
      mapping: { method: 'POST' },
      preAuthorize: "hasRole('ADMIN')",
      args: [requestBody({ class: CollectionCreationDto }, { valid: true })],
      returns: { class: CollectionDto },
      openapi: { operation: { summary: 'Create collection', tags: [OpenApiConfiguration.TagNames.COLLECTIONS] } },
      signature:
        'public org.gotson.komga.interfaces.api.rest.dto.CollectionDto org.gotson.komga.interfaces.api.rest.SeriesCollectionController.createCollection(org.gotson.komga.interfaces.api.rest.dto.CollectionCreationDto)',
    },
    updateCollectionById: {
      mapping: { method: 'PATCH', path: ['{id}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [authenticationPrincipal(), pathVariable('id'), requestBody({ class: CollectionUpdateDto }, { valid: true })],
      openapi: { operation: { summary: 'Update collection', tags: [OpenApiConfiguration.TagNames.COLLECTIONS] } },
      signature:
        'public void org.gotson.komga.interfaces.api.rest.SeriesCollectionController.updateCollectionById(org.gotson.komga.infrastructure.security.KomgaPrincipal,java.lang.String,org.gotson.komga.interfaces.api.rest.dto.CollectionUpdateDto)',
    },
    deleteCollectionById: {
      mapping: { method: 'DELETE', path: ['{id}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [authenticationPrincipal(), pathVariable('id')],
      openapi: { operation: { summary: 'Delete collection', tags: [OpenApiConfiguration.TagNames.COLLECTIONS] } },
    },
    getSeriesByCollectionId: {
      mapping: { method: 'GET', path: ['{id}/series'] },
      args: [
        pathVariable('id'),
        authenticationPrincipal(),
        requestParam('library_id', nullableList('String'), optional),
        requestParam('status', nullableList({ enum: SeriesMetadata.Status }), optional),
        requestParam('read_status', nullableList({ enum: ReadStatus }), optional),
        requestParam('publisher', nullableList('String'), optional),
        requestParam('language', nullableList('String'), optional),
        requestParam('genre', nullableList('String'), optional),
        requestParam('tag', nullableList('String'), optional),
        requestParam('age_rating', nullableList('String'), optional),
        requestParam('release_year', nullableList('String'), optional),
        requestParam('deleted', { nullable: 'Boolean' }, optional),
        requestParam('complete', { nullable: 'Boolean' }, optional),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(Authors(), { hidden: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: SeriesDto }] },
      openapi: { operation: { summary: "List collection's series", tags: [OpenApiConfiguration.TagNames.COLLECTION_SERIES] }, parameters: [...PageableWithoutSortAsQueryParam, ...AuthorsAsQueryParam] },
    },
  },
})
