// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kosync/dto/UserAuthenticationDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type UserAuthenticationDtoParams = {
  authorized?: string
}

export class UserAuthenticationDto extends DataClass<UserAuthenticationDtoParams> {
  readonly authorized: string

  constructor({ authorized = 'OK' }: UserAuthenticationDtoParams = {}) {
    super()
    this.authorized = authorized
  }
}

jsonProperties(UserAuthenticationDto, { authorized: 'String' })
