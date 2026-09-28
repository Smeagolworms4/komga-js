// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/AuthorsHandlerMethodArgumentResolver.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Author } from '../../domain/model/Author.js'
import { isNullOrBlank } from '../../port/kotlin.js'
import type { HttpServletRequest } from '../../port/servlet.js'
import type { HandlerMethodArgumentResolver } from '../../port/spring-web.js'

export class AuthorsHandlerMethodArgumentResolver implements HandlerMethodArgumentResolver {
  // PORT: MethodParameter -> nom de l'annotation porté par l'ArgSpec 'custom'
  supportsParameter(parameter: { annotation: string; name: string }): boolean {
    return parameter.annotation === 'Authors'
  }

  // PORT: (parameter, mavContainer, webRequest, binderFactory) -> (nom, requête)
  resolveArgument(_name: string, webRequest: HttpServletRequest): Author[] | null {
    const param = webRequest.getParameterValues('author')
    if (param === null) return null

    // Single empty parameter, e.g "author="
    if (param.length === 1 && isNullOrBlank(param[0])) return null

    return this.parseParameterIntoAuthors([...param])
  }

  private parseParameterIntoAuthors(source: string[], delimiter: string = ','): Author[] {
    return source
      .filter((it) => it.includes(delimiter))
      .map((it) => new Author({ name: it.substring(0, it.lastIndexOf(delimiter)), role: it.substring(it.lastIndexOf(delimiter) + delimiter.length) }))
  }
}
