// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v1/dto/OpdsEntry.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { json } from '../../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../../port/jackson-mapper.js'
import { jacksonXml } from '../../../../../port/jackson-xml.js'
import { OpdsAuthor } from './OpdsAuthor.js'
import { OpdsLink } from './OpdsLink.js'
import { ATOM } from './XmlNamespaces.js'

type OpdsEntryParams = {
  title: string
  updated: ZonedDateTime
  id: string
  content: string
}

// PORT: paramètres du constructeur nommés (objet)
export abstract class OpdsEntry {
  // @get:JacksonXmlProperty(namespace = ATOM)
  readonly title: string
  // @get:JacksonXmlProperty(namespace = ATOM)
  readonly updated: ZonedDateTime
  // @get:JacksonXmlProperty(namespace = ATOM)
  readonly id: string

  // @get:JacksonXmlProperty(namespace = ATOM)
  readonly content: string

  constructor({ title, updated, id, content }: OpdsEntryParams) {
    this.title = title
    this.updated = updated
    this.id = id
    this.content = content.replaceAll('\n', '<br/>')
  }
}

type OpdsEntryNavigationParams = OpdsEntryParams & {
  link: OpdsLink
}

export class OpdsEntryNavigation extends OpdsEntry {
  // @JacksonXmlProperty(namespace = ATOM)
  readonly link: OpdsLink

  constructor({ title, updated, id, content, link }: OpdsEntryNavigationParams) {
    super({ title, updated, id, content })
    this.link = link
  }
}

type OpdsEntryAcquisitionParams = OpdsEntryParams & {
  authors?: OpdsAuthor[]
  links: OpdsLink[]
}

export class OpdsEntryAcquisition extends OpdsEntry {
  // @JacksonXmlElementWrapper(useWrapping = false)
  // @JacksonXmlProperty(localName = "author", namespace = ATOM)
  readonly authors: OpdsAuthor[]
  // @JacksonXmlElementWrapper(useWrapping = false)
  // @JacksonXmlProperty(localName = "link", namespace = ATOM)
  readonly links: OpdsLink[]

  constructor({ title, updated, id, content, authors = [], links }: OpdsEntryAcquisitionParams) {
    super({ title, updated, id, content })
    this.authors = authors
    this.links = links
  }
}

// @JsonInclude(JsonInclude.Include.NON_NULL)
json(OpdsEntry, { include: 'NON_NULL' })
jacksonXml(OpdsEntry, { namespace: { title: ATOM, updated: ATOM, id: ATOM, content: ATOM } })
jacksonXml(OpdsEntryNavigation, { namespace: { link: ATOM } })
jacksonXml(OpdsEntryAcquisition, {
  namespace: { authors: ATOM, links: ATOM },
  localName: { authors: 'author', links: 'link' },
  wrapper: { authors: { useWrapping: false }, links: { useWrapping: false } },
})
// PORT: propriétés du constructeur (réflexion Kotlin) : le paramètre `content` correspond à la propriété `content`
jsonProperties(OpdsEntryNavigation, { title: 'String', updated: JsonTypes.ZonedDateTime, id: 'String', content: 'String', link: { class: OpdsLink } })
jsonProperties(OpdsEntryAcquisition, {
  title: 'String',
  updated: JsonTypes.ZonedDateTime,
  id: 'String',
  content: 'String',
  authors: { list: { class: OpdsAuthor } },
  links: { list: { class: OpdsLink } },
})
