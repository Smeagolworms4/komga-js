// Support de portage : java.net.URL / java.net.URI et conversions Path <-> URL de Java.
// Le URL de JS (WHATWG) normalise autrement ("file://library" -> "file://library/", "file:///a" reste tel quel) :
// Komga stocke en base les URL au format Java ("file:/data/a%20b.cbz"), il faut donc les mêmes chaînes.
// Comportements relevés sur Java 21 (jshell), voir test/port/java-net.test.ts. Ce fichier n'a pas de jumeau Kotlin.
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { type Equatable, Exception, IllegalArgumentException, hash } from './kotlin.js'

export class MalformedURLException extends Exception {}
export class URISyntaxException extends Exception {}

type Parts = { scheme: string; authority: string | null; path: string; query: string | null; fragment: string | null }

function parse(spec: string, lowerScheme: boolean): Parts {
  let s = spec
  let fragment: string | null = null
  const h = s.indexOf('#')
  if (h >= 0) {
    fragment = s.slice(h + 1)
    s = s.slice(0, h)
  }
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(s)
  if (!m) throw new MalformedURLException(`no protocol: ${spec}`)
  const scheme = lowerScheme ? (m[1] as string).toLowerCase() : (m[1] as string)
  s = s.slice(m[0].length)
  let authority: string | null = null
  if (s.startsWith('//')) {
    const end = s.slice(2).search(/[/?]/)
    authority = end < 0 ? s.slice(2) : s.slice(2, 2 + end)
    s = end < 0 ? '' : s.slice(2 + end)
  }
  let query: string | null = null
  const q = s.indexOf('?')
  if (q >= 0) {
    query = s.slice(q + 1)
    s = s.slice(0, q)
  }
  return { scheme, authority, path: s, query, fragment }
}

/** `java.net.URL` */
export class URL implements Equatable {
  readonly protocol: string
  readonly authority: string | null
  readonly path: string
  readonly query: string | null
  readonly ref: string | null

  constructor(spec: string) {
    const p = parse(spec, true)
    this.protocol = p.scheme
    this.authority = p.authority
    this.path = p.path
    this.query = p.query
    this.ref = p.fragment
  }

  get host(): string {
    const a = this.authority ?? ''
    const at = a.lastIndexOf('@')
    const hp = at >= 0 ? a.slice(at + 1) : a
    const c = hp.lastIndexOf(':')
    return c >= 0 && !hp.endsWith(']') ? hp.slice(0, c) : hp
  }

  /** `getFile()` : chemin + requête */
  get file(): string {
    return this.query === null ? this.path : `${this.path}?${this.query}`
  }

  /** `toExternalForm()` / `toString()` : l'autorité vide n'est pas écrite */
  toExternalForm(): string {
    let r = `${this.protocol}:`
    if (this.authority !== null && this.authority.length > 0) r += `//${this.authority}`
    r += this.file
    if (this.ref !== null) r += `#${this.ref}`
    return r
  }

  toString(): string {
    return this.toExternalForm()
  }

  toJSON(): string {
    return this.toExternalForm()
  }

  toURI(): URI {
    return new URI(this.toString())
  }

  /** PORT: URL.equals compare aussi les hôtes résolus en DNS ; ici comparaison des composants */
  equals(other: unknown): boolean {
    return (
      other instanceof URL &&
      this.protocol === other.protocol &&
      (this.authority ?? '') === (other.authority ?? '') &&
      this.file === other.file &&
      this.ref === other.ref
    )
  }

  // hash mémorisé : les champs sont immuables (clé fréquente des LinkedHashMap/LinkedHashSet du scan)
  #hash: number | undefined

  hashCode(): number {
    return (this.#hash ??= hash(this.toExternalForm()))
  }
}

/** `java.net.URI` : chaîne d'origine conservée par toString */
export class URI implements Equatable {
  readonly scheme: string | null
  readonly authority: string | null
  readonly path: string
  readonly query: string | null
  readonly fragment: string | null

  constructor(private readonly str: string) {
    if (/[\s"<>\\^`{|}]/.test(str)) throw new URISyntaxException(`Illegal character in URI: ${str}`)
    try {
      const p = parse(str, false)
      this.scheme = p.scheme
      this.authority = p.authority
      this.path = p.path
      this.query = p.query
      this.fragment = p.fragment
    } catch {
      // URI relative
      this.scheme = null
      this.authority = null
      this.path = str
      this.query = null
      this.fragment = null
    }
  }

  toString(): string {
    return this.str
  }

  toJSON(): string {
    return this.str
  }

  toURL(): URL {
    if (this.scheme === null) throw new IllegalArgumentException('URI is not absolute')
    return new URL(this.str)
  }

  equals(other: unknown): boolean {
    return other instanceof URI && this.str === other.str
  }

  hashCode(): number {
    return hash(this.str)
  }
}

// Caractères laissés tels quels par UnixUriUtils.toUri : unreserved | ":" "@" "&" "=" "+" "$" "," ";" "/"
const PATH_SAFE = /[A-Za-z0-9\-_.!~*'():@&=+$,;/]/

function encodePath(path: string): string {
  let out = ''
  for (const b of Buffer.from(path, 'utf8')) {
    const c = String.fromCharCode(b)
    out += b < 0x80 && PATH_SAFE.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/** `Path.toUri()` : `file:///...` encodé, `/` final si le chemin est un répertoire existant */
export function pathToUri(path: string): URI {
  let abs = resolve(path)
  let isDir = false
  try {
    isDir = existsSync(abs) && statSync(abs).isDirectory()
  } catch {
    isDir = false
  }
  if (isDir && !abs.endsWith('/')) abs += '/'
  return new URI(`file://${encodePath(abs)}`)
}

/** `path.toUri().toURL()` */
export function pathToUrl(path: string): URL {
  return pathToUri(path).toURL()
}

/** `url.toURI().toPath()` / `Paths.get(url.toURI())` */
export function urlToPath(url: URL | URI): string {
  const u = url instanceof URL ? url.toURI() : url
  if (u.scheme === null) throw new IllegalArgumentException('URI is not absolute')
  if (u.scheme.toLowerCase() !== 'file') throw new IllegalArgumentException("URI scheme is not \"file\"")
  if (u.authority !== null && u.authority.length > 0) throw new IllegalArgumentException('URI has an authority component')
  if (u.fragment !== null) throw new IllegalArgumentException('URI has a fragment component')
  if (u.query !== null) throw new IllegalArgumentException('URI has a query component')
  if (u.path === '') throw new IllegalArgumentException('URI path component is empty')
  let p = decodeURIComponent(u.path.replace(/%(?![0-9A-Fa-f]{2})/g, '%25'))
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '')
  return p
}
