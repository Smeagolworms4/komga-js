// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ReferentialDaoOracleTest.kt
import { FilterBy, FilterByEntity, FilterTags } from '../../../../../src/domain/model/FilterBy.js'
import { SearchContext } from '../../../../../src/domain/model/SearchContext.js'
import { PageRequest, Pageable } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { seed, u1, u2, u3, u4 } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ReferentialDao')

const db = new OracleDb()
const dao = db.referentialDao

const filters: [string, string[] | null][] = [
  ['all libraries', null],
  ['library L1', ['L1']],
  ['library L2', ['L2']],
  ['no library', []],
]

const contexts: [string, SearchContext][] = [
  ['admin', new SearchContext(u1)],
  ['anonymous', SearchContext.empty()],
  ['age restricted', new SearchContext(u2)],
  ['label excluded', new SearchContext(u3)],
  ['age excluded or label allowed', new SearchContext(u4)],
]

const filterBys: [string, FilterBy | null][] = [
  ['no filter', null],
  ['by library', new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set(['L2']) })],
  ['by collection', new FilterBy({ type: FilterByEntity.COLLECTION, ids: new Set(['C1']) })],
  ['by series', new FilterBy({ type: FilterByEntity.SERIES, ids: new Set(['S1', 'S3']) })],
  ['by read list', new FilterBy({ type: FilterByEntity.READLIST, ids: new Set(['RL1']) })],
]

const paged = PageRequest.of(1, 2)
const admin = contexts[0]![1]

function attempt(block: () => unknown): unknown {
  try {
    return block()
  } catch (e) {
    return `throws ${e instanceof Error ? e.name : typeof e}`
  }
}

function withFilters(block: (f: string[] | null) => unknown): void {
  for (const [name, f] of filters) kase(name, () => block(f))
}

function generic(search: string | null, block: (c: SearchContext, s: string | null, f: FilterBy | null, p: Pageable) => unknown): void {
  kase('seeded', () => {
    if (db.seriesDao.count() === 0) seed(db)
    return attempt(() => block(admin, null, null, Pageable.unpaged()))
  })
  for (const [cn, c] of contexts) {
    for (const [fn, f] of filterBys) kase(`${cn}, ${fn}`, () => attempt(() => block(c, null, f, Pageable.unpaged())))
  }
  kase('paged', () => attempt(() => block(admin, null, null, paged)))
  if (search !== null) {
    kase('search', () => attempt(() => block(admin, search, null, Pageable.unpaged())))
    kase('search restricted and filtered', () => attempt(() => block(contexts[2]![1], search, filterBys[1]![1], PageRequest.of(0, 1))))
  }
}

func('findAllAuthorsByName', () => {
  kase('empty database', () => dao.findAllAuthorsByName('a', null))
  kase('seed', () => {
    seed(db)
    return dao.findAllAuthorsByName('', null)
  })
  kase('accent insensitive', () => dao.findAllAuthorsByName('emile', null))
  kase('case sensitive', () => dao.findAllAuthorsByName('FRANK', null))
  withFilters((it) => dao.findAllAuthorsByName('i', it))
})

func('findAllAuthorsByNameAndLibrary', () => {
  kase('L1', () => dao.findAllAuthorsByNameAndLibrary('', 'L1', null))
  kase('filtered out', () => dao.findAllAuthorsByNameAndLibrary('', 'L1', ['L2']))
  withFilters((it) => dao.findAllAuthorsByNameAndLibrary('a', 'L2', it))
})

func('findAllAuthorsByNameAndCollection', () => {
  withFilters((it) => dao.findAllAuthorsByNameAndCollection('', 'C1', it))
  kase('search', () => dao.findAllAuthorsByNameAndCollection('MILLER', 'C1', null))
})

func('findAllAuthorsByNameAndSeries', () => {
  withFilters((it) => dao.findAllAuthorsByNameAndSeries('r', 'S1', it))
  kase('unknown series', () => dao.findAllAuthorsByNameAndSeries('', 'NOPE', null))
})

func('findAllAuthorsNamesByName', () => {
  withFilters((it) => dao.findAllAuthorsNamesByName('', it))
  kase('accent insensitive', () => dao.findAllAuthorsNamesByName('zo', null))
})

func('findAllAuthorsRoles', () => {
  withFilters((it) => dao.findAllAuthorsRoles(it))
})

func('findAuthors', () => {
  generic('mill', (c, s, f, p) => dao.findAuthors(c, s, null, f, p))
  kase('role', () => dao.findAuthors(admin, null, 'penciller', null, Pageable.unpaged()))
  kase('role and search', () => dao.findAuthors(admin, 'a', 'writer', filterBys[3]![1], Pageable.unpaged()))
})

func('findAuthorsRoles', () => {
  generic(null, (c, _s, f, p) => dao.findAuthorsRoles(c, f, p))
})

func('findAuthorsNames', () => {
  generic('é', (c, s, f, p) => dao.findAuthorsNames(c, s, null, f, p))
  kase('role', () => dao.findAuthorsNames(admin, null, 'writer', null, PageRequest.of(0, 3)))
})

func('findAllGenres', () => {
  withFilters((it) => dao.findAllGenres(it))
})

func('findAllGenresByLibraries', () => {
  withFilters((it) => dao.findAllGenresByLibraries(new Set(['L1', 'L2']), it))
  kase('empty library set', () => dao.findAllGenresByLibraries(new Set(), null))
})

