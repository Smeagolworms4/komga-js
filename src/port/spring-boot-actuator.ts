// Support de portage : endpoints web de Spring Boot Actuator exposés par Komga (management.endpoints.web.exposure.include
// = "*", base /actuator) : page de liens, `health` (management.endpoint.health.show-details = when-authorized),
// `beans`, `info`. Les autres endpoints listés par la page de liens (et par EndpointRequest de
// port/spring-security-web.ts) ne sont pas encore portés.
// Réponses relevées sur Komga 1.27.1 (`application/vnd.spring-boot.actuator.v3+json`, ou `application/json` demandé).
// Ce fichier n'a pas de jumeau Kotlin.
import { statfsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type { HttpServletRequest } from './servlet.js'
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

  /** `/actuator/info` */
  info(): unknown {
    const version = this.ctx.environment.getProperty('application.version')
    return version !== null ? { build: { artifact: 'komga', name: 'komga', version, group: 'komga-src' } } : {}
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
