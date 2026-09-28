// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/RequestLoggingFilterConfig.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { configuration } from '../../port/spring.js'
import { CommonsRequestLoggingFilter } from '../../port/spring-web-filter.js'

export class RequestLoggingFilterConfig {
  logFilter(): CommonsRequestLoggingFilter {
    const it = new CommonsRequestLoggingFilter()
    it.setIncludeQueryString(true)
    it.setIncludePayload(true)
    it.setMaxPayloadLength(10000)
    it.setIncludeHeaders(true)
    it.setAfterMessagePrefix('REQUEST DATA: ')
    return it
  }
}

configuration(RequestLoggingFilterConfig, {
  beans: [
    {
      method: 'logFilter',
      type: CommonsRequestLoggingFilter,
      // @ConditionalOnProperty(value = ["logging.level.org.springframework.web.filter.CommonsRequestLoggingFilter"], havingValue = "debug")
      condition: (env) => (env.getProperty('logging.level.org.springframework.web.filter.CommonsRequestLoggingFilter') ?? '').toLowerCase() === 'debug',
    },
  ],
})
