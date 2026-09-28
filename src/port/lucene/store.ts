// Support de portage : org.apache.lucene.store.{Directory, ByteBuffersDirectory, FSDirectory, SingleInstanceLockFactory}
// (Lucene 9.9.1), réduits à ce qu'utilise Komga.
// PORT: l'index n'est pas stocké au format de Lucene mais dans un format propre à KomgaJS : un journal
// (komgajs-index.jsonl) dont la première ligne est un en-tête de format et chaque ligne suivante des opérations
// add/update/delete sur des documents non analysés (`{"ops":[...]}`). Un commit est une ligne, ou plusieurs lignes
// dont toutes sauf la dernière portent `"more":true` (gros commits, ex. RebuildIndex : lignes de taille bornée,
// relues une à une) ; un commit interrompu (ligne incomplète ou groupe sans fin) est ignoré. L'index est une donnée
// dérivée : sans journal lisible, DirectoryReader.indexExists renvoie false et Komga reconstruit l'index.
// Ce fichier n'a pas de jumeau Kotlin.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readSync, renameSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { IOException } from '../java-io.js'

export const INDEX_FILE = 'komgajs-index.jsonl'
export const FORMAT_HEADER = JSON.stringify({ format: 'komgajs-lucene-index', version: 1 })

/** Résultat de la lecture d'un journal : nombre de commits valides, et si le fichier doit être réécrit */
export type CommitLog = { commits: number; needsRewrite: boolean }

type CommitLine = { ops: unknown[]; more?: boolean }

export abstract class Directory {
  /** Lignes du journal après l'en-tête (null si aucun index au format KomgaJS) ; relu à chaque appel */
  protected abstract lines(): Iterable<string> | null

  /** Ajoute un commit (une ou plusieurs lignes JSON, voir l'en-tête du fichier) de façon durable */
  abstract appendCommit(lines: Iterable<string>): void

  /** Remplace atomiquement tous les commits */
  abstract rewrite(lines: Iterable<string>): void

  /**
   * Lit le journal : `consumer` reçoit les opérations des commits complets et valides, dans l'ordre, ligne par ligne
   * (un premier passage valide le journal, un second relit les lignes retenues : mémoire bornée par ligne).
   * Null si aucun index au format KomgaJS.
   */
  readCommits(consumer: ((ops: unknown[]) => void) | null = null): CommitLog | null {
    const lines = this.lines()
    if (lines === null) return null
    let commits = 0
    let validLines = 0
    let n = 0
    let needsRewrite = false
    let emptyLine = false
    for (const line of lines) {
      if (line.length === 0) {
        emptyLine = true
        continue
      }
      if (emptyLine) needsRewrite = true
      let parsed: CommitLine
      try {
        parsed = JSON.parse(line) as CommitLine
      } catch {
        // commit interrompu (écriture partielle) : ignoré, comme un segments_N incomplet
        needsRewrite = true
        break
      }
      n++
      if (parsed.more !== true) {
        commits++
        validLines = n
      }
    }
    // groupe de lignes d'un commit sans sa dernière ligne
    if (n !== validLines) needsRewrite = true
    if (!emptyLine) needsRewrite = true
    if (consumer !== null && validLines > 0) {
      let i = 0
      for (const line of this.lines() ?? []) {
        if (line.length === 0) continue
        if (i++ === validLines) break
        consumer((JSON.parse(line) as CommitLine).ops)
      }
    }
    return { commits, needsRewrite }
  }

  /** Le journal contient au moins un commit complet et valide (s'arrête au premier) */
  hasCommits(): boolean {
    const lines = this.lines()
    if (lines === null) return false
    for (const line of lines) {
      if (line.length === 0) continue
      try {
        if ((JSON.parse(line) as CommitLine).more !== true) return true
      } catch {
        return false
      }
    }
    return false
  }

  /**
   * Verrou d'écriture (`write.lock`) tenu par un IndexWriter ouvert sur ce Directory
   * PORT: SingleInstanceLockFactory (celle de Komga et de ByteBuffersDirectory) : verrou propre à l'instance
   */
  writeLocked = false

  close(): void {}
}

/** `org.apache.lucene.store.LockObtainFailedException` */
export class LockObtainFailedException extends IOException {}

/** `LockFactory` : le verrou d'écriture n'est pas porté (un seul processus Node) */
export abstract class LockFactory {}

export class SingleInstanceLockFactory extends LockFactory {}

/** A memory-resident Directory implementation. */
export class ByteBuffersDirectory extends Directory {
  private data: string[] | null = null

  protected lines(): Iterable<string> | null {
    // chaque ligne suivie d'un saut de ligne, comme dans un fichier
    return this.data === null ? null : [...this.data, '']
  }

  appendCommit(lines: Iterable<string>): void {
    ;(this.data ??= []).push(...lines)
  }

  rewrite(lines: Iterable<string>): void {
    this.data = [...lines]
  }
}

/** Base class for Directory implementations that store index files in the file system. */
export class FSDirectory extends Directory {
  private constructor(readonly directory: string) {
    super()
  }

  /** `FSDirectory.open(Path, LockFactory)` */
  static open(path: string, _lockFactory: LockFactory = new SingleInstanceLockFactory()): FSDirectory {
    return new FSDirectory(path)
  }

  private get file(): string {
    return join(this.directory, INDEX_FILE)
  }

  protected lines(): Iterable<string> | null {
    if (!existsSync(this.file)) return null
    let fd: number
    try {
      fd = openSync(this.file, 'r')
    } catch {
      return null
    }
    // le générateur ferme le descripteur à la fin du parcours, à son interruption ou sur une erreur de lecture
    const it = readLines(fd)
    let first: IteratorResult<string, void>
    try {
      first = it.next()
    } catch {
      return null
    }
    // en-tête
    if (first.done || first.value !== FORMAT_HEADER) {
      it.return(undefined)
      return null
    }
    // reste du fichier
    return { [Symbol.iterator]: () => it }
  }

  appendCommit(lines: Iterable<string>): void {
    mkdirSync(this.directory, { recursive: true })
    if (!existsSync(this.file)) {
      this.rewrite(lines)
      return
    }
    const fd = openSync(this.file, 'a')
    try {
      for (const line of lines) writeSync(fd, `${line}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }

  rewrite(lines: Iterable<string>): void {
    mkdirSync(this.directory, { recursive: true })
    const tmp = `${this.file}.tmp`
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, `${FORMAT_HEADER}\n`)
      for (const line of lines) writeSync(fd, `${line}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.file)
  }
}

/**
 * Lignes d'un fichier lu par blocs (sans charger tout le fichier) ; la dernière est la fin du fichier après le
 * dernier saut de ligne (vide si le fichier se termine par un saut de ligne). Ferme le descripteur à la fin.
 */
function* readLines(fd: number): Generator<string, void, undefined> {
  const buf = Buffer.allocUnsafe(1 << 20)
  const decoder = new StringDecoder('utf8')
  let pending = ''
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null)
      if (n === 0) break
      const text = pending + decoder.write(buf.subarray(0, n))
      let start = 0
      for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', start)) {
        yield text.slice(start, i)
        start = i + 1
      }
      pending = text.slice(start)
    }
    yield pending + decoder.end()
  } finally {
    closeSync(fd)
  }
}
