// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/session/JdbcSessionConfiguration.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { Duration } from '@js-joda/core'
import { type JdbcIndexedSessionRepository, SessionProperties, enableJdbcHttpSession } from '../../port/spring-session-jdbc.js'
import { ServerProperties, SessionRepositoryCustomizer } from '../../port/spring-session.js'
import { type Environment, configuration } from '../../port/spring.js'

// @ConditionalOnProperty(value = ["komga.jdbc-session-enabled"], havingValue = "true", matchIfMissing = false)
const condition = (env: Environment): boolean => String(env.getProperty('komga.jdbc-session-enabled') ?? '').toLowerCase() === 'true'

export class JdbcSessionConfiguration {
  //language=sqlite
  private readonly sqliteCreateSessionQuery = `INSERT INTO %TABLE_NAME% (PRIMARY_ID, SESSION_ID, CREATION_TIME, LAST_ACCESS_TIME, MAX_INACTIVE_INTERVAL, EXPIRY_TIME, PRINCIPAL_NAME)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(PRIMARY_ID) DO UPDATE SET
    SESSION_ID = excluded.SESSION_ID,
    LAST_ACCESS_TIME = excluded.LAST_ACCESS_TIME,
    MAX_INACTIVE_INTERVAL = excluded.MAX_INACTIVE_INTERVAL,
    EXPIRY_TIME = excluded.EXPIRY_TIME,
    PRINCIPAL_NAME = excluded.PRINCIPAL_NAME`

  //language=sqlite
  private readonly sqliteCreateSessionAttributeQuery = `INSERT INTO %TABLE_NAME%_ATTRIBUTES (SESSION_PRIMARY_ID, ATTRIBUTE_NAME, ATTRIBUTE_BYTES)
VALUES (?, ?, ?)
ON CONFLICT(SESSION_PRIMARY_ID, ATTRIBUTE_NAME) DO UPDATE SET
    ATTRIBUTE_BYTES = excluded.ATTRIBUTE_BYTES`

  customizeSessionRepository(sessionProperties: SessionProperties, serverProperties: ServerProperties): SessionRepositoryCustomizer<JdbcIndexedSessionRepository> {
    return new SessionRepositoryCustomizer<JdbcIndexedSessionRepository>((repository) => {
      repository.setCreateSessionQuery(this.sqliteCreateSessionQuery)
      repository.setCreateSessionAttributeQuery(this.sqliteCreateSessionAttributeQuery)

      const timeout = sessionProperties.timeout ?? serverProperties.servlet.session.timeout ?? Duration.ofMinutes(30)
      repository.setDefaultMaxInactiveInterval(timeout)
    })
  }
}

// @EnableJdbcHttpSession
enableJdbcHttpSession(condition)

// @Configuration
configuration(JdbcSessionConfiguration, {
  condition,
  beans: [{ method: 'customizeSessionRepository', type: SessionRepositoryCustomizer, condition, inject: [SessionProperties, ServerProperties] }],
})
