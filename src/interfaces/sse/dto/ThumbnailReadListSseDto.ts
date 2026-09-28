// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/ThumbnailReadListSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type ThumbnailReadListSseDtoParams = {
  readListId: string
  selected: boolean
}

export class ThumbnailReadListSseDto extends DataClass<ThumbnailReadListSseDtoParams> {
  readonly readListId: string
  readonly selected: boolean

  constructor({ readListId, selected }: ThumbnailReadListSseDtoParams) {
    super()
    this.readListId = readListId
    this.selected = selected
  }
}

jsonProperties(ThumbnailReadListSseDto, { readListId: 'String', selected: 'Boolean' }, [], { required: ['readListId', 'selected'] })
