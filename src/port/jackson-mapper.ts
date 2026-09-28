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
import { type JsonIncludeValue, jsonMetaOf, qualifiedNameOf } from './jackson.js'
import { JsonNumber, type JsonNode, JsonPoison, deferredError, javaDoubleToString, javaFloatToString, readTree, writeTree } from './jackson-tree.js'
import { URI, URL } from './java-net.js'
import { PageImpl, type Pageable, type Sort } from './spring-data.js'
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
/** `com.fasterxml.jackson.core.io.JsonEOFException` (fin d'entrée inattendue) */
export class JsonEOFException extends JsonParseException {}
/** `com.fasterxml.jackson.core.exc.InputCoercionException` (nombre hors limites) */
export class InputCoercionException extends JsonProcessingException {}
/** `com.fasterxml.jackson.databind.exc.InvalidTypeIdException` */
export class InvalidTypeIdException extends MismatchedInputException {}

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
  if (v instanceof PageImpl) return pageToTree(v, type, bindings)
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

// Sérialisation de PageImpl par Jackson (mode Spring Data par défaut, relevé sur Komga) :
// content, pageable, last, totalElements, totalPages, size, number, sort, first, numberOfElements, empty
function sortToTree(sort: Sort): JsonNode {
  return new Map<string, JsonNode>([
    ['empty', sort.isEmpty()],
    ['sorted', sort.isSorted],
    ['unsorted', sort.isUnsorted],
  ])
}

function pageToTree(page: PageImpl<unknown>, type: JsonType | undefined, bindings: Map<string, JsonType>): JsonNode {
  const el = type !== undefined && typeof type === 'object' && 'class' in type ? (type.args?.[0] as JsonType | undefined) : undefined
  const p: Pageable = page.pageable
  const pageable: JsonNode = p.isPaged
    ? new Map<string, JsonNode>([
        ['pageNumber', new JsonNumber('int', p.pageNumber)],
        ['pageSize', new JsonNumber('int', p.pageSize)],
        ['sort', sortToTree(p.sort)],
        ['offset', new JsonNumber('int', p.offset)],
        ['paged', true],
        ['unpaged', false],
      ])
    : 'INSTANCE'
  return new Map<string, JsonNode>([
    ['content', page.content.map((x) => toTree(x, el, bindings))],
    ['pageable', pageable],
    ['last', page.isLast],
    ['totalElements', new JsonNumber('int', page.totalElements)],
    ['totalPages', new JsonNumber('int', page.totalPages)],
    ['size', new JsonNumber('int', page.size)],
    ['number', new JsonNumber('int', page.number)],
    ['sort', sortToTree(page.sort)],
    ['first', page.isFirst],
    ['numberOfElements', new JsonNumber('int', page.numberOfElements)],
    ['empty', page.isEmpty()],
  ])
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
      // @JsonAlias : noms supplémentaires acceptés en lecture
      .flatMap((k) => [[meta.rename?.[k] ?? k, k] as [string, string], ...(meta.alias?.[k] ?? []).map((a) => [a, k] as [string, string])]),
  )
}

function isSealed(t: object): t is SealedInterface<unknown> {
  return sealedInterfaceList().includes(t as SealedInterface<unknown>)
}

// --- Messages d'erreur de Jackson (DeserializationContext, StdDeserializer, ClassUtil) ---

/** Erreur de syntaxe rencontrée au fil de la lecture (voir JsonPoison dans port/jackson-tree.ts) */
function poisonException(p: JsonPoison): JsonProcessingException {
  if (p.mismatch) return new MismatchedInputException(p.message)
  // ParserMinimalBase._reportInvalidEOF : JsonEOFException
  return p.message.startsWith('Unexpected end-of-input') ? new JsonEOFException(p.message) : new JsonParseException(p.message)
}

function checkPoison(n: JsonNode): void {
  if ((n as unknown) instanceof JsonPoison) throw poisonException(n as unknown as JsonPoison)
}

/** Fin d'un objet ou d'un tableau : erreur de lecture après ses entrées */
function checkDeferred(container: object): void {
  const p = deferredError(container)
  if (p !== undefined) throw poisonException(p)
}

