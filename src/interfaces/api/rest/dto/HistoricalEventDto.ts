// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/HistoricalEventDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type HistoricalEventDtoParams = {
  id: string
  type: string
  timestamp: LocalDateTime
  bookId: string | null
  seriesId: string | null
  properties: Map<string, string>
}

export class HistoricalEventDto extends DataClass<HistoricalEventDtoParams> {
  readonly id: string
  readonly type: string
  readonly timestamp: LocalDateTime
  readonly bookId: string | null
  readonly seriesId: string | null
  readonly properties: Map<string, string>

  constructor({ id, type, timestamp, bookId, seriesId, properties }: HistoricalEventDtoParams) {
    super()
    this.id = id
    this.type = type
    this.timestamp = timestamp
    this.bookId = bookId
    this.seriesId = seriesId
    this.properties = properties
  }
}

jsonProperties(
  HistoricalEventDto,
  { id: 'String', type: 'String', timestamp: JsonTypes.LocalDateTime, bookId: { nullable: 'String' }, seriesId: { nullable: 'String' }, properties: { map: 'String' } },
  [],
  { required: ['id', 'type', 'timestamp', 'properties'] },
)
