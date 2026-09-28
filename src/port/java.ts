// Support de portage : équivalents java.net / java.nio.file utilisés par Komga.
// Ce fichier n'a pas de jumeau Kotlin.
// Un `java.nio.file.Path` est représenté par une chaîne de chemin absolu ou relatif (module node:path).
import { existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** `url.toURI().toPath()` */
export function urlToPath(url: URL): string {
  return fileURLToPath(url)
}

/** `path.toUri().toURL()` */
export function pathToUrl(path: string): URL {
  return pathToFileURL(path)
}

/** `Files.exists(path)` */
export function filesExists(path: string): boolean {
  return existsSync(path)
}

/**
 * `GZIPOutputStream` (compression complète, flux fermé).
 * Écart accepté : les octets compressés ne sont pas identiques à ceux de la JVM (découpage deflate différent),
 * le contenu décompressé l'est. Tous les lecteurs gzip (Komga compris) relisent indifféremment les deux.
 */
export function javaGzip(data: Uint8Array): Buffer {
  return gzipSync(data)
}
