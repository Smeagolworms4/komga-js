// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/OAuth2ControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, it } from 'vitest'
import { MockMvc, closeContext, mockMvcTest, withAnonymousUser } from '../../../support/mockmvc.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
// @ActiveProfiles("test")
describe('OAuth2ControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)

  afterAll(() => closeContext(ctx))

  it(
    'given anonymous user when getting oauth2 providers then returns OK',
    withAnonymousUser(async () => {
      await mockMvc.get('/api/v1/oauth2/providers').andExpect((it) => {
        it.status((s) => s.isOk())
      })
    }),
  )
})
