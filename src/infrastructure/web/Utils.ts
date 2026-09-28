// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/Utils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { URL } from '../../port/java.js'
import { pathToUrl, urlToPath } from '../../port/java.js'
import { IllegalStateException } from '../../port/kotlin.js'
import type { HttpServletRequest } from '../../port/servlet.js'
import { type BodyBuilder, CacheControl, MediaType } from '../../port/spring-web.js'
import { RequestContextHolder } from '../../port/spring-web-dispatcher.js'
import { ParsedMediaType } from '../../port/media-type.js'

export function toFilePath(self: URL): string {
  return urlToPath(self)
}

export function filePathToUrl(filePath: string): URL {
  return pathToUrl(filePath)
}

export function setCachePrivate(self: BodyBuilder): BodyBuilder {
  return self.cacheControl(cachePrivate)
}

// PORT: CacheControl.maxAge(0, TimeUnit.SECONDS).cachePrivate().mustRevalidate() -> valeur de l'en-tête
export const cachePrivate = CacheControl.maxAge(0, { cachePrivate: true, mustRevalidate: true })

// PORT: MediaType -> chaîne (MediaType.toString())
export function getMediaTypeOrDefault(mediaTypeString: string | null): string {
  if (mediaTypeString !== null) {
    try {
      return ParsedMediaType.parse(mediaTypeString).toString()
    } catch {}
  }
  return MediaType.APPLICATION_OCTET_STREAM_VALUE
}

export function getCurrentRequest(): HttpServletRequest {
  return RequestContextHolder.getRequestAttributes()?.request ?? (() => { throw new IllegalStateException('Could not get current request') })()
}
