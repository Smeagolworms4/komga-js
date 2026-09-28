// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/scheduler/InitialUserControllerOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import type { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { InitialUserController, InitialUsersDevConfiguration, InitialUsersProdConfiguration } from '../../../../src/interfaces/scheduler/InitialUserController.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('interfaces/scheduler/InitialUserController')

const created: string[] = []
// PORT: faux KomgaUserLifecycle (mockk côté Kotlin)
const lifecycle = (count: number) =>
  ({
    countUsers: () => count,
    createUser: (u: KomgaUser) => {
      created.push(u.email)
      return u
    },
  }) as unknown as KomgaUserLifecycle

const users = [
  new KomgaUser({ email: 'a@example.org', password: 'pa', id: 'U1', createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) }),
  new KomgaUser({ email: 'b@example.org', password: 'pb', id: 'U2', createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) }),
]

function run(count: number, initial: KomgaUser[]): string[] {
  created.length = 0
  new InitialUserController(lifecycle(count), initial).createInitialUserOnStartupIfNoneExist()
  return [...created]
}

const describe = (u: KomgaUser) => [u.email, [...u.roles].map((it) => it.name).sort(), u.sharedAllLibraries]

func('createInitialUserOnStartupIfNoneExist', () => {
  kase('no user: create', () => run(0, users))
  kase('users exist: nothing', () => run(1, users))
  kase('no initial users', () => run(0, []))
})

func('initialUsers@41', () => {
  const u = new InitialUsersDevConfiguration().initialUsers()
  kase('users', () => u.map(describe))
  kase('passwords', () => u.map((it) => it.password))
  kase('ids differ', () => new Set(u.map((it) => it.id)).size)
})

func('initialUsers@52', () => {
  const u = new InitialUsersProdConfiguration().initialUsers()
  kase('users', () => u.map(describe))
  kase('password', () => u.map((p) => [p.password.length, /^[a-zA-Z0-9]*$/.test(p.password)]))
  kase('random password', () => new InitialUsersProdConfiguration().initialUsers()[0]!.password !== u[0]!.password)
  kase('admin', () => {
    const roles = u[0]!.roles
    return roles.size === UserRoles.entries().length && UserRoles.entries().every((r) => roles.has(r))
  })
})
