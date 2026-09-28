// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/KoboMissingPortFilterConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaSettingsProvider } from '../configuration/KomgaSettingsProvider.js'
import { FilterRegistrationBean } from '../../port/servlet.js'
import { type ApplicationContext, configuration } from '../../port/spring.js'
import { Ordered } from '../../port/spring-boot-web.js'
import { KoboMissingPortFilter } from './KoboMissingPortFilter.js'
import { WebServerEffectiveSettings } from './WebServerEffectiveSettings.js'

export class KoboMissingPortFilterConfiguration {
  constructor(
    private readonly komgaSettingsProvider: KomgaSettingsProvider,
    private readonly serverSettings: WebServerEffectiveSettings,
    private readonly forwardedHeaderFilter: FilterRegistrationBean | null,
  ) {}

  koboMissingPortFilter(): FilterRegistrationBean {
    // PORT: FilterRegistrationBean(filter).apply { addUrlPatterns(...); setName(...); order = ... } -> constructeur
    return new FilterRegistrationBean(
      new KoboMissingPortFilter(() => this.komgaSettingsProvider.koboPort ?? this.serverSettings.effectiveServerPort),
      Ordered.HIGHEST_PRECEDENCE,
      ['/kobo/*'],
      'koboMissingPortFilter',
    )
  }

  // @PostConstruct
  adjustForwardHeaderFilterOrder(): void {
    // the ForwardHeaderFilter must be after the KoboMissingPortFilter, as the latter's detection is based on forwarded headers
    // that the former will remove
    // PORT: FilterRegistrationBean.order est en lecture seule dans port/servlet.ts
    if (this.forwardedHeaderFilter !== null) (this.forwardedHeaderFilter as { order: number }).order = Ordered.HIGHEST_PRECEDENCE + 1
  }
}

configuration(KoboMissingPortFilterConfiguration, {
  inject: [
    KomgaSettingsProvider,
    WebServerEffectiveSettings,
    // PORT: FilterRegistrationBean<ForwardedHeaderFilter>? -> bean nommé forwardedHeaderFilter s'il existe
    { expression: (ctx: ApplicationContext) => { try { return ctx.getBean<FilterRegistrationBean>('forwardedHeaderFilter') } catch { return null } } },
  ],
  postConstruct: ['adjustForwardHeaderFilterOrder'],
  beans: [{ method: 'koboMissingPortFilter', type: FilterRegistrationBean }],
})
