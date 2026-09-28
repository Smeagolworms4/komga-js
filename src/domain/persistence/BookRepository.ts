// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/BookRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Book } from '../model/Book.js'
import type { SearchCondition } from '../model/SearchCondition.js'
import type { SearchContext } from '../model/SearchContext.js'
import type { Page, Pageable } from '../../port/spring-data.js'
import type { URL } from '../../port/java-net.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class BookRepository {
  abstract findByIdOrNull(bookId: string): Book | null

  abstract findNotDeletedByLibraryIdAndUrlOrNull(libraryId: string, url: URL): Book | null

  // PORT: surcharges findAll() / findAll(searchCondition, searchContext, pageable) -> signatures de surcharge TS
  abstract findAll(): Book[]
  abstract findAll(searchCondition: SearchCondition.Book | null, searchContext: SearchContext, pageable: Pageable): Page<Book>

  abstract findAllBySeriesId(seriesId: string): Book[]

  abstract findAllBySeriesIds(seriesIds: Iterable<string>): Book[]

  abstract findAllNotDeletedByLibraryIdAndUrlNotIn(libraryId: string, urls: Iterable<URL>): Book[]

  // PORT: findAll(searchCondition, searchContext, pageable) déclaré avec findAll() ci-dessus

  abstract findAllDeletedByFileSize(fileSize: number): Book[]

  abstract findAllByLibraryIdAndWithEmptyHash(libraryId: string): Book[]

  abstract findAllByLibraryIdAndWithEmptyHashKoreader(libraryId: string): Book[]

  abstract findAllByHashKoreader(hashKoreader: string): Book[]

  abstract findAllByLibraryIdAndMediaTypes(libraryId: string, mediaTypes: Iterable<string>): Book[]

  abstract findAllByLibraryIdAndMismatchedExtension(libraryId: string, mediaType: string, extension: string): Book[]

  abstract getLibraryIdOrNull(bookId: string): string | null

  abstract getSeriesIdOrNull(bookId: string): string | null

  abstract findFirstIdInSeriesOrNull(seriesId: string): string | null

  abstract findLastIdInSeriesOrNull(seriesId: string): string | null

  abstract findFirstUnreadIdInSeriesOrNull(seriesId: string, userId: string): string | null

  abstract findAllIdsBySeriesId(seriesId: string): string[]

  abstract findAllIdsByLibraryId(libraryId: string): string[]

  abstract existsById(bookId: string): boolean

  // PORT: surcharges insert(Book) / insert(Collection<Book>) fusionnées (union de types)
  abstract insert(bookOrBooks: Book | Iterable<Book>): void

  // PORT: insert(books: Collection<Book>) fusionné avec insert(book) ci-dessus

  // PORT: surcharges update(Book) / update(Collection<Book>) fusionnées (union de types)
  abstract update(bookOrBooks: Book | Iterable<Book>): void

  // PORT: update(books: Collection<Book>) fusionné avec update(book) ci-dessus

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  abstract delete(bookIdOrIds: string | Iterable<string>): void

  // PORT: delete(bookIds: Collection<String>) fusionné avec delete(bookId) ci-dessus

  abstract deleteAll(): void

  abstract count(): number

  abstract countGroupedByLibraryId(): Map<string, number>

  // PORT: BigDecimal -> number
  abstract getFilesizeGroupedByLibraryId(): Map<string, number>
}
