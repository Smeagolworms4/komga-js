// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/BookMetadataUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { registerClass } from '../../../../port/jackson.js'
import type { LocalDate } from '@js-joda/core'
import { Author } from '../../../../domain/model/Author.js'
import type { BookMetadata } from '../../../../domain/model/BookMetadata.js'
import { WebLink } from '../../../../domain/model/WebLink.js'
import { NullOrBlankOrISBN } from '../../../../infrastructure/validation/NullOrBlankOrISBN.js'
import { NullOrNotBlank } from '../../../../infrastructure/validation/NullOrNotBlank.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { URI } from '../../../../port/java-net.js'
import { nn } from '../../../../port/kotlin.js'
import { NotBlank, URL, Valid, constraints } from '../../../../port/validation.js'

type BookMetadataUpdateDtoParams = {
  title?: string | null
  titleLock?: boolean | null
  summary?: string | null
  summaryLock?: boolean | null
  number?: string | null
  numberLock?: boolean | null
  numberSort?: number | null
  numberSortLock?: boolean | null
  releaseDate?: LocalDate | null
  releaseDateLock?: boolean | null
  authors?: AuthorUpdateDto[] | null
  authorsLock?: boolean | null
  tags?: ReadonlySet<string> | null
  tagsLock?: boolean | null
  isbn?: string | null
  isbnLock?: boolean | null
  links?: WebLinkUpdateDto[] | null
  linksLock?: boolean | null
}

// PORT: classe Kotlin sans constructeur principal, dont Jackson appelle les setters des propriétés présentes dans le JSON ;
// le constructeur reçoit ici les propriétés lues et les affecte (les setters observables marquent isSet)
export class BookMetadataUpdateDto {
  private readonly _isSet = new Map<string, boolean>()

  isSet(prop: string): boolean {
    return this._isSet.get(prop) ?? false
  }

  title: string | null = null

  titleLock: boolean | null = null

  private _summary: string | null = null
  get summary(): string | null {
    return this._summary
  }
  set summary(value: string | null) {
    this._summary = value
    this._isSet.set('summary', true)
  }

  summaryLock: boolean | null = null

  number: string | null = null

  numberLock: boolean | null = null

  private _numberSort: number | null = null // PORT: Float
  get numberSort(): number | null {
    return this._numberSort
  }
  set numberSort(value: number | null) {
    this._numberSort = value === null ? null : Math.fround(value)
  }

  numberSortLock: boolean | null = null

  private _releaseDate: LocalDate | null = null
  get releaseDate(): LocalDate | null {
    return this._releaseDate
  }
  set releaseDate(value: LocalDate | null) {
    this._releaseDate = value
    this._isSet.set('releaseDate', true)
  }

  releaseDateLock: boolean | null = null

  private _authors: AuthorUpdateDto[] | null = null
  get authors(): AuthorUpdateDto[] | null {
    return this._authors
  }
  set authors(value: AuthorUpdateDto[] | null) {
    this._authors = value
    this._isSet.set('authors', true)
  }

  authorsLock: boolean | null = null

  private _tags: ReadonlySet<string> | null = null
  get tags(): ReadonlySet<string> | null {
    return this._tags
  }
  set tags(value: ReadonlySet<string> | null) {
    this._tags = value
    this._isSet.set('tags', true)
  }

  tagsLock: boolean | null = null

  private _isbn: string | null = null
  get isbn(): string | null {
    return this._isbn
  }
  set isbn(value: string | null) {
    this._isbn = value
    this._isSet.set('isbn', true)
  }

  isbnLock: boolean | null = null

  private _links: WebLinkUpdateDto[] | null = null
  get links(): WebLinkUpdateDto[] | null {
    return this._links
  }
  set links(value: WebLinkUpdateDto[] | null) {
    this._links = value
    this._isSet.set('links', true)
  }

  linksLock: boolean | null = null

  constructor(props: BookMetadataUpdateDtoParams = {}) {
    Object.assign(this, props)
  }
}

type AuthorUpdateDtoParams = {
  name?: string | null
  role?: string | null
}

// PORT: classe Kotlin sans constructeur principal (voir BookMetadataUpdateDto)
export class AuthorUpdateDto {
  readonly name: string | null

  readonly role: string | null

  constructor({ name = null, role = null }: AuthorUpdateDtoParams = {}) {
    this.name = name
    this.role = role
  }
}

type WebLinkUpdateDtoParams = {
  label?: string | null
  url?: string | null
}

