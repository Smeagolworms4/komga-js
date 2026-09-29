// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ClientSettingsDtoDaoOracleTest.kt
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ClientSettingsDtoDao')

const db = new OracleDb()
const dao = db.clientSettingsDtoDao

const sortedMap = <V>(m: Map<string, V>) => new Map([...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))

func('findAllGlobal', () => {
  kase('empty', () => dao.findAllGlobal())
})

func('saveGlobal', () => {
  kase('insert', () => {
    dao.saveGlobal('theme', 'dark', true)
    dao.saveGlobal('secret', '{"a": 1, "ü": ["x"]}', false)
    return sortedMap(dao.findAllGlobal())
  })
  kase('update keeps allow unauthorized', () => {
    dao.saveGlobal('theme', 'light', false)
    return dao.findAllGlobal().get('theme') ?? null
  })
  kase('empty value', () => {
    dao.saveGlobal('empty', '', false)
    return dao.findAllGlobal().get('empty') ?? null
  })
})

func('findAllGlobal', () => {
  kase('only unauthorized', () => dao.findAllGlobal({ onlyUnauthorized: true }))
  kase('all', () => [...dao.findAllGlobal({ onlyUnauthorized: false }).keys()].sort())
})

func('saveForUser', () => {
  kase('insert', async () => {
    await seed(db)
    dao.saveForUser('U1', 'theme', 'dark')
    dao.saveForUser('U1', 'lang', 'fr')
    dao.saveForUser('U2', 'theme', 'sepia')
    return sortedMap(dao.findAllUser('U1'))
  })
  kase('update', () => {
    dao.saveForUser('U1', 'theme', 'light')
    return dao.findAllUser('U1').get('theme') ?? null
  })
  kase('unknown user', () => exceptionType(() => dao.saveForUser('NOPE', 'k', 'v')))
})

func('findAllUser', () => {
  kase('other user', () => dao.findAllUser('U2'))
  kase('no setting', () => dao.findAllUser('U3'))
})

func('deleteGlobalByKeys', () => {
  kase('some keys', () => {
    dao.deleteGlobalByKeys(['secret', 'NOPE'])
    return [...dao.findAllGlobal().keys()].sort()
  })
  kase('empty list', () => {
    dao.deleteGlobalByKeys([])
    return dao.findAllGlobal().size
  })
})

func('deleteByUserIdAndKeys', () => {
  kase('only for user', () => {
    dao.deleteByUserIdAndKeys('U1', ['theme'])
    return [dao.findAllUser('U1'), dao.findAllUser('U2')]
  })
  kase('empty list', () => {
    dao.deleteByUserIdAndKeys('U2', [])
    return dao.findAllUser('U2').size
  })
})

func('deleteByUserId', () => {
  kase('existing', () => {
    dao.deleteByUserId('U2')
    return [dao.findAllUser('U2'), dao.findAllUser('U1').size]
  })
})

func('deleteAll', () => {
  kase('all', () => {
    dao.saveForUser('U3', 'a', 'b')
    dao.deleteAll()
    return [dao.findAllGlobal(), dao.findAllUser('U1'), dao.findAllUser('U3')]
  })
})
