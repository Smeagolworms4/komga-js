// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/ReadProgressSeriesSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type ReadProgressSeriesSseDtoParams = {
  seriesId: string
  userId: string
}

export class ReadProgressSeriesSseDto extends DataClass<ReadProgressSeriesSseDtoParams> {
  readonly seriesId: string
  readonly userId: string

  constructor({ seriesId, userId }: ReadProgressSeriesSseDtoParams) {
    super()
    this.seriesId = seriesId
    this.userId = userId
  }
}

jsonProperties(ReadProgressSeriesSseDto, { seriesId: 'String', userId: 'String' }, [], { required: ['seriesId', 'userId'] })
