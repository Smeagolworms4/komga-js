// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BookMetadata.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type LocalDate, LocalDateTime } from '@js-joda/core'
import { lowerNotBlank } from '../../language/LanguageUtils.js'
import { trim } from '../../port/extra-metadata.js'
import { distinctSet, str } from '../../port/kotlin.js'
import type { Auditable } from './Auditable.js'
import type { Author } from './Author.js'
import type { WebLink } from './WebLink.js'

type BookMetadataParams = {
  title: string
  summary?: string
  number: string
  numberSort: number // PORT: Float
  releaseDate?: LocalDate | null
  authors?: Author[]
  tags?: ReadonlySet<string>
  isbn?: string
  links?: WebLink[]
  titleLock?: boolean
  summaryLock?: boolean
  numberLock?: boolean
  numberSortLock?: boolean
  releaseDateLock?: boolean
  authorsLock?: boolean
  tagsLock?: boolean
  isbnLock?: boolean
  linksLock?: boolean
  bookId?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class BookMetadata implements Auditable {
  readonly numberSort: number // PORT: Float
  readonly releaseDate: LocalDate | null
  readonly authors: Author[]
  readonly isbn: string
  readonly links: WebLink[]
  readonly titleLock: boolean
  readonly summaryLock: boolean
  readonly numberLock: boolean
  readonly numberSortLock: boolean
  readonly releaseDateLock: boolean
  readonly authorsLock: boolean
  readonly tagsLock: boolean
  readonly isbnLock: boolean
  readonly linksLock: boolean
  readonly bookId: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  readonly title: string
  readonly summary: string
  readonly number: string
  readonly tags: Set<string>

  constructor({
    title,
    summary = '',
    number,
    numberSort,
    releaseDate = null,
    authors = [],
    tags = new Set(),
    isbn = '',
    links = [],
    titleLock = false,
    summaryLock = false,
    numberLock = false,
    numberSortLock = false,
    releaseDateLock = false,
    authorsLock = false,
    tagsLock = false,
    isbnLock = false,
    linksLock = false,
    bookId = '',
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: BookMetadataParams) {
    this.numberSort = numberSort
    this.releaseDate = releaseDate
    this.authors = authors
    this.isbn = isbn
    this.links = links
    this.titleLock = titleLock
    this.summaryLock = summaryLock
    this.numberLock = numberLock
    this.numberSortLock = numberSortLock
    this.releaseDateLock = releaseDateLock
    this.authorsLock = authorsLock
    this.tagsLock = tagsLock
    this.isbnLock = isbnLock
    this.linksLock = linksLock
    this.bookId = bookId
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate

    this.title = trim(title)
    this.summary = trim(summary)
    this.number = trim(number)
    this.tags = distinctSet(lowerNotBlank(tags))
  }

  copy({
    title = this.title,
    summary = this.summary,
    number = this.number,
    numberSort = this.numberSort,
    releaseDate = this.releaseDate,
    authors = [...this.authors],
    tags = this.tags,
    isbn = this.isbn,
    links = this.links,
    titleLock = this.titleLock,
    summaryLock = this.summaryLock,
    numberLock = this.numberLock,
    numberSortLock = this.numberSortLock,
    releaseDateLock = this.releaseDateLock,
    authorsLock = this.authorsLock,
    tagsLock = this.tagsLock,
    isbnLock = this.isbnLock,
    linksLock = this.linksLock,
    bookId = this.bookId,
    createdDate = this.createdDate,
    lastModifiedDate = this.lastModifiedDate,
  }: Partial<BookMetadataParams> = {}): BookMetadata {
    return new BookMetadata({
      title: title,
      summary: summary,
      number: number,
      numberSort: numberSort,
      releaseDate: releaseDate,
      authors: authors,
      tags: tags,
      isbn: isbn,
      links: links,
      titleLock: titleLock,
      summaryLock: summaryLock,
      numberLock: numberLock,
      numberSortLock: numberSortLock,
      releaseDateLock: releaseDateLock,
      authorsLock: authorsLock,
      tagsLock: tagsLock,
      isbnLock: isbnLock,
      linksLock: linksLock,
      bookId: bookId,
      createdDate: createdDate,
      lastModifiedDate: lastModifiedDate,
    })
  }

  // PORT: Float.toString() Kotlin affiche "1.0" là où JS affiche "1" (numberSort)
  toString(): string {
    return `BookMetadata(numberSort=${this.numberSort}, releaseDate=${str(this.releaseDate)}, authors=${str(this.authors)}, isbn='${this.isbn}', links=${str(this.links)}, titleLock=${this.titleLock}, summaryLock=${this.summaryLock}, numberLock=${this.numberLock}, numberSortLock=${this.numberSortLock}, releaseDateLock=${this.releaseDateLock}, authorsLock=${this.authorsLock}, tagsLock=${this.tagsLock}, isbnLock=${this.isbnLock}, linksLock=${this.linksLock}, bookId='${this.bookId}', createdDate=${this.createdDate}, lastModifiedDate=${this.lastModifiedDate}, title='${this.title}', summary='${this.summary}', number='${this.number}', tags=${str(this.tags)})`
  }
}
