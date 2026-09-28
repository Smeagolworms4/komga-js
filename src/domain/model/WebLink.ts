// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/WebLink.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { URI } from '../../port/java-net.js'
import { DataClass } from '../../port/kotlin.js'

type WebLinkParams = {
  label: string
  url: URI
}

export class WebLink extends DataClass<WebLinkParams> {
  readonly label: string
  readonly url: URI

  constructor({ label, url }: WebLinkParams) {
    super()
    this.label = label
    this.url = url
  }
}
