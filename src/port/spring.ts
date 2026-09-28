// Support de portage : sous-ensemble du conteneur Spring (Spring Boot 3.5) utilisé par Komga.
// - Environment : application.yml + application-<profil>.yml + variables d'environnement + arguments,
//   placeholders ${clé:défaut}, ${random.uuid}, liaison souple (kebab-case, camelCase, KOMGA_DATABASE_FILE)
// - @Component / @Configuration + @Bean, injection par type, @Qualifier, @Primary, @Value, @ConfigurationProperties
// - cycle de vie : @PostConstruct, InitializingBean.afterPropertiesSet, DisposableBean.destroy
// Les annotations Kotlin sont traduites en appels d'enregistrement en fin de fichier jumeau.
// Ce fichier n'a pas de jumeau Kotlin.
import { Duration } from '@js-joda/core'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { parse as parseYaml } from 'yaml'
import { IllegalArgumentException, IllegalStateException, KEnum } from './kotlin.js'

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Forme canonique d'une clé de propriété (liaison souple de Spring Boot) */
export function canonicalKey(key: string): string {
  return key
    .split('.')
    .map((p) => p.replace(/[-_]/g, '').toLowerCase())
    .join('.')
}

function flatten(obj: unknown, prefix: string, out: Map<string, unknown>): void {
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  } else if (Array.isArray(obj)) {
    out.set(canonicalKey(prefix), obj)
    obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out))
  } else out.set(canonicalKey(prefix), obj)
}

export type EnvironmentOptions = {
  /** Répertoires de ressources (classpath), par ordre de priorité, contenant application*.yml */
  resourcesDirs?: string[]
  profiles?: string[]
  /** Propriétés prioritaires (arguments --clé=valeur, propriétés de test) */
  properties?: Record<string, unknown>
  env?: NodeJS.ProcessEnv
  /** Valeurs substituées par le build Gradle (processResources) */
  buildProperties?: Record<string, string>
}

export class Environment {
  private readonly sources: Map<string, unknown>[] = []
  readonly activeProfiles: string[]

  constructor(opts: EnvironmentOptions = {}) {
    const env = opts.env ?? process.env
    this.activeProfiles = opts.profiles ?? (env.SPRING_PROFILES_ACTIVE ? env.SPRING_PROFILES_ACTIVE.split(',').map((s) => s.trim()) : [])
    // 1. propriétés explicites
    const explicit = new Map<string, unknown>()
    flatten(opts.properties ?? {}, '', explicit)
    this.sources.push(explicit)
    // 2. variables d'environnement : SystemEnvironmentPropertyMapper de Spring Boot. Une propriété
    // komga.cors.allowed-origins est cherchée sous KOMGA_CORS_ALLOWEDORIGINS puis, forme historique, KOMGA_CORS_ALLOWED_ORIGINS
    this.env = new Map(Object.entries(env).map(([k, v]) => [k.toUpperCase(), v]))
    // 3. propriétés système Java utilisées par Komga
    this.sources.push(
      new Map<string, unknown>([
        ['user.home', homedir()],
        ['java.io.tmpdir', tmpdir()],
      ]),
    )
    // 4. application-<profil>.yml puis application.yml
    const dirs = opts.resourcesDirs ?? []
    for (const p of [...this.activeProfiles].reverse()) for (const dir of dirs) this.loadYaml(`${dir}/application-${p}.yml`, opts.buildProperties)
    for (const dir of dirs) this.loadYaml(`${dir}/application.yml`, opts.buildProperties)
    // 5. spring.config.import (ex. "optional:file:${komga.config-dir}/application.yml") : priorité au-dessus du
    // fichier qui importe, sous les variables d'environnement et les arguments
    this.processConfigImports()
  }

  private processConfigImports(): void {
    const raw = this.raw('spring.config.import')
    const entries = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw.map(String) : String(raw).split(',')
    const imported: Map<string, unknown>[] = []
    for (const entry of entries) {
      let spec = this.resolvePlaceholders(entry.trim())
      const optional = spec.startsWith('optional:')
      if (optional) spec = spec.slice('optional:'.length)
      if (spec.startsWith('file:')) spec = spec.slice('file:'.length)
      if (!existsSync(spec)) {
        if (optional) continue
        throw new IllegalStateException(`Config data resource '${spec}' does not exist`)
      }
      const m = new Map<string, unknown>()
      const text = readFileSync(spec, 'utf8')
      if (spec.endsWith('.properties')) {
        for (const line of text.split(/\r?\n/)) {
          const l = line.trim()
          if (!l || l.startsWith('#') || l.startsWith('!')) continue
          const i = l.search(/[=:]/)
          if (i < 0) m.set(canonicalKey(l), '')
          else m.set(canonicalKey(l.slice(0, i).trim()), l.slice(i + 1).trim())
        }
      } else flatten(parseYaml(text) ?? {}, '', m)
      imported.push(m)
    }
    // le dernier import l'emporte sur les précédents
    this.sources.splice(1, 0, ...imported.reverse())
  }

