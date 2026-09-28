// Support de test : équivalent de org.springframework.mock.web.MockHttpServletRequest (sous-ensemble).
// Ce fichier n'a pas de jumeau Kotlin.
import type { IncomingMessage } from 'node:http'
import { HttpServletRequest } from '../src/port/servlet.js'

export class MockHttpServletRequest extends HttpServletRequest {
  constructor(method = '', requestURI = '', headers: Record<string, string> = {}) {
    super(
      {
        method: method || 'GET',
        url: requestURI || '/',
        headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
        socket: { remoteAddress: '127.0.0.1' },
        httpVersion: '1.1',
      } as unknown as IncomingMessage,
      Buffer.alloc(0),
    )
    this.parameters.clear()
  }

  /** `setParameter(name, vararg values)` : remplace les valeurs */
  setParameter(name: string, ...values: string[]): void {
    this.parameters.set(name, values)
  }

  addParameter(name: string, ...values: string[]): void {
    this.parameters.set(name, [...(this.parameters.get(name) ?? []), ...values])
  }
}
