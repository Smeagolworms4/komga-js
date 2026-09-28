// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/SyncPointDaoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { BookSearch } from '../../../../../src/domain/model/BookSearch.js'
import { ReadProgress } from '../../../../../src/domain/model/ReadProgress.js'
import { SearchCondition } from '../../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../../src/domain/model/SearchContext.js'
import { SearchOperator } from '../../../../../src/domain/model/SearchOperator.js'
import { SyncPoint } from '../../../../../src/domain/model/SyncPoint.js'
import { type Page, PageRequest, Pageable } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { oracle, stable } from '../../../oracle.js'
import { seed, thumbnails, u1, u2, u3, u4 } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/SyncPointDao')

const db = new OracleDb()
const dao = db.syncPointDao
let a = ''
let b = ''
let c = ''
const all = Pageable.unpaged()

const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)
const books = (p: Page<SyncPoint.Book>) => stable([[...p.content].sort((x, y) => cmp(x.bookId, y.bookId)), p.totalElements, p.number, p.size])
const ids = (p: Page<SyncPoint.Book>) => [p.content.map((it) => it.bookId).sort(), p.totalElements]
const lists = (p: Page<SyncPoint.ReadList>) => stable([[...p.content].sort((x, y) => cmp(x.readListId, y.readListId)), p.totalElements, p.number, p.size])

function attempt(block: () => unknown): unknown {
  try {
    return block()
  } catch (e) {
    return e instanceof Error ? `throws ${e.name}: ${e.message}` : `throws ${typeof e}: ${String(e)}`
  }
}

func('create', () => {
  kase('not deleted books', () => {
    seed(db)
    const sp = dao.create('K1', new BookSearch({ condition: new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }) }), new SearchContext(u1))
    a = sp.id
    return stable([sp, sp.userId, sp.apiKeyId])
  })
  kase('stored books', () => books(dao.findBooksById(a, false, all)))
  kase('restricted user and condition', () => {
    const sp = dao.create(
      null,
      new BookSearch({ condition: new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: 'L1' }) }) }),
      new SearchContext(u2),
    )
    c = sp.id
    return [sp.apiKeyId, ids(dao.findBooksById(c, false, all))]
  })
  kase('without user', () => attempt(() => dao.create(null, new BookSearch(), SearchContext.empty())))
  kase('after changes', () => {
    db.dsl.execute("update BOOK set FILE_SIZE = 1111 where ID = 'B2'")
    db.dsl.execute("update BOOK_METADATA set LAST_MODIFIED_DATE = '2022-01-01 00:00:00' where BOOK_ID = 'B3'")
    db.dsl.execute("update READ_PROGRESS set LAST_MODIFIED_DATE = '2022-02-02 00:00:00' where BOOK_ID = 'B7' and USER_ID = 'U1'")
    db.readProgressDao.save(new ReadProgress({ bookId: 'B10', userId: 'U1', page: 1, completed: false, readDate: LocalDateTime.of(2022, 3, 3, 0, 0) }))
    db.thumbnailBookDao.markSelected(thumbnails.find((it) => it.id === 'TB4')!)
    db.dsl.execute("update BOOK set FILE_HASH = 'NEW' where ID = 'B11'")
    const sp = dao.create(
      'K2',
      new BookSearch({ condition: new SearchCondition.SeriesId({ operator: new SearchOperator.IsNot({ value: 'S4' }) }) }),
      new SearchContext(u1),
    )
    b = sp.id
    return ids(dao.findBooksById(b, false, all))
  })
})

func('findByIdOrNull', () => {
  kase('existing', () => stable(dao.findByIdOrNull(b)))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
})

func('findBooksById', () => {
  kase('paged', () => {
    const it = dao.findBooksById(a, false, PageRequest.of(1, 3))
    return [it.content.length, it.totalElements, it.number, it.size]
  })
  kase('unknown', () => dao.findBooksById('NOPE', false, all))
})

func('queryToPageBook', () => {
  kase('dates at UTC', () => stable(dao.findBooksById(a, false, all).content.find((it) => it.bookId === 'B1')!))
})

