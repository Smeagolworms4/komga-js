// Support de portage : interfaces scellées Kotlin à héritage multiple, `data object`, et un
// ObjectMapper Jackson minimal piloté par les métadonnées de `port/jackson.ts`.
// Ce fichier n'a pas de jumeau Kotlin.
//
// Pourquoi un fichier séparé :
// - `JsonMeta` (port/jackson.ts) ne sait décrire que `@JsonTypeInfo(use = NAME)` ; les conditions de
//   recherche utilisent aussi `@JsonTypeInfo(use = DEDUCTION)`, enregistré ici par `jsonTypeInfoDeduction`.
// - Jackson s'appuie sur la réflexion Kotlin (types génériques des propriétés, sous-types des
//   interfaces scellées) : ces informations sont déclarées explicitement par `jsonProperties`
//   et `sealedInterface`.
// - L'ObjectMapper complet est porté avec l'infrastructure ; `objectMapper` ci-dessous couvre ce qui
//   est nécessaire aux objets de recherche (BookSearch / SeriesSearch) et à leurs tests.
import { Duration, ZoneOffset, ZonedDateTime, DateTimeFormatter } from '@js-joda/core'
import { jsonMetaOf, type JsonIncludeValue } from './jackson.js'
import { type Equatable, IllegalArgumentException, KEnum, hash } from './kotlin.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClass = abstract new (...args: any[]) => unknown

// ---------------------------------------------------------------------------
// sealed interface (une classe peut implémenter plusieurs interfaces scellées)
// ---------------------------------------------------------------------------

/**
 * Équivalent d'une `sealed interface` Kotlin : une valeur utilisable avec `instanceof`,
 * qui connaît ses sous-types (classes ou instances de `data object`).
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

// ---------------------------------------------------------------------------
// data object
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Métadonnées complémentaires (@JsonTypeInfo(DEDUCTION), types des propriétés)
// ---------------------------------------------------------------------------

/** Type d'une propriété, tel que Jackson le lit par réflexion. */
export type JsonType =
  | 'Any'
  | 'String'
  | 'Number'
  | 'Boolean'
  | { readonly enum: { valueOf(name: string): KEnum; entries(): KEnum[] } }
  | { readonly class: object; readonly args?: readonly JsonType[] }
  | { readonly list: JsonType }
  | { readonly typeVar: string }
  | { readonly scalar: string; readonly read: (s: string) => unknown; readonly write: (v: never) => string }

/** Types java.time avec la configuration Jackson de Spring Boot (dates en ISO, pas de timestamps). */
export const JsonTypes = {
  ZonedDateTime: {
    scalar: 'ZonedDateTime',
    // ADJUST_DATES_TO_CONTEXT_TIME_ZONE (contexte UTC) + NORMALIZE_DESERIALIZED_ZONE_ID
    read: (s: string) => ZonedDateTime.parse(s).withZoneSameInstant(ZoneOffset.UTC),
    write: (v: ZonedDateTime) => v.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
  },
  Duration: {
    scalar: 'Duration',
    read: (s: string) => Duration.parse(s),
    write: (v: Duration) => v.toString(),
  },
} as const satisfies Record<string, JsonType>

type PropertiesMeta = { typeParams: readonly string[]; props: Record<string, JsonType> }

const propertiesMeta = new WeakMap<object, PropertiesMeta>()
const deduction = new WeakSet<object>()

/** Types (réflexion Kotlin) des propriétés du constructeur, dans l'ordre de déclaration. */
export function jsonProperties(cls: object, props: Record<string, JsonType>, typeParams: readonly string[] = []): void {
  propertiesMeta.set(cls, { typeParams, props })
}

/** `@JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION)` */
export function jsonTypeInfoDeduction(cls: object): void {
  deduction.add(cls)
}

// ---------------------------------------------------------------------------
// ObjectMapper minimal
// ---------------------------------------------------------------------------

function isSealed(t: object): t is SealedInterface<unknown> {
  return sealedInterfaces.includes(t as SealedInterface<unknown>)
}

function metaOf(v: object): ReturnType<typeof jsonMetaOf> {
  return typeof v === 'function' ? jsonMetaOf(v) : { ...jsonMetaOf(v.constructor), ...jsonMetaOf(v) }
}

/** Nom du type (`@JsonTypeName`) si la valeur appartient à une interface scellée `@JsonTypeInfo(use = NAME)`. */
function typeIdOf(v: object): { property: string; name: string } | null {
  const typeName = metaOf(v).typeName
  if (typeName === undefined) return null
  for (const s of sealedInterfaces) {
    const ti = jsonMetaOf(s).typeInfo
    if (ti !== undefined && v instanceof (s as never)) return { property: ti.property, name: typeName }
  }
  return null
}

function included(value: unknown, include: JsonIncludeValue): boolean {
  switch (include) {
    case 'ALWAYS':
      return true
    case 'NON_NULL':
    case 'NON_ABSENT':
      return value !== null && value !== undefined
    case 'NON_EMPTY':
      if (value === null || value === undefined) return false
      if (typeof value === 'string' || Array.isArray(value)) return value.length > 0
      if (value instanceof Set || value instanceof Map) return value.size > 0
      return true
    case 'NON_DEFAULT':
      return value !== null && value !== undefined && value !== false && value !== 0 && value !== ''
  }
}

