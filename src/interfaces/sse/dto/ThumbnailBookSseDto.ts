// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/ThumbnailBookSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type ThumbnailBookSseDtoParams = {
  bookId: string
  seriesId: string
  selected: boolean
}

export class ThumbnailBookSseDto extends DataClass<ThumbnailBookSseDtoParams> {
  readonly bookId: string
  readonly seriesId: string
  readonly selected: boolean

  constructor({ bookId, seriesId, selected }: ThumbnailBookSseDtoParams) {
    super()
    this.bookId = bookId
    this.seriesId = seriesId
    this.selected = selected
  }
}

jsonProperties(ThumbnailBookSseDto, { bookId: 'String', seriesId: 'String', selected: 'Boolean' }, [], { required: ['bookId', 'seriesId', 'selected'] })
