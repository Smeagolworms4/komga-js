// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/WebServerEffectiveSettings.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { component } from '../../port/spring.js'
import { ServletContext, ServletWebServerInitializedEvent } from '../../port/spring-boot-web.js'

export class WebServerEffectiveSettings {
  effectiveServerPort: number | null = null
  readonly effectiveServletContextPath: string

  constructor(servletContext: ServletContext) {
    this.effectiveServletContextPath = servletContext.contextPath
  }

  // @EventListener
  onApplicationEvent(event: ServletWebServerInitializedEvent): void {
    this.effectiveServerPort = event.webServer.port
  }
}

component(WebServerEffectiveSettings, {
  inject: [ServletContext],
  eventListeners: [{ method: 'onApplicationEvent', events: [ServletWebServerInitializedEvent] }],
})
