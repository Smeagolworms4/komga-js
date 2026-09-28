// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/ActuatorTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, it } from 'vitest'
import { MockMvc, closeContext, mockMvcTest, withAnonymousUser, withMockUser } from '../../../support/mockmvc.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
// @ActiveProfiles("test")
describe('ActuatorTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)

  afterAll(() => closeContext(ctx))

  it(
    'given anonymous user when getting actuator endpoints then returns unauthorized',
    withAnonymousUser(async () => {
      await mockMvc.get('/actuator').andExpect((it) => {
        it.status((s) => s.isUnauthorized())
      })

      await mockMvc.get('/actuator/beans').andExpect((it) => {
        it.status((s) => s.isUnauthorized())
      })
    }),
  )

  it(
    'given anonymous user when getting actuator health endpoint then returns ok',
    withAnonymousUser(async () => {
      await mockMvc.get('/actuator/health').andExpect((it) => {
        it.status((s) => s.isOk())
      })
    }),
  )

  it(
    'given regular user when getting actuator endpoints then returns forbidden',
    withMockUser(async () => {
      await mockMvc.get('/actuator').andExpect((it) => {
        it.status((s) => s.isForbidden())
      })

      await mockMvc.get('/actuator/beans').andExpect((it) => {
        it.status((s) => s.isForbidden())
      })
    }),
  )

  it(
    'given admin user when getting actuator endpoints then returns ok',
    withMockUser({ roles: ['ADMIN'] }, async () => {
      await mockMvc.get('/actuator').andExpect((it) => {
        it.status((s) => s.isOk())
      })

      await mockMvc.get('/actuator/beans').andExpect((it) => {
        it.status((s) => s.isOk())
      })
    }),
  )
})
