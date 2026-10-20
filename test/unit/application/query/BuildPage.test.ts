// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/query/BuildPageOracleTest.kt
import { buildPage } from '../../../../src/application/query/BuildPage.js'
import { UnpagedSorted } from '../../../../src/application/query/UnpagedSorted.js'
import { Order, type Page, PageRequest, Pageable, Sort } from '../../../../src/port/spring-data.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('application/query/BuildPage')

const page = (p: Page<unknown>) => [p, p.totalPages, p.sort.toString(), p.pageable.isPaged, p.hasNext()]

func('buildPage', () => {
  kase('paged, sort from pageable', () => page(buildPage(['a', 'b'], PageRequest.of(1, 2, Sort.by('title')), 10, null)))
  kase('paged, explicit sort', () => page(buildPage(['a'], PageRequest.of(0, 5, Sort.by('title')), 1, Sort.by(Order.desc('age')))))
  kase('paged, count smaller than page', () => page(buildPage(['a', 'b', 'c'], PageRequest.of(2, 10), 5, null)))
  kase('paged, empty content', () => page(buildPage([], PageRequest.of(3, 10), 5, null)))
  kase('unpaged, small count', () => page(buildPage(['a'], Pageable.unpaged(), 5, null)))
  kase('unpaged, large count', () =>
    page(
      buildPage(
        Array.from({ length: 30 }, (_, i) => `x${i}`),
        Pageable.unpaged(),
        30,
        Sort.by('id'),
      ),
    ),
  )
  kase('unpaged, count 20', () => page(buildPage([], Pageable.unpaged(), 20, null)))
  kase('unpaged, zero count', () => page(buildPage([], Pageable.unpaged(), 0, null)))
  kase('unpaged sorted', () => page(buildPage([1, 2, 3], new UnpagedSorted(Sort.by(Order.asc('seriesId'), Order.desc('number'))), 3, null)))
  kase('unpaged sorted, explicit sort', () => page(buildPage([1], new UnpagedSorted(Sort.by('a')), 1, Sort.unsorted())))
  kase('unpaged sorted, large count', () => page(buildPage([1], new UnpagedSorted(Sort.unsorted()), 25, null)))
})
