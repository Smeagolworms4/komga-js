// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/apprunner/ListUsersRunnerOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import type { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { ListUsersRunner } from '../../../../src/interfaces/apprunner/ListUsersRunner.js'
import { ApplicationArguments } from '../../../../src/port/spring-boot-application.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('interfaces/apprunner/ListUsersRunner')

let calls = 0
// PORT: faux KomgaUserRepository (mockk côté Kotlin) qui compte les appels à findAll
const repository = (emails: string[]) =>
  ({
    findAll: () => {
      calls++
      return emails.map((e, i) => new KomgaUser({ email: e, password: 'pw', id: `U${i}`, createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) }))
    },
  }) as unknown as KomgaUserRepository

function run(emails: string[], ...args: string[]): unknown {
  calls = 0
  new ListUsersRunner(repository(emails)).run(new ApplicationArguments(args))
  return calls
}

func('run', () => {
  kase('no argument', () => run(['a@example.org']))
  kase('other argument', () => run(['a@example.org'], '--list-user'))
  kase('list users', () => run(['a@example.org', 'b@example.org'], '--list-users'))
  kase('list users with value', () => run(['a@example.org'], '--list-users=true'))
  kase('no users', () => run([], '--list-users'))
  kase('non option argument', () => run(['a@example.org'], 'list-users'))
})
