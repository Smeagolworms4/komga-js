// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/PageHashMatch.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'

type PageHashMatchParams = {
  bookId: string
  url: URL
  pageNumber: number
  fileName: string
  fileSize: number
  mediaType: string
}

export class PageHashMatch extends DataClass<PageHashMatchParams> {
  readonly bookId: string
  readonly url: URL
  readonly pageNumber: number
  readonly fileName: string
  readonly fileSize: number
  readonly mediaType: string

  constructor({ bookId, url, pageNumber, fileName, fileSize, mediaType }: PageHashMatchParams) {
    super()
    this.bookId = bookId
    this.url = url
    this.pageNumber = pageNumber
    this.fileName = fileName
    this.fileSize = fileSize
    this.mediaType = mediaType
  }
}
