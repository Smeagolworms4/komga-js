// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/datasource/FlywaySessionsMigrationInitializer.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { join } from 'node:path'
import { Flyway } from '../../port/flyway.js'
import { resourcesDir } from '../../port/resources.js'
import { component } from '../../port/spring.js'
import { type DataSource, HikariDataSource } from '../../port/sqlite.js'

export class FlywaySessionsMigrationInitializer {
  constructor(private readonly sessionsDataSource: DataSource) {}

  // by default Spring Boot will perform migration only on the @Primary datasource
  afterPropertiesSet(): void {
    new Flyway(this.sessionsDataSource.getConnection(), {
      sqlLocations: [join(resourcesDir(), 'sessions/migration/sqlite')],
    }).migrate()
  }
}

// @ConditionalOnProperty(value = ["komga.jdbc-session-enabled"], havingValue = "true", matchIfMissing = false)
// @Component
component(FlywaySessionsMigrationInitializer, {
  condition: (env) => String(env.getProperty('komga.jdbc-session-enabled') ?? '').toLowerCase() === 'true',
  inject: [{ type: HikariDataSource, qualifier: 'sessionsDataSource' }],
  // PORT: comme dans Spring Boot, les migrations passent avant les beans qui lisent la base
  early: true,
})
