// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/BookDtoDaoOracleTest.kt
import { BookSearch } from '../../../../../src/domain/model/BookSearch.js'
import { ContentRestrictions } from '../../../../../src/domain/model/ContentRestrictions.js'
import type { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { ReadStatus } from '../../../../../src/domain/model/ReadStatus.js'
import { SearchCondition } from '../../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../../src/domain/model/SearchContext.js'
import { SearchOperator } from '../../../../../src/domain/model/SearchOperator.js'
import { WebLink } from '../../../../../src/domain/model/WebLink.js'
import type { BookDto } from '../../../../../src/interfaces/api/rest/dto/BookDto.js'
import { URI } from '../../../../../src/port/java-net.js'
import { Direction, Order, type Page, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle } from '../../../oracle.js'
import { bookConditions, bookMetadata, seed, u1, u2, u3, u4 } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/BookDtoDao')

const db = new OracleDb()
const dao = db.bookDtoDao

const ctx = (u: KomgaUser) => new SearchContext(u)
const byName = Sort.by('name')
const ids = (p: Page<BookDto>) => [p.content.map((it) => it.id), p.totalElements, p.number, p.size, p.sort.toString()]
const is = <T>(value: T) => new SearchOperator.Is({ value })
const rl = (id: string) => db.readListDao.findByIdOrNull(id, SearchContext.empty())!

function attempt(block: () => unknown): unknown {
  try {
    return block()
  } catch (e) {
    return e instanceof Error ? `throws ${e.name}: ${e.message}` : `throws ${typeof e}: ${String(e)}`
  }
}

func('findAll@98', () => {
  kase('anonymous sorted by name', async () => {
    await seed(db, true)
    return dao.findAll(Pageable.unpaged(byName))
  })
  kase('paged', () => ids(dao.findAll(PageRequest.of(2, 4, byName))))
})

func('findAll@100', () => {
  kase('admin read progress', () =>
    dao.findAll(ctx(u1), Pageable.unpaged(byName)).content.map((it) => [it.id, it.readProgress?.page ?? null, it.readProgress?.completed ?? null]),
  )
  kase('age restricted user', () => ids(dao.findAll(ctx(u2), Pageable.unpaged(byName))))
  kase('label excluded user', () => ids(dao.findAll(ctx(u3), Pageable.unpaged(byName))))
  kase('age excluded or label allowed user', () => ids(dao.findAll(ctx(u4), Pageable.unpaged(byName))))
  kase('without user', () => attempt(() => dao.findAll(SearchContext.empty(), Pageable.unpaged())))
})

func('findAll@105', () => {
  for (const [name, c] of bookConditions) {
    kase(`condition: ${name}`, () => ids(dao.findAll(new BookSearch({ condition: c }), ctx(u1), Pageable.unpaged(byName))))
  }
  for (const s of ['year', 'joke', 'batman', 'naruto', 'うずまき', 'miller', 'classic', 'flux', 'zzz', '9781401207526']) {
    kase(`full text: ${s}`, () => dao.findAll(new BookSearch({ fullTextSearch: s }), ctx(u1), Pageable.unpaged(byName)).content.map((it) => it.id))
  }
  kase('full text relevance', () =>
    dao.findAll(new BookSearch({ fullTextSearch: 'killing' }), ctx(u1), Pageable.unpaged(Sort.by('relevance'))).content.map((it) => it.id),
  )
  kase('full text relevance several', () =>
    dao
      .findAll(new BookSearch({ fullTextSearch: 'year' }), ctx(u1), Pageable.unpaged(Sort.by(Direction.DESC, 'relevance')))
      .content.map((it) => it.id)
      .sort(),
  )
  kase('full text and condition paged', () =>
    ids(
      dao.findAll(
        new BookSearch({ condition: new SearchCondition.SeriesId({ operator: is('S1') }), fullTextSearch: 'year' }),
        ctx(u1),
        PageRequest.of(0, 1, byName),
      ),
    ),
  )
  for (const p of [
    'name',
    'series',
    'created',
    'createdDate',
    'lastModified',
    'lastModifiedDate',
    'fileSize',
    'size',
    'fileHash',
    'url',
    'media.status',
    'media.comment',
    'media.mediaType',
    'media.pagesCount',
    'metadata.title',
    'metadata.numberSort',
    'metadata.releaseDate',
    'readProgress.lastModified',
    'readProgress.readDate',
  ]) {
    for (const dir of [Direction.ASC, Direction.DESC]) {
      kase(`sort ${p} ${dir.name}`, () => ids(dao.findAll(new BookSearch(), ctx(u1), Pageable.unpaged(Sort.by([new Order(dir, p), Order.asc('name')])))))
    }
  }
  kase('sort by read list number', () =>
    ids(
      dao.findAll(new BookSearch({ condition: new SearchCondition.ReadListId({ operator: is('RL1') }) }), ctx(u1), Pageable.unpaged(Sort.by('readList.number'))),
    ),
  )
  kase('sort by read list number desc paged', () =>
    ids(
      dao.findAll(
        new BookSearch({ condition: new SearchCondition.ReadListId({ operator: is('RL2') }) }),
        ctx(u1),
        PageRequest.of(1, 2, Sort.by(Direction.DESC, 'readList.number')),
      ),
    ),
  )
  kase('sort by read list number without read list', () => ids(dao.findAll(new BookSearch(), ctx(u1), PageRequest.of(0, 20, Sort.by('readList.number')))).slice(1))
  kase('unknown sort', () => ids(dao.findAll(new BookSearch(), ctx(u1), PageRequest.of(0, 20, Sort.by('nope')))).slice(1))
  kase('page after the end', () => ids(dao.findAll(new BookSearch(), ctx(u1), PageRequest.of(5, 4, byName))))
  kase('restricted user with condition', () =>
    ids(dao.findAll(new BookSearch({ condition: new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }) }), ctx(u2), Pageable.unpaged(byName))),
  )
  kase('read status for other user', () =>
    ids(dao.findAll(new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: is(ReadStatus.IN_PROGRESS) }) }), ctx(u2), Pageable.unpaged(byName))),
  )
  kase('without user', () => attempt(() => dao.findAll(new BookSearch(), SearchContext.empty(), Pageable.unpaged())))
})

