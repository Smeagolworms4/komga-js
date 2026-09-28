// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/ReferentialV2Controller.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { FilterBy, FilterByEntity, FilterTags } from '../../../domain/model/FilterBy.js'
import { SearchContext } from '../../../domain/model/SearchContext.js'
import { ReferentialRepository } from '../../../domain/persistence/ReferentialRepository.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { AuthorDto, toDto } from './dto/AuthorDto.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { PageableWithoutSortAsQueryParam } from '../../../infrastructure/openapi/PageableAnnotations.js'
import { registerClass } from '../../../port/jackson.js'
import { type Page, PageImpl, PageRequest, Pageable } from '../../../port/spring-data.js'
import { MediaType, authenticationPrincipal, pageable, requestParam, restController, withParameter } from '../../../port/spring-web.js'

// @RestController
// @RequestMapping("api/v2", produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.REFERENTIAL)
export class ReferentialV2Controller {
  constructor(private readonly referentialRepository: ReferentialRepository) {}

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("authors")
  // @Operation(summary = "List authors", description = "Can be filtered by various criteria")
  getAuthors(
    principal: KomgaPrincipal,
    search: string | null,
    role: string | null,
    libraryIds: ReadonlySet<string> = new Set(),
    collectionIds: ReadonlySet<string> = new Set(),
    seriesIds: ReadonlySet<string> = new Set(),
    readListIds: ReadonlySet<string> = new Set(),
    unpaged: boolean = false,
    page: Pageable,
  ): Page<AuthorDto> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : seriesIds.size > 0
            ? new FilterBy({ type: FilterByEntity.SERIES, ids: seriesIds })
            : readListIds.size > 0
              ? new FilterBy({ type: FilterByEntity.READLIST, ids: readListIds })
              : null

    return this.referentialRepository.findAuthors(new SearchContext(principal.user), search, role, filterBy, pageRequest).map((it) => toDto(it))
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("authors/roles")
  // @Operation(summary = "List authors roles", description = "Can be filtered by various criteria")
  getAuthorsRoles(
    principal: KomgaPrincipal,
    libraryIds: ReadonlySet<string> = new Set(),
    collectionIds: ReadonlySet<string> = new Set(),
    seriesIds: ReadonlySet<string> = new Set(),
    readListIds: ReadonlySet<string> = new Set(),
    unpaged: boolean = false,
    page: Pageable,
  ): Page<string> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : seriesIds.size > 0
            ? new FilterBy({ type: FilterByEntity.SERIES, ids: seriesIds })
            : readListIds.size > 0
              ? new FilterBy({ type: FilterByEntity.READLIST, ids: readListIds })
              : null

    return this.referentialRepository.findAuthorsRoles(new SearchContext(principal.user), filterBy, pageRequest)
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("authors/names")
  // @Operation(summary = "List authors names", description = "Can be filtered by various criteria")
  getAuthorsNames(
    principal: KomgaPrincipal,
    search: string | null,
    role: string | null,
    libraryIds: ReadonlySet<string> = new Set(),
    collectionIds: ReadonlySet<string> = new Set(),
    seriesIds: ReadonlySet<string> = new Set(),
    readListIds: ReadonlySet<string> = new Set(),
    unpaged: boolean = false,
    page: Pageable,
  ): Page<string> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : seriesIds.size > 0
            ? new FilterBy({ type: FilterByEntity.SERIES, ids: seriesIds })
            : readListIds.size > 0
              ? new FilterBy({ type: FilterByEntity.READLIST, ids: readListIds })
              : null

    return this.referentialRepository.findAuthorsNames(new SearchContext(principal.user), search, role, filterBy, pageRequest)
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("genres")
  // @Operation(summary = "List genres", description = "Can be filtered by various criteria")
  getGenres(principal: KomgaPrincipal, search: string | null, libraryIds: ReadonlySet<string> = new Set(), collectionIds: ReadonlySet<string> = new Set(), unpaged: boolean = false, page: Pageable): Page<string> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : null

