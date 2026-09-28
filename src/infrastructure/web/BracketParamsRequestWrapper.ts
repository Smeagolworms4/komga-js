// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/BracketParamsRequestWrapper.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { distinct, groupBy } from '../../port/kotlin.js'
import type { HttpServletRequest } from '../../port/servlet.js'
import { HttpServletRequestWrapper } from '../../port/servlet-wrapper.js'

export class BracketParamsRequestWrapper extends HttpServletRequestWrapper {
  constructor(request: HttpServletRequest) {
    super(request)
  }

  override getParameter(name: string): string | null {
    const nameWithoutSuffix = removeSuffix(name, '[]')
    const values = [super.getParameter(nameWithoutSuffix), super.getParameter(`${nameWithoutSuffix}[]`)].filter((it): it is string => it !== null)
    return values.length === 0 ? null : values.join(',')
  }

  override getParameterValues(name: string): string[] | null {
    const nameWithoutSuffix = removeSuffix(name, '[]')
    const regular = super.getParameterValues(nameWithoutSuffix)
    const suffix = super.getParameterValues(`${nameWithoutSuffix}[]`)
    const values = [regular, suffix].filter((it): it is string[] => it !== null)
    return values.length === 0 ? null : values.reduce((acc, strings) => [...acc, ...strings])
  }

  // PORT: Enumeration<String> -> liste
  override getParameterNames(): string[] {
    return distinct(super.getParameterNames().map((it) => removeSuffix(it, '[]')))
  }

  // PORT: MutableMap<String, Array<String>> -> Map<string, string[]>
  override getParameterMap(): Map<string, string[]> {
    const grouped = groupBy([...super.getParameterMap()], (it) => removeSuffix(it[0], '[]'))
    return new Map([...grouped].map(([k, v]) => [k, v.map((it) => it[1]).reduce((acc, strings) => [...acc, ...strings])]))
  }
}

// PORT: String.removeSuffix de Kotlin
function removeSuffix(s: string, suffix: string): string {
  return s.endsWith(suffix) ? s.slice(0, s.length - suffix.length) : s
}
