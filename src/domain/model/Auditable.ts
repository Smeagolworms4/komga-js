// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/Auditable.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'

export interface Auditable {
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime
}
