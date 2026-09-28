// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ThumbnailReadList.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { contentEquals, contentHashCode } from '../../port/extra-misc.js'
import { DataClass, KEnum, eq, hash } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import type { Auditable } from './Auditable.js'
import type { Dimension } from './Dimension.js'

type ThumbnailReadListParams = {
  thumbnail: Uint8Array
  selected?: boolean
  type: ThumbnailReadList.Type
  mediaType: string
  fileSize: number
  dimension: Dimension
  id?: string
  readListId?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class ThumbnailReadList extends DataClass<ThumbnailReadListParams> implements Auditable {
  readonly thumbnail: Uint8Array
  readonly selected: boolean
  readonly type: ThumbnailReadList.Type
  readonly mediaType: string
  readonly fileSize: number
  readonly dimension: Dimension
  readonly id: string
  readonly readListId: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    thumbnail,
    selected = false,
    type,
    mediaType,
    fileSize,
    dimension,
    id = TsidCreator.getTsid256().toString(),
    readListId = '',
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: ThumbnailReadListParams) {
    super()
    this.thumbnail = thumbnail
    this.selected = selected
    this.type = type
    this.mediaType = mediaType
    this.fileSize = fileSize
    this.dimension = dimension
    this.id = id
    this.readListId = readListId
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }

  equals(other: unknown): boolean {
    if (this === other) return true
    if (this.constructor !== (other as object | null | undefined)?.constructor) return false

    const o = other as ThumbnailReadList

    if (!contentEquals(this.thumbnail, o.thumbnail)) return false
    if (this.selected !== o.selected) return false
    if (this.type !== o.type) return false
    if (this.mediaType !== o.mediaType) return false
    if (this.fileSize !== o.fileSize) return false
    if (!eq(this.dimension, o.dimension)) return false
    if (this.id !== o.id) return false
    if (this.readListId !== o.readListId) return false
    if (!eq(this.createdDate, o.createdDate)) return false
    if (!eq(this.lastModifiedDate, o.lastModifiedDate)) return false

    return true
  }

  hashCode(): number {
    let result = contentHashCode(this.thumbnail)
    result = (31 * result + hash(this.selected)) | 0
    result = (31 * result + hash(this.type)) | 0
    result = (31 * result + hash(this.mediaType)) | 0
    result = (31 * result + hash(this.fileSize)) | 0
    result = (31 * result + this.dimension.hashCode()) | 0
    result = (31 * result + hash(this.id)) | 0
    result = (31 * result + hash(this.readListId)) | 0
    result = (31 * result + this.createdDate.hashCode()) | 0
    result = (31 * result + this.lastModifiedDate.hashCode()) | 0
    return result
  }
}

export namespace ThumbnailReadList {
  export class Type extends KEnum {
    static readonly USER_UPLOADED = new Type('USER_UPLOADED')
  }
}
