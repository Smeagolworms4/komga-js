// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/PublisherDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type PublisherDtoParams = {
  imprint?: string
  name: string
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class PublisherDto extends DataClass<PublisherDtoParams> {
  readonly imprint: string
  readonly name: string

  constructor({ imprint = '', name }: PublisherDtoParams) {
    super()
    this.imprint = imprint
    this.name = name
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(PublisherDto, { rename: { imprint: 'Imprint', name: 'Name' } })
jsonProperties(
  PublisherDto,
  {
    imprint: 'String',
    name: 'String',
  },
  [],
  { required: ['name'] },
)
