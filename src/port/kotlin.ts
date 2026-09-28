// Support de portage : équivalents des constructions Kotlin utilisées par Komga.
// Ce fichier n'a pas de jumeau Kotlin.

// ---------------------------------------------------------------------------
// Égalité / hash structurels (data class, collections, java.time, URL)
// ---------------------------------------------------------------------------

export interface Equatable {
  equals(other: unknown): boolean
  hashCode(): number
}

function isEquatable(v: unknown): v is Equatable {
  return typeof v === 'object' && v !== null && typeof (v as Equatable).equals === 'function'
}

/** Équivalent de `==` Kotlin (appelle `equals`). */
export function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b)
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (isEquatable(a)) return a.equals(b)
  if (a instanceof URL) return b instanceof URL && a.href === b.href
  // Kotlin : ByteArray utilise l'égalité de référence
  if (a instanceof Uint8Array) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => eq(x, b[i]))
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false
    // index structurel de b construit au premier élément structurel absent par identité (linéaire, pas quadratique)
    let bs: ReadonlySet<unknown> | null = null
    for (const x of a) {
      if (b.has(x)) continue
      if (!isStructural(x)) return false
      bs ??= structuralSet(b)
      if (!bs.has(x)) return false
    }
    return true
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false
    let bm: ReadonlyMap<unknown, unknown> | null = null
    for (const [k, v] of a) {
      if (b.has(k)) {
        if (!eq(v, b.get(k))) return false
        continue
      }
      if (!isStructural(k)) return false
      bm ??= b instanceof LinkedHashMap ? b : new LinkedHashMap(b)
      if (!bm.has(k) || !eq(v, bm.get(k))) return false
    }
    return true
  }
  if (Object.getPrototypeOf(a) === Object.prototype && Object.getPrototypeOf(b) === Object.prototype) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => eq((a as never)[k], (b as never)[k]))
  }
  return false
}

function strHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (31 * h + s.charCodeAt(i)) | 0
  return h
}

/** Équivalent de `hashCode()` (cohérent avec `eq`, pas avec la JVM). */
export function hash(v: unknown): number {
  if (v === null || v === undefined) return 0
  switch (typeof v) {
    case 'string':
      return strHash(v)
    case 'number':
      return strHash(String(v))
    case 'boolean':
      return v ? 1231 : 1237
    case 'bigint':
      return strHash(v.toString())
  }
  // equals sans hashCode (classes internes) : seau commun, cohérent avec eq
  if (isEquatable(v)) return typeof v.hashCode === 'function' ? v.hashCode() | 0 : 0
  if (v instanceof URL) return strHash(v.href)
  if (Array.isArray(v)) return v.reduce((h: number, x) => (31 * h + hash(x)) | 0, 1)
  if (v instanceof Set) {
    let h = 0
    for (const x of v) h = (h + hash(x)) | 0
    return h
  }
  if (v instanceof Map) {
    let h = 0
    for (const [k, x] of v) h = (h + (hash(k) ^ hash(x))) | 0
    return h
  }
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype)
    return Object.entries(v).reduce((h, [k, x]) => (h + (strHash(k) ^ hash(x))) | 0, 0)
  return 0
}

function setHas<T>(s: ReadonlySet<T>, x: T): boolean {
  if (s.has(x)) return true
  if (s instanceof LinkedHashSet || !isStructural(x)) return false
  for (const y of s) if (eq(x, y)) return true
  return false
}

// ---------------------------------------------------------------------------
// Collections Java à égalité structurelle (java.util.LinkedHashSet / LinkedHashMap / HashSet / HashMap)
// ---------------------------------------------------------------------------

/**
 * Valeur dont l'égalité `eq` n'est pas l'identité : `Equatable` (data class, java.time, URL du port…), URL,
 * tableau, Set, Map, objet littéral. Les primitives et les autres objets (enums, Uint8Array, instances sans
 * `equals`) sont comparés par `===` (SameValueZero), donc directement par la Map / le Set natif.
 */
