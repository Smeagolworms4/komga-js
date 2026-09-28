// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v1/dto/OpdsFeed.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { json } from '../../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../../port/jackson-mapper.js'
import { jacksonXml } from '../../../../../port/jackson-xml.js'
import { OpdsAuthor } from './OpdsAuthor.js'
import { OpdsEntry, type OpdsEntryAcquisition, type OpdsEntryNavigation } from './OpdsEntry.js'
import { OpdsLink } from './OpdsLink.js'
import { ATOM } from './XmlNamespaces.js'

type OpdsFeedParams<E extends OpdsEntry> = {
  id: string
  title: string
  updated: ZonedDateTime
  author: OpdsAuthor
  links: OpdsLink[]
  entries: E[]
}

// @JacksonXmlRootElement(localName = "feed", namespace = ATOM)
// PORT: paramètres du constructeur nommés (objet)
export abstract class OpdsFeed {
  // @JacksonXmlProperty(namespace = ATOM)
  readonly id: string
  // @JacksonXmlProperty(namespace = ATOM)
  readonly title: string
  // @JacksonXmlProperty(namespace = ATOM)
  readonly updated: ZonedDateTime
  // @JacksonXmlProperty(namespace = ATOM)
  readonly author: OpdsAuthor
  // @JacksonXmlElementWrapper(useWrapping = false)
  // @JacksonXmlProperty(localName = "link", namespace = ATOM)
  readonly links: OpdsLink[]
  // @JacksonXmlElementWrapper(useWrapping = false)
  // @JacksonXmlProperty(localName = "entry", namespace = ATOM)
  readonly entries: OpdsEntry[]

  constructor({ id, title, updated, author, links, entries }: OpdsFeedParams<OpdsEntry>) {
    this.id = id
    this.title = title
    this.updated = updated
    this.author = author
    this.links = links
    this.entries = entries
  }
}

// @JsonSerialize(`as` = OpdsFeed::class)
export class OpdsFeedNavigation extends OpdsFeed {
  constructor(params: OpdsFeedParams<OpdsEntryNavigation>) {
    super(params)
  }
}

// @JsonSerialize(`as` = OpdsFeed::class)
export class OpdsFeedAcquisition extends OpdsFeed {
  constructor(params: OpdsFeedParams<OpdsEntryAcquisition>) {
    super(params)
  }
}

jacksonXml(OpdsFeed, {
  rootElement: 'feed',
  rootNamespace: ATOM,
  namespace: { id: ATOM, title: ATOM, updated: ATOM, author: ATOM, links: ATOM, entries: ATOM },
  localName: { links: 'link', entries: 'entry' },
  wrapper: { links: { useWrapping: false }, entries: { useWrapping: false } },
})
jsonProperties(OpdsFeed, {
  id: 'String',
  title: 'String',
  updated: JsonTypes.ZonedDateTime,
  author: { class: OpdsAuthor },
  links: { list: { class: OpdsLink } },
  entries: { list: { class: OpdsEntry } },
})
json(OpdsFeedNavigation, { serializeAs: OpdsFeed })
json(OpdsFeedAcquisition, { serializeAs: OpdsFeed })
