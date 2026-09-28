// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/MetadataPatchTarget.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'

export class MetadataPatchTarget extends KEnum {
  static readonly BOOK = new MetadataPatchTarget('BOOK')
  static readonly SERIES = new MetadataPatchTarget('SERIES')
  static readonly READLIST = new MetadataPatchTarget('READLIST')
  static readonly COLLECTION = new MetadataPatchTarget('COLLECTION')
}
