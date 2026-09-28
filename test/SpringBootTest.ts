// Support de test : équivalent de @SpringBootTest (profil "test", application-test.yml des ressources de test,
// contexte partagé par fichier de test). Ce fichier n'a pas de jumeau Kotlin.
// Les modules des beans nécessaires doivent être importés par le fichier de test (équivalent du scan de composants).
import '../src/port/spring-boot-flyway.js'
import '../src/infrastructure/configuration/KomgaProperties.js'
import '../src/infrastructure/datasource/DataSourcesConfiguration.js'
import '../src/infrastructure/datasource/FlywaySecondaryMigrationInitializer.js'
import '../src/infrastructure/jooq/KomgaJooqConfiguration.js'
import '../src/port/spring-boot-jackson.js'
import { rmSync } from 'node:fs'
import { ApplicationContext, Environment, type Token } from '../src/port/spring.js'
import { KomgaProperties } from '../src/infrastructure/configuration/KomgaProperties.js'

let shared: ApplicationContext | null = null

/**
 * `mocks` : équivalent de `@MockkBean` / `@SpykBean` : l'instance fournie remplace le bean du type donné.
 * Un contexte avec propriétés ou mocks n'est pas partagé.
 */
export function springBootTest(
  properties: Record<string, unknown> = {},
  mocks: { type: Token; instance: unknown }[] = [],
): ApplicationContext {
  const isDefault = Object.keys(properties).length === 0 && mocks.length === 0
  if (shared && isDefault) return shared
  const env = new Environment({
    resourcesDirs: ['test/resources', 'resources'],
    profiles: ['test'],
    properties,
    buildProperties: { version: 'TESTING', rootDir: process.cwd() },
  })
  const ctx = new ApplicationContext(
    env,
    mocks.map((m) => ({ name: `mock${m.type.name}`, type: m.type, instance: m.instance, primary: true })),
  ).refresh()
  if (isDefault) shared = ctx
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
