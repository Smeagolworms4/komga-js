// Support de portage : Spring Session JDBC 3.5 (JdbcIndexedSessionRepository, @EnableJdbcHttpSession :
// JdbcHttpSessionConfiguration) et SessionProperties de Spring Boot (spring.session.timeout,
// spring.session.jdbc.cleanup-cron), tels qu'utilisés par Komga (JdbcSessionConfiguration, base sessionsDataSource).
// Ce fichier n'a pas de jumeau Kotlin.
// - sessions dans SPRING_SESSION (ligne par session, clé PRIMARY_ID, index PRINCIPAL_NAME) et leurs attributs dans
//   SPRING_SESSION_ATTRIBUTES (valeur sérialisée, voir port/java-serialization.ts), supprimés en cascade ;
// - enregistrement au `save` (FlushMode.ON_SAVE) : insertion d'une nouvelle session, sinon mise à jour de la ligne si la
//   session a changé et des seuls attributs modifiés (SaveMode.ON_SET_ATTRIBUTE) ;
// - attributs désérialisés à la première lecture ; sessions expirées supprimées à la lecture et par la tâche planifiée
//   (cron spring.session.jdbc.cleanup-cron) ;
// - pas d'événements de session (JdbcIndexedSessionRepository n'en publie pas).
import { Duration } from '@js-joda/core'
import { randomUUID } from 'node:crypto'
import { deserialize, serialize, serializableModule } from './java-serialization.js'
import * as kotlin from './kotlin.js'
import * as springSecurity from './spring-security.js'
import * as springSecurityOAuth2 from './spring-security-oauth2.js'
import * as springSecurityWeb from './spring-security-web.js'
import { KotlinLogging } from './logging.js'
import { FilterRegistrationBean } from './servlet.js'
import { ApplicationContext, ContextClosedEvent, ContextRefreshedEvent, configuration, parseSpringDuration } from './spring.js'
import { CronExpression, type ScheduledFuture, TaskScheduler, scheduleCron } from './spring-scheduling.js'
import {
  CookieHttpSessionIdResolver,
  CookieSerializer,
  FindByIndexNameSessionRepository,
  HttpSessionIdResolver,
  MapSession,
  type Session,
  SessionRepository,
  SessionRepositoryCustomizer,
  SessionRepositoryFilter,
  resolvePrincipalNameIndex,
} from './spring-session.js'
import { setFilterDispatcherTypes } from './spring-web-filter.js'
import { type DataSource, HikariDataSource } from './sqlite.js'

const logger = KotlinLogging.logger('org.springframework.session.jdbc.JdbcIndexedSessionRepository')

const SPRING_SECURITY_CONTEXT = 'SPRING_SECURITY_CONTEXT'

// classes des bibliothèques rangées en session (contexte de sécurité, requête d'autorisation OAuth2, requête mémorisée,
// exceptions d'authentification) : Serializable en Java
serializableModule('kotlin', kotlin)
serializableModule('org.springframework.security', springSecurity)
serializableModule('org.springframework.security.web', springSecurityWeb)
serializableModule('org.springframework.security.oauth2', springSecurityOAuth2)

const CREATE_SESSION_QUERY =
  'INSERT INTO %TABLE_NAME% (PRIMARY_ID, SESSION_ID, CREATION_TIME, LAST_ACCESS_TIME, MAX_INACTIVE_INTERVAL, EXPIRY_TIME, PRINCIPAL_NAME) VALUES (?, ?, ?, ?, ?, ?, ?)'
const CREATE_SESSION_ATTRIBUTE_QUERY = 'INSERT INTO %TABLE_NAME%_ATTRIBUTES (SESSION_PRIMARY_ID, ATTRIBUTE_NAME, ATTRIBUTE_BYTES) VALUES (?, ?, ?)'
const GET_SESSION_QUERY =
  'SELECT S.PRIMARY_ID, S.SESSION_ID, S.CREATION_TIME, S.LAST_ACCESS_TIME, S.MAX_INACTIVE_INTERVAL, SA.ATTRIBUTE_NAME, SA.ATTRIBUTE_BYTES FROM %TABLE_NAME% S LEFT JOIN %TABLE_NAME%_ATTRIBUTES SA ON S.PRIMARY_ID = SA.SESSION_PRIMARY_ID WHERE S.SESSION_ID = ?'