func('findAllGenresByCollection', () => {
  withFilters((it) => dao.findAllGenresByCollection('C1', it))
})

func('findGenres', () => {
  generic('ac', (c, s, f, p) => dao.findGenres(c, s, f, p))
})

func('findAllSeriesAndBookTags', () => {
  withFilters((it) => dao.findAllSeriesAndBookTags(it))
})

func('findAllSeriesAndBookTagsByLibraries', () => {
  withFilters((it) => dao.findAllSeriesAndBookTagsByLibraries(new Set(['L1']), it))
})

func('findAllSeriesAndBookTagsByCollection', () => {
  withFilters((it) => dao.findAllSeriesAndBookTagsByCollection('C1', it))
})

func('findAllSeriesTags', () => {
  withFilters((it) => dao.findAllSeriesTags(it))
})

func('findAllSeriesTagsByLibrary', () => {
  withFilters((it) => dao.findAllSeriesTagsByLibrary('L1', it))
})

func('findAllBookTagsBySeries', () => {
  withFilters((it) => dao.findAllBookTagsBySeries('S1', it))
})

func('findAllBookTagsByReadList', () => {
  withFilters((it) => dao.findAllBookTagsByReadList('RL1', it))
})

func('findTags', () => {
  for (const t of FilterTags.entries()) {
    kase(`${t.name} seeded`, () => dao.findTags(admin, null, null, t, Pageable.unpaged()))
    for (const [cn, c] of contexts.slice(1)) kase(`${t.name} ${cn}`, () => attempt(() => dao.findTags(c, null, null, t, Pageable.unpaged())))
    for (const [fn, f] of filterBys.slice(1)) kase(`${t.name} ${fn}`, () => attempt(() => dao.findTags(admin, null, f, t, Pageable.unpaged())))
    kase(`${t.name} search paged`, () => dao.findTags(admin, 'e', null, t, PageRequest.of(0, 2)))
  }
})

func('findAllSeriesTagsByCollection', () => {
  withFilters((it) => dao.findAllSeriesTagsByCollection('C1', it))
})

func('findAllBookTags', () => {
  withFilters((it) => dao.findAllBookTags(it))
})

func('findAllLanguages', () => {
  withFilters((it) => dao.findAllLanguages(it))
})

func('findAllLanguagesByLibraries', () => {
  withFilters((it) => dao.findAllLanguagesByLibraries(new Set(['L2']), it))
})

func('findAllLanguagesByCollection', () => {
  withFilters((it) => dao.findAllLanguagesByCollection('C2', it))
})

func('findLanguages', () => {
  generic('E', (c, s, f, p) => dao.findLanguages(c, s, f, p))
})

func('findAllPublishers@458', () => {
  withFilters((it) => dao.findAllPublishers(it))
})

func('findAllPublishers@469', () => {
  withFilters((it) => dao.findAllPublishers(it, PageRequest.of(0, 2)))
  kase('unpaged', () => dao.findAllPublishers(null, Pageable.unpaged()))
  kase('second page', () => dao.findAllPublishers(null, paged))
})

func('findAllPublishersByLibraries', () => {
  withFilters((it) => dao.findAllPublishersByLibraries(new Set(['L1', 'L2']), it))
})

func('findAllPublishersByCollection', () => {
  withFilters((it) => dao.findAllPublishersByCollection('C1', it))
})

func('findPublishers', () => {
  generic('DC', (c, s, f, p) => dao.findPublishers(c, s, f, p))
})

func('findAllAgeRatings', () => {
  withFilters((it) => dao.findAllAgeRatings(it))
})

func('findAllAgeRatingsByLibraries', () => {
  withFilters((it) => dao.findAllAgeRatingsByLibraries(new Set(['L1']), it))
})

func('findAllAgeRatingsByCollection', () => {
  withFilters((it) => dao.findAllAgeRatingsByCollection('C1', it))
})

func('findAgeRatings', () => {
  generic(null, (c, _s, f, p) => dao.findAgeRatings(c, f, p))
})

func('findAllSeriesReleaseDates', () => {
  withFilters((it) => dao.findAllSeriesReleaseDates(it))
})

func('findAllSeriesReleaseDatesByLibraries', () => {
  withFilters((it) => dao.findAllSeriesReleaseDatesByLibraries(new Set(['L2']), it))
})

func('findAllSeriesReleaseDatesByCollection', () => {
  withFilters((it) => dao.findAllSeriesReleaseDatesByCollection('C1', it))
})

func('findSeriesReleaseYears', () => {
  generic(null, (c, _s, f, p) => dao.findSeriesReleaseYears(c, f, p))
})

func('findAllSharingLabels', () => {
  withFilters((it) => dao.findAllSharingLabels(it))
})

func('findAllSharingLabelsByLibraries', () => {
  withFilters((it) => dao.findAllSharingLabelsByLibraries(new Set(['L2']), it))
})

func('findAllSharingLabelsByCollection', () => {
  withFilters((it) => dao.findAllSharingLabelsByCollection('C2', it))
})

func('findSharingLabels', () => {
  generic('AD', (c, s, f, p) => dao.findSharingLabels(c, s, f, p))
})

func('toDomain@838', () => {
  kase('book author', () => dao.findAllAuthorsByName('Moore', null))
})

func('toDomain@844', () => {
  kase('aggregated author', () => dao.findAllAuthorsByNameAndSeries('', 'S3', null))
})