/** Valeur lue sans être désérialisée (`skipChildren`, TokenBuffer) : première erreur de lecture qu'elle contient */
function scan(n: JsonNode): void {
  checkPoison(n)
  if (n instanceof Map) {
    for (const x of n.values()) scan(x)
    checkDeferred(n)
  } else if (Array.isArray(n)) {
    for (const x of n) scan(x)
    checkDeferred(n)
  }
}

const SCALAR_CLASSES: Record<string, string> = {
  LocalDateTime: 'java.time.LocalDateTime',
  LocalDate: 'java.time.LocalDate',
  ZonedDateTime: 'java.time.ZonedDateTime',
  Instant: 'java.time.Instant',
  Duration: 'java.time.Duration',
  URL: 'java.net.URL',
  URI: 'java.net.URI',
  ByteArray: 'byte[]',
}

const PRIMITIVES: Record<string, [string, string]> = {
  Int: ['int', 'java.lang.Integer'],
  Long: ['long', 'java.lang.Long'],
  Float: ['float', 'java.lang.Float'],
  Double: ['double', 'java.lang.Double'],
  Boolean: ['boolean', 'java.lang.Boolean'],
}

/** Nom qualifié Java (registerClass) ; à défaut, le nom de la classe TS */
function className(cls: object): string {
  return qualifiedNameOf(cls) ?? (cls as { name?: string }).name ?? String(cls)
}

/**
 * `JavaType.toCanonical()` d'un type déclaré ; `primitive` : paramètre de constructeur non nul d'un type primitif
 * (Int -> int). Listes et ensembles Kotlin : ArrayList et HashSet (implémentations par défaut de Jackson).
 */
function javaTypeName(t: JsonType, bindings: Map<string, JsonType> = new Map(), primitive = false): string {
  if (typeof t === 'string') {
    const p = PRIMITIVES[t]
    if (p !== undefined) return primitive ? p[0] : p[1]
    return t === 'String' ? 'java.lang.String' : t === 'Number' ? 'java.lang.Number' : 'java.lang.Object'
  }
  if ('nullable' in t) return javaTypeName(t.nullable, bindings)
  if ('typeVar' in t) {
    const b = bindings.get(t.typeVar)
    return b !== undefined ? javaTypeName(b) : 'java.lang.Object'
  }
  if ('scalar' in t) return SCALAR_CLASSES[t.scalar] ?? t.scalar
  if ('list' in t) return `java.util.ArrayList<${javaTypeName(t.list, bindings)}>`
  if ('set' in t) return `java.util.HashSet<${javaTypeName(t.set, bindings)}>`
  if ('map' in t) return `java.util.LinkedHashMap<${javaTypeName(t.key ?? 'String', bindings)},${javaTypeName(t.map, bindings)}>`
  if ('enum' in t) return className(t.enum)
  const args = (t.args ?? []).map((a) => javaTypeName(a, bindings))
  return args.length > 0 ? `${className(t.class)}<${args.join(',')}>` : className(t.class)
}

/** Description du jeton courant (`ClassUtil.getTypeDescription` / `JsonToken`) */
function tokenDesc(n: JsonNode): string {
  if (n instanceof Map) return 'Object value (token `JsonToken.START_OBJECT`)'
  if (Array.isArray(n)) return 'Array value (token `JsonToken.START_ARRAY`)'
  if (typeof n === 'string') return 'String value (token `JsonToken.VALUE_STRING`)'
  if (n instanceof JsonNumber) return n.kind === 'int' ? 'Integer value (token `JsonToken.VALUE_NUMBER_INT`)' : 'Floating-point value (token `JsonToken.VALUE_NUMBER_FLOAT`)'
  if (n === true) return 'Boolean value (token `JsonToken.VALUE_TRUE`)'
  if (n === false) return 'Boolean value (token `JsonToken.VALUE_FALSE`)'
  return 'Null value (token `JsonToken.VALUE_NULL`)'
}

function tokenName(n: JsonNode): string {
  if (n instanceof Map) return 'START_OBJECT'
  if (Array.isArray(n)) return 'START_ARRAY'
  if (typeof n === 'string') return 'VALUE_STRING'
  if (n instanceof JsonNumber) return n.kind === 'int' ? 'VALUE_NUMBER_INT' : 'VALUE_NUMBER_FLOAT'
  if (n === true) return 'VALUE_TRUE'
  if (n === false) return 'VALUE_FALSE'
  return 'VALUE_NULL'
}

