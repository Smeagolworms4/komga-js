// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BookMetadataPatch.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDate } from '@js-joda/core'
import { DataClass, KEnum, kFloat } from '../../port/kotlin.js'
import type { Author } from './Author.js'
import type { WebLink } from './WebLink.js'

type BookMetadataPatchParams = {
  title?: string | null
  summary?: string | null
  number?: string | null
  numberSort?: number | null // PORT: Float
  releaseDate?: LocalDate | null
  authors?: Author[] | null
  isbn?: string | null
  links?: WebLink[] | null
  tags?: ReadonlySet<string> | null
  readLists?: BookMetadataPatch.ReadListEntry[]
}

export class BookMetadataPatch extends DataClass<BookMetadataPatchParams> {
  readonly title: string | null
  readonly summary: string | null
  readonly number: string | null
  readonly numberSort: number | null // PORT: Float
  readonly releaseDate: LocalDate | null
  readonly authors: Author[] | null
  readonly isbn: string | null
  readonly links: WebLink[] | null
  readonly tags: ReadonlySet<string> | null
  readonly readLists: BookMetadataPatch.ReadListEntry[]

  constructor({
    title = null,
    summary = null,
    number = null,
    numberSort = null,
    releaseDate = null,
    authors = null,
    isbn = null,
    links = null,
    tags = null,
    readLists = [],
  }: BookMetadataPatchParams = {}) {
    super()
    this.title = title
    this.summary = summary
    this.number = number
    this.numberSort = kFloat(numberSort)
    this.releaseDate = releaseDate
    this.authors = authors
    this.isbn = isbn
    this.links = links
    this.tags = tags
    this.readLists = readLists
  }
}

type ReadListEntryParams = {
  name: string
  number?: number | null
}

export namespace BookMetadataPatch {
  export class ReadListEntry extends DataClass<ReadListEntryParams> {
    readonly name: string
    readonly number: number | null

    constructor({ name, number = null }: ReadListEntryParams) {
      super()
      this.name = name
      this.number = number
    }
  }
}

export class BookMetadataPatchCapability extends KEnum {
  static readonly TITLE = new BookMetadataPatchCapability('TITLE')
  static readonly SUMMARY = new BookMetadataPatchCapability('SUMMARY')
  static readonly NUMBER = new BookMetadataPatchCapability('NUMBER')
  static readonly NUMBER_SORT = new BookMetadataPatchCapability('NUMBER_SORT')
  static readonly RELEASE_DATE = new BookMetadataPatchCapability('RELEASE_DATE')
  static readonly AUTHORS = new BookMetadataPatchCapability('AUTHORS')
  static readonly TAGS = new BookMetadataPatchCapability('TAGS')
  static readonly ISBN = new BookMetadataPatchCapability('ISBN')
  static readonly READ_LISTS = new BookMetadataPatchCapability('READ_LISTS')
  static readonly THUMBNAILS = new BookMetadataPatchCapability('THUMBNAILS')
  static readonly LINKS = new BookMetadataPatchCapability('LINKS')
}
