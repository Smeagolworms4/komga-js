// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/SessionTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { KomgaUserRepository } from '../../../src/domain/persistence/KomgaUserRepository.js'
import { KomgaUserLifecycle } from '../../../src/domain/service/KomgaUserLifecycle.js'
import { nn } from '../../../src/port/kotlin.js'
import { MockMvc, closeContext, containsString, httpBasic, mockMvcTest } from '../../support/mockmvc.js'

const SET_COOKIE = 'Set-Cookie'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('SessionTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const sessionHeaderName = ctx.getBean<string>('sessionHeaderName')
  const sessionCookieName = ctx.getBean<string>('sessionCookieName')

  let user: KomgaUser

  const rememberMeCookieName = 'komga-remember-me'

  beforeAll(() => {
    user = new KomgaUser({ email: 'user@example.org', password: 'user' })
    userLifecycle.createUser(user)
  })

  afterAll(async () => {
    for (const it of userRepository.findAll()) {
      userLifecycle.deleteUser(it)
    }
    await closeContext(ctx)
  })

  it('given valid basic credentials when hitting an endpoint then session cookie is returned', async () => {
    await mockMvc
      .get('/api/v2/users/me', (r) => {
        r.with(httpBasic(user.email, user.password))
      })
      .andExpect((it) => {
        it.header((h) => {
          h.string(SET_COOKIE, containsString(`${sessionCookieName}=`))
        })
        it.cookie((c) => {
          c.exists(sessionCookieName)
          c.httpOnly(sessionCookieName, true)
        })
      })
  })

  it('given remember-me parameter when hitting an endpoint then remember-me cookie is returned', async () => {
    await mockMvc
      .get('/api/v2/users/me', (r) => {
        r.with(httpBasic(user.email, user.password))
        r.param('remember-me', 'true')
      })
      .andExpect((it) => {
        it.header((h) => {
          h.string(SET_COOKIE, containsString(`${rememberMeCookieName}=`))
        })
        it.cookie((c) => {
          c.exists(rememberMeCookieName)
          c.httpOnly(rememberMeCookieName, true)
        })
      })
  })

  it('given valid basic credentials when providing the auth header then session is returned in headers', async () => {
    await mockMvc
      .get('/api/v2/users/me', (r) => {
        r.with(httpBasic(user.email, user.password))
        r.header(sessionHeaderName, '')
      })
      .andExpect((it) => {
        it.header((h) => {
          h.exists(sessionHeaderName)
        })
      })
  })

  it('given existing session when exchanging for cookies then session is returned in cookies', async () => {
    const sessionId = (
      await mockMvc
        .get('/api/v2/users/me', (r) => {
          r.with(httpBasic(user.email, user.password))
          r.header(sessionHeaderName, '')
        })
        .andReturn()
    ).response.getHeader(sessionHeaderName)

    expect(sessionId).not.toBeNull()

    await mockMvc
      .get('/api/v1/login/set-cookie', (r) => {
        r.header(sessionHeaderName, nn(sessionId))
      })
      .andExpect((it) => {
        it.header((h) => {
          h.string(SET_COOKIE, containsString(`${sessionCookieName}=`))
          h.doesNotExist(sessionHeaderName)
        })
        it.cookie((c) => {
          c.exists(sessionCookieName)
          c.httpOnly(sessionCookieName, true)
        })
      })
  })

  it('given existing session when logging out then session cookie is cleared', async () => {
    const sessionId = (
      await mockMvc
        .get('/api/v2/users/me', (r) => {
          r.with(httpBasic(user.email, user.password))
          r.header(sessionHeaderName, '')
        })
        .andReturn()
    ).response.getHeader(sessionHeaderName)

    expect(sessionId).not.toBeNull()

    await mockMvc
      .get('/api/logout', (r) => {
        r.header(sessionHeaderName, nn(sessionId))
      })
      .andExpect((it) => {
        it.header((h) => {
          h.string(SET_COOKIE, containsString(`${sessionCookieName}=;`))
        })
        it.cookie((c) => {
          c.maxAge(sessionCookieName, 0)
        })
      })
  })
})
