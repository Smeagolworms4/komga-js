// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/mylar/dto/MylarMetadata.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { AgeRating } from './AgeRating.js'
import { Status } from './Status.js'

type MylarMetadataParams = {
  type: string
  publisher: string
  imprint: string | null
  name: string
  comicid: string
  year: number
  descriptionText: string | null
  descriptionFormatted: string | null
  volume: number | null
  bookType: string
  ageRating: AgeRating | null
  comicImage: string
  totalIssues: number
  publicationRun: string
  status: Status
}

// @JsonIgnoreProperties(ignoreUnknown = true)
export class MylarMetadata extends DataClass<MylarMetadataParams> {
  readonly type: string
  readonly publisher: string
  readonly imprint: string | null
  readonly name: string
  // @field:JsonAlias("cid")
  readonly comicid: string
  readonly year: number
  // @field:JsonProperty("description_text")
  readonly descriptionText: string | null
  // @field:JsonProperty("description_formatted")
  readonly descriptionFormatted: string | null
  readonly volume: number | null
  // @field:JsonProperty("booktype")
  readonly bookType: string
  // @field:JsonProperty("age_rating")
  readonly ageRating: AgeRating | null
  // @field:JsonProperty("comic_image")
  // @field:JsonAlias("ComicImage")
  readonly comicImage: string
  // @field:JsonProperty("total_issues")
  readonly totalIssues: number
  // @field:JsonProperty("publication_run")
  readonly publicationRun: string
  readonly status: Status

  constructor({
    type,
    publisher,
    imprint,
    name,
    comicid,
    year,
    descriptionText,
    descriptionFormatted,
    volume,
    bookType,
    ageRating,
    comicImage,
    totalIssues,
    publicationRun,
    status,
  }: MylarMetadataParams) {
    super()
    this.type = type
    this.publisher = publisher
    this.imprint = imprint
    this.name = name
    this.comicid = comicid
    this.year = year
    this.descriptionText = descriptionText
    this.descriptionFormatted = descriptionFormatted
    this.volume = volume
    this.bookType = bookType
    this.ageRating = ageRating
    this.comicImage = comicImage
    this.totalIssues = totalIssues
    this.publicationRun = publicationRun
    this.status = status
  }
}

jsonProperties(
  MylarMetadata,
  {
    type: 'String',
    publisher: 'String',
    imprint: { nullable: 'String' },
    name: 'String',
    comicid: 'String',
    year: 'Int',
    descriptionText: { nullable: 'String' },
    descriptionFormatted: { nullable: 'String' },
    volume: { nullable: 'Int' },
    bookType: 'String',
    ageRating: { nullable: { enum: AgeRating } },
    comicImage: 'String',
    totalIssues: 'Int',
    publicationRun: 'String',
    status: { enum: Status },
  },
  [],
  { required: ['type', 'publisher', 'name', 'comicid', 'year', 'bookType', 'comicImage', 'totalIssues', 'publicationRun', 'status'] },
)
json(MylarMetadata, {
  ignoreUnknown: true,
  rename: {
    descriptionText: 'description_text',
    descriptionFormatted: 'description_formatted',
    bookType: 'booktype',
    ageRating: 'age_rating',
    comicImage: 'comic_image',
    totalIssues: 'total_issues',
    publicationRun: 'publication_run',
  },
  alias: { comicid: ['cid'], comicImage: ['ComicImage'] },
})
