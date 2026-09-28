// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/HistoricalEventRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { HistoricalEvent } from '../model/HistoricalEvent.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class HistoricalEventRepository {
  abstract insert(event: HistoricalEvent): void
}
