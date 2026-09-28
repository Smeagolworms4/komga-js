// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/LibraryRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Library } from '../model/Library.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class LibraryRepository {
  abstract findById(libraryId: string): Library

  abstract findByIdOrNull(libraryId: string): Library | null

  abstract findAll(): Library[]

  abstract findAllByIds(libraryIds: Iterable<string>): Library[]

  abstract delete(libraryId: string): void

  abstract deleteAll(): void

  abstract insert(library: Library): void

  abstract update(library: Library): void

  abstract count(): number
}
