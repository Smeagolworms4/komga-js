// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/persistence/BookDtoRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookSearch } from '../../../domain/model/BookSearch.js'
import type { ContentRestrictions } from '../../../domain/model/ContentRestrictions.js'
import type { ReadList } from '../../../domain/model/ReadList.js'
import type { SearchContext } from '../../../domain/model/SearchContext.js'
import type { Page, Pageable } from '../../../port/spring-data.js'
import type { BookDto } from '../rest/dto/BookDto.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class BookDtoRepository {
  // PORT: surcharges findAll(pageable) / findAll(context, pageable) / findAll(search, context, pageable) -> signatures de surcharge TS
  abstract findAll(pageable: Pageable): Page<BookDto>
  abstract findAll(context: SearchContext, pageable: Pageable): Page<BookDto>
  abstract findAll(search: BookSearch, context: SearchContext, pageable: Pageable): Page<BookDto>

  abstract findByIdOrNull(bookId: string, userId: string): BookDto | null

  abstract findPreviousInSeriesOrNull(bookId: string, userId: string): BookDto | null

  abstract findNextInSeriesOrNull(bookId: string, userId: string): BookDto | null

  abstract findPreviousInReadListOrNull(readList: ReadList, bookId: string, context: SearchContext): BookDto | null

  abstract findNextInReadListOrNull(readList: ReadList, bookId: string, context: SearchContext): BookDto | null

  // PORT: paramètre par défaut restrictions = ContentRestrictions() dans l'objet final
  abstract findAllOnDeck(
    userId: string,
    filterOnLibraryIds: Iterable<string> | null,
    pageable: Pageable,
    options?: { restrictions?: ContentRestrictions },
  ): Page<BookDto>

  abstract findAllDuplicates(userId: string, pageable: Pageable): Page<BookDto>
}
