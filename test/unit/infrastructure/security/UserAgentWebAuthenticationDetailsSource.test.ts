// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/UserAgentWebAuthenticationDetailsSourceOracleTest.kt
import { UserAgentWebAuthenticationDetailsSource } from '../../../../src/infrastructure/security/UserAgentWebAuthenticationDetailsSource.js'
import { oracle } from '../../oracle.js'
import { request } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/security/UserAgentWebAuthenticationDetailsSource')

const source = new UserAgentWebAuthenticationDetailsSource()

function build(headers: [string, string][] = [], remoteAddr = '127.0.0.1'): unknown[] {
  const it = source.buildDetails(request({ headers, remoteAddr }))
  return [it.constructor.name, it.remoteAddress, it.sessionId, it.userAgent]
}

func('buildDetails', () => {
  kase('no user agent', () => build())
  kase('user agent', () => build([['User-Agent', 'Mozilla/5.0 (X11; Linux x86_64)']]))
  kase('lower-case header', () => build([['user-agent', 'curl/8.0']]))
  kase('empty user agent', () => build([['User-Agent', '']]))
  kase('two user agents', () => build([['User-Agent', 'a'], ['User-Agent', 'b']]))
  kase('ipv6', () => build([], '0:0:0:0:0:0:0:1'))
  kase('forwarded for is ignored', () => build([['X-Forwarded-For', '1.2.3.4']], '10.0.0.1'))
  kase('unicode user agent', () => build([['User-Agent', 'Kobo ünï']]))
})
