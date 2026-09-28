// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/SearchField.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'

/** @deprecated use SearchOperator.BeginsWith instead */
export class SearchField extends KEnum {
  static readonly TITLE = new SearchField('TITLE')
  static readonly TITLE_SORT = new SearchField('TITLE_SORT')
}
