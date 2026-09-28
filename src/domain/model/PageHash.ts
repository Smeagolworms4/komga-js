// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/PageHash.kt@65981e600edb24944ffaae4818ff2716a5fa08dd

export type PageHashParams = {
  hash: string
  size?: number | null
}

export class PageHash {
  readonly hash: string
  readonly size: number | null

  constructor({ hash, size = null }: PageHashParams) {
    this.hash = hash
    this.size = size !== null && size < 0 ? null : size
  }
}
