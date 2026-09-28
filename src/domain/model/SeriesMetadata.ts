// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/SeriesMetadata.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { lowerNotBlank } from '../../language/LanguageUtils.js'
import { trim } from '../../port/extra-metadata.js'
import { registerClass } from '../../port/jackson.js'
import { KEnum, distinctSet, str } from '../../port/kotlin.js'
import type { AlternateTitle } from './AlternateTitle.js'
import type { Auditable } from './Auditable.js'
import { BCP47TagValidator } from './BCP47TagValidator.js'
import type { WebLink } from './WebLink.js'

type SeriesMetadataParams = {
  status?: SeriesMetadata.Status
  title: string
  titleSort?: string
  summary?: string
  readingDirection?: SeriesMetadata.ReadingDirection | null
  publisher?: string
  ageRating?: number | null
  language?: string
  genres?: ReadonlySet<string>
  tags?: ReadonlySet<string>
  totalBookCount?: number | null
  sharingLabels?: ReadonlySet<string>
  links?: WebLink[]
  alternateTitles?: AlternateTitle[]
  statusLock?: boolean
  titleLock?: boolean
  titleSortLock?: boolean
  summaryLock?: boolean
  readingDirectionLock?: boolean
  publisherLock?: boolean
  ageRatingLock?: boolean
  languageLock?: boolean
  genresLock?: boolean
  tagsLock?: boolean
  totalBookCountLock?: boolean
  sharingLabelsLock?: boolean
  linksLock?: boolean
  alternateTitlesLock?: boolean
  seriesId?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class SeriesMetadata implements Auditable {
  readonly status: SeriesMetadata.Status
  readonly readingDirection: SeriesMetadata.ReadingDirection | null
  readonly ageRating: number | null
  readonly totalBookCount: number | null
  readonly links: WebLink[]
  readonly alternateTitles: AlternateTitle[]
  readonly statusLock: boolean
  readonly titleLock: boolean
  readonly titleSortLock: boolean
  readonly summaryLock: boolean
  readonly readingDirectionLock: boolean
  readonly publisherLock: boolean
  readonly ageRatingLock: boolean
  readonly languageLock: boolean
  readonly genresLock: boolean
  readonly tagsLock: boolean
  readonly totalBookCountLock: boolean
  readonly sharingLabelsLock: boolean
  readonly linksLock: boolean
  readonly alternateTitlesLock: boolean
  readonly seriesId: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  readonly title: string
  readonly titleSort: string
  readonly summary: string
  readonly publisher: string
  readonly language: string
  readonly tags: Set<string>
  readonly genres: Set<string>
  readonly sharingLabels: Set<string>

  constructor({
    status = SeriesMetadata.Status.ONGOING,
    title,
    titleSort = title,
    summary = '',
    readingDirection = null,
    publisher = '',
    ageRating = null,
    language = '',
    genres = new Set(),
    tags = new Set(),
    totalBookCount = null,
    sharingLabels = new Set(),
    links = [],
    alternateTitles = [],
    statusLock = false,
    titleLock = false,
    titleSortLock = false,
    summaryLock = false,
    readingDirectionLock = false,
    publisherLock = false,
    ageRatingLock = false,
    languageLock = false,
    genresLock = false,
    tagsLock = false,
    totalBookCountLock = false,
    sharingLabelsLock = false,
    linksLock = false,
    alternateTitlesLock = false,
    seriesId = '',
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: SeriesMetadataParams) {
    this.status = status
    this.readingDirection = readingDirection
    this.ageRating = ageRating
    this.totalBookCount = totalBookCount
    this.links = links
    this.alternateTitles = alternateTitles
    this.statusLock = statusLock
    this.titleLock = titleLock
    this.titleSortLock = titleSortLock
    this.summaryLock = summaryLock
    this.readingDirectionLock = readingDirectionLock
    this.publisherLock = publisherLock
    this.ageRatingLock = ageRatingLock
    this.languageLock = languageLock
    this.genresLock = genresLock
    this.tagsLock = tagsLock
    this.totalBookCountLock = totalBookCountLock
    this.sharingLabelsLock = sharingLabelsLock
    this.linksLock = linksLock
    this.alternateTitlesLock = alternateTitlesLock
    this.seriesId = seriesId
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate

    this.title = trim(title)
    this.titleSort = trim(titleSort)
    this.summary = trim(summary)
    this.publisher = trim(publisher)
    this.language = BCP47TagValidator.normalize(trim(language))
    this.tags = distinctSet(lowerNotBlank(tags))
    this.genres = distinctSet(lowerNotBlank(genres))
    this.sharingLabels = distinctSet(lowerNotBlank(sharingLabels))
  }

  copy({
    status = this.status,
    title = this.title,
    titleSort = this.titleSort,
    summary = this.summary,
    readingDirection = this.readingDirection,
    publisher = this.publisher,
    ageRating = this.ageRating,
    language = this.language,
    genres = this.genres,
    tags = this.tags,
    totalBookCount = this.totalBookCount,
    sharingLabels = this.sharingLabels,
    links = this.links,
    alternateTitles = this.alternateTitles,
    statusLock = this.statusLock,
    titleLock = this.titleLock,
    titleSortLock = this.titleSortLock,
    summaryLock = this.summaryLock,
    readingDirectionLock = this.readingDirectionLock,
    publisherLock = this.publisherLock,
    ageRatingLock = this.ageRatingLock,
    languageLock = this.languageLock,
    genresLock = this.genresLock,
    tagsLock = this.tagsLock,
    totalBookCountLock = this.totalBookCountLock,
    sharingLabelsLock = this.sharingLabelsLock,
    linksLock = this.linksLock,
    alternateTitlesLock = this.alternateTitlesLock,
    seriesId = this.seriesId,
    createdDate = this.createdDate,
    lastModifiedDate = this.lastModifiedDate,
  }: Partial<SeriesMetadataParams> = {}): SeriesMetadata {
    return new SeriesMetadata({
      status: status,
      title: title,
      titleSort: titleSort,
      summary: summary,
      readingDirection: readingDirection,
      publisher: publisher,
      ageRating: ageRating,
      language: language,
      genres: genres,
      tags: tags,
      totalBookCount: totalBookCount,
      sharingLabels: sharingLabels,
      links: links,
      alternateTitles: alternateTitles,
      statusLock: statusLock,
      titleLock: titleLock,
      titleSortLock: titleSortLock,
      summaryLock: summaryLock,
      readingDirectionLock: readingDirectionLock,
      publisherLock: publisherLock,
      ageRatingLock: ageRatingLock,
      languageLock: languageLock,
      genresLock: genresLock,
      tagsLock: tagsLock,
      totalBookCountLock: totalBookCountLock,
      sharingLabelsLock: sharingLabelsLock,
      linksLock: linksLock,
      alternateTitlesLock: alternateTitlesLock,
      seriesId: seriesId,
      createdDate: createdDate,
      lastModifiedDate: lastModifiedDate,
    })
  }

  toString(): string {
    return `SeriesMetadata(status=${this.status}, readingDirection=${str(this.readingDirection)}, ageRating=${str(this.ageRating)}, totalBookCount=${str(this.totalBookCount)}, links=${str(this.links)}, alternateTitles=${str(this.alternateTitles)}, statusLock=${this.statusLock}, titleLock=${this.titleLock}, titleSortLock=${this.titleSortLock}, summaryLock=${this.summaryLock}, readingDirectionLock=${this.readingDirectionLock}, publisherLock=${this.publisherLock}, ageRatingLock=${this.ageRatingLock}, languageLock=${this.languageLock}, genresLock=${this.genresLock}, tagsLock=${this.tagsLock}, totalBookCountLock=${this.totalBookCountLock}, sharingLabelsLock=${this.sharingLabelsLock}, linksLock=${this.linksLock}, alternateTitlesLock=${this.alternateTitlesLock}, seriesId='${this.seriesId}', createdDate=${this.createdDate}, lastModifiedDate=${this.lastModifiedDate}, title='${this.title}', titleSort='${this.titleSort}', summary='${this.summary}', publisher='${this.publisher}', language='${this.language}', tags=${str(this.tags)}, genres=${str(this.genres)}, sharingLabels=${str(this.sharingLabels)})`
  }
}

export namespace SeriesMetadata {
  export class Status extends KEnum {
    static readonly ENDED = new Status('ENDED')
    static readonly ONGOING = new Status('ONGOING')
    static readonly ABANDONED = new Status('ABANDONED')
    static readonly HIATUS = new Status('HIATUS')
  }

  export class ReadingDirection extends KEnum {
    static readonly LEFT_TO_RIGHT = new ReadingDirection('LEFT_TO_RIGHT')
    static readonly RIGHT_TO_LEFT = new ReadingDirection('RIGHT_TO_LEFT')
    static readonly VERTICAL = new ReadingDirection('VERTICAL')
    static readonly WEBTOON = new ReadingDirection('WEBTOON')
  }
}

registerClass('org.gotson.komga.domain.model.SeriesMetadata$Status', SeriesMetadata.Status as never)
