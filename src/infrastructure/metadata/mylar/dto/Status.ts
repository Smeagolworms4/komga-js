// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/mylar/dto/Status.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../../../port/kotlin.js'

export class Status extends KEnum {
  static readonly Ended = new Status('Ended')
  static readonly Continuing = new Status('Continuing')
}
