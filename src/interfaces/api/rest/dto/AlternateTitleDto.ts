// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/AlternateTitleDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { AlternateTitle } from '../../../../domain/model/AlternateTitle.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type AlternateTitleDtoParams = {
  label: string
  title: string
}

export class AlternateTitleDto extends DataClass<AlternateTitleDtoParams> {
  readonly label: string
  readonly title: string

  constructor({ label, title }: AlternateTitleDtoParams) {
    super()
    this.label = label
    this.title = title
  }
}

export function toDto(self: AlternateTitle): AlternateTitleDto {
  return new AlternateTitleDto({ label: self.label, title: self.title })
}

jsonProperties(AlternateTitleDto, { label: 'String', title: 'String' }, [], { required: ['label', 'title'] })
