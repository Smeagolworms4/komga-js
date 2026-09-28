// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/TransientBookRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { TransientBook } from '../model/TransientBook.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class TransientBookRepository {
  abstract findByIdOrNull(transientBookId: string): TransientBook | null

  // PORT: surcharges save(transientBook: TransientBook) / save(transientBooks: Collection<TransientBook>) fusionnées
  abstract save(transientBookOrBooks: TransientBook | Iterable<TransientBook>): void
}
