// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/persistence/SeriesDtoRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { SearchContext } from '../../../domain/model/SearchContext.js'
import type { SeriesSearch } from '../../../domain/model/SeriesSearch.js'
import type { Page, Pageable } from '../../../port/spring-data.js'
import type { GroupCountDto } from '../rest/dto/GroupCountDto.js'
import type { SeriesDto } from '../rest/dto/SeriesDto.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class SeriesDtoRepository {
  abstract findByIdOrNull(seriesId: string, userId: string): SeriesDto | null

  // PORT: surcharges findAll(pageable) / findAll(context, pageable) / findAll(search, context, pageable) -> signatures de surcharge TS
  abstract findAll(pageable: Pageable): Page<SeriesDto>
  abstract findAll(context: SearchContext, pageable: Pageable): Page<SeriesDto>
  abstract findAll(search: SeriesSearch, context: SearchContext, pageable: Pageable): Page<SeriesDto>

  abstract findAllRecentlyUpdated(search: SeriesSearch, context: SearchContext, pageable: Pageable): Page<SeriesDto>

  abstract countByFirstCharacter(search: SeriesSearch, context: SearchContext): GroupCountDto[]
}
