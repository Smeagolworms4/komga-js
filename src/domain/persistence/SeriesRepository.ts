// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/SeriesRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { SearchCondition } from '../model/SearchCondition.js'
import type { SearchContext } from '../model/SearchContext.js'
import type { Series } from '../model/Series.js'
import type { Page, Pageable } from '../../port/spring-data.js'
import type { URL } from '../../port/java-net.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class SeriesRepository {
  abstract findByIdOrNull(seriesId: string): Series | null

  abstract findNotDeletedByLibraryIdAndUrlOrNull(libraryId: string, url: URL): Series | null

  // PORT: surcharges findAll() / findAll(searchCondition, searchContext, pageable) -> signatures de surcharge TS
  abstract findAll(): Series[]
  abstract findAll(searchCondition: SearchCondition.Series | null, searchContext: SearchContext, pageable: Pageable): Page<Series>

  abstract findAllByLibraryId(libraryId: string): Series[]

  abstract findAllNotDeletedByLibraryIdAndUrlNotIn(libraryId: string, urls: Iterable<URL>): Series[]

  abstract findAllByTitleContaining(title: string): Series[]

  // PORT: findAll(searchCondition, searchContext, pageable) déclaré avec findAll() ci-dessus

  abstract getLibraryId(seriesId: string): string | null

  abstract findAllIdsByLibraryId(libraryId: string): string[]

  abstract insert(series: Series): void

  abstract update(series: Series, options?: { updateModifiedTime?: boolean }): void

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  abstract delete(seriesIdOrIds: string | Iterable<string>): void

  // PORT: delete(seriesIds: Collection<String>) fusionné avec delete(seriesId) ci-dessus

  abstract deleteAll(): void

  abstract count(): number

  abstract countGroupedByLibraryId(): Map<string, number>
}
