// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/KoboMissingPortFilterOracleTest.kt
import { KoboMissingPortFilter } from '../../../../src/infrastructure/web/KoboMissingPortFilter.js'
import type { FilterChain, HttpServletRequest, HttpServletResponse } from '../../../../src/port/servlet.js'
import { oracle } from '../../oracle.js'
import { request, response } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/KoboMissingPortFilter')

// PORT: méthodes protégées ou privées appelées par réflexion côté Kotlin
const call = (filter: KoboMissingPortFilter, name: string, ...args: unknown[]): unknown =>
  (filter as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!.apply(filter, args)

async function seenPort(port: number | null, req: HttpServletRequest, nested = false): Promise<unknown[]> {
  const seen: unknown[] = []
  const res = response()
  const chain: FilterChain = {
    async doFilter(r: HttpServletRequest) {
      seen.push(r.serverPort)
    },
  }
  const filter = new KoboMissingPortFilter(() => port)
  if (nested) await call(filter, 'doFilterNestedErrorDispatch', req, res, chain)
  else await filter.doFilter(req, res, chain)
  return [seen, res.status]
}

const filter = new KoboMissingPortFilter(() => 1234)

func('shouldNotFilter', () => {
  kase('no header', () => call(filter, 'shouldNotFilter', request()))
  for (const [h, v] of [['Forwarded', 'for=1.2.3.4'], ['X-Forwarded-Host', 'example.org'], ['X-Forwarded-Port', '8443'], ['X-Forwarded-Proto', 'https'], ['X-Forwarded-Prefix', '/prefix'], ['X-Forwarded-Ssl', 'on'], ['X-Forwarded-For', '1.2.3.4'], ['x-forwarded-host', 'example.org'], ['X-Real-IP', '1.2.3.4'], ['X-Forwarded-Server', 'proxy']] as [string, string][])
    kase(h, () => call(filter, 'shouldNotFilter', request({ headers: [[h, v]] })))
  kase('empty header value', () => call(filter, 'shouldNotFilter', request({ headers: [['X-Forwarded-Port', '']] })))
})

func('shouldNotFilterAsyncDispatch', () => {
  kase('false', () => call(filter, 'shouldNotFilterAsyncDispatch'))
})

func('shouldNotFilterErrorDispatch', () => {
  kase('false', () => call(filter, 'shouldNotFilterErrorDispatch'))
})

func('doFilterInternal', () => {
  kase('port supplied', () => seenPort(1234, request({ uri: '/kobo/k/v1/library/sync' })))
  kase('no port supplied, request port', () => seenPort(null, request({ uri: '/kobo/k', port: 8080 })))
  kase('no port supplied, default port', () => seenPort(null, request({ uri: '/kobo/k' })))
  kase('port supplied, https request', () => seenPort(25600, request({ uri: '/kobo/k', scheme: 'https', port: 443 })))
  kase('forwarded header: not filtered', () => seenPort(1234, request({ uri: '/kobo/k', port: 8080, headers: [['X-Forwarded-For', '1.2.3.4']] })))
  kase('port 0 supplied', () => seenPort(0, request({ uri: '/kobo/k', port: 8080 })))
})

func('doFilterNestedErrorDispatch', () => {
  kase('port supplied', () => seenPort(4321, request({ uri: '/kobo/k' }), true))
  kase('no port supplied', () => seenPort(null, request({ uri: '/kobo/k', port: 9000 }), true))
})

func('formatRequest', () => {
  kase('get', () => call(filter, 'formatRequest', request({ uri: '/kobo/k/v1/library/sync' })))
  kase('post with encoded uri', () => call(filter, 'formatRequest', request({ method: 'POST', uri: '/kobo/a%20b/%C3%BC' })))
})

func('getServerPort', () => {
  kase('supplier called on each access', async () => {
    let n = 0
    const seen: number[] = []
    await new KoboMissingPortFilter(() => ++n).doFilter(request(), response(), {
      async doFilter(r: HttpServletRequest) {
        seen.push(r.serverPort)
        seen.push(r.serverPort)
      },
    })
    return seen
  })
  kase('other properties unchanged', async () => {
    const seen: unknown[] = []
    await new KoboMissingPortFilter(() => 1).doFilter(request({ uri: '/kobo/x', scheme: 'https', host: 'example.org', port: 8443 }), response(), {
      async doFilter(r: HttpServletRequest, _res: HttpServletResponse) {
        seen.push(r.serverPort, r.serverName, r.scheme, r.requestURI, r.requestURL, r.isSecure)
      },
    })
    return seen
  })
})
