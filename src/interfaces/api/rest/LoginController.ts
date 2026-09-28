// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/LoginController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import type { HttpServletRequest, HttpServletResponse, HttpSession } from '../../../port/servlet.js'
import { CookieSerializer, CookieValue } from '../../../port/spring-session.js'
import { HttpStatus, MediaType, request, response, restController, session } from '../../../port/spring-web.js'

// @RestController
// @RequestMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.USER_SESSION)
export class LoginController {
  constructor(private readonly cookieSerializer: CookieSerializer) {}

  // @Operation(summary = "Set cookie", description = "Forcefully return Set-Cookie header, even if the session is contained in the X-Auth-Token header.")
  // @GetMapping("api/v1/login/set-cookie")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  convertHeaderSessionToCookie(request: HttpServletRequest, response: HttpServletResponse, session: HttpSession): void {
    this.cookieSerializer.writeCookieValue(new CookieValue(request, response, session.id))
  }
}

restController(LoginController, {
  inject: [CookieSerializer],
  javaName: 'org.gotson.komga.interfaces.api.rest.LoginController',
  requestMapping: { produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.USER_SESSION] },
  handlers: {
    convertHeaderSessionToCookie: {
      mapping: { method: 'GET', path: ['api/v1/login/set-cookie'] },
      args: [request(), response(), session()],
      responseStatus: HttpStatus.NO_CONTENT,
      openapi: { operation: { summary: 'Set cookie', description: 'Forcefully return Set-Cookie header, even if the session is contained in the X-Auth-Token header.' } },
    },
  },
})
