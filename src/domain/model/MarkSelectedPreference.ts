// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/MarkSelectedPreference.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'

export class MarkSelectedPreference extends KEnum {
  static readonly NO = new MarkSelectedPreference('NO')
  static readonly YES = new MarkSelectedPreference('YES')
  static readonly IF_NONE_OR_GENERATED = new MarkSelectedPreference('IF_NONE_OR_GENERATED')
}
