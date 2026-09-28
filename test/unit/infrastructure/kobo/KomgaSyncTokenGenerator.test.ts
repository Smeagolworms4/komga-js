// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/kobo/KomgaSyncTokenGeneratorOracleTest.kt
import { KomgaSyncToken } from '../../../../src/domain/model/KomgaSyncToken.js'
import { KomgaSyncTokenGenerator } from '../../../../src/infrastructure/kobo/KomgaSyncTokenGenerator.js'
import { oracle } from '../../oracle.js'
import { mapper, request } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/kobo/KomgaSyncTokenGenerator')

const generator = new KomgaSyncTokenGenerator(mapper())

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

const full = new KomgaSyncToken({ version: 3, rawKoboSyncToken: 'abc.def', ongoingSyncPointId: 'SP2', lastSuccessfulSyncPointId: 'SP1' })

func('fromBase64', () => {
  kase('komga token round trip', () => generator.fromBase64(generator.toBase64(full)))
  kase('komga default token round trip', () => generator.fromBase64(generator.toBase64(new KomgaSyncToken())))
  kase('komga token unicode', () => generator.fromBase64(generator.toBase64(new KomgaSyncToken({ rawKoboSyncToken: 'ünï 漫画 "quoted" \\ /' }))))
  kase('komga padded base64', () => generator.fromBase64(`KOMGA.${b64('{"version":2}')}`))
  kase('komga partial json', () => generator.fromBase64(`KOMGA.${b64('{"ongoingSyncPointId":"X"}')}`))
  kase('komga unknown property', () => generator.fromBase64(`KOMGA.${b64('{"unknown":1,"version":4}')}`))
  kase('komga case insensitive property', () => generator.fromBase64(`KOMGA.${b64('{"VERSION":5,"rawkobosynctoken":"r"}')}`))
  kase('komga null for non-null property', () => generator.fromBase64(`KOMGA.${b64('{"rawKoboSyncToken":null}')}`))
  kase('komga null for primitive', () => generator.fromBase64(`KOMGA.${b64('{"version":null}')}`))
  kase('komga version as string', () => generator.fromBase64(`KOMGA.${b64('{"version":"7"}')}`))
  kase('komga invalid base64', () => generator.fromBase64('KOMGA.!!!'))
  kase('komga url-safe base64', () => generator.fromBase64('KOMGA.-_-_'))
  kase('komga dotted payload', () => generator.fromBase64('KOMGA.abc.def'))
  kase('komga not json', () => generator.fromBase64(`KOMGA.${b64('hello')}`))
  kase('komga empty', () => generator.fromBase64('KOMGA.'))
  kase('komga json array', () => generator.fromBase64(`KOMGA.${b64('[1]')}`))
  kase('komga trailing content', () => generator.fromBase64(`KOMGA.${b64('{"version":2} x')}`))
  kase('calibre web token', () => generator.fromBase64(b64('{"data":{"raw_kobo_store_token":"store.token"}}')))
  kase('calibre web token number', () => generator.fromBase64(b64('{"data":{"raw_kobo_store_token":12}}')))
  kase('calibre web token decimal', () => generator.fromBase64(b64('{"data":{"raw_kobo_store_token":1.50}}')))
  kase('calibre web token boolean', () => generator.fromBase64(b64('{"data":{"raw_kobo_store_token":true}}')))
  kase('calibre web token null', () => generator.fromBase64(b64('{"data":{"raw_kobo_store_token":null}}')))
  kase('calibre web token object', () => generator.fromBase64(b64('{"data":{"raw_kobo_store_token":{"a":1}}}')))
  kase('calibre web token array', () => generator.fromBase64(b64('{"data":{"raw_kobo_store_token":[1]}}')))
  kase('calibre web missing data', () => generator.fromBase64(b64('{"other":1}')))
  kase('calibre web missing token', () => generator.fromBase64(b64('{"data":{}}')))
  kase('calibre web data not object', () => generator.fromBase64(b64('{"data":"x"}')))
  kase('calibre web json array', () => generator.fromBase64(b64('[1,2]')))
  kase('calibre web not json', () => generator.fromBase64(b64('not json')))
  kase('calibre web invalid base64', () => generator.fromBase64('%%%'))
  kase('empty string', () => generator.fromBase64(''))
  kase('kobo store token', () => generator.fromBase64('eyJhIjoxfQ.eyJiIjoyfQ'))
  kase('kobo store token single dot', () => generator.fromBase64('.'))
  kase('kobo store token any dotted string', () => generator.fromBase64('not base64 . at all'))
  kase('prefix only lower case', () => generator.fromBase64(`komga.${b64('{"version":2}')}`))
})

func('toBase64', () => {
  kase('default token', () => generator.toBase64(new KomgaSyncToken()))
  kase('full token', () => generator.toBase64(full))
  kase('unicode token', () => generator.toBase64(new KomgaSyncToken({ rawKoboSyncToken: 'ünï 漫画 "q" \\ / \n \u0001' })))
  kase('padding removed', () => [0, 1, 2, 3, 4, 5].map((it) => generator.toBase64(new KomgaSyncToken({ rawKoboSyncToken: 'x'.repeat(it) }))))
})

func('fromRequestHeaders', () => {
  kase('no header', () => generator.fromRequestHeaders(request()))
  kase('komga token', () => generator.fromRequestHeaders(request({ headers: [['X-Kobo-SyncToken', generator.toBase64(full)]] })))
  kase('header name case insensitive', () => generator.fromRequestHeaders(request({ headers: [['x-kobo-synctoken', 'a.b']] })))
  kase('empty header', () => generator.fromRequestHeaders(request({ headers: [['X-Kobo-SyncToken', '']] })))
  kase('two headers, first wins', () => generator.fromRequestHeaders(request({ headers: [['X-Kobo-SyncToken', 'first.one'], ['X-Kobo-SyncToken', 'second.one']] })))
})
