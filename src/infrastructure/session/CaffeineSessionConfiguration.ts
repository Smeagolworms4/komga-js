// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/session/CaffeineSessionConfiguration.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { Duration } from '@js-joda/core'
import { type CaffeineIndexedSessionRepository, ServerProperties, SessionRepositoryCustomizer, enableCaffeineHttpSession } from '../../port/spring-session.js'
import { SessionProperties } from '../../port/spring-session-jdbc.js'
import { type Environment, configuration } from '../../port/spring.js'

// @ConditionalOnProperty(value = ["komga.jdbc-session-enabled"], havingValue = "false", matchIfMissing = true)
const condition = (env: Environment): boolean => {
  const value = env.getProperty('komga.jdbc-session-enabled')
  return value === undefined || value === null || String(value).toLowerCase() === 'false'
}

export class CaffeineSessionConfiguration {
  customizeSessionRepository(sessionProperties: SessionProperties, serverProperties: ServerProperties): SessionRepositoryCustomizer<CaffeineIndexedSessionRepository> {
    return new SessionRepositoryCustomizer<CaffeineIndexedSessionRepository>((repository) => {
      const timeout = sessionProperties.timeout ?? serverProperties.servlet.session.timeout ?? Duration.ofMinutes(30)
      // PORT: Duration.seconds.toInt()
      repository.setDefaultMaxInactiveInterval(timeout.seconds() | 0)
    })
  }
}

// @EnableCaffeineHttpSession
enableCaffeineHttpSession(condition)

// @Configuration
configuration(CaffeineSessionConfiguration, {
  condition,
  beans: [{ method: 'customizeSessionRepository', type: SessionRepositoryCustomizer, condition, inject: [SessionProperties, ServerProperties] }],
})
