// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/mvc/ResourceNotFoundControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, it } from 'vitest'
import { withMockCustomUser } from '../api/rest/MockSpringSecurity.js'
import { MockMvc, closeContext, mockMvcTest } from '../../support/mockmvc.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('ResourceNotFoundControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)

  afterAll(() => closeContext(ctx))

  it(
    'when getting an unknown API endpoint then 404 is returned',
    withMockCustomUser(async () => {
      await mockMvc.get('/api/v1/doesnotexist').andExpect((it) => {
        it.status((s) => s.isNotFound())
      })
    }),
  )

  it(
    'when getting an unknown OPDS endpoint then 404 is returned',
    withMockCustomUser(async () => {
      await mockMvc.get('/opds/v2/doesnotexist').andExpect((it) => {
        it.status((s) => s.isNotFound())
      })
    }),
  )

  it(
    'when getting an unknown SSE endpoint then 404 is returned',
    withMockCustomUser(async () => {
      await mockMvc.get('/sse/v1/doesnotexist').andExpect((it) => {
        it.status((s) => s.isNotFound())
      })
    }),
  )

  it(
    'when getting an unknown endpoint then it is forwarded to index',
    withMockCustomUser(async () => {
      await mockMvc.get('/book/0DBTWY6S0KNX9').andExpect((it) => {
        it.status((s) => s.isOk())
      })
    }),
  )
})
