// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/FontsControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, it } from 'vitest'
import { MockMvc, closeContext, mockMvcTest } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('FontsControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)

  afterAll(() => closeContext(ctx))

  it(
    'when getting font families then the embedded fonts are returned',
    withMockCustomUser(async () => {
      await mockMvc.get('/api/v1/fonts/families').andExpect((it) => {
        it.status((s) => s.isOk())
        it.jsonPath('$.length()', (j) => j.value(1))
        it.jsonPath('$[0]', (j) => j.value('OpenDyslexic'))
      })
    }),
  )

  it(
    'when getting font file then the content type headers are correct',
    withMockCustomUser(async () => {
      await mockMvc.get('/api/v1/fonts/resource/OpenDyslexic/OpenDyslexic-Bold.woff').andExpect((it) => {
        it.status((s) => s.isOk())
        it.header((h) => {
          h.string('Content-Type', 'font/woff')
        })
      })
    }),
  )

  it(
    'when getting font css file then the content is correct',
    withMockCustomUser(async () => {
      await mockMvc.get('/api/v1/fonts/resource/OpenDyslexic/css').andExpect((it) => {
        it.status((s) => s.isOk())
        it.header((h) => {
          h.string('Content-Type', 'text/css')
        })
        it.content((c) => {
          c.string(
            `@font-face {
    font-family: 'OpenDyslexic';
    src: url('OpenDyslexic-Bold-Italic.woff') format('woff'),url('OpenDyslexic-Bold-Italic.woff2') format('woff2');
    font-weight: bold;
    font-style: italic;
}

@font-face {
    font-family: 'OpenDyslexic';
    src: url('OpenDyslexic-Bold.woff') format('woff'),url('OpenDyslexic-Bold.woff2') format('woff2');
    font-weight: bold;
    font-style: normal;
}

@font-face {
    font-family: 'OpenDyslexic';
    src: url('OpenDyslexic-Italic.woff') format('woff'),url('OpenDyslexic-Italic.woff2') format('woff2');
    font-weight: normal;
    font-style: italic;
}

@font-face {
    font-family: 'OpenDyslexic';
    src: url('OpenDyslexic-Regular.woff') format('woff'),url('OpenDyslexic-Regular.woff2') format('woff2');
    font-weight: normal;
    font-style: normal;
}
`,
          )
        })
      })
    }),
  )
})
