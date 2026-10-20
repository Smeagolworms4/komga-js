// @port-of komga/src/main/kotlin/org/gotson/komga/application/query/PageResult.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { DataClass } from '../../port/kotlin.js'
import type { Page, Pageable } from '../../port/spring-data.js'
import { PageResponse } from './PageResponse.js'

type PageResultParams<T> = {
  items: T[]
  totalElements: number // PORT: Long
}

export class PageResult<T> extends DataClass<PageResultParams<T>> {
  readonly items: T[]
  readonly totalElements: number

  constructor({ items, totalElements }: PageResultParams<T>) {
    super()
    this.items = items
    this.totalElements = totalElements
  }
}

// PORT: fonctions d'extension PageResult.toPageResponse(pageable[, transform])
export function toPageResponse<T, R = T>(self: PageResult<T>, pageable: Pageable, transform: (it: T) => R = (it) => it as unknown as R): PageResponse<R> {
  let totalPages: number
  if (self.totalElements === 0) totalPages = 0
  else if (pageable.isUnpaged) totalPages = 1
  else totalPages = Math.ceil(self.totalElements / pageable.pageSize) | 0

  return new PageResponse({
    content: self.items.map(transform),
    page: pageable.isUnpaged ? 0 : pageable.pageNumber,
    size: pageable.isUnpaged ? self.items.length : pageable.pageSize,
    totalElements: self.totalElements,
    totalPages: totalPages,
  })
}

// PORT: fonction d'extension Page.toPageResult()
export function toPageResult<T>(self: Page<T>): PageResult<T> {
  return new PageResult({ items: self.content, totalElements: self.totalElements })
}
