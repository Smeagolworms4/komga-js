// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/dto/WepPub.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDate, ZonedDateTime } from '@js-joda/core'
import { json } from '../../../port/jackson.js'
import { type JsonType, JsonTypes, jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass, IllegalArgumentException, KEnum, kFloat } from '../../../port/kotlin.js'
import { openApiSchema } from '../../../port/swagger-annotations.js'
import { constraints, Positive } from '../../../port/validation.js'

type WPLinkDtoParams = {
  title?: string | null
  rel?: string | null
  href?: string | null
  type?: string | null
  templated?: boolean | null
  width?: number | null
  height?: number | null
  alternate?: WPLinkDto[]
  children?: WPLinkDto[]
  properties?: Map<string, Map<string, unknown>>
}

export class WPLinkDto extends DataClass<WPLinkDtoParams> {
  readonly title: string | null
  readonly rel: string | null
  readonly href: string | null
  readonly type: string | null
  readonly templated: boolean | null
  readonly width: number | null
  readonly height: number | null
  readonly alternate: WPLinkDto[]
  readonly children: WPLinkDto[]
  readonly properties: Map<string, Map<string, unknown>>

  constructor({
    title = null,
    rel = null,
    href = null,
    type = null,
    templated = null,
    width = null,
    height = null,
    alternate = [],
    children = [],
    properties = new Map(),
  }: WPLinkDtoParams = {}) {
    super()
    this.title = title
    this.rel = rel
    this.href = href
    this.type = type
    this.templated = templated
    this.width = width
    this.height = height
    this.alternate = alternate
    this.children = children
    this.properties = properties
  }
}

// @JsonInclude(JsonInclude.Include.NON_EMPTY)
json(WPLinkDto, { include: 'NON_EMPTY' })
constraints(WPLinkDto, { width: [Positive()], height: [Positive()] })

type WPPublicationDtoParams = {
  mediaType: string
  context?: string | null
  metadata: WPMetadataDto
  links: WPLinkDto[]
  images?: WPLinkDto[]
  readingOrder?: WPLinkDto[]
  resources?: WPLinkDto[]
  toc?: WPLinkDto[]
  landmarks?: WPLinkDto[]
  pageList?: WPLinkDto[]
}

export class WPPublicationDto extends DataClass<WPPublicationDtoParams> {
  // PORT: org.springframework.http.MediaType -> chaîne
  readonly mediaType: string
  readonly context: string | null
  readonly metadata: WPMetadataDto
  readonly links: WPLinkDto[]
  readonly images: WPLinkDto[]
  readonly readingOrder: WPLinkDto[]
  readonly resources: WPLinkDto[]
  // epub specific fields
  readonly toc: WPLinkDto[]
  readonly landmarks: WPLinkDto[]
  readonly pageList: WPLinkDto[]

  constructor({ mediaType, context = null, metadata, links, images = [], readingOrder = [], resources = [], toc = [], landmarks = [], pageList = [] }: WPPublicationDtoParams) {
    super()
    this.mediaType = mediaType
    this.context = context
    this.metadata = metadata
    this.links = links
    this.images = images
    this.readingOrder = readingOrder
    this.resources = resources
    this.toc = toc
    this.landmarks = landmarks
    this.pageList = pageList
  }
}

// @JsonInclude(JsonInclude.Include.NON_NULL) ; @JsonIgnore mediaType ; @JsonAlias("@context") context
json(WPPublicationDto, { include: 'NON_NULL', ignore: ['mediaType'], alias: { context: ['@context'] } })

type WPMetadataDtoParams = {
  title: string
  identifier?: string | null
  type?: string | null
  conformsTo?: string | null
  sortAs?: string | null
  subtitle?: string | null
  modified?: ZonedDateTime | null
  published?: LocalDate | null
  language?: string | null
  author?: string[]
  translator?: string[]
  editor?: string[]
  artist?: string[]
  illustrator?: string[]
  letterer?: string[]
  penciler?: string[]
  colorist?: string[]
  inker?: string[]
  contributor?: string[]
  publisher?: string[]
  subject?: string[]
  readingProgression?: WPReadingProgressionDto | null
  description?: string | null
  numberOfPages?: number | null
  belongsTo?: WPBelongsToDto | null
  rendition?: Map<string, unknown>
}

