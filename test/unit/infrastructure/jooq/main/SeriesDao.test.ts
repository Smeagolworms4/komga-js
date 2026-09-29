// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/SeriesDaoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { SearchContext } from '../../../../../src/domain/model/SearchContext.js'
import { Series } from '../../../../../src/domain/model/Series.js'
import { URL } from '../../../../../src/port/java-net.js'
import { type Page, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { allSeries, seed, seriesConditions, u1, u2, u3, u4 } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/SeriesDao')

const db = new OracleDb()
const dao = db.seriesDao

const sorted = (l: string[]) => [...l].sort()
const res = (p: Page<Series>) => [sorted(p.content.map((it) => it.id)), p.totalElements, p.number, p.size]
const sortedMap = <V>(m: Map<string, V>) => new Map([...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
const cond = (name: string) => seriesConditions.find((it) => it[0] === name)![1]
const tmp = (id: string, name: string, lib: string) =>
  new Series({ name, url: new URL(`file:/${name}`), fileLastModified: LocalDateTime.of(2020, 1, 1, 0, 0), id, libraryId: lib })

func('count', () => {
  kase('empty', () => dao.count())
})

func('insert', () => {
  kase('seed', async () => {
    await seed(db)
    return dao.count()
  })
  kase('stored values', () => db.rawQuery('select ID, NAME, URL, FILE_LAST_MODIFIED, LIBRARY_ID, BOOK_COUNT, DELETED_DATE, ONESHOT from SERIES order by ID'))
  kase('duplicate id', () => exceptionType(() => dao.insert(allSeries[0]!)))
  kase('unknown library', () =>
    exceptionType(() =>
      dao.insert(new Series({ name: 'x', url: new URL('file:/x'), fileLastModified: LocalDateTime.of(2020, 1, 1, 0, 0), id: 'SX', libraryId: 'NOPE' })),
    ),
  )
})

func('findAll@42', () => {
  kase('all', () => sorted(dao.findAll().map((it) => it.id)))
})

func('findByIdOrNull', () => {
  kase('existing', () => dao.findByIdOrNull('S1'))
  kase('deleted oneshot', () => [dao.findByIdOrNull('S4'), dao.findByIdOrNull('S5')])
  kase('missing', () => dao.findByIdOrNull('NOPE'))
})

func('toDomain', () => {
  kase('dates converted to current time zone', () => {
    const it = dao.findByIdOrNull('S2')!
    return [it.createdDate, it.lastModifiedDate, it.fileLastModified, it.path]
  })
})

func('findAllByLibraryId', () => {
  kase('L1', () => sorted(dao.findAllByLibraryId('L1').map((it) => it.id)))
  kase('unknown', () => dao.findAllByLibraryId('NOPE'))
})

func('findAllNotDeletedByLibraryIdAndUrlNotIn', () => {
  kase('empty list', () => sorted(dao.findAllNotDeletedByLibraryIdAndUrlNotIn('L2', []).map((it) => it.id)))
  kase('some urls', () => dao.findAllNotDeletedByLibraryIdAndUrlNotIn('L2', [new URL('file:/lib2/Naruto')]).map((it) => it.id))
  kase('url of another library', () => sorted(dao.findAllNotDeletedByLibraryIdAndUrlNotIn('L1', [new URL('file:/lib2/Naruto')]).map((it) => it.id)))
  kase('large list', () =>
    sorted(
      dao
        .findAllNotDeletedByLibraryIdAndUrlNotIn('L1', [
          ...Array.from({ length: 2100 }, (_, i) => new URL(`file:/lib1/x${i + 1}`)),
          new URL('file:/lib1/%C3%89lan'),
          new URL('file:/lib1/Élan'),
        ])
        .map((it) => it.id),
    ),
  )
})

func('findNotDeletedByLibraryIdAndUrlOrNull', () => {
  kase('existing', () => dao.findNotDeletedByLibraryIdAndUrlOrNull('L1', new URL('file:/lib1/Batman'))?.id ?? null)
  kase('deleted', () => dao.findNotDeletedByLibraryIdAndUrlOrNull('L2', new URL('file:/lib2/zorro')))
  kase('wrong library', () => dao.findNotDeletedByLibraryIdAndUrlOrNull('L2', new URL('file:/lib1/Batman')))
  kase('unicode url', () => dao.findNotDeletedByLibraryIdAndUrlOrNull('L2', new URL('file:/lib2/Ångström'))?.id ?? null)
})

func('findAllByTitleContaining', () => {
  kase('ascii ignoring case', () => sorted(dao.findAllByTitleContaining('AN').map((it) => it.id)))
  kase('accented', () => dao.findAllByTitleContaining('élan').map((it) => it.id))
  kase('accented upper', () => dao.findAllByTitleContaining('Élan').map((it) => it.id))
  kase('japanese', () => dao.findAllByTitleContaining('ナル').map((it) => it.id))
  kase('percent', () => dao.findAllByTitleContaining('%'))
  kase('underscore', () => dao.findAllByTitleContaining('_'))
  kase('empty', () => sorted(dao.findAllByTitleContaining('').map((it) => it.id)))
})

func('getLibraryId', () => {
  kase('existing', () => dao.getLibraryId('S3'))
  kase('missing', () => dao.getLibraryId('NOPE'))
})

func('findAllIdsByLibraryId', () => {
  kase('L2', () => sorted(dao.findAllIdsByLibraryId('L2')))
  kase('unknown', () => dao.findAllIdsByLibraryId('NOPE'))
})

func('countGroupedByLibraryId', () => {
  kase('all', () => sortedMap(dao.countGroupedByLibraryId()))
})

func('findAll@115', () => {
  const unpaged = Pageable.unpaged()
  for (const [name, c] of seriesConditions) {
    kase(`admin: ${name}`, () => res(dao.findAll(c, new SearchContext(u1), unpaged)))
  }
  kase('anonymous with read status', () => res(dao.findAll(cond('read status is unread'), SearchContext.empty(), unpaged)))
  kase('age restricted user', () => res(dao.findAll(null, new SearchContext(u2), unpaged)))
  kase('label excluded user in one library', () => res(dao.findAll(null, new SearchContext(u3), unpaged)))
  kase('age excluded or label allowed user', () => res(dao.findAll(null, new SearchContext(u4), unpaged)))
  kase('restricted user with condition', () => res(dao.findAll(cond('library is not'), new SearchContext(u4), unpaged)))
  kase('paged first page', () => {
    const it = dao.findAll(null, new SearchContext(u1), PageRequest.of(0, 4))
    return [it.content.length, it.totalElements, it.number, it.size, it.totalPages]
  })
  kase('paged last page', () => {
    const it = dao.findAll(null, new SearchContext(u1), PageRequest.of(1, 4, Sort.by('name')))
    return [it.content.length, it.totalElements, it.number, it.size, it.sort.isSorted]
  })
  kase('page after the end', () => res(dao.findAll(null, new SearchContext(u1), PageRequest.of(5, 4))))
})

func('update', () => {
  kase('default updates modified time', () => {
    dao.update(allSeries[1]!.copy({ name: 'Élan renamed', bookCount: 9, oneshot: true }))
    return [stable(dao.findByIdOrNull('S2')), db.rawQuery("select NAME, BOOK_COUNT, ONESHOT from SERIES where ID = 'S2'")]
  })
  kase('without modified time', () => {
    dao.update(dao.findByIdOrNull('S6')!.copy({ deletedDate: LocalDateTime.of(2022, 2, 2, 2, 2), url: new URL('file:/lib2/moved') }), { updateModifiedTime: false })
    return dao.findByIdOrNull('S6')
  })
  kase('missing', () => {
    dao.update(allSeries[0]!.copy({ id: 'NOPE' }))
    return dao.count()
  })
})

func('delete@193', () => {
  kase('series without books', () => {
    dao.insert(tmp('TMP', 'tmp', 'L1'))
    dao.delete('TMP')
    return dao.findByIdOrNull('TMP')
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return dao.count()
  })
  kase('series with books', () => exceptionType(() => dao.delete('S1')))
})

func('delete@202', () => {
  kase('empty', () => {
    dao.delete([])
    return dao.count()
  })
  kase('several with large list', () => {
    for (let i = 1; i <= 3; i++) dao.insert(tmp(`TMP${i}`, `tmp${i}`, 'L2'))
    dao.delete([...Array.from({ length: 1200 }, (_, i) => `X${i + 1}`), 'TMP1', 'TMP3'])
    return sorted(dao.findAllIdsByLibraryId('L2'))
  })
})

func('deleteAll', () => {
  kase('with books', () => exceptionType(() => dao.deleteAll()))
  kase('after removing dependants', () => {
    for (const t of [
      'READ_PROGRESS_SERIES',
      'READ_PROGRESS',
      'READLIST_BOOK',
      'THUMBNAIL_BOOK',
      'MEDIA_PAGE',
      'MEDIA',
      'BOOK_METADATA_AUTHOR',
      'BOOK_METADATA_TAG',
      'BOOK_METADATA',
      'BOOK',
      'COLLECTION_SERIES',
    ])
      db.dsl.execute(`delete from ${t}`)
    for (const t of [
      'SERIES_METADATA_GENRE',
      'SERIES_METADATA_TAG',
      'SERIES_METADATA_SHARING',
      'SERIES_METADATA_LINK',
      'SERIES_METADATA_ALTERNATE_TITLE',
      'SERIES_METADATA',
    ])
      db.dsl.execute(`delete from ${t}`)
    for (const t of ['BOOK_METADATA_AGGREGATION_AUTHOR', 'BOOK_METADATA_AGGREGATION_TAG', 'BOOK_METADATA_AGGREGATION']) db.dsl.execute(`delete from ${t}`)
    dao.deleteAll()
    return [dao.count(), dao.countGroupedByLibraryId()]
  })
})
