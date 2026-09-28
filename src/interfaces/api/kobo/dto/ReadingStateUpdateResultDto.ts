// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/ReadingStateUpdateResultDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { type ResultDto, jsonTypeOfResultDto } from './ResultDto.js'

type RequestResultDtoParams = {
  requestResult: ResultDto
  updateResults: UpdateResultDto[]
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class RequestResultDto extends DataClass<RequestResultDtoParams> {
  readonly requestResult: ResultDto
  readonly updateResults: UpdateResultDto[] // PORT: Collection -> tableau

  constructor({ requestResult, updateResults }: RequestResultDtoParams) {
    super()
    this.requestResult = requestResult
    this.updateResults = updateResults
  }
}

// PORT: interface Kotlin (marqueur) -> interface TS
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UpdateResultDto {}

type ReadingStateUpdateResultDtoParams = {
  entitlementId: string
  currentBookmarkResult: WrappedResultDto
  statisticsResult: WrappedResultDto
  statusInfoResult: WrappedResultDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class ReadingStateUpdateResultDto extends DataClass<ReadingStateUpdateResultDtoParams> implements UpdateResultDto {
  readonly entitlementId: string
  readonly currentBookmarkResult: WrappedResultDto
  readonly statisticsResult: WrappedResultDto
  readonly statusInfoResult: WrappedResultDto

  constructor({ entitlementId, currentBookmarkResult, statisticsResult, statusInfoResult }: ReadingStateUpdateResultDtoParams) {
    super()
    this.entitlementId = entitlementId
    this.currentBookmarkResult = currentBookmarkResult
    this.statisticsResult = statisticsResult
    this.statusInfoResult = statusInfoResult
  }
}

type WrappedResultDtoParams = {
  result: ResultDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class WrappedResultDto extends DataClass<WrappedResultDtoParams> {
  readonly result: ResultDto

  constructor({ result }: WrappedResultDtoParams) {
    super()
    this.result = result
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(RequestResultDto, { rename: { requestResult: 'RequestResult', updateResults: 'UpdateResults' } })
// PORT: Collection<UpdateResultDto> (interface) : type d'exécution des éléments ('Any')
jsonProperties(RequestResultDto, { requestResult: jsonTypeOfResultDto(), updateResults: { list: 'Any' } }, [], { required: ['requestResult', 'updateResults'] })
json(ReadingStateUpdateResultDto, {
  rename: {
    entitlementId: 'EntitlementId',
    currentBookmarkResult: 'CurrentBookmarkResult',
    statisticsResult: 'StatisticsResult',
    statusInfoResult: 'StatusInfoResult',
  },
})
jsonProperties(
  ReadingStateUpdateResultDto,
  {
    entitlementId: 'String',
    currentBookmarkResult: { class: WrappedResultDto },
    statisticsResult: { class: WrappedResultDto },
    statusInfoResult: { class: WrappedResultDto },
  },
  [],
  { required: ['entitlementId', 'currentBookmarkResult', 'statisticsResult', 'statusInfoResult'] },
)
json(WrappedResultDto, { rename: { result: 'Result' } })
jsonProperties(WrappedResultDto, { result: jsonTypeOfResultDto() }, [], { required: ['result'] })
