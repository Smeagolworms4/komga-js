// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ThumbnailSeriesCollectionDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ThumbnailSeriesCollection } from '../../../../domain/model/ThumbnailSeriesCollection.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ThumbnailSeriesCollectionDtoParams = {
  id: string
  collectionId: string
  type: string
  selected: boolean
  mediaType: string
  fileSize: number
  width: number
  height: number
}

export class ThumbnailSeriesCollectionDto extends DataClass<ThumbnailSeriesCollectionDtoParams> {
  readonly id: string
  readonly collectionId: string
  readonly type: string
  readonly selected: boolean
  readonly mediaType: string
  readonly fileSize: number
  readonly width: number
  readonly height: number

  constructor({ id, collectionId, type, selected, mediaType, fileSize, width, height }: ThumbnailSeriesCollectionDtoParams) {
    super()
    this.id = id
    this.collectionId = collectionId
    this.type = type
    this.selected = selected
    this.mediaType = mediaType
    this.fileSize = fileSize
    this.width = width
    this.height = height
  }
}

export function toDto(self: ThumbnailSeriesCollection): ThumbnailSeriesCollectionDto {
  return new ThumbnailSeriesCollectionDto({
    id: self.id,
    collectionId: self.collectionId,
    type: self.type.toString(),
    selected: self.selected,
    mediaType: self.mediaType,
    fileSize: self.fileSize,
    width: self.dimension.width,
    height: self.dimension.height,
  })
}

jsonProperties(
  ThumbnailSeriesCollectionDto,
  { id: 'String', collectionId: 'String', type: 'String', selected: 'Boolean', mediaType: 'String', fileSize: 'Long', width: 'Int', height: 'Int' },
  [],
  { required: ['id', 'collectionId', 'type', 'selected', 'mediaType', 'fileSize', 'width', 'height'] },
)
