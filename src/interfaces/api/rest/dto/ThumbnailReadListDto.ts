// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ThumbnailReadListDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ThumbnailReadList } from '../../../../domain/model/ThumbnailReadList.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ThumbnailReadListDtoParams = {
  id: string
  readListId: string
  type: string
  selected: boolean
  mediaType: string
  fileSize: number
  width: number
  height: number
}

export class ThumbnailReadListDto extends DataClass<ThumbnailReadListDtoParams> {
  readonly id: string
  readonly readListId: string
  readonly type: string
  readonly selected: boolean
  readonly mediaType: string
  readonly fileSize: number
  readonly width: number
  readonly height: number

  constructor({ id, readListId, type, selected, mediaType, fileSize, width, height }: ThumbnailReadListDtoParams) {
    super()
    this.id = id
    this.readListId = readListId
    this.type = type
    this.selected = selected
    this.mediaType = mediaType
    this.fileSize = fileSize
    this.width = width
    this.height = height
  }
}

export function toDto(self: ThumbnailReadList): ThumbnailReadListDto {
  return new ThumbnailReadListDto({
    id: self.id,
    readListId: self.readListId,
    type: self.type.toString(),
    selected: self.selected,
    mediaType: self.mediaType,
    fileSize: self.fileSize,
    width: self.dimension.width,
    height: self.dimension.height,
  })
}

jsonProperties(
  ThumbnailReadListDto,
  { id: 'String', readListId: 'String', type: 'String', selected: 'Boolean', mediaType: 'String', fileSize: 'Long', width: 'Int', height: 'Int' },
  [],
  { required: ['id', 'readListId', 'type', 'selected', 'mediaType', 'fileSize', 'width', 'height'] },
)
