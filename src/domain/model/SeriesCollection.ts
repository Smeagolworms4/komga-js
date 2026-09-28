// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/SeriesCollection.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { DataClass } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import type { Auditable } from './Auditable.js'

type SeriesCollectionParams = {
  name: string
  ordered?: boolean
  seriesIds?: string[]
  id?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
  filtered?: boolean
}

export class SeriesCollection extends DataClass<SeriesCollectionParams> implements Auditable {
  readonly name: string
  /**
   * Indicates whether the collection is ordered manually
   */
  readonly ordered: boolean
  readonly seriesIds: string[]
  readonly id: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime
  /**
   * Indicates that the seriesIds have been filtered and is not exhaustive.
   */
  readonly filtered: boolean

  constructor({
    name,
    ordered = false,
    seriesIds = [],
    id = TsidCreator.getTsid256().toString(),
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
    filtered = false,
  }: SeriesCollectionParams) {
    super()
    this.name = name
    this.ordered = ordered
    this.seriesIds = seriesIds
    this.id = id
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
    this.filtered = filtered
  }
}
