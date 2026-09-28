// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/BookDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDate, LocalDateTime } from '@js-joda/core'
import { MediaType } from '../../../../domain/model/MediaType.js'
import { BinaryByteUnit } from '../../../../port/byteunits.js'
import { FilenameUtils } from '../../../../port/commons-io.js'
import { jsonFormatLocalDate, jsonFormatLocalDateTime } from '../../../../port/jackson-format.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass, kFloat, lazy } from '../../../../port/kotlin.js'
import { AuthorDto } from './AuthorDto.js'
import { WebLinkDto } from './WebLinkDto.js'

type BookDtoParams = {
  id: string
  seriesId: string
  seriesTitle: string
  libraryId: string
  name: string
  url: string
  number: number
  created: LocalDateTime
  lastModified: LocalDateTime
  fileLastModified: LocalDateTime
  sizeBytes: number
  size?: string
  media: MediaDto
  metadata: BookMetadataDto
  readProgress?: ReadProgressDto | null
  deleted: boolean
  fileHash: string
  oneshot: boolean
}

export class BookDto extends DataClass<BookDtoParams> {
  readonly id: string
  readonly seriesId: string
  readonly seriesTitle: string
  readonly libraryId: string
  readonly name: string
  readonly url: string
  readonly number: number
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly created: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly lastModified: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly fileLastModified: LocalDateTime
  readonly sizeBytes: number
  readonly size: string
  readonly media: MediaDto
  readonly metadata: BookMetadataDto
  readonly readProgress: ReadProgressDto | null
  readonly deleted: boolean
  readonly fileHash: string
  readonly oneshot: boolean

  constructor({
    id,
    seriesId,
    seriesTitle,
    libraryId,
    name,
    url,
    number,
    created,
    lastModified,
    fileLastModified,
    sizeBytes,
    size = BinaryByteUnit.format(sizeBytes),
    media,
    metadata,
    readProgress = null,
    deleted,
    fileHash,
    oneshot,
  }: BookDtoParams) {
    super()
    this.id = id
    this.seriesId = seriesId
    this.seriesTitle = seriesTitle
    this.libraryId = libraryId
    this.name = name
    this.url = url
    this.number = number
    this.created = created
    this.lastModified = lastModified
    this.fileLastModified = fileLastModified
    this.sizeBytes = sizeBytes
    this.size = size
    this.media = media
    this.metadata = metadata
    this.readProgress = readProgress
    this.deleted = deleted
    this.fileHash = fileHash
    this.oneshot = oneshot
  }
}

export function restrictUrl(self: BookDto, restrict: boolean): BookDto {
  return restrict ? self.copy({ url: FilenameUtils.getName(self.url) }) : self
}

type MediaDtoParams = {
  status: string
  mediaType: string
  pagesCount: number
  comment: string
  epubDivinaCompatible: boolean
  epubIsKepub: boolean
}

export class MediaDto extends DataClass<MediaDtoParams> {
  readonly status: string
  readonly mediaType: string
  readonly pagesCount: number
  readonly comment: string
  readonly epubDivinaCompatible: boolean
  readonly epubIsKepub: boolean

  constructor({ status, mediaType, pagesCount, comment, epubDivinaCompatible, epubIsKepub }: MediaDtoParams) {
    super()
    this.status = status
    this.mediaType = mediaType
    this.pagesCount = pagesCount
    this.comment = comment
    this.epubDivinaCompatible = epubDivinaCompatible
    this.epubIsKepub = epubIsKepub
  }

  get mediaProfile(): string {
    return lazy(this, 'mediaProfile', () => MediaType.fromMediaType(this.mediaType)?.profile?.name ?? '')
  }
}

type BookMetadataDtoParams = {
  title: string
  titleLock: boolean
  summary: string
  summaryLock: boolean
  number: string
  numberLock: boolean
  numberSort: number
  numberSortLock: boolean
  releaseDate: LocalDate | null
  releaseDateLock: boolean
  authors: AuthorDto[]
  authorsLock: boolean
  tags: ReadonlySet<string>
  tagsLock: boolean
  isbn: string
  isbnLock: boolean
  links: WebLinkDto[]
  linksLock: boolean
  created: LocalDateTime
  lastModified: LocalDateTime
}

export class BookMetadataDto extends DataClass<BookMetadataDtoParams> {
  readonly title: string
  readonly titleLock: boolean
  readonly summary: string
  readonly summaryLock: boolean
  readonly number: string
  readonly numberLock: boolean
  readonly numberSort: number // PORT: Float
  readonly numberSortLock: boolean
  // @JsonFormat(pattern = "yyyy-MM-dd")
  readonly releaseDate: LocalDate | null
  readonly releaseDateLock: boolean
  readonly authors: AuthorDto[]
  readonly authorsLock: boolean
  readonly tags: ReadonlySet<string>
  readonly tagsLock: boolean
  readonly isbn: string
  readonly isbnLock: boolean
  readonly links: WebLinkDto[]
  readonly linksLock: boolean
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly created: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly lastModified: LocalDateTime

