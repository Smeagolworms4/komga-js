// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/UnpagedSortedOracleTest.kt
import { UnpagedSorted } from '../../../../src/infrastructure/jooq/UnpagedSorted.js'
import { Order, Sort } from '../../../../src/port/spring-data.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/jooq/UnpagedSorted')

const p = new UnpagedSorted(Sort.by(Order.desc('a'), Order.asc('b')))
const unsorted = new UnpagedSorted(Sort.unsorted())

func('getPageNumber', () => {
  kase('throws', () => p.pageNumber)
  kase('unsorted throws', () => unsorted.pageNumber)
})
func('hasPrevious', () => {
  kase('false', () => p.hasPrevious())
})
func('getSort', () => {
  kase('sort', () => p.sort.toString())
  kase('orders', () => p.sort.toList().map((it) => [it.property, it.getDirection(), it.isIgnoreCase(), it.nullHandling]))
  kase('same instance', () => p.sort === p.sort)
  kase('unsorted', () => [unsorted.sort.isUnsorted, unsorted.sort.toString()])
  kase('getSortOr with sort', () => p.getSortOr(Sort.by('x')).toString())
  kase('getSortOr unsorted', () => unsorted.getSortOr(Sort.by('x')).toString())
})
func('isPaged', () => {
  kase('false', () => p.isPaged)
  kase('isUnpaged', () => p.isUnpaged)
})
func('next', () => {
  kase('same instance', () => p.next() === p)
})
func('getPageSize', () => {
  kase('throws', () => p.pageSize)
})
func('getOffset', () => {
  kase('throws', () => p.offset)
})
func('first', () => {
  kase('same instance', () => p.first() === p)
})
func('withPage', () => {
  kase('same instance', () => p.withPage(3) === p)
  kase('negative page', () => p.withPage(-1) === p)
})
func('previousOrFirst', () => {
  kase('same instance', () => p.previousOrFirst() === p)
  kase('chained', () => p.next().previousOrFirst().first().withPage(2).sort.toString())
})
