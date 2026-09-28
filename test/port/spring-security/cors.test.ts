// CORS : jumeau CorsConfiguration + DefaultCorsProcessor comparés aux sorties de Spring (jshell, MockHttpServletRequest).
// Ce fichier n'a pas de jumeau Kotlin.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { KomgaProperties } from '../../../src/infrastructure/configuration/KomgaProperties.js'
import { CorsConfiguration } from '../../../src/infrastructure/security/CorsConfiguration.js'
import { HttpServletRequest, HttpServletResponse } from '../../../src/port/servlet.js'
import { DefaultCorsProcessor } from '../../../src/port/spring-web-cors.js'
import { Environment } from '../../../src/port/spring.js'

function req(method: string, headers: Record<string, string>): HttpServletRequest {
  const raw = { method, url: '/api/v1/series', headers: { host: 'localhost:25600', ...headers }, socket: {} }
  return new HttpServletRequest(raw as unknown as IncomingMessage, Buffer.alloc(0))
}

function run(method: string, headers: Record<string, string>) {
  const props = new KomgaProperties()
  props.cors.allowedOrigins = ['http://example.com/', 'http://other.org']
  const source = new CorsConfiguration().corsConfigurationSource('X-Auth-Token', props)
  let body = ''
  const raw = {
    headersSent: false,
    statusCode: 200,
    setHeader() {},
    write(b: Buffer) {
      body += b.toString()
      return true
    },
    end(b?: string) {
      body += b ?? ''
    },
  }
  const res = new HttpServletResponse(raw as unknown as ServerResponse)
  const r = req(method, headers)
  const ok = new DefaultCorsProcessor().processRequest(source.getCorsConfiguration(r), r, res)
  const h: Record<string, string> = {}
  for (const n of ['Vary', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers', 'Access-Control-Expose-Headers', 'Access-Control-Allow-Credentials', 'Access-Control-Max-Age'])
    if (res.containsHeader(n)) h[n] = res.getHeaders(n).join('|')
  return { ok, status: res.status, h, body }
}

const VARY = 'Origin|Access-Control-Request-Method|Access-Control-Request-Headers'

describe('CorsConfiguration', () => {
  it('preflight', () => {
    expect(run('OPTIONS', { origin: 'http://example.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'X-Auth-Token, content-type' })).toEqual({
      ok: true,
      status: 200,
      body: '',
      h: {
        Vary: VARY,
        'Access-Control-Allow-Origin': 'http://example.com',
        'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS,TRACE',
        'Access-Control-Allow-Headers': 'X-Auth-Token, content-type',
        'Access-Control-Expose-Headers': 'Content-Disposition, X-Auth-Token',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '1800',
      },
    })
  })

  it('simple request, origin compared ignoring case', () => {
    expect(run('GET', { origin: 'http://EXAMPLE.com' })).toEqual({
      ok: true,
      status: 200,
      body: '',
      h: {
        Vary: VARY,
        'Access-Control-Allow-Origin': 'http://EXAMPLE.com',
        'Access-Control-Expose-Headers': 'Content-Disposition, X-Auth-Token',
        'Access-Control-Allow-Credentials': 'true',
      },
    })
  })

  it('rejected origin and method', () => {
    expect(run('GET', { origin: 'http://evil.com' })).toEqual({ ok: false, status: 403, body: 'Invalid CORS request', h: { Vary: VARY } })
    expect(run('OPTIONS', { origin: 'http://example.com', 'access-control-request-method': 'FOO' })).toEqual({ ok: false, status: 403, body: 'Invalid CORS request', h: { Vary: VARY } })
  })

  it('pre-flight request without configuration is rejected', () => {
    const r = req('OPTIONS', { origin: 'http://evil.com', 'access-control-request-method': 'GET' })
    let body = ''
    const raw = { headersSent: false, statusCode: 200, setHeader() {}, write: (b: Buffer) => ((body += b.toString()), true), end() {} }
    const res = new HttpServletResponse(raw as unknown as ServerResponse)
    expect(new DefaultCorsProcessor().processRequest(null, r, res)).toBe(false)
    expect(res.status).toBe(403)
    expect(body).toBe('Invalid CORS request')
  })

  it('same origin is not a CORS request', () => {
    expect(run('GET', { origin: 'http://localhost:25600' })).toEqual({ ok: true, status: 200, body: '', h: { Vary: VARY } })
  })

  it('condition on komga.cors.allowed-origins', () => {
    const c = new CorsConfiguration.CorsAllowedOriginsPresent()
    expect(c.getMatchOutcome(new Environment({ env: {} })).match).toBe(false)
    expect(c.getMatchOutcome(new Environment({ env: {}, properties: { komga: { cors: { 'allowed-origins': ['http://a'] } } } })).match).toBe(true)
  })
})
