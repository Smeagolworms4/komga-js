// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/PageDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BinaryByteUnit } from '../../../../port/byteunits.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type PageDtoParams = {
  number: number
  fileName: string
  mediaType: string
  width: number | null
  height: number | null
  sizeBytes: number | null
  size?: string
}

export class PageDto extends DataClass<PageDtoParams> {
  readonly number: number
  readonly fileName: string
  readonly mediaType: string
  readonly width: number | null
  readonly height: number | null
  readonly sizeBytes: number | null
  readonly size: string

  constructor({ number, fileName, mediaType, width, height, sizeBytes, size = (sizeBytes !== null ? BinaryByteUnit.format(sizeBytes) : null) ?? '' }: PageDtoParams) {
    super()
    this.number = number
    this.fileName = fileName
    this.mediaType = mediaType
    this.width = width
    this.height = height
    this.sizeBytes = sizeBytes
    this.size = size
  }
}

jsonProperties(
  PageDto,
  { number: 'Int', fileName: 'String', mediaType: 'String', width: { nullable: 'Int' }, height: { nullable: 'Int' }, sizeBytes: { nullable: 'Long' }, size: 'String' },
  [],
  { required: ['number', 'fileName', 'mediaType'] },
)
