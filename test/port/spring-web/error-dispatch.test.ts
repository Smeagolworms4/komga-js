// Page d'erreur (dispatch ERROR vers /error, BasicErrorController) des requêtes refusées par les chaînes de sécurité de
// Komga, sur le vrai serveur (contexte complet, startWebServer) : réponses relevées sur le Komga de référence
// (curl, sans authentification). Ce fichier n'a pas de jumeau Kotlin.
// Régression : le dispatch ERROR de /koreader/** était de nouveau intercepté par la chaîne kosync (securityMatcher
// évalué sur l'URI d'origine au lieu de `/error`), d'où une réponse 403 sans corps.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type WebServer, startWebServer } from '../../../src/port/spring-boot-web.js'
import { closeContext, mockMvcTest } from '../../support/mockmvc.js'
import { send } from '../spring-security/harness.js'

// [chemin, statut, Content-Type, WWW-Authenticate, corps (sans timestamp)]
const REFERENCE: [string, number, string, string | undefined, string][] = [
  ['/koreader/users/auth', 403, 'application/json', undefined, '{"status":403,"error":"Forbidden","message":"Forbidden","path":"/koreader/users/auth"}'],
  ['/koreader/syncs/progress/abc', 403, 'application/json', undefined, '{"status":403,"error":"Forbidden","message":"Forbidden","path":"/koreader/syncs/progress/abc"}'],
  ['/kobo/badtoken/v1/initialization', 403, 'application/json', undefined, '{"status":403,"error":"Forbidden","message":"Forbidden","path":"/kobo/badtoken/v1/initialization"}'],
  ['/api/v1/series', 401, 'application/json', 'Basic realm="Realm"', '{"status":401,"error":"Unauthorized","message":"Unauthorized","path":"/api/v1/series"}'],
  ['/api/v2/users/me', 401, 'application/json', 'Basic realm="Realm"', '{"status":401,"error":"Unauthorized","message":"Unauthorized","path":"/api/v2/users/me"}'],
  ['/opds/v1.2/catalog', 401, 'application/json', 'Basic realm="Realm"', '{"status":401,"error":"Unauthorized","message":"Unauthorized","path":"/opds/v1.2/catalog"}'],
  ['/sse/v1/events', 401, 'application/json', 'Basic realm="Realm"', '{"status":401,"error":"Unauthorized","message":"Unauthorized","path":"/sse/v1/events"}'],
  ['/actuator/info', 401, 'application/json', 'Basic realm="Realm"', '{"status":401,"error":"Unauthorized","message":"Unauthorized","path":"/actuator/info"}'],
]

describe('error dispatch of requests rejected by the security filter chains', () => {
  const ctx = mockMvcTest()
  let server: WebServer
  let base: string

  beforeAll(async () => {
    server = await startWebServer(ctx, { port: 0, host: '127.0.0.1' })
    base = `http://127.0.0.1:${server.port}`
  })

  afterAll(async () => {
    await server.stop()
    await closeContext(ctx)
  })

  it.each(REFERENCE)('GET %s', async (path, status, contentType, wwwAuthenticate, body) => {
    const r = await send(base, 'GET', path)
    expect(r.status).toBe(status)
    expect(r.headers['content-type']).toBe(contentType)
    expect(r.headers['www-authenticate']).toBe(wwwAuthenticate)
    const json = JSON.parse(r.body) as Record<string, unknown>
    expect(json.timestamp).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+00:00$/)
    delete json.timestamp
    expect(JSON.stringify(json)).toBe(body)
  })

  it('X-Auth-User with an unknown key on /koreader', async () => {
    const r = await send(base, 'GET', '/koreader/users/auth', { 'X-Auth-User': 'bad' })
    expect(r.status).toBe(403)
    const json = JSON.parse(r.body) as Record<string, unknown>
    delete json.timestamp
    expect(json).toEqual({ status: 403, error: 'Forbidden', message: 'Forbidden', path: '/koreader/users/auth' })
  })
})