  private loadYaml(path: string, build: Record<string, string> = {}): void {
    if (!existsSync(path)) return
    // traitement Gradle processResources : ${version} substitué, \${...} laissé à Spring
    let text = readFileSync(path, 'utf8').replace(/(?<!\\)\$\{(\w+)\}/g, (m, k: string) => build[k] ?? m)
    text = text.replaceAll('\\${', '${')
    const m = new Map<string, unknown>()
    flatten(parseYaml(text) ?? {}, '', m)
    this.sources.push(m)
  }

  private readonly env: Map<string, unknown>

  private raw(key: string): unknown {
    const k = canonicalKey(key)
    // priorité : propriétés explicites, puis environnement, puis le reste
    const [explicit, ...rest] = this.sources
    if (explicit?.has(k)) return explicit.get(k)
    for (const envName of [key.toUpperCase().replaceAll('-', '').replaceAll('.', '_'), key.toUpperCase().replaceAll('-', '_').replaceAll('.', '_')])
      if (this.env.has(envName)) return this.env.get(envName)
    for (const s of rest) if (s.has(k)) return s.get(k)
    return undefined
  }

  containsProperty(key: string): boolean {
    return this.raw(key) !== undefined
  }

  /** `getProperty(key)` avec résolution des placeholders */
  getProperty(key: string): string | null
  getProperty(key: string, defaultValue: string): string
  getProperty(key: string, defaultValue?: string): string | null {
    const v = this.raw(key)
    if (v === undefined || v === null) return defaultValue ?? null
    if (Array.isArray(v)) return v.map((x) => this.resolvePlaceholders(String(x))).join(',')
    return this.resolvePlaceholders(String(v))
  }

  /** Clés (canoniques) commençant par `prefix.` */
  keysUnder(prefix: string): string[] {
    const p = `${canonicalKey(prefix)}.`
    const keys = new Set<string>()
    // éléments indexés d'une liste (`prefix[0]`) inclus, comme le Binder de Spring Boot
    const indexed = `${canonicalKey(prefix)}[`
    for (const s of this.sources) for (const k of s.keys()) if (k.startsWith(p) || k.startsWith(indexed)) keys.add(k)
    const envPrefix = prefix.toUpperCase().replaceAll('-', '').replaceAll('.', '_') + '_'
    for (const k of this.env.keys()) if (k.startsWith(envPrefix)) keys.add(canonicalKey(k.replaceAll('_', '.')))
    return [...keys]
  }

  /** `${clé:défaut}` (imbriqués), `${random.uuid}` */
  resolvePlaceholders(text: string, seen: Set<string> = new Set()): string {
    let out = ''
    let i = 0
    while (i < text.length) {
      const start = text.indexOf('${', i)
      if (start < 0) {
        out += text.slice(i)
        break
      }
      out += text.slice(i, start)
      // accolade fermante correspondante
      let depth = 0
      let end = start
      for (let j = start; j < text.length; j++) {
        if (text.startsWith('${', j)) {
          depth++
          j++
        } else if (text[j] === '}') {
          depth--
          if (depth === 0) {
            end = j
            break
          }
        }
      }
      if (depth !== 0) {
        out += text.slice(start)
        break
      }
      const inner = text.slice(start + 2, end)
      const sep = inner.indexOf(':')
      const key = sep < 0 ? inner : inner.slice(0, sep)
      const def = sep < 0 ? null : inner.slice(sep + 1)
      let value: string | null
      if (key === 'random.uuid') value = randomUUID()
      else {
        if (seen.has(key)) throw new IllegalArgumentException(`Circular placeholder reference '${key}' in property definitions`)
        const r = this.raw(key)
        value = r === undefined || r === null ? null : this.resolvePlaceholders(String(r), new Set([...seen, key]))
      }
      if (value === null) {
        if (def === null) throw new IllegalArgumentException(`Could not resolve placeholder '${key}' in value "${text}"`)
        value = this.resolvePlaceholders(def, seen)
      }
      out += value
      i = end + 1
    }
    return out
  }

