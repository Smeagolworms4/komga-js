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
    for (const s of this.sources) for (const k of s.keys()) if (k.startsWith(p)) keys.add(k)
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
}

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
      create: (ctx) => {
        const config = ctx.getBean(configName) as Record<string, (...a: unknown[]) => unknown>
        const args = (b.inject ?? []).map((d) => ctx.resolve(d))
        return (config[b.method] as (...a: unknown[]) => unknown).apply(config, args)
      },
    })
  }
}

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

export class NoSuchBeanDefinitionException extends IllegalStateException {}
export class NoUniqueBeanDefinitionException extends IllegalStateException {}

function isAssignable(def: BeanDefinition, token: Token): boolean {
  if (def.type === token || def.types.includes(token)) return true
  return def.type.prototype instanceof token
}

export class ApplicationContext implements ApplicationEventPublisher {
  private readonly instances = new Map<BeanDefinition, unknown>()
  private readonly creating = new Set<BeanDefinition>()
  private readonly active: BeanDefinition[]
  private readonly created: BeanDefinition[] = []

  constructor(
    readonly environment: Environment,
    extra: { name: string; type: Token; instance: unknown; primary?: boolean }[] = [],
  ) {
    this.active = definitions.filter((d) => (!d.profile || d.profile(environment.activeProfiles)) && (!d.condition || d.condition(environment)))
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
        create: () => e.instance,
      }
      this.active.push(def)
      this.instances.set(def, e.instance)
    }
  }

  /** Instancie tous les beans non paresseux (démarrage de l'application) */
  refresh(): this {
    for (const d of this.active) if (!d.lazy) this.instantiate(d)
    this.publishEvent(new ContextRefreshedEvent())
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
    for (const d of this.active)
      for (const l of d.eventListeners)
        if (l.events.some((e) => event instanceof e)) {
          const bean = this.instantiate(d) as Record<string, (e: unknown) => void>
          ;(bean[l.method] as (e: unknown) => void).call(bean, event)
        }
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
      throw new NoUniqueBeanDefinitionException(`No qualifying bean of type '${token.name}' available: expected single matching bean but found ${c.length}: ${c.map((d) => d.name).join(',')}`)
    }
    return c[0] as BeanDefinition
  }

  private instantiate(d: BeanDefinition): unknown {
    if (this.instances.has(d)) return this.instances.get(d)
    if (this.creating.has(d)) throw new IllegalStateException(`Requested bean is currently in creation: Is there an unresolvable circular reference? (${d.name})`)
    this.creating.add(d)
    try {
      const bean = d.create(this) as Record<string, unknown>
      if (d.configurationProperties) this.environment.bind(d.configurationProperties.prefix, bean, d.configurationProperties.types)
      for (const m of d.postConstruct) (bean[m] as () => void).call(bean)
      if (bean && typeof bean.afterPropertiesSet === 'function') (bean.afterPropertiesSet as () => void)()
      this.instances.set(d, bean)
      this.created.push(d)
      return bean
    } finally {
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

  /** Fermeture : @PreDestroy / DisposableBean.destroy dans l'ordre inverse de création */
  close(): void {
    for (const d of [...this.created].reverse()) {
      const bean = this.instances.get(d) as Record<string, unknown>
      for (const m of d.preDestroy) (bean[m] as () => void).call(bean)
      if (bean && typeof bean.destroy === 'function') (bean.destroy as () => void)()
      else if (bean && typeof bean.close === 'function' && d.name.toLowerCase().includes('datasource')) (bean.close as () => void)()
    }
    this.instances.clear()
  }
}
