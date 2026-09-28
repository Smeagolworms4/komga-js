// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ApiKey.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { DataClass } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import type { Auditable } from './Auditable.js'

type ApiKeyParams = {
  id?: string
  userId: string
  key: string
  comment: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class ApiKey extends DataClass<ApiKeyParams> implements Auditable {
  readonly id: string
  readonly userId: string
  readonly key: string
  readonly comment: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    id = TsidCreator.getTsid256().toString(),
    userId,
    key,
    comment,
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: ApiKeyParams) {
    super()
    this.id = id
    this.userId = userId
    this.key = key
    this.comment = comment
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }
}
