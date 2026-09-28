// Support de portage : com.fasterxml.jackson.databind.ObjectMapper tel que construit par Spring Boot pour Komga
// (Jackson2ObjectMapperBuilder + modules Kotlin, JavaTimeModule, Jdk8Module ; WRITE_DATES_AS_TIMESTAMPS et
// WRITE_DURATIONS_AS_TIMESTAMPS désactivés ; FAIL_ON_UNKNOWN_PROPERTIES désactivé ; application.yml de Komga :
// FAIL_ON_NULL_FOR_PRIMITIVES, accept-case-insensitive-properties, accept-case-insensitive-values).
// Formats relevés sur les vraies bibliothèques (tools/jshell-komga.sh), voir test/port/jackson-mapper.test.ts.
//
// La réflexion Kotlin (types des propriétés, nullabilité, sous-types scellés) est remplacée par des métadonnées
// déclarées dans chaque fichier jumeau : `json(...)` (port/jackson.ts), `jsonProperties(...)`, `sealedInterface(...)`.
// Ce fichier n'a pas de jumeau Kotlin.
import { DateTimeFormatter, Duration, Instant, LocalDate, LocalDateTime, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { type JsonIncludeValue, jsonMetaOf } from './jackson.js'
import { JsonNumber, type JsonNode, javaDoubleToString, javaFloatToString, readTree, writeTree } from './jackson-tree.js'
import { URI, URL } from './java-net.js'
import { DataObject, Exception, KEnum, type SealedInterface, sealedInterfaceList } from './kotlin.js'

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

/** `com.fasterxml.jackson.core.JsonProcessingException` */
export class JsonProcessingException extends Exception {}
/** `com.fasterxml.jackson.databind.JsonMappingException` */
export class JsonMappingException extends JsonProcessingException {}
/** `MismatchedInputException` */
export class MismatchedInputException extends JsonMappingException {}
/** `InvalidFormatException` */
export class InvalidFormatException extends MismatchedInputException {}
/** `com.fasterxml.jackson.module.kotlin.MissingKotlinParameterException` */
export class MissingKotlinParameterException extends MismatchedInputException {}
/** `JsonParseException` */
export class JsonParseException extends JsonProcessingException {}

// ---------------------------------------------------------------------------
// Types (réflexion)
// ---------------------------------------------------------------------------

/** Type d'une propriété, tel que Jackson le lit par réflexion. */
export type JsonType =
  | 'Any'
  | 'String'
  | 'Boolean'
  | 'Int'
  | 'Long'
  | 'Float'
  | 'Double'
  /** nombre sans précision (ancien 'Number' : Int si entier, Double sinon) */
  | 'Number'
  | { readonly enum: { valueOf(name: string): KEnum; entries(): KEnum[] } }
  | { readonly class: object; readonly args?: readonly JsonType[] }
  | { readonly list: JsonType }
  | { readonly set: JsonType }
  | { readonly map: JsonType; readonly key?: JsonType }
  | { readonly typeVar: string }
  | { readonly nullable: JsonType }
  | { readonly scalar: string; readonly read: (s: string) => unknown; readonly write: (v: never) => string }

/** Types scalaires avec la configuration Jackson de Spring Boot */
export const JsonTypes = {
  /** ISO_LOCAL_DATE_TIME : secondes toujours écrites, fraction minimale */
  LocalDateTime: {
    scalar: 'LocalDateTime',
    read: (s: string) => LocalDateTime.parse(s.endsWith('Z') ? s.slice(0, -1) : s),
    write: (v: LocalDateTime) => v.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
  },
  LocalDate: {
    scalar: 'LocalDate',
    read: (s: string) => LocalDate.parse(s),
    write: (v: LocalDate) => v.toString(),
  },
  /** ISO_OFFSET_DATE_TIME ; à la lecture, ADJUST_DATES_TO_CONTEXT_TIME_ZONE (UTC) */
  ZonedDateTime: {
    scalar: 'ZonedDateTime',
    read: (s: string) => ZonedDateTime.parse(s).withZoneSameInstant(ZoneOffset.UTC),
    write: (v: ZonedDateTime) => v.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
  },
  Instant: {
    scalar: 'Instant',
    read: (s: string) => Instant.parse(s),
    write: (v: Instant) => v.toString(),
  },
  Duration: {
    scalar: 'Duration',
    read: (s: string) => Duration.parse(s),
    write: (v: Duration) => v.toString(),
  },
  URL: {
    scalar: 'URL',
    read: (s: string) => new URL(s),
    write: (v: URL) => v.toString(),
  },
  URI: {
    scalar: 'URI',
    read: (s: string) => new URI(s),
    write: (v: URI) => v.toString(),
  },
  /** ByteArray : base64 */
  ByteArray: {
    scalar: 'ByteArray',
    read: (s: string) => new Uint8Array(Buffer.from(s, 'base64')),
    write: (v: Uint8Array) => Buffer.from(v).toString('base64'),
  },
} as const satisfies Record<string, JsonType>

type PropertiesMeta = {
  typeParams: readonly string[]
  props: Record<string, JsonType>
  /** paramètres Kotlin non nuls sans valeur par défaut */
  required: readonly string[]
  /** getters calculés sérialisés par Jackson (propriétés `val x get()`) */
  getters: readonly string[]
}

const propertiesMeta = new WeakMap<object, PropertiesMeta>()
const deduction = new WeakSet<object>()

/**
 * Types (réflexion Kotlin) des propriétés, dans l'ordre de déclaration.
 * `required` : paramètres non nuls sans défaut (MissingKotlinParameterException si absents).
 */
export function jsonProperties(
  cls: object,
  props: Record<string, JsonType>,
  typeParams: readonly string[] = [],
  opts: { required?: readonly string[]; getters?: readonly string[] } = {},
): void {
  propertiesMeta.set(cls, { typeParams, props, required: opts.required ?? [], getters: opts.getters ?? [] })
}

export function jsonPropertiesOf(cls: object): PropertiesMeta | undefined {
  let c: object | null = cls
  while (c) {
    const m = propertiesMeta.get(c)
    if (m) return m
    c = Object.getPrototypeOf(c) as object | null
  }
  return undefined
}

/** `@JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION)` */
export function jsonTypeInfoDeduction(cls: object): void {
  deduction.add(cls)
}

// ---------------------------------------------------------------------------
// Sérialisation
// ---------------------------------------------------------------------------

function metaOf(v: object): ReturnType<typeof jsonMetaOf> {
  return typeof v === 'function' ? jsonMetaOf(v) : { ...jsonMetaOf(v.constructor), ...jsonMetaOf(v) }
}

function typeIdOf(v: object): { property: string; name: string } | null {
  const typeName = metaOf(v).typeName
  if (typeName === undefined) return null
  for (const s of sealedInterfaceList()) {
    const ti = jsonMetaOf(s).typeInfo
    if (ti !== undefined && v instanceof (s as never)) return { property: ti.property, name: typeName }
  }
  let c: object | null = Object.getPrototypeOf(v.constructor) as object | null
  while (c) {
    const ti = jsonMetaOf(c).typeInfo
    if (ti !== undefined) return { property: ti.property, name: typeName }
    c = Object.getPrototypeOf(c) as object | null
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

function num(v: number, type: JsonType | undefined): JsonNode {
  if (type === 'Float') return new JsonNumber('double', Number(javaFloatToString(v)))
  if (type === 'Double') return new JsonNumber('double', v)
  if (type === 'Int' || type === 'Long') return new JsonNumber('int', v)
  return new JsonNumber(Number.isInteger(v) && !Object.is(v, -0) ? 'int' : 'double', v)
}

function unwrapNullable(t: JsonType | undefined): JsonType | undefined {
  return t !== undefined && typeof t === 'object' && 'nullable' in t ? t.nullable : t
}

export function toTree(v: unknown, declared?: JsonType, bindings: Map<string, JsonType> = new Map()): JsonNode {
  let type = unwrapNullable(declared)
  if (type !== undefined && typeof type === 'object' && 'typeVar' in type) type = bindings.get(type.typeVar)
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return num(v, type)
  if (typeof v === 'bigint') return new JsonNumber('int', v)
  if (type !== undefined && typeof type === 'object' && 'scalar' in type) return type.write(v as never)
  if (v instanceof KEnum) return v.toJSON()
  if (v instanceof LocalDateTime) return JsonTypes.LocalDateTime.write(v)
  if (v instanceof LocalDate) return JsonTypes.LocalDate.write(v)
  if (v instanceof ZonedDateTime) return JsonTypes.ZonedDateTime.write(v)
  if (v instanceof Instant) return JsonTypes.Instant.write(v)
  if (v instanceof Duration) return JsonTypes.Duration.write(v)
  if (v instanceof URL || v instanceof URI) return v.toString()
  if (v instanceof Uint8Array) return JsonTypes.ByteArray.write(v)
  if (v instanceof JsonNumber) return v
  if (Array.isArray(v) || v instanceof Set) {
    const el = type !== undefined && typeof type === 'object' ? ('list' in type ? type.list : 'set' in type ? type.set : undefined) : undefined
    return [...v].map((x) => toTree(x, el, bindings))
  }
  if (v instanceof Map) {
    const el = type !== undefined && typeof type === 'object' && 'map' in type ? type.map : undefined
    return new Map([...v].map(([k, x]) => [k instanceof KEnum ? k.name : String(k), toTree(x, el, bindings)]))
  }
  if (typeof v === 'object') {
    if (v instanceof DataObject) {
      const out = new Map<string, JsonNode>()
      const typeId = typeIdOf(v)
      if (typeId !== null) out.set(typeId.property, typeId.name)
      return out
    }
    const meta = metaOf(v)
    const pm = jsonPropertiesOf(v.constructor)
    const args = type !== undefined && typeof type === 'object' && 'class' in type ? (type.args ?? []) : []
    const localBindings = new Map((pm?.typeParams ?? []).map((p, i) => [p, (args[i] as JsonType | undefined) ?? 'Any']))
    const out = new Map<string, JsonNode>()
    const typeId = typeIdOf(v)
    if (typeId !== null) out.set(typeId.property, typeId.name)
    // MapperFeature.SORT_CREATOR_PROPERTIES_FIRST (activé par défaut) : les paramètres du constructeur (déclarés par
    // jsonProperties) d'abord, dans leur ordre, puis les autres propriétés (champs de la classe parente d'abord)
    const ownKeys = Object.keys(v)
    const creatorKeys = pm !== undefined ? Object.keys(pm.props).filter((k) => ownKeys.includes(k)) : []
    const keys = [...creatorKeys, ...ownKeys.filter((k) => !creatorKeys.includes(k)), ...(pm?.getters ?? [])]
    for (const k of keys) {
      if (k.startsWith('_') || meta.ignore?.includes(k)) continue
      const value = (v as Record<string, unknown>)[k]
      if (typeof value === 'function') continue
      const include = meta.propertyInclude?.[k] ?? meta.include ?? 'ALWAYS'
      if (!included(value, include)) continue
      out.set(meta.rename?.[k] ?? k, toTree(value, pm?.props[k], localBindings))
    }
    return out
  }
  throw new JsonMappingException(`Cannot serialize ${String(v)}`)
}

// PrettyPrinter par défaut de Jackson : `"a" : 1`, tableaux `[ 1, 2 ]`, indentation de 2 espaces
function writePretty(n: JsonNode, indent: string): string {
  if (n instanceof Map) {
    if (n.size === 0) return '{ }'
    const inner = indent + '  '
    return `{\n${[...n].map(([k, x]) => `${inner}${writeTree(k)} : ${writePretty(x, inner)}`).join(',\n')}\n${indent}}`
  }
  if (Array.isArray(n)) {
    if (n.length === 0) return '[ ]'
    return `[ ${n.map((x) => writePretty(x, indent)).join(', ')} ]`
  }
  return writeTree(n)
}

// ---------------------------------------------------------------------------
// Désérialisation
// ---------------------------------------------------------------------------

function findKey<V>(m: Map<string, V>, key: string): V | undefined {
  // spring.jackson.mapper.accept-case-insensitive-properties: true
  return m.get(key) ?? [...m].find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1]
}

function jsonNamesOf(cls: object): Map<string, string> {
  const meta = jsonMetaOf(cls)
  const props = jsonPropertiesOf(cls)?.props ?? {}
  return new Map(
    Object.keys(props)
      .filter((k) => !meta.ignore?.includes(k))
      .map((k) => [meta.rename?.[k] ?? k, k]),
  )
}

function isSealed(t: object): t is SealedInterface<unknown> {
  return sealedInterfaceList().includes(t as SealedInterface<unknown>)
}

function nodeKind(n: JsonNode): string {
  if (n === null) return 'null'
  if (n instanceof Map) return 'object'
  if (Array.isArray(n)) return 'array'
  if (n instanceof JsonNumber) return 'number'
  return typeof n
}

function scalarText(n: JsonNode): string | null {
  if (typeof n === 'string') return n
  if (typeof n === 'boolean') return String(n)
  if (n instanceof JsonNumber) return writeTree(n)
  return null
}

export function fromTree(node: JsonNode, declared: JsonType, bindings: Map<string, JsonType> = new Map(), path = ''): unknown {
  const nullable = typeof declared === 'object' && 'nullable' in declared
  const type = unwrapNullable(declared) as JsonType
  if (node === null) {
    if (!nullable && (type === 'Int' || type === 'Long' || type === 'Float' || type === 'Double' || type === 'Boolean'))
      // FAIL_ON_NULL_FOR_PRIMITIVES
      throw new MismatchedInputException(`Cannot map \`null\` into type ${type} at ${path || '$'}`)
    return null
  }
  if (type === 'Any') return plain(node)
  if (type === 'String') {
    const s = scalarText(node)
    if (s === null) throw new MismatchedInputException(`Cannot deserialize value of type \`java.lang.String\` from ${nodeKind(node)} at ${path || '$'}`)
    return s
  }
  if (type === 'Boolean') {
    if (typeof node === 'boolean') return node
    if (typeof node === 'string' && (node === 'true' || node === 'false')) return node === 'true'
    if (node instanceof JsonNumber) return Number(node.value) !== 0
    throw new MismatchedInputException(`Cannot deserialize value of type \`boolean\` from ${nodeKind(node)} at ${path || '$'}`)
  }
  if (type === 'Int' || type === 'Long' || type === 'Float' || type === 'Double' || type === 'Number') {
    let n: number
    if (node instanceof JsonNumber) n = Number(node.value)
    else if (typeof node === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(node)) n = Number(node)
    else throw new InvalidFormatException(`Cannot deserialize value of type \`${type}\` from ${nodeKind(node)} at ${path || '$'}`)
    if (type === 'Int' || type === 'Long') {
      if (!Number.isInteger(n)) n = Math.trunc(n)
      if (type === 'Int' && (n > 2147483647 || n < -2147483648)) throw new InvalidFormatException(`Numeric value (${n}) out of range of int`)
      return n
    }
    return type === 'Float' ? Math.fround(n) : n
  }
  if ('typeVar' in type) {
    const bound = bindings.get(type.typeVar)
    return fromTree(node, bound ?? 'Any', bindings, path)
  }
  if ('scalar' in type) {
    const s = scalarText(node)
    if (s === null) throw new MismatchedInputException(`Cannot deserialize value of type \`${type.scalar}\` from ${nodeKind(node)} at ${path || '$'}`)
    try {
      return type.read(s)
    } catch (e) {
      throw new InvalidFormatException(`Cannot deserialize value of type \`${type.scalar}\` from String "${s}"`, e)
    }
  }
  if ('list' in type || 'set' in type) {
    const el = 'list' in type ? type.list : type.set
    // ACCEPT_SINGLE_VALUE_AS_ARRAY est désactivé
    if (!Array.isArray(node)) throw new MismatchedInputException(`Cannot deserialize value of type \`java.util.List\` from ${nodeKind(node)} at ${path || '$'}`)
    const items = node.map((it, i) => fromTree(it, el, bindings, `${path}[${i}]`))
    return 'set' in type ? new Set(items) : items
  }
  if ('map' in type) {
    if (!(node instanceof Map)) throw new MismatchedInputException(`Cannot deserialize value of type \`java.util.Map\` from ${nodeKind(node)} at ${path || '$'}`)
    return new Map([...node].map(([k, x]) => [type.key ? fromTree(k, type.key, bindings, path) : k, fromTree(x, type.map, bindings, `${path}.${k}`)]))
  }
  if ('enum' in type) {
    // spring.jackson.mapper.accept-case-insensitive-values: true
    const name = scalarText(node) ?? ''
    const e = type.enum.entries().find((it) => it.name === name) ?? type.enum.entries().find((it) => it.name.toLowerCase() === name.toLowerCase())
    if (!e) throw new InvalidFormatException(`Cannot deserialize value of type enum from String "${name}": not one of the values accepted for Enum class`)
    return e
  }
  const clsType = type as { readonly class: object; readonly args?: readonly JsonType[] }
  const args = (clsType.args ?? []).map((it) => (typeof it === 'object' && 'typeVar' in it ? (bindings.get(it.typeVar) ?? it) : it))
  if (!(node instanceof Map)) throw new MismatchedInputException(`Cannot deserialize value from ${nodeKind(node)} (expected object) at ${path || '$'}`)
  let target: object = clsType.class
  if (isSealed(target) || jsonMetaOf(target).typeInfo !== undefined || deduction.has(target)) {
    const subTypes = isSealed(target) ? target.subTypes() : []
    const ti = jsonMetaOf(target).typeInfo
    if (ti !== undefined) {
      const id = node.get(ti.property)
      const sub = subTypes.find((it) => metaOf(it).typeName === id)
      if (sub === undefined) throw new InvalidFormatException(`Could not resolve type id '${String(id)}' as a subtype of ${(target as { name?: string }).name}`)
      target = sub
    } else if (deduction.has(target)) {
      let candidates = [...subTypes]
      for (const key of node.keys()) {
        const remaining = candidates.filter((it) => findKey(jsonNamesOf(typeof it === 'function' ? it : it.constructor), key) !== undefined)
        if (remaining.length > 0) candidates = remaining
        if (candidates.length === 1) break
      }
      if (candidates.length !== 1) throw new InvalidFormatException(`Could not deduce subtype of ${(target as { name?: string }).name}`)
      target = candidates[0] as object
    }
  }
  // data object : l'instance unique
  if (typeof target !== 'function') return target
  const pm = jsonPropertiesOf(target) ?? { typeParams: [], props: {}, required: [], getters: [] }
  const localBindings = new Map(pm.typeParams.map((p, i) => [p, (args[i] as JsonType | undefined) ?? ('Any' as JsonType)]))
  const names = jsonNamesOf(target)
  const params: Record<string, unknown> = {}
  for (const [key, value] of node) {
    const prop = findKey(names, key)
    // FAIL_ON_UNKNOWN_PROPERTIES est désactivé par Spring Boot
    if (prop === undefined) continue
    const pt = pm.props[prop] as JsonType
    const v = fromTree(value, pt, localBindings, `${path}.${key}`)
    // module Kotlin : null pour un paramètre non nul
    if (v === null && !(typeof pt === 'object' && 'nullable' in pt) && pt !== 'Any' && pm.required.includes(prop))
      throw new MissingKotlinParameterException(`Instantiation of [simple type, class ${(target as { name: string }).name}] value failed for JSON property ${key} due to missing (therefore NULL) value for creator parameter ${prop} which is a non-nullable type`)
    params[prop] = v
  }
  for (const r of pm.required)
    if (!(r in params))
      throw new MissingKotlinParameterException(`Instantiation of [simple type, class ${(target as { name: string }).name}] value failed for JSON property ${r} due to missing (therefore NULL) value for creator parameter ${r} which is a non-nullable type`)
  const C = target as unknown as new (p: Record<string, unknown>) => unknown
  const instance = new C(params) as Record<string, unknown>
  // module Kotlin : un paramètre nullable absent et sans valeur par défaut vaut null (pas undefined)
  for (const prop of Object.keys(pm.props)) if (instance[prop] === undefined) instance[prop] = null
  return instance
}

/** Valeur JSON brute (type effacé / Any) : Map -> LinkedHashMap, nombres -> Int/Long/Double */
function plain(n: JsonNode): unknown {
  if (n instanceof JsonNumber) return typeof n.value === 'bigint' ? n.value : Number(n.value)
  if (n instanceof Map) return new Map([...n].map(([k, x]) => [k, plain(x)]))
  if (Array.isArray(n)) return n.map(plain)
  return n
}

// ---------------------------------------------------------------------------
// ObjectMapper
// ---------------------------------------------------------------------------

/** Type cible de `readValue` (équivalent de `Class<T>` / `TypeReference<T>`) */
export type JavaType = JsonType

function parse(src: string | Uint8Array): JsonNode {
  const text = typeof src === 'string' ? src : Buffer.from(src).toString('utf8')
  try {
    return readTree(text)
  } catch (e) {
    throw new JsonParseException(`Unexpected character: ${(e as Error).message}`, e)
  }
}

export class ObjectMapper {
  writeValueAsString(value: unknown, type?: JavaType): string {
    return writeTree(toTree(value, type))
  }

  writeValueAsBytes(value: unknown, type?: JavaType): Uint8Array {
    return Buffer.from(this.writeValueAsString(value, type), 'utf8')
  }

  writerWithDefaultPrettyPrinter(): { writeValueAsString(v: unknown, type?: JavaType): string } {
    return { writeValueAsString: (v: unknown, type?: JavaType) => writePretty(toTree(v, type), '') }
  }

  /** `readValue<T>(json)` : le type Kotlin réifié est passé explicitement */
  readValue<T>(src: string | Uint8Array, type: JavaType): T {
    return fromTree(parse(src), type) as T
  }

  readTree(src: string | Uint8Array): JsonNode {
    return parse(src)
  }

  treeToValue<T>(node: JsonNode, type: JavaType): T {
    return fromTree(node, type) as T
  }

  valueToTree(value: unknown, type?: JavaType): JsonNode {
    return toTree(value, type)
  }

  createObjectNode(): Map<string, JsonNode> {
    return new Map()
  }

  copy(): ObjectMapper {
    return new ObjectMapper()
  }
}

/** Double au format Java, pour les rares endroits qui formatent eux-mêmes */
export { javaDoubleToString, javaFloatToString }
