// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/PasswordUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { NotBlank, constraints } from '../../../../port/validation.js'

type PasswordUpdateDtoParams = {
  password: string
}

export class PasswordUpdateDto extends DataClass<PasswordUpdateDtoParams> {
  readonly password: string

  constructor({ password }: PasswordUpdateDtoParams) {
    super()
    this.password = password
  }
}

constraints(PasswordUpdateDto, { password: [NotBlank()] })
jsonProperties(PasswordUpdateDto, { password: 'String' }, [], { required: ['password'] })
