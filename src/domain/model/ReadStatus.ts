// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ReadStatus.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'

export class ReadStatus extends KEnum {
  static readonly UNREAD = new ReadStatus('UNREAD')
  static readonly READ = new ReadStatus('READ')
  static readonly IN_PROGRESS = new ReadStatus('IN_PROGRESS')
}
