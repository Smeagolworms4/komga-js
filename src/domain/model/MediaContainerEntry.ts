// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/MediaContainerEntry.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'
import type { Dimension } from './Dimension.js'

type MediaContainerEntryParams = {
  name: string
  mediaType?: string | null
  comment?: string | null
  dimension?: Dimension | null
  fileSize?: number | null
}

export class MediaContainerEntry extends DataClass<MediaContainerEntryParams> {
  readonly name: string
  readonly mediaType: string | null
  readonly comment: string | null
  readonly dimension: Dimension | null
  readonly fileSize: number | null

  constructor({ name, mediaType = null, comment = null, dimension = null, fileSize = null }: MediaContainerEntryParams) {
    super()
    this.name = name
    this.mediaType = mediaType
    this.comment = comment
    this.dimension = dimension
    this.fileSize = fileSize
  }
}
