// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/kobo/KoboProxyOracleTest.kt
import { KomgaSyncToken } from '../../../../src/domain/model/KomgaSyncToken.js'
import { KoboProxy } from '../../../../src/infrastructure/kobo/KoboProxy.js'
import { KomgaSyncTokenGenerator } from '../../../../src/infrastructure/kobo/KomgaSyncTokenGenerator.js'
import type { ResponseEntity } from '../../../../src/port/spring-web.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { describeEntity, mapper, request, withRequest } from '../../web-oracle.js'
import { FakeKoboStore } from '../../interfaces/kobo-support.js'
import { InterfacesServices } from '../../interfaces/services.js'

const { func, kase } = oracle('infrastructure/kobo/KoboProxy')

const db = new OracleDb()
const services = new InterfacesServices(db)
const tokens = new KomgaSyncTokenGenerator(mapper())
const store = new FakeKoboStore()
let instance: KoboProxy | null = null
const proxy = (): KoboProxy => {
  if (instance === null) {
    instance = new KoboProxy(mapper(), tokens, services.settings)
    store.install(instance)
  }
  return instance
}

const describe = (e: ResponseEntity<unknown>) => {
  const it = describeEntity(e)
  return [it[0], it[1], mapper().writeValueAsString(it[2])]
}

async function proxied(
  uri: string,
  { method = 'GET', query = null, headers = [], body = null, includeSyncToken = false }: { method?: string; query?: string | null; headers?: [string, string][]; body?: Uint8Array | null; includeSyncToken?: boolean } = {},
): Promise<unknown> {
  let result: unknown
  try {
    result = await withRequest(request({ method, uri, query, headers }), async () => describe(await proxy().proxyCurrentRequest({ body, includeSyncToken })))
  } catch (e) {
    result = [(e as Error).name, (e as Error).message]
  }
  return [result, store.drain()]
}

// PORT: méthodes privées appelées par réflexion côté Kotlin
const call = (name: string, ...args: unknown[]): unknown => (proxy() as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!.apply(proxy(), args)

func('isEnabled', () => {
  kase('default', () => proxy().isEnabled())
  kase('enabled', () => {
    services.settings.koboProxy = true
    return proxy().isEnabled()
  })
})

func('isKoboHeader', () => {
  for (const it of ['X-Kobo-SyncToken', 'x-kobo-', 'X-KOBO-DEVICEID', 'X-Kobo', 'Authorization', 'x-kobox', ' x-kobo-a']) kase(it, () => call('isKoboHeader', it))
})

func('proxyCurrentRequest', () => {
  kase('no current request', async () => {
    try {
      return await proxy().proxyCurrentRequest()
    } catch (e) {
      return [(e as Error).name, (e as Error).message]
    }
  })
  kase('not a kobo path', () => proxied('/api/v1/books'))
  kase('get with headers', () => {
    store.respond(200, '{"Resources":{"a":1}}', ['X-Kobo-Apitoken', 'e30='], ['Content-Type', 'application/json'], ['x-kobo-recent-reads', '1'], ['Set-Cookie', 'a=b'])
    return proxied('/kobo/TOKEN-1/v1/initialization', {
      query: 'a=1&b=%20c',
      headers: [
        ['Authorization', 'Bearer abc'],
        ['User-Agent', 'Kobo Touch'],
        ['Accept', '*/*'],
        ['Accept-Language', 'fr'],
        ['X-Kobo-DeviceId', 'dev'],
        ['X-Kobo-SyncToken', 'should.not.pass'],
        ['Cookie', 'a=b'],
        ['X-Forwarded-For', '1.2.3.4'],
      ],
    })
  })
  kase('post with body', () => {
    store.respond(201, '{"ok":true}')
    return proxied('/kobo/t/v1/auth/device', { method: 'POST', headers: [['Content-Type', 'application/json']], body: Buffer.from('{"UserKey":"k"}') })
  })
  kase('empty path', () => {
    store.respond(200, '[]')
    return proxied('/kobo/t')
  })
  kase('encoded path', () => {
    store.respond(200, '{}')
    return proxied('/kobo/t/v1/products/a%20b/%C3%A9')
  })
  kase('sync token forwarded and updated', () => {
    store.respond(200, '[]', ['x-kobo-synctoken', 'new-raw'], ['X-Kobo-Sync', 'continue'])
    return proxied('/kobo/t/v1/library/sync', {
      headers: [['X-Kobo-SyncToken', tokens.toBase64(new KomgaSyncToken({ rawKoboSyncToken: 'old-raw', ongoingSyncPointId: 'SP1' }))]],
      includeSyncToken: true,
    })
  })
  kase('sync token with blank raw token', () => {
    store.respond(200, '[]', ['X-Kobo-SyncToken', 'new-raw'])
    return proxied('/kobo/t/v1/library/sync', { headers: [['X-Kobo-SyncToken', tokens.toBase64(new KomgaSyncToken())]], includeSyncToken: true })
  })
  kase('sync token not requested', () => {
    store.respond(200, '[]', ['X-Kobo-SyncToken', 'new-raw'])
    return proxied('/kobo/t/v1/library/sync', { headers: [['X-Kobo-SyncToken', 'a.b']] })
  })
  kase('no sync token in request', () => {
    store.respond(200, '[]', ['X-Kobo-SyncToken', 'new-raw'])
    return proxied('/kobo/t/v1/library/sync', { includeSyncToken: true })
  })
  kase('error status', () => {
    store.respond(401, '{"error":"x"}')
    return proxied('/kobo/t/v1/user/profile')
  })
  kase('server error', () => {
    store.respond(503, '')
    return proxied('/kobo/t/v1/user/profile', { method: 'PUT', body: new Uint8Array(0) })
  })
  kase('empty body', () => {
    store.respond(200, '')
    return proxied('/kobo/t/v1/analytics/event', { method: 'POST', body: Buffer.from('x') })
  })
  kase('disabled', () => {
    services.settings.koboProxy = false
    store.respond(200, '{}')
    return proxied('/kobo/t/v1/initialization')
  })
})
