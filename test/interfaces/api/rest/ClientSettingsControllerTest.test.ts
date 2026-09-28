// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/ClientSettingsControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { ClientSettingsDtoDao } from '../../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { MockMvc, closeContext, mockMvcTest, withAnonymousUser } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('ClientSettingsControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)
  const clientSettingsDtoDao = ctx.getBean(ClientSettingsDtoDao)
  const userRepository = ctx.getBean(KomgaUserRepository)

  afterAll(() => closeContext(ctx))

  afterEach(() => {
    clientSettingsDtoDao.deleteAll()
  })

  function validKeys(): string[] {
    return [
      'single',
      'one.two',
      'one.with-dash',
      'one.with_underscore',
      'one.two.three-four_five',
      'start2',
      'start2.0value',
      'start2.value2',
      'start_2.value2',
      'start-2.value2',
    ]
  }

  function invalidKeys(): string[] {
    return [
      'UPPERCASE',
      '   ',
      '',
      'symbols!',
      'two..dots',
      '.start.with.dot',
      'end.with.dot.',
      'setting.-secondstartwithdash',
      'setting.-secondstartwithunderscore',
      'setting.secondendwithdash-',
      'setting.secondendwithunderscore_',
      '-first',
      '_first',
      'first-',
      'first_',
      '.',
    ]
  }

  describe('AnonymousUser', () => {
    it(
      'given anonymous user when retrieving settings then returns only settings allowed for unauthorized users',
      withAnonymousUser(async () => {
        clientSettingsDtoDao.saveGlobal('forall', 'value', true)
        clientSettingsDtoDao.saveGlobal('restricted', 'value', false)

        await mockMvc.get('/api/v1/client-settings/global/list').andExpect((it) => {
          it.status((s) => s.isOk())
          it.jsonPath('$.size()', (j) => j.value(1))
          it.jsonPath('$.forall.value', (j) => j.value('value'))
          it.jsonPath('$.forall.allowUnauthorized', (j) => j.value(true))
        })
      }),
    )

    it(
      'given anonymous user when updating global settings then returns unauthorized',
      withAnonymousUser(async () => {
        //language=JSON
        const jsonString = `{
  "setting": {
    "value": "value",
    "allowUnauthorized": false
  }
}`

        await mockMvc
          .patch('/api/v1/client-settings/global', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isUnauthorized())
          })
      }),
    )
  })

  describe('RegularUser', () => {
    const user1 = new KomgaUser({ email: 'user1@example.org', password: '', id: 'user1' })

    beforeAll(() => {
      userRepository.insert(user1)
    })

    afterAll(() => {
      userRepository.delete(user1.id)
    })

    it(
      'given authenticated user when retrieving global settings then returns all settings',
      withMockCustomUser(async () => {
        clientSettingsDtoDao.saveGlobal('forall', 'value', true)
        clientSettingsDtoDao.saveGlobal('restricted', 'value', false)

        await mockMvc.get('/api/v1/client-settings/global/list').andExpect((it) => {
          it.status((s) => s.isOk())
          it.jsonPath('$.size()', (j) => j.value(2))
          it.jsonPath('$.forall.value', (j) => j.value('value'))
          it.jsonPath('$.forall.allowUnauthorized', (j) => j.value(true))
          it.jsonPath('$.restricted.value', (j) => j.value('value'))
          it.jsonPath('$.restricted.allowUnauthorized', (j) => j.value(false))
        })
      }),
    )

    it(
      'given non-admin user when updating global settings then returns forbidden',
      withMockCustomUser(async () => {
        //language=JSON
        const jsonString = `{
  "setting": {
    "value": "value",
    "allowUnauthorized": false
  }
}`

        await mockMvc
          .patch('/api/v1/client-settings/global', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isForbidden())
          })
      }),
    )

    // @ParameterizedTest
    // @MethodSource("validKeys")
    it.each(validKeys())(
      'given non-admin user when updating user settings then settings are updated',
      withMockCustomUser({ id: 'user1' }, async (key: string) => {
        //language=JSON
        const jsonString = `{
  "${key}": {
    "value": "value"
  }
}`

        await mockMvc
          .patch('/api/v1/client-settings/user', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        await mockMvc.get('/api/v1/client-settings/user/list').andExpect((it) => {
          it.status((s) => s.isOk())
          it.jsonPath('$.size()', (j) => j.value(1))
          it.jsonPath(`$.['${key}'].value`, (j) => j.value('value'))
        })
      }),
    )

    // @ParameterizedTest
    // @MethodSource("invalidKeys")
    it.each(invalidKeys())(
      'given non-admin user when updating user settings with invalid key then validation error is thrown',
      withMockCustomUser({ id: 'user1' }, async (key: string) => {
        //language=JSON
        const jsonString = `{
  "${key}": {
    "value": "value"
  }
}`

        await mockMvc
          .patch('/api/v1/client-settings/user', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isBadRequest())
          })
      }),
    )

    // @ParameterizedTest
    // @MethodSource("invalidKeys")
    it.each(invalidKeys())(
      'given non-admin user when deleting user settings with invalid key then validation error is thrown',
      withMockCustomUser({ roles: ['ADMIN'] }, async (key: string) => {
        //language=JSON
        const jsonString = `["${key}"]`

        await mockMvc
          .delete('/api/v1/client-settings/user', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isBadRequest())
          })
      }),
    )

    // @ParameterizedTest
    // @ValueSource(strings = [...])
    it.each([
      //language=JSON
      'null',
      //language=JSON
      '{"value": null }',
      //language=JSON
      '{ "value": "   " }',
      //language=JSON
      '{ "value": "" }',
    ])(
      'given non-admin user when updating user settings with invalid value then validation error is thrown',
      withMockCustomUser({ id: 'user1' }, async (value: string) => {
        //language=JSON
        const jsonString = `{
  "key": ${value}
}`

        await mockMvc
          .patch('/api/v1/client-settings/user', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isBadRequest())
          })
      }),
    )
  })

  describe('AdminUser', () => {
    it(
      'given admin user when retrieving settings then returns all settings',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        clientSettingsDtoDao.saveGlobal('forall', 'value', true)
        clientSettingsDtoDao.saveGlobal('restricted', 'value', false)

        await mockMvc.get('/api/v1/client-settings/global/list').andExpect((it) => {
          it.status((s) => s.isOk())
          it.jsonPath('$.size()', (j) => j.value(2))
          it.jsonPath('$.forall.value', (j) => j.value('value'))
          it.jsonPath('$.forall.allowUnauthorized', (j) => j.value(true))
          it.jsonPath('$.restricted.value', (j) => j.value('value'))
          it.jsonPath('$.restricted.allowUnauthorized', (j) => j.value(false))
        })
      }),
    )

    // @ParameterizedTest
    // @MethodSource("validKeys")
    it.each(validKeys())(
      'given admin user when updating global settings then settings are updated',
      withMockCustomUser({ roles: ['ADMIN'] }, async (key: string) => {
        //language=JSON
        const jsonString = `{
  "${key}": {
    "value": "value",
    "allowUnauthorized": false
  }
}`

        await mockMvc
          .patch('/api/v1/client-settings/global', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        await mockMvc.get('/api/v1/client-settings/global/list').andExpect((it) => {
          it.status((s) => s.isOk())
          it.jsonPath('$.size()', (j) => j.value(1))
          it.jsonPath(`$.['${key}'].value`, (j) => j.value('value'))
          it.jsonPath(`$.['${key}'].allowUnauthorized`, (j) => j.value(false))
        })
      }),
    )

    // @ParameterizedTest
    // @MethodSource("invalidKeys")
    it.each(invalidKeys())(
      'given admin user when updating global settings with invalid key then validation error is thrown',
      withMockCustomUser({ roles: ['ADMIN'] }, async (key: string) => {
        //language=JSON
        const jsonString = `{
  "${key}": {
    "value": "value",
    "allowUnauthorized": false
  }
}`

        await mockMvc
          .patch('/api/v1/client-settings/global', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isBadRequest())
          })
      }),
    )

    // @ParameterizedTest
    // @MethodSource("invalidKeys")
    it.each(invalidKeys())(
      'given admin user when deleting global settings with invalid key then validation error is thrown',
      withMockCustomUser({ roles: ['ADMIN'] }, async (key: string) => {
        //language=JSON
        const jsonString = `["${key}"]`

        await mockMvc
          .delete('/api/v1/client-settings/global', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isBadRequest())
          })
      }),
    )

    // @ParameterizedTest
    // @ValueSource(strings = [...])
    it.each([
      //language=JSON
      'null',
      //language=JSON
      `{
          "value": "1",
          "allowUnauthorized": null
        }`,
      //language=JSON
      `{
          "value": " ",
          "allowUnauthorized": true
        }`,
      //language=JSON
      `{
          "value": "  ",
          "allowUnauthorized": false
        }`,
      //language=JSON
      `{
          "value": null,
          "allowUnauthorized": false
        }`,
    ])(
      'given admin user when updating global settings with invalid value then validation error is thrown',
      withMockCustomUser({ roles: ['ADMIN'] }, async (value: string) => {
        //language=JSON
        const jsonString = `{
  "setting": ${value}
}`

        await mockMvc
          .patch('/api/v1/client-settings/global', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isBadRequest())
          })
      }),
    )
  })
})
