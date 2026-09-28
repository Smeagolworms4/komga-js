// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/KomgaUserLifecycleOracleTest.kt
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { AuthenticationActivity } from '../../../../src/domain/model/AuthenticationActivity.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import type { KomgaPrincipal } from '../../../../src/infrastructure/security/KomgaPrincipal.js'
import { TokenEncoder } from '../../../../src/infrastructure/security/TokenEncoder.js'
import { ApiKeyGenerator } from '../../../../src/infrastructure/security/apikey/ApiKeyGenerator.js'
import { UnsupportedOperationException, nn } from '../../../../src/port/kotlin.js'
import { PasswordEncoder } from '../../../../src/port/spring-security.js'
import { SessionInformation, SessionRegistry } from '../../../../src/port/spring-session.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle, stable } from '../../oracle.js'
import { ServiceGraph, book, date, library, series } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/KomgaUserLifecycle')

/** Encodeur déterministe (même faux que le Kotlin) */
class FakePasswordEncoder extends PasswordEncoder {
  encode(rawPassword: string): string {
    return `enc:${rawPassword}`
  }
  matches(rawPassword: string, encodedPassword: string | null): boolean {
    return encodedPassword === `enc:${rawPassword}`
  }
}

/** Sessions enregistrées par id d'utilisateur (même faux que le Kotlin) */
class FakeSessionRegistry extends SessionRegistry {
  readonly sessions: [string, SessionInformation][] = []
  register(userId: string, sessionId: string): void {
    this.sessions.push([userId, new SessionInformation(userId, sessionId, new Date(0))])
  }
  state() {
    return this.sessions.map(([u, s]) => [u, s.sessionId, s.isExpired()])
  }
  getAllPrincipals(): unknown[] {
    throw new UnsupportedOperationException()
  }
  getAllSessions(principal: unknown, includeExpiredSessions: boolean): SessionInformation[] {
    return this.sessions.filter(([u, s]) => u === (principal as KomgaPrincipal).user.id && (includeExpiredSessions || !s.isExpired())).map(([, s]) => s)
  }
  getSessionInformation(): SessionInformation | null {
    throw new UnsupportedOperationException()
  }
  refreshLastRequest(): void {
    throw new UnsupportedOperationException()
  }
  registerNewSession(): void {
    throw new UnsupportedOperationException()
  }
  removeSessionInformation(): void {
    throw new UnsupportedOperationException()
  }
}

/** Renvoie les clés en file, puis "key<n>" (même faux que le Kotlin) */
class FakeApiKeyGenerator extends ApiKeyGenerator {
  readonly queue: string[] = []
  n = 0
  generate(): string {
    return this.queue.shift() ?? `key${++this.n}`
  }
}

const db = new OracleDb()
const graph = new ServiceGraph(db)
const sessions = new FakeSessionRegistry()
const generator = new FakeApiKeyGenerator()
const lifecycle = new KomgaUserLifecycle(
  db.komgaUserDao,
  db.readProgressDao,
  db.authenticationActivityDao,
  db.syncPointDao,
  new FakePasswordEncoder(),
  new TokenEncoder((it) => `tok:${it}`),
  sessions,
  graph.transactionTemplate,
  graph.publisher,
  generator,
  db.clientSettingsDtoDao,
)

const u1 = new KomgaUser({ email: 'u1@example.org', password: 'p1', id: 'U1', createdDate: date })
const u2 = new KomgaUser({ email: 'u2@example.org', password: 'p2', roles: new Set([UserRoles.ADMIN]), id: 'U2', createdDate: date })

const user = (id: string) => db.komgaUserDao.findByIdOrNull(id)
const state = (id: string) => stable([user(id), sessions.state(), graph.takeEvents()])
const restrictions = () => new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }), labelsAllow: new Set(['kids']) })

