// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ThumbnailSeriesDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ThumbnailSeries } from '../../../../domain/model/ThumbnailSeries.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ThumbnailSeriesDtoParams = {
  id: string
  seriesId: string
  type: string
  selected: boolean
  mediaType: string
  fileSize: number
  width: number
  height: number
}

export class ThumbnailSeriesDto extends DataClass<ThumbnailSeriesDtoParams> {
  readonly id: string
  readonly seriesId: string
  readonly type: string
  readonly selected: boolean
  readonly mediaType: string
  readonly fileSize: number
  readonly width: number
  readonly height: number

  constructor({ id, seriesId, type, selected, mediaType, fileSize, width, height }: ThumbnailSeriesDtoParams) {
    super()
    this.id = id
    this.seriesId = seriesId
    this.type = type
    this.selected = selected
    this.mediaType = mediaType
    this.fileSize = fileSize
    this.width = width
    this.height = height
  }
}

export function toDto(self: ThumbnailSeries): ThumbnailSeriesDto {
  return new ThumbnailSeriesDto({
    id: self.id,
    seriesId: self.seriesId,
    type: self.type.toString(),
    selected: self.selected,
    mediaType: self.mediaType,
    fileSize: self.fileSize,
    width: self.dimension.width,
    height: self.dimension.height,
  })
}

jsonProperties(
  ThumbnailSeriesDto,
  { id: 'String', seriesId: 'String', type: 'String', selected: 'Boolean', mediaType: 'String', fileSize: 'Long', width: 'Int', height: 'Int' },
  [],
  { required: ['id', 'seriesId', 'type', 'selected', 'mediaType', 'fileSize', 'width', 'height'] },
)
