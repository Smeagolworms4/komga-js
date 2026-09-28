// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/SyncPointControllerOracleTest.kt
import type { SyncPointRepository } from '../../../../../src/domain/persistence/SyncPointRepository.js'
import { SyncPointController } from '../../../../../src/interfaces/api/rest/SyncPointController.js'
import { oracle } from '../../../oracle.js'
import { Calls, principal, user } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/SyncPointController')

const calls = new Calls()
const repository = {
  deleteByUserId: (userId: string) => calls.add('deleteByUserId', userId),
  deleteByUserIdAndApiKeyIds: (userId: string, keys: Iterable<string>) => calls.add('deleteByUserIdAndApiKeyIds', userId, [...keys]),
} as unknown as SyncPointRepository
const controller = new SyncPointController(repository)
const p = principal(user('U1'))

func('deleteSyncPointsForCurrentUser', () => {
  kase('null keys', () => {
    controller.deleteSyncPointsForCurrentUser(p, null)
    return calls.take()
  })
  kase('empty keys', () => {
    controller.deleteSyncPointsForCurrentUser(p, [])
    return calls.take()
  })
  kase('with keys', () => {
    controller.deleteSyncPointsForCurrentUser(p, ['K2', 'K1'])
    return calls.take()
  })
})
