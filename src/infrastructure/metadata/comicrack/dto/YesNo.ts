// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/dto/YesNo.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { KEnum, associateBy, lazy } from '../../../../port/kotlin.js'

export class YesNo extends KEnum {
  static readonly UNKNOWN = new YesNo('UNKNOWN', 'Unknown')
  static readonly NO = new YesNo('NO', 'No')
  static readonly YES = new YesNo('YES', 'Yes')

  private constructor(
    name: string,
    readonly value: string,
  ) {
    super(name)
  }

  // companion object
  private static get map(): Map<string, YesNo> {
    return lazy(YesNo, 'map', () => associateBy(YesNo.entries(), (it) => it.value))
  }

  // @JsonCreator
  static fromValue(value: string): YesNo | null {
    return YesNo.map.get(value) ?? null
  }
}

json(YesNo, { creator: (value) => YesNo.fromValue(value) })
