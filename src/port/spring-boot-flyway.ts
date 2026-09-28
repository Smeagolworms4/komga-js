// Support de portage : FlywayAutoConfiguration de Spring Boot, pour la base principale (@Primary DataSource) :
// spring.flyway.locations = classpath:db/migration/{vendor}, mixed = true, spring.flyway.placeholders.*
// Ce fichier n'a pas de jumeau Kotlin.
import { join } from 'node:path'
import { Flyway } from './flyway.js'
import { MAIN_CODE_MIGRATIONS } from './flyway-migrations.js'
import { resourcesDir } from './resources.js'
import { Environment, component } from './spring.js'
import { HikariDataSource } from './sqlite.js'

export class FlywayMigrationInitializer {
  constructor(
    private readonly dataSource: HikariDataSource,
    private readonly environment: Environment,
  ) {}

  afterPropertiesSet(): void {
    if (this.environment.getProperty('spring.flyway.enabled', 'true') !== 'true') return
    const placeholders: Record<string, string> = {}
    for (const k of this.environment.keysUnder('spring.flyway.placeholders'))
      placeholders[k.slice('spring.flyway.placeholders.'.length)] = this.environment.getProperty(k) ?? ''
    // PORT: les clés canoniques perdent les tirets ; Komga utilise library-file-hashing etc.
    const named: Record<string, string> = {
      'library-file-hashing': placeholders.libraryfilehashing ?? 'true',
      'library-scan-startup': placeholders.libraryscanstartup ?? 'false',
      'delete-empty-collections': placeholders.deleteemptycollections ?? 'true',
      'delete-empty-read-lists': placeholders.deleteemptyreadlists ?? 'true',
    }
    new Flyway(this.dataSource.getConnection(), {
      sqlLocations: [join(resourcesDir(), 'db/migration/sqlite')],
      codeMigrations: MAIN_CODE_MIGRATIONS,
      codePackage: 'db.migration.sqlite',
      placeholders: named,
    }).migrate()
  }
}

component(FlywayMigrationInitializer, { name: 'flywayInitializer', inject: [HikariDataSource, Environment], early: true })
