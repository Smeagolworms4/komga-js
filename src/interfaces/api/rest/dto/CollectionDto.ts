// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/CollectionDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import type { SeriesCollection } from '../../../../domain/model/SeriesCollection.js'
import { toUTC } from '../../../../language/LanguageUtils.js'
import { jsonFormatLocalDateTime } from '../../../../port/jackson-format.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type CollectionDtoParams = {
  id: string
  name: string
  ordered: boolean
  seriesIds: string[]
  createdDate: LocalDateTime
  lastModifiedDate: LocalDateTime
  filtered: boolean
}

export class CollectionDto extends DataClass<CollectionDtoParams> {
  readonly id: string
  readonly name: string
  readonly ordered: boolean
  readonly seriesIds: string[]
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly createdDate: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly lastModifiedDate: LocalDateTime
  readonly filtered: boolean

  constructor({ id, name, ordered, seriesIds, createdDate, lastModifiedDate, filtered }: CollectionDtoParams) {
    super()
    this.id = id
    this.name = name
    this.ordered = ordered
    this.seriesIds = seriesIds
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
    this.filtered = filtered
  }
}

export function toDto(self: SeriesCollection): CollectionDto {
  return new CollectionDto({
    id: self.id,
    name: self.name,
    ordered: self.ordered,
    seriesIds: self.seriesIds,
    createdDate: toUTC(self.createdDate),
    lastModifiedDate: toUTC(self.lastModifiedDate),
    filtered: self.filtered,
  })
}

const dateTimeZ = jsonFormatLocalDateTime("yyyy-MM-dd'T'HH:mm:ss'Z'")

jsonProperties(
  CollectionDto,
  { id: 'String', name: 'String', ordered: 'Boolean', seriesIds: { list: 'String' }, createdDate: dateTimeZ, lastModifiedDate: dateTimeZ, filtered: 'Boolean' },
  [],
  { required: ['id', 'name', 'ordered', 'seriesIds', 'createdDate', 'lastModifiedDate', 'filtered'] },
)
