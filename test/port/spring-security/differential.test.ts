// Tests différentiels de la sécurité (Spring Security + Spring Session) : chaque scénario est rejoué sur un Komga de
// référence (KOMGA_REFERENCE_URL, http://localhost:25700 par défaut, admin@example.org / secret) et sur la chaîne de
// filtres TypeScript (harness.ts), puis les réponses normalisées sont comparées (statut, en-têtes de sécurité, cookies,
// corps d'erreur). Sans référence joignable, la comparaison se fait avec fixtures/reference.json (enregistré avec
// RECORD_FIXTURES=1, ou s'il est absent). Ce fichier n'a pas de jumeau Kotlin.
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiKey } from '../../../src/domain/model/ApiKey.js'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../src/domain/model/UserRoles.js'
import { KomgaUserRepository } from '../../../src/domain/persistence/KomgaUserRepository.js'
import { KomgaProperties } from '../../../src/infrastructure/configuration/KomgaProperties.js'
import { KomgaPrincipal } from '../../../src/infrastructure/security/KomgaPrincipal.js'
import { PasswordEncoder, Sha512DigestUtils } from '../../../src/port/spring-security.js'
import { SessionRegistry } from '../../../src/port/spring-session.js'
import type { SecurityFilterChain } from '../../../src/port/spring-security-web.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { type RawResponse, type TsServer, basic, mirrorFilterChains, opdsEntryPointStub, send, startServer, twinFilterChains } from './harness.js'

const REF = process.env.KOMGA_REFERENCE_URL ?? 'http://localhost:25700'
const REF_DB = process.env.KOMGA_REFERENCE_DB ?? '/tmp/claude-1000/-home-smeagol-Works-JS-Komga/5c05760b-af11-41d7-ada3-5113693c5b7c/scratchpad/komga-ref/config/database.sqlite'
const FIXTURES = 'test/port/spring-security/fixtures/reference.json'
const ADMIN = { email: 'admin@example.org', password: 'secret' }
const USER = { email: 'user@example.org', password: 'userpass' }
const UA = `komgajs-security-diff/${Date.now()}`

const opdsAuthDocument = (base: string) => ({
  authentication: [{ type: 'http://opds-spec.org/auth/basic', labels: { login: 'Email', password: 'Password' } }],
  title: 'Komga',
  id: `${base}/opds/v2/auth`,
  description: 'Enter your email and password to authenticate.',
  links: [
    { rel: 'help', href: 'https://komga.org' },
    { rel: 'logo', href: `${base}/android-chrome-512x512.png` },
  ],
})

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function b64(s: string): string | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null
  return Buffer.from(s, 'base64').toString('utf8')
}

function rememberMeShape(v: string, email: string | null): boolean {
  const plain = b64(v + '='.repeat((4 - (v.length % 4)) % 4))
  if (plain === null) return false
  const t = plain.split(':')
  if (t.length !== 4) return false
  const expiry = Number(t[1])
  const expected = Date.now() + 365 * 86400 * 1000
  return (
    (email === null || decodeURIComponent(t[0] as string) === email) &&
    Math.abs(expiry - expected) < 5 * 60 * 1000 &&
    t[2] === 'SHA256' &&
    /^[0-9a-f]{64}$/.test(t[3] as string)
  )
}

function normCookie(c: string): string {
  return c
    .replace(/^KOMGA-SESSION=([^;]+)/, (m, v: string) => (UUID.test(b64(v) ?? '') ? 'KOMGA-SESSION=<session>' : m))
    .replace(/^komga-remember-me=([^;]+)/, (m, v: string) => (rememberMeShape(v, null) ? 'komga-remember-me=<token>' : m))
    .replace(/Expires=([^;]+)/, (m, d: string) => (d.includes('1970') ? m : 'Expires=<date>'))
}

type Normalized = { status: number; headers: Record<string, string | string[]>; body?: unknown }

