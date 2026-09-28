// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/KoboBookMetadataDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { json } from '../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { AmountDto } from './AmountDto.js'
import { ContributorDto } from './ContributorDto.js'
import { DownloadUrlDto } from './DownloadUrlDto.js'
import { KoboSeriesDto } from './KoboSeriesDto.js'
import { PublisherDto } from './PublisherDto.js'

export const DUMMY_ID = '00000000-0000-0000-0000-000000000001'

type KoboBookMetadataDtoParams = {
  categories?: string[]
  contributorRoles?: ContributorDto[]
  contributors?: string[]
  coverImageId?: string | null
  crossRevisionId: string
  currentDisplayPrice?: AmountDto
  currentLoveDisplayPrice?: AmountDto
  description?: string | null
  downloadUrls?: DownloadUrlDto[]
  entitlementId: string
  externalIds?: string[]
  genre?: string
  isEligibleForKoboLove?: boolean
  isInternetArchive?: boolean
  isPreOrder?: boolean
  isSocialEnabled?: boolean
  isbn?: string | null
  language?: string
  phoneticPronunciations?: Map<string, string>
  publicationDate?: ZonedDateTime | null
  publisher?: PublisherDto | null
  revisionId: string
  series?: KoboSeriesDto | null
  slug?: string | null
  subTitle?: string | null
  title: string
  workId: string
  isKepub: boolean
  isPrePaginated: boolean
  fileSize: number
  extraFileSizes?: Map<string, number>
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
// @JsonInclude(JsonInclude.Include.NON_NULL)
export class KoboBookMetadataDto extends DataClass<KoboBookMetadataDtoParams> {
  readonly categories: string[]
  readonly contributorRoles: ContributorDto[]
  readonly contributors: string[]
  readonly coverImageId: string | null
  readonly crossRevisionId: string
  readonly currentDisplayPrice: AmountDto
  readonly currentLoveDisplayPrice: AmountDto
  readonly description: string | null
  readonly downloadUrls: DownloadUrlDto[]
  readonly entitlementId: string
  readonly externalIds: string[]
  readonly genre: string
  readonly isEligibleForKoboLove: boolean
  readonly isInternetArchive: boolean
  readonly isPreOrder: boolean
  readonly isSocialEnabled: boolean
  readonly isbn: string | null
  /**
   * 2-letter code
   */
  readonly language: string
  readonly phoneticPronunciations: Map<string, string>
  readonly publicationDate: ZonedDateTime | null
  readonly publisher: PublisherDto | null
  readonly revisionId: string
  readonly series: KoboSeriesDto | null
  readonly slug: string | null
  readonly subTitle: string | null
  readonly title: string
  readonly workId: string
  // @JsonIgnore
  readonly isKepub: boolean
  // @JsonIgnore
  readonly isPrePaginated: boolean
  // @JsonIgnore
  readonly fileSize: number
  // file size per profile
  // @JsonIgnore
  readonly extraFileSizes: Map<string, number>

  constructor({
    categories = [DUMMY_ID],
    contributorRoles = [],
    contributors = [],
    coverImageId = null,
    crossRevisionId,
    currentDisplayPrice = new AmountDto({ currencyCode: 'USD', totalAmount: 0 }),
    currentLoveDisplayPrice = new AmountDto({ totalAmount: 0 }),
    description = null,
    downloadUrls = [],
    entitlementId,
    externalIds = [],
    genre = DUMMY_ID,
    isEligibleForKoboLove = false,
    isInternetArchive = false,
    isPreOrder = false,
    isSocialEnabled = true,
    isbn = null,
    language = 'en',
    phoneticPronunciations = new Map(),
    publicationDate = null,
    publisher = null,
    revisionId,
    series = null,
    slug = null,
    subTitle = null,
    title,
    workId,
    isKepub,
    isPrePaginated,
    fileSize,
    extraFileSizes = new Map(),
  }: KoboBookMetadataDtoParams) {
    super()
    this.categories = categories
    this.contributorRoles = contributorRoles
    this.contributors = contributors
    this.coverImageId = coverImageId
    this.crossRevisionId = crossRevisionId
    this.currentDisplayPrice = currentDisplayPrice
    this.currentLoveDisplayPrice = currentLoveDisplayPrice
    this.description = description
    this.downloadUrls = downloadUrls
    this.entitlementId = entitlementId
    this.externalIds = externalIds
    this.genre = genre
    this.isEligibleForKoboLove = isEligibleForKoboLove
    this.isInternetArchive = isInternetArchive
    this.isPreOrder = isPreOrder
    this.isSocialEnabled = isSocialEnabled
    this.isbn = isbn
    this.language = language
    this.phoneticPronunciations = phoneticPronunciations
    this.publicationDate = publicationDate
    this.publisher = publisher
    this.revisionId = revisionId
    this.series = series
    this.slug = slug
    this.subTitle = subTitle
    this.title = title
    this.workId = workId
    this.isKepub = isKepub
    this.isPrePaginated = isPrePaginated
    this.fileSize = fileSize
    this.extraFileSizes = extraFileSizes
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(KoboBookMetadataDto, {
  rename: {
    categories: 'Categories',
    contributorRoles: 'ContributorRoles',
    contributors: 'Contributors',
    coverImageId: 'CoverImageId',
    crossRevisionId: 'CrossRevisionId',
    currentDisplayPrice: 'CurrentDisplayPrice',
    currentLoveDisplayPrice: 'CurrentLoveDisplayPrice',
    description: 'Description',
    downloadUrls: 'DownloadUrls',
    entitlementId: 'EntitlementId',
    externalIds: 'ExternalIds',
    genre: 'Genre',
    isEligibleForKoboLove: 'IsEligibleForKoboLove',
    isInternetArchive: 'IsInternetArchive',
    isPreOrder: 'IsPreOrder',
    isSocialEnabled: 'IsSocialEnabled',
    isbn: 'Isbn',
    language: 'Language',
    phoneticPronunciations: 'PhoneticPronunciations',
    publicationDate: 'PublicationDate',
    publisher: 'Publisher',
    revisionId: 'RevisionId',
    series: 'Series',
    slug: 'Slug',
    subTitle: 'SubTitle',
    title: 'Title',
    workId: 'WorkId',
  },
  ignore: ['isKepub', 'isPrePaginated', 'fileSize', 'extraFileSizes'],
  include: 'NON_NULL',
})
jsonProperties(
  KoboBookMetadataDto,
  {
    categories: { list: 'String' },
    contributorRoles: { list: { class: ContributorDto } },
    contributors: { list: 'String' },
    coverImageId: { nullable: 'String' },
    crossRevisionId: 'String',
    currentDisplayPrice: { class: AmountDto },
    currentLoveDisplayPrice: { class: AmountDto },
    description: { nullable: 'String' },
    downloadUrls: { list: { class: DownloadUrlDto } },
    entitlementId: 'String',
    externalIds: { list: 'String' },
    genre: 'String',
    isEligibleForKoboLove: 'Boolean',
    isInternetArchive: 'Boolean',
    isPreOrder: 'Boolean',
    isSocialEnabled: 'Boolean',
    isbn: { nullable: 'String' },
    language: 'String',
    phoneticPronunciations: { map: 'String' },
    publicationDate: { nullable: JsonTypes.ZonedDateTime },
    publisher: { nullable: { class: PublisherDto } },
    revisionId: 'String',
    series: { nullable: { class: KoboSeriesDto } },
    slug: { nullable: 'String' },
    subTitle: { nullable: 'String' },
    title: 'String',
    workId: 'String',
    isKepub: 'Boolean',
    isPrePaginated: 'Boolean',
    fileSize: 'Long',
    extraFileSizes: { map: 'Long' },
  },
  [],
  { required: ['crossRevisionId', 'entitlementId', 'revisionId', 'title', 'workId', 'isKepub', 'isPrePaginated', 'fileSize'] },
)
