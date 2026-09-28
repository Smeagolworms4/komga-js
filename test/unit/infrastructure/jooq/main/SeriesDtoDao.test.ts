// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/SeriesDtoDaoOracleTest.kt
import type { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { SearchCondition } from '../../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../../src/domain/model/SearchContext.js'
import { SearchField } from '../../../../../src/domain/model/SearchField.js'
import { SearchOperator } from '../../../../../src/domain/model/SearchOperator.js'
import { SeriesSearch } from '../../../../../src/domain/model/SeriesSearch.js'
import type { SeriesDto } from '../../../../../src/interfaces/api/rest/dto/SeriesDto.js'
import { Direction, Order, type Page, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle } from '../../../oracle.js'
import { seed, seriesConditions, u1, u2, u3, u4 } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/SeriesDtoDao')

const db = new OracleDb()
const dao = db.seriesDtoDao

const ctx = (u: KomgaUser) => new SearchContext(u)
const byTitle = Sort.by('metadata.titleSort')
const ids = (p: Page<SeriesDto>) => [p.content.map((it) => it.id), p.totalElements, p.number, p.size, p.sort.toString()]
const counts = (p: Page<SeriesDto>) => p.content.map((it) => [it.id, it.booksCount, it.booksReadCount, it.booksUnreadCount, it.booksInProgressCount])
const sorted = (l: string[]) => [...l].sort()
const byGroup = <T extends { group: string }>(l: T[]) => [...l].sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : 0))
const is = <T>(value: T) => new SearchOperator.Is({ value })

function attempt(block: () => unknown): unknown {
  try {
    return block()
  } catch (e) {
    return e instanceof Error ? `throws ${e.name}: ${e.message}` : `throws ${typeof e}: ${String(e)}`
  }
}

func('findAll@99', () => {
  kase('anonymous sorted by title', () => {
    seed(db, true)
    return dao.findAll(Pageable.unpaged(byTitle))
  })
  kase('paged', () => ids(dao.findAll(PageRequest.of(1, 4, byTitle))))
})

func('findAll@101', () => {
  kase('admin read counts', () => counts(dao.findAll(ctx(u1), Pageable.unpaged(byTitle))))
  kase('age restricted user', () => ids(dao.findAll(ctx(u2), Pageable.unpaged(byTitle))))
  kase('label excluded user', () => ids(dao.findAll(ctx(u3), Pageable.unpaged(byTitle))))
  kase('age excluded or label allowed user', () => ids(dao.findAll(ctx(u4), Pageable.unpaged(byTitle))))
  kase('without user', () => attempt(() => dao.findAll(SearchContext.empty(), Pageable.unpaged())))
})

