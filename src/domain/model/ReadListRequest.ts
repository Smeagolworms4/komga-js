// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ReadListRequest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDate } from '@js-joda/core'
import { DataClass } from '../../port/kotlin.js'

type ReadListRequestParams = {
  name: string
  books: ReadListRequestBook[]
}

/**
 * Represents a request to create a reading list.
 */
export class ReadListRequest extends DataClass<ReadListRequestParams> {
  readonly name: string
  readonly books: ReadListRequestBook[]

  constructor({ name, books }: ReadListRequestParams) {
    super()
    this.name = name
    this.books = books
  }
}

type ReadListRequestBookParams = {
  series: ReadonlySet<string>
  number: string
}

export class ReadListRequestBook extends DataClass<ReadListRequestBookParams> {
  readonly series: ReadonlySet<string>
  readonly number: string

  constructor({ series, number }: ReadListRequestBookParams) {
    super()
    this.series = series
    this.number = number
  }
}

type ReadListRequestMatchParams = {
  readListMatch: ReadListMatch
  requests: ReadListRequestBookMatches[] // PORT: Collection -> tableau
  errorCode?: string
}

export class ReadListRequestMatch extends DataClass<ReadListRequestMatchParams> {
  readonly readListMatch: ReadListMatch
  readonly requests: ReadListRequestBookMatches[] // PORT: Collection -> tableau
  readonly errorCode: string

  constructor({ readListMatch, requests, errorCode = '' }: ReadListRequestMatchParams) {
    super()
    this.readListMatch = readListMatch
    this.requests = requests
    this.errorCode = errorCode
  }
}

type ReadListMatchParams = {
  name: string
  errorCode?: string
}

export class ReadListMatch extends DataClass<ReadListMatchParams> {
  readonly name: string
  readonly errorCode: string

  constructor({ name, errorCode = '' }: ReadListMatchParams) {
    super()
    this.name = name
    this.errorCode = errorCode
  }
}

type ReadListRequestBookMatchesParams = {
  request: ReadListRequestBook
  // PORT: Map JS : les clés (data class) sont comparées par référence, pas par equals()
  matches: Map<ReadListRequestBookMatchSeries, ReadListRequestBookMatchBook[]>
}

export class ReadListRequestBookMatches extends DataClass<ReadListRequestBookMatchesParams> {
  readonly request: ReadListRequestBook
  // PORT: Map JS : les clés (data class) sont comparées par référence, pas par equals()
  readonly matches: Map<ReadListRequestBookMatchSeries, ReadListRequestBookMatchBook[]>

  constructor({ request, matches }: ReadListRequestBookMatchesParams) {
    super()
    this.request = request
    this.matches = matches
  }
}

type ReadListRequestBookMatchSeriesParams = {
  id: string
  title: string
  releaseDate: LocalDate | null
}

export class ReadListRequestBookMatchSeries extends DataClass<ReadListRequestBookMatchSeriesParams> {
  readonly id: string
  readonly title: string
  readonly releaseDate: LocalDate | null

  constructor({ id, title, releaseDate }: ReadListRequestBookMatchSeriesParams) {
    super()
    this.id = id
    this.title = title
    this.releaseDate = releaseDate
  }
}

type ReadListRequestBookMatchBookParams = {
  id: string
  number: string
  title: string
}

export class ReadListRequestBookMatchBook extends DataClass<ReadListRequestBookMatchBookParams> {
  readonly id: string
  readonly number: string
  readonly title: string

  constructor({ id, number, title }: ReadListRequestBookMatchBookParams) {
    super()
    this.id = id
    this.number = number
    this.title = title
  }
}
