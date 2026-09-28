// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BookWithMedia.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'
import type { Book } from './Book.js'
import type { Media } from './Media.js'

type BookWithMediaParams = {
  book: Book
  media: Media
}

export class BookWithMedia extends DataClass<BookWithMediaParams> {
  readonly book: Book
  readonly media: Media

  constructor({ book, media }: BookWithMediaParams) {
    super()
    this.book = book
    this.media = media
  }
}
