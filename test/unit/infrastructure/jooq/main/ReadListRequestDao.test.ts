// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ReadListRequestDaoOracleTest.kt
import { ReadListRequestBook } from '../../../../../src/domain/model/ReadListRequest.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ReadListRequestDao')

const db = new OracleDb()
const dao = db.readListRequestDao

function attempt(block: () => unknown): unknown {
  try {
    return block()
  } catch (e) {
    return `throws ${e instanceof Error ? e.name : typeof e}`
  }
}

const req = (number: string, ...series: string[]) => new ReadListRequestBook({ series: new Set(series), number })

func('matchBookRequests', () => {
  kase('empty database', () => dao.matchBookRequests([req('1', 'Batman')]))
  kase('single match', () => {
    seed(db)
    return dao.matchBookRequests([req('1', 'Batman')])
  })
  kase('series title ignoring ascii case and leading zeros', () => dao.matchBookRequests([req('001', 'BATMAN'), req('1', 'Zorro'), req('01', 'zorro')]))
  kase('non ascii case is not ignored', () => dao.matchBookRequests([req('2', 'élan vital'), req('2', 'Élan vital')]))
  kase('several series aliases', () => dao.matchBookRequests([req('3', 'Nope', 'batman', 'Batman')]))
  kase('decimal number and deleted book', () => dao.matchBookRequests([req('1.5', 'ナルト'), req('2', 'ナルト')]))
  kase('no match', () => dao.matchBookRequests([req('99', 'Batman'), req('1', 'Unknown'), req('0', 'Batman')]))
  kase('order of requests is kept', () =>
    dao.matchBookRequests([req('1', 'Ångström'), req('2', 'Batman'), req('1', 'Æon Flux')]).map((it) => [...it.matches.keys()].map((s) => s.id)),
  )
  kase('empty series set', () => attempt(() => dao.matchBookRequests([req('1')])))
  kase('empty requests', () => attempt(() => dao.matchBookRequests([])))
})
