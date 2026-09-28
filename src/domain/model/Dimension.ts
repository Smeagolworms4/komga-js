// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/Dimension.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../port/jackson-mapper.js'
import { DataClass } from '../../port/kotlin.js'

type DimensionParams = {
  width: number
  height: number
}

export class Dimension extends DataClass<DimensionParams> {
  readonly width: number
  readonly height: number

  constructor({ width, height }: DimensionParams) {
    super()
    this.width = width
    this.height = height
  }
}

jsonProperties(Dimension, { width: 'Int', height: 'Int' }, [], { required: ['width', 'height'] })
