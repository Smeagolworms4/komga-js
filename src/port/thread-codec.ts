// Support de portage : passage de valeurs entre le thread principal et le worker des tâches (worker_threads).
// Sur la JVM, les threads de Komga partagent le tas : un événement ou un argument passe d'un thread à l'autre par
// référence. Entre deux isolats V8, seules des copies (clonage structuré) passent, sans prototype ni identité. Ce codec
// encode les objets du modèle (data class, enum, data object, dates js-joda, URL, collections) de façon à les
// reconstruire à l'identique de l'autre côté :
// - les valeurs exportées par les modules (classes, singletons `data object`, constantes d'enum) sont transmises par
//   leur chemin (`module#Export.Membre`) et retrouvées à l'identique (même instance) ;
// - les instances d'une classe exportée sont recréées sur le prototype de la même classe, champs propres recopiés ;
// - les autres objets (services, compteurs de métriques…) ne sont pas copiables : une réponse d'appel distant les
//   remplace par une poignée (`handles`), les autres usages lèvent une erreur.
// Les deux threads importent les mêmes modules (scan des composants) : le registre est construit à la demande en
// parcourant leurs exports. Ce fichier n'a pas de jumeau Kotlin.
import * as jsJoda from '@js-joda/core'
import { DataClass, DataObject, KEnum } from './kotlin.js'

/** Modules parcourus pour le registre : chemin relatif à src/ -> espace de noms du module */
const modules = new Map<string, Record<string, unknown>>()
let pathOf: Map<unknown, string> | null = null
let valueOf: Map<string, unknown> | null = null

/** Enregistre un module importé par le scan des composants (voir `scanComponents`) */
export function registerModule(path: string, namespace: Record<string, unknown>): void {
  modules.set(path, namespace)
  pathOf = null
  valueOf = null
}

registerModule('@js-joda/core', jsJoda as unknown as Record<string, unknown>)
registerModule('port/kotlin', { DataClass, DataObject, KEnum })

function buildRegistry(): void {
  const p = new Map<unknown, string>()
  const v = new Map<string, unknown>()
  const visit = (value: unknown, path: string, depth: number) => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return
    if (p.has(value)) return
    p.set(value, path)
    v.set(path, value)
    if (typeof value === 'object') {
      // singleton `data object` ou constante d'enum : sa classe (anonyme) est désignée par l'instance
      const ctor = (value as object).constructor
      if (typeof ctor === 'function' && ctor !== Object && !p.has(ctor)) {
        p.set(ctor, `${path}#constructor`)
        v.set(`${path}#constructor`, ctor)
      }
    }
    if (depth >= 3) return
    // membres statiques (espaces de noms fusionnés avec une classe, constantes d'enum) ou objets espaces de noms
    if (typeof value === 'function' || Object.getPrototypeOf(value) === Object.prototype)
      for (const k of Object.keys(value)) {
        let member: unknown
        try {
          member = (value as Record<string, unknown>)[k]
        } catch {
          continue
        }
        visit(member, `${path}.${k}`, depth + 1)
      }
  }
  for (const [m, ns] of modules) for (const [k, value] of Object.entries(ns)) visit(value, `${m}#${k}`, 0)
  pathOf = p
  valueOf = v
}

function registryPath(value: unknown): string | undefined {
  if (pathOf === null) buildRegistry()
  return (pathOf as Map<unknown, string>).get(value)
}

function registryValue(path: string): unknown {
  if (valueOf === null) buildRegistry()
  const v = (valueOf as Map<string, unknown>).get(path)
  if (v === undefined) throw new Error(`thread-codec: valeur inconnue dans ce thread : ${path}`)
  return v
}

/** Chemin d'une valeur exportée (classe, singleton), ou null */
export function exportedPath(value: unknown): string | null {
  return registryPath(value) ?? null
}

/** Valeur exportée désignée par son chemin */
export function exportedValue(path: string): unknown {
  return registryValue(path)
}

/** Table des objets passés par poignée (côté qui les possède) */
export class Handles {
  private next = 1
  private readonly byId = new Map<number, object>()
  private readonly ids = new Map<object, number>()

  add(o: object): number {
    let id = this.ids.get(o)
    if (id === undefined) {
      id = this.next++
      this.ids.set(o, id)
      this.byId.set(id, o)
    }
    return id
  }

  get(id: number): object {
    const o = this.byId.get(id)
    if (o === undefined) throw new Error(`thread-codec: poignée inconnue ${id}`)
    return o
  }
}

