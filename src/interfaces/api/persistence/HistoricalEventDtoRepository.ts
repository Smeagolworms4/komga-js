// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/persistence/HistoricalEventDtoRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Page, Pageable } from '../../../port/spring-data.js'
import type { HistoricalEventDto } from '../rest/dto/HistoricalEventDto.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class HistoricalEventDtoRepository {
  abstract findAll(pageable: Pageable): Page<HistoricalEventDto>
}
