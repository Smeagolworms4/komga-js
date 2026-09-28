// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/KoboSeriesDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass, kFloat } from '../../../../port/kotlin.js'

type KoboSeriesDtoParams = {
  id: string
  name: string
  number: string
  numberFloat: number
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class KoboSeriesDto extends DataClass<KoboSeriesDtoParams> {
  readonly id: string
  readonly name: string
  readonly number: string
  readonly numberFloat: number // PORT: Float

  constructor({
    id,
    name,
    number,
    numberFloat,
  }: KoboSeriesDtoParams) {
    super()
    this.id = id
    this.name = name
    this.number = number
    this.numberFloat = kFloat(numberFloat)
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(KoboSeriesDto, { rename: { id: 'Id', name: 'Name', number: 'Number', numberFloat: 'NumberFloat' } })
jsonProperties(
  KoboSeriesDto,
  {
    id: 'String',
    name: 'String',
    number: 'String',
    numberFloat: 'Float',
  },
  [],
  { required: ['id', 'name', 'number', 'numberFloat'] },
)
