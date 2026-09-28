// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/AuthenticationActivity.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { DataClass } from '../../port/kotlin.js'

type AuthenticationActivityParams = {
  userId?: string | null
  email?: string | null
  apiKeyId?: string | null
  apiKeyComment?: string | null
  ip?: string | null
  userAgent?: string | null
  success: boolean
  error?: string | null
  dateTime?: LocalDateTime
  source?: string | null
}

export class AuthenticationActivity extends DataClass<AuthenticationActivityParams> {
  readonly userId: string | null
  readonly email: string | null
  readonly apiKeyId: string | null
  readonly apiKeyComment: string | null
  readonly ip: string | null
  readonly userAgent: string | null
  readonly success: boolean
  readonly error: string | null
  readonly dateTime: LocalDateTime
  readonly source: string | null

  constructor({
    userId = null,
    email = null,
    apiKeyId = null,
    apiKeyComment = null,
    ip = null,
    userAgent = null,
    success,
    error = null,
    dateTime = LocalDateTime.now(),
    source = null,
  }: AuthenticationActivityParams) {
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
