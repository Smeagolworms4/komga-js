// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/PageHashMatchDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { PageHashMatch } from '../../../../domain/model/PageHashMatch.js'
import { toFilePath } from '../../../../infrastructure/web/Utils.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type PageHashMatchDtoParams = {
  bookId: string
  url: string
  pageNumber: number
  fileName: string
  fileSize: number
  mediaType: string
}

export class PageHashMatchDto extends DataClass<PageHashMatchDtoParams> {
  readonly bookId: string
  readonly url: string
  readonly pageNumber: number
  readonly fileName: string
  readonly fileSize: number
  readonly mediaType: string

  constructor({ bookId, url, pageNumber, fileName, fileSize, mediaType }: PageHashMatchDtoParams) {
    super()
    this.bookId = bookId
    this.url = url
    this.pageNumber = pageNumber
    this.fileName = fileName
    this.fileSize = fileSize
    this.mediaType = mediaType
  }
}

export function toDto(self: PageHashMatch): PageHashMatchDto {
  return new PageHashMatchDto({
    bookId: self.bookId,
    url: toFilePath(self.url),
    pageNumber: self.pageNumber,
    fileName: self.fileName,
    fileSize: self.fileSize,
    mediaType: self.mediaType,
  })
}

jsonProperties(
  PageHashMatchDto,
  { bookId: 'String', url: 'String', pageNumber: 'Int', fileName: 'String', fileSize: 'Long', mediaType: 'String' },
  [],
  { required: ['bookId', 'url', 'pageNumber', 'fileName', 'fileSize', 'mediaType'] },
)
