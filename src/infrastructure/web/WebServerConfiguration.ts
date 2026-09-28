// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/WebServerConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaSettingsProvider } from '../configuration/KomgaSettingsProvider.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'
import { type ConfigurableServletWebServerFactory, WebServerFactoryCustomizer } from '../../port/spring-boot-web.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.web.WebServerConfiguration')

export class WebServerConfiguration extends WebServerFactoryCustomizer {
  constructor(private readonly settingsProvider: KomgaSettingsProvider) {
    super()
  }

  override customize(factory: ConfigurableServletWebServerFactory): void {
    const port = this.settingsProvider.serverPort
    if (port !== null) {
      if (port > 1) factory.setPort(port)
      else logger.warn(() => `Ignoring invalid server port: ${port}`)
    }
    const contextPath = this.settingsProvider.serverContextPath
    if (contextPath !== null) {
      if (contextPath.startsWith('/') && !contextPath.endsWith('/')) factory.setContextPath(contextPath)
      else logger.warn(() => `Ignoring invalid server context path: ${contextPath}`)
    }
  }
}

component(WebServerConfiguration, { inject: [KomgaSettingsProvider] })
