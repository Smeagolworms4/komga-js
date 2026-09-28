// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/SidecarRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Sidecar, SidecarStored } from '../model/Sidecar.js'
import type { URL } from '../../port/java-net.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class SidecarRepository {
  abstract findAll(): SidecarStored[]

  abstract save(libraryId: string, sidecar: Sidecar): void

  abstract deleteByLibraryIdAndUrls(libraryId: string, urls: Iterable<URL>): void

  abstract deleteByLibraryId(libraryId: string): void

  abstract countGroupedByLibraryId(): Map<string, number>
}
