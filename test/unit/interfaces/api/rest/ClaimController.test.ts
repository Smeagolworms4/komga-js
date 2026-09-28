// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/ClaimControllerOracleTest.kt
import type { KomgaUserLifecycle } from '../../../../../src/domain/service/KomgaUserLifecycle.js'
import { ClaimController } from '../../../../../src/interfaces/api/rest/ClaimController.js'
import { oracle } from '../../../oracle.js'
import { Calls } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/ClaimController')

let count = 0
const calls = new Calls()
const lifecycle = {
  countUsers: () => {
    calls.add('countUsers')
    return count
  },
} as unknown as KomgaUserLifecycle
const controller = new ClaimController(lifecycle)

func('getClaimStatus', () => {
  kase('no user', () => [controller.getClaimStatus(), calls.take()])
  kase('one user', () => {
    count = 1
    return [controller.getClaimStatus(), calls.take()]
  })
  kase('many users', () => {
    count = 42
    return controller.getClaimStatus()
  })
})
