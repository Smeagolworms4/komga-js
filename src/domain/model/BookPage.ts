// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BookPage.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { isNotBlank, str } from '../../port/kotlin.js'
import type { Dimension } from './Dimension.js'

export type BookPageParams = {
  fileName: string
  mediaType: string
  dimension?: Dimension | null
  fileHash?: string
  fileSize?: number | null
}

export class BookPage {
  readonly fileName: string
  readonly mediaType: string
  readonly dimension: Dimension | null
  readonly fileHash: string
  readonly fileSize: number | null

  constructor({ fileName, mediaType, dimension = null, fileHash = '', fileSize = null }: BookPageParams) {
    this.fileName = fileName
    this.mediaType = mediaType
    this.dimension = dimension
    this.fileHash = fileHash
    this.fileSize = fileSize
  }

  toString(): string {
    return `BookPage(fileName='${this.fileName}', mediaType='${this.mediaType}', dimension=${str(this.dimension)}, fileHash='${this.fileHash}', fileSize=${str(this.fileSize)})`
  }

  copy({
    fileName = this.fileName,
    mediaType = this.mediaType,
    dimension = this.dimension,
    fileHash = this.fileHash,
    fileSize = this.fileSize,
  }: Partial<BookPageParams> = {}): BookPage {
    return new BookPage({
      fileName: fileName,
      mediaType: mediaType,
      dimension: dimension,
      fileHash: fileHash,
      fileSize: fileSize,
    })
  }
}

export function restoreHashFrom(self: Iterable<BookPage>, restoreFrom: Iterable<BookPage>): BookPage[] {
  const from = [...restoreFrom]
  return [...self].map((newPage) => {
    const it = from.find(
      (it) =>
        it.fileSize === newPage.fileSize &&
        it.mediaType === newPage.mediaType &&
        it.fileName === newPage.fileName &&
        isNotBlank(it.fileHash),
    )
    return (it !== undefined ? newPage.copy({ fileHash: it.fileHash }) : null) ?? newPage
  })
}
