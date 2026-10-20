// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/query/PageResponseOracleTest.kt
import { PageResponse } from '../../../../src/application/query/PageResponse.js'
import { oracle } from '../../oracle.js'
import { mapper, stableText } from '../../web-oracle.js'

const { func, kase } = oracle('application/query/PageResponse')

const response = <T>(content: T[], page: number, size: number, totalElements: number, totalPages: number) => new PageResponse({ content, page, size, totalElements, totalPages })

const responses = new Map<string, PageResponse<unknown>>([
  ['first of many', response(['a'], 0, 20, 105, 6)],
  ['middle', response(['a'], 2, 20, 105, 6)],
  ['last', response(['a'], 5, 20, 105, 6)],
  ['beyond last', response([], 9, 20, 105, 6)],
  ['single page', response([1, 2], 0, 2, 2, 1)],
  ['empty', response([], 0, 20, 0, 0)],
  ['empty second page', response([], 1, 20, 0, 0)],
])

func('isFirst', () => {
  for (const [n, r] of responses) kase(n, () => r.first)
})
func('isLast', () => {
  for (const [n, r] of responses) kase(n, () => r.last)
})
func('json', () => {
  for (const [n, r] of responses) kase(n, () => stableText(mapper().writeValueAsString(r)))
})
