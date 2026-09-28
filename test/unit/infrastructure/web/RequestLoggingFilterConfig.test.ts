// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/RequestLoggingFilterConfigOracleTest.kt
import { RequestLoggingFilterConfig } from '../../../../src/infrastructure/web/RequestLoggingFilterConfig.js'
import type { HttpServletRequest } from '../../../../src/port/servlet.js'
import { oracle } from '../../oracle.js'
import { request } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/RequestLoggingFilterConfig')

const filter = new RequestLoggingFilterConfig().logFilter()

// PORT: champs privés de AbstractRequestLoggingFilter lus par réflexion côté Kotlin
const field = (name: string): unknown => (filter as unknown as Record<string, unknown>)[name]

const message = (req: HttpServletRequest): string =>
  (filter as unknown as { createMessage(r: HttpServletRequest, p: unknown, s: unknown): string }).createMessage(req, field('afterMessagePrefix'), field('afterMessageSuffix'))

func('logFilter', () => {
  kase('settings', () =>
    ['includeQueryString', 'includePayload', 'maxPayloadLength', 'includeHeaders', 'includeClientInfo', 'beforeMessagePrefix', 'afterMessagePrefix', 'afterMessageSuffix'].map((it) => [
      it,
      field(it),
    ]),
  )
  kase('message', () => message(request({ uri: '/api/v1/books' })))
  kase('message with query', () => message(request({ uri: '/api/v1/books', query: 'page=1&sort=a,b' })))
})
