// Support de portage : org.springframework.boot.ApplicationRunner / ApplicationArguments (DefaultApplicationArguments,
// SimpleCommandLineArgsParser). Les runners sont appelés par le démarrage de l'application après le rafraîchissement du
// contexte, avant ApplicationReadyEvent. Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException } from './kotlin.js'
import type { ApplicationContext, Environment } from './spring.js'

/** `org.springframework.boot.ApplicationArguments` */
export class ApplicationArguments {
  private readonly optionArgs = new Map<string, string[]>()
  private readonly nonOptionArgs: string[] = []

  constructor(readonly sourceArgs: string[]) {
    // SimpleCommandLineArgsParser
    for (const arg of sourceArgs) {
      if (arg.startsWith('--')) {
        const optionText = arg.slice(2)
        const indexOfEqualsSign = optionText.indexOf('=')
        let optionName: string
        let optionValue: string | null = null
        if (indexOfEqualsSign > -1) {
          optionName = optionText.slice(0, indexOfEqualsSign)
          optionValue = optionText.slice(indexOfEqualsSign + 1)
        } else optionName = optionText
        if (optionName.length === 0) throw new IllegalArgumentException(`Invalid argument syntax: ${arg}`)
        const l = this.optionArgs.get(optionName) ?? []
        if (optionValue !== null) l.push(optionValue)
        this.optionArgs.set(optionName, l)
      } else this.nonOptionArgs.push(arg)
    }
  }

  getOptionNames(): Set<string> {
    return new Set(this.optionArgs.keys())
  }

  containsOption(name: string): boolean {
    return this.optionArgs.has(name)
  }

  /** valeurs de l'option (liste vide pour `--name` sans valeur), null si l'option est absente */
  getOptionValues(name: string): string[] | null {
    const l = this.optionArgs.get(name)
    return l === undefined ? null : [...l]
  }

  getNonOptionArgs(): string[] {
    return [...this.nonOptionArgs]
  }
}

/** `org.springframework.boot.ApplicationRunner` */
export abstract class ApplicationRunner {
  abstract run(args: ApplicationArguments): void
}

/** `SpringApplication.callRunners` : appelle les beans ApplicationRunner du contexte */
export function callRunners(context: ApplicationContext, args: ApplicationArguments): void {
  for (const runner of context.getBeansOfType(ApplicationRunner)) runner.run(args)
}

// ---------------------------------------------------------------------------
// SpringApplication.run
// ---------------------------------------------------------------------------

/**
 * `runApplication<Application>(*args)` : environnement (arguments `--clé=valeur`, variables d'environnement,
 * application.yml + imports), scan des composants (tous les modules de `src/`), rafraîchissement du contexte
 * (migrations Flyway en premier), serveur web, ApplicationRunner, puis ApplicationReadyEvent.
 * Arrêt propre sur SIGINT/SIGTERM (server.shutdown=graceful).
 */
export async function runApplication(argv: string[]): Promise<ApplicationContext> {
  const { ApplicationContext, ApplicationReadyEvent } = await import('./spring.js')
  const { startWebServer } = await import('./spring-boot-web.js')
  const { KotlinLogging } = await import('./logging.js')
  const { TaskWorkerBridge, taskWorkerEnabled } = await import('./task-worker.js')
  const logger = KotlinLogging.logger('org.gotson.komga.Application')
  const started = Date.now()

  const args = new ApplicationArguments(argv)
  const environment = await createEnvironment(argv)

  // scan des composants : l'équivalent de @SpringBootApplication + auto-configuration
  await scanComponents()

  // PORT: les tâches (TaskProcessor) s'exécutent dans un worker_thread avec son propre contexte, comme les threads du
  // pool de tâches de Komga, pour que le serveur HTTP reste disponible pendant un scan (port/task-worker.ts)
  const bridge = taskWorkerEnabled(environment) ? new TaskWorkerBridge(argv) : null
  const ctx = new ApplicationContext(environment, [], bridge?.threading ?? null)
  ctx.refresh()
  bridge?.start(ctx)
  const webServer = await startWebServer(ctx)
  callRunners(ctx, args)
  ctx.publishEvent(new ApplicationReadyEvent())
  logger.info(() => `Started Application in ${((Date.now() - started) / 1000).toFixed(3)} seconds`)

  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await webServer.stop()
    await bridge?.stop()
    ctx.close()
    process.exit(0)
  }
  process.once('SIGINT', () => void stop())
  process.once('SIGTERM', () => void stop())
  return ctx
}

/**
 * Environnement de l'application : arguments `--clé=valeur`, variables d'environnement, application.yml et ses imports,
 * version de Komga portée (package.json à la racine du projet, depuis src/ ou dist/src/)
 */
export async function createEnvironment(argv: string[]): Promise<Environment> {
  const { readFileSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const { Environment } = await import('./spring.js')
  const { resourcesDir } = await import('./resources.js')
  const args = new ApplicationArguments(argv)
  const properties: Record<string, string> = {}
  for (const name of args.getOptionNames()) properties[name] = (args.getOptionValues(name) ?? []).join(',')
  const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  let version = 'unknown'
  let projectRoot = join(srcRoot, '..')
  for (const candidate of [join(srcRoot, '..'), join(srcRoot, '..', '..')]) {
    try {
      version = (JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8')) as { version: string }).version
      projectRoot = candidate
      break
    } catch {
      // essai suivant
    }
  }
  return new Environment({
    resourcesDirs: [resourcesDir()],
    properties: nestProperties(properties),
    buildProperties: { version, rootDir: projectRoot },
  })
}

/**
 * Scan des composants : import de tous les modules de `src/` (hors migrations et point d'entrée), dont les appels
 * `component(...)` enregistrent les définitions de beans. `include` restreint le scan (chemins relatifs à `src/`).
 * Les modules sont enregistrés pour le passage de valeurs entre threads (port/thread-codec.ts).
 */
export async function scanComponents(include: (relativePath: string) => boolean = () => true): Promise<void> {
  const { readdirSync, statSync } = await import('node:fs')
  const { dirname, join, relative } = await import('node:path')
  const { fileURLToPath, pathToFileURL } = await import('node:url')
  const { registerModule } = await import('./thread-codec.js')
  const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const ext = import.meta.url.endsWith('.ts') ? '.ts' : '.js'
  const modules: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const f = join(dir, name)
      if (statSync(f).isDirectory()) {
        if (dir === srcRoot && name === 'flyway') continue
        walk(f)
      } else if (name.endsWith(ext) && !name.endsWith('.d.ts') && !entryPoints.includes(relative(srcRoot, f))) modules.push(f)
    }
  }
  // points d'entrée (thread principal, worker des tâches) : pas des composants
  const entryPoints = [`main${ext}`, join('port', `task-worker-thread${ext}`)]
  walk(srcRoot)
  for (const f of modules) {
    const rel = relative(srcRoot, f).slice(0, -ext.length)
    if (!include(rel)) continue
    registerModule(rel, (await import(pathToFileURL(f).href)) as Record<string, unknown>)
  }
}

/** `--komga.config-dir=/x` -> { komga: { 'config-dir': '/x' } } pour l'Environment */
function nestProperties(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.')
    let o = out
    for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>
    o[parts[parts.length - 1] as string] = v
  }
  return out
}