/** `DeserializationContext.handleUnexpectedToken` */
function unexpectedToken(typeName: string, n: JsonNode): MismatchedInputException {
  return new MismatchedInputException(`Cannot deserialize value of type \`${typeName}\` from ${tokenDesc(n)}`)
}

/** `StdDeserializer._quotedString` */
function quoted(s: string): string {
  return `"${s.length <= 500 ? s : `${s.slice(0, 500)}]...[${s.slice(s.length - 500)}`}"`
}

/** `DeserializationContext.handleWeirdStringValue` */
function weirdString(typeName: string, s: string, msg: string, cause?: unknown): InvalidFormatException {
  return new InvalidFormatException(`Cannot deserialize value of type \`${typeName}\` from String ${quoted(s)}: ${msg}`, cause)
}

/** `CoercionAction.Fail` pour une chaîne vide */
function emptyStringCoercion(target: string): InvalidFormatException {
  return new InvalidFormatException(`Cannot coerce empty String ("") to ${target} (but could if coercion was enabled using \`CoercionConfig\`)`)
}

/** FAIL_ON_NULL_FOR_PRIMITIVES (application.yml de Komga) */
function nullForPrimitive(primitiveName: string): MismatchedInputException {
  return new MismatchedInputException(`Cannot map \`null\` into type \`${primitiveName}\` (set DeserializationConfig.DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES to 'false' to allow)`)
}

function coercedNullForPrimitive(primitiveName: string): MismatchedInputException {
  return new MismatchedInputException(`Cannot coerce \`null\` to \`${primitiveName}\` value (disable \`DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES\` to allow)`)
}

/** `ValueInstantiator` sans créateur pour ce type de jeton (`handleMissingInstantiator`) */
function missingInstantiator(cls: object, n: JsonNode): MismatchedInputException {
  let what: string
  if (typeof n === 'string') what = `no String-argument constructor/factory method to deserialize from String value ('${n}')`
  else if (n instanceof JsonNumber && n.kind === 'int') {
    const v = BigInt(n.value)
    const kind = v >= -2147483648n && v <= 2147483647n ? 'int/Int' : 'long/Long'
    what = `no ${kind}-argument constructor/factory method to deserialize from Number value (${String(n.value)})`
  } else if (n instanceof JsonNumber) what = `no double/Double-argument constructor/factory method to deserialize from Number value (${javaDoubleToString(Number(n.value))})`
  else what = `no boolean/Boolean-argument constructor/factory method to deserialize from boolean value (${String(n)})`
  return new MismatchedInputException(`Cannot construct instance of \`${className(cls)}\` (although at least one Creator exists): ${what}`)
}

/** `String.trim()` de Java */
function javaTrim(s: string): string {
  let st = 0
  let len = s.length
  while (st < len && s.charCodeAt(st) <= 0x20) st++
  while (st < len && s.charCodeAt(len - 1) <= 0x20) len--
  return s.substring(st, len)
}

/**
 * Clés de CompactStringObjectMap (EnumDeserializer, message "not one of the values accepted") : table construite
 * à partir d'un HashMap (ordre d'itération de HashMap), emplacement `hashCode & masque`, puis zone de débordement.
 */
function compactStringObjectMapKeys(names: string[]): string[] {
  const all = [...javaHashSet(names)]
  const size = all.length <= 5 ? 8 : all.length <= 12 ? 16 : (() => {
    const needed = all.length + (all.length >> 2)
    let r = 32
    while (r < needed) r += r
    return r
  })()
  const mask = size - 1
  const area: (string | undefined)[] = new Array((size + (size >> 1)) * 2)
  let spill = 0
  for (const key of all) {
    const slot = javaStringHash(key) & mask
    let ix = slot + slot
    if (area[ix] !== undefined) {
      ix = (size + (slot >> 1)) << 1
      if (area[ix] !== undefined) {
        ix = ((size + (size >> 1)) << 1) + spill
        spill += 2
      }
    }
    area[ix] = key
  }
  const keys: string[] = []
  for (let k = 0; k < area.length; k += 2) if (area[k] !== undefined) keys.push(area[k] as string)
  return keys
}

/** Message de DateTimeParseException de java.time à partir de celui de js-joda */
function dateTimeParseMessage(e: unknown, text: string): string {
  const m = (e as Error)?.message?.split('\n')[0] ?? String(e)
  return m.replace(new RegExp(`: ${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, at index: \\d+$`), '')
}

