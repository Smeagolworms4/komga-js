// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/SessionExpiredDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type SessionExpiredDtoParams = {
  userId: string
}

export class SessionExpiredDto extends DataClass<SessionExpiredDtoParams> {
  readonly userId: string

  constructor({ userId }: SessionExpiredDtoParams) {
    super()
    this.userId = userId
  }
}

jsonProperties(SessionExpiredDto, { userId: 'String' }, [], { required: ['userId'] })
