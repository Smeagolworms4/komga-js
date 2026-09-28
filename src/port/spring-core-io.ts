// Support de portage : implémentations de org.springframework.core.io.Resource utilisées par Komga et par
// les gestionnaires de ressources statiques : FileSystemResource, ByteArrayResource, ClassPathResource
// (classpath = répertoire resources/). Ce fichier n'a pas de jumeau Kotlin.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { resourcesDir } from './resources.js'
import { Resource } from './spring-web.js'

/** `org.springframework.core.io.FileSystemResource` */
export class FileSystemResource extends Resource {
  readonly path: string

  constructor(path: string) {
    super()
    this.path = path
  }

  override exists(): boolean {
    return existsSync(this.path)
  }

  isReadable(): boolean {
    try {
      return statSync(this.path).isFile()
    } catch {
      return false
    }
  }

  contentLength(): number {
    return statSync(this.path).size
  }

  override lastModified(): number {
    return Math.floor(statSync(this.path).mtimeMs)
  }

  getInputStream(range?: { start: number; end: number }): Readable {
    return range ? createReadStream(this.path, { start: range.start, end: range.end }) : createReadStream(this.path)
  }

  get filename(): string | null {
    return basename(this.path)
  }

  get uri(): string {
    return pathToFileURL(resolve(this.path)).href
  }

  toString(): string {
    return `file [${resolve(this.path)}]`
  }
}

/** `org.springframework.core.io.ByteArrayResource` */
export class ByteArrayResource extends Resource {
  constructor(
    readonly byteArray: Uint8Array,
    readonly description: string = 'resource loaded from byte array',
  ) {
    super()
  }

  contentLength(): number {
    return this.byteArray.length
  }

  getInputStream(range?: { start: number; end: number }): Readable {
    const b = Buffer.from(this.byteArray)
    return Readable.from([range ? b.subarray(range.start, range.end + 1) : b])
  }

  get filename(): string | null {
    return null
  }

  toString(): string {
    return `Byte array resource [${this.description}]`
  }
}

/** `org.springframework.core.io.ClassPathResource` (classpath = resources/) */
export class ClassPathResource extends FileSystemResource {
  constructor(readonly classPath: string) {
    super(join(resourcesDir(), classPath.replace(/^\/+/, '')))
  }

  getContentAsByteArray(): Uint8Array {
    return new Uint8Array(readFileSync(this.path))
  }

  override toString(): string {
    return `class path resource [${this.classPath.replace(/^\/+/, '')}]`
  }
}
