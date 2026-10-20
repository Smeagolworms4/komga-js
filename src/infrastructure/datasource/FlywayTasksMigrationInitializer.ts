// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/datasource/FlywayTasksMigrationInitializer.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { join } from 'node:path'
import { Flyway } from '../../port/flyway.js'
import { resourcesDir } from '../../port/resources.js'
import { component } from '../../port/spring.js'
import { type DataSource, HikariDataSource } from '../../port/sqlite.js'

export class FlywayTasksMigrationInitializer {
  constructor(private readonly tasksDataSource: DataSource) {}

  // by default Spring Boot will perform migration only on the @Primary datasource
  afterPropertiesSet(): void {
    new Flyway(this.tasksDataSource.getConnection(), {
      sqlLocations: [join(resourcesDir(), 'tasks/migration/sqlite')],
    }).migrate()
  }
}

component(FlywayTasksMigrationInitializer, {
  inject: [{ type: HikariDataSource, qualifier: 'tasksDataSourceRW' }],
  // PORT: comme dans Spring Boot, les migrations passent avant les beans qui lisent la base
  early: true,
})
