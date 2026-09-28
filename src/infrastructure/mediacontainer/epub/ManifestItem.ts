// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/ManifestItem.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../../port/kotlin.js'

type ManifestItemParams = {
  id: string
  href: string
  mediaType: string
  properties?: ReadonlySet<string>
}

export class ManifestItem extends DataClass<ManifestItemParams> {
  readonly id: string
  readonly href: string
  readonly mediaType: string
  readonly properties: ReadonlySet<string>

  constructor({ id, href, mediaType, properties = new Set() }: ManifestItemParams) {
    super()
    this.id = id
    this.href = href
    this.mediaType = mediaType
    this.properties = properties
  }
}