  constructor({
    title,
    titleLock,
    summary,
    summaryLock,
    number,
    numberLock,
    numberSort,
    numberSortLock,
    releaseDate,
    releaseDateLock,
    authors,
    authorsLock,
    tags,
    tagsLock,
    isbn,
    isbnLock,
    links,
    linksLock,
    created,
    lastModified,
  }: BookMetadataDtoParams) {
    super()
    this.title = title
    this.titleLock = titleLock
    this.summary = summary
    this.summaryLock = summaryLock
    this.number = number
    this.numberLock = numberLock
    this.numberSort = kFloat(numberSort)
    this.numberSortLock = numberSortLock
    this.releaseDate = releaseDate
    this.releaseDateLock = releaseDateLock
    this.authors = authors
    this.authorsLock = authorsLock
    this.tags = tags
    this.tagsLock = tagsLock
    this.isbn = isbn
    this.isbnLock = isbnLock
    this.links = links
    this.linksLock = linksLock
    this.created = created
    this.lastModified = lastModified
  }
}

type ReadProgressDtoParams = {
  page: number
  completed: boolean
  readDate: LocalDateTime
  created: LocalDateTime
  lastModified: LocalDateTime
  deviceId: string
  deviceName: string
}

export class ReadProgressDto extends DataClass<ReadProgressDtoParams> {
  readonly page: number
  readonly completed: boolean
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly readDate: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly created: LocalDateTime
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly lastModified: LocalDateTime
  readonly deviceId: string
  readonly deviceName: string

  constructor({ page, completed, readDate, created, lastModified, deviceId, deviceName }: ReadProgressDtoParams) {
    super()
    this.page = page
    this.completed = completed
    this.readDate = readDate
    this.created = created
    this.lastModified = lastModified
    this.deviceId = deviceId
    this.deviceName = deviceName
  }
}

const dateTimeZ = jsonFormatLocalDateTime("yyyy-MM-dd'T'HH:mm:ss'Z'")

jsonProperties(
  BookDto,
  {
    id: 'String',
    seriesId: 'String',
    seriesTitle: 'String',
    libraryId: 'String',
    name: 'String',
    url: 'String',
    number: 'Int',
    created: dateTimeZ,
    lastModified: dateTimeZ,
    fileLastModified: dateTimeZ,
    sizeBytes: 'Long',
    size: 'String',
    media: { class: MediaDto },
    metadata: { class: BookMetadataDto },
    readProgress: { nullable: { class: ReadProgressDto } },
    deleted: 'Boolean',
    fileHash: 'String',
    oneshot: 'Boolean',
  },
  [],
  { required: ['id', 'seriesId', 'seriesTitle', 'libraryId', 'name', 'url', 'number', 'created', 'lastModified', 'fileLastModified', 'sizeBytes', 'media', 'metadata', 'deleted', 'fileHash', 'oneshot'] },
)
jsonProperties(
  MediaDto,
  { status: 'String', mediaType: 'String', pagesCount: 'Int', comment: 'String', epubDivinaCompatible: 'Boolean', epubIsKepub: 'Boolean' },
  [],
  { required: ['status', 'mediaType', 'pagesCount', 'comment', 'epubDivinaCompatible', 'epubIsKepub'], getters: ['mediaProfile'] },
)
jsonProperties(
  BookMetadataDto,
  {
    title: 'String',
    titleLock: 'Boolean',
    summary: 'String',
    summaryLock: 'Boolean',
    number: 'String',
    numberLock: 'Boolean',
    numberSort: 'Float',
    numberSortLock: 'Boolean',
    releaseDate: { nullable: jsonFormatLocalDate('yyyy-MM-dd') },
    releaseDateLock: 'Boolean',
    authors: { list: { class: AuthorDto } },
    authorsLock: 'Boolean',
    tags: { set: 'String' },
    tagsLock: 'Boolean',
    isbn: 'String',
    isbnLock: 'Boolean',
    links: { list: { class: WebLinkDto } },
    linksLock: 'Boolean',
    created: dateTimeZ,
    lastModified: dateTimeZ,
  },
  [],
  {
    required: [
      'title',
      'titleLock',
      'summary',
      'summaryLock',
      'number',
      'numberLock',
      'numberSort',
      'numberSortLock',
      'releaseDateLock',
      'authors',
      'authorsLock',
      'tags',
      'tagsLock',
      'isbn',
      'isbnLock',
      'links',
      'linksLock',
      'created',
      'lastModified',
    ],
  },
)
jsonProperties(
  ReadProgressDto,
  { page: 'Int', completed: 'Boolean', readDate: dateTimeZ, created: dateTimeZ, lastModified: dateTimeZ, deviceId: 'String', deviceName: 'String' },
  [],
  { required: ['page', 'completed', 'readDate', 'created', 'lastModified', 'deviceId', 'deviceName'] },
)
