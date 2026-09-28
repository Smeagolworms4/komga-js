// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/SyncPoint.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { DataClass } from '../../port/kotlin.js'

type SyncPointParams = {
  id: string
  userId: string
  apiKeyId: string | null
  createdDate: ZonedDateTime
}

export class SyncPoint extends DataClass<SyncPointParams> {
  readonly id: string
  readonly userId: string
  readonly apiKeyId: string | null
  readonly createdDate: ZonedDateTime

  constructor({ id, userId, apiKeyId, createdDate }: SyncPointParams) {
    super()
    this.id = id
    this.userId = userId
    this.apiKeyId = apiKeyId
    this.createdDate = createdDate
  }
}

type BookParams = {
  syncPointId: string
  bookId: string
  createdDate: ZonedDateTime
  lastModifiedDate: ZonedDateTime
  fileLastModified: ZonedDateTime
  fileSize: number
  fileHash: string
  metadataLastModifiedDate: ZonedDateTime
  thumbnailId: string | null
  synced: boolean
}

type ReadListParams = {
  syncPointId: string
  readListId: string
  readListName: string
  createdDate: ZonedDateTime
  lastModifiedDate: ZonedDateTime
  synced: boolean
}

type ReadListBookParams = {
  syncPointId: string
  readListId: string
  bookId: string
}

export namespace SyncPoint {
  export class Book extends DataClass<BookParams> {
    readonly syncPointId: string
    readonly bookId: string
    readonly createdDate: ZonedDateTime
    readonly lastModifiedDate: ZonedDateTime
    readonly fileLastModified: ZonedDateTime
    readonly fileSize: number
    readonly fileHash: string
    readonly metadataLastModifiedDate: ZonedDateTime
    readonly thumbnailId: string | null
    readonly synced: boolean

    constructor({
      syncPointId,
      bookId,
      createdDate,
      lastModifiedDate,
      fileLastModified,
      fileSize,
      fileHash,
      metadataLastModifiedDate,
      thumbnailId,
      synced,
    }: BookParams) {
      super()
      this.syncPointId = syncPointId
      this.bookId = bookId
      this.createdDate = createdDate
      this.lastModifiedDate = lastModifiedDate
      this.fileLastModified = fileLastModified
      this.fileSize = fileSize
      this.fileHash = fileHash
      this.metadataLastModifiedDate = metadataLastModifiedDate
      this.thumbnailId = thumbnailId
      this.synced = synced
    }
  }

  export class ReadList extends DataClass<ReadListParams> {
    readonly syncPointId: string
    readonly readListId: string
    readonly readListName: string
    readonly createdDate: ZonedDateTime
    readonly lastModifiedDate: ZonedDateTime
    readonly synced: boolean

    constructor({ syncPointId, readListId, readListName, createdDate, lastModifiedDate, synced }: ReadListParams) {
      super()
      this.syncPointId = syncPointId
      this.readListId = readListId
      this.readListName = readListName
      this.createdDate = createdDate
      this.lastModifiedDate = lastModifiedDate
      this.synced = synced
    }

    static readonly ON_DECK_ID = 'KOMGA-ONDECK'
  }

  export namespace ReadList {
    export class Book extends DataClass<ReadListBookParams> {
      readonly syncPointId: string
      readonly readListId: string
      readonly bookId: string

      constructor({ syncPointId, readListId, bookId }: ReadListBookParams) {
        super()
        this.syncPointId = syncPointId
        this.readListId = readListId
        this.bookId = bookId
      }
    }
  }
}
