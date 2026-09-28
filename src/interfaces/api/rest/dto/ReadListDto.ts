// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ReadListDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import type { ReadList } from '../../../../domain/model/ReadList.js'
import { toUTC } from '../../../../language/LanguageUtils.js'
import { jsonFormatLocalDateTime } from '../../../../port/jackson-format.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ReadListDtoParams = {
  id: string
  name: string
  summary: string
  ordered: boolean
  bookIds: string[]
  createdDate: LocalDateTime
  lastModifiedDate: LocalDateTime
  filtered: boolean
}

export class ReadListDto extends DataClass<ReadListDtoParams> {
  readonly id: string
  readonly name: string
  readonly summary: string
  readonly ordered: boolean
  readonly bookIds: string[]
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly createdDate: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly lastModifiedDate: LocalDateTime
  readonly filtered: boolean

  constructor({ id, name, summary, ordered, bookIds, createdDate, lastModifiedDate, filtered }: ReadListDtoParams) {
    super()
    this.id = id
    this.name = name
    this.summary = summary
    this.ordered = ordered
    this.bookIds = bookIds
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
    this.filtered = filtered
  }
}

export function toDto(self: ReadList): ReadListDto {
  return new ReadListDto({
    id: self.id,
    name: self.name,
    summary: self.summary,
    ordered: self.ordered,
    bookIds: [...self.bookIds.values()],
    createdDate: toUTC(self.createdDate),
    lastModifiedDate: toUTC(self.lastModifiedDate),
    filtered: self.filtered,
  })
}

const dateTimeZ = jsonFormatLocalDateTime("yyyy-MM-dd'T'HH:mm:ss'Z'")

jsonProperties(
  ReadListDto,
  {
    id: 'String',
    name: 'String',
    summary: 'String',
    ordered: 'Boolean',
    bookIds: { list: 'String' },
    createdDate: dateTimeZ,
    lastModifiedDate: dateTimeZ,
    filtered: 'Boolean',
  },
  [],
  { required: ['id', 'name', 'summary', 'ordered', 'bookIds', 'createdDate', 'lastModifiedDate', 'filtered'] },
)
