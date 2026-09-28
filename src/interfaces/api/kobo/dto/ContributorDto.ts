// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/ContributorDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ContributorDtoParams = {
  name: string
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class ContributorDto extends DataClass<ContributorDtoParams> {
  readonly name: string

  constructor({ name }: ContributorDtoParams) {
    super()
    this.name = name
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(ContributorDto, { rename: { name: 'Name' } })
jsonProperties(
  ContributorDto,
  {
    name: 'String',
  },
  [],
  { required: ['name'] },
)
