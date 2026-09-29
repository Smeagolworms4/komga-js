// Support de portage : java.io.InputStream (lecture synchrone, bloquante comme en Kotlin) et ses implémentations
// usuelles (ByteArrayInputStream, FileInputStream). Ce fichier n'a pas de jumeau Kotlin.
// Conventions : `bytes.inputStream()` -> `new ByteArrayInputStream(bytes)`, `File(path).inputStream()` / `FileInputStream(file)` -> `new FileInputStream(path)`,
// `path.inputStream()` (kotlin.io.path, Files.newInputStream) -> `inputStream(path)` de kotlin-io-path.ts,
// `string.byteInputStream()` -> `ByteArrayInputStream.ofString(string)` (UTF-8), `stream.use { }` -> `use(stream, ...)`.
import { closeSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs'
import { Exception } from './kotlin.js'

/** `java.io.IOException` */
export class IOException extends Exception {}
/** `java.io.EOFException` */
export class EOFException extends IOException {}
/** `java.io.FileNotFoundException` */
export class FileNotFoundException extends IOException {}

export abstract class InputStream {
  /** `read(b, off, len)` : nombre d'octets lus, `-1` en fin de flux */
  abstract read(b: Uint8Array, off?: number, len?: number): number

  /** `read()` : un octet (0..255), `-1` en fin de flux */
  readByte(): number {
    const b = new Uint8Array(1)
    const n = this.read(b, 0, 1)
    return n <= 0 ? -1 : (b[0] as number)
  }

  /** `readBytes()` (Kotlin) / `readAllBytes()` (Java) */
  readAllBytes(): Uint8Array {
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const buf = new Uint8Array(8192)
      const n = this.read(buf, 0, buf.length)
      if (n < 0) break
      if (n > 0) {
        chunks.push(buf.subarray(0, n))
        total += n
      }
    }
    const out = new Uint8Array(total)
    let pos = 0
    for (const c of chunks) {
      out.set(c, pos)
      pos += c.length
    }
    return out
  }

  /** `readBytes()` de Kotlin */
  readBytes(): Uint8Array {
    return this.readAllBytes()
  }

  close(): void {}

  /** `markSupported()` : faux par défaut, comme `java.io.InputStream` */
  markSupported(): boolean {
    return false
  }

  /** `mark(readlimit)` : sans effet par défaut */
  mark(_readlimit: number): void {}

  /** `reset()` : `IOException("mark/reset not supported")` par défaut */
  reset(): void {
    throw new IOException('mark/reset not supported')
  }
}

export class ByteArrayInputStream extends InputStream {
  private pos = 0
  private markPos = 0

  constructor(private readonly buf: Uint8Array) {
    super()
  }

  /** `string.byteInputStream()` (UTF-8) */
  static ofString(s: string): ByteArrayInputStream {
    return new ByteArrayInputStream(new TextEncoder().encode(s))
  }

  read(b: Uint8Array, off = 0, len = b.length - off): number {
    if (len === 0) return 0
    if (this.pos >= this.buf.length) return -1
    const n = Math.min(len, this.buf.length - this.pos)
    b.set(this.buf.subarray(this.pos, this.pos + n), off)
    this.pos += n
    return n
  }

  override markSupported(): boolean {
    return true
  }

  override mark(_readlimit: number): void {
    this.markPos = this.pos
  }

  override reset(): void {
    this.pos = this.markPos
  }
}

/** Texte d'erreur de la JVM (Linux, locale anglaise) pour un code errno de Node */
const ERRNO_TEXT: Record<string, string> = {
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  EPERM: 'Operation not permitted',
  EISDIR: 'Is a directory',
  ENOTDIR: 'Not a directory',
  ELOOP: 'Too many levels of symbolic links',
  ENAMETOOLONG: 'File name too long',
}

/**
 * Exception levée par `java.io.FileInputStream(file)` / `RandomAccessFile(file, "r")` quand l'ouverture échoue :
 * FileNotFoundException("<chemin> (<texte errno>)"). Les autres erreurs sont rendues telles quelles.
 */
export function fileNotFound(e: unknown, path: string): unknown {
  const code = (e as NodeJS.ErrnoException | null)?.code
  if (code !== undefined && code in ERRNO_TEXT) return new FileNotFoundException(`${path} (${ERRNO_TEXT[code]})`)
  return e
}

/** PORT: erreur système de lecture -> IOException (ex. lecture d'un répertoire ouvert par Files.newInputStream) */
export function readError(e: unknown): IOException {
  const code = (e as NodeJS.ErrnoException | null)?.code
  return new IOException(code !== undefined && code in ERRNO_TEXT ? (ERRNO_TEXT[code] as string) : String(e))
}

/** Ouverture en lecture à la manière de `java.io.FileInputStream` : un répertoire est refusé (FileNotFoundException) */
export function openForRead(path: string): number {
  let fd: number
  try {
    fd = openSync(path, 'r')
  } catch (e) {
    throw fileNotFound(e, path)
  }
  if (fstatSync(fd).isDirectory()) {
    closeSync(fd)
    throw new FileNotFoundException(`${path} (Is a directory)`)
  }
  return fd
}

