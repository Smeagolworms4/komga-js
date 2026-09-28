// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/AuthenticationActivityDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import type { AuthenticationActivity } from '../../../../domain/model/AuthenticationActivity.js'
import { toUTC } from '../../../../language/LanguageUtils.js'
import { jsonFormatLocalDateTime } from '../../../../port/jackson-format.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type AuthenticationActivityDtoParams = {
  userId: string | null
  email: string | null
  apiKeyId?: string | null
  apiKeyComment?: string | null
  ip: string | null
  userAgent: string | null
  success: boolean
  error: string | null
  dateTime: LocalDateTime
  source: string | null
}

export class AuthenticationActivityDto extends DataClass<AuthenticationActivityDtoParams> {
  readonly userId: string | null
  readonly email: string | null
  readonly apiKeyId: string | null
  readonly apiKeyComment: string | null
  readonly ip: string | null
  readonly userAgent: string | null
  readonly success: boolean
  readonly error: string | null
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly dateTime: LocalDateTime
  readonly source: string | null

  constructor({ userId, email, apiKeyId = null, apiKeyComment = null, ip, userAgent, success, error, dateTime, source }: AuthenticationActivityDtoParams) {
    super()
    this.userId = userId
    this.email = email
    this.apiKeyId = apiKeyId
    this.apiKeyComment = apiKeyComment
    this.ip = ip
    this.userAgent = userAgent
    this.success = success
    this.error = error
    this.dateTime = dateTime
    this.source = source
  }
}

export function toDto(self: AuthenticationActivity): AuthenticationActivityDto {
  return new AuthenticationActivityDto({
    userId: self.userId,
    email: self.email,
    apiKeyId: self.apiKeyId,
    apiKeyComment: self.apiKeyComment,
    ip: self.ip,
    userAgent: self.userAgent,
    success: self.success,
    error: self.error,
    dateTime: toUTC(self.dateTime),
    source: self.source,
  })
}

jsonProperties(
  AuthenticationActivityDto,
  {
    userId: { nullable: 'String' },
    email: { nullable: 'String' },
    apiKeyId: { nullable: 'String' },
    apiKeyComment: { nullable: 'String' },
    ip: { nullable: 'String' },
    userAgent: { nullable: 'String' },
    success: 'Boolean',
    error: { nullable: 'String' },
    dateTime: jsonFormatLocalDateTime("yyyy-MM-dd'T'HH:mm:ss'Z'"),
    source: { nullable: 'String' },
  },
  [],
  { required: ['success', 'dateTime'] },
)
