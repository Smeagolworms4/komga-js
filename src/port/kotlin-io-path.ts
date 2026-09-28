// Support de portage : fonctions kotlin.io.path (extensions de java.nio.file.Path), java.io.File.createTempFile et
// exceptions java.io / java.nio.file utilisées par les services du domaine. Ce fichier n'a pas de jumeau Kotlin.
// Un `Path` est une chaîne (voir java.ts). Les fonctions sont synchrones, comme les appels bloquants de la JVM.
import { accessSync, constants, copyFileSync, existsSync, lstatSync, openSync, closeSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { FileInputStream, FileNotFoundException, IOException } from './java-io.js'

/** `java.io.FileNotFoundException` : une seule classe, celle de java-io.ts (sinon `instanceof` échoue d'un module à l'autre) */
export { FileNotFoundException }

/** `java.nio.file.FileSystemException` */
export class FileSystemException extends IOException {}

/** `java.nio.file.FileAlreadyExistsException` */
export class FileAlreadyExistsException extends FileSystemException {}

/** `java.nio.file.NoSuchFileException` */
export class NoSuchFileException extends FileSystemException {}

/** `java.nio.file.AccessDeniedException` */
export class AccessDeniedException extends FileSystemException {}

/** `java.nio.file.DirectoryNotEmptyException` */
export class DirectoryNotEmptyException extends FileSystemException {}

/**
 * Conversion d'une erreur système Node (code errno) en exception java.nio.file, comme le fait le
 * fournisseur de système de fichiers Unix de la JVM (UnixException.translateToIOException).
 */
export function translateNodeError(e: unknown, file: string): unknown {
  const code = (e as NodeJS.ErrnoException | null)?.code
  switch (code) {
    case 'ENOENT':
      return new NoSuchFileException(file)
    case 'EACCES':
    case 'EPERM':
      return new AccessDeniedException(file)
    case 'EEXIST':
      return new FileAlreadyExistsException(file)
    case 'ENOTEMPTY':
      return new DirectoryNotEmptyException(file)
    default:
      return e
  }
}

/** `Path.inputStream()` (Files.newInputStream) : NoSuchFileException, AccessDeniedException... et non FileNotFoundException */
export function inputStream(path: string): FileInputStream {
  let fd: number
  try {
    fd = openSync(path, 'r')
  } catch (e) {
    throw translateNodeError(e, path)
  }
  return new FileInputStream({ fd })
}

function fileName(path: string): string {
  return basename(path)
}

/** `Path.extension` : partie après le dernier `.` du nom de fichier, ou chaîne vide */
export function extension(path: string): string {
  const name = fileName(path)
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.substring(i + 1)
}

/** `Path.nameWithoutExtension` : nom de fichier sans la partie après le dernier `.` */
export function nameWithoutExtension(path: string): string {
  const name = fileName(path)
  const i = name.lastIndexOf('.')
  return i === -1 ? name : name.substring(0, i)
}

/** `Path.name` */
export function name(path: string): string {
  return fileName(path)
}

/** `Path.exists()` (suit les liens) */
export function exists(path: string): boolean {
  return existsSync(path)
}

/** `Path.notExists()` : vrai seulement si l'absence est confirmée */
export function notExists(path: string): boolean {
  try {
    statSync(path)
    return false
  } catch (e) {
    // Files.notExists : seule NoSuchFileException (ENOENT) confirme l'absence ; ENOTDIR -> FileSystemException -> faux
    return (e as NodeJS.ErrnoException).code === 'ENOENT'
  }
}

/** `Path.isWritable()` / `Files.isWritable` */
export function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** `Path.deleteIfExists()` : vrai si le fichier (ou le répertoire vide) a été supprimé */
export function deleteIfExists(path: string): boolean {
  let isDir: boolean
  try {
    isDir = lstatSync(path).isDirectory()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw translateNodeError(e, path)
  }
  try {
    if (isDir) rmdirSync(path)
    else unlinkSync(path)
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw translateNodeError(e, path)
  }
}

/** `Path.listDirectoryEntries()` : chemins des entrées du répertoire (ordre du système de fichiers) */
export function listDirectoryEntries(path: string): string[] {
  try {
    return readdirSync(path).map((it) => join(path, it))
  } catch (e) {
    throw translateNodeError(e, path)
  }
}

/** `Path.moveTo(target, overwrite)` */
export function moveTo(path: string, target: string, overwrite = false): string {
  if (!overwrite && existsSync(target)) throw new FileAlreadyExistsException(target)
  try {
    renameSync(path, target)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw translateNodeError(e, path)
    // PORT: Files.move entre deux systèmes de fichiers : copie puis suppression
    copyFileSync(path, target)
    unlinkSync(path)
  }
  return target
}

/** `File.createTempFile(prefix, suffix, directory).toPath()` : fichier vide créé de façon exclusive */
export function createTempFile(prefix: string, suffix: string | null, directory: string): string {
  for (;;) {
    // PORT: nom aléatoire comme TempFileHelper (prefix + entier long non signé + suffix)
    const n = randomBytes(8).readBigUInt64BE() & 0x7fffffffffffffffn
    const path = join(directory, `${prefix}${n}${suffix ?? '.tmp'}`)
    try {
      closeSync(openSync(path, 'wx'))
      return path
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw translateNodeError(e, path)
    }
  }
}
