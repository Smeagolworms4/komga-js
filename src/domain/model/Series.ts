// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/Series.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { URL } from '../../port/java-net.js'
import { LocalDateTime } from '@js-joda/core'
import { urlToPath } from '../../port/java.js'
import { DataClass, lazy } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import type { Auditable } from './Auditable.js'

type SeriesParams = {
  name: string
  url: URL
  fileLastModified: LocalDateTime
  id?: string
  libraryId?: string
  bookCount?: number
  deletedDate?: LocalDateTime | null
  oneshot?: boolean
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class Series extends DataClass<SeriesParams> implements Auditable {
  readonly name: string
  readonly url: URL
  readonly fileLastModified: LocalDateTime
  readonly id: string
  readonly libraryId: string
  readonly bookCount: number
  readonly deletedDate: LocalDateTime | null
  readonly oneshot: boolean
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    name,
    url,
    fileLastModified,
    id = TsidCreator.getTsid256().toString(),
    libraryId = '',
    bookCount = 0,
    deletedDate = null,
    oneshot = false,
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: SeriesParams) {
    super()
    this.name = name
    this.url = url
    this.fileLastModified = fileLastModified
    this.id = id
    this.libraryId = libraryId
    this.bookCount = bookCount
    this.deletedDate = deletedDate
    this.oneshot = oneshot
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }

  get path(): string {
    return lazy(this, 'path', () => urlToPath(this.url))
  }
}