function norm(r: RawResponse, base: string, { body = false }: { body?: boolean } = {}): Normalized {
  const out: Normalized = { status: r.status, headers: {} }
  for (const n of ['www-authenticate', 'x-content-type-options', 'x-xss-protection', 'x-frame-options', 'vary', 'link', 'x-auth-token', 'strict-transport-security']) {
    const v = r.headers[n]
    if (v === undefined) continue
    let s = Array.isArray(v) ? v.join(', ') : v
    if (n === 'link') s = s.split(base).join('<base>')
    if (n === 'x-auth-token' && UUID.test(s)) s = '<uuid>'
    out.headers[n] = s
  }
  const cookies = r.headers['set-cookie']
  if (cookies) out.headers['set-cookie'] = cookies.map(normCookie)
  if (body) {
    const ct = r.headers['content-type']
    if (ct !== undefined) out.headers['content-type'] = ct
    let b: unknown = r.body
    try {
      b = JSON.parse(r.body)
    } catch {
      // texte brut
    }
    if (b !== null && typeof b === 'object' && 'timestamp' in (b as object)) (b as Record<string, unknown>).timestamp = '<timestamp>'
    if (typeof b === 'object') b = JSON.parse(JSON.stringify(b).split(base).join('<base>'))
    out.body = b
  }
  return out
}

function cookieValue(r: RawResponse, name: string): string | null {
  for (const c of r.headers['set-cookie'] ?? []) {
    const m = new RegExp(`^${name}=([^;]*)`).exec(c)
    if (m && m[1]) return m[1]
  }
  return null
}

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------

type Target = { base: string; apiKey: string; expireSessions(email: string): Promise<void> }
type Scenario = { name: string; run(t: Target): Promise<Normalized[]> }

const h = (extra: Record<string, string> = {}) => ({ 'User-Agent': UA, Accept: '*/*', ...extra })

