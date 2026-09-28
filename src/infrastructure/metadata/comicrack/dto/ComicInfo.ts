// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/dto/ComicInfo.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { AgeRating } from './AgeRating.js'
import { Manga } from './Manga.js'
import { YesNo } from './YesNo.js'

// @JsonIgnoreProperties(ignoreUnknown = true)
export class ComicInfo {
  // @JsonProperty(value = "Title")
  title: string | null = null

  // @JsonProperty(value = "Series")
  series: string | null = null

  // @JsonProperty(value = "Number")
  number: string | null = null

  // @JsonProperty(value = "Count")
  count: number | null = null

  // @JsonProperty(value = "Volume")
  volume: number | null = null

  // @JsonProperty(value = "AlternateSeries")
  alternateSeries: string | null = null

  // @JsonProperty(value = "AlternateNumber")
  alternateNumber: string | null = null

  // @JsonProperty(value = "AlternateCount")
  alternateCount: number | null = null

  // @JsonProperty(value = "Summary")
  summary: string | null = null

  // @JsonProperty(value = "Notes")
  notes: string | null = null

  // @JsonProperty(value = "Year")
  year: number | null = null

  // @JsonProperty(value = "Month")
  month: number | null = null

  // @JsonProperty(value = "Day")
  day: number | null = null

  // @JsonProperty(value = "Writer")
  writer: string | null = null

  // @JsonProperty(value = "Penciller")
  penciller: string | null = null

  // @JsonProperty(value = "Inker")
  inker: string | null = null

  // @JsonProperty(value = "Colorist")
  colorist: string | null = null

  // @JsonProperty(value = "Letterer")
  letterer: string | null = null

  // @JsonProperty(value = "CoverArtist")
  coverArtist: string | null = null

  // @JsonProperty(value = "Editor")
  editor: string | null = null

  // @JsonProperty(value = "Translator")
  translator: string | null = null

  // @JsonProperty(value = "Publisher")
  publisher: string | null = null

  // @JsonProperty(value = "Imprint")
  imprint: string | null = null

  // @JsonProperty(value = "Genre")
  genre: string | null = null

  // @JsonProperty(value = "Tags")
  tags: string | null = null

  // @JsonProperty(value = "Web")
  web: string | null = null

  // @JsonProperty(value = "PageCount")
  pageCount: number | null = null

  // @JsonProperty(value = "LanguageISO")
  languageISO: string | null = null

  // @JsonProperty(value = "Format")
  format: string | null = null

  // @JsonProperty(value = "BlackAndWhite", defaultValue = "Unknown")
  // @XmlSchemaType(name = "string")
  blackAndWhite: YesNo | null = null

  // @JsonProperty(value = "Manga", defaultValue = "Unknown")
  // @XmlSchemaType(name = "string")
  manga: Manga | null = null

  // @JsonProperty(value = "Characters")
  characters: string | null = null

  // @JsonProperty(value = "Teams")
  teams: string | null = null

  // @JsonProperty(value = "Locations")
  locations: string | null = null

  // @JsonProperty(value = "ScanInformation")
  scanInformation: string | null = null

  // @JsonProperty(value = "StoryArc")
  storyArc: string | null = null

  // @JsonProperty(value = "StoryArcNumber")
  storyArcNumber: string | null = null

  // @JsonProperty(value = "SeriesGroup")
  seriesGroup: string | null = null

  // @JsonProperty(value = "AgeRating", defaultValue = "Unknown")
  ageRating: AgeRating | null = null

  // @JsonProperty(value = "GTIN")
  gtin: string | null = null
}

jsonProperties(ComicInfo, {
  title: { nullable: 'String' },
  series: { nullable: 'String' },
  number: { nullable: 'String' },
  count: { nullable: 'Int' },
  volume: { nullable: 'Int' },
  alternateSeries: { nullable: 'String' },
  alternateNumber: { nullable: 'String' },
  alternateCount: { nullable: 'Int' },
  summary: { nullable: 'String' },
  notes: { nullable: 'String' },
  year: { nullable: 'Int' },
  month: { nullable: 'Int' },
  day: { nullable: 'Int' },
  writer: { nullable: 'String' },
  penciller: { nullable: 'String' },
  inker: { nullable: 'String' },
  colorist: { nullable: 'String' },
  letterer: { nullable: 'String' },
  coverArtist: { nullable: 'String' },
  editor: { nullable: 'String' },
  translator: { nullable: 'String' },
  publisher: { nullable: 'String' },
  imprint: { nullable: 'String' },
  genre: { nullable: 'String' },
  tags: { nullable: 'String' },
  web: { nullable: 'String' },
  pageCount: { nullable: 'Int' },
  languageISO: { nullable: 'String' },
  format: { nullable: 'String' },
  blackAndWhite: { nullable: { enum: YesNo } },
  manga: { nullable: { enum: Manga } },
  characters: { nullable: 'String' },
  teams: { nullable: 'String' },
  locations: { nullable: 'String' },
  scanInformation: { nullable: 'String' },
  storyArc: { nullable: 'String' },
  storyArcNumber: { nullable: 'String' },
  seriesGroup: { nullable: 'String' },
  ageRating: { nullable: { enum: AgeRating } },
  gtin: { nullable: 'String' },
})
json(ComicInfo, {
  ignoreUnknown: true,
  rename: {
    title: 'Title',
    series: 'Series',
    number: 'Number',
    count: 'Count',
    volume: 'Volume',
    alternateSeries: 'AlternateSeries',
    alternateNumber: 'AlternateNumber',
    alternateCount: 'AlternateCount',
    summary: 'Summary',
    notes: 'Notes',
    year: 'Year',
    month: 'Month',
    day: 'Day',
    writer: 'Writer',
    penciller: 'Penciller',
    inker: 'Inker',
    colorist: 'Colorist',
    letterer: 'Letterer',
    coverArtist: 'CoverArtist',
    editor: 'Editor',
    translator: 'Translator',
    publisher: 'Publisher',
    imprint: 'Imprint',
    genre: 'Genre',
    tags: 'Tags',
    web: 'Web',
    pageCount: 'PageCount',
    languageISO: 'LanguageISO',
    format: 'Format',
    blackAndWhite: 'BlackAndWhite',
    manga: 'Manga',
    characters: 'Characters',
    teams: 'Teams',
    locations: 'Locations',
    scanInformation: 'ScanInformation',
    storyArc: 'StoryArc',
    storyArcNumber: 'StoryArcNumber',
    seriesGroup: 'SeriesGroup',
    ageRating: 'AgeRating',
    gtin: 'GTIN',
  },
})
