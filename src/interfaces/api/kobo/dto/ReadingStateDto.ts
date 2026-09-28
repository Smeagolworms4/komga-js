// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/ReadingStateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import type { ReadProgress } from '../../../../domain/model/ReadProgress.js'
import { toUTCZoned } from '../../../../language/LanguageUtils.js'
import { json } from '../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { BookmarkDto } from './BookmarkDto.js'
import { LocationDto } from './LocationDto.js'
import { StatisticsDto } from './StatisticsDto.js'
import { StatusDto } from './StatusDto.js'
import { StatusInfoDto } from './StatusInfoDto.js'

type ReadingStateDtoParams = {
  created?: ZonedDateTime | null
  currentBookmark: BookmarkDto
  entitlementId: string
  lastModified: ZonedDateTime
  priorityTimestamp?: ZonedDateTime | null
  statistics: StatisticsDto
  statusInfo: StatusInfoDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class ReadingStateDto extends DataClass<ReadingStateDtoParams> {
  readonly created: ZonedDateTime | null
  readonly currentBookmark: BookmarkDto
  readonly entitlementId: string
  readonly lastModified: ZonedDateTime
  /**
   * From CW: apparently always equals to lastModified
   */
  readonly priorityTimestamp: ZonedDateTime | null
  readonly statistics: StatisticsDto
  readonly statusInfo: StatusInfoDto

  constructor({ created = null, currentBookmark, entitlementId, lastModified, priorityTimestamp = null, statistics, statusInfo }: ReadingStateDtoParams) {
    super()
    this.created = created
    this.currentBookmark = currentBookmark
    this.entitlementId = entitlementId
    this.lastModified = lastModified
    this.priorityTimestamp = priorityTimestamp
    this.statistics = statistics
    this.statusInfo = statusInfo
  }
}

type WrappedReadingStateDtoParams = {
  readingState: ReadingStateDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class WrappedReadingStateDto extends DataClass<WrappedReadingStateDtoParams> {
  readonly readingState: ReadingStateDto

  constructor({ readingState }: WrappedReadingStateDtoParams) {
    super()
    this.readingState = readingState
  }
}

// PORT: fonction d'extension ReadProgress.toDto()
export function toDto(self: ReadProgress): ReadingStateDto {
  let status: StatusDto
  if (self.completed) status = StatusDto.FINISHED
  else if (!self.completed) status = StatusDto.READING
  else status = StatusDto.READY_TO_READ
  return new ReadingStateDto({
    created: toUTCZoned(self.createdDate),
    lastModified: toUTCZoned(self.lastModifiedDate),
    priorityTimestamp: toUTCZoned(self.lastModifiedDate),
    entitlementId: self.bookId,
    currentBookmark: new BookmarkDto({
      lastModified: toUTCZoned(self.lastModifiedDate),
      progressPercent: self.locator?.locations?.totalProgression != null ? self.locator.locations.totalProgression * 100 : null,
      contentSourceProgressPercent: self.locator?.locations?.progression != null ? self.locator.locations.progression * 100 : null,
      location: self.locator !== null ? new LocationDto({ source: self.locator.href, value: self.locator.koboSpan }) : null,
    }),
    statistics: new StatisticsDto({
      lastModified: toUTCZoned(self.lastModifiedDate),
    }),
    statusInfo: new StatusInfoDto({
      lastModified: toUTCZoned(self.lastModifiedDate),
      status: status,
      timesStartedReading: 1,
    }),
  })
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(ReadingStateDto, {
  rename: {
    created: 'Created',
    currentBookmark: 'CurrentBookmark',
    entitlementId: 'EntitlementId',
    lastModified: 'LastModified',
    priorityTimestamp: 'PriorityTimestamp',
    statistics: 'Statistics',
    statusInfo: 'StatusInfo',
  },
})
jsonProperties(
  ReadingStateDto,
  {
    created: { nullable: JsonTypes.ZonedDateTime },
    currentBookmark: { class: BookmarkDto },
    entitlementId: 'String',
    lastModified: JsonTypes.ZonedDateTime,
    priorityTimestamp: { nullable: JsonTypes.ZonedDateTime },
    statistics: { class: StatisticsDto },
    statusInfo: { class: StatusInfoDto },
  },
  [],
  { required: ['currentBookmark', 'entitlementId', 'lastModified', 'statistics', 'statusInfo'] },
)
// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(WrappedReadingStateDto, { rename: { readingState: 'ReadingState' } })
jsonProperties(WrappedReadingStateDto, { readingState: { class: ReadingStateDto } }, [], { required: ['readingState'] })
