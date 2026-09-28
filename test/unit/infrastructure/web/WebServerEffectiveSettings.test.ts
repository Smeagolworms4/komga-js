// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/WebServerEffectiveSettingsOracleTest.kt
import type { Server } from 'node:http'
import { WebServerEffectiveSettings } from '../../../../src/infrastructure/web/WebServerEffectiveSettings.js'
import { ServletContext, ServletWebServerInitializedEvent, WebServer } from '../../../../src/port/spring-boot-web.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/web/WebServerEffectiveSettings')

// PORT: WebServer simulé (mockk côté Kotlin) : port lu sur l'adresse du serveur
const event = (port: number) => new ServletWebServerInitializedEvent(new WebServer({ address: () => (port < 0 ? null : { port }) } as unknown as Server, false, 0))

func('onApplicationEvent', () => {
  const settings = new WebServerEffectiveSettings(new ServletContext('/komga'))
  kase('before the event', () => [settings.effectiveServerPort, settings.effectiveServletContextPath])
  kase('after the event', () => {
    settings.onApplicationEvent(event(25600))
    return [settings.effectiveServerPort, settings.effectiveServletContextPath]
  })
  kase('second event', () => {
    settings.onApplicationEvent(event(-1))
    return settings.effectiveServerPort
  })
})
