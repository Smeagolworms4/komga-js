// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/R2Device.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'

type R2DeviceParams = {
  id: string
  name: string
}

export class R2Device extends DataClass<R2DeviceParams> {
  readonly id: string
  readonly name: string

  constructor({ id, name }: R2DeviceParams) {
    super()
    this.id = id
    this.name = name
  }
}
