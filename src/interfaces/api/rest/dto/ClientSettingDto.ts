// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ClientSettingDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { NotBlank, constraints } from '../../../../port/validation.js'

type ClientSettingDtoParams = {
  value: string
  allowUnauthorized: boolean | null
}

export class ClientSettingDto extends DataClass<ClientSettingDtoParams> {
  readonly value: string
  readonly allowUnauthorized: boolean | null

  constructor({ value, allowUnauthorized }: ClientSettingDtoParams) {
    super()
    this.value = value
    this.allowUnauthorized = allowUnauthorized
  }
}

type ClientSettingGlobalUpdateDtoParams = {
  value: string
  allowUnauthorized: boolean
}

export class ClientSettingGlobalUpdateDto extends DataClass<ClientSettingGlobalUpdateDtoParams> {
  readonly value: string
  readonly allowUnauthorized: boolean

  constructor({ value, allowUnauthorized }: ClientSettingGlobalUpdateDtoParams) {
    super()
    this.value = value
    this.allowUnauthorized = allowUnauthorized
  }
}

type ClientSettingUserUpdateDtoParams = {
  value: string
}

export class ClientSettingUserUpdateDto extends DataClass<ClientSettingUserUpdateDtoParams> {
  readonly value: string

  constructor({ value }: ClientSettingUserUpdateDtoParams) {
    super()
    this.value = value
  }
}

json(ClientSettingDto, { include: 'NON_NULL' })
jsonProperties(ClientSettingDto, { value: 'String', allowUnauthorized: { nullable: 'Boolean' } }, [], { required: ['value'] })
constraints(ClientSettingGlobalUpdateDto, { value: [NotBlank()] })
jsonProperties(ClientSettingGlobalUpdateDto, { value: 'String', allowUnauthorized: 'Boolean' }, [], { required: ['value', 'allowUnauthorized'] })
constraints(ClientSettingUserUpdateDto, { value: [NotBlank()] })
jsonProperties(ClientSettingUserUpdateDto, { value: 'String' }, [], { required: ['value'] })