type Encoded = unknown

function isJsJodaValue(o: object): boolean {
  const ctor = o.constructor
  return typeof ctor === 'function' && (registryPath(ctor) ?? '').startsWith('@js-joda/core#')
}

/**
 * Encode une valeur. `handles` : table des poignées pour les objets non copiables (réponse d'un appel distant) ;
 * sans table, un tel objet lève une erreur.
 */
export function encode(value: unknown, handles: Handles | null = null): Encoded {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') return value
  if (t === 'symbol') throw new Error('thread-codec: symbole non transmissible')
  const ref = registryPath(value)
  if (ref !== undefined) return { $r: ref }
  if (t === 'function') throw new Error(`thread-codec: fonction non exportée non transmissible (${(value as () => void).name})`)
  const o = value as object
  if (ArrayBuffer.isView(o) || o instanceof ArrayBuffer || o instanceof Date || o instanceof RegExp) return o
  if (Array.isArray(o)) return o.map((it) => encode(it, handles))
  if (o instanceof Map) return { $m: [...o].map(([k, v]) => [encode(k, handles), encode(v, handles)]) }
  if (o instanceof Set) return { $s: [...o].map((it) => encode(it, handles)) }
  if (o instanceof globalThis.URL) return { $u: o.href }
  if (o instanceof Error) return { $e: { name: o.name, message: o.message, stack: o.stack, ctor: registryPath(o.constructor) ?? null } }
  const proto = Object.getPrototypeOf(o) as object | null
  if (proto === null || proto === Object.prototype) return { $o: encodeFields(o, handles) }
  const ctorPath = registryPath(o.constructor)
  const byValue = handles === null || o instanceof DataClass || o instanceof DataObject || o instanceof KEnum || isJsJodaValue(o)
  if (ctorPath !== undefined && byValue) return { $c: ctorPath, f: encodeFields(o, handles) }
  if (handles !== null) return { $h: handles.add(o) }
  throw new Error(`thread-codec: objet non transmissible (${o.constructor?.name ?? 'sans classe'})`)
}

function encodeFields(o: object, handles: Handles | null): Record<string, Encoded> {
  const f: Record<string, Encoded> = {}
  for (const k of Object.keys(o)) f[k] = encode((o as Record<string, unknown>)[k], handles)
  return f
}

/** Décode une valeur ; `remote(id)` fabrique le mandataire d'une poignée de l'autre thread */
export function decode(value: Encoded, remote: ((id: number) => unknown) | null = null): unknown {
  if (value === null || typeof value !== 'object') return value
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Date || value instanceof RegExp) return value
  if (Array.isArray(value)) return value.map((it) => decode(it, remote))
  const e = value as Record<string, unknown>
  if ('$r' in e) return registryValue(e.$r as string)
  if ('$m' in e) return new Map((e.$m as [Encoded, Encoded][]).map(([k, v]) => [decode(k, remote), decode(v, remote)]))
  if ('$s' in e) return new Set((e.$s as Encoded[]).map((it) => decode(it, remote)))
  if ('$u' in e) return new globalThis.URL(e.$u as string)
  if ('$o' in e) return decodeFields(Object.create(Object.prototype) as object, e.$o as Record<string, Encoded>, remote)
  if ('$c' in e) {
    const ctor = registryValue(e.$c as string) as { prototype: object }
    return decodeFields(Object.create(ctor.prototype) as object, e.f as Record<string, Encoded>, remote)
  }
  if ('$e' in e) {
    const d = e.$e as { name: string; message: string; stack?: string; ctor: string | null }
    let err: Error
    try {
      const C = d.ctor !== null ? (registryValue(d.ctor) as new (m: string) => Error) : Error
      err = new C(d.message)
    } catch {
      err = new Error(d.message)
    }
    if (d.stack !== undefined) err.stack = d.stack
    return err
  }
  if ('$h' in e) {
    if (remote === null) throw new Error('thread-codec: poignée reçue sans fabrique de mandataire')
    return remote(e.$h as number)
  }
  throw new Error(`thread-codec: valeur encodée inconnue : ${JSON.stringify(Object.keys(e))}`)
}

function decodeFields(target: object, fields: Record<string, Encoded>, remote: ((id: number) => unknown) | null): object {
  for (const [k, v] of Object.entries(fields)) Object.defineProperty(target, k, { value: decode(v, remote), writable: true, enumerable: true, configurable: true })
  return target
}
