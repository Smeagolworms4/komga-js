// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/EtagFilterConfigurationOracleTest.kt
import { EtagFilterConfiguration } from '../../../../src/infrastructure/web/EtagFilterConfiguration.js'
import type { HttpServletRequest, HttpServletResponse } from '../../../../src/port/servlet.js'
import { ShallowEtagHeaderFilter } from '../../../../src/port/spring-web-filter.js'
import { oracle } from '../../oracle.js'
import { describeResponse, request, response } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/EtagFilterConfiguration')

const bean = new EtagFilterConfiguration().shallowEtagHeaderFilter()
const filter = bean.filter

const shouldNotFilter = (uri: string): boolean => (filter as unknown as { shouldNotFilter(r: HttpServletRequest): boolean }).shouldNotFilter(request({ uri }))

async function run(uri: string, body = 'hello', headers: [string, string][] = []): Promise<unknown[]> {
  const res = response()
  await filter.doFilter(request({ uri, headers }), res, {
    async doFilter(_req: HttpServletRequest, r: HttpServletResponse) {
      r.setContentType('text/plain')
      // PORT: le corps est terminé explicitement (fin de la requête pour le conteneur de servlets)
      r.getOutputStream().end(body)
    },
  })
  return describeResponse(res)
}

func('shallowEtagHeaderFilter', () => {
  kase('url patterns', () => bean.urlPatterns)
  kase('name', () => bean.name)
  kase('order', () => bean.order)
  kase('is a ShallowEtagHeaderFilter', () => filter instanceof ShallowEtagHeaderFilter)
  kase('etag on api', () => run('/api/v1/books'))
  kase('etag on empty body', () => run('/api/v1/books', ''))
  kase('etag unicode body', () => run('/opds/v1.2/catalog', 'ünï 漫画'))
  kase('not modified', () => run('/api/v1/books', 'hello', [['If-None-Match', '"05d41402abc4b2a76b9719d911017c592"']]))
  kase('excluded file download', () => run('/api/v1/books/B1/file'))
})

func('shouldNotFilter', () => {
  for (const it of [
    '/api/v1/books/B1/file',
    '/api/v1/books/B1/file/',
    '/api/v1/books/B1/file/name.cbz',
    '/api/v1/books/B1/file/a/b',
    '/api/v1/books/B1/files',
    '/api/v1/books/B1/B2/file',
    '/api/v1/books//file',
    '/api/v1/books/B1',
    '/opds/v1.2/books/B1/file/x',
    '/opds/v2/books/B1/file',
    '/api/v1/readlists/R1/file',
    '/api/v1/series/S1/file',
    '/api/v1/collections/C1/file',
    '/kobo/KEY/v1/books/B1/file/epub',
    '/kobo/KEY/v1/books/B1/thumbnail',
    '/kobo/v1/books/B1/file',
    '/API/v1/books/B1/file',
    '/api/v1/books/B%201/file',
    '/',
  ])
    kase(it, () => shouldNotFilter(it))
})
