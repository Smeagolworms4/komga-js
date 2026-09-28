// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/BookMetadataRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookMetadata } from '../model/BookMetadata.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class BookMetadataRepository {
  abstract findById(bookId: string): BookMetadata

  abstract findByIdOrNull(bookId: string): BookMetadata | null

  abstract findAllByIds(bookIds: Iterable<string>): BookMetadata[]

  // PORT: surcharges insert(BookMetadata) / insert(Collection<BookMetadata>) fusionnées (union de types)
  abstract insert(metadataOrMetadatas: BookMetadata | Iterable<BookMetadata>): void

  // PORT: insert(metadatas: Collection<BookMetadata>) fusionné avec insert(metadata) ci-dessus

  // PORT: surcharges update(BookMetadata) / update(Collection<BookMetadata>) fusionnées (union de types)
  abstract update(metadataOrMetadatas: BookMetadata | Iterable<BookMetadata>): void

  // PORT: update(metadatas: Collection<BookMetadata>) fusionné avec update(metadata) ci-dessus

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  abstract delete(bookIdOrIds: string | Iterable<string>): void

  // PORT: delete(bookIds: Collection<String>) fusionné avec delete(bookId) ci-dessus

  abstract count(): number
}