  /**
   * `@ConfigurationProperties(prefix)` : affecte les propriétés trouvées aux champs de `target`
   * (objets imbriqués, listes, maps). Le type cible est déduit de la valeur par défaut du champ,
   * ou de `types` (chemin camelCase -> convertisseur) quand elle est nulle.
   */
  bind(prefix: string, target: object, types: Record<string, Converter> = {}): void {
    const keys = this.keysUnder(prefix)
    const bindObject = (obj: Record<string, unknown>, path: string, fieldPath: string) => {
      for (const field of Object.keys(obj)) {
        const key = `${path}.${canonicalKey(field)}`
        const fp = fieldPath ? `${fieldPath}.${field}` : field
        const current = obj[field]
        const conv = types[fp]
        if (current !== null && typeof current === 'object' && !(current instanceof Duration) && !(current instanceof KEnum) && !Array.isArray(current) && !(current instanceof Map) && !conv) {
          bindObject(current as Record<string, unknown>, key, fp)
          continue
        }
        const sub = keys.filter((k) => k === key || k.startsWith(`${key}.`) || k.startsWith(`${key}[`))
        if (sub.length === 0) continue
        if (current instanceof Map || conv === 'map') {
          const m = new Map<string, string>()
          for (const k of sub) if (k.startsWith(`${key}.`)) m.set(k.slice(key.length + 1), this.getProperty(k) ?? '')
          obj[field] = m
          continue
        }
        const raw = this.getProperty(key)
        if (raw === null) {
          // liste en notation [i]
          const items = sub
            .filter((k) => /^\[\d+\]$/.test(k.slice(key.length)))
            .map((k) => this.getProperty(k) as string)
          if (items.length) obj[field] = items
          continue
        }
        obj[field] = convert(raw, current, conv)
      }
    }
    bindObject(target as Record<string, unknown>, canonicalKey(prefix), '')
  }
}

export type Converter = 'string' | 'int' | 'boolean' | 'list' | 'map' | { duration: 'SECONDS' | 'MILLIS' } | { enum: { valueOf(s: string): unknown } }

/** Durée Spring Boot : "10s", "PT10S", ou nombre dans l'unité par défaut */
export function parseSpringDuration(v: string, defaultUnit: 'SECONDS' | 'MILLIS' = 'MILLIS'): Duration {
  const s = v.trim()
  if (/^[+-]?P/i.test(s)) return Duration.parse(s.toUpperCase())
  const m = /^([+-]?\d+)(ns|us|ms|s|m|h|d)?$/.exec(s)
  if (!m) throw new IllegalArgumentException(`'${v}' is not a valid duration`)
  const n = Number(m[1])
  switch (m[2] ?? (defaultUnit === 'SECONDS' ? 's' : 'ms')) {
    case 'ns':
      return Duration.ofNanos(n)
    case 'us':
      return Duration.ofNanos(n * 1000)
    case 'ms':
      return Duration.ofMillis(n)
    case 's':
      return Duration.ofSeconds(n)
    case 'm':
      return Duration.ofMinutes(n)
    case 'h':
      return Duration.ofHours(n)
    default:
      return Duration.ofDays(n)
  }
}

function convert(raw: string, current: unknown, conv?: Converter): unknown {
  if (conv === 'string') return raw
  if (conv === 'int' || (conv === undefined && typeof current === 'number')) {
    if (!/^[+-]?\d+$/.test(raw.trim())) throw new IllegalArgumentException(`Failed to convert '${raw}' to int`)
    return Number(raw)
  }
  if (conv === 'boolean' || (conv === undefined && typeof current === 'boolean')) {
    const b = raw.trim().toLowerCase()
    if (['true', 'on', 'yes', '1'].includes(b)) return true
    if (['false', 'off', 'no', '0'].includes(b)) return false
    throw new IllegalArgumentException(`Failed to convert '${raw}' to boolean`)
  }
  if (conv === 'list' || (conv === undefined && Array.isArray(current))) return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  if (conv && typeof conv === 'object' && 'duration' in conv) return parseSpringDuration(raw, conv.duration)
  if (current instanceof Duration) return parseSpringDuration(raw)
  if (conv && typeof conv === 'object' && 'enum' in conv) return conv.enum.valueOf(raw.trim().toUpperCase())
  if (current instanceof KEnum) return (current.constructor as unknown as { valueOf(s: string): unknown }).valueOf(raw.trim().toUpperCase())
  return raw
}

// ---------------------------------------------------------------------------
// Définitions de beans
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Token<T = unknown> = abstract new (...args: any[]) => T

