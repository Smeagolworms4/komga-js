// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/PageHashDaoOracleTest.kt
import { PageHashKnown } from '../../../../../src/domain/model/PageHashKnown.js'
import type { BookPageNumbered } from '../../../../../src/domain/model/BookPageNumbered.js'
import { Direction, Order, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, oracleBytes, stable } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/PageHashDao')

const db = new OracleDb()
const dao = db.pageHashDao

const known = (hash: string, size: number | null, action: PageHashKnown.Action) => new PageHashKnown({ hash, size, action })
const sort = (...orders: Order[]) => Sort.by(orders)
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sortedMap = <V>(m: Map<string, V>) => new Map([...m].sort((a, b) => cmp(a[0], b[0])))

func('insert', () => {
  kase('with thumbnail', () => {
    seed(db)
    dao.insert(known('PH1', 101, PageHashKnown.Action.DELETE_AUTO), oracleBytes(16))
    return stable(dao.findKnown('PH1'))
  })
  kase('without thumbnail', () => {
    dao.insert(known('PH2', null, PageHashKnown.Action.IGNORE), null)
    return stable(dao.findKnown('PH2'))
  })
  kase('negative size is null', () => {
    dao.insert(known('NEG', -5, PageHashKnown.Action.DELETE_MANUAL), null)
    return dao.findKnown('NEG')!.size
  })
  kase('unmatched known hash', () => {
    dao.insert(known('ZZ', 999, PageHashKnown.Action.DELETE_MANUAL), oracleBytes(3))
    return db.rawQuery('select HASH, SIZE, ACTION, DELETE_COUNT from PAGE_HASH order by HASH')
  })
  kase('duplicate hash', () => exceptionType(() => dao.insert(known('PH1', 1, PageHashKnown.Action.IGNORE), null)))
})

func('findKnown', () => {
  kase('missing', () => dao.findKnown('NOPE'))
  kase('case sensitive', () => dao.findKnown('ph1'))
})

func('toDomain', () => {
  kase('dates converted to current time zone', () => {
    db.dsl.execute("update PAGE_HASH set CREATED_DATE = '2020-06-01 10:00:00', LAST_MODIFIED_DATE = '2020-06-02 23:30:00'")
    const it = dao.findKnown('PH1')!
    return [it.createdDate, it.lastModifiedDate, it.matchCount, it.deleteCount]
  })
})

func('getKnownThumbnail', () => {
  kase('with thumbnail', () => dao.getKnownThumbnail('PH1'))
  kase('without thumbnail', () => dao.getKnownThumbnail('PH2'))
  kase('missing', () => dao.getKnownThumbnail('NOPE'))
})

func('findAllKnown', () => {
  kase('unpaged all actions', () => dao.findAllKnown(null, Pageable.unpaged()))
  kase('filter actions', () =>
    dao.findAllKnown([PageHashKnown.Action.DELETE_MANUAL, PageHashKnown.Action.IGNORE], Pageable.unpaged()).content.map((it) => it.hash),
  )
  kase('empty action list', () => dao.findAllKnown([], Pageable.unpaged()))
  kase('sort by match count then hash', () =>
    dao.findAllKnown(null, PageRequest.of(0, 20, sort(Order.desc('matchCount'), Order.asc('hash')))).content.map((it) => [it.hash, it.matchCount]),
  )
  kase('paged', () => dao.findAllKnown(null, PageRequest.of(1, 2, Sort.by('hash'))))
  kase('sort by delete size', () =>
    dao.findAllKnown(null, PageRequest.of(0, 10, sort(Order.desc('deleteSize'), Order.desc('hash')))).content.map((it) => it.hash),
  )
  kase('sort by size aliases', () =>
    ['size', 'fileSize'].map((p) => dao.findAllKnown(null, PageRequest.of(0, 10, sort(Order.asc(p), Order.asc('hash')))).content.map((it) => it.hash)),
  )
  kase('unknown sort property', () => dao.findAllKnown(null, PageRequest.of(0, 1, Sort.by('nope'))))
})

func('update', () => {
  kase('action, size and delete count', () => {
    dao.update(new PageHashKnown({ hash: 'PH2', size: 102, action: PageHashKnown.Action.DELETE_AUTO, deleteCount: 7 }))
    return stable(dao.findKnown('PH2'))
  })
  kase('missing', () => {
    dao.update(known('NOPE', 1, PageHashKnown.Action.IGNORE))
    return dao.findKnown('NOPE')
  })
  kase('sorted by delete count', () =>
    dao.findAllKnown(null, PageRequest.of(0, 10, sort(Order.desc('deleteCount'), Order.asc('hash')))).content.map((it) => [it.hash, it.deleteCount]),
  )
})

func('findAllUnknown', () => {
  kase('unpaged', () => dao.findAllUnknown(Pageable.unpaged()))
  kase('sorted by hash desc', () => dao.findAllUnknown(PageRequest.of(0, 10, Sort.by(Direction.DESC, 'hash'))))
  kase('sorted by total size', () => dao.findAllUnknown(PageRequest.of(0, 10, sort(Order.desc('totalSize'), Order.asc('hash')))).content.map((it) => it.hash))
  kase('paged', () => dao.findAllUnknown(PageRequest.of(1, 1, Sort.by('hash'))))
  kase('unknown sort property', () => dao.findAllUnknown(PageRequest.of(0, 5, Sort.by('nope'))).totalElements)
})

func('findMatchesByHash', () => {
  kase('unpaged sorted by book', () => dao.findMatchesByHash('PH1', PageRequest.of(0, 10, Sort.by('bookId'))))
  kase('paged', () => dao.findMatchesByHash('PH2', PageRequest.of(1, 2, sort(Order.asc('url')))))
  kase('unpaged', () => dao.findMatchesByHash('PQ1', Pageable.unpaged()))
  kase('no match', () => dao.findMatchesByHash('NOPE', Pageable.unpaged()))
  kase('sort by page number desc', () =>
    dao.findMatchesByHash('PH3', PageRequest.of(0, 10, sort(Order.desc('pageNumber'), Order.desc('bookId')))).content.map((it) => it.bookId),
  )
})

const byPage = (l: BookPageNumbered[]) => [...l].sort((a, b) => a.pageNumber - b.pageNumber)

func('findMatchesByKnownHashAction', () => {
  kase('delete auto everywhere', () => {
    const m = sortedMap(dao.findMatchesByKnownHashAction([PageHashKnown.Action.DELETE_AUTO], null))
    return new Map([...m].map(([k, v]) => [k, byPage([...v])]))
  })
  kase('two actions in one library', () => {
    const m = sortedMap(dao.findMatchesByKnownHashAction([PageHashKnown.Action.DELETE_AUTO, PageHashKnown.Action.IGNORE], 'L2'))
    return new Map([...m].map(([k, v]) => [k, byPage([...v]).map((it) => [it.fileName, it.pageNumber])]))
  })
  kase('library without matches', () => dao.findMatchesByKnownHashAction([PageHashKnown.Action.DELETE_AUTO], 'NOPE'))
  kase('empty actions', () => dao.findMatchesByKnownHashAction([], null))
  kase('null actions', () => exceptionType(() => dao.findMatchesByKnownHashAction(null, null)))
})
