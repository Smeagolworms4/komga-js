// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/mvc/ResourceNotFoundController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { HttpServletRequest } from '../../port/servlet.js'
import { HttpStatus, ResponseStatusException, controllerAdvice, request } from '../../port/spring-web.js'
import { NoHandlerFoundException } from '../../port/spring-web-dispatcher.js'

export class ResourceNotFoundController {
  readonly apis = ['/api', '/opds', '/sse']

  // @ExceptionHandler(NoHandlerFoundException::class)
  notFound(request: HttpServletRequest): string {
    // PORT: startsWith(it, ignoreCase = true)
    if (this.apis.some((it) => request.requestURI.toLowerCase().startsWith(it.toLowerCase()))) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    return 'forward:/'
  }
}

// @Component @ControllerAdvice
controllerAdvice(ResourceNotFoundController, {
  rest: false,
  exceptionHandlers: { notFound: { exceptions: [NoHandlerFoundException], args: [request()] } },
})