export type Dependency =
  | Token
  | { type: Token; qualifier: string }
  | { value: string; convert?: (s: string, ctx: ApplicationContext) => unknown }
  | { expression: (ctx: ApplicationContext) => unknown }
  | { provider: Token }
  | { list: Token }
  | { optional: Token }

export type BeanDefinition = {
  name: string
  type: Token
  /** Types supplémentaires sous lesquels le bean est injectable (interfaces Kotlin) */
  types: Token[]
  primary: boolean
  lazy: boolean
  profile?: (profiles: string[]) => boolean
  condition?: (env: Environment) => boolean
  create: (ctx: ApplicationContext) => unknown
  configurationProperties?: { prefix: string; types?: Record<string, Converter> }
  postConstruct: string[]
  preDestroy: string[]
  /** `@EventListener` : méthode appelée pour chaque événement instance d'un des types */
  eventListeners: { method: string; events: Token[] }[]
  early: boolean
  /** Place du bean quand les tâches s'exécutent dans le worker des tâches (voir `TaskWorkerRole`) */
  taskWorker?: TaskWorkerRole
}

/**
 * PORT: place d'un bean quand les tâches de Komga (scan, analyse…) s'exécutent dans un `worker_thread` avec son propre
 * contexte (port/task-worker.ts). Sans cette option, chaque thread a sa propre instance (services sans état, DAO).
 * - `run` : le bean n'existe que dans le thread qui exécute les tâches (TaskProcessor) ;
 * - `callMain` : bean du thread principal (état partagé : index de recherche, métriques) ; dans le worker, ses méthodes
 *   sont appelées dans le thread principal (appel synchrone, le worker attend la réponse) ;
 * - `mirrorMain` : chaque thread a son instance, mais l'état du thread principal (réglages modifiés par l'API) est
 *   recopié dans le worker après chaque modification.
 */
export type TaskWorkerRole = 'run' | 'callMain' | 'mirrorMain'

const definitions: BeanDefinition[] = []

function beanName(cls: Token): string {
  return cls.name.charAt(0).toLowerCase() + cls.name.slice(1)
}

export type ComponentOptions = {
  inject?: Dependency[]
  name?: string
  primary?: boolean
  lazy?: boolean
  /** Interfaces implémentées (tokens abstraits) */
  types?: Token[]
  profile?: string | ((profiles: string[]) => boolean)
  condition?: (env: Environment) => boolean
  configurationProperties?: { prefix: string; types?: Record<string, Converter> }
  postConstruct?: string[]
  preDestroy?: string[]
  eventListeners?: { method: string; events: Token[] }[]
  /** `@DependsOn("bean")` : beans créés avant celui-ci */
  dependsOn?: string[]
  /**
   * Bean instancié avant tous les autres au rafraîchissement du contexte : équivalent des
   * DependsOn post-processors de Spring Boot qui font passer les migrations Flyway avant jOOQ.
   */
  early?: boolean
  /** PORT: place du bean quand les tâches s'exécutent dans un worker (voir `TaskWorkerRole`) */
  taskWorker?: TaskWorkerRole
}

function profileMatcher(p?: string | ((profiles: string[]) => boolean)): ((profiles: string[]) => boolean) | undefined {
  if (p === undefined || typeof p === 'function') return p
  if (p.startsWith('!')) return (ps) => !ps.includes(p.slice(1))
  return (ps) => ps.includes(p)
}

/** `@Component` / `@Service` / `@Repository` / `@Controller` */
export function component<T>(cls: Token<T>, opts: ComponentOptions = {}): void {
  definitions.push({
    name: opts.name ?? beanName(cls),
    type: cls,
    types: opts.types ?? [],
    primary: opts.primary ?? false,
    lazy: opts.lazy ?? false,
    profile: profileMatcher(opts.profile),
    condition: opts.condition,
    configurationProperties: opts.configurationProperties,
    postConstruct: opts.postConstruct ?? [],
    preDestroy: opts.preDestroy ?? [],
    eventListeners: opts.eventListeners ?? [],
    early: opts.early ?? false,
    taskWorker: opts.taskWorker,
    create: (ctx) => {
      for (const n of opts.dependsOn ?? []) ctx.getBean(n)
      const args = (opts.inject ?? []).map((d) => ctx.resolve(d))
      return new (cls as unknown as new (...a: unknown[]) => T)(...args)
    },
  })
}

