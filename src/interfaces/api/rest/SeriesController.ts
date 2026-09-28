// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/SeriesController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { HIGHEST_PRIORITY, HIGH_PRIORITY } from '../../../application/tasks/Task.js'
import { TaskEmitter } from '../../../application/tasks/TaskEmitter.js'
import { AlternateTitle } from '../../../domain/model/AlternateTitle.js'
import type { Author } from '../../../domain/model/Author.js'
import { BookSearch } from '../../../domain/model/BookSearch.js'
import { Dimension } from '../../../domain/model/Dimension.js'
import { DomainEvent } from '../../../domain/model/DomainEvent.js'
import { EntityNotFoundException } from '../../../domain/model/Exceptions.js'
import { MarkSelectedPreference } from '../../../domain/model/MarkSelectedPreference.js'
import { Media } from '../../../domain/model/Media.js'
import { MediaType as KomgaMediaType } from '../../../domain/model/MediaType.js'
import { ReadStatus } from '../../../domain/model/ReadStatus.js'
import { SearchCondition } from '../../../domain/model/SearchCondition.js'
import { SearchContext } from '../../../domain/model/SearchContext.js'
import { SearchField } from '../../../domain/model/SearchField.js'
import { SearchOperator } from '../../../domain/model/SearchOperator.js'
import { SeriesMetadata } from '../../../domain/model/SeriesMetadata.js'
import { SeriesSearch } from '../../../domain/model/SeriesSearch.js'
import { ThumbnailSeries } from '../../../domain/model/ThumbnailSeries.js'
import { WebLink } from '../../../domain/model/WebLink.js'
import { BookRepository } from '../../../domain/persistence/BookRepository.js'
import { SeriesCollectionRepository } from '../../../domain/persistence/SeriesCollectionRepository.js'
import { SeriesMetadataRepository } from '../../../domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../domain/persistence/SeriesRepository.js'
import { ThumbnailSeriesRepository } from '../../../domain/persistence/ThumbnailSeriesRepository.js'
import { BookLifecycle } from '../../../domain/service/BookLifecycle.js'
import { SeriesLifecycle } from '../../../domain/service/SeriesLifecycle.js'
import { ImageAnalyzer } from '../../../infrastructure/image/ImageAnalyzer.js'
import { UnpagedSorted } from '../../../infrastructure/jooq/UnpagedSorted.js'
import { ContentDetector } from '../../../infrastructure/mediacontainer/ContentDetector.js'
import { AuthorsAsQueryParam } from '../../../infrastructure/openapi/AuthorsAsQueryParam.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { PageableAsQueryParam, PageableWithoutSortAsQueryParam } from '../../../infrastructure/openapi/PageableAnnotations.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { Authors } from '../../../infrastructure/web/Authors.js'
import { DelimitedPair } from '../../../infrastructure/web/DelimitedPair.js'
import { ContentRestrictionChecker } from '../ContentRestrictionChecker.js'
import { BookDtoRepository } from '../persistence/BookDtoRepository.js'
import { ReadProgressDtoRepository } from '../persistence/ReadProgressDtoRepository.js'
import { SeriesDtoRepository } from '../persistence/SeriesDtoRepository.js'
import { BookDto, restrictUrl as restrictUrlBook } from './dto/BookDto.js'
import { CollectionDto, toDto as toDtoCollection } from './dto/CollectionDto.js'
import { GroupCountDto } from './dto/GroupCountDto.js'
import { SeriesDto, restrictUrl } from './dto/SeriesDto.js'
import { SeriesMetadataUpdateDto } from './dto/SeriesMetadataUpdateDto.js'
import { TachiyomiReadProgressUpdateV2Dto } from './dto/TachiyomiReadProgressUpdateDto.js'
import { TachiyomiReadProgressV2Dto } from './dto/TachiyomiReadProgressV2Dto.js'
import { ThumbnailSeriesDto, toDto } from './dto/ThumbnailSeriesDto.js'
import { registerClass } from '../../../port/jackson.js'
import { JsonTypes } from '../../../port/jackson-mapper.js'
import { BufferedInputStream, ByteArrayInputStream, use } from '../../../port/java-io.js'
import { URI } from '../../../port/java-net.js'
import { IllegalArgumentException, buildList, isNullOrBlank, isNullOrEmpty, mapNotNull, nn } from '../../../port/kotlin.js'
import { toIntOrNull } from '../../../port/kotlin-numbers.js'
import { KotlinLogging } from '../../../port/logging.js'
import { MultipartFile } from '../../../port/servlet.js'
import { ApplicationEventPublisher } from '../../../port/spring.js'
import { FileSystemResource } from '../../../port/spring-core-io.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import {
  HttpHeaders,
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
import { OpenApiTypes } from '../../../port/swagger-annotations.js'
import { Deflater, Zip64Mode, ZipArchiveOutputStream, zipArchiveEntry } from '../../../port/zip-output-stream.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.api.rest.SeriesController')

// @RestController
// @RequestMapping("api", produces = [MediaType.APPLICATION_JSON_VALUE])
export class SeriesController {
  constructor(
    private readonly taskEmitter: TaskEmitter,
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesLifecycle: SeriesLifecycle,
    private readonly seriesMetadataRepository: SeriesMetadataRepository,
    private readonly seriesDtoRepository: SeriesDtoRepository,
    private readonly bookLifecycle: BookLifecycle,
    private readonly bookRepository: BookRepository,
    private readonly bookDtoRepository: BookDtoRepository,
    private readonly collectionRepository: SeriesCollectionRepository,
    private readonly readProgressDtoRepository: ReadProgressDtoRepository,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly contentDetector: ContentDetector,
    private readonly imageAnalyzer: ImageAnalyzer,
    private readonly thumbnailsSeriesRepository: ThumbnailSeriesRepository,
    private readonly contentRestrictionChecker: ContentRestrictionChecker,
  ) {}

