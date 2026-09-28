// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/R2Positions.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { R2Locator } from '../../../../domain/model/R2Locator.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type R2PositionsParams = {
  total: number
  positions: R2Locator[]
}

export class R2Positions extends DataClass<R2PositionsParams> {
  readonly total: number
  readonly positions: R2Locator[]

  constructor({ total, positions }: R2PositionsParams) {
    super()
    this.total = total
    this.positions = positions
  }
}

jsonProperties(R2Positions, { total: 'Int', positions: { list: { class: R2Locator } } }, [], { required: ['total', 'positions'] })