type BeanMethodOptions = {
  method: string
  name?: string
  type: Token
  types?: Token[]
  inject?: Dependency[]
  primary?: boolean
  lazy?: boolean
  profile?: string | ((profiles: string[]) => boolean)
  condition?: (env: Environment) => boolean
}

/** `@Configuration` avec ses méthodes `@Bean` */
export function configuration<T>(cls: Token<T>, opts: ComponentOptions & { beans?: BeanMethodOptions[] } = {}): void {
  component(cls, opts)
  const configName = opts.name ?? beanName(cls)
  // @Configuration(proxyBeanMethods = true) : la sous-classe CGLIB renvoie le singleton du contexte quand une méthode
  // @Bean est appelée par une autre méthode de la classe (ex. `sqliteDataSourceRO()` qui renvoie `sqliteDataSourceRW()`)
  const configDefinition = definitions[definitions.length - 1] as BeanDefinition
  const createConfig = configDefinition.create
  configDefinition.create = (ctx) => {
    const config = createConfig(ctx) as Record<string, unknown>
    const originals = new Map<string, (...a: unknown[]) => unknown>()
    beanMethodOriginals.set(config, originals)
    for (const b of opts.beans ?? []) {
      const original = config[b.method] as (...a: unknown[]) => unknown
      originals.set(b.method, original)
      const name = b.name ?? b.method
      Object.defineProperty(config, b.method, {
        configurable: true,
        writable: true,
        value: function (this: unknown, ...a: unknown[]) {
          // ConfigurationClassEnhancer.BeanMethodInterceptor : appel de la vraie méthode par la fabrique du bean
          if (factoryMethodsInvoked.has(original) || !ctx.containsBeanDefinition(name)) return original.apply(config, a)
          return ctx.getBean(name)
        },
      })
    }
    return config
  }
  for (const b of opts.beans ?? []) {
    definitions.push({
      name: b.name ?? b.method,
      type: b.type,
      types: b.types ?? [],
      primary: b.primary ?? false,
      lazy: b.lazy ?? false,
      profile: profileMatcher(b.profile),
      condition: b.condition,
      postConstruct: [],
      preDestroy: [],
      eventListeners: [],
      early: false,
      create: (ctx) => {
        const config = ctx.getBean(configName) as Record<string, (...a: unknown[]) => unknown>
        const args = (b.inject ?? []).map((d) => ctx.resolve(d))
        const method = beanMethodOriginals.get(config)?.get(b.method) ?? (config[b.method] as (...a: unknown[]) => unknown)
        factoryMethodsInvoked.add(method)
        try {
          return method.apply(config, args)
        } finally {
          factoryMethodsInvoked.delete(method)
        }
      },
    })
  }
}

/** Méthodes @Bean en cours d'appel par la fabrique de leur bean (SimpleInstantiationStrategy.currentlyInvokedFactoryMethod) */
const factoryMethodsInvoked = new Set<unknown>()
/** Méthodes @Bean d'origine d'une instance de @Configuration (avant interception) */
const beanMethodOriginals = new WeakMap<object, Map<string, (...a: unknown[]) => unknown>>()

/** Retire toutes les définitions (tests) */
export function clearDefinitions(): void {
  definitions.length = 0
}

// ---------------------------------------------------------------------------
// ApplicationContext
// ---------------------------------------------------------------------------

/** `org.springframework.context.ApplicationEventPublisher` */
export abstract class ApplicationEventPublisher {
  abstract publishEvent(event: unknown): void
}

/** `org.springframework.boot.context.event.ApplicationReadyEvent` */
export class ApplicationReadyEvent {}

/** `org.springframework.context.event.ContextRefreshedEvent` : publié à la fin de `refresh()` */
export class ContextRefreshedEvent {}

/** `org.springframework.context.event.ContextClosedEvent` : publié au début de `close()` */
export class ContextClosedEvent {}

/**
 * `org.springframework.context.SmartLifecycle` (phase d'arrêt) des exécuteurs et planificateurs
 * (ExecutorConfigurationSupport) : `stop()` refuse les nouvelles tâches et abandonne celles en file,
 * `awaitTermination()` se résout quand les tâches en cours sont terminées.
 */
export interface LifecycleResource {
  stop(): void
  awaitTermination(): Promise<void>
}

/** Contexte dont un bean est en cours de création (voir `registerLifecycleResource`) */
let creatingContext: ApplicationContext | null = null

