// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/DelimitedPairHandlerMethodArgumentResolver.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { isNullOrBlank } from '../../port/kotlin.js'
import type { HttpServletRequest } from '../../port/servlet.js'
import type { HandlerMethodArgumentResolver } from '../../port/spring-web.js'

export class DelimitedPairHandlerMethodArgumentResolver implements HandlerMethodArgumentResolver {
  // PORT: MethodParameter -> nom de l'annotation porté par l'ArgSpec 'custom'
  supportsParameter(parameter: { annotation: string; name: string }): boolean {
    return parameter.annotation === 'DelimitedPair'
  }

  // PORT: (parameter, mavContainer, webRequest, binderFactory) -> (parameterName de l'annotation, requête) ; Pair -> tuple
  resolveArgument(parameterName: string | null, webRequest: HttpServletRequest): [string, string] | null {
    const paramName = parameterName
    if (paramName === null) return null
    const param = webRequest.getParameterValues(paramName)
    if (param === null) return null

    // Single empty parameter, e.g "search="
    if (param.length === 1 && isNullOrBlank(param[0])) return null

    return this.parseParameterIntoPairs(param[0] as string)
  }

  private parseParameterIntoPairs(source: string, delimiter: string = ','): [string, string] | null {
    return !source.includes(delimiter) ? null : [source.substring(0, source.lastIndexOf(delimiter)), source.substring(source.lastIndexOf(delimiter) + delimiter.length)]
  }
}
