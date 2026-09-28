// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BookAction.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'

export class BookAction extends KEnum {
  static readonly REFRESH_METADATA = new BookAction('REFRESH_METADATA')
  static readonly GENERATE_THUMBNAIL = new BookAction('GENERATE_THUMBNAIL')
}
