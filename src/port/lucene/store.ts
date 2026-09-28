// Support de portage : org.apache.lucene.store.{Directory, ByteBuffersDirectory, FSDirectory, SingleInstanceLockFactory}
// (Lucene 9.9.1), réduits à ce qu'utilise Komga.
// PORT: l'index n'est pas stocké au format de Lucene mais dans un format propre à KomgaJS : un journal
// (komgajs-index.jsonl) dont la première ligne est un en-tête de format et chaque ligne suivante un commit
// (liste d'opérations add/update/delete sur des documents non analysés). L'index est une donnée dérivée :
// sans journal lisible, DirectoryReader.indexExists renvoie false et Komga reconstruit l'index.
// Ce fichier n'a pas de jumeau Kotlin.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { IOException } from '../java-io.js'

export const INDEX_FILE = 'komgajs-index.jsonl'
export const FORMAT_HEADER = JSON.stringify({ format: 'komgajs-lucene-index', version: 1 })

/** Contenu lu d'un répertoire d'index : lignes de commit valides, et si le fichier doit être réécrit */
export type CommitLog = { commits: string[]; needsRewrite: boolean }

export abstract class Directory {
  /** Commits présents (null si aucun index au format KomgaJS) */
  abstract readCommits(): CommitLog | null

  /** Ajoute un commit (une ligne JSON) de façon durable */
  abstract appendCommit(line: string): void

  /** Remplace atomiquement tous les commits */
  abstract rewrite(lines: string[]): void

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

function parseLog(text: string): CommitLog | null {
  const lines = text.split('\n')
  if (lines[0] !== FORMAT_HEADER) return null
  const commits: string[] = []
  let needsRewrite = false
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] as string
    if (line.length === 0) {
      if (i !== lines.length - 1) needsRewrite = true
      continue
    }
    try {
      JSON.parse(line)
      commits.push(line)
    } catch {
      // commit interrompu (écriture partielle) : ignoré, comme un segments_N incomplet
      needsRewrite = true
      break
    }
  }
  if (!text.endsWith('\n')) needsRewrite = true
  return { commits, needsRewrite }
}

/** A memory-resident Directory implementation. */
export class ByteBuffersDirectory extends Directory {
  private commits: string[] | null = null

  readCommits(): CommitLog | null {
    return this.commits === null ? null : { commits: [...this.commits], needsRewrite: false }
  }

  appendCommit(line: string): void {
    ;(this.commits ??= []).push(line)
  }

  rewrite(lines: string[]): void {
    this.commits = [...lines]
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

  readCommits(): CommitLog | null {
    if (!existsSync(this.file)) return null
    let text: string
    try {
      text = readFileSync(this.file, 'utf8')
    } catch {
      return null
    }
    return parseLog(text)
  }

  appendCommit(line: string): void {
    mkdirSync(this.directory, { recursive: true })
    if (!existsSync(this.file)) {
      this.rewrite([line])
      return
    }
    const fd = openSync(this.file, 'a')
    try {
      writeSync(fd, `${line}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }

  rewrite(lines: string[]): void {
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
