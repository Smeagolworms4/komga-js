// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/ClientSettingsControllerOracleTest.kt
import { ClientSettingsController } from '../../../../../src/interfaces/api/rest/ClientSettingsController.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { principal, user } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/ClientSettingsController')

const db = new OracleDb()
const controller = new ClientSettingsController(db.clientSettingsDtoDao)
const u1 = user('U1')
const u2 = user('U2')

func('getGlobalSettings', () => {
  kase('empty, anonymous', () => controller.getGlobalSettings(null))
  kase('seeded, anonymous', () => {
    db.komgaUserDao.insert(u1)
    db.komgaUserDao.insert(u2)
    db.clientSettingsDtoDao.saveGlobal('app.b', 'vb', false)
    db.clientSettingsDtoDao.saveGlobal('app.a', 'va', true)
    db.clientSettingsDtoDao.saveGlobal('app.c', '{"json":1}', true)
    db.clientSettingsDtoDao.saveForUser('U1', 'user.x', 'x1')
    db.clientSettingsDtoDao.saveForUser('U1', 'user.y', 'y1')
    db.clientSettingsDtoDao.saveForUser('U2', 'user.x', 'x2')
    return controller.getGlobalSettings(null)
  })
  kase('authenticated', () => controller.getGlobalSettings(principal(u1)))
})
func('getUserSettings', () => {
  kase('U1', () => controller.getUserSettings(principal(u1)))
  kase('U2', () => controller.getUserSettings(principal(u2)))
  kase('unknown user', () => controller.getUserSettings(principal(user('U3'))))
})
func('deleteGlobalSettings', () => {
  kase('unknown key', () => {
    controller.deleteGlobalSettings(new Set(['nope']))
    return controller.getGlobalSettings(principal(u1))
  })
  kase('two keys', () => {
    controller.deleteGlobalSettings(new Set(['app.a', 'app.c']))
    return [controller.getGlobalSettings(principal(u1)), controller.getUserSettings(principal(u1))]
  })
  kase('empty set', () => {
    controller.deleteGlobalSettings(new Set())
    return controller.getGlobalSettings(principal(u1))
  })
})
