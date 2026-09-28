// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/EtagFilterConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { PathContainer, PathPatternParser } from '../../port/path-pattern.js'
import { FilterRegistrationBean, type HttpServletRequest } from '../../port/servlet.js'
import { configuration } from '../../port/spring.js'
import { Ordered } from '../../port/spring-boot-web.js'
import { ShallowEtagHeaderFilter } from '../../port/spring-web-filter.js'

export class EtagFilterConfiguration {
  private readonly excludePatterns = [
    PathPatternParser.defaultInstance.parse('/api/v1/books/*/file/**'),
    PathPatternParser.defaultInstance.parse('/opds/v1.2/books/*/file/**'),
    PathPatternParser.defaultInstance.parse('/api/v1/readlists/*/file/**'),
    PathPatternParser.defaultInstance.parse('/api/v1/series/*/file/**'),
    PathPatternParser.defaultInstance.parse('/kobo/*/v1/books/*/file/**'),
  ]

  shallowEtagHeaderFilter(): FilterRegistrationBean {
    const excludePatterns = this.excludePatterns
    // PORT: FilterRegistrationBean(filter).also { addUrlPatterns(...); setName(...) } -> constructeur (ordre par défaut de RegistrationBean : Ordered.LOWEST_PRECEDENCE)
    return new FilterRegistrationBean(
      new (class extends ShallowEtagHeaderFilter {
        protected override shouldNotFilter(request: HttpServletRequest): boolean {
          const path = PathContainer.parsePath(request.servletPath)
          return excludePatterns.some((it) => it.matches(path))
        }
      })(),
      Ordered.LOWEST_PRECEDENCE,
      ['/api/*', '/opds/*', '/kobo/*'],
      'etagFilter',
    )
  }
}

configuration(EtagFilterConfiguration, {
  beans: [{ method: 'shallowEtagHeaderFilter', type: FilterRegistrationBean }],
})
