// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v2/dto/Opds2Dto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { json } from '../../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../../port/kotlin.js'
import type { Page } from '../../../../../port/spring-data.js'
import { Positive, PositiveOrZero, constraints } from '../../../../../port/validation.js'
import { WPLinkDto, WPPublicationDto } from '../../../dto/WepPub.js'

type FeedDtoParams = {
  metadata: FeedMetadataDto
  links?: WPLinkDto[]
  navigation?: WPLinkDto[]
  facets?: FacetDto[]
  groups?: FeedGroupDto[]
  publications?: WPPublicationDto[]
}

export class FeedDto extends DataClass<FeedDtoParams> {
  readonly metadata: FeedMetadataDto
  readonly links: WPLinkDto[]
  readonly navigation: WPLinkDto[]
  readonly facets: FacetDto[]
  readonly groups: FeedGroupDto[]
  readonly publications: WPPublicationDto[]

  constructor({ metadata, links = [], navigation = [], facets = [], groups = [], publications = [] }: FeedDtoParams) {
    super()
    this.metadata = metadata
    this.links = links
    this.navigation = navigation
    this.facets = facets
    this.groups = groups
    this.publications = publications
  }
}

type FacetDtoParams = {
  metadata: FeedMetadataDto
  links?: WPLinkDto[]
}

export class FacetDto extends DataClass<FacetDtoParams> {
  readonly metadata: FeedMetadataDto
  readonly links: WPLinkDto[]

  constructor({ metadata, links = [] }: FacetDtoParams) {
    super()
    this.metadata = metadata
    this.links = links
  }
}

type FeedGroupDtoParams = {
  metadata: FeedMetadataDto
  links?: WPLinkDto[]
  navigation?: WPLinkDto[]
  publications?: WPPublicationDto[]
}

export class FeedGroupDto extends DataClass<FeedGroupDtoParams> {
  readonly metadata: FeedMetadataDto
  readonly links: WPLinkDto[]
  readonly navigation: WPLinkDto[]
  readonly publications: WPPublicationDto[]

  constructor({ metadata, links = [], navigation = [], publications = [] }: FeedGroupDtoParams) {
    super()
    this.metadata = metadata
    this.links = links
    this.navigation = navigation
    this.publications = publications
  }
}

type FeedMetadataDtoParams = {
  title: string
  subTitle?: string | null
  type?: string | null
  identifier?: string | null
  modified?: ZonedDateTime | null
  description?: string | null
  page?: Page<unknown> | null
  itemsPerPage?: number | null
  currentPage?: number | null
  numberOfItems?: number | null
}

export class FeedMetadataDto extends DataClass<FeedMetadataDtoParams> {
  readonly title: string
  readonly subTitle: string | null
  // @JsonAlias("@type")
  readonly type: string | null
  readonly identifier: string | null
  readonly modified: ZonedDateTime | null
  readonly description: string | null
  // @JsonIgnore
  readonly page: Page<unknown> | null
  // @Positive
  readonly itemsPerPage: number | null
  // @Positive
  readonly currentPage: number | null
  // @PositiveOrZero
  readonly numberOfItems: number | null

  constructor({
    title,
    subTitle = null,
    type = null,
    identifier = null,
    modified = null,
    description = null,
    page = null,
    itemsPerPage = page?.size ?? null,
    currentPage = page !== null ? page.number + 1 : null,
    numberOfItems = page?.totalElements ?? null,
  }: FeedMetadataDtoParams) {
    super()
    this.title = title
    this.subTitle = subTitle
    this.type = type
    this.identifier = identifier
    this.modified = modified
    this.description = description
    this.page = page
    this.itemsPerPage = itemsPerPage
    this.currentPage = currentPage
    this.numberOfItems = numberOfItems
  }
}

// @JsonInclude(JsonInclude.Include.NON_EMPTY)
json(FeedDto, { include: 'NON_EMPTY' })
jsonProperties(FeedDto, {
  metadata: { class: FeedMetadataDto },
  links: { list: { class: WPLinkDto } },
  navigation: { list: { class: WPLinkDto } },
  facets: { list: { class: FacetDto } },
  groups: { list: { class: FeedGroupDto } },
  publications: { list: { class: WPPublicationDto } },
})
// @JsonInclude(JsonInclude.Include.NON_EMPTY)
json(FacetDto, { include: 'NON_EMPTY' })
jsonProperties(FacetDto, { metadata: { class: FeedMetadataDto }, links: { list: { class: WPLinkDto } } })
// @JsonInclude(JsonInclude.Include.NON_EMPTY)
json(FeedGroupDto, { include: 'NON_EMPTY' })
jsonProperties(FeedGroupDto, {
  metadata: { class: FeedMetadataDto },
  links: { list: { class: WPLinkDto } },
  navigation: { list: { class: WPLinkDto } },
  publications: { list: { class: WPPublicationDto } },
})
// @JsonInclude(JsonInclude.Include.NON_EMPTY)
json(FeedMetadataDto, { include: 'NON_EMPTY', ignore: ['page'], alias: { type: ['@type'] } })
jsonProperties(FeedMetadataDto, {
  title: 'String',
  subTitle: { nullable: 'String' },
  type: { nullable: 'String' },
  identifier: { nullable: 'String' },
  modified: { nullable: JsonTypes.ZonedDateTime },
  description: { nullable: 'String' },
  page: { nullable: 'Any' },
  itemsPerPage: { nullable: 'Int' },
  currentPage: { nullable: 'Int' },
  numberOfItems: { nullable: 'Long' },
})
constraints(FeedMetadataDto, { itemsPerPage: [Positive()], currentPage: [Positive()], numberOfItems: [PositiveOrZero()] })