type Ctx = {
  /** propriété POJO en cours (message "(for POJO property 'x')" des désérialiseurs de type) */
  prop: string | null
  /** paramètre de constructeur (type primitif si non nul) */
  direct: boolean
  /** élément d'une collection */
  element: boolean
}

const ROOT: Ctx = { prop: null, direct: false, element: false }

export function fromTree(node: JsonNode, declared: JsonType, bindings: Map<string, JsonType> = new Map(), c: Ctx = ROOT): unknown {
  checkPoison(node)
  const nullable = typeof declared === 'object' && 'nullable' in declared
  let type = unwrapNullable(declared) as JsonType
  const primitive = c.direct && !nullable && typeof type === 'string' && PRIMITIVES[type] !== undefined
  if (node === null) {
    // FAIL_ON_NULL_FOR_PRIMITIVES
    if (primitive) throw nullForPrimitive((PRIMITIVES[type as string] as [string, string])[0])
    return null
  }
  if (typeof type === 'object' && 'typeVar' in type) type = bindings.get(type.typeVar) ?? 'Any'
  if (type === 'Any') return plain(node)
  if (type === 'String') {
    if (node instanceof Map || Array.isArray(node)) throw unexpectedToken('java.lang.String', node)
    return scalarText(node)
  }
  if (type === 'Boolean') {
    const jt = primitive ? 'boolean' : 'java.lang.Boolean'
    if (typeof node === 'boolean') return node
    if (node instanceof JsonNumber && node.kind === 'int') return Number(node.value) !== 0
    if (typeof node === 'string') {
      // _checkFromStringCoercion : chaîne vide -> null
      if (node === '') {
        if (primitive) throw coercedNullForPrimitive('boolean')
        return null
      }
      const t = javaTrim(node)
      if (t === 'true' || t === 'TRUE' || t === 'True') return true
      if (t === 'false' || t === 'FALSE' || t === 'False') return false
      if (t === 'null' && !primitive) return null
      throw weirdString(jt, t, primitive ? 'only "true"/"True"/"TRUE" or "false"/"False"/"FALSE" recognized' : 'only "true" or "false" recognized')
    }
    throw unexpectedToken(jt, node)
  }
  if (type === 'Int' || type === 'Long') {
    const [prim, wrapper] = PRIMITIVES[type] as [string, string]
    const jt = primitive ? prim : wrapper
    const [min, max] = type === 'Int' ? [-2147483648n, 2147483647n] : [-9223372036854775808n, 9223372036854775807n]
    if (node instanceof JsonNumber) {
      if (node.kind === 'int') {
        const b = BigInt(node.value)
        if (b < min || b > max) throw new InputCoercionException(`Numeric value (${String(node.value)}) out of range of ${prim} (${min} - ${max})`)
        return Number(node.value)
      }
      // ACCEPT_FLOAT_AS_INT
      const d = Number(node.value)
      if (d < Number(min) || d > Number(max)) throw new InputCoercionException(`Numeric value (${javaDoubleToString(d)}) out of range of ${prim} (${min} - ${max})`)
      return Math.trunc(d)
    }
    if (typeof node === 'string') {
      if (node === '') {
        if (primitive) throw coercedNullForPrimitive(prim)
        return null
      }
      const t = javaTrim(node)
      if (t === 'null' && !primitive) return null
      if (!/^[+-]?[0-9]+$/.test(t)) throw weirdString(jt, t, `not a valid \`${jt}\` value`)
      const b = BigInt(t)
      if (type === 'Int' && t.length > 9 && b >= -9223372036854775808n && b <= 9223372036854775807n && (b < min || b > max))
        throw weirdString(jt, t, `Overflow: numeric value (${t}) out of range of ${primitive ? prim : `\`${wrapper}\``} (${min} -${max})`)
      if (b < min || b > max) throw weirdString(jt, t, `not a valid \`${jt}\` value`)
      return Number(b)
    }
    throw unexpectedToken(jt, node)
  }
  if (type === 'Float' || type === 'Double' || type === 'Number') {
    const [prim, wrapper] = type === 'Number' ? ['double', 'java.lang.Number'] : (PRIMITIVES[type] as [string, string])
    const jt = primitive ? prim : wrapper
    let n: number
    if (node instanceof JsonNumber) n = Number(node.value)
    else if (typeof node === 'string') {
      if (node === '') {
        if (primitive) throw coercedNullForPrimitive(prim)
        return null
      }
      const t = javaTrim(node)
      if (t === 'null' && !primitive) return null
      if (/^[+-]?(NaN|Infinity)$/.test(t)) n = t.endsWith('NaN') ? Number.NaN : t.startsWith('-') ? -Infinity : Infinity
      else if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?$/.test(t)) n = Number(t.replace(/[fFdD]$/, ''))
      else throw weirdString(jt, t, `not a valid \`${primitive ? prim : type === 'Number' ? 'Number' : type}\` value`)
    } else throw unexpectedToken(jt, node)
    if (type === 'Number') return n
    return type === 'Float' ? Math.fround(n) : n
  }
  if ('scalar' in type) {
    const jt = SCALAR_CLASSES[type.scalar] ?? type.scalar
    const temporal = ['LocalDateTime', 'LocalDate', 'ZonedDateTime', 'Instant', 'Duration'].includes(type.scalar)
    if (typeof node === 'string') {
      const s = temporal ? javaTrim(node) : node
      if (s === '' && type.scalar !== 'ByteArray') return null
      try {
        return type.read(s)
      } catch (e) {
        if (temporal) throw weirdString(jt, s, `Failed to deserialize ${jt}: (java.time.format.DateTimeParseException) ${dateTimeParseMessage(e, s)}`, e)
        throw weirdString(jt, s, `not a valid textual representation, problem: ${(e as Error)?.message}`, e)
      }
    }
    if (type.scalar === 'LocalDate' || type.scalar === 'LocalDateTime') {
      if (type.scalar === 'LocalDate' && node instanceof JsonNumber && node.kind === 'int') return LocalDate.ofEpochDay(Number(node.value))
      if (Array.isArray(node)) {
        if (node.length === 0) return null
        const parts = node.map((x) => (x instanceof JsonNumber ? Number(x.value) : Number.NaN))
        if (type.scalar === 'LocalDate' && parts.length === 3 && parts.every(Number.isInteger)) return LocalDate.of(parts[0] as number, parts[1] as number, parts[2] as number)
      }
      throw new MismatchedInputException('Expected array or string')
    }
    if (type.scalar === 'ZonedDateTime' || type.scalar === 'Instant' || type.scalar === 'Duration') {
      if (node instanceof JsonNumber) {
        const d = Number(node.value)
        const seconds = Math.floor(d)
        const nanos = Math.round((d - seconds) * 1e9)
        if (type.scalar === 'Duration') return Duration.ofSeconds(seconds, nanos)
        const instant = Instant.ofEpochSecond(seconds, nanos)
        return type.scalar === 'Instant' ? instant : ZonedDateTime.ofInstant(instant, ZoneOffset.UTC)
      }
      throw new MismatchedInputException(`Unexpected token (${tokenName(node)}), expected one of [VALUE_STRING, VALUE_NUMBER_INT, VALUE_NUMBER_FLOAT] for ${jt} value`)
    }
    throw unexpectedToken(jt, node)
  }
  if ('list' in type || 'set' in type) {
    const el = 'list' in type ? type.list : type.set
    const raw = 'list' in type ? 'java.util.ArrayList' : 'java.util.HashSet'
    if (!Array.isArray(node)) {
      // ACCEPT_SINGLE_VALUE_AS_ARRAY est désactivé ; collection de chaînes : StringCollectionDeserializer
      if (typeof node === 'string' && unwrapNullable(el) === 'String') {
        if (node === '') throw emptyStringCoercion(`element of \`${raw}\``)
        throw missingInstantiator({ name: raw }, node)
      }
      throw unexpectedToken(javaTypeName(type, bindings), node)
    }
    const items = node.map((it) => fromTree(it, el, bindings, { prop: c.prop, direct: false, element: true }))
    checkDeferred(node)
    return 'set' in type ? javaHashSet(items) : items
  }
  if ('map' in type) {
    if (!(node instanceof Map)) throw unexpectedToken(javaTypeName(type, bindings), node)
    const out = new Map([...node].map(([k, x]) => [type.key ? fromTree(k, type.key, bindings) : k, fromTree(x, type.map, bindings, { prop: k, direct: false, element: false })]))
    checkDeferred(node)
    return out
  }
  if ('enum' in type) {
    const jt = className(type.enum)
    const entries = type.enum.entries()
    // FAIL_ON_NUMBERS_FOR_ENUMS désactivé : un entier est l'ordinal de la constante
    if (node instanceof JsonNumber && node.kind === 'int') {
      const index = Number(node.value)
      const byIndex = entries[index]
      if (byIndex === undefined)
        throw new InvalidFormatException(`Cannot deserialize value of type \`${jt}\` from number ${String(node.value)}: index value outside legal index range [0..${entries.length - 1}]`)
      return byIndex
    }
    if (typeof node !== 'string') throw unexpectedToken(jt, node)
    if (node === '') throw emptyStringCoercion(`\`${jt}\` value`)
    // accept-case-insensitive-values ne s'applique pas aux enums (il faudrait ACCEPT_CASE_INSENSITIVE_ENUMS) : casse exacte
    const names = entries.map((it) => (it as KEnum & { toJSON(): string }).toJSON())
    const find = (s: string) => entries[names.indexOf(s)]
    const e = find(node) ?? find(javaTrim(node))
    if (e !== undefined) return e
    // EnumDeserializer._deserializeAltString : chaîne numérique -> ordinal
    const t = javaTrim(node)
    if (/^[0-9]+$/.test(t) && Number(t) <= 2147483647 && entries[Number(t)] !== undefined) return entries[Number(t)]
    throw weirdString(jt, node, `not one of the values accepted for Enum class: [${compactStringObjectMapKeys(names).join(', ')}]`)
  }
  const clsType = type as { readonly class: object; readonly args?: readonly JsonType[] }
  const args = (clsType.args ?? []).map((it) => (typeof it === 'object' && 'typeVar' in it ? (bindings.get(it.typeVar) ?? it) : it))
  let target: object = clsType.class
  const baseName = javaTypeName({ class: target, args }, bindings)
  const forProp = c.prop !== null ? ` (for POJO property '${c.prop}')` : ''
  if (isSealed(target) || jsonMetaOf(target).typeInfo !== undefined || deduction.has(target)) {
    const subTypes = isSealed(target) ? target.subTypes() : []
    const ti = jsonMetaOf(target).typeInfo
    const typeIdOfSub = (it: object) => metaOf(it).typeName
    if (ti !== undefined) {
      // AsPropertyTypeDeserializer
      const knownIds = () => `known type ids = [${subTypes.map((it) => (typeIdOfSub(it) ?? '').toLowerCase()).sort().join(', ')}]`
      const resolve = (id: string): object => {
        const sub = subTypes.find((it) => typeIdOfSub(it)?.toLowerCase() === id.toLowerCase())
        if (sub === undefined) throw new InvalidTypeIdException(`Could not resolve type id '${id}' as a subtype of \`${baseName}\`: ${knownIds()}${forProp}`)
        return sub
      }
      if (Array.isArray(node)) {
        // AsArrayTypeDeserializer (repli) : identifiant de type en premier élément
        const first = node[0]
        if (first !== undefined && first !== null && !(first instanceof Map) && !Array.isArray(first)) {
          checkPoison(first)
          resolve(scalarText(first) as string)
        }
        throw new MismatchedInputException(`Unexpected token (null), expected VALUE_STRING: need String, Number of Boolean value that contains type id (for subtype of ${className(target)})`)
      }
      if (!(node instanceof Map)) throw new InvalidTypeIdException(`Could not resolve subtype of [simple type, class ${baseName}]: missing type id property '${ti.property}'${forProp}`)
      let found: object | null = null
      for (const [k, v] of node) {
        if (k.toLowerCase() === ti.property.toLowerCase()) {
          checkPoison(v)
          if (v !== null && !(v instanceof Map) && !Array.isArray(v)) {
            found = resolve(scalarText(v) as string)
            break
          }
        }
        scan(v)
      }
      if (found === null) {
        checkDeferred(node)
        throw new InvalidTypeIdException(`Could not resolve subtype of [simple type, class ${baseName}]: missing type id property '${ti.property}'${forProp}`)
      }
      target = found
    } else if (deduction.has(target)) {
      // AsDeductionTypeDeserializer : empreintes (noms de propriétés, en minuscules) des sous-types
      const fingerprints = subTypes.map((it) => new Set([...jsonNamesOf(typeof it === 'function' ? it : it.constructor).keys()].map((k) => k.toLowerCase())))
      const known = new Set(fingerprints.flatMap((f) => [...f]))
      if (Array.isArray(node)) {
        const token = !c.element && node.length === 0 ? 'END_ARRAY' : 'null'
        throw new MismatchedInputException(`Unexpected token (${token}), expected VALUE_STRING: need String, Number of Boolean value that contains type id (for subtype of ${className(target)})`)
      }
      if (!(node instanceof Map)) throw new InvalidTypeIdException(`Could not resolve subtype of [simple type, class ${baseName}]: Unexpected input`)
      let candidates = subTypes.map((_, k) => k)
      const empty = fingerprints.findIndex((f) => f.size === 0)
      let chosen: number | null = node.size === 0 && empty >= 0 && deferredError(node) === undefined ? empty : null
      if (chosen === null) {
        for (const [k, v] of node) {
          scan(v)
          const name = k.toLowerCase()
          if (!known.has(name)) continue
          candidates = candidates.filter((ix) => (fingerprints[ix] as Set<string>).has(name))
          if (candidates.length === 1) {
            chosen = candidates[0] as number
            break
          }
        }
      }
      if (chosen === null) {
        checkDeferred(node)
        throw new InvalidTypeIdException(`Could not resolve subtype of [simple type, class ${baseName}]: Cannot deduce unique subtype of \`${baseName}\` (${candidates.length} candidates match)`)
      }
      target = subTypes[chosen] as object
    }
  }
  // data object : l'instance unique
  if (typeof target !== 'function') {
    if (node instanceof Map) scan(node)
    return target
  }
  const pm = jsonPropertiesOf(target) ?? { typeParams: [], props: {}, required: [], getters: [] }
  const targetName = javaTypeName({ class: target, args: pm.typeParams.length > 0 ? args : [] }, bindings)
  if (!(node instanceof Map)) {
    if (Array.isArray(node)) throw unexpectedToken(targetName, node)
    if (node === '') throw emptyStringCoercion(`\`${targetName}\` value`)
    throw missingInstantiator(target, node)
  }
  const localBindings = new Map(pm.typeParams.map((p, i) => [p, (args[i] as JsonType | undefined) ?? ('Any' as JsonType)]))
  const names = jsonNamesOf(target)
  const meta = jsonMetaOf(target)
  const params: Record<string, unknown> = {}
  for (const [key, value] of node) {
    const prop = findKey(names, key)
    // FAIL_ON_UNKNOWN_PROPERTIES est désactivé par Spring Boot : valeur ignorée (mais lue)
    if (prop === undefined) {
      scan(value)
      continue
    }
    const pt = pm.props[prop] as JsonType
    params[prop] = fromTree(value, pt, localBindings, { prop: meta.rename?.[prop] ?? prop, direct: true, element: false })
  }
  checkDeferred(node)
  // KotlinValueInstantiator : paramètres du constructeur dans l'ordre, absent sans valeur par défaut ou null pour un
  // type non nul (sauf variable de type)
  for (const prop of Object.keys(pm.props)) {
    const pt = pm.props[prop] as JsonType
    const missing = !(prop in params) && pm.required.includes(prop)
    const nullForNonNull = prop in params && params[prop] === null && !(typeof pt === 'object' && ('nullable' in pt || 'typeVar' in pt)) && pt !== 'Any'
    if (missing || nullForNonNull)
      throw new MissingKotlinParameterException(
        `Instantiation of [simple type, class ${targetName}] value failed for JSON property ${meta.rename?.[prop] ?? prop} due to missing (therefore NULL) value for creator parameter ${prop} which is a non-nullable type`,
      )
  }
  const C = target as unknown as new (p: Record<string, unknown>) => unknown
  const instance = new C(params) as Record<string, unknown>
  // module Kotlin : un paramètre nullable absent et sans valeur par défaut vaut null (pas undefined)
  for (const prop of Object.keys(pm.props)) if (instance[prop] === undefined) instance[prop] = null
  return instance
}

function javaStringHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (31 * h + s.charCodeAt(i)) | 0
  return h
}

/**
 * `HashSet` Java rempli par Jackson (constructeur par défaut, ajouts successifs) : ordre d'itération par seau
 * (hash ^ hash >>> 16) & (capacité - 1), capacité 16 doublée au-delà de 0,75, ordre d'insertion dans un seau.
 * Déterministe pour les chaînes et les entiers ; les autres éléments (enums : hash d'identité) gardent l'ordre JSON.
 */
export function javaHashSet<T>(items: T[]): Set<T> {
  const unique: T[] = []
  for (const it of items) if (!unique.includes(it)) unique.push(it)
  if (!unique.every((it) => typeof it === 'string' || (typeof it === 'number' && Number.isInteger(it) && Math.abs(it) < 2 ** 31)))
    return new Set(unique)
  let cap = 16
  while (unique.length > cap * 0.75) cap *= 2
  const bucket = (it: T) => {
    const h = typeof it === 'string' ? javaStringHash(it) : (it as number) | 0
    return (h ^ (h >>> 16)) & (cap - 1)
  }
  return new Set(unique.map((it, i) => [bucket(it), i, it] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]))
}

function scalarText(n: JsonNode): string | null {
  if (typeof n === 'string') return n
  if (typeof n === 'boolean') return String(n)
  if (n instanceof JsonNumber) return writeTree(n)
  return null
}

