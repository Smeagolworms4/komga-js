// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/FileSystemControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, it } from 'vitest'
import { MediaType } from '../../../../src/port/spring-web.js'
import { MockMvc, closeContext, mockMvcTest, withAnonymousUser, withMockUser } from '../../../support/mockmvc.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('FileSystemControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)

  afterAll(() => closeContext(ctx))

  const route = '/api/v1/filesystem'

  it(
    'given anonymous user when getDirectoryListing then return unauthorized',
    withAnonymousUser(async () => {
      await mockMvc.post(route).andExpect((it) => it.status((s) => s.isUnauthorized()))
    }),
  )

  it(
    'given regular user when getDirectoryListing then return forbidden',
    withMockUser(async () => {
      await mockMvc.post(route).andExpect((it) => it.status((s) => s.isForbidden()))
    }),
  )

  it(
    'given relative path param when getDirectoryListing then return bad request',
    withMockUser({ roles: ['ADMIN'] }, async () => {
      await mockMvc
        .post(route, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = '.'
        })
        .andExpect((it) => it.status((s) => s.isBadRequest()))
    }),
  )

  it(
    'given non-existent path param when getDirectoryListing then return bad request',
    withMockUser({ roles: ['ADMIN'] }, async () => {
      // @TempDir parent: Path
      const parent = mkdtempSync(join(tmpdir(), 'junit'))
      rmSync(parent, { recursive: true })

      await mockMvc
        .post(route, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = parent.toString()
        })
        .andExpect((it) => it.status((s) => s.isBadRequest()))
    }),
  )
})