const UPDATE_SESSION_QUERY = 'UPDATE %TABLE_NAME% SET SESSION_ID = ?, LAST_ACCESS_TIME = ?, MAX_INACTIVE_INTERVAL = ?, EXPIRY_TIME = ?, PRINCIPAL_NAME = ? WHERE PRIMARY_ID = ?'
const UPDATE_SESSION_ATTRIBUTE_QUERY = 'UPDATE %TABLE_NAME%_ATTRIBUTES SET ATTRIBUTE_BYTES = ? WHERE SESSION_PRIMARY_ID = ? AND ATTRIBUTE_NAME = ?'
const DELETE_SESSION_ATTRIBUTE_QUERY = 'DELETE FROM %TABLE_NAME%_ATTRIBUTES WHERE SESSION_PRIMARY_ID = ? AND ATTRIBUTE_NAME = ?'
const DELETE_SESSION_QUERY = 'DELETE FROM %TABLE_NAME% WHERE SESSION_ID = ?'
const LIST_SESSIONS_BY_PRINCIPAL_NAME_QUERY =
  'SELECT S.PRIMARY_ID, S.SESSION_ID, S.CREATION_TIME, S.LAST_ACCESS_TIME, S.MAX_INACTIVE_INTERVAL, SA.ATTRIBUTE_NAME, SA.ATTRIBUTE_BYTES FROM %TABLE_NAME% S LEFT JOIN %TABLE_NAME%_ATTRIBUTES SA ON S.PRIMARY_ID = SA.SESSION_PRIMARY_ID WHERE S.PRINCIPAL_NAME = ?'
const DELETE_SESSIONS_BY_EXPIRY_TIME_QUERY = 'DELETE FROM %TABLE_NAME% WHERE EXPIRY_TIME < ?'

/** `Long.MAX_VALUE` : date d'expiration d'une session qui n'expire pas */
const NEVER_EXPIRES = 9223372036854775807n

type DeltaValue = 'ADDED' | 'UPDATED' | 'REMOVED'

/** Valeur d'attribut : objet, ou octets lus en base désérialisés au premier accès (`lazily`) */
type AttributeValue = { value: unknown } | { bytes: Uint8Array }

/** `JdbcIndexedSessionRepository.JdbcSession` */
export class JdbcSession implements Session {
  isNew: boolean
  changed = false
  readonly delta = new Map<string, DeltaValue>()
  private readonly attributes = new Map<string, AttributeValue>()

  constructor(
    readonly delegate: MapSession,
    readonly primaryKey: string,
    isNew: boolean,
  ) {
    this.isNew = isNew
  }

  get id(): string {
    return this.delegate.id
  }

  changeSessionId(): string {
    this.changed = true
    return this.delegate.changeSessionId()
  }

  /** attribut lu en base (ResultSetExtractor) */
  loadAttribute(name: string, bytes: Uint8Array): void {
    this.attributes.set(name, { bytes })
  }

  getAttribute<T = unknown>(name: string): T | null {
    const a = this.attributes.get(name)
    if (a === undefined) return null
    if ('value' in a) return a.value as T
    let value: unknown
    try {
      value = deserialize(a.bytes)
    } catch (e) {
      // PORT: écart — Spring Session lève SerializationFailedException à chaque lecture de l'attribut ; ici l'attribut
      // illisible (classe inconnue après une mise à jour, voir port/java-serialization.ts) est ignoré
      logger.warn(e as Error, () => `Could not deserialize session attribute ${name} of session ${this.id}, ignoring it`)
      this.attributes.delete(name)
      return null
    }
    this.attributes.set(name, { value })
    return value as T
  }

  getAttributeNames(): string[] {
    return [...this.attributes.keys()]
  }

  setAttribute(name: string, value: unknown): void {
    const attributeExists = this.attributes.has(name)
    const attributeRemoved = value === null || value === undefined
    if (!attributeExists && attributeRemoved) return
    const old = this.delta.get(name)
    if (attributeExists) {
      if (attributeRemoved) {
        if (old === 'ADDED') this.delta.delete(name)
        else this.delta.set(name, 'REMOVED')
      } else if (old !== 'ADDED') this.delta.set(name, 'UPDATED')
    } else this.delta.set(name, old !== undefined ? 'UPDATED' : 'ADDED')
    if (attributeRemoved) this.attributes.delete(name)
    else this.attributes.set(name, { value })
    if (name === FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME || name === SPRING_SECURITY_CONTEXT) this.changed = true
  }

  removeAttribute(name: string): void {
    this.setAttribute(name, null)
  }

  get creationTime(): number {
    return this.delegate.creationTime
  }

  set creationTime(v: number) {
    this.delegate.creationTime = v
    this.changed = true
  }

