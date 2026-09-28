// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/BookSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type BookSseDtoParams = {
  bookId: string
  seriesId: string
  libraryId: string
}

export class BookSseDto extends DataClass<BookSseDtoParams> {
  readonly bookId: string
  readonly seriesId: string
  readonly libraryId: string

  constructor({ bookId, seriesId, libraryId }: BookSseDtoParams) {
    super()
    this.bookId = bookId
    this.seriesId = seriesId
    this.libraryId = libraryId
  }
}

jsonProperties(BookSseDto, { bookId: 'String', seriesId: 'String', libraryId: 'String' }, [], { required: ['bookId', 'seriesId', 'libraryId'] })
