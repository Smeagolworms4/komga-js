// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/PageHashKnownDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import { PageHashKnown } from '../../../../domain/model/PageHashKnown.js'
import { toUTC } from '../../../../language/LanguageUtils.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type PageHashKnownDtoParams = {
  hash: string
  size: number | null
  action: PageHashKnown.Action
  deleteCount: number
  matchCount: number
  created: LocalDateTime
  lastModified: LocalDateTime
}

export class PageHashKnownDto extends DataClass<PageHashKnownDtoParams> {
  readonly hash: string
  readonly size: number | null
  readonly action: PageHashKnown.Action
  readonly deleteCount: number
  readonly matchCount: number
  readonly created: LocalDateTime
  readonly lastModified: LocalDateTime

  constructor({ hash, size, action, deleteCount, matchCount, created, lastModified }: PageHashKnownDtoParams) {
    super()
    this.hash = hash
    this.size = size
    this.action = action
    this.deleteCount = deleteCount
    this.matchCount = matchCount
    this.created = created
    this.lastModified = lastModified
  }
}

export function toDto(self: PageHashKnown): PageHashKnownDto {
  return new PageHashKnownDto({
    hash: self.hash,
    size: self.size,
    action: self.action,
    deleteCount: self.deleteCount,
    matchCount: self.matchCount,
    created: toUTC(self.createdDate),
    lastModified: toUTC(self.lastModifiedDate),
  })
}

jsonProperties(
  PageHashKnownDto,
  {
    hash: 'String',
    size: { nullable: 'Long' },
    action: { enum: PageHashKnown.Action },
    deleteCount: 'Int',
    matchCount: 'Int',
    created: JsonTypes.LocalDateTime,
    lastModified: JsonTypes.LocalDateTime,
  },
  [],
  { required: ['hash', 'action', 'deleteCount', 'matchCount', 'created', 'lastModified'] },
)
