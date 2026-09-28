// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/PageHashKnown.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { KEnum } from '../../port/kotlin.js'
import type { Auditable } from './Auditable.js'
import { PageHash } from './PageHash.js'

type PageHashKnownParams = {
  hash: string
  size?: number | null
  action: PageHashKnown.Action
  deleteCount?: number
  matchCount?: number
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class PageHashKnown extends PageHash implements Auditable {
  readonly action: PageHashKnown.Action
  readonly deleteCount: number
  readonly matchCount: number
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    hash,
    size = null,
    action,
    deleteCount = 0,
    matchCount = 0,
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: PageHashKnownParams) {
    super({ hash: hash, size: size })
    this.action = action
    this.deleteCount = deleteCount
    this.matchCount = matchCount
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }

  copy({
    hash = this.hash,
    size = this.size,
    action = this.action,
    deleteCount = this.deleteCount,
    matchCount = this.matchCount,
  }: {
    hash?: string
    size?: number | null
    action?: PageHashKnown.Action
    deleteCount?: number
    matchCount?: number
  } = {}): PageHashKnown {
    return new PageHashKnown({
      hash: hash,
      size: size,
      action: action,
      deleteCount: deleteCount,
      matchCount: matchCount,
    })
  }
}

export namespace PageHashKnown {
  export class Action extends KEnum {
    static readonly DELETE_AUTO = new Action('DELETE_AUTO')
    static readonly DELETE_MANUAL = new Action('DELETE_MANUAL')
    static readonly IGNORE = new Action('IGNORE')
  }
}
