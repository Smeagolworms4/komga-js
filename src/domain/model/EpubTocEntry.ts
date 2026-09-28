// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/EpubTocEntry.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'

type EpubTocEntryParams = {
  title: string
  href: string | null
  children?: EpubTocEntry[]
}

export class EpubTocEntry extends DataClass<EpubTocEntryParams> {
  readonly title: string
  readonly href: string | null
  readonly children: EpubTocEntry[]

  constructor({ title, href, children = [] }: EpubTocEntryParams) {
    super()
    this.title = title
    this.href = href
    this.children = children
  }
}