function toTree(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (v instanceof KEnum) return v.name
  if (v instanceof ZonedDateTime) return JsonTypes.ZonedDateTime.write(v)
  if (v instanceof Duration) return JsonTypes.Duration.write(v)
  if (Array.isArray(v) || v instanceof Set) return [...v].map(toTree)
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), toTree(x)]))
  if (typeof v === 'object') {
    const meta = metaOf(v)
    const out: Record<string, unknown> = {}
    const typeId = typeIdOf(v)
    if (typeId !== null) out[typeId.property] = typeId.name
    const props = v instanceof DataObject ? [] : Object.keys(v)
    for (const k of props) {
      if (meta.ignore?.includes(k)) continue
      const value = (v as Record<string, unknown>)[k]
      const include = meta.propertyInclude?.[k] ?? meta.include ?? 'ALWAYS'
      if (!included(value, include)) continue
      out[meta.rename?.[k] ?? k] = toTree(value)
    }
    return out
  }
  throw new IllegalArgumentException(`Cannot serialize ${String(v)}`)
}

function jsonNamesOf(cls: object): Map<string, string> {
  const meta = jsonMetaOf(cls)
  const props = propertiesMeta.get(cls)?.props ?? {}
  return new Map(
    Object.keys(props)
      .filter((k) => !meta.ignore?.includes(k))
      .map((k) => [meta.rename?.[k] ?? k, k]),
  )
}

function findKey<V>(m: Map<string, V>, key: string): V | undefined {
  // spring.jackson.mapper.accept-case-insensitive-properties: true
  return m.get(key) ?? [...m].find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1]
}

function fromTree(node: unknown, type: JsonType, bindings: Map<string, JsonType>): unknown {
  if (node === null || node === undefined) return null
  // type générique non résolu (effacé) : Jackson produit la valeur JSON brute
  if (type === 'Any') return node
  if (type === 'String' || type === 'Number' || type === 'Boolean') {
    const expected = type.toLowerCase()
    if (typeof node !== expected) throw new IllegalArgumentException(`Expected ${type}, got ${JSON.stringify(node)}`)
    return node
  }
  if ('typeVar' in type) {
    const bound = bindings.get(type.typeVar)
    if (bound === undefined) throw new IllegalArgumentException(`Unbound type variable ${type.typeVar}`)
    return fromTree(node, bound, bindings)
  }
  if ('scalar' in type) return type.read(String(node))
  if ('list' in type) {
    if (!Array.isArray(node)) throw new IllegalArgumentException(`Expected array, got ${JSON.stringify(node)}`)
    return node.map((it) => fromTree(it, type.list, bindings))
  }
  if ('enum' in type) {
    // spring.jackson.mapper.accept-case-insensitive-values: true
    const name = String(node)
    const e = type.enum.entries().find((it) => it.name === name) ?? type.enum.entries().find((it) => it.name.toLowerCase() === name.toLowerCase())
    return e ?? type.enum.valueOf(name)
  }
  const args = (type.args ?? []).map((it) => (typeof it === 'object' && 'typeVar' in it ? (bindings.get(it.typeVar) ?? it) : it))
  if (typeof node !== 'object' || Array.isArray(node)) throw new IllegalArgumentException(`Expected object, got ${JSON.stringify(node)}`)
  const obj = node as Record<string, unknown>
  let target: object = type.class
  if (isSealed(target)) {
    const subTypes = target.subTypes()
    const ti = jsonMetaOf(target).typeInfo
    if (ti !== undefined) {
      const id = obj[ti.property]
      const sub = subTypes.find((it) => metaOf(it).typeName === id)
      if (sub === undefined) throw new IllegalArgumentException(`Could not resolve type id '${String(id)}' as a subtype of ${target.name}`)
      target = sub
    } else if (deduction.has(target)) {
      let candidates = [...subTypes]
      for (const key of Object.keys(obj)) {
        const remaining = candidates.filter((it) => findKey(jsonNamesOf(typeof it === 'function' ? it : it.constructor), key) !== undefined)
        if (remaining.length > 0) candidates = remaining
        if (candidates.length === 1) break
      }
      if (candidates.length !== 1) throw new IllegalArgumentException(`Could not deduce subtype of ${target.name} for ${JSON.stringify(node)}`)
      target = candidates[0] as object
    } else throw new IllegalArgumentException(`No type information for ${target.name}`)
  }
  // data object : l'instance unique
  if (typeof target !== 'function') return target
  const pm = propertiesMeta.get(target) ?? { typeParams: [], props: {} }
  const localBindings = new Map(pm.typeParams.map((p, i) => [p, args[i] ?? ('Any' as JsonType)]))
  const names = jsonNamesOf(target)
  const params: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const prop = findKey(names, key)
    // FAIL_ON_UNKNOWN_PROPERTIES est désactivé par Spring Boot
    if (prop === undefined) continue
    params[prop] = fromTree(value, pm.props[prop] as JsonType, localBindings)
  }
  const C = target as unknown as new (p: Record<string, unknown>) => unknown
  return new C(params)
}

function write(v: unknown, pretty: boolean): string {
  return JSON.stringify(toTree(v), null, pretty ? 2 : undefined)
}

/** Équivalent minimal de l'`ObjectMapper` Jackson configuré par Spring Boot. */
export const objectMapper = {
  writeValueAsString(v: unknown): string {
    return write(v, false)
  },
  writerWithDefaultPrettyPrinter(): { writeValueAsString(v: unknown): string } {
    return { writeValueAsString: (v: unknown) => write(v, true) }
  },
  /** `readValue<T>(json)` : le type Kotlin réifié est passé explicitement. */
  readValue<T>(json: string, type: JsonType): T {
    return fromTree(JSON.parse(json), type, new Map()) as T
  },
}
