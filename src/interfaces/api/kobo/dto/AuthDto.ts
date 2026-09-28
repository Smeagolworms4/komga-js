// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/AuthDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type AuthDtoParams = {
  accessToken: string
  refreshToken: string
  tokenType?: string
  trackingId: string
  userKey: string
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class AuthDto extends DataClass<AuthDtoParams> {
  readonly accessToken: string
  readonly refreshToken: string
  readonly tokenType: string
  readonly trackingId: string
  readonly userKey: string

  constructor({
    accessToken,
    refreshToken,
    tokenType = 'Bearer',
    trackingId,
    userKey,
  }: AuthDtoParams) {
    super()
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this.tokenType = tokenType
    this.trackingId = trackingId
    this.userKey = userKey
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(AuthDto, { rename: { accessToken: 'AccessToken', refreshToken: 'RefreshToken', tokenType: 'TokenType', trackingId: 'TrackingId', userKey: 'UserKey' } })
jsonProperties(
  AuthDto,
  {
    accessToken: 'String',
    refreshToken: 'String',
    tokenType: 'String',
    trackingId: 'String',
    userKey: 'String',
  },
  [],
  { required: ['accessToken', 'refreshToken', 'trackingId', 'userKey'] },
)
