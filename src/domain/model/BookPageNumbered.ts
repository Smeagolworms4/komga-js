// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BookPageNumbered.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../port/jackson-mapper.js'
import { str } from '../../port/kotlin.js'
import { BookPage } from './BookPage.js'
import { Dimension } from './Dimension.js'

type BookPageNumberedParams = {
  fileName: string
  mediaType: string
  dimension?: Dimension | null
  fileHash?: string
  fileSize?: number | null
  pageNumber: number
}

export class BookPageNumbered extends BookPage {
  readonly pageNumber: number

  constructor({ fileName, mediaType, dimension = null, fileHash = '', fileSize = null, pageNumber }: BookPageNumberedParams) {
    super({
      fileName: fileName,
      mediaType: mediaType,
      dimension: dimension,
      fileHash: fileHash,
      fileSize: fileSize,
    })
    this.pageNumber = pageNumber
  }

  toString(): string {
    return `BookPageNumbered(fileName='${this.fileName}', mediaType='${this.mediaType}', dimension=${str(this.dimension)}, fileHash='${this.fileHash}', fileSize=${str(this.fileSize)}, pageNumber=${this.pageNumber})`
  }
}

jsonProperties(
  BookPageNumbered,
  { fileName: 'String', mediaType: 'String', dimension: { nullable: { class: Dimension } }, fileHash: 'String', fileSize: { nullable: 'Long' }, pageNumber: 'Int' },
  [],
  { required: ['fileName', 'mediaType', 'pageNumber'] },
)