/**
 * Rattache un exécuteur / planificateur au contexte qui crée le bean courant, pour qu'il soit arrêté à la fermeture.
 * PORT: dans Spring, un ThreadPoolTaskExecutor qui n'est pas un bean (ex. `TaskProcessor.executor`) n'est pas arrêté
 * par la fermeture du contexte : ses threads meurent avec la JVM. Le processus Node survit au contexte (tests), ses
 * tâches ne doivent pas continuer sur des bases fermées : il est arrêté avec le contexte.
 */
export function registerLifecycleResource(resource: LifecycleResource): void {
  creatingContext?.registerLifecycleResource(resource)
}

export class NoSuchBeanDefinitionException extends IllegalStateException {}
export class NoUniqueBeanDefinitionException extends IllegalStateException {}

function isAssignable(def: BeanDefinition, token: Token): boolean {
  if (def.type === token || def.types.includes(token)) return true
  return def.type.prototype instanceof token
}

/**
 * PORT: rôle d'un contexte quand les tâches s'exécutent dans un `worker_thread` (port/task-worker.ts).
 * - `main` : contexte du thread principal ; les beans `taskWorker: 'run'` n'y existent pas ;
 * - `taskWorker` : contexte du worker ; les beans `callMain` sont des mandataires (`remoteBean`), seuls les listeners
 *   des beans déjà créés dans le worker reçoivent les événements, les autres événements sont transmis au thread
 *   principal (`forwardEvent`).
 * `beanCreated` est appelé à la création de chaque bean et peut le remplacer (mandataire) ; `eventPublished` reçoit
 * chaque événement publié dans le thread principal (transmis au worker s'il y est écouté).
 */
export type ContextThreading =
  | { role: 'main'; beanCreated?: (d: BeanDefinition, bean: unknown) => unknown; eventPublished?: (event: unknown) => void }
  | {
      role: 'taskWorker'
      remoteBean: (d: BeanDefinition) => unknown
      forwardEvent: (event: unknown) => void
      beanCreated?: (d: BeanDefinition, bean: unknown) => unknown
    }

export class ApplicationContext implements ApplicationEventPublisher {
  private readonly instances = new Map<BeanDefinition, unknown>()
  private readonly creating = new Set<BeanDefinition>()
  private readonly active: BeanDefinition[]
  private readonly created: BeanDefinition[] = []
  /** Définitions remplacées par un mandataire vers le thread principal (contexte `taskWorker`) */
  private readonly remote = new Set<BeanDefinition>()

  constructor(
    readonly environment: Environment,
    extra: { name: string; type: Token; instance: unknown; primary?: boolean }[] = [],
    readonly threading: ContextThreading | null = null,
  ) {
    this.active = definitions.filter((d) => (!d.profile || d.profile(environment.activeProfiles)) && (!d.condition || d.condition(environment)))
    if (threading?.role === 'main') this.active = this.active.filter((d) => d.taskWorker !== 'run')
    else if (threading?.role === 'taskWorker')
      this.active = this.active.map((d) => {
        if (d.taskWorker !== 'callMain') return d
        const proxy: BeanDefinition = { ...d, postConstruct: [], preDestroy: [], eventListeners: [], configurationProperties: undefined, create: () => threading.remoteBean(d) }
        this.remote.add(proxy)
        return proxy
      })
    for (const e of extra) {
      const def: BeanDefinition = {
        name: e.name,
        type: e.type,
        types: [],
        primary: e.primary ?? false,
        lazy: false,
        postConstruct: [],
        preDestroy: [],
        eventListeners: [],
        early: false,
        create: () => e.instance,
      }
      this.active.push(def)
      this.instances.set(def, e.instance)
    }
  }

  /** Instancie tous les beans non paresseux (démarrage de l'application) */
  refresh(): this {
    for (const d of this.active) if (d.early) this.instantiate(d)
    for (const d of this.active) if (!d.lazy) this.instantiate(d)
    this.publishEvent(new ContextRefreshedEvent())
    return this
  }

  /**
   * PORT: démarrage du contexte du worker des tâches : seuls les beans `taskWorker: 'run'` (et leurs dépendances) sont
   * créés ; les autres beans sont ceux du thread principal
   */
  startTaskWorkerBeans(): this {
    for (const d of this.active) if (d.taskWorker === 'run') this.instantiate(d)
    return this
  }

  /** Démarrage complet : refresh puis ApplicationReadyEvent */
  start(): this {
    this.refresh()
    this.publishEvent(new ApplicationReadyEvent())
    return this
  }

