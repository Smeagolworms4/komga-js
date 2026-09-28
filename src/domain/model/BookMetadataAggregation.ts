// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BookMetadataAggregation.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type LocalDate, LocalDateTime } from '@js-joda/core'
import { DataClass } from '../../port/kotlin.js'
import type { Auditable } from './Auditable.js'
import type { Author } from './Author.js'

type BookMetadataAggregationParams = {
  authors?: Author[]
  tags?: ReadonlySet<string>
  releaseDate?: LocalDate | null
  summary?: string
  summaryNumber?: string
  seriesId?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class BookMetadataAggregation extends DataClass<BookMetadataAggregationParams> implements Auditable {
  readonly authors: Author[]
  readonly tags: ReadonlySet<string>
  readonly releaseDate: LocalDate | null
  readonly summary: string
  readonly summaryNumber: string
  readonly seriesId: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    authors = [],
    tags = new Set(),
    releaseDate = null,
    summary = '',
    summaryNumber = '',
    seriesId = '',
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: BookMetadataAggregationParams = {}) {
    super()
    this.authors = authors
    this.tags = tags
    this.releaseDate = releaseDate
    this.summary = summary
    this.summaryNumber = summaryNumber
    this.seriesId = seriesId
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }
}