export class WPMetadataDto extends DataClass<WPMetadataDtoParams> {
  readonly title: string
  readonly identifier: string | null
  readonly type: string | null
  readonly conformsTo: string | null
  readonly sortAs: string | null
  readonly subtitle: string | null
  readonly modified: ZonedDateTime | null
  readonly published: LocalDate | null
  readonly language: string | null
  readonly author: string[]
  readonly translator: string[]
  readonly editor: string[]
  readonly artist: string[]
  readonly illustrator: string[]
  readonly letterer: string[]
  readonly penciler: string[]
  readonly colorist: string[]
  readonly inker: string[]
  readonly contributor: string[]
  readonly publisher: string[]
  readonly subject: string[]
  readonly readingProgression: WPReadingProgressionDto | null
  readonly description: string | null
  readonly numberOfPages: number | null
  readonly belongsTo: WPBelongsToDto | null
  // epub specific fields
  readonly rendition: Map<string, unknown>

  constructor({
    title,
    identifier = null,
    type = null,
    conformsTo = null,
    sortAs = null,
    subtitle = null,
    modified = null,
    published = null,
    language = null,
    author = [],
    translator = [],
    editor = [],
    artist = [],
    illustrator = [],
    letterer = [],
    penciler = [],
    colorist = [],
    inker = [],
    contributor = [],
    publisher = [],
    subject = [],
    readingProgression = null,
    description = null,
    numberOfPages = null,
    belongsTo = null,
    rendition = new Map(),
  }: WPMetadataDtoParams) {
    super()
    this.title = title
    this.identifier = identifier
    this.type = type
    this.conformsTo = conformsTo
    this.sortAs = sortAs
    this.subtitle = subtitle
    this.modified = modified
    this.published = published
    this.language = language
    this.author = author
    this.translator = translator
    this.editor = editor
    this.artist = artist
    this.illustrator = illustrator
    this.letterer = letterer
    this.penciler = penciler
    this.colorist = colorist
    this.inker = inker
    this.contributor = contributor
    this.publisher = publisher
    this.subject = subject
    this.readingProgression = readingProgression
    this.description = description
    this.numberOfPages = numberOfPages
    this.belongsTo = belongsTo
    this.rendition = rendition
  }
}

// @JsonInclude(JsonInclude.Include.NON_EMPTY) ; @JsonAlias("@type") type
json(WPMetadataDto, { include: 'NON_EMPTY', alias: { type: ['@type'] } })
constraints(WPMetadataDto, { numberOfPages: [Positive()] })

type WPBelongsToDtoParams = {
  series?: WPContributorDto[]
  collection?: WPContributorDto[]
}

export class WPBelongsToDto extends DataClass<WPBelongsToDtoParams> {
  readonly series: WPContributorDto[]
  readonly collection: WPContributorDto[]

  constructor({ series = [], collection = [] }: WPBelongsToDtoParams = {}) {
    super()
    this.series = series
    this.collection = collection
  }
}

// @JsonInclude(JsonInclude.Include.NON_EMPTY)
json(WPBelongsToDto, { include: 'NON_EMPTY' })

type WPContributorDtoParams = {
  name: string
  position?: number | null
  links?: WPLinkDto[]
}

export class WPContributorDto extends DataClass<WPContributorDtoParams> {
  readonly name: string
  readonly position: number | null
  readonly links: WPLinkDto[]

  constructor({ name, position = null, links = [] }: WPContributorDtoParams) {
    super()
    this.name = name
    this.position = position !== null ? kFloat(position) : null
    this.links = links
  }
}

// @JsonInclude(JsonInclude.Include.NON_EMPTY)
json(WPContributorDto, { include: 'NON_EMPTY' })

// PORT: @JsonProperty("...") sur les constantes -> nom JSON passé au constructeur
export class WPReadingProgressionDto extends KEnum {
  // @JsonProperty("rtl")
  static readonly RTL = new WPReadingProgressionDto('RTL', 'rtl')

