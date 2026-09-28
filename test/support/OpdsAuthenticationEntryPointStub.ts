// Support de test : substitut d'infrastructure/security/OpdsAuthenticationEntryPoint.ts tant que ses dépendances
// (OpdsGenerator, Opds2Controller) ne sont pas portées ; même réponse que Komga (document d'authentification OPDS 2,
// relevé sur le Komga de référence). Chargé par test/support/mockmvc.ts uniquement si le jumeau ne se charge pas.
// Ce fichier n'a pas de jumeau Kotlin.
import type { HttpServletRequest, HttpServletResponse } from '../../src/port/servlet.js'
import type { AuthenticationException } from '../../src/port/spring-security.js'
import type { AuthenticationEntryPoint } from '../../src/port/spring-security-web.js'
import { component } from '../../src/port/spring.js'

export class OpdsAuthenticationEntryPoint implements AuthenticationEntryPoint {
  commence(request: HttpServletRequest, response: HttpServletResponse, _authException: AuthenticationException): void {
    const scheme = request.scheme
    const port = request.serverPort
    const includePort = (scheme === 'http' && port !== 80) || (scheme === 'https' && port !== 443)
    const base = `${scheme}://${request.serverName}${includePort ? `:${port}` : ''}${request.contextPath}`
    const document = {
      authentication: [{ type: 'http://opds-spec.org/auth/basic', labels: { login: 'Email', password: 'Password' } }],
      title: 'Komga',
      id: `${base}/opds/v2/auth`,
      description: 'Enter your email and password to authenticate.',
      links: [
        { rel: 'help', href: 'https://komga.org' },
        { rel: 'logo', href: `${base}/android-chrome-512x512.png` },
      ],
    }
    response.setContentType('application/opds-authentication+json;charset=UTF-8')
    response.status = 401
    response.setHeader('WWW-Authenticate', 'Basic realm="Realm"')
    response.setHeader('Link', `<${base}/opds/v2/auth>; rel="http://opds-spec.org/auth/document"; type="application/opds-authentication+json"`)
    response.send(JSON.stringify(document))
  }
}

component(OpdsAuthenticationEntryPoint)
