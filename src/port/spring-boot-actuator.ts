// Support de portage : endpoints web de Spring Boot Actuator exposés par Komga (management.endpoints.web.exposure.include
// = "*", base /actuator) : page de liens, `health` (management.endpoint.health.show-details = when-authorized),
// `beans`, `info`. Les autres endpoints listés par la page de liens (et par EndpointRequest de
// port/spring-security-web.ts) ne sont pas encore portés.
// Réponses relevées sur Komga 1.27.1 (`application/vnd.spring-boot.actuator.v3+json`, ou `application/json` demandé).
// Ce fichier n'a pas de jumeau Kotlin.
import { existsSync, readFileSync, statfsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { HttpServletRequest } from './servlet.js'
import { resourcesDir } from './resources.js'
import { ApplicationContext } from './spring.js'
import { AuthenticationTrustResolver, SecurityContextHolder } from './spring-security.js'
import { request, restController } from './spring-web.js'

const ACTUATOR_V3 = 'application/vnd.spring-boot.actuator.v3+json'
const PRODUCES = [ACTUATOR_V3, 'application/vnd.spring-boot.actuator.v2+json', 'application/json']

/** Liens de `/actuator` (WebMvcEndpointHandlerMapping), dans l'ordre de Komga */
const LINKS: [string, string, boolean][] = [
  ['beans', 'beans', false],
  ['caches-cache', 'caches/{cache}', true],
  ['caches', 'caches', false],
  ['health', 'health', false],
  ['health-path', 'health/{*path}', true],
  ['info', 'info', false],
  ['conditions', 'conditions', false],
  ['shutdown', 'shutdown', false],
  ['configprops', 'configprops', false],
  ['configprops-prefix', 'configprops/{prefix}', true],
  ['env', 'env', false],
  ['env-toMatch', 'env/{toMatch}', true],
  ['flyway', 'flyway', false],
  ['logfile', 'logfile', false],
  ['loggers', 'loggers', false],
  ['loggers-name', 'loggers/{name}', true],
  ['threaddump', 'threaddump', false],
  ['metrics-requiredMetricName', 'metrics/{requiredMetricName}', true],
  ['metrics', 'metrics', false],
  ['sbom', 'sbom', false],
  ['sbom-id', 'sbom/{id}', true],
  ['scheduledtasks', 'scheduledtasks', false],
  ['sessions-sessionId', 'sessions/{sessionId}', true],
  ['sessions', 'sessions', false],
  ['httpexchanges', 'httpexchanges', false],
  ['mappings', 'mappings', false],
]

export class ActuatorEndpoints {
  constructor(private readonly ctx: ApplicationContext) {}

  /** `/actuator` : liens vers les endpoints (URL de la requête) */
  links(req: HttpServletRequest): unknown {
    const self = req.requestURL.replace(/\/$/, '')
    const links: Record<string, { href: string; templated: boolean }> = { self: { href: self, templated: false } }
    for (const [name, path, templated] of LINKS) links[name] = { href: `${self}/${path}`, templated }
    return { _links: links }
  }

  /** `/actuator/health` : détails pour un utilisateur authentifié seulement (when-authorized) */
  health(): unknown {
    const auth = SecurityContextHolder.getContext().authentication
    if (!AuthenticationTrustResolver.isAuthenticated(auth)) return { status: 'UP' }
    // PORT: indicateurs db (4 sources de données), diskSpace, ping, ssl de Komga
    const ds = { status: 'UP', details: { database: 'SQLite', validationQuery: 'isValid()' } }
    let disk: Record<string, unknown> = { status: 'UP' }
    try {
      const s = statfsSync(tmpdir())
      disk = { status: 'UP', details: { total: s.blocks * s.bsize, free: s.bavail * s.bsize, threshold: 10485760, path: `${process.cwd()}/.`, exists: true } }
    } catch {
      // indisponible
    }
    return {
      status: 'UP',
      components: {
        db: { status: 'UP', components: { sqliteDataSourceRO: ds, sqliteDataSourceRW: ds, tasksDataSourceRO: ds, tasksDataSourceRW: ds } },
        diskSpace: disk,
        ping: { status: 'UP' },
        ssl: { status: 'UP', details: { validChains: [], invalidChains: [] } },
      },
    }
  }

  /** `/actuator/beans` : beans du contexte (PORT: type = nom de la classe TypeScript, sans ressource ni dépendances) */
  beans(): unknown {
    const beans: Record<string, unknown> = {}
    const defs = (this.ctx as unknown as { active: { name: string; type: { name: string } }[] }).active
    for (const d of defs) beans[d.name] = { aliases: [], scope: 'singleton', type: d.type.name, dependencies: [] }
    return { contexts: { application: { beans } } }
  }

  /**
   * `/actuator/info` : GitInfoContributor (mode simple : branche, commit abrégé, date) lu dans git.properties, comme le
   * jar de Komga, puis build-info (groupe = nom du projet Gradle racine, « komga » dans les builds officiels).
   * komga-webui affiche `v{build.version}-{git.branch}` : sans `git`, le rendu du menu latéral échoue.
   */
  info(): unknown {
    const out: Record<string, unknown> = {}
    const git = readGitProperties()
    if (git !== null && git['git.branch'] !== undefined) {
      const commit: Record<string, unknown> = {}
      if (git['git.commit.id.abbrev'] !== undefined) commit.id = git['git.commit.id.abbrev']
      if (git['git.commit.time'] !== undefined) commit.time = gitTimeToInstant(git['git.commit.time'])
      out.git = { branch: git['git.branch'], commit }
    }
    const version = this.ctx.environment.getProperty('application.version')
    if (version !== null) out.build = { artifact: 'komga', name: 'komga', version, group: 'komga' }
    return out
  }
}

restController(ActuatorEndpoints, {
  inject: [ApplicationContext],
  javaName: 'org.springframework.boot.actuate.endpoint.web.servlet.WebMvcEndpointHandlerMapping',
  requestMapping: { path: ['actuator'], produces: PRODUCES },
  handlers: {
    links: { mapping: { method: 'GET', path: ['', '/'] }, args: [request()] },
    health: { mapping: { method: 'GET', path: ['health'] } },
    beans: { mapping: { method: 'GET', path: ['beans'] } },
    info: { mapping: { method: 'GET', path: ['info'] } },
  },
})

/** git.properties (format java.util.Properties simple : `clé=valeur`, `\:` échappé, commentaires `#`) */
function readGitProperties(): Record<string, string> | null {
  const file = join(resourcesDir(), 'git.properties')
  if (!existsSync(file)) return null
  const out: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim() === '' || line.startsWith('#') || line.startsWith('!')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\\(.)/g, '$1')
  }
  return out
}

/** GitProperties.getCommitTime() : Instant sérialisé par Jackson (ISO, UTC, `Z`) */
function gitTimeToInstant(v: string): string {
  const d = new Date(v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  return Number.isNaN(d.getTime()) ? v : d.toISOString().replace('.000Z', 'Z')
}