export function isStructural(v: unknown): v is object {
  if (typeof v !== 'object' || v === null) return false
  if (isEquatable(v) || v instanceof URL || Array.isArray(v) || v instanceof Set || v instanceof Map) return true
  return Object.getPrototypeOf(v) === Object.prototype
}

/**
 * `java.util.LinkedHashSet` : `Set` natif (ordre d'insertion) dont l'appartenance suit `equals`/`hashCode`
 * (`eq`/`hash`). Les éléments structurels sont indexés par `hash()` (seaux), puis comparés par `eq` dans le seau,
 * comme HashMap ; les autres passent directement par le Set natif.
 * Comme Java : un élément égal à un élément présent n'est pas ajouté (le premier reste, à sa place) ;
 * modifier un élément présent de façon à changer son hash le rend introuvable.
 */
export class LinkedHashSet<T> extends Set<T> {
  #buckets: Map<number, T[]> | null = null

  constructor(items?: Iterable<T> | null) {
    super()
    if (items !== null && items !== undefined) for (const x of items) this.add(x)
  }

  /** Élément présent égal à `x` (le premier ajouté), ou `undefined` */
  private stored(x: T): T | undefined {
    if (super.has(x)) return x
    if (this.#buckets === null || !isStructural(x)) return undefined
    const bucket = this.#buckets.get(hash(x))
    if (bucket !== undefined) for (const y of bucket) if (eq(x, y)) return y
    return undefined
  }

  override has(x: T): boolean {
    return super.has(x) || this.stored(x) !== undefined
  }

  override add(x: T): this {
    if (super.has(x)) return this
    if (isStructural(x)) {
      const h = hash(x)
      if (this.#buckets === null) this.#buckets = new Map()
      const bucket = this.#buckets.get(h)
      if (bucket === undefined) this.#buckets.set(h, [x])
      else {
        for (const y of bucket) if (eq(x, y)) return this
        bucket.push(x)
      }
    }
    return super.add(x)
  }

  override delete(x: T): boolean {
    if (!isStructural(x)) return super.delete(x)
    if (this.#buckets === null) return false
    const h = hash(x)
    const bucket = this.#buckets.get(h)
    if (bucket === undefined) return false
    const i = bucket.findIndex((y) => y === x || eq(x, y))
    if (i < 0) return false
    const y = bucket[i] as T
    if (bucket.length === 1) this.#buckets.delete(h)
    else bucket.splice(i, 1)
    return super.delete(y)
  }

  override clear(): void {
    this.#buckets = null
    super.clear()
  }
}

/**
 * `java.util.LinkedHashMap` (ordre d'insertion) : clés comparées par `eq`/`hash` comme `LinkedHashSet`.
 * Comme Java : `set` d'une clé égale à une clé présente garde la clé d'origine et sa place, et remplace la valeur.
 */
export class LinkedHashMap<K, V> extends Map<K, V> {
  #buckets: Map<number, K[]> | null = null

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    super()
    if (entries !== null && entries !== undefined) for (const [k, v] of entries) this.set(k, v)
  }

  /** Clé présente égale à `k`, ou `undefined` */
  private storedKey(k: K): K | undefined {
    if (super.has(k)) return k
    if (this.#buckets === null || !isStructural(k)) return undefined
    const bucket = this.#buckets.get(hash(k))
    if (bucket !== undefined) for (const y of bucket) if (eq(k, y)) return y
    return undefined
  }

  override has(k: K): boolean {
    return super.has(k) || this.storedKey(k) !== undefined
  }

  override get(k: K): V | undefined {
    if (super.has(k)) return super.get(k)
    const s = this.storedKey(k)
    return s === undefined ? undefined : super.get(s)
  }

  override set(k: K, v: V): this {
    if (super.has(k)) return super.set(k, v)
    if (isStructural(k)) {
      const h = hash(k)
      if (this.#buckets === null) this.#buckets = new Map()
      const bucket = this.#buckets.get(h)
      if (bucket === undefined) this.#buckets.set(h, [k])
      else {
        for (const y of bucket) if (eq(k, y)) return super.set(y, v)
        bucket.push(k)
      }
    }
    return super.set(k, v)
  }

  override delete(k: K): boolean {
    if (!isStructural(k)) return super.delete(k)
    if (this.#buckets === null) return false
    const h = hash(k)
    const bucket = this.#buckets.get(h)
    if (bucket === undefined) return false
    const i = bucket.findIndex((y) => y === k || eq(k, y))
    if (i < 0) return false
    const y = bucket[i] as K
    if (bucket.length === 1) this.#buckets.delete(h)
    else bucket.splice(i, 1)
    return super.delete(y)
  }

  override clear(): void {
    this.#buckets = null
    super.clear()
  }
}

/**
 * `java.util.HashSet` / `HashMap` : même appartenance que les versions Linked.
 * PORT: itération dans l'ordre d'insertion (l'ordre des seaux de la JVM dépend de hashCode Java, que `hash()` ne
 * reproduit que pour les chaînes) ; là où cet ordre est observable (JSON), utiliser `javaHashSet` (jackson-mapper).
 */
export class HashSet<T> extends LinkedHashSet<T> {}
export class HashMap<K, V> extends LinkedHashMap<K, V> {}

// Java : AbstractSet/AbstractMap.equals ne dépendent pas de la classe d'implémentation. Les assertions de Vitest
// comparent `constructor` : ces collections se présentent comme Set / Map natifs (instanceof reste exact).
for (const [C, N] of [
  [LinkedHashSet, Set],
  [HashSet, Set],
  [LinkedHashMap, Map],
  [HashMap, Map],
] as const)
  Object.defineProperty(C.prototype, 'constructor', { value: N, writable: true, configurable: true })

/** Index structurel (LinkedHashSet) d'un Set, construit seulement s'il n'en est pas déjà un */
function structuralSet<T>(s: ReadonlySet<T>): ReadonlySet<T> {
  return s instanceof LinkedHashSet ? s : new LinkedHashSet(s)
}

// ---------------------------------------------------------------------------
// data class
// ---------------------------------------------------------------------------

const lazyCache = new WeakMap<object, Map<string, unknown>>()

/** Équivalent de `by lazy { }` : la valeur est calculée une fois et n'est pas une propriété de la data class. */
export function lazy<T>(self: object, key: string, init: () => T): T {
  let m = lazyCache.get(self)
  if (!m) lazyCache.set(self, (m = new Map()))
  if (!m.has(key)) m.set(key, init())
  return m.get(key) as T
}

type Ctor<T> = new (p: never) => T

/**
 * Base des `data class` Kotlin.
 * Les propriétés du constructeur sont les propriétés propres de l'instance, dans l'ordre de déclaration.
 * Le constructeur prend un objet de paramètres nommés ; les valeurs par défaut Kotlin sont des
 * valeurs par défaut de déstructuration (appliquées seulement si le paramètre est omis, comme en Kotlin).
 */
export abstract class DataClass<P extends object = object> implements Equatable {
  /** `copy(...)` : mêmes valeurs, sauf celles passées. Les valeurs par défaut ne sont pas réévaluées. */
  copy(patch: Partial<P> = {}): this {
    const C = this.constructor as Ctor<this>
    return new C({ ...this, ...patch } as never)
  }

  equals(other: unknown): boolean {
    if (this === other) return true
    if (other === null || typeof other !== 'object' || other.constructor !== this.constructor) return false
    const ka = Object.keys(this)
    return ka.every((k) => eq((this as never)[k], (other as never)[k]))
  }

  hashCode(): number {
    return Object.keys(this).reduce((h, k) => (31 * h + hash((this as never)[k])) | 0, 0)
  }

  toString(): string {
    const props = Object.keys(this).map((k) => `${k}=${str((this as never)[k])}`)
    return `${this.constructor.name}(${props.join(', ')})`
  }
}

/** Équivalent de la conversion en chaîne Kotlin (`"$x"`). */
export function str(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map(str).join(', ')}]`
  if (v instanceof Set) return `[${[...v].map(str).join(', ')}]`
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${str(k)}=${str(x)}`).join(', ')}}`
  if (v instanceof Uint8Array) return `[B@${hash(v).toString(16)}`
  return String(v)
}

// ---------------------------------------------------------------------------
// enum class
// ---------------------------------------------------------------------------

const enumOrdinals = new WeakMap<object, number>()

/**
 * Base des `enum class` Kotlin. Chaque constante est une instance statique.
 * `name`/`ordinal`/`compareTo` comme en Kotlin ; sérialisée en JSON par son nom (comme Jackson).
 */
export abstract class KEnum {
  readonly name: string
  readonly ordinal: number

  protected constructor(name: string) {
    const C = this.constructor
    const n = enumOrdinals.get(C) ?? 0
    enumOrdinals.set(C, n + 1)
    this.name = name
    this.ordinal = n
  }

  compareTo(other: this): number {
    return this.ordinal - other.ordinal
  }

  toString(): string {
    return this.name
  }

  toJSON(): string {
    return this.name
  }

  /** `entries` */
  static entries<E extends KEnum>(this: { prototype: E }): E[] {
    const C = this as unknown as abstract new () => E
    return Object.values(C)
      .filter((v): v is E => v instanceof C)
      .sort((a, b) => a.ordinal - b.ordinal)
  }

  /** `valueOf(name)` : lève une erreur si inconnu, comme Kotlin. */
  static valueOf<E extends KEnum>(this: { prototype: E; name: string }, name: string): E {
    const v = (KEnum.entries.call(this) as E[]).find((e) => e.name === name)
    if (!v) throw new IllegalArgumentException(`No enum constant ${this.name}.${name}`)
    return v
  }
}

// ---------------------------------------------------------------------------
// Exceptions Kotlin/Java
// ---------------------------------------------------------------------------

export class Exception extends Error {
  constructor(message?: string | null, cause?: unknown) {
    super(message ?? undefined, cause === undefined ? undefined : { cause })
    this.name = new.target.name
  }
}
export class RuntimeException extends Exception {}
export class IllegalArgumentException extends RuntimeException {}
export class IllegalStateException extends RuntimeException {}
export class NoSuchElementException extends RuntimeException {}
export class UnsupportedOperationException extends RuntimeException {}
export class IndexOutOfBoundsException extends RuntimeException {}
export class NumberFormatException extends IllegalArgumentException {}

/** `require(cond) { msg }` */
export function require(cond: boolean, msg: () => string = () => 'Failed requirement.'): asserts cond {
  if (!cond) throw new IllegalArgumentException(msg())
}
/** `check(cond) { msg }` */
export function check(cond: boolean, msg: () => string = () => 'Check failed.'): asserts cond {
  if (!cond) throw new IllegalStateException(msg())
}
/** `error(msg)` */
export function error(msg: unknown): never {
  throw new IllegalStateException(String(msg))
}
/** `x!!` */
export function nn<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new NullPointerException()
  return v
}
export class NullPointerException extends RuntimeException {}
/** `kotlin.NoWhenBranchMatchedException` : levée par le code généré pour un `when` exhaustif sans branche correspondante */
export class NoWhenBranchMatchedException extends RuntimeException {}

// ---------------------------------------------------------------------------
// Chaînes
// ---------------------------------------------------------------------------

// Caractères `Char.isWhitespace()` de Kotlin. JS `\s` / `trim()` diffèrent : ils retirent ﻿
// et gardent \u001C..\u001F. Vérifié contre la JVM (Java 21) sur les 65536 caractères du BMP.
const KOTLIN_WHITESPACE = '[\\t\\n\\u000B\\f\\r\\u001C-\\u001F \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]'
const TRIM_REGEX = new RegExp(`^${KOTLIN_WHITESPACE}+|${KOTLIN_WHITESPACE}+$`, 'g')
const BLANK_REGEX = new RegExp(`^${KOTLIN_WHITESPACE}*$`)

/** `String.trim()` de Kotlin (à utiliser à la place de `.trim()` de JS). */
export function trim(s: string): string {
  return s.replace(TRIM_REGEX, '')
}

/** `isBlank()` : vide ou uniquement des caractères `Char.isWhitespace()`. */
export function isBlank(s: string | null | undefined): boolean {
  return s === null || s === undefined || BLANK_REGEX.test(s)
}

/** `isNullOrBlank()` */
export function isNullOrBlank(s: string | null | undefined): s is null | undefined | '' {
  return isBlank(s)
}
export function isNotBlank(s: string | null | undefined): s is string {
  return !isBlank(s)
}
/** `buildList { add(..) }` : le bloc reçoit la liste en construction */
export function buildList<T>(block: (list: T[]) => void): T[] {
  const list: T[] = []
  block(list)
  return list
}
/** `Collection<T>?.isNullOrEmpty()` */
export function isNullOrEmpty<T>(c: readonly T[] | ReadonlySet<T> | null | undefined): c is null | undefined {
  return c === null || c === undefined || (Array.isArray(c) ? c.length === 0 : (c as ReadonlySet<T>).size === 0)
}
/** `equals(other, ignoreCase = true)` */
export function equalsIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  return a.length === b.length && (a.toUpperCase() === b.toUpperCase() || a.toLowerCase() === b.toLowerCase())
}

// ---------------------------------------------------------------------------
// Collections (fonctions d'extension Kotlin utilisées par Komga)
// ---------------------------------------------------------------------------

/** `intersect` : ensemble des éléments de `a` présents dans `b` (ordre de `a`). */
export function intersect<T>(a: Iterable<T>, b: Iterable<T>): Set<T> {
  // Kotlin : toMutableSet().retainAll(other)
  const bs = b instanceof LinkedHashSet ? (b as LinkedHashSet<T>) : new LinkedHashSet(b)
  const out = new LinkedHashSet<T>()
  for (const x of a) if (bs.has(x)) out.add(x)
  return out
}
/** `union` */
export function union<T>(a: Iterable<T>, b: Iterable<T>): Set<T> {
  // Kotlin : toMutableSet().addAll(other)
  const out = new LinkedHashSet(a)
  for (const x of b) out.add(x)
  return out
}
/** `subtract` / `a - b` pour des ensembles */
export function subtract<T>(a: Iterable<T>, b: Iterable<T>): Set<T> {
  // Kotlin : toMutableSet().removeAll(other)
  const out = new LinkedHashSet(a)
  for (const x of b) out.delete(x)
  return out
}
/** `toSet()` : dédoublonne avec l'égalité structurelle, en conservant l'ordre (LinkedHashSet). */
export function distinctSet<T>(a: Iterable<T>): Set<T> {
  return new LinkedHashSet(a)
}
/** `distinct()` */
export function distinct<T>(a: Iterable<T>): T[] {
  return [...new LinkedHashSet(a)]
}
/** `distinctBy { }` */
export function distinctBy<T, K>(a: Iterable<T>, sel: (t: T) => K): T[] {
  const keys = new HashSet<K>()
  const out: T[] = []
  for (const x of a) {
    const k = sel(x)
    if (keys.has(k)) continue
    keys.add(k)
    out.push(x)
  }
  return out
}
/** `contains` avec égalité structurelle (recherche linéaire sur une liste, comme Kotlin) */
export function contains<T>(a: Iterable<T>, x: T): boolean {
  if (a instanceof Set) return setHas(a, x)
  for (const y of a) if (eq(x, y)) return true
  return false
}
/** `mapNotNull { }` */
export function mapNotNull<T, R>(a: Iterable<T>, f: (t: T, i: number) => R | null | undefined): R[] {
  const out: R[] = []
  let i = 0
  for (const x of a) {
    const r = f(x, i++)
    if (r !== null && r !== undefined) out.push(r)
  }
  return out
}
/** `filterNotNull()` */
export function filterNotNull<T>(a: Iterable<T | null | undefined>): T[] {
  return [...a].filter((x): x is T => x !== null && x !== undefined)
}
/** `associateBy { }` (la dernière valeur gagne, ordre d'insertion conservé) */
export function associateBy<T, K>(a: Iterable<T>, key: (t: T) => K): Map<K, T> {
  const m = new LinkedHashMap<K, T>()
  for (const x of a) m.set(key(x), x)
  return m
}
/** `associate { k to v }` */
export function associate<T, K, V>(a: Iterable<T>, f: (t: T) => [K, V]): Map<K, V> {
  const m = new LinkedHashMap<K, V>()
  for (const x of a) {
    const [k, v] = f(x)
    m.set(k, v)
  }
  return m
}
/** `groupBy { }` */
export function groupBy<T, K>(a: Iterable<T>, key: (t: T) => K): Map<K, T[]> {
  const m = new LinkedHashMap<K, T[]>()
  for (const x of a) {
    const k = key(x)
    const l = m.get(k)
    if (l) l.push(x)
    else m.set(k, [x])
  }
  return m
}
/** `partition { }` */
export function partition<T>(a: Iterable<T>, p: (t: T) => boolean): [T[], T[]] {
  const y: T[] = []
  const n: T[] = []
  for (const x of a) (p(x) ? y : n).push(x)
  return [y, n]
}
/** `chunked(n)` */
export function chunked<T>(a: readonly T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}
/** `zipWithNext()` */
export function zipWithNext<T>(a: readonly T[]): [T, T][] {
  return a.slice(1).map((x, i) => [a[i] as T, x])
}

/** Comparateur Kotlin `compareValues` : null en premier. */
export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0)
  if (typeof (a as { compareTo?: unknown }).compareTo === 'function')
    return (a as { compareTo(o: unknown): number }).compareTo(b)
  throw new UnsupportedOperationException(`Not comparable: ${String(a)}`)
}
/** `sortedBy { }` (tri stable, comme Kotlin) */
export function sortedBy<T>(a: Iterable<T>, sel: (t: T) => unknown): T[] {
  return [...a].sort((x, y) => compareValues(sel(x), sel(y)))
}
/** `sortedByDescending { }` */
export function sortedByDescending<T>(a: Iterable<T>, sel: (t: T) => unknown): T[] {
  return [...a].sort((x, y) => compareValues(sel(y), sel(x)))
}
/** `maxByOrNull { }` (premier maximum, comme Kotlin) */
export function maxByOrNull<T>(a: Iterable<T>, sel: (t: T) => unknown): T | null {
  let best: T | null = null
  let bestK: unknown
  let first = true
  for (const x of a) {
    const k = sel(x)
    if (first || compareValues(k, bestK) > 0) {
      best = x
      bestK = k
      first = false
    }
  }
  return best
}
/** `minByOrNull { }` */
export function minByOrNull<T>(a: Iterable<T>, sel: (t: T) => unknown): T | null {
  let best: T | null = null
  let bestK: unknown
  let first = true
  for (const x of a) {
    const k = sel(x)
    if (first || compareValues(k, bestK) < 0) {
      best = x
      bestK = k
      first = false
    }
  }
  return best
}
/** `first()` */
export function first<T>(a: Iterable<T>, p: (t: T) => boolean = () => true): T {
  for (const x of a) if (p(x)) return x
  throw new NoSuchElementException('Collection contains no element matching the predicate.')
}
/** `firstOrNull()` */
export function firstOrNull<T>(a: Iterable<T>, p: (t: T) => boolean = () => true): T | null {
  for (const x of a) if (p(x)) return x
  return null
}
/** `last()` */
export function last<T>(a: readonly T[]): T {
  if (a.length === 0) throw new NoSuchElementException('List is empty.')
  return a[a.length - 1] as T
}
/** `lastOrNull()` */
export function lastOrNull<T>(a: readonly T[]): T | null {
  return a.length === 0 ? null : (a[a.length - 1] as T)
}
/** `single()` */
export function single<T>(a: Iterable<T>): T {
  const l = [...a]
  if (l.length === 0) throw new NoSuchElementException('Collection is empty.')
  if (l.length > 1) throw new IllegalArgumentException('Collection has more than one element.')
  return l[0] as T
}
/** `sumOf { }` */
export function sumOf<T>(a: Iterable<T>, f: (t: T) => number): number {
  let s = 0
  for (const x of a) s += f(x)
  return s
}
/** `plus` pour les Map (`a + b`) */
export function mapPlus<K, V>(a: ReadonlyMap<K, V>, b: ReadonlyMap<K, V> | Iterable<[K, V]>): Map<K, V> {
  return new LinkedHashMap<K, V>([...a, ...b])
}
/** `takeIf { }` */
export function takeIf<T>(v: T, p: (t: T) => boolean): T | null {
  return p(v) ? v : null
}
/** `ifBlank { }` */
export function ifBlank(s: string, f: () => string): string {
  return isBlank(s) ? f() : s
}
/** `ifEmpty { }` */
export function ifEmpty<T extends { length: number } | { size: number }>(v: T, f: () => T): T {
  // l'opérateur `in` lève une TypeError sur une chaîne primitive
  const n = typeof v === 'string' || 'length' in v ? (v as { length: number }).length : (v as { size: number }).size
  return n === 0 ? f() : v
}

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------

/** `Thread.sleep(ms)` : attente synchrone. */
export function threadSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// ---------------------------------------------------------------------------
// sealed interface / data object
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClass = abstract new (...args: any[]) => unknown

/**
 * Équivalent d'une `sealed interface` Kotlin : une valeur utilisable avec `instanceof`,
 * qui connaît ses sous-types (classes ou instances de `data object`). Une classe peut en implémenter plusieurs.
 */
export type SealedInterface<T> = {
  readonly name: string
  subTypes(): readonly (AnyClass | object)[]
  [Symbol.hasInstance](v: unknown): v is T
}

const sealedInterfaces: SealedInterface<unknown>[] = []

export function sealedInterface<T>(name: string, subTypes: () => readonly (AnyClass | object)[]): SealedInterface<T> {
  const s: SealedInterface<T> = {
    name,
    subTypes,
    [Symbol.hasInstance](v: unknown): v is T {
      return subTypes().some((it) => (typeof it === 'function' ? v instanceof it : v === it))
    },
  }
  sealedInterfaces.push(s as SealedInterface<unknown>)
  return s
}

export function sealedInterfaceList(): readonly SealedInterface<unknown>[] {
  return sealedInterfaces
}

/** Base des `data object` Kotlin : `toString()` = nom, égalité par classe. */
export abstract class DataObject implements Equatable {
  equals(other: unknown): boolean {
    return this === other || (other !== null && typeof other === 'object' && other.constructor === this.constructor)
  }

  hashCode(): number {
    return hash(this.constructor.name)
  }

  toString(): string {
    return this.constructor.name
  }
}

/** Valeur `Float` Kotlin : arrondie en flottant 32 bits (à appliquer à chaque affectation d'un champ Float) */
export function kFloat<T extends number | null | undefined>(v: T): T {
  return (v === null || v === undefined ? v : Math.fround(v)) as T
}
