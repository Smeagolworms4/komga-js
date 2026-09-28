// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ReadListRequestMatchDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDate } from '@js-joda/core'
import type { ReadListMatch, ReadListRequestBook, ReadListRequestMatch } from '../../../../domain/model/ReadListRequest.js'
import { jsonFormatLocalDate } from '../../../../port/jackson-format.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ReadListRequestMatchDtoParams = {
  readListMatch: ReadListMatchDto
  requests: ReadListRequestBookMatchesDto[]
  errorCode?: string
}

export class ReadListRequestMatchDto extends DataClass<ReadListRequestMatchDtoParams> {
  readonly readListMatch: ReadListMatchDto
  readonly requests: ReadListRequestBookMatchesDto[] // PORT: Collection -> tableau
  readonly errorCode: string

  constructor({ readListMatch, requests, errorCode = '' }: ReadListRequestMatchDtoParams) {
    super()
    this.readListMatch = readListMatch
    this.requests = requests
    this.errorCode = errorCode
  }
}

export function toDto(self: ReadListRequestMatch): ReadListRequestMatchDto {
  return new ReadListRequestMatchDto({
    readListMatch: readListMatchToDto(self.readListMatch),
    requests: self.requests.map(
      (request) =>
        new ReadListRequestBookMatchesDto({
          request: readListRequestBookToDto(request.request),
          matches: [...request.matches.entries()].map(
            ([series, books]) =>
              new ReadListRequestBookMatchDto({
                series: new ReadListRequestBookMatchSeriesDto({ seriesId: series.id, title: series.title, releaseDate: series.releaseDate }),
                books: books.map((it) => new ReadListRequestBookMatchBookDto({ bookId: it.id, number: it.number, title: it.title })),
              }),
          ),
        }),
    ),
  })
}

type ReadListMatchDtoParams = {
  name: string
  errorCode?: string
}

export class ReadListMatchDto extends DataClass<ReadListMatchDtoParams> {
  readonly name: string
  readonly errorCode: string

  constructor({ name, errorCode = '' }: ReadListMatchDtoParams) {
    super()
    this.name = name
    this.errorCode = errorCode
  }
}

// PORT: surcharge d'extension ReadListMatch.toDto() renommée (même fichier que ReadListRequestMatch.toDto())
export function readListMatchToDto(self: ReadListMatch): ReadListMatchDto {
  return new ReadListMatchDto({ name: self.name, errorCode: self.errorCode })
}

type ReadListRequestBookMatchesDtoParams = {
  request: ReadListRequestBookDto
  matches: ReadListRequestBookMatchDto[]
}

export class ReadListRequestBookMatchesDto extends DataClass<ReadListRequestBookMatchesDtoParams> {
  readonly request: ReadListRequestBookDto
  readonly matches: ReadListRequestBookMatchDto[]

  constructor({ request, matches }: ReadListRequestBookMatchesDtoParams) {
    super()
    this.request = request
    this.matches = matches
  }
}

type ReadListRequestBookDtoParams = {
  series: ReadonlySet<string>
  number: string
}

export class ReadListRequestBookDto extends DataClass<ReadListRequestBookDtoParams> {
  readonly series: ReadonlySet<string>
  readonly number: string

  constructor({ series, number }: ReadListRequestBookDtoParams) {
    super()
    this.series = series
    this.number = number
  }
}

// PORT: surcharge d'extension ReadListRequestBook.toDto() renommée (même fichier que ReadListRequestMatch.toDto())
export function readListRequestBookToDto(self: ReadListRequestBook): ReadListRequestBookDto {
  return new ReadListRequestBookDto({
    series: self.series,
    number: self.number,
  })
}

type ReadListRequestBookMatchDtoParams = {
  series: ReadListRequestBookMatchSeriesDto
  books: ReadListRequestBookMatchBookDto[]
}

export class ReadListRequestBookMatchDto extends DataClass<ReadListRequestBookMatchDtoParams> {
  readonly series: ReadListRequestBookMatchSeriesDto
  readonly books: ReadListRequestBookMatchBookDto[] // PORT: Collection -> tableau

  constructor({ series, books }: ReadListRequestBookMatchDtoParams) {
    super()
    this.series = series
    this.books = books
  }
}

type ReadListRequestBookMatchSeriesDtoParams = {
  seriesId: string
  title: string
  releaseDate: LocalDate | null
}

export class ReadListRequestBookMatchSeriesDto extends DataClass<ReadListRequestBookMatchSeriesDtoParams> {
  readonly seriesId: string
  readonly title: string
  // @JsonFormat(pattern = "yyyy-MM-dd")
  readonly releaseDate: LocalDate | null

  constructor({ seriesId, title, releaseDate }: ReadListRequestBookMatchSeriesDtoParams) {
    super()
    this.seriesId = seriesId
    this.title = title
    this.releaseDate = releaseDate
  }
}

type ReadListRequestBookMatchBookDtoParams = {
  bookId: string
  number: string
  title: string
}

export class ReadListRequestBookMatchBookDto extends DataClass<ReadListRequestBookMatchBookDtoParams> {
  readonly bookId: string
  readonly number: string
  readonly title: string

  constructor({ bookId, number, title }: ReadListRequestBookMatchBookDtoParams) {
    super()
    this.bookId = bookId
    this.number = number
    this.title = title
  }
}

jsonProperties(
  ReadListRequestMatchDto,
  { readListMatch: { class: ReadListMatchDto }, requests: { list: { class: ReadListRequestBookMatchesDto } }, errorCode: 'String' },
  [],
  { required: ['readListMatch', 'requests'] },
)
jsonProperties(ReadListMatchDto, { name: 'String', errorCode: 'String' }, [], { required: ['name'] })
jsonProperties(
  ReadListRequestBookMatchesDto,
  { request: { class: ReadListRequestBookDto }, matches: { list: { class: ReadListRequestBookMatchDto } } },
  [],
  { required: ['request', 'matches'] },
)
jsonProperties(ReadListRequestBookDto, { series: { set: 'String' }, number: 'String' }, [], { required: ['series', 'number'] })
jsonProperties(
  ReadListRequestBookMatchDto,
  { series: { class: ReadListRequestBookMatchSeriesDto }, books: { list: { class: ReadListRequestBookMatchBookDto } } },
  [],
  { required: ['series', 'books'] },
)
jsonProperties(
  ReadListRequestBookMatchSeriesDto,
  { seriesId: 'String', title: 'String', releaseDate: { nullable: jsonFormatLocalDate('yyyy-MM-dd') } },
  [],
  { required: ['seriesId', 'title'] },
)
jsonProperties(ReadListRequestBookMatchBookDto, { bookId: 'String', number: 'String', title: 'String' }, [], { required: ['bookId', 'number', 'title'] })
