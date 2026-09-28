// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ReadList.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { type SortedMap, sortedMapOf } from '../../port/extra-metadata.js'
import { DataClass } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import type { Auditable } from './Auditable.js'

type ReadListParams = {
  name: string
  summary?: string
  ordered?: boolean
  bookIds?: SortedMap<number, string>
  id?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
  filtered?: boolean
}

export class ReadList extends DataClass<ReadListParams> implements Auditable {
  readonly name: string
  readonly summary: string
  /**
   * Indicates whether the read list is ordered manually
   */
  readonly ordered: boolean
  readonly bookIds: SortedMap<number, string>
  readonly id: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime
  /**
   * Indicates that the bookIds have been filtered and is not exhaustive.
   */
  readonly filtered: boolean

  constructor({
    name,
    summary = '',
    ordered = true,
    bookIds = sortedMapOf(),
    id = TsidCreator.getTsid256().toString(),
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
    filtered = false,
  }: ReadListParams) {
    super()
    this.name = name
    this.summary = summary
    this.ordered = ordered
    this.bookIds = bookIds
    this.id = id
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
    this.filtered = filtered
  }
}
