// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/KoboMissingPortFilterConfigurationOracleTest.kt
import { KomgaSettingsProvider } from '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { KoboMissingPortFilterConfiguration } from '../../../../src/infrastructure/web/KoboMissingPortFilterConfiguration.js'
import { WebServerEffectiveSettings } from '../../../../src/infrastructure/web/WebServerEffectiveSettings.js'
import { FilterRegistrationBean, type HttpServletRequest } from '../../../../src/port/servlet.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { Ordered, ServletContext } from '../../../../src/port/spring-boot-web.js'
import { ForwardedHeaderFilter } from '../../../../src/port/spring-web-filter.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { request, response } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/KoboMissingPortFilterConfiguration')

const db = new OracleDb()
const settings = new KomgaSettingsProvider(db.serverSettingsDao, new (class extends ApplicationEventPublisher {
  publishEvent(): void {}
})())
const serverSettings = new WebServerEffectiveSettings(new ServletContext(''))
const forwarded = new FilterRegistrationBean(new ForwardedHeaderFilter(), Ordered.HIGHEST_PRECEDENCE)

async function port(): Promise<unknown> {
  const bean = new KoboMissingPortFilterConfiguration(settings, serverSettings, null).koboMissingPortFilter()
  const seen: number[] = []
  await bean.filter.doFilter(request({ uri: '/kobo/k', port: 8080 }), response(), {
    async doFilter(r: HttpServletRequest) {
      seen.push(r.serverPort)
    },
  })
  return seen
}

func('koboMissingPortFilter', () => {
  const bean = new KoboMissingPortFilterConfiguration(settings, serverSettings, null).koboMissingPortFilter()
  kase('url patterns', () => bean.urlPatterns)
  kase('name', () => bean.name)
  kase('order', () => bean.order)
  kase('filter class', () => bean.filter.constructor.name)
  kase('no kobo port, no effective port', () => port())
  kase('effective port', () => {
    serverSettings.effectiveServerPort = 25600
    return port()
  })
  kase('kobo port wins', () => {
    settings.koboPort = 443
    return port()
  })
  kase('kobo port removed', () => {
    settings.koboPort = null
    return port()
  })
})

func('adjustForwardHeaderFilterOrder', () => {
  kase('forwarded header filter moved after', () => {
    new KoboMissingPortFilterConfiguration(settings, serverSettings, forwarded).adjustForwardHeaderFilterOrder()
    return forwarded.order
  })
  kase('no forwarded header filter', () => new KoboMissingPortFilterConfiguration(settings, serverSettings, null).adjustForwardHeaderFilterOrder())
})
