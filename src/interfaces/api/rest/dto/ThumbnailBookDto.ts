// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ThumbnailBookDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ThumbnailBook } from '../../../../domain/model/ThumbnailBook.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ThumbnailBookDtoParams = {
  id: string
  bookId: string
  type: string
  selected: boolean
  mediaType: string
  fileSize: number
  width: number
  height: number
}

export class ThumbnailBookDto extends DataClass<ThumbnailBookDtoParams> {
  readonly id: string
  readonly bookId: string
  readonly type: string
  readonly selected: boolean
  readonly mediaType: string
  readonly fileSize: number
  readonly width: number
  readonly height: number

  constructor({ id, bookId, type, selected, mediaType, fileSize, width, height }: ThumbnailBookDtoParams) {
    super()
    this.id = id
    this.bookId = bookId
    this.type = type
    this.selected = selected
    this.mediaType = mediaType
    this.fileSize = fileSize
    this.width = width
    this.height = height
  }
}

export function toDto(self: ThumbnailBook): ThumbnailBookDto {
  return new ThumbnailBookDto({
    id: self.id,
    bookId: self.bookId,
    type: self.type.toString(),
    selected: self.selected,
    mediaType: self.mediaType,
    fileSize: self.fileSize,
    width: self.dimension.width,
    height: self.dimension.height,
  })
}

jsonProperties(
  ThumbnailBookDto,
  { id: 'String', bookId: 'String', type: 'String', selected: 'Boolean', mediaType: 'String', fileSize: 'Long', width: 'Int', height: 'Int' },
  [],
  { required: ['id', 'bookId', 'type', 'selected', 'mediaType', 'fileSize', 'width', 'height'] },
)
