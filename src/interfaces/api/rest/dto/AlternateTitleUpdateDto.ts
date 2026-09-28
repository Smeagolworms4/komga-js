// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/AlternateTitleUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { NotBlank, constraints } from '../../../../port/validation.js'

type AlternateTitleUpdateDtoParams = {
  label?: string | null
  title?: string | null
}

// PORT: classe Kotlin sans constructeur principal, dont Jackson affecte les propriétés après construction ;
// le constructeur reçoit ici les propriétés lues
export class AlternateTitleUpdateDto {
  readonly label: string | null

  readonly title: string | null

  constructor({ label = null, title = null }: AlternateTitleUpdateDtoParams = {}) {
    this.label = label
    this.title = title
  }
}

constraints(AlternateTitleUpdateDto, {
  label: [NotBlank()],
  title: [NotBlank()],
})
jsonProperties(AlternateTitleUpdateDto, { label: { nullable: 'String' }, title: { nullable: 'String' } })
