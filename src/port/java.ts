// Support de portage : équivalents java.net / java.nio.file utilisés par Komga.
// Ce fichier n'a pas de jumeau Kotlin.
// Un `java.nio.file.Path` est représenté par une chaîne de chemin absolu ou relatif (module node:path).
import { existsSync } from 'node:fs'
import { isMainThread, threadId } from 'node:worker_threads'
import { gzipSync } from 'node:zlib'

// URL / URI Java et conversions Path <-> URL : voir java-net.ts
export { URI, URL, pathToUri, pathToUrl, urlToPath } from './java-net.js'

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

/**
 * `Thread.currentThread()` : `name` vaut `main` pour le thread principal, `Thread-<threadId>` dans un worker.
 */
export const Thread = {
  currentThread(): { readonly name: string } {
    return { name: isMainThread ? 'main' : `Thread-${threadId}` }
  },
}