/** Valeur JSON brute (type effacé / Any) : Map -> LinkedHashMap, nombres -> Int/Long/Double */
function plain(n: JsonNode): unknown {
  checkPoison(n)
  if (n instanceof JsonNumber) return typeof n.value === 'bigint' ? n.value : Number(n.value)
  if (n instanceof Map) {
    const out = new Map([...n].map(([k, x]) => [k, plain(x)]))
    checkDeferred(n)
    return out
  }
  if (Array.isArray(n)) {
    const out = n.map(plain)
    checkDeferred(n)
    return out
  }
  return n
}

// ---------------------------------------------------------------------------
// ObjectMapper
// ---------------------------------------------------------------------------

/** Type cible de `readValue` (équivalent de `Class<T>` / `TypeReference<T>`) */
export type JavaType = JsonType

/**
 * Lecture pour la désérialisation : les erreurs de syntaxe restent dans l'arbre (JsonPoison) et sont levées quand
 * `fromTree` atteint le jeton fautif, comme la lecture en flux de Jackson (une erreur de type rencontrée plus tôt l'emporte).
 * PORT: un nom de propriété répété n'est vu qu'une fois (Map), à la place de sa première occurrence, avec la dernière valeur.
 */
function parse(src: string | Uint8Array): JsonNode {
  const text = typeof src === 'string' ? src : Buffer.from(src).toString('utf8')
  // FAIL_ON_TRAILING_TOKENS désactivé : le contenu qui suit la valeur racine n'est pas lu
  return readTree(text, { allowTrailing: true, lenient: true })
}

