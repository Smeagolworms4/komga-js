// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/UserControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { AllowExcludeDto } from '../../../../src/interfaces/api/rest/dto/UserUpdateDto.js'
import { nn } from '../../../../src/port/kotlin.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { makeLibrary } from '../../../domain/model/Utils.js'
import { MatchesPattern, MockMvc, allOf, closeContext, hasItem, mockMvcTest } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

const sorted = <T>(it: Iterable<T>): T[] => [...it].sort()

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
// @ActiveProfiles("test")
describe('UserControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)

  const admin = new KomgaUser({ email: 'admin@example.org', password: '', id: 'admin' })

  beforeAll(() => {
    libraryRepository.insert(makeLibrary({ id: '1' }))
    libraryRepository.insert(makeLibrary({ id: '2' }))
    userRepository.insert(admin)
  })

  afterAll(() => {
    for (const it of userRepository.findAll()) {
      userLifecycle.deleteUser(it)
    }
    for (const it of libraryRepository.findAll()) {
      libraryLifecycle.deleteLibrary(it)
    }
    closeContext(ctx)
  })

  afterEach(() => {
    for (const it of userRepository.findAll().filter((it) => !(it.email === admin.email))) userLifecycle.deleteUser(it)
  })

  describe('Create', () => {
    // @ParameterizedTest
    // @ValueSource(strings = ["user", "user@domain"])
    it.each(['user', 'user@domain'])(
      'when creating a user with invalid email then returns bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async (email: string) => {
        // language=JSON
        const jsonString = `{"email":"${email}","password":"password"}`

        await mockMvc
          .post('/api/v2/users', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'when creating a user with limited fields then returns created user',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        // language=JSON
        const jsonString = `{
  "email":"newuser@example.org",
  "password":"password"
}`

        await mockMvc
          .post('/api/v2/users', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isCreated())
            it.jsonPath('$.roles', (j) => j.value(hasItem('USER')))
            it.jsonPath('$.sharedAllLibraries', (j) => j.value(true))
            it.jsonPath('$.sharedLibrariesId', (j) => j.doesNotExist())
            it.jsonPath('$.labelsAllow', (j) => j.isEmpty())
            it.jsonPath('$.labelsExclude', (j) => j.isEmpty())
            it.jsonPath('$.ageRestriction', (j) => j.doesNotExist())
          })
      }),
    )
  })

  it(
    'when creating a user with all fields then returns created user',
    withMockCustomUser({ roles: ['ADMIN'] }, async () => {
      // language=JSON
      const jsonString = `{
  "email":"newuser@example.org",
  "password":"password",
  "roles": ["${UserRoles.FILE_DOWNLOAD.name}"],
  "ageRestriction": {
    "age": 5,
    "restriction": "${AllowExcludeDto.NONE}"
  },
  "labelsAllow": ["allowTag"],
  "labelsExclude": ["excludeTag"],
  "sharedLibraries": {
    "all": "false",
    "libraryIds" : ["1", "157"]
  }
}`

      await mockMvc
        .post('/api/v2/users', (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = jsonString
        })
        .andExpect((it) => {
          it.status((s) => s.isCreated())
          it.jsonPath('$.roles', (j) => j.value(allOf(hasItem('USER'), hasItem(UserRoles.FILE_DOWNLOAD.name))))
          it.jsonPath('$.labelsAllow', (j) => j.value(hasItem('allowtag')))
          it.jsonPath('$.labelsExclude', (j) => j.value(hasItem('excludetag')))
          it.jsonPath('$.ageRestriction', (j) => j.doesNotExist())
          it.jsonPath('$.sharedAllLibraries', (j) => j.value(false))
          it.jsonPath('$.sharedLibrariesIds', (j) => j.value(hasItem('1')))
        })
    }),
  )

  it(
    'when creating a user with some fields then returns created user',
    withMockCustomUser({ roles: ['ADMIN'] }, async () => {
      // language=JSON
      const jsonString = `{
  "email":"newuser@example.org",
  "password":"password",
  "roles": ["${UserRoles.FILE_DOWNLOAD.name}"],
  "ageRestriction": {
    "age": 5,
    "restriction": "${AllowExcludeDto.ALLOW_ONLY}"
  },
  "labelsAllow": ["allowTag"],
  "labelsExclude": ["excludeTag"],
  "sharedLibraries": {
    "all": "false",
    "libraryIds" : ["1", "157"]
  }
}`

      await mockMvc
        .post('/api/v2/users', (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = jsonString
        })
        .andExpect((it) => {
          it.status((s) => s.isCreated())
          it.jsonPath('$.roles', (j) => j.value(allOf(hasItem('USER'), hasItem(UserRoles.FILE_DOWNLOAD.name))))
          it.jsonPath('$.labelsAllow', (j) => j.value(hasItem('allowtag')))
          it.jsonPath('$.labelsExclude', (j) => j.value(hasItem('excludetag')))
          it.jsonPath('$.ageRestriction.age', (j) => j.value(5))
          it.jsonPath('$.ageRestriction.restriction', (j) => j.value(AllowExclude.ALLOW_ONLY.name))
          it.jsonPath('$.sharedAllLibraries', (j) => j.value(false))
          it.jsonPath('$.sharedLibrariesIds', (j) => j.value(hasItem('1')))
        })
    }),
  )

  describe('Update', () => {
    it(
      'given user without roles when updating roles then roles are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({ email: 'user@example.org', password: '', id: 'user' })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "roles": ["${UserRoles.FILE_DOWNLOAD.name}","${UserRoles.PAGE_STREAMING.name}","${UserRoles.KOBO_SYNC.name}"]
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(sorted(nn(self).roles)).toEqual(sorted([UserRoles.KOBO_SYNC, UserRoles.PAGE_STREAMING, UserRoles.FILE_DOWNLOAD]))
      }),
    )

    it(
      'given user with roles when updating roles then roles are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({ email: 'user@example.org', password: '', id: 'user' })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "roles": []
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(nn(self).roles.size).toBe(0)
      }),
    )

    it(
      'given user with library restrictions when updating available libraries then they are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({ email: 'user@example.org', password: '', sharedLibrariesIds: new Set(['1']), sharedAllLibraries: false, id: 'user' })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "sharedLibraries": {
    "all": "false",
    "libraryIds" : ["1", "2"]
  }
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(nn(self).sharedAllLibraries).toBe(false)
        expect(sorted(nn(self).sharedLibrariesIds)).toEqual(sorted(['1', '2']))
      }),
    )

    it(
      'given user without library restrictions when restricting libraries then they restrictions are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({ email: 'user@example.org', password: '', sharedAllLibraries: true, id: 'user' })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "sharedLibraries": {
    "all": "false",
    "libraryIds" : ["2"]
  }
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(nn(self).sharedAllLibraries).toBe(false)
        expect(sorted(nn(self).sharedLibrariesIds)).toEqual(sorted(['2']))
      }),
    )

    it(
      'given user with library restrictions when removing restrictions then the restrictions are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({ email: 'user@example.org', password: '', sharedLibrariesIds: new Set(['2']), sharedAllLibraries: false, id: 'user' })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "sharedLibraries": {
    "all": "true",
    "libraryIds": []
  }
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(nn(self).sharedAllLibraries).toBe(true)
        expect(nn(self).sharedLibrariesIds.size).toBe(0)
      }),
    )

    it(
      'given user without labels restrictions when adding restrictions then restrictions are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({ email: 'user@example.org', password: '', id: 'user' })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "labelsAllow": ["cute", "kids"],
  "labelsExclude": ["adult"]
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(sorted(nn(self).restrictions.labelsAllow)).toEqual(sorted(['cute', 'kids']))
        // containsOnly
        expect([...new Set(nn(self).restrictions.labelsExclude)]).toEqual(['adult'])
      }),
    )

    it(
      'given user with labels restrictions when removing restrictions then restrictions are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({
          email: 'user@example.org',
          password: '',
          restrictions: new ContentRestrictions({
            labelsAllow: new Set(['kids', 'cute']),
            labelsExclude: new Set(['adult']),
          }),
          id: 'user',
        })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "labelsAllow": [],
  "labelsExclude": null
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(nn(self).restrictions.labelsAllow.size).toBe(0)
        expect(nn(self).restrictions.labelsExclude.size).toBe(0)
      }),
    )

    it(
      'given user without age restriction when adding restrictions then restrictions are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({ email: 'user@example.org', password: '', id: 'user' })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "ageRestriction": {
    "age": 12,
    "restriction": "ALLOW_ONLY"
  }
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(nn(self).restrictions.ageRestriction).not.toBeNull()
        expect(nn(nn(self).restrictions.ageRestriction).age).toBe(12)
        expect(nn(nn(self).restrictions.ageRestriction).restriction).toBe(AllowExclude.ALLOW_ONLY)
      }),
    )

    it(
      'given user without age restriction when adding incorrect restrictions then bad request',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({ email: 'user@example.org', password: '', id: 'user' })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "ageRestriction": {
    "age": -12,
    "restriction": "ALLOW_ONLY"
  }
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given user with age restriction when removing restriction then restrictions are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({
          email: 'user@example.org',
          password: '',
          restrictions: new ContentRestrictions({
            ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }),
          }),
          id: 'user',
        })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "ageRestriction": null
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(nn(self).restrictions.ageRestriction).toBeNull()
      }),
    )

    it(
      'given user with age restriction when changing restriction then restrictions are updated',
      withMockCustomUser({ id: 'admin', roles: ['ADMIN'] }, async () => {
        const user = new KomgaUser({
          email: 'user@example.org',
          password: '',
          restrictions: new ContentRestrictions({
            ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }),
          }),
          id: 'user',
        })
        userLifecycle.createUser(user)

        // language=JSON
        const jsonString = `{
  "ageRestriction": {
    "age": 16,
    "restriction": "EXCLUDE"
  }
}`

        await mockMvc
          .patch(`/api/v2/users/${user.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isNoContent())
          })

        const self = userRepository.findByIdOrNull(user.id)
        expect(self).not.toBeNull()
        expect(nn(self).restrictions.ageRestriction).not.toBeNull()
        expect(nn(nn(self).restrictions.ageRestriction).age).toBe(16)
        expect(nn(nn(self).restrictions.ageRestriction).restriction).toBe(AllowExclude.EXCLUDE)
      }),
    )
  })

  describe('ApiKey', () => {
    afterEach(() => {
      userRepository.deleteApiKeyByUserId(admin.id)
    })

    it(
      'given user when creating API key then it is returned in plain text',
      withMockCustomUser({ id: 'admin' }, async () => {
        // language=JSON
        const jsonString = `{
  "comment": "test api key"
}`

        await mockMvc
          .post('/api/v2/users/me/api-keys', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isOk())
            it.jsonPath('$.userId', (j) => j.value(admin.id))
            it.jsonPath('$.key', (j) => j.value(MatchesPattern(/[^*]+/)))
            it.jsonPath('$.comment', (j) => j.value('test api key'))
          })

        const keys = userRepository.findApiKeyByUserId(admin.id)
        expect(keys).toHaveLength(1)
        const first = keys[0] as (typeof keys)[number]
        expect(first.userId).toBe(admin.id)
        expect(first.comment).toBe('test api key')

        await mockMvc.get('/api/v2/users/me/api-keys').andExpect((it) => {
          it.status((s) => s.isOk())
          it.jsonPath('$.length()', (j) => j.value(1))
          it.jsonPath('$[0].userId', (j) => j.value(admin.id))
          it.jsonPath('$[0].key', (j) => j.value(MatchesPattern(/[*]+/)))
          it.jsonPath('$[0].comment', (j) => j.value('test api key'))
        })
      }),
    )

    it(
      'given user when creating API key without comment then returns bad request',
      withMockCustomUser({ id: 'admin' }, async () => {
        // language=JSON
        const jsonString = `{
  "comment": ""
}`

        await mockMvc
          .post('/api/v2/users/me/api-keys', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((it) => {
            it.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given user with api key when deleting API key then it is deleted',
      withMockCustomUser({ id: 'admin' }, async () => {
        const apiKey = nn(userLifecycle.createApiKey(admin, 'test'))

        await mockMvc.delete(`/api/v2/users/me/api-keys/${apiKey.id}`).andExpect((it) => {
          it.status((s) => s.isNoContent())
        })

        expect(userRepository.findApiKeyByUserId(admin.id)).toHaveLength(0)
      }),
    )

    it(
      'given user with api key when deleting different API key ID then returns bad request',
      withMockCustomUser({ id: 'admin' }, async () => {
        nn(userLifecycle.createApiKey(admin, 'test'))

        await mockMvc.delete('/api/v2/users/me/api-keys/abc123').andExpect((it) => {
          it.status((s) => s.isNotFound())
        })

        expect(userRepository.findApiKeyByUserId(admin.id).length).toBeGreaterThan(0)
      }),
    )
  })
})