  get lastAccessedTime(): number {
    return this.delegate.lastAccessedTime
  }

  set lastAccessedTime(v: number) {
    this.delegate.lastAccessedTime = v
    this.changed = true
  }

  get maxInactiveInterval(): number {
    return this.delegate.maxInactiveInterval
  }

  set maxInactiveInterval(v: number) {
    this.delegate.maxInactiveInterval = v
    this.changed = true
  }

  isExpired(): boolean {
    if (this.maxInactiveInterval < 0) return false
    return Date.now() - this.maxInactiveInterval * 1000 >= this.lastAccessedTime
  }

  /** `getExpiryTime()` en millisecondes (Long.MAX_VALUE si la session n'expire pas) */
  expiryTime(): number | bigint {
    if (this.maxInactiveInterval < 0) return NEVER_EXPIRES
    return this.lastAccessedTime + this.maxInactiveInterval * 1000
  }

  clearChangeFlags(): void {
    this.isNew = false
    this.changed = false
    this.delta.clear()
  }
}

type SessionRow = {
  PRIMARY_ID: string
  SESSION_ID: string
  CREATION_TIME: number
  LAST_ACCESS_TIME: number
  MAX_INACTIVE_INTERVAL: number
  ATTRIBUTE_NAME: string | null
  ATTRIBUTE_BYTES: Uint8Array | null
}

/** `org.springframework.session.jdbc.JdbcIndexedSessionRepository` */
export class JdbcIndexedSessionRepository extends FindByIndexNameSessionRepository<JdbcSession> {
  static readonly DEFAULT_TABLE_NAME = 'SPRING_SESSION'

  private readonly tableName = JdbcIndexedSessionRepository.DEFAULT_TABLE_NAME
  private createSessionQuery = this.getQuery(CREATE_SESSION_QUERY)
  private createSessionAttributeQuery = this.getQuery(CREATE_SESSION_ATTRIBUTE_QUERY)
  private readonly getSessionQuery = this.getQuery(GET_SESSION_QUERY)
  private readonly updateSessionQuery = this.getQuery(UPDATE_SESSION_QUERY)
  private readonly updateSessionAttributeQuery = this.getQuery(UPDATE_SESSION_ATTRIBUTE_QUERY)
  private readonly deleteSessionAttributeQuery = this.getQuery(DELETE_SESSION_ATTRIBUTE_QUERY)
  private readonly deleteSessionQuery = this.getQuery(DELETE_SESSION_QUERY)
  private readonly listSessionsByPrincipalNameQuery = this.getQuery(LIST_SESSIONS_BY_PRINCIPAL_NAME_QUERY)
  private readonly deleteSessionsByExpiryTimeQuery = this.getQuery(DELETE_SESSIONS_BY_EXPIRY_TIME_QUERY)

  /** secondes */
  private defaultMaxInactiveInterval = MapSession.DEFAULT_MAX_INACTIVE_INTERVAL_SECONDS

  constructor(private readonly dataSource: DataSource) {
    super()
  }

  private getQuery(base: string): string {
    return base.replaceAll('%TABLE_NAME%', this.tableName)
  }

  setCreateSessionQuery(createSessionQuery: string): void {
    this.createSessionQuery = this.getQuery(createSessionQuery)
  }

  setCreateSessionAttributeQuery(createSessionAttributeQuery: string): void {
    this.createSessionAttributeQuery = this.getQuery(createSessionAttributeQuery)
  }

  /** `setDefaultMaxInactiveInterval(Duration)` */
  setDefaultMaxInactiveInterval(defaultMaxInactiveInterval: Duration): void {
    this.defaultMaxInactiveInterval = defaultMaxInactiveInterval.seconds()
  }

  private get db() {
    return this.dataSource.getConnection()
  }

  private inTransaction<T>(fn: () => T): T {
    const db = this.db
    return db.inTransaction ? fn() : db.transaction(fn)()
  }

  createSession(): JdbcSession {
    const delegate = new MapSession()
    delegate.maxInactiveInterval = this.defaultMaxInactiveInterval
    return new JdbcSession(delegate, randomUUID(), true)
  }

