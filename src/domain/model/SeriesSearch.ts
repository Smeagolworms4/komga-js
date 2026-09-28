// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/SeriesSearch.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { registerClass } from '../../port/jackson.js'
import { json } from '../../port/jackson.js'
import { DataClass } from '../../port/kotlin.js'
import { jsonProperties } from '../../port/extra-search.js'
import { SearchCondition } from './SearchCondition.js'
import type { SearchField } from './SearchField.js'

type SeriesSearchParams = {
  condition?: SearchCondition.Series | null
  fullTextSearch?: string | null
  regexSearch?: [string, SearchField] | null
}

export class SeriesSearch extends DataClass<SeriesSearchParams> {
  readonly condition: SearchCondition.Series | null
  readonly fullTextSearch: string | null
  /** @deprecated Used for backward compatibility only, use SearchOperator.BeginsWith instead */
  // PORT: Pair<String, SearchField> → tuple
  readonly regexSearch: [string, SearchField] | null

  constructor({ condition = null, fullTextSearch = null, regexSearch = null }: SeriesSearchParams = {}) {
    super()
    this.condition = condition
    this.fullTextSearch = fullTextSearch
    this.regexSearch = regexSearch
  }
}

json(SeriesSearch, { include: 'NON_NULL', ignore: ['regexSearch'] })
// PORT: types des propriétés (réflexion Kotlin utilisée par Jackson) ; regexSearch est @JsonIgnore
jsonProperties(SeriesSearch, { condition: { nullable: { class: SearchCondition.Series } }, fullTextSearch: { nullable: 'String' } })

registerClass('org.gotson.komga.domain.model.SeriesSearch', SeriesSearch)
