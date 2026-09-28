// Support de portage : java.nio.file (Files, Path, BasicFileAttributes, FileTime, walkFileTree) et les fonctions
// d'extension kotlin.io.path utilisées par Komga. Ce fichier n'a pas de jumeau Kotlin.
// Un `Path` est une chaîne (chemin du système de fichiers par défaut, Unix).
// Toutes les opérations sont synchrones (node:fs), comme les API bloquantes de la JVM.
//
// Comportements reproduits (JDK, sun.nio.fs.UnixPath / UnixFileAttributes / FileTreeWalker) :
// - ordre des entrées de répertoire : ordre brut de readdir(3) (DirectoryStream), sans tri.
//   `fs.readdirSync` trie les noms (libuv scandir) : on utilise `fs.opendirSync` qui ne trie pas ;
// - horodatages à la nanoseconde (stat en bigint) ;
// - `creationTime()` : date de naissance (statx) si le système de fichiers la fournit, sinon `lastModifiedTime()`
//   (comportement des JDK >= 22 sous Linux, utilisés par les distributions de Komga : image Docker et Conveyor en JDK 23 ;
//   le JDK 21 renvoie toujours `lastModifiedTime()` sous Linux) ;
// - exceptions : traduction des errno comme UnixException.translateToIOException.
import {
  type BigIntStats,
  accessSync,
  closeSync,
  constants,
  copyFileSync,
  linkSync,
  lstatSync,
  openSync,
  opendirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { Instant } from '@js-joda/core'
import { IOException } from './java-io.js'
import { type Equatable, KEnum } from './kotlin.js'

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

// `java.io.FileNotFoundException` : voir java-io.ts
export { FileNotFoundException } from './java-io.js'

/** `java.nio.file.FileSystemException` : message = fichier [-> autre] [: raison] */
export class FileSystemException extends IOException {
  constructor(
    readonly file: string | null,
    readonly other: string | null = null,
    readonly reason: string | null = null,
  ) {
    super(FileSystemException.buildMessage(file, other, reason))
  }

  private static buildMessage(file: string | null, other: string | null, reason: string | null): string {
    if (file === null && other === null) return reason ?? ''
    let sb = ''
    if (file !== null) sb += file
    if (other !== null) sb += ` -> ${other}`
    if (reason !== null) sb += `: ${reason}`
    return sb
  }
}

export class NoSuchFileException extends FileSystemException {}
export class FileAlreadyExistsException extends FileSystemException {}
export class DirectoryNotEmptyException extends FileSystemException {}
export class AccessDeniedException extends FileSystemException {}
export class NotDirectoryException extends FileSystemException {}
export class FileSystemLoopException extends FileSystemException {}

/** `UnixException.translateToIOException` */
export function translateError(e: unknown, file: string | null, other: string | null = null): IOException {
  const err = e as NodeJS.ErrnoException
  switch (err?.code) {
    case 'EACCES':
    case 'EPERM':
      return new AccessDeniedException(file, other, null)
    case 'ENOENT':
      return new NoSuchFileException(file, other, null)
    case 'EEXIST':
      return new FileAlreadyExistsException(file, other, null)
    case 'ELOOP':
      return new FileSystemException(file, other, `${strerror(err)} or unable to access attributes of symbolic link`)
    default:
      return new FileSystemException(file, other, strerror(err))
  }
}

function strerror(err: NodeJS.ErrnoException | undefined): string {
  // message node : "ENOTDIR: not a directory, scandir '/x'" -> "Not a directory"
  const m = /^[A-Z0-9]+: ([^,]+)/.exec(err?.message ?? '')
  const s = m?.[1] ?? String(err?.message ?? err)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------------------------------------------------------------------------
// Path (chaînes) : java.nio.file.Path / kotlin.io.path
// ---------------------------------------------------------------------------

/** `Paths.get(s)` / `Path.of(s)` : suppression des `/` redondants et du `/` final (UnixPath.normalizeAndCheck) */
export function pathsGet(first: string, ...more: string[]): string {
  let s = first
  for (const m of more) if (m.length > 0) s = s.length > 0 ? `${s}/${m}` : m
  if (s.includes('\0')) throw new IllegalPathException(s)
  s = s.replace(/\/{2,}/g, '/')
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
}

export class IllegalPathException extends Error {}

/** `path.name` (kotlin.io.path) : `fileName?.toString().orEmpty()` */
export function pathName(path: string): string {
  const p = pathsGet(path)
  if (p === '/') return ''
  const i = p.lastIndexOf('/')
  return i < 0 ? p : p.slice(i + 1)
}

/** `path.extension` : `name.substringAfterLast('.', "")` */
export function pathExtension(path: string): string {
  const name = pathName(path)
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1)
}

/** `path.nameWithoutExtension` : `name.substringBeforeLast(".")` */
export function pathNameWithoutExtension(path: string): string {
  const name = pathName(path)
  const i = name.lastIndexOf('.')
  return i < 0 ? name : name.slice(0, i)
}

/** `path.parent` : `null` pour la racine ou un chemin relatif à un seul élément */
export function pathParent(path: string): string | null {
  const p = pathsGet(path)
  if (p === '/' || p === '') return null
  const i = p.lastIndexOf('/')
  if (i < 0) return null
  if (i === 0) return '/'
  return p.slice(0, i)
}

/** `path.resolve(other)` */
export function pathResolve(path: string, other: string): string {
  const o = pathsGet(other)
  if (o.startsWith('/')) return o
  if (o === '') return pathsGet(path)
  const p = pathsGet(path)
  if (p === '') return o
  return p === '/' ? `/${o}` : `${p}/${o}`
}

/** `path.normalize()` (UnixPath) : retire `.`, résout `..` (conservé en tête d'un chemin relatif) */
export function pathNormalize(path: string): string {
  const p = pathsGet(path)
  const absolute = p.startsWith('/')
  const out: string[] = []
  for (const e of p.split('/')) {
    if (e === '' || e === '.') continue
    if (e === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
      else if (!absolute) out.push('..')
    } else out.push(e)
  }
  return (absolute ? '/' : '') + out.join('/')
}

/** `path.startsWith(other)` : comparaison élément par élément (UnixPath.startsWith) */
export function pathStartsWith(path: string, other: string): boolean {
  const p = pathsGet(path)
  const o = pathsGet(other)
  if (p.startsWith('/') !== o.startsWith('/')) return false
  const pe = p.split('/').filter((it) => it.length > 0)
  const oe = o.split('/').filter((it) => it.length > 0)
  if (oe.length > pe.length) return false
  if (oe.length === 0) return o.startsWith('/') || p === ''
  return oe.every((e, i) => e === pe[i])
}

// ---------------------------------------------------------------------------
// Attributs
// ---------------------------------------------------------------------------

const NANOS_PER_SECOND = 1_000_000_000n

/** `java.nio.file.attribute.FileTime` (précision nanoseconde) */
export class FileTime implements Equatable {
  private constructor(readonly nanos: bigint) {}

  static fromNanos(nanos: bigint): FileTime {
    return new FileTime(nanos)
  }

  static fromMillis(millis: number): FileTime {
    return new FileTime(BigInt(millis) * 1_000_000n)
  }

  toInstant(): Instant {
    let sec = this.nanos / NANOS_PER_SECOND
    let nano = this.nanos % NANOS_PER_SECOND
    if (nano < 0n) {
      nano += NANOS_PER_SECOND
      sec -= 1n
    }
    return Instant.ofEpochSecond(Number(sec), Number(nano))
  }

  toMillis(): number {
    const ms = this.nanos / 1_000_000n
    return Number(this.nanos < 0n && this.nanos % 1_000_000n !== 0n ? ms - 1n : ms)
  }

  compareTo(other: FileTime): number {
    return this.nanos < other.nanos ? -1 : this.nanos > other.nanos ? 1 : 0
  }

  equals(other: unknown): boolean {
    return other instanceof FileTime && other.nanos === this.nanos
  }

  hashCode(): number {
    return Number(this.nanos % 2147483647n)
  }

  toString(): string {
    return this.toInstant().toString()
  }
}

/** `java.nio.file.attribute.BasicFileAttributes` (UnixFileAttributes) */
export class BasicFileAttributes {
  constructor(private readonly st: BigIntStats) {}

  lastModifiedTime(): FileTime {
    return FileTime.fromNanos(this.st.mtimeNs)
  }

  lastAccessTime(): FileTime {
    return FileTime.fromNanos(this.st.atimeNs)
  }

  /** JDK >= 22 sous Linux : naissance (statx) si disponible, sinon `lastModifiedTime()` */
  creationTime(): FileTime {
    if (this.st.birthtimeNs !== 0n) return FileTime.fromNanos(this.st.birthtimeNs)
    return this.lastModifiedTime()
  }

  get isRegularFile(): boolean {
    return this.st.isFile()
  }

  get isDirectory(): boolean {
    return this.st.isDirectory()
  }

  get isSymbolicLink(): boolean {
    return this.st.isSymbolicLink()
  }

  get isOther(): boolean {
    return !this.st.isFile() && !this.st.isDirectory() && !this.st.isSymbolicLink()
  }

  size(): number {
    // PORT: Long -> number (taille de fichier < 2^53)
    return Number(this.st.size)
  }

  /** `(dev=…,ino=…)` */
  fileKey(): string {
    return `(dev=${this.st.dev.toString(16)},ino=${this.st.ino})`
  }
}

/** `Files.readAttributes(path, BasicFileAttributes::class.java[, NOFOLLOW_LINKS])` / `path.readAttributes()` */
export function readAttributes(path: string, followLinks: boolean = true): BasicFileAttributes {
  try {
    const st = followLinks ? statSync(path, { bigint: true }) : lstatSync(path, { bigint: true })
    return new BasicFileAttributes(st)
  } catch (e) {
    throw translateError(e, path)
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** `Files.exists(path)` / `path.exists()` (suit les liens) */
export function exists(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

/** `Files.notExists(path)` / `path.notExists()` : vrai seulement si l'absence est confirmée */
export function notExists(path: string): boolean {
  try {
    statSync(path)
    return false
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT'
  }
}

/** `Files.isDirectory(path)` (suit les liens) */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** `Files.isReadable(path)` */
export function isReadable(path: string): boolean {
  try {
    accessSync(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/** `Files.newDirectoryStream(dir)` : noms dans l'ordre brut de readdir, sans `.` ni `..` */
export function newDirectoryStream(dir: string): string[] {
  let d
  try {
    d = opendirSync(dir)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOTDIR') throw new NotDirectoryException(dir)
    throw translateError(e, dir)
  }
  const out: string[] = []
  try {
    let e
    while ((e = d.readSync()) !== null) out.push(pathResolve(dir, e.name))
  } finally {
    d.closeSync()
  }
  return out
}

/** `path.listDirectoryEntries()` */
export function listDirectoryEntries(dir: string): string[] {
  return newDirectoryStream(dir)
}

/** `Files.delete(path)` / `path.deleteExisting()` */
export function deleteExisting(path: string): void {
  try {
    if (lstatSync(path).isDirectory()) rmdirSync(path)
    else unlinkSync(path)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOTEMPTY' || code === 'EEXIST') throw new DirectoryNotEmptyException(path)
    throw translateError(e, path)
  }
}

/** `Files.deleteIfExists(path)` / `path.deleteIfExists()` */
export function deleteIfExists(path: string): boolean {
  try {
    deleteExisting(path)
    return true
  } catch (e) {
    if (e instanceof NoSuchFileException) return false
    throw e
  }
}

function lexists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/** `path.copyTo(target, overwrite)` / `Files.copy(source, target[, REPLACE_EXISTING])` (contenu seul, sans les attributs) */
export function copyTo(source: string, target: string, overwrite: boolean = false): string {
  readAttributes(source)
  if (lexists(target)) {
    if (!overwrite) throw new FileAlreadyExistsException(target)
    deleteExisting(target)
  }
  // UnixCopyFile.copyFile : l'échec d'ouverture de la source est rapporté sur la source, celui de la cible (dossier
  // parent absent, droits...) sur la cible seule
  try {
    closeSync(openSync(source, 'r'))
  } catch (e) {
    throw translateError(e, source)
  }
  try {
    copyFileSync(source, target, constants.COPYFILE_EXCL)
  } catch (e) {
    throw translateError(e, target)
  }
  return target
}

/** `path.moveTo(target, overwrite)` / `Files.move(source, target[, REPLACE_EXISTING])` */
export function moveTo(source: string, target: string, overwrite: boolean = false): string {
  readAttributes(source, false)
  if (lexists(target)) {
    if (!overwrite) throw new FileAlreadyExistsException(target)
    deleteExisting(target)
  }
  try {
    renameSync(source, target)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw translateError(e, source, target)
    // autre système de fichiers : copie puis suppression (UnixCopyFile.move)
    copyTo(source, target)
    deleteExisting(source)
  }
  return target
}

/** `Files.createLink(link, existing)` */
export function createLink(link: string, existing: string): string {
  try {
    linkSync(existing, link)
  } catch (e) {
    throw translateError(e, link, existing)
  }
  return link
}

// ---------------------------------------------------------------------------
// Files.walkFileTree (java.nio.file.FileTreeWalker)
// ---------------------------------------------------------------------------

export class FileVisitResult extends KEnum {
  static readonly CONTINUE = new FileVisitResult('CONTINUE')
  static readonly TERMINATE = new FileVisitResult('TERMINATE')
  static readonly SKIP_SUBTREE = new FileVisitResult('SKIP_SUBTREE')
  static readonly SKIP_SIBLINGS = new FileVisitResult('SKIP_SIBLINGS')
}

export class FileVisitOption extends KEnum {
  static readonly FOLLOW_LINKS = new FileVisitOption('FOLLOW_LINKS')
}

export interface FileVisitor {
  preVisitDirectory(dir: string, attrs: BasicFileAttributes): FileVisitResult
  visitFile(file: string, attrs: BasicFileAttributes): FileVisitResult
  visitFileFailed(file: string | null, exc: IOException | null): FileVisitResult
  postVisitDirectory(dir: string, exc: IOException | null): FileVisitResult
}

type DirectoryNode = { dir: string; key: string; entries: string[]; index: number; skipped: boolean }

type Event =
  | { type: 'ENTRY'; file: string; attrs: BasicFileAttributes | null; ioe: IOException | null }
  | { type: 'START_DIRECTORY'; file: string; attrs: BasicFileAttributes }
  | { type: 'END_DIRECTORY'; file: string; ioe: IOException | null }

class FileTreeWalker {
  private readonly stack: DirectoryNode[] = []

  constructor(
    private readonly followLinks: boolean,
    private readonly maxDepth: number,
  ) {}

  private getAttributes(file: string): BasicFileAttributes {
    // attempt to get attributes of file. If fails and we are following
    // links then a link target might not exist so get attributes of link
    try {
      return readAttributes(file, this.followLinks)
    } catch (ioe) {
      if (!this.followLinks) throw ioe
      return readAttributes(file, false)
    }
  }

  private wouldLoop(dir: string, key: string): boolean {
    // PORT: fileKey (dev, inode) toujours disponible sous Unix : Files.isSameFile non nécessaire
    void dir
    return this.stack.some((n) => n.key === key)
  }

  private visit(entry: string): Event {
    let attrs: BasicFileAttributes
    try {
      attrs = this.getAttributes(entry)
    } catch (ioe) {
      return { type: 'ENTRY', file: entry, attrs: null, ioe: ioe as IOException }
    }

    // at maximum depth or file is not a directory
    const depth = this.stack.length
    if (depth >= this.maxDepth || !attrs.isDirectory) return { type: 'ENTRY', file: entry, attrs, ioe: null }

    // check for cycles when following links
    if (this.followLinks && this.wouldLoop(entry, attrs.fileKey()))
      return { type: 'ENTRY', file: entry, attrs: null, ioe: new FileSystemLoopException(entry) }

    // file is a directory, attempt to open it
    let entries: string[]
    try {
      entries = newDirectoryStream(entry)
    } catch (ioe) {
      return { type: 'ENTRY', file: entry, attrs: null, ioe: ioe as IOException }
    }

    // push a directory node to the stack and return an event
    this.stack.push({ dir: entry, key: attrs.fileKey(), entries, index: 0, skipped: false })
    return { type: 'START_DIRECTORY', file: entry, attrs }
  }

  walk(file: string): Event {
    return this.visit(file)
  }

  next(): Event | null {
    const top = this.stack[this.stack.length - 1]
    if (top === undefined) return null // stack is empty, we are done

    // continue iteration of the directory at the top of the stack
    let entry: string | null = null
    if (!top.skipped && top.index < top.entries.length) entry = top.entries[top.index++] as string

    // no next entry so close and pop directory, creating corresponding event
    if (entry === null) {
      this.stack.pop()
      return { type: 'END_DIRECTORY', file: top.dir, ioe: null }
    }

    // visit the entry
    return this.visit(entry)
  }

  pop(): void {
    this.stack.pop()
  }

  skipRemainingSiblings(): void {
    const top = this.stack[this.stack.length - 1]
    if (top !== undefined) top.skipped = true
  }
}

/** `Files.walkFileTree(start, options, maxDepth, visitor)` */
export function walkFileTree(start: string, options: ReadonlySet<FileVisitOption>, maxDepth: number, visitor: FileVisitor): string {
  const walker = new FileTreeWalker(options.has(FileVisitOption.FOLLOW_LINKS), maxDepth)
  let ev: Event | null = walker.walk(start)
  do {
    let result: FileVisitResult
    switch (ev.type) {
      case 'ENTRY':
        if (ev.ioe === null) result = visitor.visitFile(ev.file, ev.attrs as BasicFileAttributes)
        else result = visitor.visitFileFailed(ev.file, ev.ioe)
        break

      case 'START_DIRECTORY':
        result = visitor.preVisitDirectory(ev.file, ev.attrs)

        // if SKIP_SIBLINGS and SKIP_SUBTREE is returned then
        // there shouldn't be any more events for the current
        // directory.
        if (result === FileVisitResult.SKIP_SUBTREE || result === FileVisitResult.SKIP_SIBLINGS) walker.pop()
        break

      case 'END_DIRECTORY':
        result = visitor.postVisitDirectory(ev.file, ev.ioe)

        // SKIP_SIBLINGS is a no-op for postVisitDirectory
        if (result === FileVisitResult.SKIP_SIBLINGS) result = FileVisitResult.CONTINUE
        break
    }

    if (result !== FileVisitResult.CONTINUE) {
      if (result === FileVisitResult.TERMINATE) break
      else if (result === FileVisitResult.SKIP_SIBLINGS) walker.skipRemainingSiblings()
    }
    ev = walker.next()
  } while (ev !== null)
  return start
}
