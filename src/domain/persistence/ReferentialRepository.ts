// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/ReferentialRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDate } from '@js-joda/core'
import type { Author } from '../model/Author.js'
import type { FilterBy, FilterTags } from '../model/FilterBy.js'
import type { SearchContext } from '../model/SearchContext.js'
import type { Page, Pageable } from '../../port/spring-data.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection) ; @Deprecated -> @deprecated
export abstract class ReferentialRepository {
  /** @deprecated Use findAuthors instead */
  abstract findAllAuthorsByName(search: string, filterOnLibraryIds: Iterable<string> | null): Author[]

  /** @deprecated Use findAuthors instead */
  abstract findAllAuthorsByNameAndLibrary(search: string, libraryId: string, filterOnLibraryIds: Iterable<string> | null): Author[]

  /** @deprecated Use findAuthors instead */
  abstract findAllAuthorsByNameAndCollection(search: string, collectionId: string, filterOnLibraryIds: Iterable<string> | null): Author[]

  /** @deprecated Use findAuthors instead */
  abstract findAllAuthorsByNameAndSeries(search: string, seriesId: string, filterOnLibraryIds: Iterable<string> | null): Author[]

  /** @deprecated Use findAuthorsNames instead */
  abstract findAllAuthorsNamesByName(search: string, filterOnLibraryIds: Iterable<string> | null): string[]

  /** @deprecated Use findAuthorsRoles instead */
  abstract findAllAuthorsRoles(filterOnLibraryIds: Iterable<string> | null): string[]

  abstract findAuthors(context: SearchContext, search: string | null, role: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<Author>

  abstract findAuthorsRoles(context: SearchContext, filterBy: FilterBy | null, pageable: Pageable): Page<string>

  abstract findAuthorsNames(context: SearchContext, search: string | null, role: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string>

  /** @deprecated Use findGenres instead */
  abstract findAllGenres(filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findGenres instead */
  abstract findAllGenresByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findGenres instead */
  abstract findAllGenresByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string>

  abstract findGenres(context: SearchContext, search: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string>

  /** @deprecated Use findTags instead */
  abstract findAllSeriesAndBookTags(filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findTags instead */
  abstract findAllSeriesAndBookTagsByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findTags instead */
  abstract findAllSeriesAndBookTagsByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findTags instead */
  abstract findAllSeriesTags(filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findTags instead */
  abstract findAllSeriesTagsByLibrary(libraryId: string, filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findTags instead */
  abstract findAllSeriesTagsByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findTags instead */
  abstract findAllBookTags(filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findTags instead */
  abstract findAllBookTagsBySeries(seriesId: string, filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findTags instead */
  abstract findAllBookTagsByReadList(readListId: string, filterOnLibraryIds: Iterable<string> | null): Set<string>

  abstract findTags(context: SearchContext, search: string | null, filterBy: FilterBy | null, filterTags: FilterTags, pageable: Pageable): Page<string>

  /** @deprecated Use findLanguages instead */
  abstract findAllLanguages(filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findLanguages instead */
  abstract findAllLanguagesByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findLanguages instead */
  abstract findAllLanguagesByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string>

  abstract findLanguages(context: SearchContext, search: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string>

  // PORT: surcharges findAllPublishers(filterOnLibraryIds) / findAllPublishers(filterOnLibraryIds, pageable) -> signatures de surcharge TS
  /** @deprecated Use findPublishers instead */
  abstract findAllPublishers(filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findPublishers instead */
  abstract findAllPublishers(filterOnLibraryIds: Iterable<string> | null, pageable: Pageable): Page<string>

  /** @deprecated Use findPublishers instead */
  abstract findAllPublishersByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findPublishers instead */
  abstract findAllPublishersByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string>

  abstract findPublishers(context: SearchContext, search: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string>

  /** @deprecated Use findAgeRatings instead */
  abstract findAllAgeRatings(filterOnLibraryIds: Iterable<string> | null): Set<number | null>

  /** @deprecated Use findAgeRatings instead */
  abstract findAllAgeRatingsByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<number | null>

  /** @deprecated Use findAgeRatings instead */
  abstract findAllAgeRatingsByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<number | null>

  abstract findAgeRatings(context: SearchContext, filterBy: FilterBy | null, pageable: Pageable): Page<number>

  /** @deprecated Use findSeriesReleaseDates instead */
  abstract findAllSeriesReleaseDates(filterOnLibraryIds: Iterable<string> | null): Set<LocalDate>

  /** @deprecated Use findSeriesReleaseDates instead */
  abstract findAllSeriesReleaseDatesByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<LocalDate>

  /** @deprecated Use findSeriesReleaseDates instead */
  abstract findAllSeriesReleaseDatesByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<LocalDate>

  abstract findSeriesReleaseYears(context: SearchContext, filterBy: FilterBy | null, pageable: Pageable): Page<string>

  /** @deprecated Use findSharingLabels instead */
  abstract findAllSharingLabels(filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findSharingLabels instead */
  abstract findAllSharingLabelsByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string>

  /** @deprecated Use findSharingLabels instead */
  abstract findAllSharingLabelsByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string>

  abstract findSharingLabels(context: SearchContext, search: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string>
}
