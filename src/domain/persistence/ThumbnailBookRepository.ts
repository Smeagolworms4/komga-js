// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/ThumbnailBookRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ThumbnailBook } from '../model/ThumbnailBook.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class ThumbnailBookRepository {
  abstract findByIdOrNull(thumbnailId: string): ThumbnailBook | null

  abstract findSelectedByBookIdOrNull(bookId: string): ThumbnailBook | null

  abstract findAllByBookId(bookId: string): ThumbnailBook[]

  abstract findAllByBookIdAndType(bookId: string, type: ReadonlySet<ThumbnailBook.Type>): ThumbnailBook[]

  abstract findAllBookIdsByThumbnailTypeAndDimensionSmallerThan(type: ThumbnailBook.Type, size: number): string[]

  abstract existsById(thumbnailId: string): boolean

  abstract getLibraryIdOrNull(thumbnailId: string): string | null

  abstract getSeriesIdOrNull(thumbnailId: string): string | null

  abstract insert(thumbnail: ThumbnailBook): void

  abstract update(thumbnail: ThumbnailBook): void

  abstract markSelected(thumbnail: ThumbnailBook): void

  abstract delete(thumbnailBookId: string): void

  abstract deleteByBookId(bookId: string): void

  abstract deleteByBookIdAndType(bookId: string, type: ThumbnailBook.Type): void

  abstract deleteByBookIds(bookIds: Iterable<string>): void
}
