// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/TachiyomiReadProgressUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass, kFloat } from '../../../../port/kotlin.js'
import { PositiveOrZero, constraints } from '../../../../port/validation.js'

type TachiyomiReadProgressUpdateDtoParams = {
  lastBookRead: number
}

export class TachiyomiReadProgressUpdateDto extends DataClass<TachiyomiReadProgressUpdateDtoParams> {
  readonly lastBookRead: number

  constructor({ lastBookRead }: TachiyomiReadProgressUpdateDtoParams) {
    super()
    this.lastBookRead = lastBookRead
  }
}

type TachiyomiReadProgressUpdateV2DtoParams = {
  lastBookNumberSortRead: number
}

export class TachiyomiReadProgressUpdateV2Dto extends DataClass<TachiyomiReadProgressUpdateV2DtoParams> {
  readonly lastBookNumberSortRead: number // PORT: Float

  constructor({ lastBookNumberSortRead }: TachiyomiReadProgressUpdateV2DtoParams) {
    super()
    this.lastBookNumberSortRead = kFloat(lastBookNumberSortRead)
  }
}

constraints(TachiyomiReadProgressUpdateDto, { lastBookRead: [PositiveOrZero()] })
jsonProperties(TachiyomiReadProgressUpdateDto, { lastBookRead: 'Int' }, [], { required: ['lastBookRead'] })
jsonProperties(TachiyomiReadProgressUpdateV2Dto, { lastBookNumberSortRead: 'Float' }, [], { required: ['lastBookNumberSortRead'] })
