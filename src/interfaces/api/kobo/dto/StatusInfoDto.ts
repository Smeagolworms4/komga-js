// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/StatusInfoDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { json } from '../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { StatusDto, jsonTypeOfStatusDto } from './StatusDto.js'

type StatusInfoDtoParams = {
  lastModified: ZonedDateTime
  status: StatusDto
  timesStartedReading?: number | null
  lastTimeFinished?: ZonedDateTime | null
  lastTimeStartedReading?: ZonedDateTime | null
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
// @JsonInclude(JsonInclude.Include.NON_NULL)
export class StatusInfoDto extends DataClass<StatusInfoDtoParams> {
  readonly lastModified: ZonedDateTime
  readonly status: StatusDto
  readonly timesStartedReading: number | null
  readonly lastTimeFinished: ZonedDateTime | null
  readonly lastTimeStartedReading: ZonedDateTime | null

  constructor({
    lastModified,
    status,
    timesStartedReading = null,
    lastTimeFinished = null,
    lastTimeStartedReading = null,
  }: StatusInfoDtoParams) {
    super()
    this.lastModified = lastModified
    this.status = status
    this.timesStartedReading = timesStartedReading
    this.lastTimeFinished = lastTimeFinished
    this.lastTimeStartedReading = lastTimeStartedReading
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(StatusInfoDto, { rename: { lastModified: 'LastModified', status: 'Status', timesStartedReading: 'TimesStartedReading', lastTimeFinished: 'LastTimeFinished', lastTimeStartedReading: 'LastTimeStartedReading' }, include: 'NON_NULL' })
jsonProperties(
  StatusInfoDto,
  {
    lastModified: JsonTypes.ZonedDateTime,
    status: jsonTypeOfStatusDto(),
    timesStartedReading: { nullable: 'Int' },
    lastTimeFinished: { nullable: JsonTypes.ZonedDateTime },
    lastTimeStartedReading: { nullable: JsonTypes.ZonedDateTime },
  },
  [],
  { required: ['lastModified', 'status'] },
)
