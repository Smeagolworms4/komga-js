// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/SeriesMetadataPatch.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'
import type { SeriesMetadata } from './SeriesMetadata.js'

type SeriesMetadataPatchParams = {
  title: string | null
  titleSort: string | null
  status: SeriesMetadata.Status | null
  summary: string | null
  readingDirection: SeriesMetadata.ReadingDirection | null
  publisher: string | null
  ageRating: number | null
  language: string | null
  genres: ReadonlySet<string> | null
  totalBookCount: number | null
  collections: ReadonlySet<string>
}

export class SeriesMetadataPatch extends DataClass<SeriesMetadataPatchParams> {
  readonly title: string | null
  readonly titleSort: string | null
  readonly status: SeriesMetadata.Status | null
  readonly summary: string | null
  readonly readingDirection: SeriesMetadata.ReadingDirection | null
  readonly publisher: string | null
  readonly ageRating: number | null
  readonly language: string | null
  readonly genres: ReadonlySet<string> | null
  readonly totalBookCount: number | null
  readonly collections: ReadonlySet<string>

  constructor({
    title,
    titleSort,
    status,
    summary,
    readingDirection,
    publisher,
    ageRating,
    language,
    genres,
    totalBookCount,
    collections,
  }: SeriesMetadataPatchParams) {
    super()
    this.title = title
    this.titleSort = titleSort
    this.status = status
    this.summary = summary
    this.readingDirection = readingDirection
    this.publisher = publisher
    this.ageRating = ageRating
    this.language = language
    this.genres = genres
    this.totalBookCount = totalBookCount
    this.collections = collections
  }
}
