// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/JsonFeedDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DateTimeFormatter, OffsetDateTime, ZoneOffset } from '@js-joda/core'
import { json } from '../../../../port/jackson.js'
import { type JsonType, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { openApiSchema } from '../../../../port/swagger-annotations.js'

type JsonFeedDtoParams = {
  version: string
  title: string
  homePageUrl: string | null
  description: string | null
  items?: JsonFeedDto.ItemDto[]
}

// @JsonIgnoreProperties(ignoreUnknown = true)
// @Schema(
//   //language=JSON
//   example =
//     """
//   {
//   "version": "https://jsonfeed.org/version/1",
//   "title": "Announcements",
//   "home_page_url": "https://komga.org/blog",
//   "description": "Latest Komga announcements",
//   "items": [
//     {
//       "id": "https://komga.org/blog/ebook-drop2",
//       "url": "https://komga.org/blog/ebook-drop2",
//       "title": "eBook drop 2",
//       "summary": "Version 1.9.0 contains the second feature drop for Ebooks support.",
//       "content_html": "<p>A longer text…</p>",
//       "date_modified": "2023-12-15T00:00:00Z",
//       "author": {
//         "name": "gotson",
//         "url": "https://github.com/gotson"
//       },
//       "tags": [
//         "upgrade",
//         "komga"
//       ],
//       "_komga": {
//         "read": false
//       }
//     },
//     {
//       "id": "https://komga.org/blog/ebook-support",
//       "url": "https://komga.org/blog/ebook-support",
//       "title": "eBook support",
//       "summary": "Version 1.8.0 is bringing a long awaited feature: proper eBook support!",
//       "content_html": "<p>A longer text…</p>",
//       "date_modified": "2023-11-29T00:00:00Z",
//       "author": {
//         "name": "gotson",
//         "url": "https://github.com/gotson"
//       },
//       "tags": [
//         "upgrade",
//         "komga"
//       ],
//       "_komga": {
//         "read": true
//       }
//     }
//   ]
// }
// """,
// )
export class JsonFeedDto extends DataClass<JsonFeedDtoParams> {
  // @Schema(description = "URL of the version of the format the feed uses", example = "https://jsonfeed.org/version/1")
  readonly version: string
  // @Schema(description = "Name of the feed", example = "Announcements")
  readonly title: string
  // @field:JsonProperty("home_page_url")
  // @Schema(description = "URL of the resource that the feed describes", example = "https://komga.org/blog")
  readonly homePageUrl: string | null
  // @Schema(description = "Provides more detail on what the feed is about", example = "Latest Komga announcements")
  readonly description: string | null
  readonly items: JsonFeedDto.ItemDto[]

  constructor({ version, title, homePageUrl, description, items = [] }: JsonFeedDtoParams) {
    super()
    this.version = version
    this.title = title
    this.homePageUrl = homePageUrl
    this.description = description
    this.items = items
  }
}

type ItemDtoParams = {
  id: string
  url: string | null
  title: string | null
  summary: string | null
  contentHtml: string | null
  dateModified: OffsetDateTime | null
  author: JsonFeedDto.ItemAuthorDto | null
  tags?: ReadonlySet<string>
  komgaExtension: JsonFeedDto.KomgaExtensionDto | null
}

type ItemAuthorDtoParams = {
  name: string | null
  url: string | null
}

type KomgaExtensionDtoParams = {
  read: boolean
}

export namespace JsonFeedDto {
  export class ItemDto extends DataClass<ItemDtoParams> {
    // @Schema(description = "Unique for that item for that feed over time", example = "https://komga.org/blog/ebook-drop2")
    readonly id: string
    // @Schema(description = "URL of the resource described by the item", example = "https://komga.org/blog/ebook-drop2")
    readonly url: string | null
    // @Schema(description = "Plain text title", example = "eBook drop 2")
    readonly title: string | null
    // @Schema(description = "A plain text sentence or two describing the item", example = "Version 1.9.0 contains the second feature drop for Ebooks support.")
    readonly summary: string | null
    // @field:JsonProperty("content_html")
    // @Schema(description = "HTML of the item", example = "<p>A longer text…</p>")
    readonly contentHtml: string | null
    // @field:JsonProperty("date_modified")
    // @Schema(description = "Modification date in RFC 3339 format", example = "2023-12-15T00:00:00Z")
    readonly dateModified: OffsetDateTime | null
    // @Schema(description = "Author of the item")
    readonly author: ItemAuthorDto | null
    // @Schema(description = "Tags describing the item", examples = ["upgrade", "komga"])
    readonly tags: ReadonlySet<string>
    // @field:JsonProperty("_komga")
    // @Schema(description = "Additional fields for the item")
    readonly komgaExtension: KomgaExtensionDto | null

    constructor({ id, url, title, summary, contentHtml, dateModified, author, tags = new Set(), komgaExtension }: ItemDtoParams) {
      super()
      this.id = id
      this.url = url
      this.title = title
      this.summary = summary
      this.contentHtml = contentHtml
      this.dateModified = dateModified
      this.author = author
      this.tags = tags
      this.komgaExtension = komgaExtension
    }
  }

  export class ItemAuthorDto extends DataClass<ItemAuthorDtoParams> {
    // @Schema(description = "Author's name", example = "gotson")
    readonly name: string | null
    // @Schema(description = "URL of a site owned by the author", example = "https://github.com/gotson")
    readonly url: string | null

    constructor({ name, url }: ItemAuthorDtoParams) {
      super()
      this.name = name
      this.url = url
    }
  }

  export class KomgaExtensionDto extends DataClass<KomgaExtensionDtoParams> {
    // @Schema(description = "Whether the current item has been marked read by the current user", example = "false")
    readonly read: boolean

    constructor({ read }: KomgaExtensionDtoParams) {
      super()
      this.read = read
    }
  }
}

// PORT: OffsetDateTime avec la configuration Jackson de Spring Boot : ISO_OFFSET_DATE_TIME ;
// à la lecture, ADJUST_DATES_TO_CONTEXT_TIME_ZONE (UTC)
const offsetDateTime: JsonType = {
  scalar: 'OffsetDateTime',
  read: (s: string) => OffsetDateTime.parse(s).withOffsetSameInstant(ZoneOffset.UTC),
  write: (v: OffsetDateTime) => v.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
}

json(JsonFeedDto, { rename: { homePageUrl: 'home_page_url' } })
jsonProperties(
  JsonFeedDto,
  {
    version: 'String',
    title: 'String',
    homePageUrl: { nullable: 'String' },
    description: { nullable: 'String' },
    items: { list: { class: JsonFeedDto.ItemDto } },
  },
  [],
  { required: ['version', 'title'] },
)
json(JsonFeedDto.ItemDto, { rename: { contentHtml: 'content_html', dateModified: 'date_modified', komgaExtension: '_komga' } })
jsonProperties(
  JsonFeedDto.ItemDto,
  {
    id: 'String',
    url: { nullable: 'String' },
    title: { nullable: 'String' },
    summary: { nullable: 'String' },
    contentHtml: { nullable: 'String' },
    dateModified: { nullable: offsetDateTime },
    author: { nullable: { class: JsonFeedDto.ItemAuthorDto } },
    tags: { set: 'String' },
    komgaExtension: { nullable: { class: JsonFeedDto.KomgaExtensionDto } },
  },
  [],
  { required: ['id'] },
)
jsonProperties(JsonFeedDto.ItemAuthorDto, { name: { nullable: 'String' }, url: { nullable: 'String' } })
jsonProperties(JsonFeedDto.KomgaExtensionDto, { read: 'Boolean' }, [], { required: ['read'] })

// @Schema (document OpenAPI : port/swagger-annotations.ts) ; l'exemple JSON de la classe est lu par swagger-core (Json.mapper().readTree)
openApiSchema(JsonFeedDto, {
  example: JSON.parse(`
  {
  "version": "https://jsonfeed.org/version/1",
  "title": "Announcements",
  "home_page_url": "https://komga.org/blog",
  "description": "Latest Komga announcements",
  "items": [
    {
      "id": "https://komga.org/blog/ebook-drop2",
      "url": "https://komga.org/blog/ebook-drop2",
      "title": "eBook drop 2",
      "summary": "Version 1.9.0 contains the second feature drop for Ebooks support.",
      "content_html": "<p>A longer text…</p>",
      "date_modified": "2023-12-15T00:00:00Z",
      "author": {
        "name": "gotson",
        "url": "https://github.com/gotson"
      },
      "tags": [
        "upgrade",
        "komga"
      ],
      "_komga": {
        "read": false
      }
    },
    {
      "id": "https://komga.org/blog/ebook-support",
      "url": "https://komga.org/blog/ebook-support",
      "title": "eBook support",
      "summary": "Version 1.8.0 is bringing a long awaited feature: proper eBook support!",
      "content_html": "<p>A longer text…</p>",
      "date_modified": "2023-11-29T00:00:00Z",
      "author": {
        "name": "gotson",
        "url": "https://github.com/gotson"
      },
      "tags": [
        "upgrade",
        "komga"
      ],
      "_komga": {
        "read": true
      }
    }
  ]
}
`),
  properties: {
    version: { description: 'URL of the version of the format the feed uses', example: 'https://jsonfeed.org/version/1' },
    title: { description: 'Name of the feed', example: 'Announcements' },
    homePageUrl: { description: 'URL of the resource that the feed describes', example: 'https://komga.org/blog' },
    description: { description: 'Provides more detail on what the feed is about', example: 'Latest Komga announcements' },
  },
})
openApiSchema(JsonFeedDto.ItemDto, {
  properties: {
    id: { description: 'Unique for that item for that feed over time', example: 'https://komga.org/blog/ebook-drop2' },
    url: { description: 'URL of the resource described by the item', example: 'https://komga.org/blog/ebook-drop2' },
    title: { description: 'Plain text title', example: 'eBook drop 2' },
    summary: { description: 'A plain text sentence or two describing the item', example: 'Version 1.9.0 contains the second feature drop for Ebooks support.' },
    contentHtml: { description: 'HTML of the item', example: '<p>A longer text…</p>' },
    dateModified: { description: 'Modification date in RFC 3339 format', example: '2023-12-15T00:00:00Z' },
    author: { description: 'Author of the item' },
    tags: { description: 'Tags describing the item', examples: ['upgrade', 'komga'] },
    komgaExtension: { description: 'Additional fields for the item' },
  },
})
openApiSchema(JsonFeedDto.ItemAuthorDto, {
  properties: {
    name: { description: "Author's name", example: 'gotson' },
    url: { description: 'URL of a site owned by the author', example: 'https://github.com/gotson' },
  },
})
openApiSchema(JsonFeedDto.KomgaExtensionDto, {
  properties: {
    // PORT: example = "false" converti par swagger-core selon le type de la propriété (boolean)
    read: { description: 'Whether the current item has been marked read by the current user', example: false },
  },
})
