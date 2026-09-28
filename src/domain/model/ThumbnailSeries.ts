// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ThumbnailSeries.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { filesExists, urlToPath } from '../../port/java.js'
import { contentEquals, contentHashCode } from '../../port/extra-misc.js'
import { DataClass, KEnum, eq, hash } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import type { Auditable } from './Auditable.js'
import type { Dimension } from './Dimension.js'

type ThumbnailSeriesParams = {
  thumbnail?: Uint8Array | null
  url?: URL | null
  selected?: boolean
  type: ThumbnailSeries.Type
  mediaType: string
  fileSize: number
  dimension: Dimension
  id?: string
  seriesId?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class ThumbnailSeries extends DataClass<ThumbnailSeriesParams> implements Auditable {
  readonly thumbnail: Uint8Array | null
  readonly url: URL | null
  readonly selected: boolean
  readonly type: ThumbnailSeries.Type
  readonly mediaType: string
  readonly fileSize: number
  readonly dimension: Dimension
  readonly id: string
  readonly seriesId: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    thumbnail = null,
    url = null,
    selected = false,
    type,
    mediaType,
    fileSize,
    dimension,
    id = TsidCreator.getTsid256().toString(),
    seriesId = '',
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: ThumbnailSeriesParams) {
    super()
    this.thumbnail = thumbnail
    this.url = url
    this.selected = selected
    this.type = type
    this.mediaType = mediaType
    this.fileSize = fileSize
    this.dimension = dimension
    this.id = id
    this.seriesId = seriesId
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }

  exists(): boolean {
    if (this.url !== null) return filesExists(urlToPath(this.url))
    return this.thumbnail !== null
  }

  equals(other: unknown): boolean {
    if (this === other) return true
    if (this.constructor !== (other as object | null | undefined)?.constructor) return false

    const o = other as ThumbnailSeries

    if (this.thumbnail !== null) {
      if (o.thumbnail === null) return false
      if (!contentEquals(this.thumbnail, o.thumbnail)) return false
    } else if (o.thumbnail !== null) return false
    if (!eq(this.url, o.url)) return false
    if (this.selected !== o.selected) return false
    if (this.type !== o.type) return false
    if (this.mediaType !== o.mediaType) return false
    if (this.fileSize !== o.fileSize) return false
    if (!eq(this.dimension, o.dimension)) return false
    if (this.id !== o.id) return false
    if (this.seriesId !== o.seriesId) return false
    if (!eq(this.createdDate, o.createdDate)) return false
    if (!eq(this.lastModifiedDate, o.lastModifiedDate)) return false

    return true
  }

  hashCode(): number {
    let result = this.thumbnail !== null ? contentHashCode(this.thumbnail) : 0
    result = (31 * result + (this.url !== null ? hash(this.url) : 0)) | 0
    result = (31 * result + hash(this.selected)) | 0
    result = (31 * result + hash(this.type)) | 0
    result = (31 * result + hash(this.mediaType)) | 0
    result = (31 * result + hash(this.fileSize)) | 0
    result = (31 * result + this.dimension.hashCode()) | 0
    result = (31 * result + hash(this.id)) | 0
    result = (31 * result + hash(this.seriesId)) | 0
    result = (31 * result + this.createdDate.hashCode()) | 0
    result = (31 * result + this.lastModifiedDate.hashCode()) | 0
    return result
  }
}

export namespace ThumbnailSeries {
  export class Type extends KEnum {
    static readonly SIDECAR = new Type('SIDECAR')
    static readonly USER_UPLOADED = new Type('USER_UPLOADED')
  }
}
