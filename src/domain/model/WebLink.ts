// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/WebLink.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'

type WebLinkParams = {
  label: string
  url: URL // PORT: java.net.URI -> URL (URI absolue)
}

export class WebLink extends DataClass<WebLinkParams> {
  readonly label: string
  readonly url: URL // PORT: java.net.URI -> URL (URI absolue)

  constructor({ label, url }: WebLinkParams) {
    super()
    this.label = label
    this.url = url
  }
}
