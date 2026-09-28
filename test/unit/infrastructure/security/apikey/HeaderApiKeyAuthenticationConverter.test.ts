// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/apikey/HeaderApiKeyAuthenticationConverterOracleTest.kt
import { HeaderApiKeyAuthenticationConverter } from '../../../../../src/infrastructure/security/apikey/HeaderApiKeyAuthenticationConverter.js'
import { oracle } from '../../../oracle.js'
import { describeAuthentication, request } from '../../../web-oracle.js'
import { describeDetails, detailsSource, hasher, tokenEncoder } from './support.js'

const { func, kase } = oracle('infrastructure/security/apikey/HeaderApiKeyAuthenticationConverter')

const converter = new HeaderApiKeyAuthenticationConverter('X-API-Key', hasher, tokenEncoder, detailsSource)

function convert(...headers: [string, string][]): unknown {
  const it = converter.convert(request({ headers, remoteAddr: '10.0.0.2' }))
  return it === null ? null : [...describeAuthentication(it)!, describeDetails(it.details)]
}

func('convert', () => {
  kase('no header', () => convert())
  kase('other header', () => convert(['X-Auth-User', 'key']))
  kase('key', () => convert(['X-API-Key', 'key-one']))
  kase('header name case', () => convert(['x-api-key', 'key-one']))
  kase('empty key', () => convert(['X-API-Key', '']))
  kase('blank key', () => convert(['X-API-Key', '  ']))
  kase('unicode key', () => convert(['X-API-Key', 'clé-漫画']))
  kase('long key', () => convert(['X-API-Key', 'k'.repeat(1000)]))
  kase('user agent', () => convert(['X-API-Key', 'abc'], ['User-Agent', 'Kobo Touch/4.38']))
  kase('two headers', () => convert(['X-API-Key', 'first'], ['X-API-Key', 'second']))
  kase('other converter header', () => {
    const it = new HeaderApiKeyAuthenticationConverter('X-Auth-User', hasher, tokenEncoder, detailsSource).convert(request({ headers: [['X-Auth-User', 'koreader']] }))
    return it === null ? null : describeAuthentication(it)
  })
})
