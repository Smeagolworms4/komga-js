// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/TransientBook.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'
import type { Book } from './Book.js'
import { BookWithMedia } from './BookWithMedia.js'
import type { Media } from './Media.js'

type TransientBookParams = {
  book: Book
  media: Media
  metadata?: TransientBook.Metadata
}

export class TransientBook extends DataClass<TransientBookParams> {
  readonly book: Book
  readonly media: Media
  readonly metadata: TransientBook.Metadata

  constructor({ book, media, metadata = new TransientBook.Metadata() }: TransientBookParams) {
    super()
    this.book = book
    this.media = media
    this.metadata = metadata
  }
}

type MetadataParams = {
  number?: number | null
  seriesId?: string | null
}

export namespace TransientBook {
  export class Metadata extends DataClass<MetadataParams> {
    readonly number: number | null // PORT: Float
    readonly seriesId: string | null

    constructor({ number = null, seriesId = null }: MetadataParams = {}) {
      super()
      this.number = number
      this.seriesId = seriesId
    }
  }
}

export function toBookWithMedia(self: TransientBook): BookWithMedia {
  return new BookWithMedia({ book: self.book, media: self.media })
}
