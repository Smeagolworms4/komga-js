// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/scheduler/AuthenticationActivityCleanupControllerOracleTest.kt
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { AuthenticationActivity } from '../../../../src/domain/model/AuthenticationActivity.js'
import { AuthenticationActivityCleanupController } from '../../../../src/interfaces/scheduler/AuthenticationActivityCleanupController.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('interfaces/scheduler/AuthenticationActivityCleanupController')

const db = new OracleDb()
const controller = new AuthenticationActivityCleanupController(db.authenticationActivityDao)

const emails = () => db.rawQuery('SELECT EMAIL FROM AUTHENTICATION_ACTIVITY ORDER BY EMAIL').map((it) => it[0])

func('cleanup', () => {
  kase('empty', () => {
    controller.cleanup()
    return emails()
  })
  kase('old activities removed', () => {
    const now = LocalDateTime.now(ZoneId.of('Z'))
    for (const [email, dateTime] of [
      ['a-2000', LocalDateTime.of(2000, 1, 1, 0, 0)],
      ['b-40-days', now.minusDays(40)],
      ['c-20-days', now.minusDays(20)],
      ['d-now', now],
      ['e-future', now.plusDays(3)],
    ] as [string, LocalDateTime][])
      db.authenticationActivityDao.insert(new AuthenticationActivity({ email, dateTime, success: true }))
    controller.cleanup()
    return emails()
  })
  kase('idempotent', () => {
    controller.cleanup()
    return emails()
  })
})
