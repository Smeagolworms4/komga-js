// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/apprunner/PasswordResetRunnerOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import type { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { PasswordResetRunner } from '../../../../src/interfaces/apprunner/PasswordResetRunner.js'
import { ApplicationArguments } from '../../../../src/port/spring-boot-application.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('interfaces/apprunner/PasswordResetRunner')

const db = new OracleDb()
const calls: unknown[][] = []
// PORT: faux KomgaUserLifecycle (mockk côté Kotlin) qui enregistre les appels à updatePassword
const lifecycle = {
  updatePassword: (user: KomgaUser, newPassword: string, expireSessions: boolean) => {
    calls.push([user.id, newPassword, expireSessions])
  },
} as unknown as KomgaUserLifecycle
const runner = new PasswordResetRunner(db.komgaUserDao, lifecycle)

function run(...args: string[]): unknown[][] {
  calls.length = 0
  runner.run(new ApplicationArguments(args))
  return [...calls]
}

func('run', () => {
  kase('populate', () => {
    db.komgaUserDao.insert(new KomgaUser({ email: 'user@example.org', password: 'pw', id: 'U1', createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) }))
    db.komgaUserDao.insert(new KomgaUser({ email: 'Other@Example.org', password: 'pw', id: 'U2', createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) }))
  })
  kase('no argument', () => run())
  kase('only reset', () => run('--reset=user@example.org'))
  kase('only new password', () => run('--newpassword=secret'))
  kase('both', () => run('--reset=user@example.org', '--newpassword=secret'))
  kase('case insensitive email', () => run('--reset=USER@example.org', '--newpassword=secret'))
  kase('several users', () => run('--reset=user@example.org', '--reset=other@example.org', '--reset=unknown@example.org', '--newpassword=s'))
  kase('duplicate user', () => run('--reset=user@example.org', '--reset=user@example.org', '--newpassword=s'))
  kase('blank password', () => run('--reset=user@example.org', '--newpassword=  '))
  kase('empty password', () => run('--reset=user@example.org', '--newpassword='))
  kase('password without value', () => run('--reset=user@example.org', '--newpassword'))
  kase('several passwords: first', () => run('--reset=user@example.org', '--newpassword=a', '--newpassword=b'))
  kase('reset without value', () => run('--reset', '--newpassword=a'))
  kase('password with equals', () => run('--reset=user@example.org', '--newpassword=a=b'))
})
