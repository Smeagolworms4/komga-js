// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/BookEntitlementDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ZoneId, ZonedDateTime } from '@js-joda/core'
import type { SyncPoint } from '../../../../domain/model/SyncPoint.js'
import { json } from '../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { PeriodDto, toPeriodDto } from './PeriodDto.js'

type BookEntitlementDtoParams = {
  accessibility?: string
  activePeriod: PeriodDto
  created: ZonedDateTime
  crossRevisionId: string
  id: string
  isHiddenFromArchive?: boolean
  isLocked?: boolean
  isRemoved: boolean
  lastModified: ZonedDateTime
  originCategory?: string
  revisionId: string
  status?: string
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class BookEntitlementDto extends DataClass<BookEntitlementDtoParams> {
  readonly accessibility: string
  readonly activePeriod: PeriodDto
  readonly created: ZonedDateTime
  readonly crossRevisionId: string
  readonly id: string
  readonly isHiddenFromArchive: boolean
  readonly isLocked: boolean
  /**
   * True if the book has been deleted or is not available
   */
  readonly isRemoved: boolean
  readonly lastModified: ZonedDateTime
  readonly originCategory: string
  readonly revisionId: string
  readonly status: string

  constructor({
    accessibility = 'Full',
    activePeriod,
    created,
    crossRevisionId,
    id,
    isHiddenFromArchive = false,
    isLocked = false,
    isRemoved,
    lastModified,
    originCategory = 'Imported',
    revisionId,
    status = 'Active',
  }: BookEntitlementDtoParams) {
    super()
    this.accessibility = accessibility
    this.activePeriod = activePeriod
    this.created = created
    this.crossRevisionId = crossRevisionId
    this.id = id
    this.isHiddenFromArchive = isHiddenFromArchive
    this.isLocked = isLocked
    this.isRemoved = isRemoved
    this.lastModified = lastModified
    this.originCategory = originCategory
    this.revisionId = revisionId
    this.status = status
  }
}

// PORT: fonction d'extension SyncPoint.Book.toBookEntitlementDto(isRemoved)
export function toBookEntitlementDto(self: SyncPoint.Book, isRemoved: boolean): BookEntitlementDto {
  return new BookEntitlementDto({
    activePeriod: toPeriodDto(ZonedDateTime.now(ZoneId.of('Z'))),
    created: self.createdDate,
    crossRevisionId: self.bookId,
    revisionId: self.bookId,
    id: self.bookId,
    isRemoved: isRemoved,
    lastModified: self.fileLastModified,
  })
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(BookEntitlementDto, { rename: { accessibility: 'Accessibility', activePeriod: 'ActivePeriod', created: 'Created', crossRevisionId: 'CrossRevisionId', id: 'Id', isHiddenFromArchive: 'IsHiddenFromArchive', isLocked: 'IsLocked', isRemoved: 'IsRemoved', lastModified: 'LastModified', originCategory: 'OriginCategory', revisionId: 'RevisionId', status: 'Status' } })
jsonProperties(
  BookEntitlementDto,
  {
    accessibility: 'String',
    activePeriod: { class: PeriodDto },
    created: JsonTypes.ZonedDateTime,
    crossRevisionId: 'String',
    id: 'String',
    isHiddenFromArchive: 'Boolean',
    isLocked: 'Boolean',
    isRemoved: 'Boolean',
    lastModified: JsonTypes.ZonedDateTime,
    originCategory: 'String',
    revisionId: 'String',
    status: 'String',
  },
  [],
  { required: ['activePeriod', 'created', 'crossRevisionId', 'id', 'isRemoved', 'lastModified', 'revisionId'] },
)
