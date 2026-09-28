// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/SeriesMetadataRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { SeriesMetadata } from '../model/SeriesMetadata.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class SeriesMetadataRepository {
  abstract findById(seriesId: string): SeriesMetadata

  abstract findByIdOrNull(seriesId: string): SeriesMetadata | null

  abstract insert(metadata: SeriesMetadata): void

  abstract update(metadata: SeriesMetadata): void

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  abstract delete(seriesIdOrIds: string | Iterable<string>): void

  // PORT: delete(seriesIds: Collection<String>) fusionné avec delete(seriesId) ci-dessus

  abstract count(): number
}
