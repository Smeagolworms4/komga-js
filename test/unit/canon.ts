// Support des tests unitaires à oracle (sans jumeau Kotlin) : forme canonique d'une valeur,
// miroir exact de `Canon` dans komga/src/test/kotlin/org/gotson/komga/oracle/Oracle.kt (branche unit-oracles du fork Komga).
//
// - null : null ; undefined (retour d'une fonction Kotlin `Unit`) : {"@unit": true}
// - string, boolean : tels quels ; number : nombre JSON (un Float Kotlin est déjà un float32 élargi, voir kFloat) ;
//   NaN / ±Infinity : "NaN", "Infinity", "-Infinity" ; bigint (Long) : nombre, ou {"@long": "chiffres"} au-delà de ±2^53
// - KEnum : {"@enum": name}
// - js-joda (Temporal, TemporalAmount) : {"@time": toString()} ; Date : {"@time": Instant.toString()}
// - URL, URI (port/java-net) : {"@str": toString()} ; un Path est déjà une chaîne
// - Uint8Array : {"@bytes": base64}
// - tableau (List, Array, Pair, Triple) : tableau ; Set : {"@set": [...]} ; Map : {"@map": [[k, v], ...]}, ordre d'itération
// - DataObject : {"@object": nom de classe} ; PageImpl : {"@page": {content, totalElements, number, size}}
// - autre objet : {"@class": nom de classe, <propriétés propres dans l'ordre de déclaration>}
// - exception : {"@throws": nom de classe, "message": message} (message vide -> null, comme côté Kotlin)
import { Temporal, TemporalAmount, Instant, ZonedDateTime } from '@js-joda/core'
import { DataObject, KEnum } from '../../src/port/kotlin.js'
import { URI, URL } from '../../src/port/java-net.js'
import { PageImpl } from '../../src/port/spring-data.js'

export type Canon = null | string | number | boolean | Canon[] | { [k: string]: Canon }

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

/** Fuseau du processus, écrit par Java dans `ZonedDateTime.toString()` à la place de l'id `SYSTEM` de js-joda */
function systemZoneId(): string {
  return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone
}

function number(v: number): Canon {
  if (Number.isNaN(v)) return 'NaN'
  if (v === Infinity) return 'Infinity'
  if (v === -Infinity) return '-Infinity'
  return v
}

export function canonThrowable(e: unknown): Canon {
  // e.name : nom de la classe d'exception (port/kotlin.ts), ou type d'erreur js-joda (UnsupportedTemporalTypeException...)
  if (e instanceof Error) return { '@throws': e.name, message: e.message === '' ? null : e.message }
  return { '@throws': typeof e, message: String(e) }
}

export function canon(v: unknown): Canon {
  if (v === null) return null
  if (v === undefined) return { '@unit': true }
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return v
    case 'number':
      return number(v)
    case 'bigint':
      return v > MAX_SAFE || v < -MAX_SAFE ? { '@long': v.toString() } : Number(v)
    case 'function':
      return { '@function': v.name }
    case 'symbol':
      return String(v)
  }
  if (v instanceof KEnum) return { '@enum': v.name }
  if (v instanceof ZonedDateTime) {
    // PORT: ZoneId.systemDefault() de js-joda s'appelle SYSTEM, Java écrit l'id du fuseau
    return { '@time': v.toString().replace(/\[SYSTEM\]$/, `[${systemZoneId()}]`) }
  }
  if (v instanceof Temporal || v instanceof TemporalAmount) return { '@time': v.toString() }
  if (v instanceof Date) return { '@time': Instant.ofEpochMilli(v.getTime()).toString() }
  if (v instanceof URL || v instanceof URI || v instanceof globalThis.URL) return { '@str': v.toString() }
  if (v instanceof Uint8Array) return { '@bytes': Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64') }
  if (Array.isArray(v)) return v.map(canon)
  if (v instanceof Set) return { '@set': [...v].map(canon) }
  if (v instanceof Map) return { '@map': [...v].map(([k, x]) => [canon(k), canon(x)]) }
  if (v instanceof PageImpl) {
    return { '@page': { content: v.content.map(canon), totalElements: v.totalElements, number: v.number, size: v.size } }
  }
  if (v instanceof Error) return canonThrowable(v)
  if (v instanceof DataObject) return { '@object': v.constructor.name }
  if (typeof (v as Iterable<unknown>)[Symbol.iterator] === 'function') return [...(v as Iterable<unknown>)].map(canon)
  const out: { [k: string]: Canon } = { '@class': v.constructor?.name ?? '' }
  for (const [k, x] of Object.entries(v)) out[k] = canon(x)
  return out
}
