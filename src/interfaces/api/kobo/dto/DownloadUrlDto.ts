// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/DownloadUrlDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { FormatDto } from './FormatDto.js'

type DownloadUrlDtoParams = {
  drmType?: string
  format: FormatDto
  size: number
  platform?: string
  url: string
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
// @JsonInclude(JsonInclude.Include.NON_NULL)
export class DownloadUrlDto extends DataClass<DownloadUrlDtoParams> {
  readonly drmType: string
  readonly format: FormatDto
  readonly size: number
  readonly platform: string
  readonly url: string

  constructor({
    drmType = 'None',
    format,
    size,
    platform = 'Generic',
    url,
  }: DownloadUrlDtoParams) {
    super()
    this.drmType = drmType
    this.format = format
    this.size = size
    this.platform = platform
    this.url = url
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(DownloadUrlDto, { rename: { drmType: 'DrmType', format: 'Format', size: 'Size', platform: 'Platform', url: 'Url' }, include: 'NON_NULL' })
jsonProperties(
  DownloadUrlDto,
  {
    drmType: 'String',
    format: { enum: FormatDto },
    size: 'Long',
    platform: 'String',
    url: 'String',
  },
  [],
  { required: ['format', 'size', 'url'] },
)
