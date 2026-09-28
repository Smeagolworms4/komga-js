// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ReadListDaoOracleTest.kt
import type { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { ReadList } from '../../../../../src/domain/model/ReadList.js'
import { SearchContext } from '../../../../../src/domain/model/SearchContext.js'
import { sortedMapOf } from '../../../../../src/port/extra-metadata.js'
import { Direction, Order, type Page, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { seed, u1 as user1, u2, u3, u4 } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ReadListDao')

const db = new OracleDb()
const dao = db.readListDao

const ctx = (u: KomgaUser) => new SearchContext(u)
const names = (p: Page<ReadList>) => [p.content.map((it) => it.name), p.totalElements, p.number, p.size, p.sort.toString()]
const books = (r: ReadList | null) => (r === null ? null : [r.id, r.bookIds, r.filtered])
const sorted = (l: string[]) => [...l].sort()
const rl = (name: string, id: string, bookIds: [number, string][] = [], extra: { summary?: string; ordered?: boolean } = {}) =>
  new ReadList({ name, id, bookIds: sortedMapOf(...bookIds), ...extra })

func('count', () => {
  kase('seeded', () => {
    seed(db, true)
    return dao.count()
  })
})

func('findByIdOrNull', () => {
  kase('admin', () => dao.findByIdOrNull('RL1', ctx(user1)))
  kase('unordered', () => dao.findByIdOrNull('RL2', SearchContext.empty()))
  kase('age restricted user sees filtered list', () => books(dao.findByIdOrNull('RL1', ctx(u2))))
  kase('user of other library', () => books(dao.findByIdOrNull('RL1', ctx(u3))))
  kase('user of other library with allowed books', () => books(dao.findByIdOrNull('RL2', ctx(u3))))
  kase('label allowed user', () => books(dao.findByIdOrNull('RL1', ctx(u4))))
  kase('empty list for admin', () => books(dao.findByIdOrNull('RL3', ctx(user1))))
  kase('empty list for limited user', () => dao.findByIdOrNull('RL3', ctx(u2)))
  kase('missing', () => dao.findByIdOrNull('NOPE', ctx(user1)))
})

func('selectBase', () => {
  kase('one row per list', () => sorted(dao.findAll(ctx(user1), Pageable.unpaged()).content.map((it) => it.id)))
})

func('fetchAndMap', () => {
  kase('book ids sorted by number', () =>
    dao
      .findAll(SearchContext.empty(), Pageable.unpaged())
      .content.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((it) => it.bookIds),
  )
})

func('toDomain', () => {
  kase('dates converted to current time zone', () => {
    const it = dao.findByIdOrNull('RL2', SearchContext.empty())!
    return [it.createdDate, it.lastModifiedDate, it.ordered, it.summary]
  })
})

func('insert', () => {
  kase('sparse numbers and unicode name', () => {
    dao.insert(
      rl(
        'Élan list',
        'RL4',
        [
          [10, 'B9'],
          [5, 'B2'],
        ],
        { summary: 'résumé', ordered: true },
      ),
    )
    return stable(dao.findByIdOrNull('RL4', SearchContext.empty()))
  })
  kase('more lists for sorting', () => {
    dao.insert(rl('zebra', 'RL5', [[0, 'B11']]))
    dao.insert(
      rl('Ångström list', 'RL6', [
        [0, 'B10'],
        [1, 'B1'],
      ]),
    )
    dao.insert(rl('reading order 2', 'RL7'))
    // dates fixes (CURRENT_TIMESTAMP à la seconde) : « sorted by dates » ne dépend pas d'un changement de seconde entre deux cas
    db.dsl.execute("update READLIST set CREATED_DATE = '2021-01-01 00:00:00', LAST_MODIFIED_DATE = '2021-01-01 00:00:00' where ID in ('RL4', 'RL5', 'RL6', 'RL7')")
    return dao.count()
  })
  kase('stored values', () => db.rawQuery('select ID, NAME, SUMMARY, ORDERED, BOOK_COUNT from READLIST order by ID'))
  kase('duplicate id', () => exceptionType(() => dao.insert(rl('dup', 'RL1'))))
  kase('unknown book', () => {
    const e = exceptionType(() => dao.insert(rl('bad', 'RLX', [[1, 'NOPE']])))
    db.dsl.execute("delete from READLIST where ID = 'RLX'")
    return e
  })
})

func('insertBooks', () => {
  kase('stored book rows', () => db.rawQuery('select READLIST_ID, BOOK_ID, NUMBER from READLIST_BOOK order by READLIST_ID, NUMBER'))
})

func('findAll', () => {
  const c1 = ctx(user1)
  kase('unpaged unsorted', () => {
    const it = dao.findAll(c1, Pageable.unpaged())
    return [sorted(it.content.map((r) => r.id)), it.totalElements, it.size]
  })
  kase('sorted by name', () => names(dao.findAll(c1, Pageable.unpaged(Sort.by('name')))))
  kase('sorted by name desc paged', () => names(dao.findAll(c1, PageRequest.of(0, 3, Sort.by(Direction.DESC, 'name')))))
  kase('second page', () => names(dao.findAll(c1, PageRequest.of(1, 3, Sort.by('name')))))
  kase('sorted by dates', () =>
    names(dao.findAll(c1, PageRequest.of(0, 20, Sort.by([Order.desc('lastModifiedDate'), Order.asc('createdDate'), Order.asc('name')])))),
  )
  kase('unknown sort', () => names(dao.findAll(c1, PageRequest.of(0, 2, Sort.by('nope')))).slice(1))
  kase('belongs to library', () => names(dao.findAll(c1, Pageable.unpaged(Sort.by('name')), { belongsToLibraryIds: ['L2'] })))
  kase('belongs to no library', () => names(dao.findAll(c1, Pageable.unpaged(Sort.by('name')), { belongsToLibraryIds: [] })))
  kase('age restricted user', () => dao.findAll(ctx(u2), Pageable.unpaged(Sort.by('name'))).content.map((it) => [it.name, it.bookIds, it.filtered]))
  kase('label excluded user', () => dao.findAll(ctx(u3), Pageable.unpaged(Sort.by('name'))).content.map((it) => [it.name, it.bookIds, it.filtered]))
  kase('label allowed user', () => dao.findAll(ctx(u4), Pageable.unpaged(Sort.by('name'))).content.map((it) => [it.name, it.bookIds, it.filtered]))
  kase('search', () => names(dao.findAll(c1, Pageable.unpaged(Sort.by('name')), { search: 'reading' })))
  kase('search sorted by relevance', () => sorted(dao.findAll(c1, Pageable.unpaged(Sort.by('relevance')), { search: 'list' }).content.map((it) => it.name)))
  kase('search without match', () => names(dao.findAll(c1, Pageable.unpaged(), { search: 'zzzz' })))
  kase('blank search', () => dao.findAll(c1, Pageable.unpaged(), { search: ' ' }).totalElements)
  kase('search and library', () => names(dao.findAll(c1, Pageable.unpaged(Sort.by('name')), { belongsToLibraryIds: ['L1'], search: 'order' })))
})

func('findAllContainingBookId', () => {
  kase('admin', () => sorted(dao.findAllContainingBookId('B1', ctx(user1)).map((it) => it.id)))
  kase('restricted user', () => dao.findAllContainingBookId('B1', ctx(u2)).map((it) => books(it)))
  kase('other library', () => dao.findAllContainingBookId('B1', ctx(u3)))
  kase('unknown', () => dao.findAllContainingBookId('NOPE', SearchContext.empty()))
})

func('findAllEmpty', () => {
  kase('empty lists', () => sorted(dao.findAllEmpty().map((it) => it.id)))
})

func('findByNameOrNull', () => {
  kase('ignoring case', () => dao.findByNameOrNull('READING order')?.id ?? null)
  kase('non ascii ignoring case', () => dao.findByNameOrNull('élan LIST')?.id ?? null)
  kase('non ascii other case', () => dao.findByNameOrNull('ÉLAN LIST')?.id ?? null)
  kase('missing', () => dao.findByNameOrNull('nope'))
})

func('existsByName', () => {
  kase('existing', () => [dao.existsByName('zebra'), dao.existsByName('ZEBRA'), dao.existsByName('ångström LIST')])
  kase('missing', () => dao.existsByName('zebr'))
})

func('update', () => {
  kase('name, summary, order and books', () => {
    dao.update(
      dao.findByIdOrNull('RL2', SearchContext.empty())!.copy({
        name: 'Now ordered',
        summary: 's',
        ordered: true,
        bookIds: sortedMapOf<number, string>([3, 'B1'], [1, 'B4']),
      }),
    )
    return [stable(dao.findByIdOrNull('RL2', SearchContext.empty())), db.rawQuery("select BOOK_COUNT from READLIST where ID = 'RL2'")]
  })
  kase('remove all books', () => {
    dao.update(dao.findByIdOrNull('RL5', SearchContext.empty())!.copy({ bookIds: sortedMapOf() }))
    return [books(dao.findByIdOrNull('RL5', SearchContext.empty())), sorted(dao.findAllEmpty().map((it) => it.id))]
  })
  kase('missing', () => {
    dao.update(rl('x', 'NOPE'))
    return dao.count()
  })
})

func('removeBookFromAll', () => {
  kase('book in two lists', () => {
    dao.removeBookFromAll('B1')
    return dao.findAllContainingBookId('B1', SearchContext.empty())
  })
  kase('filtered flag after removal', () => books(dao.findByIdOrNull('RL1', SearchContext.empty())))
})

func('removeBooksFromAll', () => {
  kase('empty', () => {
    dao.removeBooksFromAll([])
    return db.rawQuery('select count(*) from READLIST_BOOK')
  })
  kase('large list', () => {
    dao.removeBooksFromAll([...Array.from({ length: 1100 }, (_, i) => `X${i + 1}`), 'B6', 'B9'])
    return db.rawQuery('select READLIST_ID, BOOK_ID from READLIST_BOOK order by READLIST_ID, NUMBER')
  })
})

func('delete@269', () => {
  kase('existing', () => {
    dao.delete('RL4')
    return [dao.findByIdOrNull('RL4', SearchContext.empty()), dao.count()]
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return dao.count()
  })
})

func('delete@275', () => {
  kase('several', () => {
    dao.delete(['RL5', 'RL6', 'NOPE'])
    return [dao.count(), db.rawQuery('select distinct READLIST_ID from READLIST_BOOK order by READLIST_ID')]
  })
  kase('empty', () => {
    dao.delete([])
    return dao.count()
  })
})

func('deleteAll', () => {
  kase('all', () => {
    dao.deleteAll()
    return [dao.count(), db.rawQuery('select count(*) from READLIST_BOOK')]
  })
})
