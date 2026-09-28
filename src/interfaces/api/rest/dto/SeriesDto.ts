// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/SeriesDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDate, LocalDateTime } from '@js-joda/core'
import { jsonFormatLocalDate, jsonFormatLocalDateTime } from '../../../../port/jackson-format.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { AlternateTitleDto } from './AlternateTitleDto.js'
import { AuthorDto } from './AuthorDto.js'
import { WebLinkDto } from './WebLinkDto.js'

type SeriesDtoParams = {
  id: string
  libraryId: string
  name: string
  url: string
  created: LocalDateTime
  lastModified: LocalDateTime
  fileLastModified: LocalDateTime
  booksCount: number
  booksReadCount: number
  booksUnreadCount: number
  booksInProgressCount: number
  metadata: SeriesMetadataDto
  booksMetadata: BookMetadataAggregationDto
  deleted: boolean
  oneshot: boolean
}

export class SeriesDto extends DataClass<SeriesDtoParams> {
  readonly id: string
  readonly libraryId: string
  readonly name: string
  readonly url: string
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly created: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly lastModified: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly fileLastModified: LocalDateTime
  readonly booksCount: number
  readonly booksReadCount: number
  readonly booksUnreadCount: number
  readonly booksInProgressCount: number
  readonly metadata: SeriesMetadataDto
  readonly booksMetadata: BookMetadataAggregationDto
  readonly deleted: boolean
  readonly oneshot: boolean

  constructor({
    id,
    libraryId,
    name,
    url,
    created,
    lastModified,
    fileLastModified,
    booksCount,
    booksReadCount,
    booksUnreadCount,
    booksInProgressCount,
    metadata,
    booksMetadata,
    deleted,
    oneshot,
  }: SeriesDtoParams) {
    super()
    this.id = id
    this.libraryId = libraryId
    this.name = name
    this.url = url
    this.created = created
    this.lastModified = lastModified
    this.fileLastModified = fileLastModified
    this.booksCount = booksCount
    this.booksReadCount = booksReadCount
    this.booksUnreadCount = booksUnreadCount
    this.booksInProgressCount = booksInProgressCount
    this.metadata = metadata
    this.booksMetadata = booksMetadata
    this.deleted = deleted
    this.oneshot = oneshot
  }
}

export function restrictUrl(self: SeriesDto, restrict: boolean): SeriesDto {
  return restrict ? self.copy({ url: '' }) : self
}

type SeriesMetadataDtoParams = {
  status: string
  statusLock: boolean
  title: string
  titleLock: boolean
  titleSort: string
  titleSortLock: boolean
  summary: string
  summaryLock: boolean
  readingDirection: string
  readingDirectionLock: boolean
  publisher: string
  publisherLock: boolean
  ageRating: number | null
  ageRatingLock: boolean
  language: string
  languageLock: boolean
  genres: ReadonlySet<string>
  genresLock: boolean
  tags: ReadonlySet<string>
  tagsLock: boolean
  totalBookCount: number | null
  totalBookCountLock: boolean
  sharingLabels: ReadonlySet<string>
  sharingLabelsLock: boolean
  links: WebLinkDto[]
  linksLock: boolean
  alternateTitles: AlternateTitleDto[]
  alternateTitlesLock: boolean
  created: LocalDateTime
  lastModified: LocalDateTime
}

export class SeriesMetadataDto extends DataClass<SeriesMetadataDtoParams> {
  readonly status: string
  readonly statusLock: boolean
  readonly title: string
  readonly titleLock: boolean
  readonly titleSort: string
  readonly titleSortLock: boolean
  readonly summary: string
  readonly summaryLock: boolean
  readonly readingDirection: string
  readonly readingDirectionLock: boolean
  readonly publisher: string
  readonly publisherLock: boolean
  readonly ageRating: number | null
  readonly ageRatingLock: boolean
  readonly language: string
  readonly languageLock: boolean
  readonly genres: ReadonlySet<string>
  readonly genresLock: boolean
  readonly tags: ReadonlySet<string>
  readonly tagsLock: boolean
  readonly totalBookCount: number | null
  readonly totalBookCountLock: boolean
  readonly sharingLabels: ReadonlySet<string>
  readonly sharingLabelsLock: boolean
  readonly links: WebLinkDto[]
  readonly linksLock: boolean
  readonly alternateTitles: AlternateTitleDto[]
  readonly alternateTitlesLock: boolean
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly created: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly lastModified: LocalDateTime

