// @port-of komga/src/main/kotlin/org/gotson/komga/application/query/BuildPage.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { PageImpl, PageRequest, type Pageable, type Sort } from '../../port/spring-data.js'

export function buildPage<T>(items: T[], pageable: Pageable, count: number, sort: Sort | null): PageImpl<T> {
  return new PageImpl(
    items,
    pageable.isPaged
      ? PageRequest.of(pageable.pageNumber, pageable.pageSize, sort ?? pageable.sort)
      : PageRequest.of(0, Math.max(count, 20), sort ?? pageable.sort),
    count,
  )
}
