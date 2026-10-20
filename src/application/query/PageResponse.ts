// @port-of komga/src/main/kotlin/org/gotson/komga/application/query/PageResponse.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { jsonProperties } from '../../port/jackson-mapper.js'
import { DataClass } from '../../port/kotlin.js'
import { openApiSchema } from '../../port/swagger-annotations.js'

type PageResponseParams<T> = {
  content: T[]
  page: number
  size: number
  totalElements: number // PORT: Long
  totalPages: number
}

// @Schema(description = "Paginated API response container")
export class PageResponse<T> extends DataClass<PageResponseParams<T>> {
  readonly content: T[]
  readonly page: number
  readonly size: number
  readonly totalElements: number
  readonly totalPages: number

  constructor({ content, page, size, totalElements, totalPages }: PageResponseParams<T>) {
    super()
    this.content = content
    this.page = page
    this.size = size
    this.totalElements = totalElements
    this.totalPages = totalPages
  }

  // @get:JsonProperty("first")
  get first(): boolean {
    return this.page === 0
  }

  // @get:JsonProperty("last")
  get last(): boolean {
    return this.page >= this.totalPages - 1 || this.totalPages === 0
  }
}

jsonProperties(
  PageResponse,
  { content: { list: { typeVar: 'T' } }, page: 'Int', size: 'Int', totalElements: 'Long', totalPages: 'Int' },
  ['T'],
  { required: ['content', 'page', 'size', 'totalElements', 'totalPages'], getters: ['first', 'last'] },
)
// PORT: exemples typés comme le fait swagger-core (valeur convertie selon le type de la propriété) ; type des getters
// `first` / `last` (Boolean) donné explicitement
openApiSchema(PageResponse, {
  description: 'Paginated API response container',
  properties: {
    content: { description: 'List of items contained in the current page', required: true },
    page: { description: 'Zero-based page index (0..N)', example: 0, required: true },
    size: { description: 'Number of items requested per page', example: 20, required: true },
    totalElements: { description: 'Total number of elements across all pages', example: 105, required: true },
    totalPages: { description: 'Total number of calculated pages', example: 6, required: true },
    first: { type: 'boolean', description: 'Indicates if the current page is the first page', example: true, required: true },
    last: { type: 'boolean', description: 'Indicates if the current page is the last page', example: false, required: true },
  },
})
