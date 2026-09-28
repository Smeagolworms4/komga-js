// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/BookMetadataAggregationRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookMetadataAggregation } from '../model/BookMetadataAggregation.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class BookMetadataAggregationRepository {
  abstract findById(seriesId: string): BookMetadataAggregation

  abstract findByIdOrNull(seriesId: string): BookMetadataAggregation | null

  abstract insert(metadata: BookMetadataAggregation): void

  abstract update(metadata: BookMetadataAggregation): void

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  abstract delete(seriesIdOrIds: string | Iterable<string>): void

  // PORT: delete(seriesIds: Collection<String>) fusionné avec delete(seriesId) ci-dessus

  abstract count(): number
}