/** `File(path).readBytes()` (kotlin.io) : lecture par FileInputStream, FileNotFoundException("<chemin> (<errno>)") si l'ouverture échoue */
export function fileReadBytes(path: string): Uint8Array {
  const fd = openForRead(path)
  try {
    return new Uint8Array(readFileSync(fd))
  } finally {
    closeSync(fd)
  }
}

export class FileInputStream extends InputStream {
  private fd: number | null
  private pos = 0

  /** `FileInputStream(path)` ; `{ fd }` : descripteur déjà ouvert (voir `inputStream(path)` de kotlin-io-path.ts) */
  constructor(path: string | { fd: number }) {
    super()
    this.fd = typeof path === 'string' ? openForRead(path) : path.fd
  }

  read(b: Uint8Array, off = 0, len = b.length - off): number {
    if (this.fd === null) throw new IOException('Stream Closed')
    if (len === 0) return 0
    let n: number
    try {
      n = readSync(this.fd, b, off, len, this.pos)
    } catch (e) {
      throw readError(e)
    }
    if (n === 0) return -1
    this.pos += n
    return n
  }

  close(): void {
    if (this.fd !== null) {
      closeSync(this.fd)
      this.fd = null
    }
  }
}

/**
 * `java.io.BufferedInputStream` (`stream.buffered()` en Kotlin) : tampon de lecture et prise en charge de mark/reset.
 * Comme en Java, `reset()` échoue si la marque a été invalidée (plus de `readlimit` octets lus depuis `mark`).
 */
export class BufferedInputStream extends InputStream {
  private buf: Uint8Array
  private count = 0
  private pos = 0
  private markpos = -1
  private marklimit = 0

  constructor(
    private readonly input: InputStream,
    size = 8192,
  ) {
    super()
    this.buf = new Uint8Array(size)
  }

  private fill(): void {
    if (this.markpos === -1) {
      this.pos = 0
    } else if (this.pos >= this.buf.length) {
      if (this.markpos > 0) {
        this.buf.copyWithin(0, this.markpos, this.pos)
        this.pos -= this.markpos
        this.markpos = 0
      } else if (this.buf.length >= this.marklimit) {
        this.markpos = -1
        this.pos = 0
      } else {
        const nsz = Math.min(Math.max(this.pos * 2, 1), this.marklimit)
        const nbuf = new Uint8Array(nsz)
        nbuf.set(this.buf.subarray(0, this.pos))
        this.buf = nbuf
      }
    }
    this.count = this.pos
    const n = this.input.read(this.buf, this.pos, this.buf.length - this.pos)
    if (n > 0) this.count = n + this.pos
  }

  read(b: Uint8Array, off = 0, len = b.length - off): number {
    if (len === 0) return 0
    let n = 0
    for (;;) {
      let avail = this.count - this.pos
      if (avail <= 0) {
        // gros bloc sans marque : lecture directe
        if (len - n >= this.buf.length && this.markpos === -1) {
          const r = this.input.read(b, off + n, len - n)
          if (r <= 0) return n === 0 ? r : n
          n += r
          return n
        }
        this.fill()
        avail = this.count - this.pos
        if (avail <= 0) return n === 0 ? -1 : n
      }
      const cnt = Math.min(avail, len - n)
      b.set(this.buf.subarray(this.pos, this.pos + cnt), off + n)
      this.pos += cnt
      n += cnt
      if (n >= len) return n
      // comme Java : ne bloque pas au-delà de ce qui est disponible
      return n
    }
  }

  override markSupported(): boolean {
    return true
  }

  override mark(readlimit: number): void {
    this.marklimit = readlimit
    this.markpos = this.pos
  }

  override reset(): void {
    if (this.markpos < 0) throw new IOException('Resetting to invalid mark')
    this.pos = this.markpos
  }

  override close(): void {
    this.input.close()
  }
}

/** `java.io.ByteArrayOutputStream` */
export class ByteArrayOutputStream {
  private readonly chunks: Uint8Array[] = []
  private count = 0

  write(b: Uint8Array | number): void {
    const chunk = typeof b === 'number' ? Uint8Array.of(b & 0xff) : b
    this.chunks.push(chunk)
    this.count += chunk.length
  }

  size(): number {
    return this.count
  }

  toByteArray(): Uint8Array {
    const out = new Uint8Array(this.count)
    let pos = 0
    for (const c of this.chunks) {
      out.set(c, pos)
      pos += c.length
    }
    return out
  }

  close(): void {}
}

/** `Closeable.use { }` */
export function use<C extends { close(): void }, R>(c: C, block: (c: C) => R): R {
  try {
    return block(c)
  } finally {
    c.close()
  }
}

/** `use { }` avec un bloc asynchrone : la ressource est fermée à la fin du bloc (PORT: async) */
export async function useAsync<C extends { close(): void }, R>(c: C, block: (c: C) => Promise<R> | R): Promise<R> {
  try {
    return await block(c)
  } finally {
    c.close()
  }
}
