// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/ClaimControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, it } from 'vitest'
import { MockMvc, closeContext, mockMvcTest, withAnonymousUser } from '../../../support/mockmvc.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('ClaimControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)

  afterAll(() => closeContext(ctx))

  // @ParameterizedTest
  // @ValueSource(strings = ["user", "user@domain"])
  it.each(['user', 'user@domain'])('given unclaimed server when claiming with invalid email address then returns bad request', async (email) => {
    const password = 'password'

    await mockMvc
      .post('/api/v1/claim', (r) => {
        r.header('X-Komga-Email', email)
        r.header('X-Komga-Password', password)
      })
      .andExpect((it) => {
        it.status((s) => s.isBadRequest())
      })
  })

  it(
    'given anonymous user when getting claim status then returns OK',
    withAnonymousUser(async () => {
      await mockMvc.get('/api/v1/claim').andExpect((it) => {
        it.status((s) => s.isOk())
      })
    }),
  )
})
