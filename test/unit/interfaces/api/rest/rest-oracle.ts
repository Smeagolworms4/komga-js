// Aides des tests à oracle de `interfaces/api/rest` (contrôleurs et DTO), miroir de
// komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/RestOracle.kt (branche unit-oracles du fork Komga).
import { LocalDateTime } from '@js-joda/core'
import { Writable } from 'node:stream'
import { ContentRestrictions } from '../../../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import type { UserRoles } from '../../../../../src/domain/model/UserRoles.js'
import { TaskEmitter } from '../../../../../src/application/tasks/TaskEmitter.js'
import type { BookConverter } from '../../../../../src/domain/service/BookConverter.js'
import { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { type JavaType, ObjectMapper } from '../../../../../src/port/jackson-mapper.js'
import { ApplicationEventPublisher } from '../../../../../src/port/spring.js'
import { ResponseEntity, Resource, STREAMING, type StreamingResponseBody } from '../../../../../src/port/spring-web.js'
import { Canonical, canon, canonThrowable, stableCanon } from '../../../canon.js'
import { exec, type OracleDb } from '../../../db.js'

/** ObjectMapper de Spring Boot (même configuration que OracleDb.mapper, sans base) */
export const mapper = new ObjectMapper()

/** Corps JSON produit par Spring MVC pour `v` */
export function json(v: unknown, type?: JavaType): string {
  return mapper.writeValueAsString(v, type)
}

export function read<T>(src: string, type: JavaType): T {
  return mapper.readValue<T>(src, type)
}

/** PNG RVB 3x2 (mêmes octets côté Kotlin) */
export const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAG0lEQVR42gXBAQEAAACCIOc0x0lOD4BGEthMOyg0BOFvkyVYAAAAAElFTkSuQmCC', 'base64'))

export const FIXED = LocalDateTime.of(2020, 1, 2, 3, 4, 5)

export function user(
  id: string,
  {
    roles = new Set(),
    sharedLibrariesIds = new Set(),
    sharedAllLibraries = true,
    restrictions = new ContentRestrictions(),
  }: { roles?: ReadonlySet<UserRoles>; sharedLibrariesIds?: ReadonlySet<string>; sharedAllLibraries?: boolean; restrictions?: ContentRestrictions } = {},
): KomgaUser {
  return new KomgaUser({
    email: `${id}@example.org`,
    password: `pwd-${id}`,
    roles,
    sharedLibrariesIds,
    sharedAllLibraries,
    restrictions,
    id,
    createdDate: FIXED,
  })
}

export function principal(u: KomgaUser): KomgaPrincipal {
  return new KomgaPrincipal(u)
}

async function streamToBytes(body: StreamingResponseBody): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  const out = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(Buffer.from(chunk))
      cb()
    },
  })
  await body(out)
  await new Promise<void>((resolve) => {
    if (out.writableEnded) resolve()
    else out.end(() => resolve())
  })
  return new Uint8Array(Buffer.concat(chunks))
}

async function resourceToBytes(r: Resource): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  for await (const c of r.getInputStream()) chunks.push(Buffer.from(c as Buffer))
  return new Uint8Array(Buffer.concat(chunks))
}

/**
 * Forme canonique d'une ResponseEntity : [code, en-têtes (noms en minuscules, triés), corps].
 * Un corps Resource ou StreamingResponseBody est lu en octets.
 */
export async function entity(e: ResponseEntity): Promise<Canonical> {
  const headers = [...e.headers.entries.keys()].sort().map((name) => [name, e.headers.entries.get(name)])
  let body: unknown = e.body
  if (body instanceof Resource) body = await resourceToBytes(body)
  else if (typeof body === 'function' && STREAMING in body) body = await streamToBytes(body as unknown as StreamingResponseBody)
  return new Canonical([e.statusCode, canon(headers), canon(body)])
}

/** Forme canonique de l'exception levée par `block` (type et message), null sinon */
export async function thrown(block: () => unknown): Promise<Canonical> {
  try {
    await block()
    return new Canonical(null)
  } catch (e) {
    return new Canonical(canonThrowable(e))
  }
}

/** Le corps de `e` en octets (Resource ou StreamingResponseBody lus) */
export async function bodyBytes(e: ResponseEntity): Promise<Uint8Array> {
  const body: unknown = e.body
  if (body instanceof Resource) return resourceToBytes(body)
  if (typeof body === 'function' && STREAMING in body) return streamToBytes(body as unknown as StreamingResponseBody)
  if (body instanceof Uint8Array) return body
  throw new Error('not bytes')
}