/** Arbre complet (`readTree`) : première erreur de syntaxe */
function parseStrict(src: string | Uint8Array): JsonNode {
  const tree = parse(src)
  scan(tree)
  return tree
}

export class ObjectMapper {
  writeValueAsString(value: unknown, type?: JavaType): string {
    return writeTree(toTree(value, type))
  }

  writeValueAsBytes(value: unknown, type?: JavaType): Uint8Array {
    // UTF8JsonGenerator (sortie en octets) : les paires de substitution sont échappées (😀),
    // JsonWriteFeature.COMBINE_UNICODE_SURROGATES_IN_UTF8 étant désactivé par défaut (relevé sur Komga)
    const json = this.writeValueAsString(value, type).replace(
      /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
      (m) => `\\u${m.charCodeAt(0).toString(16).toUpperCase()}\\u${m.charCodeAt(1).toString(16).toUpperCase()}`,
    )
    return Buffer.from(json, 'utf8')
  }

  writerWithDefaultPrettyPrinter(): { writeValueAsString(v: unknown, type?: JavaType): string } {
    return { writeValueAsString: (v: unknown, type?: JavaType) => writePretty(toTree(v, type), '') }
  }

  /** `readValue<T>(json)` : le type Kotlin réifié est passé explicitement */
  readValue<T>(src: string | Uint8Array, type: JavaType): T {
    return fromTree(parse(src), type) as T
  }

  readTree(src: string | Uint8Array): JsonNode {
    return parseStrict(src)
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