func('findBooksAdded', () => {
  kase('added', () => books(dao.findBooksAdded(a, b, false, all)))
  kase('reverse', () => ids(dao.findBooksAdded(b, a, false, all)))
  kase('same', () => ids(dao.findBooksAdded(a, a, false, all)))
})

func('findBooksRemoved', () => {
  kase('removed', () => books(dao.findBooksRemoved(a, b, false, all)))
  kase('reverse', () => ids(dao.findBooksRemoved(b, a, false, all)))
})

func('findBooksChanged', () => {
  kase('changed', () => ids(dao.findBooksChanged(a, b, false, all)))
  kase('values', () => books(dao.findBooksChanged(a, b, false, PageRequest.of(0, 20))))
})

func('findBooksReadProgressChanged', () => {
  kase('read progress changed', () => ids(dao.findBooksReadProgressChanged(a, b, false, all)))
  kase('same sync point', () => ids(dao.findBooksReadProgressChanged(a, a, false, all)))
})

func('findBooksById', () => {
  kase('only not synced after marking', () => {
    dao.markBooksSynced(b, false, ['B2', 'B1'])
    dao.markBooksSynced(b, false, [])
    return [ids(dao.findBooksById(b, true, all)), ids(dao.findBooksChanged(a, b, true, all)), ids(dao.findBooksAdded(a, b, true, all))]
  })
  kase('removed books marked synced', () => {
    dao.markBooksSynced(b, true, ['B9'])
    dao.markBooksSynced(b, true, ['B9', 'B5'])
    return [
      ids(dao.findBooksRemoved(a, b, true, all)),
      ids(dao.findBooksRemoved(a, b, false, all)),
      db.rawQuery('select BOOK_ID from SYNC_POINT_BOOK_REMOVED_SYNCED order by BOOK_ID'),
    ]
  })
  kase('read progress changed only not synced', () => {
    dao.markBooksSynced(b, false, ['B10'])
    return ids(dao.findBooksReadProgressChanged(a, b, true, all))
  })
})

func('addOnDeck', () => {
  kase('admin on deck', () => {
    dao.addOnDeck(b, new SearchContext(u1), null)
    return [
      lists(dao.findReadListsById(b, false, all)),
      dao
        .findBookIdsByReadListIds(b, [SyncPoint.ReadList.ON_DECK_ID])
        .map((it) => it.bookId)
        .sort(),
    ]
  })
  kase('filtered library without books', () => {
    dao.addOnDeck(a, new SearchContext(u3), ['L1'])
    return dao.findReadListsById(a, false, all)
  })
  kase('without user', () => attempt(() => dao.addOnDeck(a, SearchContext.empty(), null)))
})

func('findReadListsById', () => {
  kase('read lists of sync points', () => {
    const ins = (sp: string, id: string, name: string, created: string, modified: string) =>
      `insert into SYNC_POINT_READLIST (SYNC_POINT_ID, READLIST_ID, READLIST_NAME, READLIST_CREATED_DATE, READLIST_LAST_MODIFIED_DATE) values ('${sp}', '${id}', '${name}', '${created}', '${modified}')`
    for (const s of [
      ins(a, 'RLa', 'Old name', '2020-01-01 00:00:00', '2020-01-02 00:00:00'),
      ins(a, 'RLc', 'Removed', '2020-01-01 00:00:00', '2020-01-02 00:00:00'),
      ins(a, 'RLd', 'Same', '2020-01-01 00:00:00', '2020-01-02 00:00:00'),
      ins(b, 'RLa', 'New name', '2020-01-01 00:00:00', '2020-01-02 00:00:00'),
      ins(b, 'RLb', 'Added', '2021-01-01 00:00:00', '2021-06-02 10:00:00'),
      ins(b, 'RLd', 'Same', '2020-01-01 00:00:00', '2020-01-02 00:00:00'),
      `insert into SYNC_POINT_READLIST_BOOK (SYNC_POINT_ID, READLIST_ID, BOOK_ID) values ('${b}', 'RLa', 'B3')`,
      `insert into SYNC_POINT_READLIST_BOOK (SYNC_POINT_ID, READLIST_ID, BOOK_ID) values ('${b}', 'RLb', 'B4')`,
    ])
      db.dsl.execute(s)
    const p = dao.findReadListsById(b, false, PageRequest.of(1, 2))
    return [lists(dao.findReadListsById(a, false, all)), [p.content.length, p.totalElements, p.size]]
  })
})

