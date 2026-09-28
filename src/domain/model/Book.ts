// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/Book.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { URL } from '../../port/java-net.js'
import { LocalDateTime } from '@js-joda/core'
import { urlToPath } from '../../port/java.js'
import { DataClass, lazy } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import type { Auditable } from './Auditable.js'

type BookParams = {
  name: string
  url: URL
  fileLastModified: LocalDateTime
  fileSize?: number
  fileHash?: string
  fileHashKoreader?: string
  number?: number
  id?: string
  seriesId?: string
  libraryId?: string
  deletedDate?: LocalDateTime | null
  oneshot?: boolean
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class Book extends DataClass<BookParams> implements Auditable {
  readonly name: string
  readonly url: URL
  readonly fileLastModified: LocalDateTime
  readonly fileSize: number
  readonly fileHash: string
  readonly fileHashKoreader: string
  readonly number: number
  readonly id: string
  readonly seriesId: string
  readonly libraryId: string
  readonly deletedDate: LocalDateTime | null
  readonly oneshot: boolean
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    name,
    url,
    fileLastModified,
    fileSize = 0,
    fileHash = '',
    fileHashKoreader = '',
    number = 0,
    id = TsidCreator.getTsid256().toString(),
    seriesId = '',
    libraryId = '',
    deletedDate = null,
    oneshot = false,
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: BookParams) {
    super()
    this.name = name
    this.url = url
    this.fileLastModified = fileLastModified
    this.fileSize = fileSize
    this.fileHash = fileHash
    this.fileHashKoreader = fileHashKoreader
    this.number = number
    this.id = id
    this.seriesId = seriesId
    this.libraryId = libraryId
    this.deletedDate = deletedDate
    this.oneshot = oneshot
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }

  get path(): string {
    return lazy(this, 'path', () => urlToPath(this.url))
  }
}
