// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/AmountDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type AmountDtoParams = {
  currencyCode?: string | null
  totalAmount: number
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
// @JsonInclude(JsonInclude.Include.NON_NULL)
export class AmountDto extends DataClass<AmountDtoParams> {
  readonly currencyCode: string | null
  readonly totalAmount: number

  constructor({ currencyCode = null, totalAmount }: AmountDtoParams) {
    super()
    this.currencyCode = currencyCode
    this.totalAmount = totalAmount
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(AmountDto, { rename: { currencyCode: 'CurrencyCode', totalAmount: 'TotalAmount' }, include: 'NON_NULL' })
jsonProperties(
  AmountDto,
  {
    currencyCode: { nullable: 'String' },
    totalAmount: 'Int',
  },
  [],
  { required: ['totalAmount'] },
)
