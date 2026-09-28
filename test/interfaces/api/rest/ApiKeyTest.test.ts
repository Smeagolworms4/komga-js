// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/ApiKeyTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, beforeAll, describe, it } from 'vitest'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { nn } from '../../../../src/port/kotlin.js'
import { MockMvc, closeContext, mockMvcTest } from '../../../support/mockmvc.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('ApiKeyTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const komgaUserLifecycle = ctx.getBean(KomgaUserLifecycle)

  const user1 = new KomgaUser({ email: 'user@example.org', password: 'password' })
  let apiKey: string

  beforeAll(() => {
    userRepository.insert(user1)
    apiKey = nn(komgaUserLifecycle.createApiKey(user1, 'test')).key
  })

  afterAll(() => {
    komgaUserLifecycle.deleteUser(user1)
    closeContext(ctx)
  })

  it('when getting user information then unauthorized is thrown', async () => {
    await mockMvc.get('/api/v2/users/me').andExpect((it) => {
      it.status((s) => s.isUnauthorized())
    })
  })

  it('given invalid api key in X-API-Key header when getting user information then unauthorized is thrown', async () => {
    await mockMvc
      .get('/api/v2/users/me', (r) => {
        r.header('x-api-key', 'abc123')
      })
      .andExpect((it) => {
        it.status((s) => s.isUnauthorized())
      })
  })

  it('given api key in X-API-Key header when getting user information then returns OK', async () => {
    await mockMvc
      .get('/api/v2/users/me', (r) => {
        r.header('x-api-key', apiKey)
      })
      .andExpect((it) => {
        it.status((s) => s.isOk())
        it.jsonPath('email', (j) => j.value(user1.email))
      })
  })
})
