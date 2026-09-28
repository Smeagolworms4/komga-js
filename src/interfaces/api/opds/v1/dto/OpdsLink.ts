// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v1/dto/OpdsLink.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import { json } from '../../../../../port/jackson.js'
import { jsonFormatLocalDateTime } from '../../../../../port/jackson-format.js'
import { jsonProperties } from '../../../../../port/jackson-mapper.js'
import { jacksonXml } from '../../../../../port/jackson-xml.js'
import { OPDS_PSE } from './XmlNamespaces.js'

// PORT: paramètres du constructeur nommés (objet)
export class OpdsLink {
  // @get:JacksonXmlProperty(isAttribute = true)
  readonly type: string
  // @get:JacksonXmlProperty(isAttribute = true)
  readonly rel: string
  // @get:JacksonXmlProperty(isAttribute = true)
  readonly href: string

  constructor({ type, rel, href }: { type: string; rel: string; href: string }) {
    this.type = type
    this.rel = rel
    this.href = href
  }
}

// @JsonSerialize(`as` = OpdsLink::class)
export class OpdsLinkFeedNavigation extends OpdsLink {
  constructor({ rel, href }: { rel: string; href: string }) {
    super({
      type: 'application/atom+xml;profile=opds-catalog;kind=navigation',
      rel: rel,
      href: href,
    })
  }
}

// @JsonSerialize(`as` = OpdsLink::class)
export class OpdsLinkFeedAcquisition extends OpdsLink {
  constructor({ rel, href }: { rel: string; href: string }) {
    super({
      type: 'application/atom+xml;profile=opds-catalog;kind=acquisition',
      rel: rel,
      href: href,
    })
  }
}

// @JsonSerialize(`as` = OpdsLink::class)
export class OpdsLinkImage extends OpdsLink {
  constructor({ mediaType, href }: { mediaType: string; href: string }) {
    super({
      type: mediaType,
      rel: 'http://opds-spec.org/image',
      href: href,
    })
  }
}

// @JsonSerialize(`as` = OpdsLink::class)
export class OpdsLinkImageThumbnail extends OpdsLink {
  constructor({ mediaType, href }: { mediaType: string; href: string }) {
    super({
      type: mediaType,
      rel: 'http://opds-spec.org/image/thumbnail',
      href: href,
    })
  }
}

// @JsonSerialize(`as` = OpdsLink::class)
export class OpdsLinkFileAcquisition extends OpdsLink {
  constructor({ mediaType, href }: { mediaType: string | null; href: string }) {
    super({
      type: mediaType ?? 'application/octet-stream',
      rel: 'http://opds-spec.org/acquisition',
      href: href,
    })
  }
}

// @JsonSerialize(`as` = OpdsLink::class)
export class OpdsLinkSearch extends OpdsLink {
  constructor({ href }: { href: string }) {
    super({
      type: 'application/opensearchdescription+xml',
      rel: 'search',
      href: href,
    })
  }
}

export class OpdsLinkPageStreaming extends OpdsLink {
  // @get:JacksonXmlProperty(isAttribute = true, namespace = OPDS_PSE)
  readonly count: number
  // @get:JacksonXmlProperty(isAttribute = true, namespace = OPDS_PSE)
  readonly lastRead: number | null
  // @get:JacksonXmlProperty(isAttribute = true, namespace = OPDS_PSE)
  // @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'")
  readonly lastReadDate: LocalDateTime | null

  constructor({
    mediaType,
    href,
    count,
    lastRead,
    lastReadDate,
  }: {
    mediaType: string
    href: string
    count: number
    lastRead: number | null
    lastReadDate: LocalDateTime | null
  }) {
    super({
      type: mediaType,
      rel: 'http://vaemendis.net/opds-pse/stream',
      href: href,
    })
    this.count = count
    this.lastRead = lastRead
    this.lastReadDate = lastReadDate
  }
}

jacksonXml(OpdsLink, { isAttribute: ['type', 'rel', 'href'] })
jsonProperties(OpdsLink, { type: 'String', rel: 'String', href: 'String' })
json(OpdsLinkFeedNavigation, { serializeAs: OpdsLink })
json(OpdsLinkFeedAcquisition, { serializeAs: OpdsLink })
json(OpdsLinkImage, { serializeAs: OpdsLink })
json(OpdsLinkImageThumbnail, { serializeAs: OpdsLink })
json(OpdsLinkFileAcquisition, { serializeAs: OpdsLink })
json(OpdsLinkSearch, { serializeAs: OpdsLink })
jacksonXml(OpdsLinkPageStreaming, { isAttribute: ['count', 'lastRead', 'lastReadDate'], namespace: { count: OPDS_PSE, lastRead: OPDS_PSE, lastReadDate: OPDS_PSE } })
// PORT: propriétés du constructeur (réflexion Kotlin) : `mediaType` n'est pas une propriété, `href` correspond à celle d'OpdsLink
jsonProperties(OpdsLinkPageStreaming, {
  href: 'String',
  count: 'Int',
  lastRead: { nullable: 'Int' },
  lastReadDate: { nullable: jsonFormatLocalDateTime("yyyy-MM-dd'T'HH:mm:ss'Z'") },
})
