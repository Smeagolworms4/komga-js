// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/session/CaffeineSessionConfigurationOracleTest.kt
import { Duration } from '@js-joda/core'
import { CaffeineSessionConfiguration } from '../../../../src/infrastructure/session/CaffeineSessionConfiguration.js'
import type { ApplicationContext } from '../../../../src/port/spring.js'
import { CaffeineIndexedSessionRepository, ServerProperties } from '../../../../src/port/spring-session.js'
import { SessionProperties } from '../../../../src/port/spring-session-jdbc.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/session/CaffeineSessionConfiguration')

const config = new CaffeineSessionConfiguration()

// PORT: SessionProperties et ServerProperties construits depuis l'environnement (ServerProperties : 30m si absent)
function context(sessionTimeout: Duration | null, serverTimeout: Duration | null): ApplicationContext {
  const props: Record<string, string> = {}
  if (sessionTimeout !== null) props['spring.session.timeout'] = `${sessionTimeout.toMillis()}ms`
  if (serverTimeout !== null) props['server.servlet.session.timeout'] = `${serverTimeout.toMillis()}ms`
  return { environment: { getProperty: (k: string, d?: string) => props[k] ?? d ?? undefined } } as unknown as ApplicationContext
}

function repository(sessionTimeout: Duration | null, serverTimeout: Duration | null): unknown {
  const repo = new CaffeineIndexedSessionRepository()
  const ctx = context(sessionTimeout, serverTimeout)
  config.customizeSessionRepository(new SessionProperties(ctx), new ServerProperties(ctx)).customize(repo)
  return repo.createSession().maxInactiveInterval
}

func('customizeSessionRepository', () => {
  kase('default timeout', () => repository(null, null))
  kase('session timeout', () => repository(Duration.ofDays(7), null))
  kase('server timeout', () => repository(null, Duration.ofDays(1)))
  kase('session timeout over server timeout', () => repository(Duration.ofSeconds(90), Duration.ofDays(1)))
  kase('sub-second', () => repository(Duration.ofMillis(1500), null))
})
