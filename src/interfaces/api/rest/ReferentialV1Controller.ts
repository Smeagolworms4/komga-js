// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/ReferentialV1Controller.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ReferentialRepository } from '../../../domain/persistence/ReferentialRepository.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { type AuthorDto, toDto } from './dto/AuthorDto.js'
import { MediaType, authenticationPrincipal, requestParam, restController } from '../../../port/spring-web.js'

// @RestController
// @RequestMapping("api/v1", produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.REFERENTIAL)
export class ReferentialV1Controller {
  constructor(private readonly referentialRepository: ReferentialRepository) {}

  // @GetMapping("authors")
  /** @deprecated Use GET /v2/authors instead */
  // @Operation(summary = "List authors", description = "Use GET /api/v2/authors instead. Deprecated since 1.20.0.", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getAuthorsDeprecated(principal: KomgaPrincipal, search: string, libraryId: string | null, collectionId: string | null, seriesId: string | null): AuthorDto[] {
    return (
      libraryId !== null
        ? this.referentialRepository.findAllAuthorsByNameAndLibrary(search, libraryId, principal.user.getAuthorizedLibraryIds(null))
        : collectionId !== null
          ? this.referentialRepository.findAllAuthorsByNameAndCollection(search, collectionId, principal.user.getAuthorizedLibraryIds(null))
          : seriesId !== null
            ? this.referentialRepository.findAllAuthorsByNameAndSeries(search, seriesId, principal.user.getAuthorizedLibraryIds(null))
            : this.referentialRepository.findAllAuthorsByName(search, principal.user.getAuthorizedLibraryIds(null))
    ).map((it) => toDto(it))
  }

  // @GetMapping("authors/names")
  /** @deprecated Use GET /v2/authors/names instead */
  // @Operation(summary = "List authors' names", description = "Use GET /v2/authors/names instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getAuthorsNames(principal: KomgaPrincipal, search: string): string[] {
    return this.referentialRepository.findAllAuthorsNamesByName(search, principal.user.getAuthorizedLibraryIds(null))
  }

  // @GetMapping("authors/roles")
  /** @deprecated Use GET /v2/authors/roles instead */
  // @Operation(summary = "List authors' roles", description = "Use GET /v2/authors/roles instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getAuthorsRoles(principal: KomgaPrincipal): string[] {
    return this.referentialRepository.findAllAuthorsRoles(principal.user.getAuthorizedLibraryIds(null))
  }

  // @GetMapping("genres")
  /** @deprecated Use GET /v2/genres instead */
  // @Operation(summary = "List genres", description = "Use GET /v2/genres instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getGenres(principal: KomgaPrincipal, libraryIds: ReadonlySet<string> = new Set(), collectionId: string | null): Set<string> {
    if (libraryIds.size > 0) return this.referentialRepository.findAllGenresByLibraries(libraryIds, principal.user.getAuthorizedLibraryIds(null))
    else if (collectionId !== null) return this.referentialRepository.findAllGenresByCollection(collectionId, principal.user.getAuthorizedLibraryIds(null))
    else return this.referentialRepository.findAllGenres(principal.user.getAuthorizedLibraryIds(null))
  }

  // @GetMapping("sharing-labels")
  /** @deprecated Use GET /v2/sharing-labels instead */
  // @Operation(summary = "List sharing labels", description = "Use GET /v2/sharing-labels instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getSharingLabels(principal: KomgaPrincipal, libraryIds: ReadonlySet<string> = new Set(), collectionId: string | null): Set<string> {
    if (libraryIds.size > 0) return this.referentialRepository.findAllSharingLabelsByLibraries(libraryIds, principal.user.getAuthorizedLibraryIds(null))
    else if (collectionId !== null) return this.referentialRepository.findAllSharingLabelsByCollection(collectionId, principal.user.getAuthorizedLibraryIds(null))
    else return this.referentialRepository.findAllSharingLabels(principal.user.getAuthorizedLibraryIds(null))
  }

  // @GetMapping("tags")
  /** @deprecated Use GET /v2/tags instead */
  // @Operation(summary = "List tags", description = "Use GET /v2/tags instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getTags(principal: KomgaPrincipal, libraryIds: ReadonlySet<string> = new Set(), collectionId: string | null): Set<string> {
    if (libraryIds.size > 0) return this.referentialRepository.findAllSeriesAndBookTagsByLibraries(libraryIds, principal.user.getAuthorizedLibraryIds(null))
    else if (collectionId !== null) return this.referentialRepository.findAllSeriesAndBookTagsByCollection(collectionId, principal.user.getAuthorizedLibraryIds(null))
    else return this.referentialRepository.findAllSeriesAndBookTags(principal.user.getAuthorizedLibraryIds(null))
  }

  // @GetMapping("tags/book")
  /** @deprecated Use GET /v2/tags instead */
  // @Operation(summary = "List book tags", description = "Use GET /v2/tags instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getBookTags(principal: KomgaPrincipal, seriesId: string | null, readListId: string | null, libraryIds: ReadonlySet<string> = new Set()): Set<string> {
    if (seriesId !== null) return this.referentialRepository.findAllBookTagsBySeries(seriesId, principal.user.getAuthorizedLibraryIds(null))
    else if (readListId !== null) return this.referentialRepository.findAllBookTagsByReadList(readListId, principal.user.getAuthorizedLibraryIds(null))
    else if (libraryIds.size > 0) return this.referentialRepository.findAllBookTags(principal.user.getAuthorizedLibraryIds(libraryIds))
    else return this.referentialRepository.findAllBookTags(principal.user.getAuthorizedLibraryIds(null))
  }

  // @GetMapping("tags/series")
  /** @deprecated Use GET /v2/tags instead */
  // @Operation(summary = "List series tags", description = "Use GET /v2/tags instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getSeriesTags(principal: KomgaPrincipal, libraryId: string | null, collectionId: string | null): Set<string> {
    if (libraryId !== null) return this.referentialRepository.findAllSeriesTagsByLibrary(libraryId, principal.user.getAuthorizedLibraryIds(null))
    else if (collectionId !== null) return this.referentialRepository.findAllSeriesTagsByCollection(collectionId, principal.user.getAuthorizedLibraryIds(null))
    else return this.referentialRepository.findAllSeriesTags(principal.user.getAuthorizedLibraryIds(null))
  }

  // @GetMapping("languages")
  /** @deprecated Use GET /v2/languages instead */
  // @Operation(summary = "List languages", description = "Use GET /v2/languages instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getLanguages(principal: KomgaPrincipal, libraryIds: ReadonlySet<string> = new Set(), collectionId: string | null): Set<string> {
    if (libraryIds.size > 0) return this.referentialRepository.findAllLanguagesByLibraries(libraryIds, principal.user.getAuthorizedLibraryIds(null))
    else if (collectionId !== null) return this.referentialRepository.findAllLanguagesByCollection(collectionId, principal.user.getAuthorizedLibraryIds(null))
    else return this.referentialRepository.findAllLanguages(principal.user.getAuthorizedLibraryIds(null))
  }

  // @GetMapping("publishers")
  /** @deprecated Use GET /v2/publishers instead */
  // @Operation(summary = "List publishers", description = "Use GET /v2/publishers instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getPublishers(principal: KomgaPrincipal, libraryIds: ReadonlySet<string> = new Set(), collectionId: string | null): Set<string> {
    if (libraryIds.size > 0) return this.referentialRepository.findAllPublishersByLibraries(libraryIds, principal.user.getAuthorizedLibraryIds(null))
    else if (collectionId !== null) return this.referentialRepository.findAllPublishersByCollection(collectionId, principal.user.getAuthorizedLibraryIds(null))
    else return this.referentialRepository.findAllPublishers(principal.user.getAuthorizedLibraryIds(null))
  }

  // @GetMapping("age-ratings")
  /** @deprecated Use GET /v2/age-ratings instead */
  // @Operation(summary = "List age ratings", description = "Use GET /v2/age-ratings instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getAgeRatings(principal: KomgaPrincipal, libraryIds: ReadonlySet<string> = new Set(), collectionId: string | null): Set<string> {
    return new Set(
      [
        ...(libraryIds.size > 0
          ? this.referentialRepository.findAllAgeRatingsByLibraries(libraryIds, principal.user.getAuthorizedLibraryIds(null))
          : collectionId !== null
            ? this.referentialRepository.findAllAgeRatingsByCollection(collectionId, principal.user.getAuthorizedLibraryIds(null))
            : this.referentialRepository.findAllAgeRatings(principal.user.getAuthorizedLibraryIds(null))),
      ].map((it) => it?.toString() ?? 'None'),
    )
  }

  // @GetMapping("series/release-dates")
  /** @deprecated Use GET /v2/series/release-years instead */
  // @Operation(summary = "List series release dates", description = "Use GET /v2/series/release-years instead. Deprecated since 1.26.0", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  getSeriesReleaseDates(principal: KomgaPrincipal, libraryIds: ReadonlySet<string> = new Set(), collectionId: string | null): Set<string> {
    return new Set(
      [
        ...(libraryIds.size > 0
          ? this.referentialRepository.findAllSeriesReleaseDatesByLibraries(libraryIds, principal.user.getAuthorizedLibraryIds(null))
          : collectionId !== null
            ? this.referentialRepository.findAllSeriesReleaseDatesByCollection(collectionId, principal.user.getAuthorizedLibraryIds(null))
            : this.referentialRepository.findAllSeriesReleaseDates(principal.user.getAuthorizedLibraryIds(null))),
      ].map((it) => it.year().toString()),
    )
  }
}

