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
import { spykLazy } from './support/mockk.js'

let shared: ApplicationContext | null = null

/**
 * `mocks` : équivalent de `@MockkBean` / `@SpykBean` : l'instance fournie remplace le bean du type donné.
 * `{ type, spyk: true }` (`@SpykBean`) : espion (test/support/mockk.ts) du vrai bean, injecté à sa place ;
 * `ctx.getBean(type)` renvoie l'espion.
 * `options.profiles` : équivalent de `@ActiveProfiles(..)` (défaut : ["test"]).
 * Un contexte avec propriétés, mocks ou profils n'est pas partagé.
 */
export function springBootTest(
  properties: Record<string, unknown> = {},
  mocks: ({ type: Token; instance: unknown } | { type: Token; spyk: true })[] = [],
  options: { profiles?: string[] } = {},
): ApplicationContext {
  const isDefault = Object.keys(properties).length === 0 && mocks.length === 0 && options.profiles === undefined
  if (shared && isDefault) return shared
  const env = new Environment({
    resourcesDirs: ['test/resources', 'resources'],
    profiles: options.profiles ?? ['test'],
    properties,
    buildProperties: { version: 'TESTING', rootDir: process.cwd() },
  })
  let ctxRef: ApplicationContext | null = null
  const extra = mocks.map((m) => {
    if ('spyk' in m) {
      const spy: object = spykLazy(
        () => (ctxRef as ApplicationContext).getBeansOfType(m.type).find((b) => b !== spy) as object,
        { name: `#spyk<${m.type.name}>`, prototype: m.type.prototype as object },
      )
      return { name: `spyk${m.type.name}`, type: m.type, instance: spy, primary: true }
    }
    return { name: `mock${m.type.name}`, type: m.type, instance: m.instance, primary: true }
  })
  const ctx = new ApplicationContext(env, extra)
  ctxRef = ctx
  // Spring Boot : les DSLContext dépendent de l'initialisation des bases (JooqDependsOnDatabaseInitializationDetector) :
  // les migrations Flyway passent avant tout bean qui lit la base dans son constructeur (ex. KomgaSettingsProvider)
  for (const n of ['flywayInitializer', 'flywaySecondaryMigrationInitializer']) ctx.getBean(n)
  ctx.refresh()
  if (isDefault) shared = ctx
  return ctx
}

/**
 * Fermeture du contexte (après la fin des tâches en cours des exécuteurs, voir
 * `ApplicationContext.closeAndAwaitTermination`) et suppression des bases temporaires
 */
export async function closeContext(ctx: ApplicationContext): Promise<void> {
  const props = ctx.getBean(KomgaProperties)
  await ctx.closeAndAwaitTermination()
  for (const f of [props.database.file, props.tasksDb.file])
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${f}${suffix}`, { force: true })
  if (ctx === shared) shared = null
}
