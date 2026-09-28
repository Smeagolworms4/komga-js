// Tests différentiels du DispatcherServlet / serveur web : les requêtes de fixtures/requests.json sont envoyées au
// serveur TS (contrôleurs de test reproduisant ceux de Komga, voir TestControllers.ts) et les réponses comparées à
// celles du Komga JVM enregistrées dans fixtures/reference.json (record-fixtures.mjs).
// Normalisations : en-tête Date, Set-Cookie (sécurité), horodatages, frontière multipart, date de la page Whitelabel.
// Ce fichier n'a pas de jumeau Kotlin.
process.env.LANG = 'fr_FR.UTF-8'
process.env.TZ = 'Europe/Paris'
import '../../../src/port/spring-boot-jackson.js'
import '../../../src/port/spring-boot-web.js'
import '../../../src/infrastructure/web/WebMvcConfiguration.js'
import '../../../src/infrastructure/web/EtagFilterConfiguration.js'
import '../../../src/infrastructure/web/BracketParamsFilterConfiguration.js'
import '../../../src/infrastructure/web/WebServerEffectiveSettings.js'
import '../../../src/interfaces/mvc/ResourceNotFoundController.js'
import '../../../src/interfaces/mvc/IndexController.js'
import './TestControllers.js'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebServerEffectiveSettings } from '../../../src/infrastructure/web/WebServerEffectiveSettings.js'
import { ApplicationContext, Environment } from '../../../src/port/spring.js'
import { type WebServer, startWebServer } from '../../../src/port/spring-boot-web.js'
// @ts-expect-error module JS sans déclarations
import { sendAll } from './http-client.mjs'

type RawResponse = { status: number; statusMessage: string; rawHeaders: string[]; body: string; bodySha256?: string; bodyLength?: number }
type RequestSpec = { id: string; method: string; path: string; headers: Record<string, string>; body?: unknown }

const here = dirname(fileURLToPath(import.meta.url))
const requests = JSON.parse(readFileSync(join(here, 'fixtures/requests.json'), 'utf8')) as RequestSpec[]
const reference = JSON.parse(readFileSync(join(here, 'fixtures/reference.json'), 'utf8')) as Record<string, RawResponse>

/** Écarts connus (voir le rapport de portage) */
const ALLOW_ORDER_UNSPECIFIED = new Set(['claim-options', 'claim-delete'])
const JACKSON_MESSAGE = new Set(['libraries-malformed', 'libraries-empty-object'])
/** chemins hors des chaînes de Spring Security de Komga : en-têtes de sécurité non simulés par FakeSecurityFilter */
const SECURITY_HEADERS_UNMODELED = new Set(['claim-trailing-slash', 'claim-uppercase'])
/** frontière multipart aléatoire (30 à 40 caractères) : longueur et ETag varient */
const RANDOM_BOUNDARY = new Set(['fonts-range-multi'])
const VIOLATIONS_ORDER_UNSPECIFIED = new Set(['claim-post-invalid', 'claim-post-invalid-en', 'claim-post-invalid-de', 'libraries-invalid'])

function normalizeBody(id: string, r: RawResponse, ref: RawResponse): string {
  if (ref.bodySha256 !== undefined) {
    if (r.bodySha256 !== undefined) return `sha256:${r.bodySha256}`
    const b = Buffer.from(r.body, 'base64')
    return `sha256:${createHash('sha256').update(b).digest('hex')}`
  }
  const buf = Buffer.from(r.body, 'base64')
  let s = buf.toString('latin1')
  const boundary = /boundary=([^;\s]+)/.exec(headerValue(r, 'Content-Type') ?? '')?.[1]
  if (boundary) s = s.split(boundary).join('BOUNDARY')
  s = s.replace(/"timestamp":"[^"]+"/, '"timestamp":"TS"')
  s = s.replace(/<div id='created'>[^<]*<\/div>/, "<div id='created'>DATE</div>")
  if (JACKSON_MESSAGE.has(id)) s = s.replace(/"message":"JSON parse error: [^"]*"/, '"message":"JSON parse error: ..."')
  if (VIOLATIONS_ORDER_UNSPECIFIED.has(id) && s.startsWith('{"violations"')) {
    const v = JSON.parse(s) as { violations: { fieldName: string }[] }
    v.violations.sort((a, b) => a.fieldName.localeCompare(b.fieldName))
    s = JSON.stringify(v)
  }
  return s
}

function headerValue(r: RawResponse, name: string): string | null {
  for (let i = 0; i < r.rawHeaders.length; i += 2) if ((r.rawHeaders[i] as string).toLowerCase() === name.toLowerCase()) return r.rawHeaders[i + 1] as string
  return null
}

function normalizeHeaders(id: string, r: RawResponse): string[] {
  const out: string[] = []
  const boundary = /boundary=([^;\s]+)/.exec(headerValue(r, 'Content-Type') ?? '')?.[1]
  for (let i = 0; i < r.rawHeaders.length; i += 2) {
    const name = r.rawHeaders[i] as string
    let value = r.rawHeaders[i + 1] as string
    if (name === 'Set-Cookie') continue
    if (SECURITY_HEADERS_UNMODELED.has(id) && (name === 'Vary' || name.startsWith('X-'))) continue
    if (RANDOM_BOUNDARY.has(id) && (name === 'ETag' || name === 'Content-Length')) value = 'VARIES'
    if (name === 'Date') value = 'DATE'
    if (boundary) value = value.split(boundary).join('BOUNDARY')
    if (name === 'Allow' && ALLOW_ORDER_UNSPECIFIED.has(id)) value = value.split(/,\s*/).sort().join(value.includes(', ') ? ', ' : ',')
    out.push(`${name}: ${value}`)
  }
  return out
}

describe('DispatcherServlet (différentiel avec Komga JVM)', () => {
  let ctx: ApplicationContext
  let server: WebServer
  let actual: Record<string, RawResponse>

  beforeAll(async () => {
    const env = new Environment({
      properties: {
        'server.port': 0,
        'server.forward-headers-strategy': 'framework',
        'server.error.include-message': 'always',
        'spring.mvc.async.request-timeout': '1h',
      },
      env: {},
    })
    ctx = new ApplicationContext(env).refresh()
    server = await startWebServer(ctx, { port: 0, host: '127.0.0.1' })
    actual = (await sendAll(`http://127.0.0.1:${server.port}`, requests)) as Record<string, RawResponse>
  })

  afterAll(async () => {
    await server.stop()
    ctx.close()
  })

  it('publishes ServletWebServerInitializedEvent', () => {
    expect(ctx.getBean(WebServerEffectiveSettings).effectiveServerPort).toBe(server.port)
    expect(ctx.getBean(WebServerEffectiveSettings).effectiveServletContextPath).toBe('')
  })

  for (const r of requests) {
    it(`${r.id}: ${r.method} ${r.path}`, () => {
      const ref = reference[r.id] as RawResponse
      const act = actual[r.id] as RawResponse
      expect(act.status, 'status').toBe(ref.status)
      expect(act.statusMessage, 'phrase de statut (Tomcat : vide)').toBe(ref.statusMessage)
      expect(normalizeHeaders(r.id, act), 'en-têtes').toEqual(normalizeHeaders(r.id, ref))
      expect(normalizeBody(r.id, act, ref), 'corps').toBe(normalizeBody(r.id, ref, ref))
    })
  }
})