func('findByIdOrNull', () => {
  kase('all fields for admin', () => dao.findByIdOrNull('B1', 'U1'))
  kase('read progress of other user', () => dao.findByIdOrNull('B1', 'U2')?.readProgress ?? null)
  kase('error media without release date', () => dao.findByIdOrNull('B5', 'U1'))
  kase('oneshot epub', () => dao.findByIdOrNull('B10', 'U1'))
  kase('missing', () => dao.findByIdOrNull('NOPE', 'U1'))
})

func('findPreviousInSeriesOrNull', () => {
  kase('middle', () => dao.findPreviousInSeriesOrNull('B2', 'U1')?.id ?? null)
  kase('first', () => dao.findPreviousInSeriesOrNull('B1', 'U1'))
  kase('decimal number', () => dao.findPreviousInSeriesOrNull('B7', 'U1')?.id ?? null)
  kase('unknown book', () => exceptionType(() => dao.findPreviousInSeriesOrNull('NOPE', 'U1')))
})

func('findNextInSeriesOrNull', () => {
  kase('middle', () => dao.findNextInSeriesOrNull('B2', 'U1')?.id ?? null)
  kase('last', () => dao.findNextInSeriesOrNull('B3', 'U1'))
  kase('decimal number to deleted book', () => dao.findNextInSeriesOrNull('B7', 'U1')?.id ?? null)
  kase('oneshot', () => dao.findNextInSeriesOrNull('B10', 'U1'))
})

func('findSiblingSeries', () => {
  kase('dto of the sibling', () => {
    const it = dao.findNextInSeriesOrNull('B6', 'U1')
    return it === null ? null : [it.id, it.metadata.numberSort, it.readProgress?.completed ?? null]
  })
})

func('findPreviousInReadListOrNull', () => {
  kase('ordered list middle', () => dao.findPreviousInReadListOrNull(rl('RL1'), 'B1', ctx(u1))?.id ?? null)
  kase('ordered list first', () => dao.findPreviousInReadListOrNull(rl('RL1'), 'B3', ctx(u1)))
  kase('unordered list by release date', () => dao.findPreviousInReadListOrNull(rl('RL2'), 'B7', ctx(u1))?.id ?? null)
  kase('unordered list first', () => dao.findPreviousInReadListOrNull(rl('RL2'), 'B5', ctx(u1)))
  kase('book not in list', () => dao.findPreviousInReadListOrNull(rl('RL2'), 'B1', ctx(u1)))
  kase('restricted user', () => dao.findPreviousInReadListOrNull(rl('RL1'), 'B6', ctx(u2))?.id ?? null)
  kase('without user', () => attempt(() => dao.findPreviousInReadListOrNull(rl('RL1'), 'B1', SearchContext.empty())))
})

