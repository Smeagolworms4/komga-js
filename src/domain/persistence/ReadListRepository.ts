// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/ReadListRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ReadList } from '../model/ReadList.js'
import type { SearchContext } from '../model/SearchContext.js'
import type { Page, Pageable } from '../../port/spring-data.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class ReadListRepository {
  /**
   * Find one ReadList by [readListId],
   * bookIds will be filtered by the provided [context] libraries.
   */
  abstract findByIdOrNull(readListId: string, context: SearchContext): ReadList | null

  /**
   * Find all ReadList
   * optionally with at least one Book belonging to the provided [belongsToLibraryIds] if not null,
   * bookIds will be filtered by the provided [context] libraries.
   */
  abstract findAll(
    context: SearchContext,
    pageable: Pageable,
    opts?: {
      belongsToLibraryIds?: Iterable<string> | null
      search?: string | null
    },
  ): Page<ReadList>

  /**
   * Find all ReadList that contains the provided [containsBookId],
   * bookIds will be filtered by the provided [context] libraries.
   */
  abstract findAllContainingBookId(containsBookId: string, context: SearchContext): ReadList[]

  abstract findAllEmpty(): ReadList[]

  abstract findByNameOrNull(name: string): ReadList | null

  abstract insert(readList: ReadList): void

  abstract update(readList: ReadList): void

  abstract removeBookFromAll(bookId: string): void

  abstract removeBooksFromAll(bookIds: Iterable<string>): void

  // PORT: surcharges delete(readListId: String) / delete(readListIds: Collection<String>) fusionnées
  abstract delete(readListIdOrIds: string | Iterable<string>): void

  abstract deleteAll(): void

  abstract existsByName(name: string): boolean

  abstract count(): number
}
