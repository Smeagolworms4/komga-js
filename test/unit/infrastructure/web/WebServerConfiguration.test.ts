// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/WebServerConfigurationOracleTest.kt
import { KomgaSettingsProvider } from '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { WebServerConfiguration } from '../../../../src/infrastructure/web/WebServerConfiguration.js'
import { ApplicationEventPublisher, type Environment } from '../../../../src/port/spring.js'
import { ConfigurableServletWebServerFactory } from '../../../../src/port/spring-boot-web.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/web/WebServerConfiguration')

const db = new OracleDb()
const settings = new KomgaSettingsProvider(db.serverSettingsDao, new (class extends ApplicationEventPublisher {
  publishEvent(): void {}
})())

// PORT: TomcatServletWebServerFactory() sans propriétés : port 8080, context path ""
const emptyEnvironment = { getProperty: (_k: string, d?: string) => d ?? null } as unknown as Environment

function customize(port: number | null, contextPath: string | null): unknown[] {
  settings.serverPort = port
  settings.serverContextPath = contextPath
  const factory = new ConfigurableServletWebServerFactory(emptyEnvironment)
  new WebServerConfiguration(settings).customize(factory)
  return [factory.port, factory.contextPath]
}

func('customize', () => {
  kase('nothing set', () => customize(null, null))
  kase('port 25600', () => customize(25600, null))
  kase('port 2', () => customize(2, null))
  kase('port 1 ignored', () => customize(1, null))
  kase('port 0 ignored', () => customize(0, null))
  kase('negative port ignored', () => customize(-8080, null))
  kase('context path', () => customize(null, '/komga'))
  kase('nested context path', () => customize(null, '/a/b'))
  kase('context path without leading slash ignored', () => customize(null, 'komga'))
  kase('context path with trailing slash ignored', () => customize(null, '/komga/'))
  kase('root context path ignored', () => customize(null, '/'))
  kase('empty context path ignored', () => customize(null, ''))
  kase('both', () => customize(8081, '/k'))
})
