// @port-of komga/src/main/kotlin/org/gotson/komga/application/query/PageableExtension.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import type { Pageable } from '../../port/spring-data.js'

// PORT: fonction d'extension Pageable.isEmpty()
export function isEmpty(pageable: Pageable): boolean {
  return pageable.isPaged && pageable.pageSize === 0
}
