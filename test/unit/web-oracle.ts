// Support des tests unitaires à oracle de la couche web (interfaces, infrastructure/web, infrastructure/security) :
// miroir exact de `WebOracle` (komga/src/test/kotlin/org/gotson/komga/oracle/WebOracle.kt, branche unit-oracles).
// Requêtes et réponses sans conteneur de servlets, décrites de façon neutre.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { LocalDate } from '@js-joda/core'
import { ObjectMapper } from '../../src/port/jackson-mapper.js'
import { HttpServletRequest, HttpServletResponse } from '../../src/port/servlet.js'
import type { Authentication } from '../../src/port/spring-security.js'
import type { ResponseEntity } from '../../src/port/spring-web.js'
import { RequestContextFilter } from '../../src/port/spring-web-dispatcher.js'

let mapperInstance: ObjectMapper | null = null
/** ObjectMapper de Spring Boot (le même que `OracleDb.mapper`), sans base */
export function mapper(): ObjectMapper {
  mapperInstance ??= new ObjectMapper()
  return mapperInstance
}

export type RequestOptions = {
  method?: string
  uri?: string
  query?: string | null
  headers?: [string, string][]
  scheme?: string
  host?: string
  port?: number
  remoteAddr?: string
  contextPath?: string
}

/**
 * Requête telle que Tomcat la construit : `uri` est l'URI brute (encodée) sans chaîne de requête, `query` la chaîne de
 * requête brute, découpée en paramètres ; l'en-tête Host vient de `host` et `port`. `uri` inclut `contextPath`.
 */
export function request({
  method = 'GET',
  uri = '/',
  query = null,
  headers = [],
  scheme = 'http',
  host = 'localhost',
  port = 80,
  remoteAddr = '127.0.0.1',
  contextPath = '',
}: RequestOptions = {}): HttpServletRequest {
  const isDefault = (scheme === 'http' && port === 80) || (scheme === 'https' && port === 443)
  const hostHeader = isDefault ? host : `${host}:${port}`
  const h: Record<string, string | string[]> = { host: hostHeader }
  const rawHeaders = ['Host', hostHeader]
  for (const [k, v] of headers) {
    rawHeaders.push(k, v)
    const key = k.toLowerCase()
    const prev = h[key]
    h[key] = prev === undefined ? v : [...(Array.isArray(prev) ? prev : [prev]), v]
  }
  const raw = {
    method,
    url: query === null ? uri : `${uri}?${query}`,
    headers: h,
    rawHeaders,
    socket: { remoteAddress: remoteAddr, encrypted: scheme === 'https' },
    httpVersion: '1.1',
  } as unknown as IncomingMessage
  return new HttpServletRequest(raw, Buffer.alloc(0), contextPath)
}

/** Réponse dont les octets envoyés sont conservés */
export function response(): HttpServletResponse {
  const chunks: Buffer[] = []
  const raw = {
    headersSent: false,
    statusCode: 200,
    setHeader() {},
    write(b: string | Uint8Array) {
      chunks.push(Buffer.from(b))
      return true
    },
    end(b?: string | Uint8Array) {
      if (b !== undefined) chunks.push(Buffer.from(b))
    },
    chunks,
  }
  return new HttpServletResponse(raw as unknown as ServerResponse)
}

/** statut, message d'erreur, en-têtes (noms en minuscules, triés) et corps d'une réponse */
export function describeResponse(r: HttpServletResponse): unknown[] {
  const headers = (r as unknown as { headers: Map<string, string[]> }).headers
  const body = Buffer.concat((r.raw as unknown as { chunks: Buffer[] }).chunks).toString('utf8')
  return [r.status, r.attributesForError?.message ?? null, [...headers.keys()].sort().map((k) => [k, headers.get(k)!.map(stableHttpDate)]), body]
}

/** statut, en-têtes (noms en minuscules, triés) et corps d'une ResponseEntity (corps tel quel) */
export function describeEntity(entity: ResponseEntity<unknown>): unknown[] {
  const h = entity.headers.entries
  return [entity.statusCode, [...h.keys()].sort().map((k) => [k, h.get(k)!.map(stableHttpDate)]), entity.body]
}

/** Exécute `block` avec `request` liée au contexte courant (RequestContextHolder), comme le DispatcherServlet */
export async function withRequest<T>(req: HttpServletRequest, block: () => T | Promise<T>): Promise<T> {
  let result: T | undefined
  await new RequestContextFilter().doFilter(req, response(), {
    async doFilter() {
      result = await block()
    },
  })
  return result as T
}

/** classe, nom, credentials, drapeau authentifié et autorités d'une authentification */
export function describeAuthentication(a: Authentication | null | undefined): unknown[] | null {
  if (a === null || a === undefined) return null
  const credentials = a.credentials
  return [
    a.constructor.name,
    a.name,
    credentials === null || credentials === undefined ? null : String(credentials),
    a.isAuthenticated,
    [...a.authorities].map((it) => it.getAuthority()).sort(),
  ]
}

const NOW_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?/g

/**
 * Remplace dans un document sérialisé les dates-heures ISO à un jour près d'aujourd'hui (générées par `now()`) par
 * `@now`, comme `stable` le fait pour les dates canoniques.
 */
export function stableText(s: string): string {
  const today = LocalDate.now()
  const near = new Set([today.minusDays(1), today, today.plusDays(1)].map((d) => d.toString()))
  return s.replace(NOW_TIME, (m) => (near.has(m.slice(0, 10)) ? '@now' : m))
}

/** une date HTTP (RFC 1123) à un jour près de maintenant devient `@now` (Last-Modified des lignes datées par la base) */
export function stableHttpDate(v: string): string {
  if (!/^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(v)) return v
  const t = Date.parse(v)
  return !Number.isNaN(t) && Math.abs(Date.now() - t) < 86_400_000 ? '@now' : v
}
