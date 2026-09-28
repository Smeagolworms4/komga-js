// Support de test : équivalent de @SpringBootTest (profil "test", application-test.yml des ressources de test,
// contexte partagé par fichier de test). Ce fichier n'a pas de jumeau Kotlin.
// Les modules des beans nécessaires doivent être importés par le fichier de test (équivalent du scan de composants).
import '../src/port/spring-boot-flyway.js'
import '../src/infrastructure/configuration/KomgaProperties.js'
import '../src/infrastructure/datasource/DataSourcesConfiguration.js'
import '../src/infrastructure/datasource/FlywaySecondaryMigrationInitializer.js'
import '../src/infrastructure/jooq/KomgaJooqConfiguration.js'
import { rmSync } from 'node:fs'
import { ApplicationContext, Environment } from '../src/port/spring.js'
import { KomgaProperties } from '../src/infrastructure/configuration/KomgaProperties.js'

let shared: ApplicationContext | null = null

export function springBootTest(properties: Record<string, unknown> = {}): ApplicationContext {
  if (shared && Object.keys(properties).length === 0) return shared
  const env = new Environment({
    resourcesDirs: ['test/resources', 'resources'],
    profiles: ['test'],
    properties,
    buildProperties: { version: 'TESTING', rootDir: process.cwd() },
  })
  const ctx = new ApplicationContext(env).refresh()
  if (Object.keys(properties).length === 0) shared = ctx
  return ctx
}

/** Fermeture du contexte et suppression des bases temporaires */
export function closeContext(ctx: ApplicationContext): void {
  const props = ctx.getBean(KomgaProperties)
  ctx.close()
  for (const f of [props.database.file, props.tasksDb.file])
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${f}${suffix}`, { force: true })
  if (ctx === shared) shared = null
}
