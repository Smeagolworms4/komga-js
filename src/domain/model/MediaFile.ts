// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/MediaFile.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass, KEnum } from '../../port/kotlin.js'

type MediaFileParams = {
  fileName: string
  mediaType?: string | null
  subType?: MediaFile.SubType | null
  fileSize?: number | null
}

export class MediaFile extends DataClass<MediaFileParams> {
  readonly fileName: string
  readonly mediaType: string | null
  readonly subType: MediaFile.SubType | null
  readonly fileSize: number | null

  constructor({ fileName, mediaType = null, subType = null, fileSize = null }: MediaFileParams) {
    super()
    this.fileName = fileName
    this.mediaType = mediaType
    this.subType = subType
    this.fileSize = fileSize
  }
}

export namespace MediaFile {
  export class SubType extends KEnum {
    static readonly EPUB_PAGE = new SubType('EPUB_PAGE')
    static readonly EPUB_ASSET = new SubType('EPUB_ASSET')
  }
}