    return this.referentialRepository.findGenres(new SearchContext(principal.user), search, filterBy, pageRequest)
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("sharing-labels")
  // @Operation(summary = "List sharing labels", description = "Can be filtered by various criteria")
  getSharingLabels(principal: KomgaPrincipal, search: string | null, libraryIds: ReadonlySet<string> = new Set(), collectionIds: ReadonlySet<string> = new Set(), unpaged: boolean = false, page: Pageable): Page<string> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : null

    return this.referentialRepository.findSharingLabels(new SearchContext(principal.user), search, filterBy, pageRequest)
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("languages")
  // @Operation(summary = "List languages", description = "Can be filtered by various criteria")
  getLanguages(principal: KomgaPrincipal, search: string | null, libraryIds: ReadonlySet<string> = new Set(), collectionIds: ReadonlySet<string> = new Set(), unpaged: boolean = false, page: Pageable): Page<string> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : null

    return this.referentialRepository.findLanguages(new SearchContext(principal.user), search, filterBy, pageRequest)
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("publishers")
  // @Operation(summary = "List publishers", description = "Can be filtered by various criteria")
  getPublishers(principal: KomgaPrincipal, search: string | null, libraryIds: ReadonlySet<string> = new Set(), collectionIds: ReadonlySet<string> = new Set(), unpaged: boolean = false, page: Pageable): Page<string> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : null

    return this.referentialRepository.findPublishers(new SearchContext(principal.user), search, filterBy, pageRequest)
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("tags")
  // @Operation(summary = "List tags", description = "Can be filtered by various criteria")
  getTags(
    principal: KomgaPrincipal,
    search: string | null,
    libraryIds: ReadonlySet<string> = new Set(),
    collectionIds: ReadonlySet<string> = new Set(),
    seriesIds: ReadonlySet<string> = new Set(),
    readListIds: ReadonlySet<string> = new Set(),
    includeTags: FilterTags = FilterTags.BOTH,
    unpaged: boolean = false,
    page: Pageable,
  ): Page<string> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : seriesIds.size > 0
            ? new FilterBy({ type: FilterByEntity.SERIES, ids: seriesIds })
            : readListIds.size > 0
              ? new FilterBy({ type: FilterByEntity.READLIST, ids: readListIds })
              : null

    return this.referentialRepository.findTags(new SearchContext(principal.user), search, filterBy, includeTags, pageRequest)
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("series/release-years")
  // @Operation(summary = "List series release years", description = "Can be filtered by various criteria")
  getSeriesReleaseYears(principal: KomgaPrincipal, libraryIds: ReadonlySet<string> = new Set(), collectionIds: ReadonlySet<string> = new Set(), unpaged: boolean = false, page: Pageable): Page<string> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : null

    return this.referentialRepository.findSeriesReleaseYears(new SearchContext(principal.user), filterBy, pageRequest)
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("age-ratings")
  // @Operation(summary = "List age ratings", description = "Can be filtered by various criteria")
  getAgeRatings(principal: KomgaPrincipal, libraryIds: ReadonlySet<string> = new Set(), collectionIds: ReadonlySet<string> = new Set(), unpaged: boolean = false, page: Pageable): Page<number> {
    const pageRequest = unpaged ? Pageable.unpaged() : PageRequest.of(page.pageNumber, page.pageSize)

    const filterBy =
      libraryIds.size > 0
        ? new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
        : collectionIds.size > 0
          ? new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
          : null

    return this.referentialRepository.findAgeRatings(new SearchContext(principal.user), filterBy, pageRequest)
  }
}

// PORT: nom qualifié Java de l'enum, pour les messages d'erreur de conversion des paramètres
registerClass('org.gotson.komga.domain.model.FilterTags', FilterTags as never)

// `@RequestParam(name = ..., required = false) x: Set<String> = emptySet()`
const setParam = (name: string) => requestParam(name, { set: 'String' }, { required: false, hasDefault: true })
// `@RequestParam(name = ..., required = false) x: String?`
const nullableString = (name: string) => requestParam(name, { nullable: 'String' }, { required: false, nullable: true })
const unpagedParam = () => requestParam('unpaged', 'Boolean', { required: false, hasDefault: true })

