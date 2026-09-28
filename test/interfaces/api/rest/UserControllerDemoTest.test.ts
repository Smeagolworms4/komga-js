// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/UserControllerDemoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, it } from 'vitest'
import { MediaType } from '../../../../src/port/spring-web.js'
import { MockMvc, closeContext, mockMvcTest } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
// @ActiveProfiles("demo", "test")
describe('UserControllerDemoTest', () => {
  const ctx = mockMvcTest({}, [], { profiles: ['demo', 'test'] })
  const mockMvc = ctx.getBean(MockMvc)

  afterAll(() => closeContext(ctx))

  it(
    'given demo profile is active when a user tries to update its password via api then returns forbidden',
    withMockCustomUser(async () => {
      // language=JSON
      const jsonString = '{"password":"new"}'

      await mockMvc
        .patch('/api/v2/users/me/password', (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = jsonString
        })
        .andExpect((it) => {
          it.status((s) => s.isForbidden())
        })
    }),
  )

  it(
    'given demo profile is active when a user tries to retrieve own authentication activity then returns forbidden',
    withMockCustomUser(async () => {
      await mockMvc.get('/api/v2/users/me/authentication-activity').andExpect((it) => {
        it.status((s) => s.isForbidden())
      })
    }),
  )
})
