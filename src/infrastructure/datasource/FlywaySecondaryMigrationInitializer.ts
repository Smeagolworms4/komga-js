// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/datasource/FlywaySecondaryMigrationInitializer.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { join } from 'node:path'
import { Flyway } from '../../port/flyway.js'
import { resourcesDir } from '../../port/resources.js'
import { component } from '../../port/spring.js'
import { type DataSource, HikariDataSource } from '../../port/sqlite.js'

export class FlywaySecondaryMigrationInitializer {
  constructor(private readonly tasksDataSource: DataSource) {}

  // by default Spring Boot will perform migration only on the @Primary datasource
  afterPropertiesSet(): void {
    new Flyway(this.tasksDataSource.getConnection(), {
      sqlLocations: [join(resourcesDir(), 'tasks/migration/sqlite')],
    }).migrate()
  }
}

component(FlywaySecondaryMigrationInitializer, {
  inject: [{ type: HikariDataSource, qualifier: 'tasksDataSourceRW' }],
  // PORT: comme dans Spring Boot, les migrations passent avant les beans qui lisent la base
  early: true,
})