  // @JsonProperty("ltr")
  static readonly LTR = new WPReadingProgressionDto('LTR', 'ltr')

  // @JsonProperty("ttb")
  static readonly TTB = new WPReadingProgressionDto('TTB', 'ttb')

  // @JsonProperty("btt")
  static readonly BTT = new WPReadingProgressionDto('BTT', 'btt')

  // @JsonProperty("auto")
  static readonly AUTO = new WPReadingProgressionDto('AUTO', 'auto')

  private constructor(
    name: string,
    readonly jsonName: string,
  ) {
    super(name)
  }

  override toJSON(): string {
    return this.jsonName
  }
}

// PORT: type JSON de l'enum (noms @JsonProperty)
const WPReadingProgressionDtoJson: JsonType = {
  scalar: 'WPReadingProgressionDto',
  read: (s: string) =>
    WPReadingProgressionDto.entries().find((it) => it.jsonName === s) ??
    (() => {
      throw new IllegalArgumentException(`not one of the values accepted for Enum class: [${WPReadingProgressionDto.entries().map((it) => it.jsonName).join(', ')}]`)
    })(),
  write: (v: WPReadingProgressionDto) => v.toJSON(),
}
// PORT: schéma OpenAPI de l'enum (valeurs @JsonProperty, comme swagger-core)
openApiSchema(WPReadingProgressionDtoJson, { allowableValues: WPReadingProgressionDto.entries().map((it) => it.jsonName) })

// PORT: types des propriétés (réflexion Kotlin utilisée par Jackson)
jsonProperties(
  WPLinkDto,
  {
    title: { nullable: 'String' },
    rel: { nullable: 'String' },
    href: { nullable: 'String' },
    type: { nullable: 'String' },
    templated: { nullable: 'Boolean' },
    width: { nullable: 'Int' },
    height: { nullable: 'Int' },
    alternate: { list: { class: WPLinkDto } },
    children: { list: { class: WPLinkDto } },
    properties: { map: { map: 'Any' } },
  },
)
jsonProperties(
  WPPublicationDto,
  {
    mediaType: 'String',
    context: { nullable: 'String' },
    metadata: { class: WPMetadataDto },
    links: { list: { class: WPLinkDto } },
    images: { list: { class: WPLinkDto } },
    readingOrder: { list: { class: WPLinkDto } },
    resources: { list: { class: WPLinkDto } },
    toc: { list: { class: WPLinkDto } },
    landmarks: { list: { class: WPLinkDto } },
    pageList: { list: { class: WPLinkDto } },
  },
  [],
  { required: ['metadata', 'links'] },
)
jsonProperties(
  WPMetadataDto,
  {
    title: 'String',
    identifier: { nullable: 'String' },
    type: { nullable: 'String' },
    conformsTo: { nullable: 'String' },
    sortAs: { nullable: 'String' },
    subtitle: { nullable: 'String' },
    modified: { nullable: JsonTypes.ZonedDateTime },
    published: { nullable: JsonTypes.LocalDate },
    language: { nullable: 'String' },
    author: { list: 'String' },
    translator: { list: 'String' },
    editor: { list: 'String' },
    artist: { list: 'String' },
    illustrator: { list: 'String' },
    letterer: { list: 'String' },
    penciler: { list: 'String' },
    colorist: { list: 'String' },
    inker: { list: 'String' },
    contributor: { list: 'String' },
    publisher: { list: 'String' },
    subject: { list: 'String' },
    readingProgression: { nullable: WPReadingProgressionDtoJson },
    description: { nullable: 'String' },
    numberOfPages: { nullable: 'Int' },
    belongsTo: { nullable: { class: WPBelongsToDto } },
    rendition: { map: 'Any' },
  },
  [],
  { required: ['title'] },
)
jsonProperties(WPBelongsToDto, { series: { list: { class: WPContributorDto } }, collection: { list: { class: WPContributorDto } } })
jsonProperties(WPContributorDto, { name: 'String', position: { nullable: 'Float' }, links: { list: { class: WPLinkDto } } }, [], { required: ['name'] })
