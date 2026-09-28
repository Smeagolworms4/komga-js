// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/xml/NamespaceXmlFactoryOracleTest.kt
import { LocalDateTime, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NamespaceXmlFactory } from '../../../../src/infrastructure/xml/NamespaceXmlFactory.js'
import { OpdsAuthor } from '../../../../src/interfaces/api/opds/v1/dto/OpdsAuthor.js'
import { OpdsEntryNavigation } from '../../../../src/interfaces/api/opds/v1/dto/OpdsEntry.js'
import { OpdsFeedNavigation } from '../../../../src/interfaces/api/opds/v1/dto/OpdsFeed.js'
import { OpdsLinkFeedNavigation, OpdsLinkPageStreaming } from '../../../../src/interfaces/api/opds/v1/dto/OpdsLink.js'
import { ATOM, OPDS_PSE, prefixToNamespace } from '../../../../src/interfaces/api/opds/v1/dto/XmlNamespaces.js'
import { Jackson2ObjectMapperBuilder, type XmlMapper } from '../../../../src/port/jackson-xml.js'
import { URI } from '../../../../src/port/java-net.js'
import { exceptionType, oracle, tempDir } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/xml/NamespaceXmlFactory')

const updated = ZonedDateTime.of(2021, 1, 2, 3, 4, 5, 0, ZoneOffset.UTC)

const feed = (title = 'Komga') =>
  new OpdsFeedNavigation({
    id: 'root',
    title,
    updated,
    author: new OpdsAuthor({ name: 'Komga', uri: new URI('https://komga.org') }),
    links: [
      new OpdsLinkFeedNavigation({ rel: 'self', href: '/opds/v1.2/catalog' }),
      new OpdsLinkPageStreaming({ mediaType: 'image/jpeg', href: '/page/{pageNumber}', count: 10, lastRead: 3, lastReadDate: LocalDateTime.of(2020, 5, 6, 7, 8, 9) }),
      new OpdsLinkPageStreaming({ mediaType: 'image/png', href: '/p', count: 0, lastRead: null, lastReadDate: null }),
    ],
    entries: [new OpdsEntryNavigation({ title: 'Entry', updated, id: 'e1', content: 'content', link: new OpdsLinkFeedNavigation({ rel: 'subsection', href: '/x?a=1&b=2' }) })],
  })

/** XmlMapper construit comme le Jackson2ObjectMapperBuilder de Spring Boot, avec la fabrique donnée */
const mapper = (factory: NamespaceXmlFactory): XmlMapper => new Jackson2ObjectMapperBuilder().createXmlMapper(true).factory(factory).build()

const factories = new Map<string, () => NamespaceXmlFactory>([
  ['no namespace', () => new NamespaceXmlFactory()],
  ['komga prefixes', () => new NamespaceXmlFactory({ prefixToNamespace })],
  ['default namespace atom', () => new NamespaceXmlFactory({ defaultNamespace: ATOM, prefixToNamespace })],
  ['default namespace other', () => new NamespaceXmlFactory({ defaultNamespace: 'urn:other' })],
  ['atom prefixed', () => new NamespaceXmlFactory({ prefixToNamespace: new Map([['atom', ATOM], ['pse', OPDS_PSE]]) })],
  ['unused prefix', () => new NamespaceXmlFactory({ prefixToNamespace: new Map([['x', 'urn:x']]) })],
  ['pse under another prefix', () => new NamespaceXmlFactory({ prefixToNamespace: new Map([['p', OPDS_PSE]]) })],
])

func('_createXmlWriter', () => {
  for (const [name, f] of factories) kase(name, () => mapper(f()).writeValueAsString(feed()))
  kase('escaped text', () => mapper(new NamespaceXmlFactory({ prefixToNamespace })).writeValueAsString(feed('<a & b> "c" \'d\' é\t\r\n]]>')))
  kase('invalid character', () => exceptionType(() => mapper(new NamespaceXmlFactory()).writeValueAsString(feed('bad \u0001'))))
})
func('createGenerator@23', () => {
  for (const [name, f] of factories) kase(name, () => Buffer.from(mapper(f()).writeValueAsBytes(feed())).toString('utf8'))
})
// PORT: createGenerator(OutputStream | Writer | File | XMLStreamWriter) -> writeValueAsString / writeValueAsBytes
func('createGenerator@28', () => {
  kase('komga prefixes', () => Buffer.from(mapper(new NamespaceXmlFactory({ prefixToNamespace })).writeValueAsBytes(feed())).toString('utf8'))
})
func('createGenerator@30', () => {
  kase('komga prefixes', () => mapper(new NamespaceXmlFactory({ prefixToNamespace })).writeValueAsString(feed()))
})
func('createGenerator@32', () => {
  kase('komga prefixes, file', () => {
    const file = join(tempDir(), 'feed.xml')
    writeFileSync(file, mapper(new NamespaceXmlFactory({ prefixToNamespace })).writeValueAsBytes(feed()))
    return readFileSync(file, 'utf8')
  })
})
func('createGenerator@37', () => {
  kase('komga prefixes, stax writer', () => mapper(new NamespaceXmlFactory({ prefixToNamespace })).writeValueAsString(feed()))
})
func('configure', () => {
  kase('default and prefixes', () => mapper(new NamespaceXmlFactory({ defaultNamespace: OPDS_PSE, prefixToNamespace: new Map([['a', ATOM]]) })).writeValueAsString(feed()))
  kase('empty prefix', () => mapper(new NamespaceXmlFactory({ prefixToNamespace: new Map([['', ATOM]]) })).writeValueAsString(feed()))
})
