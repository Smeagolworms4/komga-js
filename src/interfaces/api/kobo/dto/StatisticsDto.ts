// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/StatisticsDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { json } from '../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type StatisticsDtoParams = {
  lastModified: ZonedDateTime
  remainingTimeMinutes?: number | null
  spentReadingMinutes?: number | null
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
// @JsonInclude(JsonInclude.Include.NON_NULL)
export class StatisticsDto extends DataClass<StatisticsDtoParams> {
  readonly lastModified: ZonedDateTime
  readonly remainingTimeMinutes: number | null
  readonly spentReadingMinutes: number | null

  constructor({
    lastModified,
    remainingTimeMinutes = null,
    spentReadingMinutes = null,
  }: StatisticsDtoParams) {
    super()
    this.lastModified = lastModified
    this.remainingTimeMinutes = remainingTimeMinutes
    this.spentReadingMinutes = spentReadingMinutes
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(StatisticsDto, { rename: { lastModified: 'LastModified', remainingTimeMinutes: 'RemainingTimeMinutes', spentReadingMinutes: 'SpentReadingMinutes' }, include: 'NON_NULL' })
jsonProperties(
  StatisticsDto,
  {
    lastModified: JsonTypes.ZonedDateTime,
    remainingTimeMinutes: { nullable: 'Int' },
    spentReadingMinutes: { nullable: 'Int' },
  },
  [],
  { required: ['lastModified'] },
)