  /** Publication synchrone aux `@EventListener`, dans l'ordre d'enregistrement des beans */
  publishEvent(event: unknown): void {
    // PORT: worker des tâches : un événement sans listener dans le worker est traité par le thread principal
    const threading = this.threading
    if (threading?.role === 'taskWorker' && !this.listenerDefinitions(event).length) {
      threading.forwardEvent(event)
      return
    }
    if (threading?.role === 'main') threading.eventPublished?.(event)
    this.publishLocalEvent(event)
  }

  /** PORT: publication aux seuls listeners de ce contexte (événement reçu d'un autre thread) */
  publishLocalEvent(event: unknown): void {
    // bean `applicationEventMulticaster` (ex. AsynchronousSpringEventsConfig hors profil test) : diffusion déléguée
    const multicaster = this.active.find((d) => d.name === 'applicationEventMulticaster')
    if (multicaster) {
      const m = this.instantiate(multicaster) as { multicastEvent(event: unknown, invokeListeners: (e: unknown) => void): void }
      m.multicastEvent(event, (e) => this.invokeListeners(e))
      return
    }
    this.invokeListeners(event)
  }

  /** Appel synchrone des `@EventListener` correspondant à l'événement */
  invokeListeners(event: unknown): void {
    for (const d of this.listenerDefinitions(event))
      for (const l of d.eventListeners)
        if (l.events.some((e) => event instanceof e)) {
          const bean = this.instantiate(d) as Record<string, (e: unknown) => void>
          ;(bean[l.method] as (e: unknown) => void).call(bean, event)
        }
  }

  /**
   * Beans dont un listener reçoit l'événement. PORT: dans le worker des tâches, seuls les beans déjà créés dans le
   * worker (ceux des tâches) écoutent ; les autres listeners sont ceux du thread principal.
   */
  private listenerDefinitions(event: unknown): BeanDefinition[] {
    const worker = this.threading?.role === 'taskWorker'
    return this.active.filter((d) => (!worker || this.instances.has(d)) && d.eventListeners.some((l) => l.events.some((e) => event instanceof e)))
  }

  /** PORT: types d'événements écoutés par les beans créés dans ce contexte (worker des tâches) */
  listenedEventTypes(): Token[] {
    const types = new Set<Token>()
    for (const d of this.created) for (const l of d.eventListeners) for (const e of l.events) types.add(e)
    return [...types]
  }

  private candidates(token: Token): BeanDefinition[] {
    return this.active.filter((d) => isAssignable(d, token))
  }

  private select(token: Token, qualifier?: string): BeanDefinition {
    let c = this.candidates(token)
    if (qualifier !== undefined) c = c.filter((d) => d.name === qualifier)
    if (c.length === 0) throw new NoSuchBeanDefinitionException(`No qualifying bean of type '${token.name}'${qualifier ? ` (qualifier '${qualifier}')` : ''} available`)
    if (c.length > 1) {
      const primary = c.filter((d) => d.primary)
      if (primary.length === 1) return primary[0] as BeanDefinition
      // DefaultListableBeanFactory.determineAutowireCandidate : repli sur le nom du paramètre injecté ; les paramètres
      // Kotlin portent en pratique le nom par défaut du bean du type demandé (`webPubGenerator: WebPubGenerator`)
      if (qualifier === undefined) {
        const byName = c.filter((d) => d.name === beanName(token))
        if (byName.length === 1) return byName[0] as BeanDefinition
      }
      throw new NoUniqueBeanDefinitionException(`No qualifying bean of type '${token.name}' available: expected single matching bean but found ${c.length}: ${c.map((d) => d.name).join(',')}`)
    }
    return c[0] as BeanDefinition
  }

  private instantiate(d: BeanDefinition): unknown {
    if (this.instances.has(d)) return this.instances.get(d)
    if (this.creating.has(d)) throw new IllegalStateException(`Requested bean is currently in creation: Is there an unresolvable circular reference? (${d.name})`)
    // AbstractApplicationContext.assertBeanFactoryActive
    if (this.closed) throw new IllegalStateException(`${this.displayName} has been closed already`)
    this.creating.add(d)
    const previousCreatingContext = creatingContext
    creatingContext = this
    try {
      let bean = d.create(this) as Record<string, unknown>
      if (!this.remote.has(d)) {
        if (d.configurationProperties) this.environment.bind(d.configurationProperties.prefix, bean, d.configurationProperties.types)
        for (const m of d.postConstruct) (bean[m] as () => void).call(bean)
        if (bean && typeof bean.afterPropertiesSet === 'function') (bean.afterPropertiesSet as () => void)()
      }
      if (this.threading?.beanCreated) bean = this.threading.beanCreated(d, bean) as Record<string, unknown>
      this.instances.set(d, bean)
      this.created.push(d)
      return bean
    } finally {
      creatingContext = previousCreatingContext
      this.creating.delete(d)
    }
  }

