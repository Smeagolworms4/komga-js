// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/ReadingStateStateUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { ReadingStateDto } from './ReadingStateDto.js'

type ReadingStateStateUpdateDtoParams = {
  readingStates?: ReadingStateDto[]
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class ReadingStateStateUpdateDto extends DataClass<ReadingStateStateUpdateDtoParams> {
  readonly readingStates: ReadingStateDto[]

  constructor({ readingStates = [] }: ReadingStateStateUpdateDtoParams = {}) {
    super()
    this.readingStates = readingStates
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(ReadingStateStateUpdateDto, { rename: { readingStates: 'ReadingStates' } })
jsonProperties(
  ReadingStateStateUpdateDto,
  {
    readingStates: { list: { class: ReadingStateDto } },
  },
  [],
  { required: [] },
)
