// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/Sidecar.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import { DataClass, KEnum } from '../../port/kotlin.js'

type SidecarParams = {
  url: URL
  parentUrl: URL
  lastModifiedTime: LocalDateTime
  type: Sidecar.Type
  source: Sidecar.Source
}

export class Sidecar extends DataClass<SidecarParams> {
  readonly url: URL
  readonly parentUrl: URL
  readonly lastModifiedTime: LocalDateTime
  readonly type: Sidecar.Type
  readonly source: Sidecar.Source

  constructor({ url, parentUrl, lastModifiedTime, type, source }: SidecarParams) {
    super()
    this.url = url
    this.parentUrl = parentUrl
    this.lastModifiedTime = lastModifiedTime
    this.type = type
    this.source = source
  }
}

export namespace Sidecar {
  export class Type extends KEnum {
    static readonly ARTWORK = new Type('ARTWORK')
    static readonly METADATA = new Type('METADATA')
  }

  export class Source extends KEnum {
    static readonly SERIES = new Source('SERIES')
    static readonly BOOK = new Source('BOOK')
  }
}

type SidecarStoredParams = {
  url: URL
  parentUrl: URL
  lastModifiedTime: LocalDateTime
  libraryId: string
}

export class SidecarStored extends DataClass<SidecarStoredParams> {
  readonly url: URL
  readonly parentUrl: URL
  readonly lastModifiedTime: LocalDateTime
  readonly libraryId: string

  constructor({ url, parentUrl, lastModifiedTime, libraryId }: SidecarStoredParams) {
    super()
    this.url = url
    this.parentUrl = parentUrl
    this.lastModifiedTime = lastModifiedTime
    this.libraryId = libraryId
  }
}
