// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/CopyMode.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'

export class CopyMode extends KEnum {
  static readonly MOVE = new CopyMode('MOVE')
  static readonly COPY = new CopyMode('COPY')
  static readonly HARDLINK = new CopyMode('HARDLINK')
}