func('queryToPageReadList', () => {
  kase('dates at UTC', () => stable(dao.findReadListsById(b, false, all).content.find((it) => it.readListId === 'RLb')!))
})

func('findReadListsAdded', () => {
  kase('added', () => lists(dao.findReadListsAdded(a, b, false, all)))
  kase('reverse', () => lists(dao.findReadListsAdded(b, a, false, all)))
})

func('findReadListsChanged', () => {
  kase('changed name', () => lists(dao.findReadListsChanged(a, b, false, all)))
})

func('findReadListsRemoved', () => {
  kase('removed', () => lists(dao.findReadListsRemoved(a, b, false, all)))
})

func('findReadListsById', () => {
  kase('only not synced after marking', () => {
    dao.markReadListsSynced(b, false, ['RLa', SyncPoint.ReadList.ON_DECK_ID])
    dao.markReadListsSynced(b, true, ['RLc'])
    dao.markReadListsSynced(b, true, ['RLc'])
    dao.markReadListsSynced(b, false, [])
    return [
      lists(dao.findReadListsById(b, true, all)),
      lists(dao.findReadListsChanged(a, b, true, all)),
      lists(dao.findReadListsAdded(a, b, true, all)),
      lists(dao.findReadListsRemoved(a, b, true, all)),
    ]
  })
})

func('findBookIdsByReadListIds', () => {
  kase('some lists', () => stable(dao.findBookIdsByReadListIds(b, ['RLa', 'RLb', 'NOPE']).sort((x, y) => cmp(x.bookId, y.bookId))))
  kase('empty', () => dao.findBookIdsByReadListIds(b, []))
})

func('deleteByUserIdAndApiKeyIds', () => {
  kase('one api key', () => {
    dao.deleteByUserIdAndApiKeyIds('U1', ['K1', 'NOPE'])
    return [
      dao.findByIdOrNull(a),
      dao.findByIdOrNull(b) !== null,
      db.rawQuery('select count(*) from SYNC_POINT_BOOK'),
      db.rawQuery('select count(*) from SYNC_POINT_READLIST'),
    ]
  })
  kase('other user', () => {
    dao.deleteByUserIdAndApiKeyIds('U2', ['K2'])
    return dao.findByIdOrNull(b) !== null
  })
})

func('deleteSubEntities', () => {
  kase('tables emptied for sync point', () =>
    ['SYNC_POINT_READLIST_REMOVED_SYNCED', 'SYNC_POINT_READLIST_BOOK', 'SYNC_POINT_READLIST', 'SYNC_POINT_BOOK_REMOVED_SYNCED', 'SYNC_POINT_BOOK'].map((it) =>
      db.rawQuery(`select count(*) from ${it} where SYNC_POINT_ID = '${a}'`),
    ),
  )
})

func('deleteOne', () => {
  kase('existing', () => {
    dao.deleteOne(b)
    return [dao.findByIdOrNull(b), db.rawQuery('select count(*) from SYNC_POINT_BOOK'), db.rawQuery('select count(*) from SYNC_POINT_READLIST_REMOVED_SYNCED')]
  })
  kase('missing', () => {
    dao.deleteOne('NOPE')
    return dao.findByIdOrNull(c) !== null
  })
})

func('deleteByUserId', () => {
  kase('existing', () => {
    dao.deleteByUserId('U2')
    return [dao.findByIdOrNull(c), db.rawQuery('select count(*) from SYNC_POINT')]
  })
})

func('deleteAll', () => {
  kase('all', () => {
    dao.create(null, new BookSearch(), new SearchContext(u4))
    dao.deleteAll()
    return ['SYNC_POINT', 'SYNC_POINT_BOOK', 'SYNC_POINT_READLIST'].map((it) => db.rawQuery(`select count(*) from ${it}`))
  })
})
