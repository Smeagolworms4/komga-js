// Support de portage : sérialisation d'objets (java.io.Serializable, ObjectOutputStream / ObjectInputStream) telle
// qu'utilisée par Spring Session JDBC pour les attributs de session (SerializingConverter / DeserializingConverter).
// Ce fichier n'a pas de jumeau Kotlin.
//
// PORT: le flux binaire de Java n'est pas reproduit (aucune base n'est partagée avec Komga) : les attributs sont écrits
// en JSON (UTF-8) qui décrit le graphe d'objets :
// - classes : nom de la classe (`serializable()` : nom Java des classes Serializable de Komga ; classes du port de Spring
//   Security : nom de la classe TS), champs propres de l'instance sauf les fonctions et les champs `@Transient` (relus à
//   null). Comme ObjectInputStream, la relecture ne passe pas par le constructeur ;
// - enums (KEnum) : relus sur l'instance canonique (comme Enum.valueOf) ;
// - dates js-joda, Date, Map, Set, Uint8Array, références partagées et cycles.
// Écart : une classe sans `serializable()` est écrite sous son nom TS et n'est relisible que dans le même processus ;
// après un redémarrage elle est inconnue et la relecture lève SerializationFailedException, comme une classe absente du
// classpath (ClassNotFoundException) en Java.
import { Duration, Instant, LocalDate, LocalDateTime, LocalTime, ZonedDateTime } from '@js-joda/core'
import { KEnum, RuntimeException } from './kotlin.js'
import { KotlinLogging } from './logging.js'

const logger = KotlinLogging.logger('org.springframework.core.serializer.DefaultSerializer')

/** `org.springframework.core.serializer.support.SerializationFailedException` */
export class SerializationFailedException extends RuntimeException {}

type AnyClass = abstract new (...args: never[]) => unknown

type ClassInfo = { name: string; cls: AnyClass; transient: ReadonlySet<string> }

const byName = new Map<string, ClassInfo>()
const byClass = new Map<AnyClass, ClassInfo>()

/**
 * `: Serializable` d'une classe Kotlin : nom écrit dans le flux, champs `@Transient` (non écrits, relus à null).
 */
export function serializable(cls: { readonly prototype: unknown; readonly name: string }, name: string = cls.name, { transient = [] }: { transient?: string[] } = {}): void {
  const info: ClassInfo = { name, cls: cls as AnyClass, transient: new Set(transient) }
  byName.set(name, info)
  byClass.set(cls as AnyClass, info)
}

/** Enregistre les classes exportées d'un module du port (classes des bibliothèques Java, toutes Serializable ici) */
export function serializableModule(prefix: string, module: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(module))
    if (typeof v === 'function' && v.prototype !== undefined && !byClass.has(v as AnyClass)) serializable(v as AnyClass, `${prefix}.${k}`)
}

function infoOf(obj: object): ClassInfo | null {
  const c = (obj as { constructor: AnyClass }).constructor
  const info = byClass.get(c)
  if (info !== undefined) return info
  // classe non enregistrée : écrite sous son nom TS, relisible dans ce processus (voir l'écart en tête de fichier)
  if (c.name === '' || byName.has(c.name)) return null
  logger.warn(() => `Class ${c.name} is not registered as serializable: it cannot be read back after a restart`)
  const fallback: ClassInfo = { name: c.name, cls: c, transient: new Set() }
  byName.set(c.name, fallback)
  byClass.set(c, fallback)
  return fallback
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

/** `SerializingConverter.convert` */
export function serialize(value: unknown): Uint8Array {
  const ids = new Map<object, number>()
  const write = (v: unknown): Json => {
    if (v === null || v === undefined) return null
    if (typeof v === 'boolean' || typeof v === 'string') return v
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) }
    if (typeof v === 'bigint') return { $big: v.toString() }
    if (typeof v === 'function' || typeof v === 'symbol') return null
    const o = v as object
    const seen = ids.get(o)
    if (seen !== undefined) return { $ref: seen }
    const id = ids.size
    ids.set(o, id)
    if (o instanceof KEnum) return { $id: id, $enum: classNameOf(o), name: o.name }
    if (o instanceof LocalDateTime) return { $id: id, $t: 'LocalDateTime', v: o.toString() }
    if (o instanceof LocalDate) return { $id: id, $t: 'LocalDate', v: o.toString() }
    if (o instanceof LocalTime) return { $id: id, $t: 'LocalTime', v: o.toString() }
    if (o instanceof ZonedDateTime) return { $id: id, $t: 'ZonedDateTime', v: o.toString() }
    if (o instanceof Instant) return { $id: id, $t: 'Instant', v: o.toString() }
    if (o instanceof Duration) return { $id: id, $t: 'Duration', v: o.toString() }
    if (o instanceof Date) return { $id: id, $t: 'Date', v: o.getTime() }
    if (o instanceof Uint8Array) return { $id: id, $t: 'bytes', v: Buffer.from(o).toString('base64') }
    if (Array.isArray(o)) return { $id: id, $a: o.map(write) }
    if (o instanceof Set) return { $id: id, $set: [...o].map(write) }
    if (o instanceof Map) return { $id: id, $map: [...o].map(([k, val]) => [write(k), write(val)]) }
    const proto = Object.getPrototypeOf(o) as object | null
    const fields: Record<string, Json> = {}
    if (proto === null || proto === Object.prototype) {
      for (const k of Object.keys(o)) fields[k] = write((o as Record<string, unknown>)[k])
      return { $id: id, $o: fields }
    }
    const info = infoOf(o)
    if (info === null) throw new SerializationFailedException(`Failed to serialize object using DefaultSerializer: ${proto.constructor.name}`)
    for (const k of Object.getOwnPropertyNames(o)) {
      if (info.transient.has(k)) continue
      const fv = (o as Record<string, unknown>)[k]
      if (typeof fv === 'function') continue
      fields[k] = write(fv)
    }
    return { $id: id, $c: info.name, f: fields }
  }
  return Buffer.from(JSON.stringify(write(value)), 'utf8')
}

