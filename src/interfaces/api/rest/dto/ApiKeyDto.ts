// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ApiKeyDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import type { ApiKey } from '../../../../domain/model/ApiKey.js'
import { toUTCZoned } from '../../../../language/LanguageUtils.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ApiKeyDtoParams = {
  id: string
  userId: string
  key: string
  comment: string
  createdDate: ZonedDateTime
  lastModifiedDate: ZonedDateTime
}

export class ApiKeyDto extends DataClass<ApiKeyDtoParams> {
  readonly id: string
  readonly userId: string
  readonly key: string
  readonly comment: string
  readonly createdDate: ZonedDateTime
  readonly lastModifiedDate: ZonedDateTime

  constructor({ id, userId, key, comment, createdDate, lastModifiedDate }: ApiKeyDtoParams) {
    super()
    this.id = id
    this.userId = userId
    this.key = key
    this.comment = comment
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }
}

export function toDto(self: ApiKey): ApiKeyDto {
  return new ApiKeyDto({
    id: self.id,
    userId: self.userId,
    key: self.key,
    comment: self.comment,
    createdDate: toUTCZoned(self.createdDate),
    // UPSTREAM-BUG: lastModifiedDate reprend createdDate
    lastModifiedDate: toUTCZoned(self.createdDate),
  })
}

export function redacted(self: ApiKeyDto): ApiKeyDto {
  return self.copy({ key: '*'.repeat(6) })
}

jsonProperties(
  ApiKeyDto,
  { id: 'String', userId: 'String', key: 'String', comment: 'String', createdDate: JsonTypes.ZonedDateTime, lastModifiedDate: JsonTypes.ZonedDateTime },
  [],
  { required: ['id', 'userId', 'key', 'comment', 'createdDate', 'lastModifiedDate'] },
)
