// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/kobo/KoboControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { MediaType } from '../../../../src/domain/model/MediaType.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../../src/domain/persistence/MediaRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { KomgaSettingsProvider } from '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { KoboHeaders } from '../../../../src/infrastructure/kobo/KoboHeaders.js'
import { KomgaSyncTokenGenerator } from '../../../../src/infrastructure/kobo/KomgaSyncTokenGenerator.js'
import { WebServerEffectiveSettings } from '../../../../src/infrastructure/web/WebServerEffectiveSettings.js'
import { nn } from '../../../../src/port/kotlin.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { MockMvc, closeContext, mockMvcTest } from '../../../support/mockmvc.js'

// @SpringBootTest(properties = ["komga.kobo.sync-item-limit=1"])
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('KoboControllerTest', () => {
  const ctx = mockMvcTest({ 'komga.kobo.sync-item-limit': 1 })
  const mockMvc = ctx.getBean(MockMvc)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const komgaUserLifecycle = ctx.getBean(KomgaUserLifecycle)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const mediaRepository = ctx.getBean(MediaRepository)
  const komgaSyncTokenGenerator = ctx.getBean(KomgaSyncTokenGenerator)
  const komgaSettingsProvider = ctx.getBean(KomgaSettingsProvider)
  const serverSettings = ctx.getBean(WebServerEffectiveSettings)

  afterAll(() => closeContext(ctx))

  const library1 = makeLibrary()
  const user1 = new KomgaUser({
    email: 'user@example.org',
    password: '',
    roles: new Set([UserRoles.KOBO_SYNC]),
  })
  let apiKey: string

  beforeAll(() => {
    libraryRepository.insert(library1)
    userRepository.insert(user1)
    apiKey = nn(komgaUserLifecycle.createApiKey(user1, 'test')).key
  })

  afterAll(() => {
    libraryRepository.deleteAll()
    komgaUserLifecycle.deleteUser(user1)
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
  })

  it('given user when syncing for the first time then books are synced', async () => {
    // given
    const book1 = makeBook('valid', { libraryId: library1.id })
    const book2 = makeBook('valid', { libraryId: library1.id })

    {
      const series = makeSeries('series1', { libraryId: library1.id })
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [book1, book2])
    }

    {
      const media = mediaRepository.findById(book1.id)
      mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: MediaType.EPUB.type }))
    }
    {
      const media = mediaRepository.findById(book2.id)
      mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: MediaType.EPUB.type }))
    }

    // first sync
    const mvcResult1 = await mockMvc
      .get(`/kobo/${apiKey}/v1/library/sync`)
      .andExpect((it) => {
        it.status((s) => s.isOk())
        it.jsonPath('$.length()', (j) => j.value(1))
        it.header((h) => h.string(KoboHeaders.X_KOBO_SYNC, 'continue'))
      })
      .andReturn()

    const syncToken1Base64 = mvcResult1.response.getHeaderValue(KoboHeaders.X_KOBO_SYNCTOKEN) as string
    const syncToken1 = komgaSyncTokenGenerator.fromBase64(syncToken1Base64)
    expect(syncToken1.ongoingSyncPointId).not.toBeNull()
    expect(syncToken1.ongoingSyncPointId).not.toEqual('')
    expect(syncToken1.lastSuccessfulSyncPointId).toBeNull()

    // second sync
    const mvcResult2 = await mockMvc
      .get(`/kobo/${apiKey}/v1/library/sync`, (r) => {
        r.header(KoboHeaders.X_KOBO_SYNCTOKEN, syncToken1Base64)
      })
      .andExpect((it) => {
        it.status((s) => s.isOk())
        it.jsonPath('$.length()', (j) => j.value(1))
        it.header((h) => h.doesNotExist(KoboHeaders.X_KOBO_SYNC))
      })
      .andReturn()

    const syncToken2 = komgaSyncTokenGenerator.fromBase64(mvcResult2.response.getHeaderValue(KoboHeaders.X_KOBO_SYNCTOKEN) as string)
    expect(syncToken2.ongoingSyncPointId).toBeNull()
    expect(syncToken2.lastSuccessfulSyncPointId).toEqual(syncToken1.ongoingSyncPointId)
  })

  it('given kobo proxy is enabled when requesting book cover for non-existent book then redirect response is returned', async () => {
    komgaSettingsProvider.koboProxy = true

    try {
      await mockMvc.get(`/kobo/${apiKey}/v1/books/nonexistent/thumbnail/800/800/false/image.jpg`).andExpect((it) => {
        it.status((s) => s.isTemporaryRedirect())
        it.header((h) => h.string('Location', 'https://cdn.kobo.com/book-images/nonexistent/800/800/false/image.jpg'))
      })
    } finally {
      komgaSettingsProvider.koboProxy = false
    }
  })

  // @Nested
  describe('HostHeader', () => {
    // @param:Value($$"${server.port:#{null}}") private val configServerPort: Int?
    const configServerPortValue = ctx.environment.getProperty('server.port')
    const configServerPort = configServerPortValue !== null ? Number(configServerPortValue) : null

    // @MethodSource("headers")
    function headers(): [string, string, Map<string, string> | null, number | null][] {
      return [
        ['127.0.0.1', `http://127.0.0.1:${configServerPort}`, null, null],
        ['localhost', `http://localhost:${configServerPort}`, null, null],
        [
          '127.0.0.1',
          'https://demo.komga.org',
          new Map([
            ['X-Forwarded-Proto', 'https'],
            ['X-Forwarded-Host', 'demo.komga.org'],
          ]),
          null,
        ],
        ['127.0.0.1', 'http://127.0.0.1:8085', null, 8085],
        ['localhost', 'http://localhost:8085', null, 8085],
        [
          '127.0.0.1',
          'https://demo.komga.org',
          new Map([
            ['X-Forwarded-Proto', 'https'],
            ['X-Forwarded-Host', 'demo.komga.org'],
          ]),
          8085,
        ],
      ]
    }

    // @ParameterizedTest
    it.each(headers())('given partial host header when getting initialization then img urls are correct', async (hostHeader, expected, extraHeaders, koboPort) => {
      // ServletWebServerInitializedEvent is not triggered during tests
      serverSettings.effectiveServerPort = configServerPort

      const oldPort = komgaSettingsProvider.koboPort
      if (koboPort !== null) komgaSettingsProvider.koboPort = koboPort

      try {
        await mockMvc
          .get(`/kobo/${apiKey}/v1/initialization`, (r) => {
            r.header('Host', hostHeader)
            extraHeaders?.forEach((v, h) => r.header(h, v))
          })
          .andExpect((it) => {
            it.jsonPath('Resources.image_host', (j) => j.value(expected))
          })
          .andReturn()
      } finally {
        komgaSettingsProvider.koboPort = oldPort
      }
    })
  })
})
