// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/kosync/KoreaderSyncControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, beforeAll, describe, it } from 'vitest'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { nn } from '../../../../src/port/kotlin.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { MockMvc, closeContext, mockMvcTest } from '../../../support/mockmvc.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('KoreaderSyncControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const komgaUserLifecycle = ctx.getBean(KomgaUserLifecycle)

  afterAll(() => closeContext(ctx))

  const user1 = new KomgaUser({
    email: 'user@example.org',
    password: '',
    roles: new Set([UserRoles.KOREADER_SYNC]),
  })
  let apiKey: string

  beforeAll(() => {
    userRepository.insert(user1)
    apiKey = nn(komgaUserLifecycle.createApiKey(user1, 'test')).key
  })

  afterAll(() => {
    komgaUserLifecycle.deleteUser(user1)
  })

  it('when creating user then forbidden is thrown', async () => {
    await mockMvc.post('/koreader/users/create').andExpect((it) => {
      it.status((s) => s.isForbidden())
    })
  })

  it('given missing X-Auth-User header when authenticating user then forbidden is thrown', async () => {
    await mockMvc.get('/koreader/users/auth').andExpect((it) => {
      it.status((s) => s.isForbidden())
    })
  })

  it('given api key in X-Auth-User header when authenticating user then returns OK', async () => {
    await mockMvc
      .get('/koreader/users/auth', (r) => {
        r.header('x-auth-user', apiKey)
      })
      .andExpect((it) => {
        it.status((s) => s.isOk())
        it.jsonPath('authorized', (j) => j.value('OK'))
      })
  })

  // @ParameterizedTest
  // @ValueSource(strings = [MediaType.APPLICATION_JSON_VALUE, "application/vnd.koreader.v1+json"])
  it.each([MediaType.APPLICATION_JSON_VALUE, 'application/vnd.koreader.v1+json'])('given accept header when calling API user then returns OK', async (acceptHeader) => {
    await mockMvc
      .get('/koreader/users/auth', (r) => {
        r.header('x-auth-user', apiKey)
        r.header('Accept', acceptHeader)
      })
      .andExpect((it) => {
        it.status((s) => s.isOk())
        it.jsonPath('authorized', (j) => j.value('OK'))
      })
  })
})