func('findNextInReadListOrNull', () => {
  kase('ordered list middle', () => dao.findNextInReadListOrNull(rl('RL1'), 'B1', ctx(u1))?.id ?? null)
  kase('ordered list last', () => dao.findNextInReadListOrNull(rl('RL1'), 'B6', ctx(u1)))
  kase('unordered list by release date', () => dao.findNextInReadListOrNull(rl('RL2'), 'B4', ctx(u1))?.id ?? null)
  kase('unordered list last', () => dao.findNextInReadListOrNull(rl('RL2'), 'B11', ctx(u1)))
  kase('restricted user skips forbidden books', () => dao.findNextInReadListOrNull(rl('RL1'), 'B1', ctx(u4))?.id ?? null)
  kase('library restricted user in unordered list', () => dao.findNextInReadListOrNull(rl('RL2'), 'B7', ctx(u3))?.id ?? null)
})

func('findSiblingReadList', () => {
  kase('book not in ordered list', () => dao.findNextInReadListOrNull(rl('RL1'), 'B9', ctx(u1))?.id ?? null)
})

func('findAllOnDeck', () => {
  kase('admin', () => ids(dao.findAllOnDeck('U1', null, Pageable.unpaged(), { restrictions: new ContentRestrictions() })))
  kase('paged', () => ids(dao.findAllOnDeck('U1', null, PageRequest.of(0, 1), { restrictions: new ContentRestrictions() })))
  kase('library filter', () => ids(dao.findAllOnDeck('U1', ['L2'], Pageable.unpaged(), { restrictions: new ContentRestrictions() })))
  kase('restrictions', () => ids(dao.findAllOnDeck('U1', null, Pageable.unpaged(), { restrictions: u2.restrictions })))
  kase('other user', () => ids(dao.findAllOnDeck('U2', null, Pageable.unpaged(), { restrictions: new ContentRestrictions() })))
  kase('user without progress', () => ids(dao.findAllOnDeck('U4', null, Pageable.unpaged(), { restrictions: new ContentRestrictions() })))
})

func('findAllDuplicates', () => {
  kase('same hash and size', () => ids(dao.findAllDuplicates('U1', Pageable.unpaged(byName))))
  kase('paged', () => ids(dao.findAllDuplicates('U1', PageRequest.of(1, 1, Sort.by(Direction.DESC, 'name')))))
  kase('same hash different size', () => {
    db.dsl.execute("update BOOK set FILE_HASH = 'H2' where ID = 'B5'")
    return ids(dao.findAllDuplicates('U1', Pageable.unpaged(byName)))
  })
  kase('unsorted', () => {
    const it = dao.findAllDuplicates('U2', Pageable.unpaged())
    return [it.content.map((b) => b.id).sort(), it.totalElements, it.sort.toString()]
  })
})

func('readProgressCondition', () => {
  kase('only the user progress', () =>
    dao
      .findAll(ctx(u2), Pageable.unpaged(byName))
      .content.filter((b) => b.readProgress !== null)
      .map((b) => b.id),
  )
})

func('selectBase', () => {
  kase('series title joined', () => dao.findAll(ctx(u1), Pageable.unpaged(byName)).content.map((it) => it.seriesTitle))
})

func('fetchAndMap', () => {
  kase('authors tags and links', () => {
    db.bookMetadataDao.update(
      bookMetadata.find((it) => it.bookId === 'B2')!.copy({ links: [new WebLink({ label: 'wiki', url: new URI('https://example.org/b2') })] }),
    )
    return dao.findAll(ctx(u1), Pageable.unpaged(byName)).content.map((it) => [it.id, it.metadata.authors, it.metadata.tags, it.metadata.links])
  })
})

func('toDto@478', () => {
  kase('book fields', () => {
    const it = dao.findByIdOrNull('B11', 'U1')!
    return [it.url, it.fileLastModified, it.created, it.lastModified, it.sizeBytes, it.fileHash, it.deleted, it.oneshot, it.number]
  })
  kase('deleted book', () => dao.findByIdOrNull('B8', 'U1')!.deleted)
})

func('toDto@503', () => {
  kase('media', () => ['B4', 'B5', 'B9', 'B11'].map((it) => dao.findByIdOrNull(it, 'U1')!.media))
  kase('book without media nor metadata', () => {
    db.dsl.execute("insert into BOOK (ID, NAME, URL, NUMBER, FILE_LAST_MODIFIED, FILE_SIZE, LIBRARY_ID, SERIES_ID) values ('B99', 'bare', 'file:/lib1/S1/bare.cbz', 9, '2020-01-01 00:00:00', 1, 'L1', 'S1')")
    return exceptionType(() => dao.findByIdOrNull('B99', 'U1'))
  })
})

func('toDto@513', () => {
  kase('metadata', () => dao.findByIdOrNull('B7', 'U1')!.metadata)
})

func('toDto@540', () => {
  kase('read progress', () => dao.findByIdOrNull('B2', 'U1')!.readProgress)
})