func('findAll@106', () => {
  for (const [name, c] of seriesConditions) {
    kase(`condition: ${name}`, () => ids(dao.findAll(new SeriesSearch({ condition: c }), ctx(u1), Pageable.unpaged(byTitle))))
  }
  for (const s of ['batman', 'BAT', 'naruto', 'flux', 'angstrom', 'kishimoto', 'dc comics', 'zzz', 'joker', 'action']) {
    kase(`full text: ${s}`, () => dao.findAll(new SeriesSearch({ fullTextSearch: s }), ctx(u1), Pageable.unpaged(byTitle)).content.map((it) => it.id))
  }
  kase('full text relevance', () =>
    dao.findAll(new SeriesSearch({ fullTextSearch: 'batman' }), ctx(u1), Pageable.unpaged(Sort.by('relevance'))).content.map((it) => it.id),
  )
  kase('full text relevance several', () =>
    sorted(dao.findAll(new SeriesSearch({ fullTextSearch: 'a' }), ctx(u1), Pageable.unpaged(Sort.by(Direction.DESC, 'relevance'))).content.map((it) => it.id)),
  )
  kase('full text and condition', () =>
    ids(
      dao.findAll(
        new SeriesSearch({ condition: new SearchCondition.LibraryId({ operator: is('L2') }), fullTextSearch: 'naruto' }),
        ctx(u1),
        Pageable.unpaged(byTitle),
      ),
    ),
  )
  kase('regex on title', () => ids(dao.findAll(new SeriesSearch({ regexSearch: ['^[A-Z]', SearchField.TITLE] }), ctx(u1), Pageable.unpaged(byTitle))))
  kase('regex on title sort', () => ids(dao.findAll(new SeriesSearch({ regexSearch: ['^a', SearchField.TITLE_SORT] }), ctx(u1), Pageable.unpaged(byTitle))))
  for (const p of ['metadata.titleSort', 'createdDate', 'created', 'lastModifiedDate', 'lastModified', 'booksMetadata.releaseDate', 'readDate', 'name', 'booksCount']) {
    for (const dir of [Direction.ASC, Direction.DESC]) {
      kase(`sort ${p} ${dir.name}`, () => ids(dao.findAll(new SeriesSearch(), ctx(u1), Pageable.unpaged(Sort.by([new Order(dir, p), Order.asc('name')])))))
    }
  }
  kase('sort by collection number', () =>
    ids(
      dao.findAll(
        new SeriesSearch({ condition: new SearchCondition.CollectionId({ operator: is('C2') }) }),
        ctx(u1),
        Pageable.unpaged(Sort.by('collection.number')),
      ),
    ),
  )
  kase('sort by collection number desc', () =>
    ids(
      dao.findAll(
        new SeriesSearch({ condition: new SearchCondition.CollectionId({ operator: is('C1') }) }),
        ctx(u1),
        PageRequest.of(0, 2, Sort.by(Direction.DESC, 'collection.number')),
      ),
    ),
  )
  kase('sort by collection number without collection', () => ids(dao.findAll(new SeriesSearch(), ctx(u1), PageRequest.of(0, 20, Sort.by('collection.number')))).slice(1))
  kase('random sort', () => {
    const it = dao.findAll(new SeriesSearch(), ctx(u1), Pageable.unpaged(Sort.by('random')))
    return [sorted(it.content.map((s) => s.id)), it.totalElements]
  })
  kase('unknown sort', () => ids(dao.findAll(new SeriesSearch(), ctx(u1), PageRequest.of(0, 20, Sort.by('nope')))).slice(1))
  kase('page after the end', () => ids(dao.findAll(new SeriesSearch(), ctx(u1), PageRequest.of(3, 4, byTitle))))
  kase('restricted user with condition', () =>
    ids(dao.findAll(new SeriesSearch({ condition: new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }) }), ctx(u4), Pageable.unpaged(byTitle))),
  )
  kase('without user', () => attempt(() => dao.findAll(new SeriesSearch(), SearchContext.empty(), Pageable.unpaged())))
})

func('findAllRecentlyUpdated', () => {
  kase('admin', () => ids(dao.findAllRecentlyUpdated(new SeriesSearch(), ctx(u1), Pageable.unpaged(Sort.by(Direction.DESC, 'lastModified')))))
  kase('with condition', () =>
    ids(dao.findAllRecentlyUpdated(new SeriesSearch({ condition: new SearchCondition.LibraryId({ operator: is('L1') }) }), ctx(u1), Pageable.unpaged(byTitle))),
  )
  kase('full text', () => ids(dao.findAllRecentlyUpdated(new SeriesSearch({ fullTextSearch: 'naruto' }), ctx(u1), Pageable.unpaged(byTitle))))
  kase('restricted', () => ids(dao.findAllRecentlyUpdated(new SeriesSearch(), ctx(u2), Pageable.unpaged(byTitle))))
  kase('without user', () => attempt(() => dao.findAllRecentlyUpdated(new SeriesSearch(), SearchContext.empty(), Pageable.unpaged())))
})