  constructor({
    status,
    statusLock,
    title,
    titleLock,
    titleSort,
    titleSortLock,
    summary,
    summaryLock,
    readingDirection,
    readingDirectionLock,
    publisher,
    publisherLock,
    ageRating,
    ageRatingLock,
    language,
    languageLock,
    genres,
    genresLock,
    tags,
    tagsLock,
    totalBookCount,
    totalBookCountLock,
    sharingLabels,
    sharingLabelsLock,
    links,
    linksLock,
    alternateTitles,
    alternateTitlesLock,
    created,
    lastModified,
  }: SeriesMetadataDtoParams) {
    super()
    this.status = status
    this.statusLock = statusLock
    this.title = title
    this.titleLock = titleLock
    this.titleSort = titleSort
    this.titleSortLock = titleSortLock
    this.summary = summary
    this.summaryLock = summaryLock
    this.readingDirection = readingDirection
    this.readingDirectionLock = readingDirectionLock
    this.publisher = publisher
    this.publisherLock = publisherLock
    this.ageRating = ageRating
    this.ageRatingLock = ageRatingLock
    this.language = language
    this.languageLock = languageLock
    this.genres = genres
    this.genresLock = genresLock
    this.tags = tags
    this.tagsLock = tagsLock
    this.totalBookCount = totalBookCount
    this.totalBookCountLock = totalBookCountLock
    this.sharingLabels = sharingLabels
    this.sharingLabelsLock = sharingLabelsLock
    this.links = links
    this.linksLock = linksLock
    this.alternateTitles = alternateTitles
    this.alternateTitlesLock = alternateTitlesLock
    this.created = created
    this.lastModified = lastModified
  }
}

type BookMetadataAggregationDtoParams = {
  authors?: AuthorDto[]
  tags?: ReadonlySet<string>
  releaseDate: LocalDate | null
  summary: string
  summaryNumber: string
  created: LocalDateTime
  lastModified: LocalDateTime
}

export class BookMetadataAggregationDto extends DataClass<BookMetadataAggregationDtoParams> {
  readonly authors: AuthorDto[]
  readonly tags: ReadonlySet<string>
  // @JsonFormat(pattern = "yyyy-MM-dd")
  readonly releaseDate: LocalDate | null
  readonly summary: string
  readonly summaryNumber: string
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly created: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly lastModified: LocalDateTime

  constructor({
    authors = [],
    tags = new Set(),
    releaseDate,
    summary,
    summaryNumber,
    created,
    lastModified,
  }: BookMetadataAggregationDtoParams) {
    super()
    this.authors = authors
    this.tags = tags
    this.releaseDate = releaseDate
    this.summary = summary
    this.summaryNumber = summaryNumber
    this.created = created
    this.lastModified = lastModified
  }
}

const dateTimeZ = jsonFormatLocalDateTime("yyyy-MM-dd'T'HH:mm:ss'Z'")

jsonProperties(
  SeriesDto,
  {
    id: 'String',
    libraryId: 'String',
    name: 'String',
    url: 'String',
    created: dateTimeZ,
    lastModified: dateTimeZ,
    fileLastModified: dateTimeZ,
    booksCount: 'Int',
    booksReadCount: 'Int',
    booksUnreadCount: 'Int',
    booksInProgressCount: 'Int',
    metadata: { class: SeriesMetadataDto },
    booksMetadata: { class: BookMetadataAggregationDto },
    deleted: 'Boolean',
    oneshot: 'Boolean',
  },
  [],
  {
    required: [
      'id',
      'libraryId',
      'name',
      'url',
      'created',
      'lastModified',
      'fileLastModified',
      'booksCount',
      'booksReadCount',
      'booksUnreadCount',
      'booksInProgressCount',
      'metadata',
      'booksMetadata',
      'deleted',
      'oneshot',
    ],
  },
)
jsonProperties(
  SeriesMetadataDto,
  {
    status: 'String',
    statusLock: 'Boolean',
    title: 'String',
    titleLock: 'Boolean',
    titleSort: 'String',
    titleSortLock: 'Boolean',
    summary: 'String',
    summaryLock: 'Boolean',
    readingDirection: 'String',
    readingDirectionLock: 'Boolean',
    publisher: 'String',
    publisherLock: 'Boolean',
    ageRating: { nullable: 'Int' },
    ageRatingLock: 'Boolean',
    language: 'String',
    languageLock: 'Boolean',
    genres: { set: 'String' },
    genresLock: 'Boolean',
    tags: { set: 'String' },
    tagsLock: 'Boolean',
    totalBookCount: { nullable: 'Int' },
    totalBookCountLock: 'Boolean',
    sharingLabels: { set: 'String' },
    sharingLabelsLock: 'Boolean',
    links: { list: { class: WebLinkDto } },
    linksLock: 'Boolean',
    alternateTitles: { list: { class: AlternateTitleDto } },
    alternateTitlesLock: 'Boolean',
    created: dateTimeZ,
    lastModified: dateTimeZ,
  },
  [],
  {
    required: [
      'status',
      'statusLock',
      'title',
      'titleLock',
      'titleSort',
      'titleSortLock',
      'summary',
      'summaryLock',
      'readingDirection',
      'readingDirectionLock',
      'publisher',
      'publisherLock',
      'ageRatingLock',
      'language',
      'languageLock',
      'genres',
      'genresLock',
      'tags',
      'tagsLock',
      'totalBookCountLock',
      'sharingLabels',
      'sharingLabelsLock',
      'links',
      'linksLock',
      'alternateTitles',
      'alternateTitlesLock',
      'created',
      'lastModified',
    ],
  },
)
jsonProperties(
  BookMetadataAggregationDto,
  {
    authors: { list: { class: AuthorDto } },
    tags: { set: 'String' },
    releaseDate: { nullable: jsonFormatLocalDate('yyyy-MM-dd') },
    summary: 'String',
    summaryNumber: 'String',
    created: dateTimeZ,
    lastModified: dateTimeZ,
  },
  [],
  {
    required: [
      'summary',
      'summaryNumber',
      'created',
      'lastModified',
    ],
  },
)
