// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/BookProjectionRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookProjection } from '../model/BookProjection.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class BookProjectionRepository {
  abstract save(projection: BookProjection): void

  // PORT: surcharges delete(bookId: String) / delete(bookIds: Collection<String>) fusionnées
  abstract delete(bookIdOrIds: string | Iterable<string>): void
}