func('countByFirstCharacter', () => {
  kase('admin', () => byGroup(dao.countByFirstCharacter(new SeriesSearch(), ctx(u1))))
  kase('condition', () =>
    byGroup(dao.countByFirstCharacter(new SeriesSearch({ condition: new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }) }), ctx(u1))),
  )
  kase('collection condition', () =>
    byGroup(dao.countByFirstCharacter(new SeriesSearch({ condition: new SearchCondition.CollectionId({ operator: is('C1') }) }), ctx(u1))),
  )
  kase('full text', () => byGroup(dao.countByFirstCharacter(new SeriesSearch({ fullTextSearch: 'a' }), ctx(u1))))
  kase('regex', () => byGroup(dao.countByFirstCharacter(new SeriesSearch({ regexSearch: ['^[n-z]', SearchField.TITLE_SORT] }), ctx(u1))))
  kase('restricted', () => byGroup(dao.countByFirstCharacter(new SeriesSearch(), ctx(u3))))
  kase('no match', () => dao.countByFirstCharacter(new SeriesSearch({ fullTextSearch: 'zzzz' }), ctx(u1)))
  kase('without user', () => attempt(() => dao.countByFirstCharacter(new SeriesSearch(), SearchContext.empty())))
})

func('findByIdOrNull', () => {
  kase('all fields for admin', () => dao.findByIdOrNull('S1', 'U1'))
  kase('other user', () => {
    const it = dao.findByIdOrNull('S1', 'U2')
    return it === null ? null : [it.booksReadCount, it.booksUnreadCount, it.booksInProgressCount]
  })
  kase('oneshot', () => dao.findByIdOrNull('S5', 'U1'))
  kase('deleted', () => dao.findByIdOrNull('S4', 'U1'))
  kase('missing', () => dao.findByIdOrNull('NOPE', 'U1'))
})

func('selectBase', () => {
  kase('one row per series', () => dao.findAll(ctx(u1), Pageable.unpaged()).totalElements)
})

func('findAll@224', () => {
  kase('count distinct with joins', () =>
    ids(dao.findAll(new SeriesSearch({ condition: new SearchCondition.Tag({ operator: is('classic') }) }), ctx(u1), PageRequest.of(0, 1))),
  )
})

func('readProgressConditionSeries', () => {
  kase('read progress of the user only', () => counts(dao.findAll(ctx(u2), Pageable.unpaged(byTitle))))
})

func('fetchAndMap', () => {
  kase('collections of every series', () =>
    dao
      .findAll(ctx(u1), Pageable.unpaged(byTitle))
      .content.map((it) => [
        it.id,
        it.metadata.genres,
        it.metadata.tags,
        it.metadata.sharingLabels,
        it.metadata.links,
        it.metadata.alternateTitles,
        it.booksMetadata.authors,
        it.booksMetadata.tags,
      ]),
  )
})

func('toColumn', () => {
  kase('title', () => dao.countByFirstCharacter(new SeriesSearch({ regexSearch: ['ルト', SearchField.TITLE] }), ctx(u1)))
  kase('title sort', () => dao.countByFirstCharacter(new SeriesSearch({ regexSearch: ['ルト', SearchField.TITLE_SORT] }), ctx(u1)))
})

func('toDto@412', () => {
  kase('series metadata', () => dao.findByIdOrNull('S3', 'U1')!.metadata)
  kase('no reading direction', () => {
    const it = dao.findByIdOrNull('S2', 'U1')!.metadata
    return [it.readingDirection, it.ageRating, it.totalBookCount, it.created, it.lastModified]
  })
})

func('toDto@451', () => {
  kase('books metadata', () => dao.findByIdOrNull('S1', 'U1')!.booksMetadata)
  kase('without aggregation', () => {
    db.dsl.execute("insert into SERIES (ID, NAME, URL, FILE_LAST_MODIFIED, LIBRARY_ID) values ('S9', 'bare', 'file:/lib1/bare', '2020-01-01 00:00:00', 'L1')")
    return exceptionType(() => dao.findByIdOrNull('S9', 'U1'))
  })
})
