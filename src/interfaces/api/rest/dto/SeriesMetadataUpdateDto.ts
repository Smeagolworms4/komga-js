// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/SeriesMetadataUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { SeriesMetadata } from '../../../../domain/model/SeriesMetadata.js'
import { NullOrBlankOrBCP47 } from '../../../../infrastructure/validation/NullOrBlankOrBCP47.js'
import { NullOrNotBlank } from '../../../../infrastructure/validation/NullOrNotBlank.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { registerClass } from '../../../../port/jackson.js'
import { Positive, PositiveOrZero, Valid, constraints } from '../../../../port/validation.js'
import { AlternateTitleUpdateDto } from './AlternateTitleUpdateDto.js'
import { WebLinkUpdateDto } from './BookMetadataUpdateDto.js'

type SeriesMetadataUpdateDtoParams = {
  status?: SeriesMetadata.Status | null
  statusLock?: boolean | null
  title?: string | null
  titleLock?: boolean | null
  titleSort?: string | null
  titleSortLock?: boolean | null
  summary?: string | null
  summaryLock?: boolean | null
  publisher?: string | null
  publisherLock?: boolean | null
  readingDirection?: SeriesMetadata.ReadingDirection | null
  readingDirectionLock?: boolean | null
  ageRating?: number | null
  ageRatingLock?: boolean | null
  language?: string | null
  languageLock?: boolean | null
  genres?: ReadonlySet<string> | null
  genresLock?: boolean | null
  tags?: ReadonlySet<string> | null
  tagsLock?: boolean | null
  totalBookCount?: number | null
  totalBookCountLock?: boolean | null
  sharingLabels?: ReadonlySet<string> | null
  sharingLabelsLock?: boolean | null
  links?: WebLinkUpdateDto[] | null
  linksLock?: boolean | null
  alternateTitles?: AlternateTitleUpdateDto[] | null
  alternateTitlesLock?: boolean | null
}

// PORT: classe Kotlin sans constructeur principal, dont Jackson affecte les propriétés présentes dans le JSON ;
// le constructeur reçoit ici les propriétés lues et les affecte (les setters observables marquent isSet)
export class SeriesMetadataUpdateDto {
  private readonly _isSet = new Map<string, boolean>()

  isSet(prop: string): boolean {
    return this._isSet.get(prop) ?? false
  }

  readonly status: SeriesMetadata.Status | null = null

  readonly statusLock: boolean | null = null

  readonly title: string | null = null

  readonly titleLock: boolean | null = null

  readonly titleSort: string | null = null

  readonly titleSortLock: boolean | null = null

  summary: string | null = null

  summaryLock: boolean | null = null

  publisher: string | null = null

  publisherLock: boolean | null = null

  private _readingDirection: SeriesMetadata.ReadingDirection | null = null
  get readingDirection(): SeriesMetadata.ReadingDirection | null {
    return this._readingDirection
  }
  set readingDirection(value: SeriesMetadata.ReadingDirection | null) {
    this._readingDirection = value
    this._isSet.set('readingDirection', true)
  }

  readingDirectionLock: boolean | null = null

  private _ageRating: number | null = null
  get ageRating(): number | null {
    return this._ageRating
  }
  set ageRating(value: number | null) {
    this._ageRating = value
    this._isSet.set('ageRating', true)
  }

  ageRatingLock: boolean | null = null

  language: string | null = null

  languageLock: boolean | null = null

  private _genres: ReadonlySet<string> | null = null
  get genres(): ReadonlySet<string> | null {
    return this._genres
  }
  set genres(value: ReadonlySet<string> | null) {
    this._genres = value
    this._isSet.set('genres', true)
  }

  genresLock: boolean | null = null

  private _tags: ReadonlySet<string> | null = null
  get tags(): ReadonlySet<string> | null {
    return this._tags
  }
  set tags(value: ReadonlySet<string> | null) {
    this._tags = value
    this._isSet.set('tags', true)
  }

  tagsLock: boolean | null = null

  private _totalBookCount: number | null = null
  get totalBookCount(): number | null {
    return this._totalBookCount
  }
  set totalBookCount(value: number | null) {
    this._totalBookCount = value
    this._isSet.set('totalBookCount', true)
  }

  totalBookCountLock: boolean | null = null

  private _sharingLabels: ReadonlySet<string> | null = null
  get sharingLabels(): ReadonlySet<string> | null {
    return this._sharingLabels
  }
  set sharingLabels(value: ReadonlySet<string> | null) {
    this._sharingLabels = value
    this._isSet.set('sharingLabels', true)
  }

  sharingLabelsLock: boolean | null = null

  private _links: WebLinkUpdateDto[] | null = null
  get links(): WebLinkUpdateDto[] | null {
    return this._links
  }
  set links(value: WebLinkUpdateDto[] | null) {
    this._links = value
    this._isSet.set('links', true)
  }

  linksLock: boolean | null = null

  private _alternateTitles: AlternateTitleUpdateDto[] | null = null
  get alternateTitles(): AlternateTitleUpdateDto[] | null {
    return this._alternateTitles
  }
  set alternateTitles(value: AlternateTitleUpdateDto[] | null) {
    this._alternateTitles = value
    this._isSet.set('alternateTitles', true)
  }

  alternateTitlesLock: boolean | null = null

  constructor(props: SeriesMetadataUpdateDtoParams = {}) {
    Object.assign(this, props)
  }
}

constraints(SeriesMetadataUpdateDto, {
  title: [NullOrNotBlank()],
  titleSort: [NullOrNotBlank()],
  ageRating: [PositiveOrZero()],
  language: [NullOrBlankOrBCP47()],
  totalBookCount: [Positive()],
  links: [Valid()],
  alternateTitles: [Valid()],
})
jsonProperties(SeriesMetadataUpdateDto, {
  status: { nullable: { enum: SeriesMetadata.Status } },
  statusLock: { nullable: 'Boolean' },
  title: { nullable: 'String' },
  titleLock: { nullable: 'Boolean' },
  titleSort: { nullable: 'String' },
  titleSortLock: { nullable: 'Boolean' },
  summary: { nullable: 'String' },
  summaryLock: { nullable: 'Boolean' },
  publisher: { nullable: 'String' },
  publisherLock: { nullable: 'Boolean' },
  readingDirection: { nullable: { enum: SeriesMetadata.ReadingDirection } },
  readingDirectionLock: { nullable: 'Boolean' },
  ageRating: { nullable: 'Int' },
  ageRatingLock: { nullable: 'Boolean' },
  language: { nullable: 'String' },
  languageLock: { nullable: 'Boolean' },
  genres: { nullable: { set: 'String' } },
  genresLock: { nullable: 'Boolean' },
  tags: { nullable: { set: 'String' } },
  tagsLock: { nullable: 'Boolean' },
  totalBookCount: { nullable: 'Int' },
  totalBookCountLock: { nullable: 'Boolean' },
  sharingLabels: { nullable: { set: 'String' } },
  sharingLabelsLock: { nullable: 'Boolean' },
  links: { nullable: { list: { class: WebLinkUpdateDto } } },
  linksLock: { nullable: 'Boolean' },
  alternateTitles: { nullable: { list: { class: AlternateTitleUpdateDto } } },
  alternateTitlesLock: { nullable: 'Boolean' },
})
registerClass('org.gotson.komga.interfaces.api.rest.dto.SeriesMetadataUpdateDto', SeriesMetadataUpdateDto)
