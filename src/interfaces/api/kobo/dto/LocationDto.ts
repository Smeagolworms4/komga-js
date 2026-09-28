// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/LocationDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type LocationDtoParams = {
  value?: string | null
  type?: string | null
  source: string
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class LocationDto extends DataClass<LocationDtoParams> {
  /**
   * For type=KoboSpan values are in the form "kobo.x.y"
   */
  readonly value: string | null
  /**
   * Typically "KoboSpan"
   */
  readonly type: string | null
  /**
   * The epub HTML resource
   */
  readonly source: string

  constructor({ value = null, type = 'KoboSpan', source }: LocationDtoParams) {
    super()
    this.value = value
    this.type = type
    this.source = source
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(LocationDto, { rename: { value: 'Value', type: 'Type', source: 'Source' } })
jsonProperties(
  LocationDto,
  {
    value: { nullable: 'String' },
    type: { nullable: 'String' },
    source: 'String',
  },
  [],
  { required: ['source'] },
)