  // @Operation(summary = "List series", description = "Use POST /api/v1/series/list instead. Deprecated since 1.19.0.", tags = [OpenApiConfiguration.TagNames.SERIES, OpenApiConfiguration.TagNames.DEPRECATED])
  /** @deprecated use /v1/series/list instead */
  // @PageableAsQueryParam
  // @AuthorsAsQueryParam
  // @GetMapping("v1/series")
  getSeriesDeprecated(
    principal: KomgaPrincipal,
    searchTerm: string | null = null,
    searchRegex: [string, string] | null = null,
    libraryIds: string[] | null = null,
    collectionIds: string[] | null = null,
    metadataStatus: SeriesMetadata.Status[] | null = null,
    readStatus: ReadStatus[] | null = null,
    publishers: string[] | null = null,
    languages: string[] | null = null,
    genres: string[] | null = null,
    tags: string[] | null = null,
    ageRatings: string[] | null = null,
    releaseYears: string[] | null = null,
    sharingLabels: string[] | null = null,
    deleted: boolean | null = null,
    complete: boolean | null = null,
    oneshot: boolean | null = null,
    unpaged: boolean = false,
    authors: Author[] | null = null,
    page: Pageable,
  ): Page<SeriesDto> {
    const sort = page.sort.isSorted ? page.sort : !isNullOrBlank(searchTerm) ? Sort.by('relevance') : Sort.unsorted()

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    const seriesSearch = new SeriesSearch({
      condition: new SearchCondition.AllOfSeries({
        conditions: buildList<SearchCondition.Series>((list) => {
          if (!isNullOrEmpty(libraryIds)) list.push(new SearchCondition.AnyOfSeries({ conditions: libraryIds.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(collectionIds)) list.push(new SearchCondition.AnyOfSeries({ conditions: collectionIds.map((it) => new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(metadataStatus)) list.push(new SearchCondition.AnyOfSeries({ conditions: metadataStatus.map((it) => new SearchCondition.SeriesStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(publishers)) list.push(new SearchCondition.AnyOfSeries({ conditions: publishers.map((it) => new SearchCondition.Publisher({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(languages)) list.push(new SearchCondition.AnyOfSeries({ conditions: languages.map((it) => new SearchCondition.Language({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(genres)) list.push(new SearchCondition.AnyOfSeries({ conditions: genres.map((it) => new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(tags)) list.push(new SearchCondition.AnyOfSeries({ conditions: tags.map((it) => new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(readStatus)) list.push(new SearchCondition.AnyOfSeries({ conditions: readStatus.map((it) => new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(authors))
            list.push(new SearchCondition.AnyOfSeries({ conditions: authors.map((it) => new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: it.name, role: it.role }) }) })) }))
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

          if (!isNullOrEmpty(sharingLabels)) list.push(new SearchCondition.AnyOfSeries({ conditions: sharingLabels.map((it) => new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (oneshot !== null) list.push(new SearchCondition.OneShot({ operator: oneshot ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
          if (complete !== null) list.push(new SearchCondition.Complete({ operator: complete ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
          if (deleted !== null) list.push(new SearchCondition.Deleted({ operator: deleted ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
        }),
      }),
      fullTextSearch: searchTerm,
      regexSearch:
        searchRegex !== null
          ? (() => {
              switch (searchRegex[1].toLowerCase()) {
                case 'title':
                  return [searchRegex[0], SearchField.TITLE] as [string, SearchField]
                case 'title_sort':
                  return [searchRegex[0], SearchField.TITLE_SORT] as [string, SearchField]
                default:
                  return null
              }
            })()
          : null,
    })

    return this.seriesDtoRepository.findAll(seriesSearch, new SearchContext(principal.user), pageRequest).map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  // @Operation(summary = "List series", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @PageableAsQueryParam
  // @PostMapping("v1/series/list")
  getSeries(principal: KomgaPrincipal, search: SeriesSearch, unpaged: boolean = false, page: Pageable): Page<SeriesDto> {
    const sort = page.sort.isSorted ? page.sort : !isNullOrBlank(search.fullTextSearch) ? Sort.by('relevance') : Sort.unsorted()

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.seriesDtoRepository.findAll(search, new SearchContext(principal.user), pageRequest).map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  // @Operation(summary = "List series groups", description = "Use POST /api/v1/series/list/alphabetical-groups instead. Deprecated since 1.19.0.", tags = [OpenApiConfiguration.TagNames.SERIES, OpenApiConfiguration.TagNames.DEPRECATED])
  /** @deprecated use /v1/series/list/alphabetical-groups instead */
  // @AuthorsAsQueryParam
  // @GetMapping("v1/series/alphabetical-groups")
  getSeriesAlphabeticalGroupsDeprecated(
    principal: KomgaPrincipal,
    searchTerm: string | null,
    searchRegex: [string, string] | null,
    libraryIds: string[] | null,
    collectionIds: string[] | null,
    metadataStatus: SeriesMetadata.Status[] | null,
    readStatus: ReadStatus[] | null,
    publishers: string[] | null,
    languages: string[] | null,
    genres: string[] | null,
    tags: string[] | null,
    ageRatings: string[] | null,
    releaseYears: string[] | null,
    sharingLabels: string[] | null = null,
    deleted: boolean | null,
    complete: boolean | null,
    oneshot: boolean | null = null,
    authors: Author[] | null,
    _page: Pageable,
  ): GroupCountDto[] {
    const seriesSearch = new SeriesSearch({
      condition: new SearchCondition.AllOfSeries({
        conditions: buildList<SearchCondition.Series>((list) => {
          if (!isNullOrEmpty(libraryIds)) list.push(new SearchCondition.AnyOfSeries({ conditions: libraryIds.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(collectionIds)) list.push(new SearchCondition.AnyOfSeries({ conditions: collectionIds.map((it) => new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(metadataStatus)) list.push(new SearchCondition.AnyOfSeries({ conditions: metadataStatus.map((it) => new SearchCondition.SeriesStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(publishers)) list.push(new SearchCondition.AnyOfSeries({ conditions: publishers.map((it) => new SearchCondition.Publisher({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(languages)) list.push(new SearchCondition.AnyOfSeries({ conditions: languages.map((it) => new SearchCondition.Language({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(genres)) list.push(new SearchCondition.AnyOfSeries({ conditions: genres.map((it) => new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(tags)) list.push(new SearchCondition.AnyOfSeries({ conditions: tags.map((it) => new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(readStatus)) list.push(new SearchCondition.AnyOfSeries({ conditions: readStatus.map((it) => new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(authors))
            list.push(new SearchCondition.AnyOfSeries({ conditions: authors.map((it) => new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: it.name, role: it.role }) }) })) }))
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

          if (!isNullOrEmpty(sharingLabels)) list.push(new SearchCondition.AnyOfSeries({ conditions: sharingLabels.map((it) => new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (oneshot !== null) list.push(new SearchCondition.OneShot({ operator: oneshot ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
          if (complete !== null) list.push(new SearchCondition.Complete({ operator: complete ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
          if (deleted !== null) list.push(new SearchCondition.Deleted({ operator: deleted ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
        }),
      }),
      fullTextSearch: searchTerm,
      regexSearch:
        searchRegex !== null
          ? (() => {
              switch (searchRegex[1].toLowerCase()) {
                case 'title':
                  return [searchRegex[0], SearchField.TITLE] as [string, SearchField]
                case 'title_sort':
                  return [searchRegex[0], SearchField.TITLE_SORT] as [string, SearchField]
                default:
                  return null
              }
            })()
          : null,
    })

    return this.seriesDtoRepository.countByFirstCharacter(seriesSearch, new SearchContext(principal.user))
  }

  // @Operation(summary = "List series groups", description = "List series grouped by the first character of their sort title.", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @PostMapping("v1/series/list/alphabetical-groups")
  getSeriesAlphabeticalGroups(principal: KomgaPrincipal, search: SeriesSearch): GroupCountDto[] {
    return this.seriesDtoRepository.countByFirstCharacter(search, new SearchContext(principal.user))
  }

  // @Operation(summary = "List latest series", description = "Return recently added or updated series.", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @PageableWithoutSortAsQueryParam
  // @GetMapping("v1/series/latest")
  getSeriesLatest(principal: KomgaPrincipal, libraryIds: string[] | null, deleted: boolean | null, oneshot: boolean | null = null, unpaged: boolean = false, page: Pageable): Page<SeriesDto> {
    const sort = Sort.by(Sort.Order.desc('lastModified'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.seriesDtoRepository
      .findAll(
        new SeriesSearch({
          condition: new SearchCondition.AllOfSeries({
            conditions: buildList<SearchCondition.Series>((list) => {
              if (!isNullOrEmpty(libraryIds)) list.push(new SearchCondition.AnyOfSeries({ conditions: libraryIds.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
              if (deleted !== null) list.push(new SearchCondition.Deleted({ operator: deleted ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
              if (oneshot !== null) list.push(new SearchCondition.OneShot({ operator: oneshot ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
            }),
          }),
        }),
        new SearchContext(principal.user),
        pageRequest,
      )
      .map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  // @Operation(summary = "List new series", description = "Return newly added series.", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @PageableWithoutSortAsQueryParam
  // @GetMapping("v1/series/new")
  getSeriesNew(principal: KomgaPrincipal, libraryIds: string[] | null = null, deleted: boolean | null = null, oneshot: boolean | null = null, unpaged: boolean = false, page: Pageable): Page<SeriesDto> {
    const sort = Sort.by(Sort.Order.desc('created'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.seriesDtoRepository
      .findAll(
        new SeriesSearch({
          condition: new SearchCondition.AllOfSeries({
            conditions: buildList<SearchCondition.Series>((list) => {
              if (!isNullOrEmpty(libraryIds)) list.push(new SearchCondition.AnyOfSeries({ conditions: libraryIds.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
              if (deleted !== null) list.push(new SearchCondition.Deleted({ operator: deleted ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
              if (oneshot !== null) list.push(new SearchCondition.OneShot({ operator: oneshot ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
            }),
          }),
        }),
        new SearchContext(principal.user),
        pageRequest,
      )
      .map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  // @Operation(summary = "List updated series", description = "Return recently updated series, but not newly added ones.", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @PageableWithoutSortAsQueryParam
  // @GetMapping("v1/series/updated")
  getSeriesUpdated(principal: KomgaPrincipal, libraryIds: string[] | null = null, deleted: boolean | null = null, oneshot: boolean | null = null, unpaged: boolean = false, page: Pageable): Page<SeriesDto> {
    const sort = Sort.by(Sort.Order.desc('lastModified'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.seriesDtoRepository
      .findAllRecentlyUpdated(
        new SeriesSearch({
          condition: new SearchCondition.AllOfSeries({
            conditions: buildList<SearchCondition.Series>((list) => {
              if (!isNullOrEmpty(libraryIds)) list.push(new SearchCondition.AnyOfSeries({ conditions: libraryIds.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
              if (deleted !== null) list.push(new SearchCondition.Deleted({ operator: deleted ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
              if (oneshot !== null) list.push(new SearchCondition.OneShot({ operator: oneshot ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
            }),
          }),
        }),
        new SearchContext(principal.user),
        pageRequest,
      )
      .map((it) => restrictUrl(it, !principal.user.isAdmin))
  }

  // @Operation(summary = "Get series details", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @GetMapping("v1/series/{seriesId}")
  // @Throws(EntityNotFoundException::class)
  getSeriesById(principal: KomgaPrincipal, id: string): SeriesDto {
    const it = this.seriesDtoRepository.findByIdOrNull(id, principal.user.id)
    if (it !== null) {
      this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, it)
      return restrictUrl(it, !principal.user.isAdmin)
    }
    throw new EntityNotFoundException()
  }

  // @Operation(summary = "Get series' poster image", tags = [OpenApiConfiguration.TagNames.SERIES_POSTER])
  // @ApiResponse(content = [Content(schema = Schema(type = "string", format = "binary"))])
  // @GetMapping(value = ["v1/series/{seriesId}/thumbnail"], produces = [MediaType.IMAGE_JPEG_VALUE])
  // PORT: async (SeriesLifecycle.getThumbnailBytes génère une mosaïque avec sharp)
  async getSeriesThumbnail(principal: KomgaPrincipal, seriesId: string): Promise<Uint8Array> {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)

    return (await this.seriesLifecycle.getThumbnailBytes(seriesId, principal.user.id)) ?? throwNotFound()
  }

  // @Operation(summary = "Get series poster image", tags = [OpenApiConfiguration.TagNames.SERIES_POSTER])
  // @ApiResponse(content = [Content(schema = Schema(type = "string", format = "binary"))])
  // @GetMapping(value = ["v1/series/{seriesId}/thumbnails/{thumbnailId}"], produces = [MediaType.IMAGE_JPEG_VALUE])
  getSeriesThumbnailById(principal: KomgaPrincipal, seriesId: string, thumbnailId: string): Uint8Array {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)
    this.contentRestrictionChecker.checkContentRestrictionSeriesThumbnail(principal.user, thumbnailId)

    return this.seriesLifecycle.getThumbnailBytesByThumbnailId(thumbnailId) ?? throwNotFound()
  }

  // @Operation(summary = "List series posters", tags = [OpenApiConfiguration.TagNames.SERIES_POSTER])
  // @GetMapping(value = ["v1/series/{seriesId}/thumbnails"], produces = [MediaType.APPLICATION_JSON_VALUE])
  getSeriesThumbnails(principal: KomgaPrincipal, seriesId: string): ThumbnailSeriesDto[] {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)

    return this.thumbnailsSeriesRepository.findAllBySeriesId(seriesId).map((it) => toDto(it))
  }

  // @Operation(summary = "Add series poster", tags = [OpenApiConfiguration.TagNames.SERIES_POSTER])
  // @PostMapping(value = ["v1/series/{seriesId}/thumbnails"], consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
  // @PreAuthorize("hasRole('ADMIN')")
  addUserUploadedSeriesThumbnail(seriesId: string, file: MultipartFile, selected: boolean = true): ThumbnailSeriesDto {
    const series = this.seriesRepository.findByIdOrNull(seriesId) ?? throwNotFound()
    if (series.oneshot) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)

    // PORT: file.inputStream.buffered() -> BufferedInputStream(ByteArrayInputStream(file.bytes))
    const mediaType = use(new BufferedInputStream(new ByteArrayInputStream(file.bytes)), (it) => this.contentDetector.detectMediaType(it))
    if (!this.contentDetector.isImage(mediaType)) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE)

    return toDto(
      this.seriesLifecycle.addThumbnailForSeries(
        new ThumbnailSeries({
          seriesId: series.id,
          thumbnail: file.bytes,
          type: ThumbnailSeries.Type.USER_UPLOADED,
          fileSize: file.bytes.length,
          mediaType: mediaType,
          dimension: this.imageAnalyzer.getDimension(new BufferedInputStream(new ByteArrayInputStream(file.bytes))) ?? new Dimension({ width: 0, height: 0 }),
        }),
        selected ? MarkSelectedPreference.YES : MarkSelectedPreference.NO,
      ),
    )
  }

  // @Operation(summary = "Mark series poster as selected", tags = [OpenApiConfiguration.TagNames.SERIES_POSTER])
  // @PutMapping("v1/series/{seriesId}/thumbnails/{thumbnailId}/selected")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.ACCEPTED)
  markSeriesThumbnailSelected(seriesId: string, thumbnailId: string): void {
    const series = this.seriesRepository.findByIdOrNull(seriesId)
    if (series === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const poster = this.thumbnailsSeriesRepository.findByIdOrNull(thumbnailId)
    if (poster === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (poster.seriesId !== series.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    this.thumbnailsSeriesRepository.markSelected(poster)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailSeriesAdded({ thumbnail: poster.copy({ selected: true }) }))
  }

  // @Operation(summary = "Delete series poster", tags = [OpenApiConfiguration.TagNames.SERIES_POSTER])
  // @DeleteMapping("v1/series/{seriesId}/thumbnails/{thumbnailId}")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.ACCEPTED)
  deleteUserUploadedSeriesThumbnail(seriesId: string, thumbnailId: string): void {
    const series = this.seriesRepository.findByIdOrNull(seriesId)
    if (series === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const poster = this.thumbnailsSeriesRepository.findByIdOrNull(thumbnailId)
    if (poster === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (poster.seriesId !== series.id) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    try {
      this.seriesLifecycle.deleteThumbnailForSeries(poster)
    } catch (e) {
      if (e instanceof IllegalArgumentException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      throw e
    }
  }

  // @Operation(summary = "List series' books", description = "Use POST /api/v1/books/list instead. Deprecated since 1.19.0.", tags = [OpenApiConfiguration.TagNames.SERIES, OpenApiConfiguration.TagNames.DEPRECATED])
  /** @deprecated use /v1/books/list instead */
  // @PageableAsQueryParam
  // @AuthorsAsQueryParam
  // @GetMapping("v1/series/{seriesId}/books")
  getBooksBySeriesId(
    principal: KomgaPrincipal,
    seriesId: string,
    mediaStatus: Media.Status[] | null = null,
    readStatus: ReadStatus[] | null = null,
    tags: string[] | null = null,
    deleted: boolean | null = null,
    unpaged: boolean = false,
    authors: Author[] | null = null,
    page: Pageable,
  ): Page<BookDto> {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)

    const sort = page.sort.isSorted ? page.sort : Sort.by(Sort.Order.asc('metadata.numberSort'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    const search = new BookSearch({
      condition: new SearchCondition.AllOfBook({
        conditions: buildList<SearchCondition.Book>((list) => {
          list.push(new SearchCondition.SeriesId({ operator: new SearchOperator.Is({ value: seriesId }) }))
          if (!isNullOrEmpty(mediaStatus)) list.push(new SearchCondition.AnyOfBook({ conditions: mediaStatus.map((it) => new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(readStatus)) list.push(new SearchCondition.AnyOfBook({ conditions: readStatus.map((it) => new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(tags)) list.push(new SearchCondition.AnyOfBook({ conditions: tags.map((it) => new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: it }) })) }))
          if (!isNullOrEmpty(authors))
            list.push(new SearchCondition.AnyOfBook({ conditions: authors.map((it) => new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: it.name, role: it.role }) }) })) }))
          if (deleted !== null) list.push(new SearchCondition.Deleted({ operator: deleted ? SearchOperator.IsTrue : SearchOperator.IsFalse }))
        }),
      }),
    })
    return this.bookDtoRepository.findAll(search, new SearchContext(principal.user), pageRequest).map((it) => restrictUrlBook(it, !principal.user.isAdmin))
  }

  // @Operation(summary = "List series' collections", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @GetMapping("v1/series/{seriesId}/collections")
  getCollectionsBySeriesId(principal: KomgaPrincipal, seriesId: string): CollectionDto[] {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)

    return this.collectionRepository.findAllContainingSeriesId(seriesId, new SearchContext(principal.user)).map((it) => toDtoCollection(it))
  }

  // @Operation(summary = "Analyze series", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @PostMapping("v1/series/{seriesId}/analyze")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.ACCEPTED)
  seriesAnalyze(seriesId: string): void {
    this.taskEmitter.analyzeBook(this.bookRepository.findAllBySeriesId(seriesId), { priority: HIGH_PRIORITY })
  }

  // @Operation(summary = "Refresh series metadata", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @PostMapping("v1/series/{seriesId}/metadata/refresh")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.ACCEPTED)
  seriesRefreshMetadata(seriesId: string): void {
    const books = this.bookRepository.findAllBySeriesId(seriesId)
    this.taskEmitter.refreshBookMetadata(books, { priority: HIGH_PRIORITY })
    this.taskEmitter.refreshBookLocalArtwork(books, { priority: HIGH_PRIORITY })
    this.taskEmitter.refreshSeriesLocalArtwork(seriesId, { priority: HIGH_PRIORITY })
  }

  // @Operation(summary = "Update series metadata", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @PatchMapping("v1/series/{seriesId}/metadata")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  updateSeriesMetadata(
    seriesId: string,
    // @Parameter(description = "Metadata fields to update. Set a field to null to unset the metadata. You can omit fields you don't want to update.")
    newMetadata: SeriesMetadataUpdateDto,
    _principal: KomgaPrincipal,
  ): void {
    const existing = this.seriesMetadataRepository.findByIdOrNull(seriesId)
    if (existing === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const updated = ((it: SeriesMetadataUpdateDto) =>
      existing.copy({
        status: it.status ?? existing.status,
        statusLock: it.statusLock ?? existing.statusLock,
        title: it.title ?? existing.title,
        titleLock: it.titleLock ?? existing.titleLock,
        titleSort: it.titleSort ?? existing.titleSort,
        titleSortLock: it.titleSortLock ?? existing.titleSortLock,
        summary: it.summary ?? existing.summary,
        summaryLock: it.summaryLock ?? existing.summaryLock,
        language: it.language ?? existing.language,
        languageLock: it.languageLock ?? existing.languageLock,
        readingDirection: it.isSet('readingDirection') ? it.readingDirection : existing.readingDirection,
        readingDirectionLock: it.readingDirectionLock ?? existing.readingDirectionLock,
        publisher: it.publisher ?? existing.publisher,
        publisherLock: it.publisherLock ?? existing.publisherLock,
        ageRating: it.isSet('ageRating') ? it.ageRating : existing.ageRating,
        ageRatingLock: it.ageRatingLock ?? existing.ageRatingLock,
        genres: it.isSet('genres') ? (it.genres !== null ? nn(it.genres) : new Set()) : existing.genres,
        genresLock: it.genresLock ?? existing.genresLock,
        tags: it.isSet('tags') ? (it.tags !== null ? nn(it.tags) : new Set()) : existing.tags,
        tagsLock: it.tagsLock ?? existing.tagsLock,
        totalBookCount: it.isSet('totalBookCount') ? it.totalBookCount : existing.totalBookCount,
        totalBookCountLock: it.totalBookCountLock ?? existing.totalBookCountLock,
        sharingLabels: it.isSet('sharingLabels') ? (it.sharingLabels !== null ? nn(it.sharingLabels) : new Set()) : existing.sharingLabels,
        sharingLabelsLock: it.sharingLabelsLock ?? existing.sharingLabelsLock,
        links: it.isSet('links') ? (it.links !== null ? nn(it.links).map((l) => new WebLink({ label: nn(l.label), url: new URI(nn(l.url)) })) : []) : existing.links,
        linksLock: it.linksLock ?? existing.linksLock,
        alternateTitles: it.isSet('alternateTitles')
          ? it.alternateTitles !== null
            ? nn(it.alternateTitles).map((a) => new AlternateTitle({ label: nn(a.label), title: nn(a.title) }))
            : []
          : existing.alternateTitles,
        alternateTitlesLock: it.alternateTitlesLock ?? existing.alternateTitlesLock,
      }))(newMetadata)
    this.seriesMetadataRepository.update(updated)

    const series = this.seriesRepository.findByIdOrNull(seriesId)
    if (series !== null) this.eventPublisher.publishEvent(new DomainEvent.SeriesUpdated({ series }))
    // PORT: ce `?.let` est la dernière expression du `let` externe : null (série absente) déclenche le `?: throw` externe
    else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @Operation(summary = "Mark series as read", description = "Mark all book for series as read", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @PostMapping("v1/series/{seriesId}/read-progress")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  markSeriesAsRead(seriesId: string, principal: KomgaPrincipal): void {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)

    this.seriesLifecycle.markReadProgressCompleted(seriesId, principal.user)
  }

  // @Operation(summary = "Mark series as unread", description = "Mark all book for series as unread", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @DeleteMapping("v1/series/{seriesId}/read-progress")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  markSeriesAsUnread(seriesId: string, principal: KomgaPrincipal): void {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)

    this.seriesLifecycle.deleteReadProgress(seriesId, principal.user)
  }

  // @Operation(summary = "Get series read progress (Mihon)", description = "Mihon specific, due to how read progress is handled in Mihon.", tags = [OpenApiConfiguration.TagNames.MIHON])
  // @GetMapping("v2/series/{seriesId}/read-progress/tachiyomi")
  getMihonReadProgressBySeriesId(seriesId: string, principal: KomgaPrincipal): TachiyomiReadProgressV2Dto {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)

    return this.readProgressDtoRepository.findProgressV2BySeries(seriesId, principal.user.id)
  }

  // @Operation(summary = "Update series read progress (Mihon)", description = "Mihon specific, due to how read progress is handled in Mihon.", tags = [OpenApiConfiguration.TagNames.MIHON])
  // @PutMapping("v2/series/{seriesId}/read-progress/tachiyomi")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  updateMihonReadProgressBySeriesId(seriesId: string, readProgress: TachiyomiReadProgressUpdateV2Dto, principal: KomgaPrincipal): void {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)

    this.bookDtoRepository
      .findAll(new BookSearch({ condition: new SearchCondition.SeriesId({ operator: new SearchOperator.Is({ value: seriesId }) }) }), new SearchContext(principal.user), new UnpagedSorted(Sort.by(Sort.Order.asc('metadata.numberSort'))))
      .toList()
      .filter((book) => book.metadata.numberSort <= readProgress.lastBookNumberSortRead)
      .forEach((book) => {
        if (book.readProgress?.completed !== true) this.bookLifecycle.markReadProgressCompleted(book.id, principal.user)
      })
  }

  // @Operation(summary = "Download series", description = "Download the whole series as a ZIP file.", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @GetMapping("v1/series/{seriesId}/file", produces = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
  // @PreAuthorize("hasRole('FILE_DOWNLOAD')")
  downloadSeriesAsZip(principal: KomgaPrincipal, seriesId: string): ResponseEntity<StreamingResponseBody> {
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, seriesId)

    const books = this.bookRepository.findAllBySeriesId(seriesId)

    // PORT: StreamingResponseBody asynchrone (écritures avec contre-pression), `use` -> try/finally
    const streamingResponse = streamingResponseBody(async (responseStream) => {
      const zipStream = new ZipArchiveOutputStream(responseStream)
      try {
        zipStream.setMethod(ZipArchiveOutputStream.DEFLATED)
        zipStream.setLevel(Deflater.NO_COMPRESSION)
        zipStream.setUseZip64(Zip64Mode.Always)
        for (const book of books) {
          const file = new FileSystemResource(book.path)
          if (!file.exists()) {
            logger.warn(() => `Book file not found, skipping archive entry: ${file.path}`)
            continue
          }

          logger.debug(() => `Adding file to zip archive: ${file.path}`)
          // PORT: file.inputStream.use { IOUtils.copyLarge(it, zipStream, ByteArray(8192)) } -> itération du flux de lecture
          const it = file.getInputStream()
          try {
            await zipStream.putArchiveEntry(zipArchiveEntry(nn(file.filename)))
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
      .headersFrom((it: HttpHeaders) => it.setContentDisposition(contentDisposition('attachment', `${this.seriesMetadataRepository.findById(seriesId).title}.zip`, true)))
      .contentType(MediaType.parseMediaType(KomgaMediaType.ZIP.type))
      .body(streamingResponse)
  }

  // @Operation(summary = "Delete series files", description = "Delete all of the series' books files on disk.", tags = [OpenApiConfiguration.TagNames.SERIES])
  // @DeleteMapping("v1/series/{seriesId}/file")
  // @PreAuthorize("hasRole('ADMIN')")
  // @ResponseStatus(HttpStatus.ACCEPTED)
  deleteSeriesFile(seriesId: string): void {
    this.taskEmitter.deleteSeries(seriesId, { priority: HIGHEST_PRIORITY })
  }
}

// PORT: `?: throw ResponseStatusException(HttpStatus.NOT_FOUND)` en position d'expression
function throwNotFound(): never {
  throw new ResponseStatusException(HttpStatus.NOT_FOUND)
}

// PORT: noms qualifiés Java des enums, pour les messages d'erreur de conversion des paramètres
registerClass('org.gotson.komga.domain.model.SeriesMetadata$Status', SeriesMetadata.Status as never)
registerClass('org.gotson.komga.domain.model.ReadStatus', ReadStatus as never)
registerClass('org.gotson.komga.domain.model.Media$Status', Media.Status as never)

const nullableList = (t: Parameters<typeof requestParam>[1]) => ({ nullable: { list: t } }) as Parameters<typeof requestParam>[1]
const optional = { required: false, nullable: true }

// PORT: annotations Spring (@RestController, @RequestMapping, @GetMapping..., @RequestParam, @PreAuthorize...)
restController(SeriesController, {
  inject: [
    TaskEmitter,
    SeriesRepository,
    SeriesLifecycle,
    SeriesMetadataRepository,
    SeriesDtoRepository,
    BookLifecycle,
    BookRepository,
    BookDtoRepository,
    SeriesCollectionRepository,
    ReadProgressDtoRepository,
    ApplicationEventPublisher,
    ContentDetector,
    ImageAnalyzer,
    ThumbnailSeriesRepository,
    ContentRestrictionChecker,
  ],
  javaName: 'org.gotson.komga.interfaces.api.rest.SeriesController',
  requestMapping: { path: ['api'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  handlers: {
    getSeriesDeprecated: {
      mapping: { method: 'GET', path: ['v1/series'] },
      args: [
        authenticationPrincipal(),
        requestParam('search', { nullable: 'String' }, optional),
        withParameter(DelimitedPair('search_regex'), { hidden: true }),
        requestParam('library_id', nullableList('String'), optional),
        requestParam('collection_id', nullableList('String'), optional),
        requestParam('status', nullableList({ enum: SeriesMetadata.Status }), optional),
        requestParam('read_status', nullableList({ enum: ReadStatus }), optional),
        requestParam('publisher', nullableList('String'), optional),
        requestParam('language', nullableList('String'), optional),
        requestParam('genre', nullableList('String'), optional),
        requestParam('tag', nullableList('String'), optional),
        requestParam('age_rating', nullableList('String'), optional),
        requestParam('release_year', nullableList('String'), optional),
        requestParam('sharing_label', nullableList('String'), optional),
        requestParam('deleted', { nullable: 'Boolean' }, optional),
        requestParam('complete', { nullable: 'Boolean' }, optional),
        requestParam('oneshot', { nullable: 'Boolean' }, optional),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(Authors(), { hidden: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: SeriesDto }] },
      openapi: { operation: { summary: 'List series', description: 'Use POST /api/v1/series/list instead. Deprecated since 1.19.0.', tags: [OpenApiConfiguration.TagNames.SERIES, OpenApiConfiguration.TagNames.DEPRECATED] }, deprecated: true, parameters: [{ description: 'Search by regex criteria, in the form: regex,field. Supported fields are TITLE and TITLE_SORT.', in: 'query', name: 'search_regex', schema: { type: 'string' } }, ...PageableAsQueryParam, ...AuthorsAsQueryParam] },
    },
    getSeries: {
      mapping: { method: 'POST', path: ['v1/series/list'] },
      args: [authenticationPrincipal(), requestBody({ class: SeriesSearch }), requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }), withParameter(pageable(), { hidden: true })],
      signature:
        'public org.springframework.data.domain.Page<org.gotson.komga.interfaces.api.rest.dto.SeriesDto> org.gotson.komga.interfaces.api.rest.SeriesController.getSeries(org.gotson.komga.infrastructure.security.KomgaPrincipal,org.gotson.komga.domain.model.SeriesSearch,boolean,org.springframework.data.domain.Pageable)',
      returns: { class: PageImpl, args: [{ class: SeriesDto }] },
      openapi: { operation: { summary: 'List series', tags: [OpenApiConfiguration.TagNames.SERIES] }, parameters: [...PageableAsQueryParam] },
    },
    getSeriesAlphabeticalGroupsDeprecated: {
      mapping: { method: 'GET', path: ['v1/series/alphabetical-groups'] },
      args: [
        authenticationPrincipal(),
        requestParam('search', { nullable: 'String' }, optional),
        withParameter(DelimitedPair('search_regex'), { hidden: true }),
        requestParam('library_id', nullableList('String'), optional),
        requestParam('collection_id', nullableList('String'), optional),
        requestParam('status', nullableList({ enum: SeriesMetadata.Status }), optional),
        requestParam('read_status', nullableList({ enum: ReadStatus }), optional),
        requestParam('publisher', nullableList('String'), optional),
        requestParam('language', nullableList('String'), optional),
        requestParam('genre', nullableList('String'), optional),
        requestParam('tag', nullableList('String'), optional),
        requestParam('age_rating', nullableList('String'), optional),
        requestParam('release_year', nullableList('String'), optional),
        requestParam('sharing_label', nullableList('String'), optional),
        requestParam('deleted', { nullable: 'Boolean' }, optional),
        requestParam('complete', { nullable: 'Boolean' }, optional),
        requestParam('oneshot', { nullable: 'Boolean' }, optional),
        withParameter(Authors(), { hidden: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { list: { class: GroupCountDto } },
      openapi: { operation: { summary: 'List series groups', description: 'Use POST /api/v1/series/list/alphabetical-groups instead. Deprecated since 1.19.0.', tags: [OpenApiConfiguration.TagNames.SERIES, OpenApiConfiguration.TagNames.DEPRECATED] }, deprecated: true, parameters: [{ description: 'Search by regex criteria, in the form: regex,field. Supported fields are TITLE and TITLE_SORT.', in: 'query', name: 'search_regex', schema: { type: 'string' } }, ...AuthorsAsQueryParam] },
    },
    getSeriesAlphabeticalGroups: {
      mapping: { method: 'POST', path: ['v1/series/list/alphabetical-groups'] },
      args: [authenticationPrincipal(), requestBody({ class: SeriesSearch })],
      signature:
        'public java.util.List<org.gotson.komga.interfaces.api.rest.dto.GroupCountDto> org.gotson.komga.interfaces.api.rest.SeriesController.getSeriesAlphabeticalGroups(org.gotson.komga.infrastructure.security.KomgaPrincipal,org.gotson.komga.domain.model.SeriesSearch)',
      returns: { list: { class: GroupCountDto } },
      openapi: { operation: { summary: 'List series groups', description: 'List series grouped by the first character of their sort title.', tags: [OpenApiConfiguration.TagNames.SERIES] } },
    },
    getSeriesLatest: {
      mapping: { method: 'GET', path: ['v1/series/latest'] },
      args: [
        authenticationPrincipal(),
        requestParam('library_id', nullableList('String'), optional),
        requestParam('deleted', { nullable: 'Boolean' }, optional),
        requestParam('oneshot', { nullable: 'Boolean' }, optional),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: SeriesDto }] },
      openapi: { operation: { summary: 'List latest series', description: 'Return recently added or updated series.', tags: [OpenApiConfiguration.TagNames.SERIES] }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getSeriesNew: {
      mapping: { method: 'GET', path: ['v1/series/new'] },
      args: [
        authenticationPrincipal(),
        requestParam('library_id', nullableList('String'), optional),
        requestParam('deleted', { nullable: 'Boolean' }, optional),
        requestParam('oneshot', { nullable: 'Boolean' }, optional),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: SeriesDto }] },
      openapi: { operation: { summary: 'List new series', description: 'Return newly added series.', tags: [OpenApiConfiguration.TagNames.SERIES] }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getSeriesUpdated: {
      mapping: { method: 'GET', path: ['v1/series/updated'] },
      args: [
        authenticationPrincipal(),
        requestParam('library_id', nullableList('String'), optional),
        requestParam('deleted', { nullable: 'Boolean' }, optional),
        requestParam('oneshot', { nullable: 'Boolean' }, optional),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: SeriesDto }] },
      openapi: { operation: { summary: 'List updated series', description: 'Return recently updated series, but not newly added ones.', tags: [OpenApiConfiguration.TagNames.SERIES] }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getSeriesById: {
      mapping: { method: 'GET', path: ['v1/series/{seriesId}'] },
      args: [authenticationPrincipal(), pathVariable('seriesId')],
      returns: { class: SeriesDto },
      openapi: { operation: { summary: 'Get series details', tags: [OpenApiConfiguration.TagNames.SERIES] }, throws: [EntityNotFoundException] },
    },
    getSeriesThumbnail: {
      mapping: { method: 'GET', path: ['v1/series/{seriesId}/thumbnail'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('seriesId')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: "Get series' poster image", tags: [OpenApiConfiguration.TagNames.SERIES_POSTER] }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getSeriesThumbnailById: {
      mapping: { method: 'GET', path: ['v1/series/{seriesId}/thumbnails/{thumbnailId}'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('seriesId'), pathVariable('thumbnailId')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get series poster image', tags: [OpenApiConfiguration.TagNames.SERIES_POSTER] }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getSeriesThumbnails: {
      mapping: { method: 'GET', path: ['v1/series/{seriesId}/thumbnails'], produces: [MediaType.APPLICATION_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('seriesId')],
      returns: { list: { class: ThumbnailSeriesDto } },
      openapi: { operation: { summary: 'List series posters', tags: [OpenApiConfiguration.TagNames.SERIES_POSTER] } },
    },
    addUserUploadedSeriesThumbnail: {
      mapping: { method: 'POST', path: ['v1/series/{seriesId}/thumbnails'], consumes: [MediaType.MULTIPART_FORM_DATA_VALUE] },
      preAuthorize: "hasRole('ADMIN')",
      args: [pathVariable('seriesId'), requestParam('file', { class: MultipartFile }), requestParam('selected', 'Boolean', { hasDefault: true })],
      returns: { class: ThumbnailSeriesDto },
      openapi: { operation: { summary: 'Add series poster', tags: [OpenApiConfiguration.TagNames.SERIES_POSTER] } },
    },
    markSeriesThumbnailSelected: {
      mapping: { method: 'PUT', path: ['v1/series/{seriesId}/thumbnails/{thumbnailId}/selected'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('seriesId'), pathVariable('thumbnailId')],
      openapi: { operation: { summary: 'Mark series poster as selected', tags: [OpenApiConfiguration.TagNames.SERIES_POSTER] } },
    },
    deleteUserUploadedSeriesThumbnail: {
      mapping: { method: 'DELETE', path: ['v1/series/{seriesId}/thumbnails/{thumbnailId}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('seriesId'), pathVariable('thumbnailId')],
      openapi: { operation: { summary: 'Delete series poster', tags: [OpenApiConfiguration.TagNames.SERIES_POSTER] } },
    },
    getBooksBySeriesId: {
      mapping: { method: 'GET', path: ['v1/series/{seriesId}/books'] },
      args: [
        authenticationPrincipal(),
        pathVariable('seriesId'),
        requestParam('media_status', nullableList({ enum: Media.Status }), optional),
        requestParam('read_status', nullableList({ enum: ReadStatus }), optional),
        requestParam('tag', nullableList('String'), optional),
        requestParam('deleted', { nullable: 'Boolean' }, optional),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        withParameter(Authors(), { hidden: true }),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: BookDto }] },
      openapi: { operation: { summary: "List series' books", description: 'Use POST /api/v1/books/list instead. Deprecated since 1.19.0.', tags: [OpenApiConfiguration.TagNames.SERIES, OpenApiConfiguration.TagNames.DEPRECATED] }, deprecated: true, parameters: [...PageableAsQueryParam, ...AuthorsAsQueryParam] },
    },
    getCollectionsBySeriesId: {
      mapping: { method: 'GET', path: ['v1/series/{seriesId}/collections'] },
      args: [authenticationPrincipal(), pathVariable('seriesId')],
      returns: { list: { class: CollectionDto } },
      openapi: { operation: { summary: "List series' collections", tags: [OpenApiConfiguration.TagNames.SERIES] } },
    },
    seriesAnalyze: {
      mapping: { method: 'POST', path: ['v1/series/{seriesId}/analyze'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('seriesId')],
      openapi: { operation: { summary: 'Analyze series', tags: [OpenApiConfiguration.TagNames.SERIES] } },
    },
    seriesRefreshMetadata: {
      mapping: { method: 'POST', path: ['v1/series/{seriesId}/metadata/refresh'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('seriesId')],
      openapi: { operation: { summary: 'Refresh series metadata', tags: [OpenApiConfiguration.TagNames.SERIES] } },
    },
    updateSeriesMetadata: {
      mapping: { method: 'PATCH', path: ['v1/series/{seriesId}/metadata'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [
        pathVariable('seriesId'),
        withParameter(requestBody({ class: SeriesMetadataUpdateDto }, { valid: true }), {
          description: "Metadata fields to update. Set a field to null to unset the metadata. You can omit fields you don't want to update.",
        }),
        authenticationPrincipal(),
      ],
      signature:
        'public void org.gotson.komga.interfaces.api.rest.SeriesController.updateSeriesMetadata(java.lang.String,org.gotson.komga.interfaces.api.rest.dto.SeriesMetadataUpdateDto,org.gotson.komga.infrastructure.security.KomgaPrincipal)',
      openapi: { operation: { summary: 'Update series metadata', tags: [OpenApiConfiguration.TagNames.SERIES] } },
    },
    markSeriesAsRead: {
      mapping: { method: 'POST', path: ['v1/series/{seriesId}/read-progress'] },
      responseStatus: HttpStatus.NO_CONTENT,
      args: [pathVariable('seriesId'), authenticationPrincipal()],
      openapi: { operation: { summary: 'Mark series as read', description: 'Mark all book for series as read', tags: [OpenApiConfiguration.TagNames.SERIES] } },
    },
    markSeriesAsUnread: {
      mapping: { method: 'DELETE', path: ['v1/series/{seriesId}/read-progress'] },
      responseStatus: HttpStatus.NO_CONTENT,
      args: [pathVariable('seriesId'), authenticationPrincipal()],
      openapi: { operation: { summary: 'Mark series as unread', description: 'Mark all book for series as unread', tags: [OpenApiConfiguration.TagNames.SERIES] } },
    },
    getMihonReadProgressBySeriesId: {
      mapping: { method: 'GET', path: ['v2/series/{seriesId}/read-progress/tachiyomi'] },
      args: [pathVariable('seriesId'), authenticationPrincipal()],
      returns: { class: TachiyomiReadProgressV2Dto },
      openapi: { operation: { summary: 'Get series read progress (Mihon)', description: 'Mihon specific, due to how read progress is handled in Mihon.', tags: [OpenApiConfiguration.TagNames.MIHON] } },
    },
    updateMihonReadProgressBySeriesId: {
      mapping: { method: 'PUT', path: ['v2/series/{seriesId}/read-progress/tachiyomi'] },
      responseStatus: HttpStatus.NO_CONTENT,
      args: [pathVariable('seriesId'), requestBody({ class: TachiyomiReadProgressUpdateV2Dto }), authenticationPrincipal()],
      signature:
        'public void org.gotson.komga.interfaces.api.rest.SeriesController.updateMihonReadProgressBySeriesId(java.lang.String,org.gotson.komga.interfaces.api.rest.dto.TachiyomiReadProgressUpdateV2Dto,org.gotson.komga.infrastructure.security.KomgaPrincipal)',
      openapi: { operation: { summary: 'Update series read progress (Mihon)', description: 'Mihon specific, due to how read progress is handled in Mihon.', tags: [OpenApiConfiguration.TagNames.MIHON] } },
    },
    downloadSeriesAsZip: {
      mapping: { method: 'GET', path: ['v1/series/{seriesId}/file'], produces: [MediaType.APPLICATION_OCTET_STREAM_VALUE] },
      preAuthorize: "hasRole('FILE_DOWNLOAD')",
      args: [authenticationPrincipal(), pathVariable('seriesId')],
      returns: OpenApiTypes.StreamingResponseBody,
      openapi: { operation: { summary: 'Download series', description: 'Download the whole series as a ZIP file.', tags: [OpenApiConfiguration.TagNames.SERIES] } },
    },
    deleteSeriesFile: {
      mapping: { method: 'DELETE', path: ['v1/series/{seriesId}/file'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('seriesId')],
      openapi: { operation: { summary: 'Delete series files', description: "Delete all of the series' books files on disk.", tags: [OpenApiConfiguration.TagNames.SERIES] } },
    },
  },
})
