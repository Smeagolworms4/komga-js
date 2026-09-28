// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/BracketParamsFilterConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type FilterChain, FilterRegistrationBean, type HttpServletRequest, type HttpServletResponse, type Filter } from '../../port/servlet.js'
import { configuration } from '../../port/spring.js'
import { BracketParamsRequestWrapper } from './BracketParamsRequestWrapper.js'

export class BracketParamsFilterConfiguration {
  bracketParamsFilter(): FilterRegistrationBean {
    // PORT: FilterRegistrationBean(filter).also { addUrlPatterns(...); setName(...) } -> constructeur (ordre par défaut : 0)
    return new FilterRegistrationBean(new BracketParamsFilterConfiguration.BracketParamsFilter(), 0, ['/api/*'], 'queryParamsFilter')
  }
}

export namespace BracketParamsFilterConfiguration {
  export class BracketParamsFilter implements Filter {
    async doFilter(request: HttpServletRequest | null, response: HttpServletResponse | null, chain: FilterChain | null): Promise<void> {
      await chain?.doFilter(new BracketParamsRequestWrapper(request as HttpServletRequest), response as HttpServletResponse)
    }
  }
}

configuration(BracketParamsFilterConfiguration, {
  beans: [{ method: 'bracketParamsFilter', type: FilterRegistrationBean }],
})
