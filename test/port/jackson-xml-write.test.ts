// Oracle (sans jumeau Kotlin) : écriture XML (XmlMapper de Komga, NamespaceXmlFactory, DTO OPDS v1) comparée octet pour octet
// à MappingJackson2XmlHttpMessageConverter de Komga (fixtures/jackson-xml-write.jsh -> fixtures/jackson-xml-write-oracle.json).
import { readFileSync } from 'node:fs'
import { LocalDateTime, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { describe, expect, it } from 'vitest'
import { NamespaceXmlFactory } from '../../src/infrastructure/xml/NamespaceXmlFactory.js'
import { OpdsAuthor } from '../../src/interfaces/api/opds/v1/dto/OpdsAuthor.js'
import { OpdsEntryAcquisition, OpdsEntryNavigation } from '../../src/interfaces/api/opds/v1/dto/OpdsEntry.js'
import { OpdsFeed, OpdsFeedAcquisition, OpdsFeedNavigation } from '../../src/interfaces/api/opds/v1/dto/OpdsFeed.js'
import {
  type OpdsLink,
  OpdsLinkFeedNavigation,
  OpdsLinkFileAcquisition,
  OpdsLinkPageStreaming,
  OpdsLinkSearch,
} from '../../src/interfaces/api/opds/v1/dto/OpdsLink.js'
import { OpenSearchDescription } from '../../src/interfaces/api/opds/v1/dto/OpenSearchDescription.js'
import { prefixToNamespace } from '../../src/interfaces/api/opds/v1/dto/XmlNamespaces.js'
import { Jackson2ObjectMapperBuilder } from '../../src/port/jackson-xml.js'
import { URI } from '../../src/port/java-net.js'

const oracle = JSON.parse(readFileSync(new URL('fixtures/jackson-xml-write-oracle.json', import.meta.url), 'utf8')) as Record<string, string>
const m = new Jackson2ObjectMapperBuilder().createXmlMapper(true).factory(new NamespaceXmlFactory({ prefixToNamespace })).build()

describe('XmlMapper.writeValueAsString', () => {
  const zdt = ZonedDateTime.of(2024, 3, 5, 7, 8, 9, 120000000, ZoneOffset.ofHours(1))
  const t = `x]>y <b> & "q" 's'\r\n\t\u007f \u{1F600}>z`

  it('feed with entries, authors, links, escaping and pse namespace', () => {
    const links: OpdsLink[] = [
      new OpdsLinkFeedNavigation({ rel: 'self', href: 'http://h/a?b=1&c=2' }),
      new OpdsLinkPageStreaming({ mediaType: 'image/jpeg', href: 'http://h/p/{pageNumber}', count: 3, lastRead: 2, lastReadDate: LocalDateTime.of(2024, 1, 2, 3, 4, 5, 600) }),
      new OpdsLinkPageStreaming({ mediaType: 'image/png', href: 'u', count: 1, lastRead: null, lastReadDate: null }),
      new OpdsLinkFileAcquisition({ mediaType: null, href: `f\u007f\u0085\r\n\t<>&"'` }),
    ]
    const e1 = new OpdsEntryAcquisition({
      title: t,
      updated: zdt,
      id: 'id1',
      content: 'line1\nline2',
      authors: [new OpdsAuthor({ name: 'A1', uri: null }), new OpdsAuthor({ name: 'A2', uri: new URI('http://x') })],
      links,
    })
    const feed = new OpdsFeedAcquisition({
      id: 'fid',
      title: t,
      updated: zdt,
      author: new OpdsAuthor({ name: 'Komga', uri: new URI('https://github.com/gotson/komga') }),
      links: [new OpdsLinkSearch({ href: 's' })],
      entries: [e1],
    })
    expect(m.writeValueAsString(feed, { class: OpdsFeed })).toBe(oracle.FEED1)
  })

  it('navigation feed without links', () => {
    const e2 = new OpdsEntryNavigation({
      title: 'nav',
      updated: zdt.withZoneSameInstant(ZoneOffset.UTC).withNano(0),
      id: 'id2',
      content: '',
      link: new OpdsLinkFeedNavigation({ rel: 'subsection', href: 'http://h/s' }),
    })
    const feed2 = new OpdsFeedNavigation({ id: 'fid2', title: 'T', updated: zdt, author: new OpdsAuthor({ name: 'Komga', uri: null }), links: [], entries: [e2] })
    expect(m.writeValueAsString(feed2, { class: OpdsFeed })).toBe(oracle.FEED2)
  })

  it('open search description', () => {
    const osd = new OpenSearchDescription({
      shortName: 'Search',
      description: 'Search for series',
      inputEncoding: 'UTF-8',
      outputEncoding: 'UTF-8',
      url: new OpenSearchDescription.OpenSearchUrl({ template: 'http://h/series?search={searchTerms}' }),
    })
    expect(m.writeValueAsString(osd, { class: OpenSearchDescription })).toBe(oracle.OSD)
  })

  it('error attributes map', () => {
    const map = new Map<string, unknown>([
      ['timestamp', '1970-01-01T00:00:00.000+00:00'],
      ['status', 404],
      ['error', 'Not Found'],
      ['message', null],
      ['path', '/x'],
    ])
    expect(m.writeValueAsString(map)).toBe(oracle.MAP)
  })
})
