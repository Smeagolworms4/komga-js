// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/SeriesCollectionRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { SearchContext } from '../model/SearchContext.js'
import type { SeriesCollection } from '../model/SeriesCollection.js'
import type { Page, Pageable } from '../../port/spring-data.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class SeriesCollectionRepository {
  /**
   * Find one SeriesCollection by [collectionId],
   * seriesId will be filtered by the provided [context] libraries.
   */
  abstract findByIdOrNull(collectionId: string, context: SearchContext): SeriesCollection | null

  /**
   * Find all SeriesCollection
   * optionally with at least one Series belonging to the provided [belongsToLibraryIds] if not null,
   * seriesId will be filtered by the provided [context] libraries.
   */
  abstract findAll(
    context: SearchContext,
    pageable: Pageable,
    opts?: {
      belongsToLibraryIds?: Iterable<string> | null
      search?: string | null
    },
  ): Page<SeriesCollection>

  /**
   * Find all SeriesCollection that contains the provided [containsSeriesId],
   * seriesId will be filtered by the provided [context] libraries.
   */
  abstract findAllContainingSeriesId(containsSeriesId: string, context: SearchContext): SeriesCollection[]

  abstract findAllEmpty(): SeriesCollection[]

  abstract findByNameOrNull(name: string): SeriesCollection | null

  abstract insert(collection: SeriesCollection): void

  abstract update(collection: SeriesCollection): void

  // PORT: surcharges removeSeriesFromAll(seriesId: String) / removeSeriesFromAll(seriesIds: Collection<String>) fusionnées
  abstract removeSeriesFromAll(seriesIdOrIds: string | Iterable<string>): void

  // PORT: surcharges delete(collectionId: String) / delete(collectionIds: Collection<String>) fusionnées
  abstract delete(collectionIdOrIds: string | Iterable<string>): void

  abstract deleteAll(): void

  abstract existsByName(name: string): boolean

  abstract count(): number
}
