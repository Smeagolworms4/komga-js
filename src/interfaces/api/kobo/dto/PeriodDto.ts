// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/PeriodDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { json } from '../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type PeriodDtoParams = {
  from: ZonedDateTime
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class PeriodDto extends DataClass<PeriodDtoParams> {
  readonly from: ZonedDateTime

  constructor({ from }: PeriodDtoParams) {
    super()
    this.from = from
  }
}

// PORT: fonction d'extension ZonedDateTime.toPeriodDto()
export function toPeriodDto(self: ZonedDateTime): PeriodDto {
  return new PeriodDto({ from: self })
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(PeriodDto, { rename: { from: 'From' } })
jsonProperties(
  PeriodDto,
  {
    from: JsonTypes.ZonedDateTime,
  },
  [],
  { required: ['from'] },
)
