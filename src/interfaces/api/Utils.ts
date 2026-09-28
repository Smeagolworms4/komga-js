// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/Utils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ZoneOffset } from '@js-joda/core'
import type { Media } from '../../domain/model/Media.js'
import { setCachePrivate } from '../../infrastructure/web/Utils.js'
import type { BodyBuilder } from '../../port/spring-web.js'

export function getBookLastModified(media: Media): number {
  return media.lastModifiedDate.toInstant(ZoneOffset.UTC).toEpochMilli()
}

export function setNotModified(self: BodyBuilder, media: Media): BodyBuilder {
  return setCachePrivate(self).lastModified(getBookLastModified(media))
}
