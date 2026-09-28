// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ServerSettingsDaoOracleTest.kt
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle } from '../../../oracle.js'

const { func, kase } = oracle('infrastructure/jooq/main/ServerSettingsDao')

const db = new OracleDb()
const dao = db.serverSettingsDao

const all = () => db.rawQuery("select KEY, VALUE from SERVER_SETTINGS where KEY <> 'REMEMBER_ME_KEY' order by KEY")

func('getSettingByKey', () => {
  kase('missing key as string', () => dao.getSettingByKey('NOPE', String))
  kase('missing key as int', () => dao.getSettingByKey('NOPE', Number))
  kase('missing key as boolean', () => dao.getSettingByKey('NOPE', Boolean))
})

func('saveSetting@26', () => {
  kase('insert', () => {
    dao.saveSetting('K1', 'valeur ünïcode 漫画')
    return dao.getSettingByKey('K1', String)
  })
  kase('update existing key', () => {
    dao.saveSetting('K1', 'other')
    return all()
  })
  kase('empty value', () => {
    dao.saveSetting('EMPTY', '')
    return dao.getSettingByKey('EMPTY', String)
  })
  kase('keys are case sensitive', () => {
    dao.saveSetting('k1', 'lower')
    return [dao.getSettingByKey('K1', String), dao.getSettingByKey('k1', String)]
  })
  kase('numeric string', () => {
    dao.saveSetting('NUM', '0042')
    return [dao.getSettingByKey('NUM', String), dao.getSettingByKey('NUM', Number)]
  })
})

func('saveSetting@38', () => {
  kase('true', () => {
    dao.saveSetting('BOOL', true)
    return [dao.getSettingByKey('BOOL', String), dao.getSettingByKey('BOOL', Boolean)]
  })
  kase('false overwrites', () => {
    dao.saveSetting('BOOL', false)
    return [dao.getSettingByKey('BOOL', String), dao.getSettingByKey('BOOL', Boolean)]
  })
})

func('saveSetting@45', () => {
  kase('positive', () => {
    dao.saveSetting('INT', 365)
    return [dao.getSettingByKey('INT', String), dao.getSettingByKey('INT', Number)]
  })
  kase('negative', () => {
    dao.saveSetting('INT', -12)
    return dao.getSettingByKey('INT', Number)
  })
  kase('max int', () => {
    dao.saveSetting('INT', 2147483647)
    return dao.getSettingByKey('INT', Number)
  })
})

func('getSettingByKey', () => {
  kase('string value', () => dao.getSettingByKey('K1', String))
  kase('int read as string', () => dao.getSettingByKey('INT', String))
  kase('boolean from 1', () => {
    dao.saveSetting('B1', '1')
    return dao.getSettingByKey('B1', Boolean)
  })
  kase('boolean from 0', () => {
    dao.saveSetting('B0', '0')
    return dao.getSettingByKey('B0', Boolean)
  })
  kase('boolean from TRUE', () => {
    dao.saveSetting('BT', 'TRUE')
    return dao.getSettingByKey('BT', Boolean)
  })
  kase('boolean from int value', () => dao.getSettingByKey('INT', Boolean))
  kase('int from boolean text', () => exceptionType(() => dao.getSettingByKey('BOOL', Number)))
  kase('int from boolean text value', () => dao.getSettingByKey('BOOL', Number))
  kase('int from decimal text', () => {
    dao.saveSetting('DEC', '1.75')
    return dao.getSettingByKey('DEC', Number)
  })
  kase('int from blank text', () => {
    dao.saveSetting('BLANK', ' ')
    return dao.getSettingByKey('BLANK', Number)
  })
})

func('deleteSetting', () => {
  kase('existing', () => {
    dao.deleteSetting('K1')
    return [dao.getSettingByKey('K1', String), dao.getSettingByKey('k1', String)]
  })
  kase('missing', () => {
    dao.deleteSetting('NOPE')
    return all().length
  })
})

func('deleteAll', () => {
  kase('all', () => {
    dao.deleteAll()
    return all()
  })
  kase('already empty', () => {
    dao.deleteAll()
    return all()
  })
})
