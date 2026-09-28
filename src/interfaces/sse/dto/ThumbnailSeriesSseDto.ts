// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/ThumbnailSeriesSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type ThumbnailSeriesSseDtoParams = {
  seriesId: string
  selected: boolean
}

export class ThumbnailSeriesSseDto extends DataClass<ThumbnailSeriesSseDtoParams> {
  readonly seriesId: string
  readonly selected: boolean

  constructor({ seriesId, selected }: ThumbnailSeriesSseDtoParams) {
    super()
    this.seriesId = seriesId
    this.selected = selected
  }
}

jsonProperties(ThumbnailSeriesSseDto, { seriesId: 'String', selected: 'Boolean' }, [], { required: ['seriesId', 'selected'] })
