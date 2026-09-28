// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/SeriesSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type SeriesSseDtoParams = {
  seriesId: string
  libraryId: string
}

export class SeriesSseDto extends DataClass<SeriesSseDtoParams> {
  readonly seriesId: string
  readonly libraryId: string

  constructor({ seriesId, libraryId }: SeriesSseDtoParams) {
    super()
    this.seriesId = seriesId
    this.libraryId = libraryId
  }
}

jsonProperties(SeriesSseDto, { seriesId: 'String', libraryId: 'String' }, [], { required: ['seriesId', 'libraryId'] })