  getBean<T>(token: Token<T> | string, qualifier?: string): T {
    if (typeof token === 'string') {
      const d = this.active.find((x) => x.name === token)
      if (!d) throw new NoSuchBeanDefinitionException(`No bean named '${token}' available`)
      return this.instantiate(d) as T
    }
    return this.instantiate(this.select(token, qualifier)) as T
  }

  /** `containsBeanDefinition(name)` : bean actif (profil et conditions) de ce nom */
  containsBeanDefinition(name: string): boolean {
    return this.active.some((d) => d.name === name)
  }

  getBeansOfType<T>(token: Token<T>): T[] {
    return this.candidates(token).map((d) => this.instantiate(d) as T)
  }

  resolve(dep: Dependency): unknown {
    if (typeof dep === 'function') {
      if (dep === (Environment as unknown as Token)) return this.environment
      if (dep === (ApplicationContext as unknown as Token) || dep === (ApplicationEventPublisher as unknown as Token)) {
        const pub = this.candidates(dep).filter((d) => d.primary)
        return pub.length ? this.instantiate(pub[0] as BeanDefinition) : this
      }
      return this.getBean(dep)
    }
    if ('qualifier' in dep) return this.getBean(dep.type, dep.qualifier)
    if ('value' in dep) {
      const s = this.environment.resolvePlaceholders(dep.value)
      return dep.convert ? dep.convert(s, this) : s
    }
    if ('expression' in dep) return dep.expression(this)
    if ('provider' in dep) {
      const t = dep.provider
      return { getObject: () => this.getBean(t), getIfAvailable: () => (this.candidates(t).length ? this.getBean(t) : null) }
    }
    if ('list' in dep) return this.getBeansOfType(dep.list)
    if ('optional' in dep) return this.candidates(dep.optional).length ? this.getBean(dep.optional) : null
    throw new IllegalArgumentException('Unknown dependency')
  }

  private closed = false
  private readonly displayName = 'org.springframework.context.annotation.AnnotationConfigApplicationContext'
  private readonly lifecycleResources: LifecycleResource[] = []

  /** Exécuteur / planificateur arrêté à la fermeture du contexte (voir `registerLifecycleResource`) */
  registerLifecycleResource(resource: LifecycleResource): void {
    this.lifecycleResources.push(resource)
  }

  /**
   * Fermeture (AbstractApplicationContext.doClose) : ContextClosedEvent, arrêt des Lifecycle (exécuteurs et
   * planificateurs : plus aucune tâche acceptée, file abandonnée), puis @PreDestroy / DisposableBean.destroy dans
   * l'ordre inverse de création. Les tâches en cours ne sont pas attendues : voir `closeAndAwaitTermination`.
   */
  close(): void {
    if (this.closed) return
    this.stopLifecycle()
    this.destroyBeans()
  }

  /**
   * PORT: `close()` qui attend la fin des tâches en cours des exécuteurs (au plus `timeoutMs`) avant de détruire les
   * beans (et de fermer les bases). Sur la JVM, les threads de ces tâches sont interrompus (shutdownNow) ou meurent avec
   * elle ; dans Node une tâche asynchrone en cours continuerait après la fermeture du contexte.
   */
  async closeAndAwaitTermination(timeoutMs = 30_000): Promise<void> {
    if (this.closed) return
    this.stopLifecycle()
    let timer: NodeJS.Timeout | null = null
    await Promise.race([
      Promise.all(this.lifecycleResources.map((r) => r.awaitTermination())),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
        timer.unref()
      }),
    ])
    if (timer !== null) clearTimeout(timer)
    this.destroyBeans()
  }

  private stopLifecycle(): void {
    this.publishEvent(new ContextClosedEvent())
    this.closed = true
    for (const r of [...this.lifecycleResources].reverse()) r.stop()
  }

  private destroyBeans(): void {
    for (const d of [...this.created].reverse()) {
      if (this.remote.has(d)) continue
      const bean = this.instances.get(d) as Record<string, unknown>
      for (const m of d.preDestroy) (bean[m] as () => void).call(bean)
      if (bean && typeof bean.destroy === 'function') (bean.destroy as () => void)()
      else if (bean && typeof bean.close === 'function' && d.name.toLowerCase().includes('datasource')) (bean.close as () => void)()
    }
    this.instances.clear()
  }
}
