// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kosync/dto/DocumentProgressDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass, kFloat } from '../../../../port/kotlin.js'

type DocumentProgressDtoParams = {
  document: string
  percentage: number
  progress: string
  device: string
  deviceId: string
}

// @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
export class DocumentProgressDto extends DataClass<DocumentProgressDtoParams> {
  /**
   * The document hash, computed using the KOReader partial MD5 algorithm.
   */
  readonly document: string
  /**
   * Total progress percentage in the document, between 0 and 1.
   */
  readonly percentage: number // PORT: Float
  /**
   * Current progress.
   *
   * For PDF and CBZ, contains the current page number (starting from 1).
   *
   * For EPUB, it can contain a position in the following forms
   * - '/body/DocFragment[10]/body/div/p[1]/text().0', where 10 correspond to the 1-based index of the resource in the manifest
   * - '#_doc_fragment_44_ c37' (after clicking in the TOC), where 44 correspond to the 0-based index of the resource in the manifest
   */
  readonly progress: string
  readonly device: string
  readonly deviceId: string

  constructor({ document, percentage, progress, device, deviceId }: DocumentProgressDtoParams) {
    super()
    this.document = document
    this.percentage = kFloat(percentage)
    this.progress = progress
    this.device = device
    this.deviceId = deviceId
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class) -> noms JSON explicites
json(DocumentProgressDto, { rename: { deviceId: 'device_id' } })
jsonProperties(
  DocumentProgressDto,
  {
    document: 'String',
    percentage: 'Float',
    progress: 'String',
    device: 'String',
    deviceId: 'String',
  },
  [],
  { required: ['document', 'percentage', 'progress', 'device', 'deviceId'] },
)
