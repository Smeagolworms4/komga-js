// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/SettingsControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Duration } from '@js-joda/core'
import { afterAll, describe, expect, it } from 'vitest'
import { ThumbnailSize } from '../../../../src/domain/model/ThumbnailSize.js'
import { KomgaSettingsProvider } from '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { MockMvc, closeContext, mockMvcTest, withAnonymousUser } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('SettingsControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)
  const komgaSettingsProvider = ctx.getBean(KomgaSettingsProvider)

  afterAll(() => closeContext(ctx))

  describe('NonAdminUser', () => {
    it(
      'given anonymous user when retrieving settings then returns unauthorized',
      withAnonymousUser(async () => {
        await mockMvc.get('/api/v1/settings').andExpect((it) => {
          it.status((s) => s.isUnauthorized())
        })
      }),
    )

    it(
      'given restricted user when retrieving settings then returns public settings only',
      withMockCustomUser(async () => {
        await mockMvc.get('/api/v1/settings').andExpect((it) => {
          it.status((s) => s.isOk())
          it.jsonPath('deleteEmptyCollections', (j) => j.doesNotHaveJsonPath())
          it.jsonPath('deleteEmptyReadLists', (j) => j.doesNotHaveJsonPath())
          it.jsonPath('rememberMeDurationDays', (j) => j.doesNotHaveJsonPath())
          it.jsonPath('thumbnailSize', (j) => j.doesNotHaveJsonPath())
          it.jsonPath('taskPoolSize', (j) => j.doesNotHaveJsonPath())
          it.jsonPath('serverPort', (j) => j.doesNotHaveJsonPath())
          it.jsonPath('serverContextPath', (j) => j.doesNotHaveJsonPath())
          it.jsonPath('maxUploadFileSizeBytes', (j) => j.isNotEmpty())
        })
      }),
    )
  })

  it(
    'given admin user when retrieving settings then settings are returned',
    withMockCustomUser({ roles: ['ADMIN'] }, async () => {
      komgaSettingsProvider.deleteEmptyCollections = true
      komgaSettingsProvider.deleteEmptyReadLists = false
      komgaSettingsProvider.rememberMeDuration = Duration.ofDays(5)
      komgaSettingsProvider.thumbnailSize = ThumbnailSize.LARGE
      komgaSettingsProvider.taskPoolSize = 4
      komgaSettingsProvider.serverPort = 1234
      komgaSettingsProvider.serverContextPath = '/example'

      await mockMvc.get('/api/v1/settings').andExpect((it) => {
        it.status((s) => s.isOk())
        it.jsonPath('deleteEmptyCollections', (j) => j.value(true))
        it.jsonPath('deleteEmptyReadLists', (j) => j.value(false))
        it.jsonPath('rememberMeDurationDays', (j) => j.value(5))
        it.jsonPath('thumbnailSize', (j) => j.value('LARGE'))
        it.jsonPath('taskPoolSize', (j) => j.value(4))
        it.jsonPath('serverPort.configurationSource', (j) => j.value(25600))
        it.jsonPath('serverPort.databaseSource', (j) => j.value(1234))
        it.jsonPath('serverPort.effectiveValue', (j) => j.value(null)) // somehow we don't get the effective value with the mock server
        it.jsonPath('serverContextPath.configurationSource', (j) => j.value(null))
        it.jsonPath('serverContextPath.databaseSource', (j) => j.value('/example'))
        it.jsonPath('serverContextPath.effectiveValue', (j) => j.value(''))
        it.jsonPath('maxUploadFileSizeBytes', (j) => j.isNotEmpty())
      })
    }),
  )

  it(
    'given admin user when updating settings then settings are updated',
    withMockCustomUser({ roles: ['ADMIN'] }, async () => {
      komgaSettingsProvider.deleteEmptyCollections = true
      komgaSettingsProvider.deleteEmptyReadLists = true
      komgaSettingsProvider.rememberMeDuration = Duration.ofDays(5)
      komgaSettingsProvider.thumbnailSize = ThumbnailSize.LARGE
      komgaSettingsProvider.taskPoolSize = 4
      komgaSettingsProvider.serverPort = 1234
      komgaSettingsProvider.serverContextPath = '/example'

      const rememberMeKey = komgaSettingsProvider.rememberMeKey

      //language=JSON
      const jsonString = `{
  "deleteEmptyCollections": false,
  "rememberMeDurationDays": 15,
  "renewRememberMeKey": true,
  "thumbnailSize": "MEDIUM",
  "taskPoolSize": 8,
  "serverPort": 5678,
  "serverContextPath": "/komga-hyphen/subpath123"
}`

      await mockMvc
        .patch('/api/v1/settings', (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = jsonString
        })
        .andExpect((it) => {
          it.status((s) => s.isNoContent())
        })

      expect(komgaSettingsProvider.deleteEmptyCollections).toBe(false)
      expect(komgaSettingsProvider.deleteEmptyReadLists).toBe(true)
      expect(komgaSettingsProvider.rememberMeDuration.equals(Duration.ofDays(15))).toBe(true)
      expect(komgaSettingsProvider.rememberMeKey).not.toEqual(rememberMeKey)
      expect(komgaSettingsProvider.thumbnailSize).toBe(ThumbnailSize.MEDIUM)
      expect(komgaSettingsProvider.taskPoolSize).toEqual(8)
      expect(komgaSettingsProvider.serverPort).toEqual(5678)
      expect(komgaSettingsProvider.serverContextPath).toEqual('/komga-hyphen/subpath123')
    }),
  )

  it(
    'given admin user when deleting settings then deletable settings are deleted',
    withMockCustomUser({ roles: ['ADMIN'] }, async () => {
      komgaSettingsProvider.deleteEmptyCollections = true
      komgaSettingsProvider.deleteEmptyReadLists = true
      komgaSettingsProvider.rememberMeDuration = Duration.ofDays(5)
      komgaSettingsProvider.thumbnailSize = ThumbnailSize.LARGE
      komgaSettingsProvider.taskPoolSize = 4
      komgaSettingsProvider.serverPort = 1234
      komgaSettingsProvider.serverContextPath = '/example'

      const rememberMeKey = komgaSettingsProvider.rememberMeKey

      //language=JSON
      const jsonString = `{
  "deleteEmptyCollections": null,
  "rememberMeDurationDays": null,
  "renewRememberMeKey": null,
  "thumbnailSize": null,
  "taskPoolSize": null,
  "serverPort": null,
  "serverContextPath": null
}`

      await mockMvc
        .patch('/api/v1/settings', (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = jsonString
        })
        .andExpect((it) => {
          it.status((s) => s.isNoContent())
        })

      expect(komgaSettingsProvider.deleteEmptyCollections).toBe(true)
      expect(komgaSettingsProvider.deleteEmptyReadLists).toBe(true)
      expect(komgaSettingsProvider.rememberMeDuration.equals(Duration.ofDays(5))).toBe(true)
      expect(komgaSettingsProvider.rememberMeKey).toEqual(rememberMeKey)
      expect(komgaSettingsProvider.thumbnailSize).toBe(ThumbnailSize.LARGE)
      expect(komgaSettingsProvider.taskPoolSize).toEqual(4)
      expect(komgaSettingsProvider.serverPort).toBeNull()
      expect(komgaSettingsProvider.serverContextPath).toBeNull()
    }),
  )

  // @ParameterizedTest
  // @ValueSource(strings = [...])
  it.each([
    //language=JSON
    '{"rememberMeDurationDays": 0}',
    //language=JSON
    '{"thumbnailSize": "HUGE"}',
    '{"taskPoolSize": 0}',
    '{"serverPort": 0}',
    '{"serverPort": -5}',
    '{"serverPort": 65536}',
    '{"serverContextPath": "noSlashBegin"}',
    '{"serverContextPath": "/slashEnd/"}',
    '{"serverContextPath": "/invalid=character"}',
    '{"serverContextPath": "/invalid/end-"}',
    '{"serverContextPath": "/invalid/end_"}',
    '{"serverContextPath": "/日本語"}',
  ])(
    'given admin user when updating with invalid settings then returns bad request',
    withMockCustomUser({ roles: ['ADMIN'] }, async (jsonString: string) => {
      await mockMvc
        .patch('/api/v1/settings', (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = jsonString
        })
        .andExpect((it) => {
          it.status((s) => s.isBadRequest())
        })
    }),
  )
})
