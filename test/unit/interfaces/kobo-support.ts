// Miroir de FakeKoboStore (oracle/interfaces/KoboSupport.kt) : faux store Kobo derrière KoboProxy. Le client HTTP du
// proxy est remplacé par un client qui enregistre les requêtes (méthode, URL, en-têtes aux noms en minuscules, corps)
// et répond avec `status`, `headers` et `body`.
import type { KoboProxy } from '../../../src/infrastructure/kobo/KoboProxy.js'
import { reasonPhrase } from '../../../src/port/spring-web-dispatcher.js'

export class FakeKoboStore {
  readonly requests: unknown[][] = []
  status = 200
  headers: [string, string][] = []
  body = '{}'

  install(proxy: KoboProxy): void {
    ;(proxy as unknown as { koboApiClient: unknown }).koboApiClient = {
      exchange: async (method: string, uri: string, headers: [string, string][], body: Uint8Array | null) => {
        const grouped = new Map<string, string[]>()
        for (const [k, v] of headers) {
          const key = k.toLowerCase()
          grouped.set(key, [...(grouped.get(key) ?? []), v])
        }
        this.requests.push([
          method,
          `https://storeapi.kobo.com${uri}`,
          [...grouped].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, v]),
          body === null ? '' : Buffer.from(body).toString('utf8'),
        ])
        const responseHeaders = new Map<string, string[]>()
        for (const [k, v] of this.headers) {
          const existing = [...responseHeaders.keys()].find((it) => it.toLowerCase() === k.toLowerCase())
          if (existing !== undefined) responseHeaders.get(existing)!.push(v)
          else responseHeaders.set(k, [v])
        }
        return { statusCode: this.status, statusText: reasonPhrase(this.status) ?? '', headers: responseHeaders, body: Buffer.from(this.body, 'utf8') }
      },
    }
  }

  respond(status = 200, body = '{}', ...headers: [string, string][]): void {
    this.status = status
    this.body = body
    // le store Kobo répond en JSON
    this.headers = headers.some(([k]) => k.toLowerCase() === 'content-type') ? headers : [...headers, ['Content-Type', 'application/json']]
  }

  drain(): unknown[][] {
    return this.requests.splice(0)
  }
}
