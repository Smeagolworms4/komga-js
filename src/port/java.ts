// Support de portage : équivalents java.net / java.nio.file utilisés par Komga.
// Ce fichier n'a pas de jumeau Kotlin.
// Un `java.nio.file.Path` est représenté par une chaîne de chemin absolu ou relatif (module node:path).
import { accessSync, constants as fsConstants, existsSync, lstatSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import { AsyncLocalStorage } from 'node:async_hooks'
import { join } from 'node:path'
import { isMainThread, threadId } from 'node:worker_threads'
import { gzipSync } from 'node:zlib'

// URL / URI Java et conversions Path <-> URL : voir java-net.ts
export { URI, URL, pathToUri, pathToUrl, urlToPath } from './java-net.js'

/** `Files.exists(path)` */
export function filesExists(path: string): boolean {
  return existsSync(path)
}

/** `Files.isDirectory(path)` (suit les liens) */
export function filesIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** `Files.isWritable(path)` / `path.isWritable()` */
export function filesIsWritable(path: string): boolean {
  try {
    accessSync(path, fsConstants.W_OK)
    return true
  } catch {
    return false
  }
}

/** `Files.deleteIfExists(path)` : fichier, lien ou répertoire vide (lève si le répertoire n'est pas vide) */
export function filesDeleteIfExists(path: string): boolean {
  let st
  try {
    st = lstatSync(path)
  } catch {
    return false
  }
  if (st.isDirectory()) rmdirSync(path)
  else unlinkSync(path)
  return true
}

/** `path.listDirectoryEntries()` : ordre brut du répertoire comme Java (readdirSync trierait), voir java-nio-file.ts */
export { listDirectoryEntries } from './java-nio-file.js'

/**
 * `Path.startsWith(other: Path)` (UnixPath) : comparaison par éléments de nom, sans normalisation ;
 * les deux chemins doivent être tous deux absolus ou tous deux relatifs.
 */
export function pathStartsWith(path: string, other: string): boolean {
  if (path.startsWith('/') !== other.startsWith('/')) return false
  const a = path.split('/').filter((it) => it.length > 0)
  const b = other.split('/').filter((it) => it.length > 0)
  if (b.length > a.length) return false
  if (b.length === 0 && other.length === 0 && path.length !== 0) return false
  return b.every((it, i) => it === a[i])
}

/**
 * `GZIPOutputStream` (compression complète, flux fermé).
 * Écart accepté : les octets compressés ne sont pas identiques à ceux de la JVM (découpage deflate différent),
 * le contenu décompressé l'est. Tous les lecteurs gzip (Komga compris) relisent indifféremment les deux.
 */
export function javaGzip(data: Uint8Array): Buffer {
  return gzipSync(data)
}

/** Nom du « thread » logique courant (tâche exécutée par un exécuteur en processus, voir port/spring-scheduling.ts) */
const currentThreadName = new AsyncLocalStorage<string>()

/** Exécute `fn` comme si elle tournait dans le thread nommé `name` (`Thread.currentThread().name`) */
export function runInThread<T>(name: string, fn: () => T): T {
  return currentThreadName.run(name, fn)
}

/**
 * `Thread.currentThread()` : `name` vaut `main` pour le thread principal, `Thread-<threadId>` dans un worker,
 * ou le nom du thread logique de l'exécuteur (`taskProcessor-1`…) pendant l'exécution d'une tâche (runInThread).
 */
export const Thread = {
  currentThread(): { readonly name: string } {
    const logical = currentThreadName.getStore()
    if (logical !== undefined) return { name: logical }
    return { name: isMainThread ? 'main' : `Thread-${threadId}` }
  },
}

/** `java.util.concurrent.atomic.AtomicLong` */
export class AtomicLong {
  constructor(private value: number = 0) {}

  get(): number {
    return this.value
  }

  set(newValue: number): void {
    this.value = newValue
  }

  incrementAndGet(): number {
    return ++this.value
  }

  decrementAndGet(): number {
    return --this.value
  }

  toString(): string {
    return String(this.value)
  }
}
