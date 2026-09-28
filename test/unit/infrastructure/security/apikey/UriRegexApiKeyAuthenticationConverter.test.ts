// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/apikey/UriRegexApiKeyAuthenticationConverterOracleTest.kt
import { UriRegexApiKeyAuthenticationConverter } from '../../../../../src/infrastructure/security/apikey/UriRegexApiKeyAuthenticationConverter.js'
import { oracle } from '../../../oracle.js'
import { describeAuthentication, request } from '../../../web-oracle.js'
import { describeDetails, detailsSource, hasher, tokenEncoder } from './support.js'

const { func, kase } = oracle('infrastructure/security/apikey/UriRegexApiKeyAuthenticationConverter')

const converter = new UriRegexApiKeyAuthenticationConverter(/\/kobo\/([\w-]+)/, hasher, tokenEncoder, detailsSource)

function convert(uri: string, c: UriRegexApiKeyAuthenticationConverter = converter): unknown {
  const it = c.convert(request({ uri, headers: [['User-Agent', 'Kobo']], remoteAddr: '0:0:0:0:0:0:0:1' }))
  return it === null ? null : [...describeAuthentication(it)!, describeDetails(it.details)]
}

func('convert', () => {
  for (const uri of [
    '/kobo/key-one/v1/library/sync',
    '/kobo/key-one',
    '/kobo/',
    '/kobo',
    '/api/v1/books',
    '/kobo/abc_DEF-123/v1',
    '/kobo/a.b/v1',
    '/kobo/%20x/v1',
    '/kobo/%C3%A9t%C3%A9/v1',
    '/prefix/kobo/key/v1',
    '/kobo/k1/kobo/k2',
    '/KOBO/key/v1',
    '/kobo/-/v1',
  ])
    kase(uri, () => convert(uri))
  kase('regex with two groups: last group', () => convert('/kobo/abc/def', new UriRegexApiKeyAuthenticationConverter(/\/kobo\/(\w+)\/(\w+)/, hasher, tokenEncoder, detailsSource)))
  kase('regex without group: whole match', () => convert('/kobo/abc/def', new UriRegexApiKeyAuthenticationConverter(/\/kobo\/\w+/, hasher, tokenEncoder, detailsSource)))
  kase('optional group not matched', () => convert('/kobo/', new UriRegexApiKeyAuthenticationConverter(/\/kobo\/(\w+)?/, hasher, tokenEncoder, detailsSource)))
})
