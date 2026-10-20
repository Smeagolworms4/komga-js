// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/query/PageResultOracleTest.kt
import { PageResult, toPageResponse, toPageResult } from '../../../../src/application/query/PageResult.js'
import { PageImpl, PageRequest, Pageable } from '../../../../src/port/spring-data.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('application/query/PageResult')

const result = <T>(items: T[], totalElements: number) => new PageResult({ items, totalElements })
const items = result(['a', 'b', 'c'], 105)

func('toPageResponse@12', () => {
  kase('paged first page', () => toPageResponse(items, PageRequest.of(0, 20), (it) => it.toUpperCase()))
  kase('paged last page', () => toPageResponse(result(['x'], 41), PageRequest.of(2, 20), (it) => `${it}!`))
  kase('unpaged', () => toPageResponse(items, Pageable.unpaged(), (it) => it.length))
  kase('empty paged', () => toPageResponse(result<string>([], 0), PageRequest.of(0, 10), (it) => it))
  kase('empty unpaged', () => toPageResponse(result<string>([], 0), Pageable.unpaged(), (it) => it))
  kase('page beyond', () => toPageResponse(result<string>([], 5), PageRequest.of(3, 2), (it) => it))
  kase('exact pages', () => toPageResponse(result([1, 2], 4), PageRequest.of(1, 2), (it) => it * 10))
})
func('toPageResponse@29', () => {
  kase('identity', () => toPageResponse(items, PageRequest.of(1, 50)))
  kase('unpaged identity', () => toPageResponse(result([1], 1), Pageable.unpaged()))
})
func('toPageResult', () => {
  kase('paged', () => toPageResult(new PageImpl(['a', 'b'], PageRequest.of(1, 2), 9)))
  kase('unpaged', () => toPageResult(new PageImpl(['a', 'b'])))
  kase('empty', () => toPageResult(new PageImpl<string>([])))
})
