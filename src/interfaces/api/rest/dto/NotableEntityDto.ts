// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/NotableEntityDto.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import type { NotableEntity } from '../../../../domain/model/NotableEntity.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type NotableEntityDtoParams = {
  kind: string
  name: string
}

export class NotableEntityDto extends DataClass<NotableEntityDtoParams> {
  readonly kind: string
  readonly name: string

  constructor({ kind, name }: NotableEntityDtoParams) {
    super()
    this.kind = kind
    this.name = name
  }
}

export function toDto(self: NotableEntity): NotableEntityDto {
  return new NotableEntityDto({ kind: self.kind, name: self.name })
}

jsonProperties(NotableEntityDto, { kind: 'String', name: 'String' }, [], { required: ['kind', 'name'] })
