// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/TagItemDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type TagItemDtoParams = {
  revisionId: string
  type?: string
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class TagItemDto extends DataClass<TagItemDtoParams> {
  readonly revisionId: string
  readonly type: string

  constructor({ revisionId, type = 'ProductRevisionTagItem' }: TagItemDtoParams) {
    super()
    this.revisionId = revisionId
    this.type = type
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(TagItemDto, { rename: { revisionId: 'RevisionId', type: 'Type' } })
jsonProperties(
  TagItemDto,
  {
    revisionId: 'String',
    type: 'String',
  },
  [],
  { required: ['revisionId'] },
)