// PORT: classe Kotlin sans constructeur principal (voir BookMetadataUpdateDto)
export class WebLinkUpdateDto {
  readonly label: string | null

  readonly url: string | null

  constructor({ label = null, url = null }: WebLinkUpdateDtoParams = {}) {
    this.label = label
    this.url = url
  }
}

// PORT: fonction d'extension BookMetadata.patch(patch)
export function patch(self: BookMetadata, patch: BookMetadataUpdateDto): BookMetadata {
  return self.copy({
    title: patch.title ?? self.title,
    titleLock: patch.titleLock ?? self.titleLock,
    summary: patch.isSet('summary') ? (patch.summary ?? '') : self.summary,
    summaryLock: patch.summaryLock ?? self.summaryLock,
    number: patch.number ?? self.number,
    numberLock: patch.numberLock ?? self.numberLock,
    numberSort: patch.numberSort ?? self.numberSort,
    numberSortLock: patch.numberSortLock ?? self.numberSortLock,
    releaseDate: patch.isSet('releaseDate') ? patch.releaseDate : self.releaseDate,
    releaseDateLock: patch.releaseDateLock ?? self.releaseDateLock,
    authors: patch.isSet('authors')
      ? patch.authors !== null
        ? nn(patch.authors).map((it) => new Author({ name: it.name ?? '', role: it.role ?? '' }))
        : []
      : self.authors,
    authorsLock: patch.authorsLock ?? self.authorsLock,
    tags: patch.isSet('tags') ? (patch.tags !== null ? nn(patch.tags) : new Set<string>()) : self.tags,
    tagsLock: patch.tagsLock ?? self.tagsLock,
    // PORT: Char.isDigit() (catégorie Unicode Nd, par unité UTF-16)
    isbn: patch.isSet('isbn') ? ((patch.isbn !== null ? patch.isbn.split('').filter((it) => /^\p{Nd}$/u.test(it)).join('') : null) ?? '') : self.isbn,
    isbnLock: patch.isbnLock ?? self.isbnLock,
    links: patch.isSet('links')
      ? patch.links !== null
        ? nn(patch.links).map((it) => new WebLink({ label: nn(it.label), url: new URI(nn(it.url)) }))
        : []
      : self.links,
    linksLock: patch.linksLock ?? self.linksLock,
  })
}

constraints(BookMetadataUpdateDto, {
  title: [NullOrNotBlank()],
  number: [NullOrNotBlank()],
  authors: [Valid()],
  isbn: [NullOrBlankOrISBN()],
  links: [Valid()],
})
constraints(AuthorUpdateDto, {
  name: [NotBlank()],
  role: [NotBlank()],
})
constraints(WebLinkUpdateDto, {
  label: [NotBlank()],
  url: [URL()],
})
jsonProperties(BookMetadataUpdateDto, {
  title: { nullable: 'String' },
  titleLock: { nullable: 'Boolean' },
  summary: { nullable: 'String' },
  summaryLock: { nullable: 'Boolean' },
  number: { nullable: 'String' },
  numberLock: { nullable: 'Boolean' },
  numberSort: { nullable: 'Float' },
  numberSortLock: { nullable: 'Boolean' },
  releaseDate: { nullable: JsonTypes.LocalDate },
  releaseDateLock: { nullable: 'Boolean' },
  authors: { nullable: { list: { class: AuthorUpdateDto } } },
  authorsLock: { nullable: 'Boolean' },
  tags: { nullable: { set: 'String' } },
  tagsLock: { nullable: 'Boolean' },
  isbn: { nullable: 'String' },
  isbnLock: { nullable: 'Boolean' },
  links: { nullable: { list: { class: WebLinkUpdateDto } } },
  linksLock: { nullable: 'Boolean' },
})
jsonProperties(AuthorUpdateDto, { name: { nullable: 'String' }, role: { nullable: 'String' } })
jsonProperties(WebLinkUpdateDto, { label: { nullable: 'String' }, url: { nullable: 'String' } })

// PORT: nom qualifié de la classe Kotlin (messages de Jackson)
registerClass('org.gotson.komga.interfaces.api.rest.dto.BookMetadataUpdateDto', BookMetadataUpdateDto)
registerClass('org.gotson.komga.interfaces.api.rest.dto.AuthorUpdateDto', AuthorUpdateDto)
registerClass('org.gotson.komga.interfaces.api.rest.dto.WebLinkUpdateDto', WebLinkUpdateDto)
