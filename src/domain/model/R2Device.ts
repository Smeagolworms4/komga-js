// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/R2Device.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { registerClass } from '../../port/jackson.js'
import { jsonProperties } from '../../port/jackson-mapper.js'
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

// PORT: types des propriétés (réflexion Kotlin utilisée par Jackson)
jsonProperties(R2Device, { id: 'String', name: 'String' }, [], { required: ['id', 'name'] })

// PORT: nom qualifié de la classe Kotlin (messages de Jackson)
registerClass('org.gotson.komga.domain.model.R2Device', R2Device)
