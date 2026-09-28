// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/ReadProgressRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ReadProgress } from '../model/ReadProgress.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class ReadProgressRepository {
  abstract findByBookIdAndUserIdOrNull(bookId: string, userId: string): ReadProgress | null

  abstract findAll(): ReadProgress[]

  abstract findAllByUserId(userId: string): ReadProgress[]

  abstract findAllByBookId(bookId: string): ReadProgress[]

  abstract findAllByBookIdsAndUserId(bookIds: Iterable<string>, userId: string): ReadProgress[]

  // PORT: surcharges save(readProgress: ReadProgress) / save(readProgresses: Collection<ReadProgress>) fusionnées
  abstract save(readProgressOrProgresses: ReadProgress | Iterable<ReadProgress>): void

  abstract delete(bookId: string, userId: string): void

  abstract deleteByUserId(userId: string): void

  abstract deleteByBookId(bookId: string): void

  abstract deleteByBookIds(bookIds: Iterable<string>): void

  abstract deleteByBookIdsAndUserId(bookIds: Iterable<string>, userId: string): void

  abstract deleteBySeriesIds(seriesIds: Iterable<string>): void

  abstract deleteAll(): void
}