/** Un fichier zip (octets) sous la forme [taille, noms des entrées du répertoire central] (même aide côté Kotlin) */
export function zipSummary(bytes: Uint8Array): unknown[] {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const names: string[] = []
  let i = 0
  while (i + 46 <= b.length) {
    if (b.readUInt32LE(i) === 0x02014b50) {
      const n = b.readUInt16LE(i + 28)
      names.push(b.toString('utf8', i + 46, i + 46 + n))
      i += 46 + n
    } else {
      i++
    }
  }
  return [b.length, names]
}

/** Exécute des instructions SQL brutes sur la base principale de `db` (données aux dates fixes) */
export function sql(db: OracleDb, ...statements: string[]): void {
  exec(db.dataSource.getConnection(), ...statements)
}

const datedTables = [
  'LIBRARY',
  'SERIES',
  'SERIES_METADATA',
  'BOOK',
  'BOOK_METADATA',
  'BOOK_METADATA_AGGREGATION',
  'MEDIA',
  'READ_PROGRESS',
  'COLLECTION',
  'READLIST',
  'USER',
  'THUMBNAIL_BOOK',
  'THUMBNAIL_SERIES',
  'THUMBNAIL_COLLECTION',
  'THUMBNAIL_READLIST',
  'PAGE_HASH',
  'USER_API_KEY',
]

/** Remplace les dates « maintenant » posées par la base (valeurs par défaut des colonnes) par une date fixe (même aide côté Kotlin) */
export function fixNow(db: OracleDb): void {
  const statements = datedTables.flatMap((t) => ['CREATED_DATE', 'LAST_MODIFIED_DATE'].map((c) => `update ${t} set ${c} = '2020-01-01 08:00:00' where ${c} >= '2025'`))
  statements.push("update READ_PROGRESS_SERIES set LAST_MODIFIED_DATE = '2020-01-01 08:00:00' where LAST_MODIFIED_DATE >= '2025'")
  sql(db, ...statements)
}

/** Enregistre les appels faits sur un faux collaborateur : [nom, arguments...] (même enregistreur côté Kotlin) */
export class Calls {
  readonly log: unknown[][] = []

  add(name: string, ...args: unknown[]): void {
    this.log.push([name, ...args])
  }

  /** Forme canonique des appels enregistrés depuis le dernier take, puis les efface */
  take(): Canonical {
    const c = new Canonical(stableCanon(canon([...this.log])))
    this.log.length = 0
    return c
  }
}

/**
 * Remplace `fetch` : chaque requête est enregistrée dans `calls` et reçoit la réponse de `respond` (statut, corps JSON),
 * comme le faux WebClient.Builder côté Kotlin (`fakeWebClient`). Le texte du statut est vide (HTTP/2).
 * Renvoie la fonction qui rétablit le `fetch` d'origine.
 */
export function fakeFetch(calls: Calls, respond: () => [number, string]): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.add('GET', typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString())
    const [status, body] = respond()
    return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

/** ApplicationEventPublisher qui enregistre les événements publiés dans `calls` (lambda côté Kotlin) */
export function publisher(calls: Calls): ApplicationEventPublisher {
  return new (class extends ApplicationEventPublisher {
    publishEvent(event: unknown): void {
      calls.add('publishEvent', event)
    }
  })()
}

/** Le vrai TaskEmitter sur la base des tâches de `db` ; les événements publiés sont enregistrés dans `calls` */
export function taskEmitter(db: OracleDb, calls: Calls): TaskEmitter {
  return new TaskEmitter(db.bookDao, null as unknown as BookConverter, db.tasksDao, publisher(calls))
}

/**
 * Les capacités de RefreshBookMetadata sont relues de la base des tâches par Kotlin dans un HashSet d'énumérations, dont
 * l'ordre dépend des codes de hachage d'identité : elles sont triées par nom (même aide côté Kotlin)
 */
function sortCapabilities(s: string): string {
  return s.replace(/capabilities=\[([^\]]*)]/g, (_m, g: string) => `capabilities=[${g.split(', ').filter((it) => it.length > 0).sort().join(', ')}]`)
}

/** Les tâches soumises depuis le dernier appel ([toString, priorité, groupId]), puis vide la file */
export function tasks(db: OracleDb): unknown[][] {
  const out = db.tasksDao.findAll().map((it) => [sortCapabilities(it.toString()), it.priority, it.groupId])
  db.tasksDao.deleteAll()
  return out
}
