// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/persistence/KoboDtoRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { KoboBookMetadataDto } from '../dto/KoboBookMetadataDto.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class KoboDtoRepository {
  abstract findBookMetadataByIds(bookIds: Iterable<string>): KoboBookMetadataDto[]
}