// `@RequestParam(name = "library_id", required = false) libraryIds: Set<String> = emptySet()`
const libraryIdsParam = () => requestParam('library_id', { set: 'String' }, { required: false, hasDefault: true })
// `@RequestParam(name = ..., required = false) x: String?`
const nullableString = (name: string) => requestParam(name, { nullable: 'String' }, { required: false, nullable: true })

// PORT: annotations Spring (@RestController, @RequestMapping, @GetMapping, @RequestParam)
restController(ReferentialV1Controller, {
  inject: [ReferentialRepository],
  javaName: 'org.gotson.komga.interfaces.api.rest.ReferentialV1Controller',
  requestMapping: { path: ['api/v1'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  handlers: {
    getAuthorsDeprecated: {
      mapping: { method: 'GET', path: ['authors'] },
      args: [authenticationPrincipal(), requestParam('search', 'String', { defaultValue: '' }), nullableString('library_id'), nullableString('collection_id'), nullableString('series_id')],
    },
    getAuthorsNames: { mapping: { method: 'GET', path: ['authors/names'] }, args: [authenticationPrincipal(), requestParam('search', 'String', { defaultValue: '' })] },
    getAuthorsRoles: { mapping: { method: 'GET', path: ['authors/roles'] }, args: [authenticationPrincipal()] },
    getGenres: { mapping: { method: 'GET', path: ['genres'] }, args: [authenticationPrincipal(), libraryIdsParam(), nullableString('collection_id')] },
    getSharingLabels: { mapping: { method: 'GET', path: ['sharing-labels'] }, args: [authenticationPrincipal(), libraryIdsParam(), nullableString('collection_id')] },
    getTags: { mapping: { method: 'GET', path: ['tags'] }, args: [authenticationPrincipal(), libraryIdsParam(), nullableString('collection_id')] },
    getBookTags: { mapping: { method: 'GET', path: ['tags/book'] }, args: [authenticationPrincipal(), nullableString('series_id'), nullableString('readlist_id'), libraryIdsParam()] },
    getSeriesTags: { mapping: { method: 'GET', path: ['tags/series'] }, args: [authenticationPrincipal(), nullableString('library_id'), nullableString('collection_id')] },
    getLanguages: { mapping: { method: 'GET', path: ['languages'] }, args: [authenticationPrincipal(), libraryIdsParam(), nullableString('collection_id')] },
    getPublishers: { mapping: { method: 'GET', path: ['publishers'] }, args: [authenticationPrincipal(), libraryIdsParam(), nullableString('collection_id')] },
    getAgeRatings: { mapping: { method: 'GET', path: ['age-ratings'] }, args: [authenticationPrincipal(), libraryIdsParam(), nullableString('collection_id')] },
    getSeriesReleaseDates: { mapping: { method: 'GET', path: ['series/release-dates'] }, args: [authenticationPrincipal(), libraryIdsParam(), nullableString('collection_id')] },
  },
})
