// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/AlternateTitle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'

type AlternateTitleParams = {
  label: string
  title: string
}

export class AlternateTitle extends DataClass<AlternateTitleParams> {
  readonly label: string
  readonly title: string

  constructor({ label, title }: AlternateTitleParams) {
    super()
    this.label = label
    this.title = title
  }
}
