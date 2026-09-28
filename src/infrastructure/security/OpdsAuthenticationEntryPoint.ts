// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/OpdsAuthenticationEntryPoint.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { OpdsGenerator } from '../../interfaces/api/OpdsGenerator.js'
import { MEDIATYPE_OPDS_AUTHENTICATION_JSON_VALUE } from '../../interfaces/api/dto/Constants.js'
import { OpdsLinkRel } from '../../interfaces/api/dto/OpdsLinkRel.js'
import { ROUTE_AUTH } from '../../interfaces/api/opds/v2/Opds2Controller.js'
import { ObjectMapper } from '../../port/jackson-mapper.js'
import type { HttpServletRequest, HttpServletResponse } from '../../port/servlet.js'
import type { AuthenticationException } from '../../port/spring-security.js'
import type { AuthenticationEntryPoint } from '../../port/spring-security-web.js'
import { HttpStatus } from '../../port/spring-web.js'
import { component } from '../../port/spring.js'

const DEFAULT_REALM: string = 'Realm'

// PORT: ServletUriComponentsBuilder.fromCurrentContextPath() (en-têtes X-Forwarded-* déjà appliqués à la requête)
function fromCurrentContextPath(request: HttpServletRequest): string {
  const scheme = request.scheme
  const port = request.serverPort
  const includePort = (scheme === 'http' && port !== 80) || (scheme === 'https' && port !== 443)
  return `${scheme}://${request.serverName}${includePort ? `:${port}` : ''}${request.contextPath}`
}

export class OpdsAuthenticationEntryPoint implements AuthenticationEntryPoint {
  constructor(
    private readonly opdsGenerator: OpdsGenerator,
    private readonly objectMapper: ObjectMapper,
  ) {}

  commence(request: HttpServletRequest, response: HttpServletResponse, _authException: AuthenticationException): void {
    // PORT: with(response) { contentType = ..; characterEncoding = UTF-8 } -> Content-Type avec charset (Tomcat)
    response.setContentType(`${MEDIATYPE_OPDS_AUTHENTICATION_JSON_VALUE};charset=UTF-8`)
    response.status = HttpStatus.UNAUTHORIZED.value
    response.setHeader('WWW-Authenticate', `Basic realm="${DEFAULT_REALM}"`)
    response.setHeader(
      'Link',
      `<${fromCurrentContextPath(request)}/opds/v2/${ROUTE_AUTH}>; rel="${OpdsLinkRel.AUTH}"; type="${MEDIATYPE_OPDS_AUTHENTICATION_JSON_VALUE}"`,
    )
    // with(writer) { write(..); flush() }
    response.send(this.objectMapper.writeValueAsString(this.opdsGenerator.generateOpdsAuthDocument()))
  }
}

// @Component
component(OpdsAuthenticationEntryPoint, { inject: [OpdsGenerator, ObjectMapper] })
