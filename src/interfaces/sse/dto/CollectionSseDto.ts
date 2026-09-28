// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/CollectionSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type CollectionSseDtoParams = {
  collectionId: string
  seriesIds: string[]
}

export class CollectionSseDto extends DataClass<CollectionSseDtoParams> {
  readonly collectionId: string
  readonly seriesIds: string[]

  constructor({ collectionId, seriesIds }: CollectionSseDtoParams) {
    super()
    this.collectionId = collectionId
    this.seriesIds = seriesIds
  }
}

jsonProperties(CollectionSseDto, { collectionId: 'String', seriesIds: { list: 'String' } }, [], { required: ['collectionId', 'seriesIds'] })
