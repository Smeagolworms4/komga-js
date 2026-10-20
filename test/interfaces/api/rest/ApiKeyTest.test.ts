// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/ApiKeyTest.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { nn } from '../../../../src/port/kotlin.js'
import { JdbcIndexedSessionRepository } from '../../../../src/port/spring-session-jdbc.js'
import { MockMvc, closeContext, mockMvcTest } from '../../../support/mockmvc.js'
import { any, clearMocks, verify } from '../../../support/mockk.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('ApiKeyTest', () => {
  // @SpykBean mockSessionRepository: FindByIndexNameSessionRepository<*>
  // PORT: espion sur JdbcIndexedSessionRepository, le type injecté dans le SessionRepositoryFilter (application-test.yml :
  // komga.jdbc-session-enabled = true)
  const ctx = mockMvcTest({}, [{ type: JdbcIndexedSessionRepository, spyk: true }])
  const mockSessionRepository = ctx.getBean(JdbcIndexedSessionRepository)
  const mockMvc = ctx.getBean(MockMvc)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const komgaUserLifecycle = ctx.getBean(KomgaUserLifecycle)

  const user1 = new KomgaUser({ email: 'user@example.org', password: 'password' })
  let apiKey: string

  beforeAll(() => {
    userRepository.insert(user1)
    apiKey = nn(komgaUserLifecycle.createApiKey(user1, 'test')).key
  })

  afterEach(() => {
    clearMocks(mockSessionRepository)
  })

  afterAll(async () => {
    komgaUserLifecycle.deleteUser(user1)
    await closeContext(ctx)
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

  it('given api key in X-API-Key header when getting user information then no session is created', async () => {
    const result = await mockMvc
      .get('/api/v2/users/me', (r) => {
        r.header('x-api-key', apiKey)
      })
      .andExpect((it) => {
        it.status((s) => s.isOk())
        it.header((h) => {
          h.doesNotExist('Set-Cookie')
        })
      })
      .andReturn()

    expect(result.request.getSession(false), 'No servlet HttpSession should be created on the request').toBeNull()

    verify({ exactly: 0 }, () => mockSessionRepository.createSession())
    verify({ exactly: 0 }, () => mockSessionRepository.findById(any()))
  })
})
