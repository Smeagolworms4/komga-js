// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BookSearch.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json, registerClass } from '../../port/jackson.js'
import { DataClass } from '../../port/kotlin.js'
import { jsonProperties } from '../../port/extra-search.js'
import { SearchCondition } from './SearchCondition.js'

type BookSearchParams = {
  condition?: SearchCondition.Book | null
  fullTextSearch?: string | null
}

export class BookSearch extends DataClass<BookSearchParams> {
  readonly condition: SearchCondition.Book | null
  readonly fullTextSearch: string | null

  constructor({ condition = null, fullTextSearch = null }: BookSearchParams = {}) {
    super()
    this.condition = condition
    this.fullTextSearch = fullTextSearch
  }
}

json(BookSearch, { include: 'NON_NULL' })
// PORT: types des propriétés (réflexion Kotlin utilisée par Jackson)
jsonProperties(BookSearch, { condition: { nullable: { class: SearchCondition.Book } }, fullTextSearch: { nullable: 'String' } })

// PORT: nom qualifié de la classe Kotlin (messages de Jackson)
registerClass('org.gotson.komga.domain.model.BookSearch', BookSearch)
