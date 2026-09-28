// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/mylar/dto/Series.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { MylarMetadata } from './MylarMetadata.js'

type SeriesParams = {
  metadata: MylarMetadata
}

// @JsonIgnoreProperties(ignoreUnknown = true)
export class Series extends DataClass<SeriesParams> {
  readonly metadata: MylarMetadata

  constructor({ metadata }: SeriesParams) {
    super()
    this.metadata = metadata
  }
}

jsonProperties(Series, { metadata: { class: MylarMetadata } }, [], { required: ['metadata'] })
json(Series, { ignoreUnknown: true })