const scenarios: Scenario[] = [
  {
    name: 'anonymous api request creates a session (request cache) and returns basic challenge',
    run: async (t) => [norm(await send(t.base, 'GET', '/api/v2/users/me', h()), t.base, { body: true })],
  },
  {
    name: 'anonymous api request accepting json does not create a session',
    run: async (t) => [norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Accept: 'application/json' })), t.base, { body: true })],
  },
  {
    name: 'anonymous api request accepting html falls back to the OPDS entry point',
    run: async (t) => [norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Accept: 'text/html' })), t.base, { body: true })],
  },
  {
    name: 'anonymous XMLHttpRequest gets basic challenge',
    run: async (t) => [norm(await send(t.base, 'GET', '/api/v1/series', h({ Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' })), t.base, { body: true })],
  },
  {
    name: 'anonymous OPDS v2 request gets the OPDS authentication document',
    run: async (t) => [norm(await send(t.base, 'GET', '/opds/v2/catalog', h()), t.base, { body: true })],
  },
  {
    name: 'anonymous OPDS v1 request gets basic challenge',
    run: async (t) => [norm(await send(t.base, 'GET', '/opds/v1.2/catalog', h()), t.base, { body: true })],
  },
  {
    name: 'valid basic credentials create a session cookie',
    run: async (t) => [norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: basic(ADMIN.email, ADMIN.password) })), t.base)],
  },
  {
    name: 'invalid basic credentials return 401 and cancel remember-me',
    run: async (t) => [norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: basic(ADMIN.email, 'wrong') })), t.base, { body: true })],
  },
  {
    name: 'unknown user returns 401',
    run: async (t) => [norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: basic('nobody@example.org', 'x') })), t.base, { body: true })],
  },
  {
    name: 'malformed basic header returns 401',
    run: async (t) => [
      norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: 'Basic' })), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: 'Basic !!!' })), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: `Basic ${Buffer.from('nocolon').toString('base64')}` })), t.base, { body: true }),
    ],
  },
  {
    name: 'remember-me parameter returns a remember-me cookie usable for login',
    run: async (t) => {
      const r1 = await send(t.base, 'GET', '/api/v2/users/me?remember-me=true', h({ Authorization: basic(ADMIN.email, ADMIN.password), 'X-Requested-With': 'XMLHttpRequest' }))
      const token = cookieValue(r1, 'komga-remember-me') as string
      expect(rememberMeShape(token, ADMIN.email)).toBe(true)
      const r2 = await send(t.base, 'GET', '/api/v2/users/me', h({ Cookie: `komga-remember-me=${token}` }))
      const session = cookieValue(r2, 'KOMGA-SESSION') as string
      const r3 = await send(t.base, 'GET', '/api/v2/users/me', h({ Cookie: `KOMGA-SESSION=${session}` }))
      // @PreAuthorize("hasRole('ADMIN')") n'exige pas une authentification complète
      const r4 = await send(t.base, 'GET', '/api/v2/users', h({ Cookie: `KOMGA-SESSION=${session}` }))
      return [norm(r1, t.base), norm(r2, t.base), norm(r3, t.base), norm(r4, t.base)]
    },
  },
  {
    name: 'invalid remember-me cookie is cancelled',
    run: async (t) => [
      norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Cookie: 'komga-remember-me=Zm9vOmJhcg' })), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Cookie: 'komga-remember-me=' })), t.base, { body: true }),
    ],
  },
  {
    name: 'X-Auth-Token header session, reuse and exchange for a cookie',
    run: async (t) => {
      const r1 = await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: basic(ADMIN.email, ADMIN.password), 'X-Auth-Token': '' }))
      const token = r1.headers['x-auth-token'] as string
      const r2 = await send(t.base, 'GET', '/api/v2/users/me', h({ 'X-Auth-Token': token }))
      const r3 = await send(t.base, 'GET', '/api/v1/login/set-cookie', h({ 'X-Auth-Token': token }))
      const cookie = cookieValue(r3, 'KOMGA-SESSION') as string
      expect(b64(cookie)).toBe(token)
      const r4 = await send(t.base, 'GET', '/api/v2/users/me', h({ Cookie: `KOMGA-SESSION=${cookie}` }))
      const r5 = await send(t.base, 'GET', '/api/v2/users/me', h({ 'X-Auth-Token': 'unknown-session', Accept: 'application/json' }))
      return [norm(r1, t.base), norm(r2, t.base), norm(r3, t.base), norm(r4, t.base), norm(r5, t.base, { body: true })]
    },
  },
  {
    name: 'logout with header session',
    run: async (t) => {
      const r1 = await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: basic(ADMIN.email, ADMIN.password), 'X-Auth-Token': '' }))
      const token = r1.headers['x-auth-token'] as string
      const r2 = await send(t.base, 'GET', '/api/logout', h({ 'X-Auth-Token': token }))
      const r3 = await send(t.base, 'GET', '/api/v2/users/me', h({ 'X-Auth-Token': token, Accept: 'application/json' }))
      return [norm(r2, t.base, { body: true }), norm(r3, t.base, { body: true })]
    },
  },
  {
    name: 'logout with cookie session (POST, as the webui)',
    run: async (t) => {
      const r1 = await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: basic(ADMIN.email, ADMIN.password) }))
      const cookie = cookieValue(r1, 'KOMGA-SESSION') as string
      const r2 = await send(t.base, 'POST', '/api/logout', h({ Cookie: `KOMGA-SESSION=${cookie}`, 'X-Requested-With': 'XMLHttpRequest' }))
      const r3 = await send(t.base, 'GET', '/api/v2/users/me', h({ Cookie: `KOMGA-SESSION=${cookie}`, Accept: 'application/json' }))
      return [norm(r2, t.base, { body: true }), norm(r3, t.base, { body: true })]
    },
  },
  {
    name: 'logout without session',
    run: async (t) => [norm(await send(t.base, 'POST', '/api/logout', h()), t.base, { body: true })],
  },
  {
    name: 'api key authentication',
    run: async (t) => {
      const r1 = await send(t.base, 'GET', '/api/v2/users/me', h({ 'X-API-Key': t.apiKey }))
      const cookie = cookieValue(r1, 'KOMGA-SESSION') as string
      const r2 = await send(t.base, 'GET', '/api/v2/users/me', h({ Cookie: `KOMGA-SESSION=${cookie}` }))
      return [norm(r1, t.base), norm(r2, t.base)]
    },
  },
  {
    name: 'invalid api key',
    run: async (t) => [norm(await send(t.base, 'GET', '/api/v2/users/me', h({ 'X-API-Key': 'bad' })), t.base, { body: true })],
  },
  {
    name: 'kobo url token',
    run: async (t) => [
      norm(await send(t.base, 'GET', `/kobo/${t.apiKey}/v1/user/profile`, h()), t.base),
      norm(await send(t.base, 'GET', '/kobo/bad-token/v1/user/profile', h()), t.base, { body: true }),
    ],
  },
  {
    name: 'koreader header token',
    run: async (t) => [
      norm(await send(t.base, 'GET', '/koreader/users/auth', h({ 'X-Auth-User': t.apiKey, Accept: 'application/vnd.koreader.v1+json' })), t.base),
      norm(await send(t.base, 'GET', '/koreader/users/auth', h({ 'X-Auth-User': 'bad' })), t.base, { body: true }),
      norm(await send(t.base, 'POST', '/koreader/users/create', h()), t.base, { body: true }),
    ],
  },
  {
    name: 'admin endpoint is forbidden to a regular user',
    run: async (t) => [
      norm(await send(t.base, 'GET', '/api/v2/users', h({ Authorization: basic(USER.email, USER.password) })), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/api/v2/users', h({ Authorization: basic(ADMIN.email, ADMIN.password) })), t.base),
    ],
  },
  {
    name: 'expired session after sessions are expired for the user',
    run: async (t) => {
      const r1 = await send(t.base, 'GET', '/api/v2/users/me', h({ Authorization: basic(USER.email, USER.password), 'X-Auth-Token': '' }))
      const token = r1.headers['x-auth-token'] as string
      await t.expireSessions(USER.email)
      const r2 = await send(t.base, 'GET', '/api/v2/users/me', h({ 'X-Auth-Token': token }))
      const r3 = await send(t.base, 'GET', '/api/v2/users/me', h({ 'X-Auth-Token': token, Accept: 'application/json' }))
      return [norm(r2, t.base, { body: true }), norm(r3, t.base, { body: true })]
    },
  },
  {
    name: 'actuator endpoints',
    run: async (t) => [
      norm(await send(t.base, 'GET', '/actuator/health', h()), t.base),
      norm(await send(t.base, 'GET', '/actuator/info', h()), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/actuator', h()), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/actuator/info', h({ Authorization: basic(USER.email, USER.password), Accept: 'application/json' })), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/actuator/info', h({ Authorization: basic(ADMIN.email, ADMIN.password) })), t.base),
    ],
  },
  {
    name: 'firewall rejects malicious urls',
    run: async (t) => [
      norm(await send(t.base, 'GET', '/api/v1/books;x', h()), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/api/v1//books', h()), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/api/v1/books%25', h()), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/api/v1/%2e%2e/x', h()), t.base, { body: true }),
    ],
  },
  {
    name: 'oauth2 endpoints without client registrations',
    run: async (t) => [
      norm(await send(t.base, 'GET', '/oauth2/authorization/foo', h()), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/login/oauth2/code/foo', h({ Authorization: basic(ADMIN.email, ADMIN.password) })), t.base, { body: true }),
    ],
  },
  {
    name: 'cors without allowed origins: pre-flight rejected, simple requests unchanged',
    run: async (t) => [
      norm(await send(t.base, 'OPTIONS', '/api/v1/series', h({ Origin: 'http://evil.com', 'Access-Control-Request-Method': 'GET' })), t.base, { body: true }),
      norm(await send(t.base, 'GET', '/api/v2/users/me', h({ Origin: 'http://evil.com', Authorization: basic(ADMIN.email, ADMIN.password) })), t.base),
    ],
  },
  {
    name: 'permitted endpoints are reachable anonymously',
    run: async (t) => [norm(await send(t.base, 'GET', '/api/v1/oauth2/providers', h()), t.base), norm(await send(t.base, 'GET', '/opds/v2/auth', h()), t.base)],
  },
]

// ---------------------------------------------------------------------------
// Mise en place
// ---------------------------------------------------------------------------

async function referenceReachable(): Promise<boolean> {
  try {
    const r = await send(REF, 'GET', '/actuator/health')
    return r.status === 200
  } catch {
    return false
  }
}

describe('spring-security differential', () => {
  const ctx = springBootTest()
  let ts: TsServer
  let live = false
  let apiKey = ''
  let fixtures: Record<string, Normalized[]> = {}
  const recorded: Record<string, Normalized[]> = {}
  let refUserId: string | null = null
  let twin: SecurityFilterChain[] | null = null
  let mirrorFilters: string[][] = []

  beforeAll(async () => {
    live = await referenceReachable()
    let rememberMeKey = 'test-remember-me-key'
    const hashes = new Map<string, string>()
    if (live) {
      const auth = { Authorization: basic(ADMIN.email, ADMIN.password), 'Content-Type': 'application/json' }
      // utilisateur ordinaire
      const users = JSON.parse((await send(REF, 'GET', '/api/v2/users', auth)).body) as { id: string; email: string }[]
      refUserId = users.find((u) => u.email === USER.email)?.id ?? null
      if (refUserId === null) {
        await postJson(REF, '/api/v2/users', { email: USER.email, password: USER.password, roles: ['PAGE_STREAMING'] })
        const again = JSON.parse((await send(REF, 'GET', '/api/v2/users', auth)).body) as { id: string; email: string }[]
        refUserId = again.find((u) => u.email === USER.email)?.id ?? null
      }
      // clé d'API de l'administrateur
      const created = JSON.parse(await postJson(REF, '/api/v2/users/me/api-keys', { comment: `sec-diff-${Date.now()}` })) as { key: string }
      apiKey = created.key
      // clé remember-me et empreintes des mots de passe de la référence (cookies interchangeables)
      if (existsSync(REF_DB)) {
        const db = new Database(REF_DB, { readonly: true, fileMustExist: true })
        rememberMeKey = (db.prepare("select VALUE from SERVER_SETTINGS where KEY = 'REMEMBER_ME_KEY'").get() as { VALUE: string } | undefined)?.VALUE ?? rememberMeKey
        for (const r of db.prepare('select EMAIL, PASSWORD from USER').all() as { EMAIL: string; PASSWORD: string }[]) hashes.set(r.EMAIL, r.PASSWORD)
        db.close()
      }
    } else {
      apiKey = 'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf'
      fixtures = JSON.parse(readFileSync(FIXTURES, 'utf8')) as Record<string, Normalized[]>
    }

    const encoder = ctx.getBean(PasswordEncoder)
    const repo = ctx.getBean(KomgaUserRepository)
    const admin = new KomgaUser({
      email: ADMIN.email,
      password: hashes.get(ADMIN.email) ?? encoder.encode(ADMIN.password),
      roles: new Set([UserRoles.ADMIN, UserRoles.FILE_DOWNLOAD, UserRoles.KOBO_SYNC, UserRoles.KOREADER_SYNC, UserRoles.PAGE_STREAMING]),
    })
    repo.insert(admin)
    repo.insert(new KomgaUser({ email: USER.email, password: hashes.get(USER.email) ?? encoder.encode(USER.password), roles: new Set([UserRoles.PAGE_STREAMING]) }))
    repo.insert(new ApiKey({ userId: admin.id, key: Sha512DigestUtils.shaHex(apiKey), comment: 'sec-diff' }))

    const options = { rememberMeKey, rememberMeDays: 365, opdsAuthenticationEntryPoint: opdsEntryPointStub(opdsAuthDocument) }
    const mirror = mirrorFilterChains(ctx, options)
    twin = await twinFilterChains(ctx, options)
    ts = await startServer(ctx, twin ?? mirror)
    mirrorFilters = mirror.map((c) => c.getFilters().map((f) => f.constructor.name))
  }, 60_000)

  afterAll(async () => {
    await ts?.close()
    if (live && (process.env.RECORD_FIXTURES === '1' || !existsSync(FIXTURES))) {
      mkdirSync('test/port/spring-security/fixtures', { recursive: true })
      writeFileSync(FIXTURES, `${JSON.stringify(recorded, null, 2)}\n`)
    }
    closeContext(ctx)
  })

  async function postJson(base: string, path: string, body: unknown): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(base)
      const data = Buffer.from(JSON.stringify(body))
      import('node:http').then(({ request }) => {
        const req = request(
          {
            host: url.hostname,
            port: url.port,
            method: 'POST',
            path,
            headers: { Authorization: basic(ADMIN.email, ADMIN.password), 'Content-Type': 'application/json', 'Content-Length': data.length, Connection: 'close' },
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => chunks.push(c))
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
          },
        )
        req.on('error', reject)
        req.end(data)
      }, reject)
    })
  }

  const refTarget = (): Target => ({
    base: REF,
    apiKey,
    expireSessions: async () => {
      // PATCH du mot de passe (identique) : KomgaUserLifecycle.updatePassword expire les sessions
      await new Promise<void>((resolve, reject) => {
        import('node:http').then(({ request }) => {
          const url = new URL(REF)
          const data = Buffer.from(JSON.stringify({ password: USER.password }))
          const req = request(
            {
              host: url.hostname,
              port: url.port,
              method: 'PATCH',
              path: `/api/v2/users/${refUserId}/password`,
              headers: { Authorization: basic(ADMIN.email, ADMIN.password), 'Content-Type': 'application/json', 'Content-Length': data.length, Connection: 'close' },
            },
            (res) => {
              res.resume()
              res.on('end', () => resolve())
            },
          )
          req.on('error', reject)
          req.end(data)
        }, reject)
      })
    },
  })

  const tsTarget = (): Target => ({
    base: ts.base,
    apiKey,
    expireSessions: async (email) => {
      // KomgaUserLifecycle.expireSessions
      const user = ctx.getBean(KomgaUserRepository).findByEmailIgnoreCaseOrNull(email) as KomgaUser
      for (const it of ctx.getBean(SessionRegistry).getAllSessions(new KomgaPrincipal(user), false)) it.expireNow()
    },
  })

  for (const s of scenarios) {
    it(s.name, async () => {
      const expected = live ? await s.run(refTarget()) : fixtures[s.name]
      if (live) recorded[s.name] = expected as Normalized[]
      expect(expected, 'no reference output (fixture missing)').toBeDefined()
      const actual = await s.run(tsTarget())
      expect(actual).toEqual(expected)
    }, 30_000)
  }

  it('remember-me cookies are interchangeable between Komga and KomgaJS', async () => {
    if (!live || !existsSync(REF_DB)) return
    const login = { Authorization: basic(ADMIN.email, ADMIN.password), 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'komgajs-remember-me' }
    const fromRef = cookieValue(await send(REF, 'GET', '/api/v2/users/me?remember-me=true', login), 'komga-remember-me') as string
    const fromTs = cookieValue(await send(ts.base, 'GET', '/api/v2/users/me?remember-me=true', login), 'komga-remember-me') as string
    const onTs = await send(ts.base, 'GET', '/api/v2/users/me', { Cookie: `komga-remember-me=${fromRef}` })
    expect(onTs.status).toBe(200)
    expect(JSON.parse(onTs.body)).toEqual({ email: ADMIN.email })
    const onRef = await send(REF, 'GET', '/api/v2/users/me', { Cookie: `komga-remember-me=${fromTs}` })
    expect(onRef.status).toBe(200)
    expect((JSON.parse(onRef.body) as { email: string }).email).toBe(ADMIN.email)
  }, 30_000)

  it('SecurityConfiguration twin builds the same filter chains as the mirror (when its dependencies are ported)', () => {
    if (twin === null) {
      console.info('SecurityConfiguration.ts ne se charge pas encore (dépendances non portées) : chaînes miroir utilisées')
      return
    }
    expect(twin.map((c) => c.getFilters().map((f) => f.constructor.name))).toEqual(mirrorFilters)
    expect(twin.map((c) => c.order)).toEqual([1, 2147483647, 2147483647])
  })

  it('filter order of the main chain matches Spring Security', () => {
    expect(mirrorFilters[0]).toEqual([
      'SecurityContextHolderFilter',
      'HeaderWriterFilter',
      'CorsFilter',
      'LogoutFilter',
      'ConcurrentSessionFilter',
      'BasicAuthenticationFilter',
      'ApiKeyAuthenticationFilter',
      'RequestCacheAwareFilter',
      'RememberMeAuthenticationFilter',
      'AnonymousAuthenticationFilter',
      'SessionManagementFilter',
      'ExceptionTranslationFilter',
      'AuthorizationFilter',
    ])
    expect(mirrorFilters[1]).toEqual([
      'SecurityContextHolderFilter',
      'HeaderWriterFilter',
      'CorsFilter',
      'RequestCacheAwareFilter',
      'ApiKeyAuthenticationFilter',
      'AnonymousAuthenticationFilter',
      'ExceptionTranslationFilter',
      'AuthorizationFilter',
    ])
    expect(mirrorFilters[2]).toEqual([
      'SecurityContextHolderFilter',
      'HeaderWriterFilter',
      'CorsFilter',
      'ConcurrentSessionFilter',
      'RequestCacheAwareFilter',
      'ApiKeyAuthenticationFilter',
      'AnonymousAuthenticationFilter',
      'SessionManagementFilter',
      'ExceptionTranslationFilter',
      'AuthorizationFilter',
    ])
  })

  it('login activity is recorded like the reference', async () => {
    if (!live || !existsSync(REF_DB)) return
    const select = 'select EMAIL, SUCCESS, ERROR, SOURCE, API_KEY_COMMENT, USER_ID is not null as HAS_USER from AUTHENTICATION_ACTIVITY where USER_AGENT = ?'
    const refDb = new Database(REF_DB, { readonly: true, fileMustExist: true })
    const refRows = (refDb.prepare(select).all(UA) as Record<string, unknown>[]).map((r) => JSON.stringify({ ...r, API_KEY_COMMENT: r.API_KEY_COMMENT === null ? null : '<comment>' }))
    refDb.close()
    const tsDb = new Database(ctx.getBean(KomgaProperties).database.file, { readonly: true, fileMustExist: true })
    const tsRows = (tsDb.prepare(select).all(UA) as Record<string, unknown>[]).map((r) => JSON.stringify({ ...r, API_KEY_COMMENT: r.API_KEY_COMMENT === null ? null : '<comment>' }))
    tsDb.close()
    expect(refRows.length).toBeGreaterThan(0)
    expect([...tsRows].sort()).toEqual([...refRows].sort())
  }, 30_000)
})