function classNameOf(o: object): string {
  const info = infoOf(o)
  if (info === null) throw new SerializationFailedException(`Failed to serialize enum: ${o.constructor.name}`)
  return info.name
}

/** `DeserializingConverter.convert` */
export function deserialize(bytes: Uint8Array): unknown {
  let root: Json
  try {
    root = JSON.parse(Buffer.from(bytes).toString('utf8')) as Json
  } catch (e) {
    throw new SerializationFailedException('Failed to deserialize payload. Is the byte array a result of corresponding serialization for DefaultDeserializer?', e)
  }
  const refs = new Map<number, unknown>()
  const read = (j: Json): unknown => {
    if (j === null || typeof j !== 'object') return j
    if (Array.isArray(j)) return j.map(read)
    if ('$ref' in j) return refs.get(j.$ref as number) ?? null
    if ('$n' in j) return Number(j.$n)
    if ('$big' in j) return BigInt(j.$big as string)
    const id = j.$id as number
    const keep = <T>(v: T): T => {
      refs.set(id, v)
      return v
    }
    if ('$enum' in j) {
      const info = byName.get(j.$enum as string)
      if (info === undefined) throw new SerializationFailedException(`Failed to deserialize payload: unknown class ${String(j.$enum)}`)
      const entry = (info.cls as unknown as typeof KEnum & { entries(): KEnum[] }).entries().find((it) => it.name === j.name)
      if (entry === undefined) throw new SerializationFailedException(`Failed to deserialize payload: no enum constant ${String(j.$enum)}.${String(j.name)}`)
      return keep(entry)
    }
    if ('$t' in j) {
      const v = j.v as string
      switch (j.$t) {
        case 'LocalDateTime':
          return keep(LocalDateTime.parse(v))
        case 'LocalDate':
          return keep(LocalDate.parse(v))
        case 'LocalTime':
          return keep(LocalTime.parse(v))
        case 'ZonedDateTime':
          return keep(ZonedDateTime.parse(v))
        case 'Instant':
          return keep(Instant.parse(v))
        case 'Duration':
          return keep(Duration.parse(v))
        case 'Date':
          return keep(new Date(j.v as number))
        case 'bytes':
          return keep(new Uint8Array(Buffer.from(v, 'base64')))
      }
      throw new SerializationFailedException(`Failed to deserialize payload: unknown type ${String(j.$t)}`)
    }
    if ('$a' in j) {
      const a: unknown[] = keep([])
      for (const it of j.$a as Json[]) a.push(read(it))
      return a
    }
    if ('$set' in j) {
      const s = keep(new Set<unknown>())
      for (const it of j.$set as Json[]) s.add(read(it))
      return s
    }
    if ('$map' in j) {
      const m = keep(new Map<unknown, unknown>())
      for (const [k, v] of j.$map as [Json, Json][]) m.set(read(k), read(v))
      return m
    }
    if ('$o' in j) {
      const o: Record<string, unknown> = keep({})
      for (const [k, v] of Object.entries(j.$o as Record<string, Json>)) o[k] = read(v)
      return o
    }
    const info = byName.get(j.$c as string)
    if (info === undefined) throw new SerializationFailedException(`Failed to deserialize payload: unknown class ${String(j.$c)}`)
    // comme ObjectInputStream : instance créée sans appel du constructeur, champs relus, champs transient à null
    const o = keep(Object.create(info.cls.prototype as object) as Record<string, unknown>)
    for (const [k, v] of Object.entries(j.f as Record<string, Json>)) defineField(o, k, read(v))
    for (const k of info.transient) defineField(o, k, null)
    return o
  }
  return read(root)
}

function defineField(o: Record<string, unknown>, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: k !== 'message' && k !== 'stack' && k !== 'cause', configurable: true })
}
