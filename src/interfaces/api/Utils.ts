// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/Utils.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { ZoneOffset } from '@js-joda/core'
import type { Media } from '../../domain/model/Media.js'
import { setCachePrivate } from '../../infrastructure/web/Utils.js'
import { PageRequest, Pageable } from '../../port/spring-data.js'
import type { BodyBuilder } from '../../port/spring-web.js'

export function getBookLastModified(media: Media): number {
  return media.lastModifiedDate.toInstant(ZoneOffset.UTC).toEpochMilli()
}

export function setNotModified(self: BodyBuilder, media: Media): BodyBuilder {
  return setCachePrivate(self).lastModified(getBookLastModified(media))
}

export function unpackPageParams(unpaged: boolean, page: Pageable): Pageable {
  if (unpaged) return Pageable.unpaged()
  else return PageRequest.of(page.pageNumber, page.pageSize)
}
