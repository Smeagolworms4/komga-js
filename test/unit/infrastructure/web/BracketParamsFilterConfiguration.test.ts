// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/BracketParamsFilterConfigurationOracleTest.kt
import { BracketParamsFilterConfiguration } from '../../../../src/infrastructure/web/BracketParamsFilterConfiguration.js'
import type { HttpServletRequest } from '../../../../src/port/servlet.js'
import { oracle } from '../../oracle.js'
import { request, response } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/BracketParamsFilterConfiguration')

const bean = new BracketParamsFilterConfiguration().bracketParamsFilter()

async function filter(query: string | null): Promise<unknown[]> {
  const seen: unknown[] = []
  await bean.filter.doFilter(request({ uri: '/api/v1/series', query }), response(), {
    async doFilter(r: HttpServletRequest) {
      seen.push(r.constructor.name)
      seen.push(r.getParameterValues('library_id'))
      seen.push(r.getParameter('library_id'))
    },
  })
  return seen
}

func('bracketParamsFilter', () => {
  kase('url patterns', () => bean.urlPatterns)
  kase('name', () => bean.name)
  kase('order', () => bean.order)
  kase('filter class', () => bean.filter.constructor.name)
  kase('new bean each call', () => new BracketParamsFilterConfiguration().bracketParamsFilter() !== bean)
})

func('doFilter', () => {
  kase('no parameter', () => filter(null))
  kase('plain parameter', () => filter('library_id=A'))
  kase('bracket parameter', () => filter('library_id[]=A&library_id[]=B'))
  kase('both', () => filter('library_id=A&library_id[]=B'))
  kase('null chain', () => (bean.filter as BracketParamsFilterConfiguration.BracketParamsFilter).doFilter(request(), response(), null))
})
