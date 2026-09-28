// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/kobo/KoboControllerOracleTest.kt
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { LocalDateTime, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { ApiKey } from '../../../../../src/domain/model/ApiKey.js'
import { BookProjection } from '../../../../../src/domain/model/BookProjection.js'
import { KEPUB_DEFAULT } from '../../../../../src/domain/model/BookProjectionProfiles.js'
import { KomgaSyncToken } from '../../../../../src/domain/model/KomgaSyncToken.js'
import { MediaExtensionEpub } from '../../../../../src/domain/model/MediaExtension.js'
import { R2Locator } from '../../../../../src/domain/model/R2Locator.js'
import { ReadProgress } from '../../../../../src/domain/model/ReadProgress.js'
import type { SyncPoint } from '../../../../../src/domain/model/SyncPoint.js'
import { SyncPointLifecycle } from '../../../../../src/domain/service/SyncPointLifecycle.js'
import { KoboProxy } from '../../../../../src/infrastructure/kobo/KoboProxy.js'
import { KomgaSyncTokenGenerator } from '../../../../../src/infrastructure/kobo/KomgaSyncTokenGenerator.js'
import { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { KoboController } from '../../../../../src/interfaces/api/kobo/KoboController.js'
import type { AuthDto } from '../../../../../src/interfaces/api/kobo/dto/AuthDto.js'
import type { KoboBookMetadataDto } from '../../../../../src/interfaces/api/kobo/dto/KoboBookMetadataDto.js'
import { ResponseEntity } from '../../../../../src/port/spring-web.js'
import type { UriComponentsBuilder } from '../../../../../src/port/spring-web-uri.js'
import { OracleDb } from '../../../db.js'
import { oracle, stable, tempDir } from '../../../oracle.js'
import { describeEntity, mapper, request, stableText, withRequest } from '../../../web-oracle.js'
import { admin as adminUser, limited as limitedUser, realBooks, restricted as restrictedUser, setup } from '../../data.js'
import { FakeKoboStore } from '../../kobo-support.js'
import { thumbnails } from '../../opds-support.js'
import { InterfacesServices } from '../../services.js'

const { func, kase } = oracle('interfaces/api/kobo/KoboController')

const db = new OracleDb()
const services = new InterfacesServices(db)
const tokens = new KomgaSyncTokenGenerator(mapper())
const store = new FakeKoboStore()
let proxyInstance: KoboProxy | null = null
const proxy = (): KoboProxy => {
  if (proxyInstance === null) {
    proxyInstance = new KoboProxy(mapper(), tokens, services.settings)
    store.install(proxyInstance)
  }
  return proxyInstance
}
let instance: KoboController | null = null
const controller = (): KoboController =>
  (instance ??= new KoboController(
    proxy(),
    services.kepubConverter,
    new SyncPointLifecycle(db.syncPointDao),
    db.syncPointDao,
    tokens,
    db.properties,
    db.koboDtoDao,
    mapper(),
    services.commonBookController,
    services.bookLifecycle,
    db.bookDao,
    db.thumbnailBookDao,
    db.readProgressDao,
    services.imageConverter,
    db.mediaDao,
    services.contentRestrictionChecker,
    mapper(),
  ))
const date = LocalDateTime.of(2020, 1, 2, 3, 4, 5)
const apiKey = new ApiKey({ id: 'K1', userId: 'U1', key: 'hashed', comment: 'My Kobo', createdDate: date })
const admin = new KomgaPrincipal(adminUser, { apiKey, name: 'masked' })
const limited = new KomgaPrincipal(limitedUser)
const restricted = new KomgaPrincipal(restrictedUser)
let lastToken: string | null = null

const kobo = <T>(block: () => T | Promise<T>, { path = '/kobo/TOKEN/v1/library/sync', headers = [], method = 'GET' }: { path?: string; headers?: [string, string][]; method?: string } = {}): Promise<T> =>
  withRequest(request({ method, uri: path, headers, host: 'komga.local', port: 25600 }), block)

const json = (v: unknown) => stableText(mapper().writeValueAsString(v))

async function describe(e: ResponseEntity<unknown> | Promise<ResponseEntity<unknown>>): Promise<unknown[]> {
  const entity = await e
  const d = describeEntity(entity)
  const body = entity.body
  let b: unknown
  if (typeof body === 'function') {
    const chunks: Buffer[] = []
    const out = new Writable({
      write(chunk: Buffer, _enc, cb) {
        chunks.push(Buffer.from(chunk))
        cb()
      },
    })
    await (body as (o: Writable) => unknown)(out)
    b = new Uint8Array(Buffer.concat(chunks))
  } else if (body instanceof Uint8Array) b = body
  else b = json(body)
  return [d[0], d[1], b]
}

/** réponse de synchronisation : statut, en-tête de sync, jeton décodé (ids neutralisés), corps */
async function sync(principal: KomgaPrincipal, token: string | null = lastToken): Promise<unknown> {
  let e: ResponseEntity<unknown[]>
  try {
    e = await kobo(() => controller().syncLibrary(principal, 'TOKEN'), { headers: token === null ? [] : [['X-Kobo-SyncToken', token]] })
  } catch (ex) {
    return [(ex as Error).name, (ex as Error).message]
  }
  lastToken = e.headers.getFirst('X-Kobo-SyncToken')
  return [e.statusCode, e.headers.getFirst('X-Kobo-Sync'), stable(lastToken === null ? null : tokens.fromBase64(lastToken)), json(e.body), store.drain()]
}

function stateBody(
  bookId: string,
  { status = 'Reading', progress = 50, contentProgress = 25, source = 'OEBPS/ch 1.xhtml', locationType = 'KoboSpan' }: { status?: string; progress?: number | null; contentProgress?: number | null; source?: string | null; locationType?: string } = {},
): Uint8Array {
  const bookmark = [
    '"LastModified":"2023-05-06T07:08:09Z"',
    progress === null ? null : `"ProgressPercent":${progress}`,
    contentProgress === null ? null : `"ContentSourceProgressPercent":${contentProgress}`,
    source === null ? null : `"Location":{"Value":"kobo.2.1","Type":"${locationType}","Source":"${source}"}`,
  ]
    .filter((it) => it !== null)
    .join(',')
  return Buffer.from(
    `{"ReadingStates":[{"EntitlementId":"${bookId}","LastModified":"2023-05-06T07:08:09Z",
  "CurrentBookmark":{${bookmark}},
  "Statistics":{"LastModified":"2023-05-06T07:08:09Z","SpentReadingMinutes":3,"RemainingTimeMinutes":7},
  "StatusInfo":{"LastModified":"2023-05-06T07:08:09Z","Status":"${status}","TimesStartedReading":1}}]}`,
  )
}

// PORT: méthodes privées et fonctions d'extension privées appelées par réflexion côté Kotlin
const call = (name: string, ...args: unknown[]): unknown => {
  const c = controller() as unknown as Record<string, (...a: unknown[]) => unknown>
  return c[name]!.apply(c, args)
}

async function attempt(block: () => unknown): Promise<unknown> {
  try {
    return await block()
  } catch (e) {
    return [(e as Error).name, (e as Error).message.split('\n')[0]!.replaceAll(tempDir(), '<tmp>')]
  }
}

const progressOf = (bookId: string) => stable(db.readProgressDao.findByBookIdAndUserIdOrNull(bookId, 'U1'))

func('ping', () => {
  kase('setup', () => {
    setup(db)
    realBooks(db, tempDir())
    thumbnails(db)
    db.komgaUserDao.insert(apiKey)
  })
  kase('pong', () => controller().ping())
})

func('initialization', () => {
  kase('proxy disabled: native resources', () => kobo(() => describe(controller().initialization('TOKEN')), { path: '/kobo/TOKEN/v1/initialization' }))
  kase('proxy enabled', async () => {
    services.settings.koboProxy = true
    store.respond(200, '{"Resources":{"custom":"value","image_host":"x"}}')
    return [await kobo(() => describe(controller().initialization('TOKEN')), { path: '/kobo/TOKEN/v1/initialization' }), store.drain()]
  })
  kase('proxy without resources', async () => {
    store.respond(200, '{"Other":1}')
    const it = await kobo(() => describe(controller().initialization('T K')), { path: '/kobo/T%20K/v1/initialization' })
    return [it[0], it[1], store.drain()]
  })
  kase('proxy unauthorized', async () => {
    store.respond(401, '{}')
    return [await attempt(() => kobo(() => describe(controller().initialization('TOKEN')), { path: '/kobo/TOKEN/v1/initialization' })), store.drain()]
  })
  kase('proxy error', async () => {
    store.respond(500, '{}')
    const it = await kobo(() => describe(controller().initialization('TOKEN')), { path: '/kobo/TOKEN/v1/initialization' })
    return [it[0], it[1], store.drain()]
  })
})

func('authDevice', () => {
  kase('proxy', async () => {
    store.respond(200, '{"AccessToken":"a"}')
    return [
      await kobo(
        async () => {
          const r = await controller().authDevice(Buffer.from('{"UserKey":"uk"}'))
          return r instanceof ResponseEntity ? describe(r) : json(r)
        },
        { path: '/kobo/TOKEN/v1/auth/device', method: 'POST' },
      ),
      store.drain(),
    ]
  })
  kase('fallback', async () => {
    services.settings.koboProxy = false
    const a = (await kobo(() => controller().authDevice(Buffer.from('{"UserKey":"uk","DeviceId":"d"}')), { path: '/kobo/TOKEN/v1/auth/device', method: 'POST' })) as AuthDto
    return [a.accessToken.length, a.refreshToken.length, a.trackingId.length, a.userKey, a.tokenType]
  })
  kase('fallback without user key', async () => ((await kobo(() => controller().authDevice(Buffer.from('{}')), { path: '/kobo/TOKEN/v1/auth/device', method: 'POST' })) as AuthDto).userKey)
  kase('invalid body', () => attempt(() => kobo(() => controller().authDevice(Buffer.from('not json')), { path: '/kobo/TOKEN/v1/auth/device', method: 'POST' })))
})

func('analyticsGetTests', () => {
  kase('user key', () => json(controller().analyticsGetTests('uk')))
  kase('no user key', () => json(controller().analyticsGetTests(null)))
})

func('syncLibrary', () => {
  kase('first sync', () => sync(admin, null))
  kase('nothing changed', () => sync(admin))
  kase('changes', () => {
    db.readProgressDao.save(new ReadProgress({ bookId: 'B4', userId: 'U1', page: 2, completed: false, readDate: date.plusDays(5), createdDate: date }))
    db.bookDao.update(db.bookDao.findByIdOrNull('B6')!.copy({ fileSize: 42 }))
    return sync(admin)
  })
  kase('item limit: first page', () => {
    db.properties.kobo.syncItemLimit = 1
    return sync(limited, null)
  })
  kase('item limit: continue', () => sync(limited))
  kase('item limit: continue again', () => sync(limited))
  kase('item limit: done', () => {
    db.properties.kobo.syncItemLimit = 100
    return sync(limited)
  })
  kase('token of another user', () => sync(restricted))
  kase('invalid token', () => sync(restricted, 'garbage'))
  kase('proxy merge', () => {
    services.settings.koboProxy = true
    store.respond(200, '[{"NewEntitlement":{"Store":true}}]', ['X-Kobo-SyncToken', 'store-raw'], ['X-Kobo-Sync', 'continue'])
    return sync(admin, tokens.toBase64(new KomgaSyncToken({ rawKoboSyncToken: 'raw-in' })))
  })
  kase('proxy failure', () => {
    store.respond(500, '{}')
    return sync(admin, null)
  })
})

func('getBookMetadata', () => {
  kase('book', () => kobo(() => describe(controller().getBookMetadata(admin, 'TOKEN', 'B4'))))
  kase('unknown book, proxy', async () => {
    store.respond(200, '[{"Proxied":true}]')
    return [await kobo(() => describe(controller().getBookMetadata(admin, 'TOKEN', 'BX')), { path: '/kobo/TOKEN/v1/library/BX/metadata' }), store.drain()]
  })
  kase('restricted', () => {
    services.settings.koboProxy = false
    return attempt(() => kobo(() => describe(controller().getBookMetadata(restricted, 'TOKEN', 'B4'))))
  })
  kase('unknown book, no proxy', () => attempt(() => kobo(() => describe(controller().getBookMetadata(admin, 'TOKEN', 'BX')))))
})

func('getState', () => {
  kase('in progress', () => kobo(() => describe(controller().getState(admin, 'B2'))))
  kase('no progress', () => kobo(() => describe(controller().getState(admin, 'B8'))))
  kase('unknown', () => attempt(() => kobo(() => describe(controller().getState(admin, 'BX')))))
  kase('limited', () => attempt(() => kobo(() => describe(controller().getState(limited, 'B4')))))
  kase('unknown, proxy', async () => {
    services.settings.koboProxy = true
    store.respond(200, '[]')
    return [await kobo(() => describe(controller().getState(admin, 'BX')), { path: '/kobo/TOKEN/v1/library/BX/state' }), store.drain()]
  })
})

func('updateState', () => {
  kase('epub positions', () => {
    services.settings.koboProxy = false
    const pos = (progression: number, position: number, koboSpan: string | null = null) =>
      new R2Locator({ href: 'OEBPS/ch 1.xhtml', type: 'application/xhtml+xml', locations: new R2Locator.Location({ progression, position, totalProgression: progression }), koboSpan })
    db.mediaDao.update(db.mediaDao.findById('B8').copy({ extension: new MediaExtensionEpub({ positions: [pos(0, 1, 'kobo.1.1'), pos(0.5, 2), pos(1, 3)] }) }))
    return 'ok'
  })
  kase('reading', async () => [await kobo(() => describe(controller().updateState(admin, 'B8', stateBody('B8'), 'dev'))), progressOf('B8')])
  kase('exact position, other location type', async () => [
    await kobo(() => describe(controller().updateState(admin, 'B8', stateBody('B8', { contentProgress: 50, locationType: 'Other' })))),
    progressOf('B8'),
  ])
  kase('finished', async () => [await kobo(() => describe(controller().updateState(admin, 'B8', stateBody('B8', { status: 'Finished' })))), progressOf('B8')])
  kase('no extension', () => kobo(() => describe(controller().updateState(admin, 'B4', stateBody('B4')))))
  kase('finished without extension', () => attempt(() => kobo(() => describe(controller().updateState(admin, 'B4', stateBody('B4', { status: 'Finished' }))))))
  kase('missing location', () => attempt(() => kobo(() => describe(controller().updateState(admin, 'B8', stateBody('B8', { source: null }))))))
  kase('missing content progress', () => attempt(() => kobo(() => describe(controller().updateState(admin, 'B8', stateBody('B8', { contentProgress: null }))))))
  kase('no reading state', () => attempt(() => kobo(() => describe(controller().updateState(admin, 'B8', Buffer.from('{"ReadingStates":[]}'))))))
  kase('invalid body', () => attempt(() => kobo(() => describe(controller().updateState(admin, 'B8', Buffer.from('{'))))))
  kase('unknown book', () => attempt(() => kobo(() => describe(controller().updateState(admin, 'BX', stateBody('BX'))))))
  kase('restricted', () => attempt(() => kobo(() => describe(controller().updateState(restricted, 'B4', stateBody('B4'))))))
  kase('events', () => services.drainEvents())
})

func('getBookFile', () => {
  kase('epub', () => kobo(() => describe(controller().getBookFile(admin, 'B8', false))))
  kase('kepub, converter unavailable', () => attempt(() => kobo(() => describe(controller().getBookFile(admin, 'B8', true)))))
  kase('kepub, converted', () => {
    const dir = join(tempDir(), 'bin')
    mkdirSync(dir, { recursive: true })
    const script = join(dir, 'kepubify')
    writeFileSync(script, '#!/bin/sh\ncp "$1" "$3"\n')
    chmodSync(script, 0o755)
    services.kepubConverter.configureKepubify(script)
    return kobo(() => describe(controller().getBookFile(admin, 'B8', true)))
  })
  kase('kepub, cached', () => kobo(() => describe(controller().getBookFile(admin, 'B8', true))))
  kase('kepub of a cbz', () => attempt(() => kobo(() => describe(controller().getBookFile(admin, 'B7', true)))))
  kase('kepub, unknown', () => attempt(() => kobo(() => describe(controller().getBookFile(admin, 'BX', true)))))
  kase('kepub, restricted', () => attempt(() => kobo(() => describe(controller().getBookFile(restricted, 'B4', true)))))
})

func('computeCacheKey', () => {
  kase('book', () => call('computeCacheKey', db.bookDao.findByIdOrNull('B8')!.copy({ fileLastModified: LocalDateTime.of(2021, 2, 3, 4, 5, 6, 7000) })))
})

func('getBookCover', () => {
  kase('thumbnail', () => kobo(() => describe(controller().getBookCover(admin, 'TB7', '100', '200', null, 'false'))))
  kase('unknown thumbnail', () => attempt(() => kobo(() => describe(controller().getBookCover(admin, 'TX', '100', '200', '85', 'true')))))
  kase('unknown thumbnail, proxy', () => {
    services.settings.koboProxy = true
    return kobo(() => describe(controller().getBookCover(admin, 'TX', '100', '200', '85', 'true')))
  })
  kase('restricted', () => attempt(() => kobo(() => describe(controller().getBookCover(limited, 'TB7', '1', '1', null, null)))))
})

func('catchAll', () => {
  kase('proxy', async () => {
    store.respond(200, '{"a":[1,2]}')
    return [await kobo(() => describe(controller().catchAll(Buffer.from('{"x":1}'))), { path: '/kobo/TOKEN/v1/user/profile', method: 'PUT' }), store.drain()]
  })
  kase('no proxy', () => {
    services.settings.koboProxy = false
    return kobo(() => describe(controller().catchAll(null)), { path: '/kobo/TOKEN/v1/user/profile' })
  })
})

func('getDownloadUrlBuilder', () => {
  kase('url', () => kobo(() => (call('getDownloadUrlBuilder', 'a b') as UriComponentsBuilder).buildAndExpand('B1', true).toUri().toString()))
})

func('withDownloadUrls', () => {
  const builder = () => kobo(() => call('getDownloadUrlBuilder', 'TOKEN') as UriComponentsBuilder)
  const metadata = (id: string) => [...db.koboDtoDao.findBookMetadataByIds([id])][0] as KoboBookMetadataDto
  kase('epub, no converter', async () => {
    services.kepubConverter.configureKepubify(null)
    return json(call('withDownloadUrls', metadata('B4'), await builder()))
  })
  kase('kepub', async () => json(call('withDownloadUrls', metadata('B6'), await builder())))
  kase('pre-paginated', async () => json(call('withDownloadUrls', metadata('B4').copy({ isPrePaginated: true }), await builder())))
  kase('kepub size from projection', async () => {
    db.bookProjectionDao.save(new BookProjection({ bookId: 'B4', profile: KEPUB_DEFAULT, fileSize: 777 }))
    services.kepubConverter.configureKepubify('true')
    return json(call('withDownloadUrls', metadata('B4'), await builder()))
  })
})

func('getSyncPointVerified', () => {
  kase('null', () => call('getSyncPointVerified', null, 'U1'))
  kase('unknown', () => call('getSyncPointVerified', 'SPX', 'U1'))
  kase('other user', () => {
    const sp = new SyncPointLifecycle(db.syncPointDao).createSyncPoint(adminUser, null, null)
    return [call('getSyncPointVerified', sp.id, 'U2'), (call('getSyncPointVerified', sp.id, 'U1') as SyncPoint | null)?.id === sp.id]
  })
})

func('getMetadataForRemovedBook', () => {
  kase('book', () => json(call('getMetadataForRemovedBook', 'B9')))
})

func('getEmptyReadProgressForBook@817', () => {
  kase('book', () => json(call('getEmptyReadProgressForBook', db.bookDao.findByIdOrNull('B1')!)))
})

func('getEmptyReadProgressForBook@835', () => {
  kase('id and date', () => json(call('getEmptyReadProgressForBook', 'B1', ZonedDateTime.of(2020, 1, 2, 3, 4, 5, 0, ZoneOffset.ofHours(2)))))
})
