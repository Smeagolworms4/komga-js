// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BookProjection.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { DataClass } from '../../port/kotlin.js'
import type { Auditable } from './Auditable.js'

type BookProjectionParams = {
  bookId: string
  profile: string
  fileSize: number
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

/**
 * A representation of a book file converted to a different [profile] will have a different [fileSize].
 */
export class BookProjection extends DataClass<BookProjectionParams> implements Auditable {
  readonly bookId: string
  readonly profile: string
  readonly fileSize: number
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    bookId,
    profile,
    fileSize,
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: BookProjectionParams) {
    super()
    this.bookId = bookId
    this.profile = profile
    this.fileSize = fileSize
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }
}