// PORT: annotations Spring (@RestController, @RequestMapping, @GetMapping, @RequestParam)
restController(ReferentialV2Controller, {
  inject: [ReferentialRepository],
  javaName: 'org.gotson.komga.interfaces.api.rest.ReferentialV2Controller',
  requestMapping: { path: ['api/v2'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.REFERENTIAL] },
  handlers: {
    getAuthors: {
      mapping: { method: 'GET', path: ['authors'] },
      args: [
        authenticationPrincipal(),
        nullableString('search'),
        nullableString('role'),
        setParam('library_id'),
        setParam('collection_id'),
        setParam('series_id'),
        setParam('readlist_id'),
        unpagedParam(),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: [{ class: AuthorDto }] },
      openapi: { operation: { summary: 'List authors', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getAuthorsRoles: {
      mapping: { method: 'GET', path: ['authors/roles'] },
      args: [authenticationPrincipal(), setParam('library_id'), setParam('collection_id'), setParam('series_id'), setParam('readlist_id'), unpagedParam(), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: ['String'] },
      openapi: { operation: { summary: 'List authors roles', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getAuthorsNames: {
      mapping: { method: 'GET', path: ['authors/names'] },
      args: [
        authenticationPrincipal(),
        nullableString('search'),
        nullableString('role'),
        setParam('library_id'),
        setParam('collection_id'),
        setParam('series_id'),
        setParam('readlist_id'),
        unpagedParam(),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: ['String'] },
      openapi: { operation: { summary: 'List authors names', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getGenres: {
      mapping: { method: 'GET', path: ['genres'] },
      args: [authenticationPrincipal(), nullableString('search'), setParam('library_id'), setParam('collection_id'), unpagedParam(), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: ['String'] },
      openapi: { operation: { summary: 'List genres', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getSharingLabels: {
      mapping: { method: 'GET', path: ['sharing-labels'] },
      args: [authenticationPrincipal(), nullableString('search'), setParam('library_id'), setParam('collection_id'), unpagedParam(), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: ['String'] },
      openapi: { operation: { summary: 'List sharing labels', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getLanguages: {
      mapping: { method: 'GET', path: ['languages'] },
      args: [authenticationPrincipal(), nullableString('search'), setParam('library_id'), setParam('collection_id'), unpagedParam(), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: ['String'] },
      openapi: { operation: { summary: 'List languages', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getPublishers: {
      mapping: { method: 'GET', path: ['publishers'] },
      args: [authenticationPrincipal(), nullableString('search'), setParam('library_id'), setParam('collection_id'), unpagedParam(), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: ['String'] },
      openapi: { operation: { summary: 'List publishers', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getTags: {
      mapping: { method: 'GET', path: ['tags'] },
      args: [
        authenticationPrincipal(),
        nullableString('search'),
        setParam('library_id'),
        setParam('collection_id'),
        setParam('series_id'),
        setParam('readlist_id'),
        requestParam('include', { enum: FilterTags }, { required: false, hasDefault: true }),
        unpagedParam(),
        withParameter(pageable(), { hidden: true }),
      ],
      returns: { class: PageImpl, args: ['String'] },
      openapi: { operation: { summary: 'List tags', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getSeriesReleaseYears: {
      mapping: { method: 'GET', path: ['series/release-years'] },
      args: [authenticationPrincipal(), setParam('library_id'), setParam('collection_id'), unpagedParam(), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: ['String'] },
      openapi: { operation: { summary: 'List series release years', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getAgeRatings: {
      mapping: { method: 'GET', path: ['age-ratings'] },
      args: [authenticationPrincipal(), setParam('library_id'), setParam('collection_id'), unpagedParam(), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: ['Int'] },
      openapi: { operation: { summary: 'List age ratings', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
  },
})
