// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/SeriesCollectionDaoOracleTest.kt
import type { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { SearchContext } from '../../../../../src/domain/model/SearchContext.js'
import { SeriesCollection } from '../../../../../src/domain/model/SeriesCollection.js'
import { Direction, Order, type Page, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { seed, u1 as user1, u2, u3, u4 } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/SeriesCollectionDao')

const db = new OracleDb()
const dao = db.seriesCollectionDao

const ctx = (u: KomgaUser) => new SearchContext(u)
const names = (p: Page<SeriesCollection>) => [p.content.map((it) => it.name), p.totalElements, p.number, p.size, p.sort.toString()]
const series = (c: SeriesCollection | null) => (c === null ? null : [c.id, c.seriesIds, c.filtered])
const sorted = (l: string[]) => [...l].sort()
const col = (name: string, id: string, seriesIds: string[] = [], ordered = false) => new SeriesCollection({ name, ordered, seriesIds, id })

func('count', () => {
  kase('seeded', async () => {
    await seed(db, true)
    return dao.count()
  })
})

func('findByIdOrNull', () => {
  kase('admin', () => dao.findByIdOrNull('C1', ctx(user1)))
  kase('ordered', () => dao.findByIdOrNull('C2', SearchContext.empty()))
  kase('age restricted user sees filtered collection', () => series(dao.findByIdOrNull('C1', ctx(u2))))
  kase('user of one library', () => series(dao.findByIdOrNull('C1', ctx(u3))))
  kase('user of one library without allowed series', () => series(dao.findByIdOrNull('C2', ctx(u3))))
  kase('label allowed user', () => series(dao.findByIdOrNull('C2', ctx(u4))))
  kase('empty collection for admin', () => series(dao.findByIdOrNull('C3', ctx(user1))))
  kase('empty collection for limited user', () => dao.findByIdOrNull('C3', ctx(u2)))
  kase('missing', () => dao.findByIdOrNull('NOPE', ctx(user1)))
})

func('selectBase', () => {
  kase('one row per collection', () => sorted(dao.findAll(ctx(user1), Pageable.unpaged()).content.map((it) => it.id)))
})

func('fetchAndMap', () => {
  kase('series ids sorted by number', () =>
    dao
      .findAll(SearchContext.empty(), Pageable.unpaged())
      .content.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((it) => it.seriesIds),
  )
})

func('toDomain', () => {
  kase('dates converted to current time zone', () => {
    const it = dao.findByIdOrNull('C2', SearchContext.empty())!
    return [it.createdDate, it.lastModifiedDate, it.ordered]
  })
})

func('insert', () => {
  kase('unicode name', () => {
    dao.insert(col('Élan collection', 'C4', ['S5', 'S2'], true))
    return stable(dao.findByIdOrNull('C4', SearchContext.empty()))
  })
  kase('more collections for sorting', () => {
    dao.insert(col('zebra', 'C5', ['S6']))
    dao.insert(col('Ångström collection', 'C6', ['S4', 'S1']))
    dao.insert(col('heroes 2', 'C7'))
    // dates fixes (CURRENT_TIMESTAMP à la seconde) : « sorted by dates » ne dépend pas d'un changement de seconde entre deux cas
    db.dsl.execute("update COLLECTION set CREATED_DATE = '2021-01-01 00:00:00', LAST_MODIFIED_DATE = '2021-01-01 00:00:00' where ID in ('C4', 'C5', 'C6', 'C7')")
    return dao.count()
  })
  kase('stored values', () => db.rawQuery('select ID, NAME, ORDERED, SERIES_COUNT from COLLECTION order by ID'))
  kase('duplicate id', () => exceptionType(() => dao.insert(col('dup', 'C1'))))
  kase('unknown series', () => {
    const e = exceptionType(() => dao.insert(col('bad', 'CX', ['NOPE'])))
    db.dsl.execute("delete from COLLECTION where ID = 'CX'")
    return e
  })
})

func('insertSeries', () => {
  kase('stored series rows', () => db.rawQuery('select COLLECTION_ID, SERIES_ID, NUMBER from COLLECTION_SERIES order by COLLECTION_ID, NUMBER'))
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
  kase('age restricted user', () => dao.findAll(ctx(u2), Pageable.unpaged(Sort.by('name'))).content.map((it) => [it.name, it.seriesIds, it.filtered]))
  kase('label excluded user', () => dao.findAll(ctx(u3), Pageable.unpaged(Sort.by('name'))).content.map((it) => [it.name, it.seriesIds, it.filtered]))
  kase('label allowed user', () => dao.findAll(ctx(u4), Pageable.unpaged(Sort.by('name'))).content.map((it) => [it.name, it.seriesIds, it.filtered]))
  kase('search', () => names(dao.findAll(c1, Pageable.unpaged(Sort.by('name')), { search: 'heroes' })))
  kase('search with accent', () => names(dao.findAll(c1, Pageable.unpaged(Sort.by('name')), { search: 'ordered ae' })))
  kase('search sorted by relevance', () => sorted(dao.findAll(c1, Pageable.unpaged(Sort.by('relevance')), { search: 'e' }).content.map((it) => it.name)))
  kase('search without match', () => names(dao.findAll(c1, Pageable.unpaged(), { search: 'zzzz' })))
  kase('search and library', () => names(dao.findAll(c1, Pageable.unpaged(Sort.by('name')), { belongsToLibraryIds: ['L1'], search: 'heroes' })))
})

func('findAllContainingSeriesId', () => {
  kase('admin', () => sorted(dao.findAllContainingSeriesId('S1', ctx(user1)).map((it) => it.id)))
  kase('restricted user', () => dao.findAllContainingSeriesId('S1', ctx(u2)).map((it) => series(it)))
  kase('other library', () => stable(dao.findAllContainingSeriesId('S1', ctx(u3))))
  kase('unknown', () => dao.findAllContainingSeriesId('NOPE', SearchContext.empty()))
})

func('findAllEmpty', () => {
  kase('empty collections', () => sorted(dao.findAllEmpty().map((it) => it.id)))
})

func('findByNameOrNull', () => {
  kase('ignoring case', () => dao.findByNameOrNull('HEROES')?.id ?? null)
  kase('non ascii ignoring case', () => dao.findByNameOrNull('élan COLLECTION')?.id ?? null)
  kase('non ascii other case', () => dao.findByNameOrNull('ÉLAN COLLECTION')?.id ?? null)
  kase('missing', () => dao.findByNameOrNull('nope'))
})

func('existsByName', () => {
  kase('existing', () => [dao.existsByName('zebra'), dao.existsByName('ZEBRA'), dao.existsByName('ordered æ')])
  kase('missing', () => dao.existsByName('zebr'))
})

func('update', () => {
  kase('name, order and series', () => {
    dao.update(dao.findByIdOrNull('C1', SearchContext.empty())!.copy({ name: 'Heroes renamed', ordered: true, seriesIds: ['S2', 'S1'] }))
    return [stable(dao.findByIdOrNull('C1', SearchContext.empty())), db.rawQuery("select SERIES_COUNT from COLLECTION where ID = 'C1'")]
  })
  kase('remove all series', () => {
    dao.update(dao.findByIdOrNull('C5', SearchContext.empty())!.copy({ seriesIds: [] }))
    return [series(dao.findByIdOrNull('C5', SearchContext.empty())), sorted(dao.findAllEmpty().map((it) => it.id))]
  })
  kase('missing', () => {
    dao.update(col('x', 'NOPE'))
    return dao.count()
  })
})

func('removeSeriesFromAll@248', () => {
  kase('series in several collections', () => {
    dao.removeSeriesFromAll('S1')
    return dao.findAllContainingSeriesId('S1', SearchContext.empty())
  })
  kase('filtered flag after removal', () => series(dao.findByIdOrNull('C2', SearchContext.empty())))
})

func('removeSeriesFromAll@256', () => {
  kase('empty', () => {
    dao.removeSeriesFromAll([])
    return db.rawQuery('select count(*) from COLLECTION_SERIES')
  })
  kase('large list', () => {
    dao.removeSeriesFromAll([...Array.from({ length: 1100 }, (_, i) => `X${i + 1}`), 'S6', 'S5'])
    return db.rawQuery('select COLLECTION_ID, SERIES_ID from COLLECTION_SERIES order by COLLECTION_ID, NUMBER')
  })
})

func('delete@266', () => {
  kase('existing', () => {
    dao.delete('C4')
    return [dao.findByIdOrNull('C4', SearchContext.empty()), dao.count()]
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return dao.count()
  })
})

func('delete@272', () => {
  kase('several', () => {
    dao.delete(['C5', 'C6', 'NOPE'])
    return [dao.count(), db.rawQuery('select distinct COLLECTION_ID from COLLECTION_SERIES order by COLLECTION_ID')]
  })
  kase('empty', () => {
    dao.delete([])
    return dao.count()
  })
})

func('deleteAll', () => {
  kase('all', () => {
    dao.deleteAll()
    return [dao.count(), db.rawQuery('select count(*) from COLLECTION_SERIES')]
  })
})
