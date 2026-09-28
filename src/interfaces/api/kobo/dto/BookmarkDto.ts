// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/BookmarkDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { json } from '../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass, kFloat } from '../../../../port/kotlin.js'
import { LocationDto } from './LocationDto.js'

type BookmarkDtoParams = {
  lastModified: ZonedDateTime
  progressPercent?: number | null
  contentSourceProgressPercent?: number | null
  location?: LocationDto | null
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
// @JsonInclude(JsonInclude.Include.NON_NULL)
export class BookmarkDto extends DataClass<BookmarkDtoParams> {
  readonly lastModified: ZonedDateTime
  /**
   * Total progression in the book.
   * Between 0 and 100.
   */
  readonly progressPercent: number | null // PORT: Float
  /**
   * Progression within the resource.
   * Between 0 and 100.
   */
  readonly contentSourceProgressPercent: number | null // PORT: Float
  readonly location: LocationDto | null

  constructor({
    lastModified,
    progressPercent = null,
    contentSourceProgressPercent = null,
    location = null,
  }: BookmarkDtoParams) {
    super()
    this.lastModified = lastModified
    this.progressPercent = kFloat(progressPercent)
    this.contentSourceProgressPercent = kFloat(contentSourceProgressPercent)
    this.location = location
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(BookmarkDto, { rename: { lastModified: 'LastModified', progressPercent: 'ProgressPercent', contentSourceProgressPercent: 'ContentSourceProgressPercent', location: 'Location' }, include: 'NON_NULL' })
jsonProperties(
  BookmarkDto,
  {
    lastModified: JsonTypes.ZonedDateTime,
    progressPercent: { nullable: 'Float' },
    contentSourceProgressPercent: { nullable: 'Float' },
    location: { nullable: { class: LocationDto } },
  },
  [],
  { required: ['lastModified'] },
)
