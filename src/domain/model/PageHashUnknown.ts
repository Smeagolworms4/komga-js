// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/PageHashUnknown.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { PageHash } from './PageHash.js'

type PageHashUnknownParams = {
  hash: string
  size?: number | null
  matchCount?: number
}

export class PageHashUnknown extends PageHash {
  readonly matchCount: number

  constructor({ hash, size = null, matchCount = 0 }: PageHashUnknownParams) {
    super({ hash: hash, size: size })
    this.matchCount = matchCount
  }
}
