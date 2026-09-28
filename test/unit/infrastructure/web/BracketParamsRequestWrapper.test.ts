// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/BracketParamsRequestWrapperOracleTest.kt
import { BracketParamsRequestWrapper } from '../../../../src/infrastructure/web/BracketParamsRequestWrapper.js'
import { oracle } from '../../oracle.js'
import { request } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/BracketParamsRequestWrapper')

const wrap = (query: string | null) => new BracketParamsRequestWrapper(request({ query }))

const queries = [null, 'a=1', 'a[]=1', 'a=1&a[]=2', 'a[]=2&a=1', 'a=1&a=2&a[]=3&a[]=4', 'a[]=&a=', 'a[][]=1', 'b=x&a[]=1&c[]=y&a=2', '%5B%5D=1', 'a%5B%5D=1']

func('getParameter', () => {
  for (const q of queries) kase(`${q}`, () => [wrap(q).getParameter('a'), wrap(q).getParameter('a[]'), wrap(q).getParameter('a[][]'), wrap(q).getParameter('')])
})

func('getParameterValues', () => {
  for (const q of queries)
    kase(`${q}`, () => [wrap(q).getParameterValues('a'), wrap(q).getParameterValues('a[]'), wrap(q).getParameterValues('a[][]'), wrap(q).getParameterValues('')])
})

func('getParameterNames', () => {
  for (const q of queries) kase(`${q}`, () => wrap(q).getParameterNames())
})

func('getParameterMap', () => {
  for (const q of queries) kase(`${q}`, () => wrap(q).getParameterMap())
})
