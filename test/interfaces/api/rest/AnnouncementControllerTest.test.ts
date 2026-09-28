// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/AnnouncementControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core'
import { afterAll, describe, it } from 'vitest'
import { AnnouncementController } from '../../../../src/interfaces/api/rest/AnnouncementController.js'
import { JsonFeedDto } from '../../../../src/interfaces/api/rest/dto/JsonFeedDto.js'
import { every, verify } from '../../../support/mockk.js'
import { MockMvc, closeContext, mockMvcTest } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

// @SpringBootTest
// @AutoConfigureMockMvc(printOnlyOnFailure = false)
describe('AnnouncementControllerTest', () => {
  // @SpykBean
  // private lateinit var announcementController: AnnouncementController
  const ctx = mockMvcTest({}, [{ type: AnnouncementController, spyk: true }])
  const mockMvc = ctx.getBean(MockMvc)
  const announcementController = ctx.getBean(AnnouncementController)

  afterAll(() => closeContext(ctx))

  const mockFeed = new JsonFeedDto({
    version: 'https://jsonfeed.org/version/1',
    title: 'Announcements',
    homePageUrl: 'https://komga.org/blog',
    description: 'Latest Komga announcements',
    items: [
      new JsonFeedDto.ItemDto({
        id: 'https://komga.org/blog/prepare-v1',
        url: 'https://komga.org/blog/prepare-v1',
        title: 'Prepare for v1.0.0',
        summary: 'The future v1.0.0 will bring some breaking changes, this guide will help you to prepare for the next major version.',
        contentHtml: `You can still change the port <a href="/docs/installation/configuration#server_port--serverport-port">through configuration</a>
Another link <a href="/blog/post/">here</a>.
A normal <a href="https://google.com">link</a>.`,
        dateModified: OffsetDateTime.of(LocalDate.of(2023, 3, 21).atStartOfDay(), ZoneOffset.UTC),
        author: new JsonFeedDto.ItemAuthorDto({ name: 'gotson', url: 'https://github.com/gotson' }),
        tags: new Set(['breaking change', 'upgrade', 'komga']),
        komgaExtension: null,
      }),
    ],
  })

  it(
    'when getting announcements multiple times then the server announcements are only fetched once',
    withMockCustomUser({ roles: ['ADMIN'] }, async () => {
      // PORT: fetchWebsiteAnnouncements est asynchrone
      every(() => announcementController.fetchWebsiteAnnouncements()).returns(Promise.resolve(mockFeed))

      for (let i = 0; i < 2; i++) {
        await mockMvc.get('/api/v1/announcements').andExpect((it) => {
          it.status((s) => s.isOk())
          it.jsonPath('$.items.length()', (j) => j.value(1))
          it.jsonPath('$.items[0].date_modified', (j) => j.value('2023-03-21T00:00:00Z'))
        })
      }

      verify({ exactly: 1 }, () => announcementController.fetchWebsiteAnnouncements())
    }),
  )
})
