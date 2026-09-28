// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ReadProgress.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { DataClass } from '../../port/kotlin.js'
import type { Auditable } from './Auditable.js'
import type { R2Locator } from './R2Locator.js'

type ReadProgressParams = {
  bookId: string
  userId: string
  page: number
  completed: boolean
  readDate?: LocalDateTime
  deviceId?: string
  deviceName?: string
  locator?: R2Locator | null
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class ReadProgress extends DataClass<ReadProgressParams> implements Auditable {
  readonly bookId: string
  readonly userId: string
  readonly page: number
  readonly completed: boolean
  readonly readDate: LocalDateTime
  readonly deviceId: string
  readonly deviceName: string
  readonly locator: R2Locator | null
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    bookId,
    userId,
    page,
    completed,
    readDate = LocalDateTime.now(),
    deviceId = '',
    deviceName = '',
    locator = null,
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: ReadProgressParams) {
    super()
    this.bookId = bookId
    this.userId = userId
    this.page = page
    this.completed = completed
    this.readDate = readDate
    this.deviceId = deviceId
    this.deviceName = deviceName
    this.locator = locator
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }
}
