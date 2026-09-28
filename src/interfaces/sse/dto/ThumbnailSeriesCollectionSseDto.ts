// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/ThumbnailSeriesCollectionSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type ThumbnailSeriesCollectionSseDtoParams = {
  collectionId: string
  selected: boolean
}

export class ThumbnailSeriesCollectionSseDto extends DataClass<ThumbnailSeriesCollectionSseDtoParams> {
  readonly collectionId: string
  readonly selected: boolean

  constructor({ collectionId, selected }: ThumbnailSeriesCollectionSseDtoParams) {
    super()
    this.collectionId = collectionId
    this.selected = selected
  }
}

jsonProperties(ThumbnailSeriesCollectionSseDto, { collectionId: 'String', selected: 'Boolean' }, [], { required: ['collectionId', 'selected'] })