func('countUsers', () => {
  kase('empty', () => lifecycle.countUsers())
})
func('createUser', () => {
  kase('new user, password encoded', () => stable(lifecycle.createUser(u1)))
  kase('second user', () => stable(lifecycle.createUser(u2)))
  kase('same email other case', () => lifecycle.createUser(u1.copy({ email: 'U1@EXAMPLE.org', id: 'U3' })))
  kase('same id other email', () => exceptionType(() => lifecycle.createUser(u1.copy({ email: 'other@example.org' }))))
  kase('count', () => lifecycle.countUsers())
  kase('sessions setup', () => {
    sessions.register('U1', 's1')
    sessions.register('U1', 's2')
    sessions.register('U2', 's3')
    return sessions.state()
  })
})
func('updatePassword', () => {
  kase('keep sessions', () => {
    lifecycle.updatePassword(nn(user('U1')), 'new', false)
    return state('U1')
  })
  kase('expire sessions', () => {
    lifecycle.updatePassword(nn(user('U1')), 'newer', true)
    return state('U1')
  })
  kase('empty password', () => {
    lifecycle.updatePassword(nn(user('U2')), '', false)
    return state('U2')
  })
  kase('unknown user', async () => [await exceptionType(() => lifecycle.updatePassword(u1.copy({ id: 'U9' }), 'x', true)), stable([user('U9'), graph.takeEvents()])])
})
func('updateUser', () => {
  kase('unknown user', () => lifecycle.updateUser(u1.copy({ id: 'U9' })))
  kase('email only, password kept', () => {
    sessions.register('U2', 's4')
    lifecycle.updateUser(nn(user('U2')).copy({ email: 'u2b@example.org', password: 'ignored' }))
    return state('U2')
  })
  kase('roles changed', () => {
    lifecycle.updateUser(nn(user('U2')).copy({ roles: new Set([UserRoles.FILE_DOWNLOAD]) }))
    return state('U2')
  })
  kase('same roles other order', () => {
    sessions.register('U2', 's5')
    lifecycle.updateUser(nn(user('U2')).copy({ roles: new Set([UserRoles.FILE_DOWNLOAD]) }))
    return state('U2')
  })
  kase('restrictions changed', () => {
    lifecycle.updateUser(nn(user('U2')).copy({ restrictions: restrictions() }))
    return state('U2')
  })
  kase('same restrictions', () => {
    sessions.register('U2', 's6')
    lifecycle.updateUser(nn(user('U2')).copy({ restrictions: restrictions() }))
    return state('U2')
  })
  kase('shared libraries changed', () => {
    db.libraryDao.insert(library('L1'))
    lifecycle.updateUser(nn(user('U2')).copy({ sharedAllLibraries: false, sharedLibrariesIds: new Set(['L1']) }))
    return state('U2')
  })
  kase('shared all libraries only', () => {
    sessions.register('U2', 's7')
    lifecycle.updateUser(nn(user('U2')).copy({ sharedAllLibraries: true }))
    return state('U2')
  })
})
func('expireSessions', () => {
  kase('user with sessions', () => {
    sessions.register('U1', 's8')
    lifecycle.expireSessions(nn(user('U1')))
    return sessions.state()
  })
  kase('user without session', () => {
    lifecycle.expireSessions(u1.copy({ id: 'U9' }))
    return sessions.state()
  })
})
func('createApiKey', () => {
  kase('first key', () => stable([lifecycle.createApiKey(nn(user('U1')), '  my key  '), db.komgaUserDao.findApiKeyByUserId('U1')]))
  kase('same comment', () => lifecycle.createApiKey(nn(user('U1')), 'my key'))
  kase('same comment with spaces', () => lifecycle.createApiKey(nn(user('U1')), ' my key\t'))
  kase('same comment other user', () => stable(lifecycle.createApiKey(nn(user('U2')), 'my key')))
  kase('same comment other case', () => stable(lifecycle.createApiKey(nn(user('U1')), 'MY KEY')))
  kase('empty comment', () => stable(lifecycle.createApiKey(nn(user('U1')), '')))
  kase('duplicate key is retried', () => {
    generator.queue.push('key1', 'key1', 'fresh')
    return stable(lifecycle.createApiKey(nn(user('U1')), 'retried'))
  })
  kase('always duplicate', () => {
    generator.queue.push(...Array(10).fill('key1'))
    return stable([lifecycle.createApiKey(nn(user('U1')), 'failing'), db.komgaUserDao.findApiKeyByUserId('U1').map((it) => it.comment)])
  })
  kase('unknown user', () => exceptionType(() => lifecycle.createApiKey(u1.copy({ id: 'U9' }), 'x')))
})
func('deleteUser', () => {
  kase('with related data', () => {
    db.seriesDao.insert(series('S1', 'L1'))
    db.bookDao.insert(book('B1', 'S1', 'L1'))
    db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 1, completed: false, readDate: date, createdDate: date }))
    db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: 'U2', page: 1, completed: false, readDate: date, createdDate: date }))
    db.authenticationActivityDao.insert(new AuthenticationActivity({ userId: 'U1', email: 'u1@example.org', success: true, dateTime: date }))
    db.clientSettingsDtoDao.saveForUser('U1', 'k', 'v')
    db.clientSettingsDtoDao.saveForUser('U2', 'k', 'v')
    sessions.register('U1', 's9')
    lifecycle.deleteUser(nn(user('U1')))
    return stable([
      user('U1'),
      db.komgaUserDao.findApiKeyByUserId('U1'),
      db.rawQuery('select USER_ID, BOOK_ID from READ_PROGRESS'),
      db.rawQuery('select USER_ID from AUTHENTICATION_ACTIVITY'),
      db.rawQuery('select USER_ID, KEY from CLIENT_SETTINGS_USER'),
      sessions.state(),
      graph.takeEvents(),
    ])
  })
  kase('unknown user', () => {
    lifecycle.deleteUser(u1.copy({ id: 'U9' }))
    return stable([lifecycle.countUsers(), graph.takeEvents()])
  })
  kase('count', () => lifecycle.countUsers())
})