  save(session: JdbcSession): void {
    this.inTransaction(() => {
      if (session.isNew) {
        this.db
          .prepare(this.createSessionQuery)
          .run(
            session.primaryKey,
            session.id,
            session.creationTime,
            session.lastAccessedTime,
            session.maxInactiveInterval,
            session.expiryTime(),
            resolvePrincipalNameIndex(session),
          )
        this.insertSessionAttributes(session, session.getAttributeNames())
      } else {
        if (session.changed)
          this.db
            .prepare(this.updateSessionQuery)
            .run(session.id, session.lastAccessedTime, session.maxInactiveInterval, session.expiryTime(), resolvePrincipalNameIndex(session), session.primaryKey)
        const added: string[] = []
        const updated: string[] = []
        const removed: string[] = []
        for (const [name, delta] of session.delta) {
          if (delta === 'ADDED') added.push(name)
          else if (delta === 'UPDATED') updated.push(name)
          else removed.push(name)
        }
        this.insertSessionAttributes(session, added)
        this.updateSessionAttributes(session, updated)
        this.deleteSessionAttributes(session, removed)
      }
    })
    session.clearChangeFlags()
  }

  private insertSessionAttributes(session: JdbcSession, attributeNames: string[]): void {
    if (attributeNames.length === 0) return
    const stmt = this.db.prepare(this.createSessionAttributeQuery)
    for (const name of attributeNames) stmt.run(session.primaryKey, name, serialize(session.getAttribute(name)))
  }

  private updateSessionAttributes(session: JdbcSession, attributeNames: string[]): void {
    if (attributeNames.length === 0) return
    const stmt = this.db.prepare(this.updateSessionAttributeQuery)
    for (const name of attributeNames) stmt.run(serialize(session.getAttribute(name)), session.primaryKey, name)
  }

  private deleteSessionAttributes(session: JdbcSession, attributeNames: string[]): void {
    if (attributeNames.length === 0) return
    const stmt = this.db.prepare(this.deleteSessionAttributeQuery)
    for (const name of attributeNames) stmt.run(session.primaryKey, name)
  }

  findById(id: string): JdbcSession | null {
    const session = this.inTransaction(() => this.extract(this.db.prepare(this.getSessionQuery).all(id) as SessionRow[])[0] ?? null)
    if (session !== null) {
      if (session.isExpired()) this.deleteById(id)
      else return session
    }
    return null
  }

  deleteById(id: string): void {
    this.inTransaction(() => this.db.prepare(this.deleteSessionQuery).run(id))
  }

  findByIndexNameAndIndexValue(indexName: string, indexValue: string): Map<string, JdbcSession> {
    if (indexName !== FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME) return new Map()
    const sessions = this.inTransaction(() => this.extract(this.db.prepare(this.listSessionsByPrincipalNameQuery).all(indexValue) as SessionRow[]))
    return new Map(sessions.map((it) => [it.id, it]))
  }

  /** Tâche planifiée : suppression des sessions expirées */
  cleanUpExpiredSessions(): void {
    const deletedCount = this.inTransaction(() => this.db.prepare(this.deleteSessionsByExpiryTimeQuery).run(Date.now()).changes)
    logger.debug(() => `Cleaned up ${deletedCount} expired sessions`)
  }

  /** `SessionResultSetExtractor` */
  private extract(rows: SessionRow[]): JdbcSession[] {
    const sessions: JdbcSession[] = []
    let session: JdbcSession | null = null
    for (const row of rows) {
      if (session === null || session.primaryKey !== row.PRIMARY_ID) {
        const delegate = new MapSession(row.SESSION_ID)
        delegate.creationTime = Number(row.CREATION_TIME)
        delegate.lastAccessedTime = Number(row.LAST_ACCESS_TIME)
        delegate.maxInactiveInterval = Number(row.MAX_INACTIVE_INTERVAL)
        session = new JdbcSession(delegate, row.PRIMARY_ID, false)
        sessions.push(session)
      }
      if (row.ATTRIBUTE_NAME !== null && row.ATTRIBUTE_BYTES !== null) session.loadAttribute(row.ATTRIBUTE_NAME, row.ATTRIBUTE_BYTES)
    }
    return sessions
  }
}

/** `org.springframework.boot.autoconfigure.session.SessionProperties` (sous-ensemble : spring.session.timeout) */
export class SessionProperties {
  readonly timeout: Duration | null

  constructor(ctx: ApplicationContext) {
    const timeout = ctx.environment.getProperty('spring.session.timeout')
    this.timeout = timeout !== undefined && timeout !== null && timeout !== '' ? parseSpringDuration(timeout, 'SECONDS') : null
  }
}

configuration(
  class SessionPropertiesConfiguration {
    sessionProperties(ctx: ApplicationContext): SessionProperties {
      return new SessionProperties(ctx)
    }
  },
  { beans: [{ method: 'sessionProperties', type: SessionProperties, inject: [{ expression: (ctx) => ctx }] }] },
)

