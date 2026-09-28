// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/ResourceContent.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../../port/kotlin.js'

type ResourceContentParams = {
  path: string
  content: string
}

export class ResourceContent extends DataClass<ResourceContentParams> {
  readonly path: string
  readonly content: string

  constructor({ path, content }: ResourceContentParams) {
    super()
    this.path = path
    this.content = content
  }
}