/**
 * `JdbcHttpSessionConfiguration` (via @EnableJdbcHttpSession) + `SpringHttpSessionConfiguration` : beans
 * `sessionRepository` (sur la source de données @SpringSessionDataSource), `springSessionRepositoryFilter`, et la
 * tâche de nettoyage planifiée (SchedulingConfigurer, cron `spring.session.jdbc.cleanup-cron`, par défaut chaque minute).
 * Enregistrée par la configuration de Komga qui porte l'annotation (`enableJdbcHttpSession`).
 */
export class JdbcHttpSessionConfiguration {
  private cleanupTask: ScheduledFuture | null = null

  constructor(private readonly ctx: ApplicationContext) {}

  sessionRepository(dataSource: DataSource, customizers: SessionRepositoryCustomizer<JdbcIndexedSessionRepository>[]): JdbcIndexedSessionRepository {
    const sessionRepository = new JdbcIndexedSessionRepository(dataSource)
    // @EnableJdbcHttpSession(maxInactiveIntervalInSeconds = 1800)
    sessionRepository.setDefaultMaxInactiveInterval(Duration.ofSeconds(MapSession.DEFAULT_MAX_INACTIVE_INTERVAL_SECONDS))
    for (const c of customizers) c.customize(sessionRepository)
    return sessionRepository
  }

  springSessionRepositoryFilter(
    sessionRepository: JdbcIndexedSessionRepository,
    httpSessionIdResolver: HttpSessionIdResolver | null,
    cookieSerializer: CookieSerializer | null,
  ): FilterRegistrationBean {
    const filter = new SessionRepositoryFilter(sessionRepository as unknown as SessionRepository<Session>)
    if (httpSessionIdResolver !== null) filter.setHttpSessionIdResolver(httpSessionIdResolver)
    else if (cookieSerializer !== null) {
      const r = new CookieHttpSessionIdResolver()
      r.setCookieSerializer(cookieSerializer)
      filter.setHttpSessionIdResolver(r)
    }
    const registration = new FilterRegistrationBean(filter, SessionRepositoryFilter.DEFAULT_ORDER, ['/*'], 'springSessionRepositoryFilter')
    // spring.session.servlet.filter-dispatcher-types = ASYNC, ERROR, REQUEST
    setFilterDispatcherTypes(registration, ['ASYNC', 'ERROR', 'REQUEST'])
    return registration
  }

  /** `configureTasks(ScheduledTaskRegistrar)` : à la fin du rafraîchissement du contexte */
  onRefreshed(): void {
    if (this.cleanupTask !== null) return
    const cron = this.ctx.environment.getProperty('spring.session.jdbc.cleanup-cron') ?? '0 * * * * *'
    const repository = this.ctx.getBean(JdbcIndexedSessionRepository)
    // SchedulingConfigurer : sans effet sans @EnableScheduling (pas de TaskScheduler dans le contexte)
    const taskScheduler = this.ctx.resolve({ optional: TaskScheduler }) as TaskScheduler | null
    if (taskScheduler === null) return
    this.cleanupTask = scheduleCron(taskScheduler, () => repository.cleanUpExpiredSessions(), CronExpression.parse(cron))
  }

  onClosed(): void {
    this.cleanupTask?.cancel(false)
    this.cleanupTask = null
  }
}

/** `@EnableJdbcHttpSession` sur une configuration conditionnelle : configuration de Spring Session JDBC avec la même condition */
export function enableJdbcHttpSession(condition: (env: ApplicationContext['environment']) => boolean): void {
  configuration(JdbcHttpSessionConfiguration, {
    condition,
    inject: [ApplicationContext],
    eventListeners: [
      { method: 'onRefreshed', events: [ContextRefreshedEvent] },
      { method: 'onClosed', events: [ContextClosedEvent] },
    ],
    beans: [
      {
        method: 'sessionRepository',
        type: JdbcIndexedSessionRepository,
        types: [FindByIndexNameSessionRepository, SessionRepository],
        condition,
        // @SpringSessionDataSource
        inject: [{ type: HikariDataSource, qualifier: 'sessionsDataSource' }, { list: SessionRepositoryCustomizer }],
      },
      {
        method: 'springSessionRepositoryFilter',
        type: FilterRegistrationBean,
        condition,
        inject: [JdbcIndexedSessionRepository, { optional: HttpSessionIdResolver }, { optional: CookieSerializer }],
      },
    ],
  })
}
