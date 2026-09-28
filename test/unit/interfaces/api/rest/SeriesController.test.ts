// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/SeriesControllerOracleTest.kt
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Author } from '../../../../../src/domain/model/Author.js'
import { Book } from '../../../../../src/domain/model/Book.js'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import type { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import type { MarkSelectedPreference } from '../../../../../src/domain/model/MarkSelectedPreference.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { ReadStatus } from '../../../../../src/domain/model/ReadStatus.js'
import { SeriesMetadata } from '../../../../../src/domain/model/SeriesMetadata.js'
import { SeriesSearch } from '../../../../../src/domain/model/SeriesSearch.js'
import { ThumbnailSeries } from '../../../../../src/domain/model/ThumbnailSeries.js'
import type { BookLifecycle } from '../../../../../src/domain/service/BookLifecycle.js'
import type { SeriesLifecycle } from '../../../../../src/domain/service/SeriesLifecycle.js'
import { ImageAnalyzer } from '../../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ContentDetector } from '../../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import type { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { ContentRestrictionChecker } from '../../../../../src/interfaces/api/ContentRestrictionChecker.js'
import { SeriesController } from '../../../../../src/interfaces/api/rest/SeriesController.js'
import { TachiyomiReadProgressUpdateV2Dto } from '../../../../../src/interfaces/api/rest/dto/TachiyomiReadProgressUpdateDto.js'
import { URL } from '../../../../../src/port/java-net.js'
import { IllegalArgumentException, kFloat } from '../../../../../src/port/kotlin.js'
import { MultipartFile } from '../../../../../src/port/servlet.js'
import { Order, PageRequest, type Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { TikaConfig } from '../../../../../src/port/tika.js'
import { OracleDb } from '../../../db.js'
import { oracle, oracleBytes, stable, tempDir } from '../../../oracle.js'
import { Calls, FIXED, PNG, bodyBytes, principal, publisher, read, taskEmitter, tasks, thrown, zipSummary } from './rest-oracle.js'
import * as samples from './rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/SeriesController')

const db = new OracleDb()
const calls = new Calls()

/** Enregistre les appels (mêmes faux côté Kotlin) */
const seriesLifecycle = {
  getThumbnailBytes: async (seriesId: string, userId: string) => {
    calls.add('getThumbnailBytes', seriesId, userId)
    return seriesId === 'S3' ? null : new Uint8Array([9])
  },
  getThumbnailBytesByThumbnailId: (id: string) => {
    calls.add('getThumbnailBytesByThumbnailId', id)
    return id === 'TS2' ? null : new Uint8Array([8])
  },
  addThumbnailForSeries: (t: ThumbnailSeries, pref: MarkSelectedPreference) => {
    calls.add('addThumbnailForSeries', t, pref)
    return t
  },
  deleteThumbnailForSeries: (t: ThumbnailSeries) => {
    calls.add('deleteThumbnailForSeries', t.id)
    if (t.selected) throw new IllegalArgumentException('selected thumbnail cannot be deleted')
  },
  markReadProgressCompleted: (seriesId: string, user: KomgaUser) => calls.add('markReadProgressCompleted', seriesId, user.id),
  deleteReadProgress: (seriesId: string, user: KomgaUser) => calls.add('deleteReadProgress', seriesId, user.id),
} as unknown as SeriesLifecycle
const bookLifecycle = {
  markReadProgressCompleted: (bookId: string, user: KomgaUser) => calls.add('markReadProgressCompleted', bookId, user.id),
} as unknown as BookLifecycle

const c = new SeriesController(
  taskEmitter(db, calls),
  db.seriesDao,
  seriesLifecycle,
  db.seriesMetadataDao,
  db.seriesDtoDao,
  bookLifecycle,
  db.bookDao,
  db.bookDtoDao,
  db.seriesCollectionDao,
  db.readProgressDtoDao,
  publisher(calls),
  new ContentDetector(new TikaConfig()),
  new ImageAnalyzer(),
  db.thumbnailSeriesDao,
  new ContentRestrictionChecker(db.seriesMetadataDao, db.bookDao, db.thumbnailBookDao, db.seriesDao, db.thumbnailSeriesDao),
)
const admin = principal(samples.admin)
const all = principal(samples.all)
const l1 = principal(samples.l1Only)
const kids = principal(samples.kids)
const noAdult = principal(samples.noAdult)
const p20 = PageRequest.of(0, 20)

const thumb = (id: string, seriesId: string, selected: boolean) =>
  new ThumbnailSeries({
    thumbnail: new Uint8Array([4, id.length]),
    selected,
    type: ThumbnailSeries.Type.USER_UPLOADED,
    mediaType: 'image/png',
    fileSize: 2,
    dimension: new Dimension({ width: 3, height: 2 }),
    id,
    seriesId,
    createdDate: FIXED,
  })
const search = (src: string) => read<SeriesSearch>(src, { class: SeriesSearch })
const file = (bytes: Uint8Array, name = '', contentType: string | null = null) => new MultipartFile('file', name, contentType, bytes)
const mihon = (n: number) => new TachiyomiReadProgressUpdateV2Dto({ lastBookNumberSortRead: kFloat(n) })

type DeprecatedArgs = {
  searchTerm?: string | null
  searchRegex?: [string, string] | null
  libraryIds?: string[] | null
  collectionIds?: string[] | null
  status?: SeriesMetadata.Status[] | null
  readStatus?: ReadStatus[] | null
  publishers?: string[] | null
  languages?: string[] | null
  genres?: string[] | null
  tags?: string[] | null
  ageRatings?: string[] | null
  releaseYears?: string[] | null
  sharingLabels?: string[] | null
  deleted?: boolean | null
  complete?: boolean | null
  oneshot?: boolean | null
  unpaged?: boolean
  authors?: Author[] | null
  page?: Pageable
  groups?: boolean
}
const deprecated = (p: KomgaPrincipal, a: DeprecatedArgs = {}) =>
  a.groups
    ? c.getSeriesAlphabeticalGroupsDeprecated(
        p,
        a.searchTerm ?? null,
        a.searchRegex ?? null,
        a.libraryIds ?? null,
        a.collectionIds ?? null,
        a.status ?? null,
        a.readStatus ?? null,
        a.publishers ?? null,
        a.languages ?? null,
        a.genres ?? null,
        a.tags ?? null,
        a.ageRatings ?? null,
        a.releaseYears ?? null,
        a.sharingLabels ?? null,
        a.deleted ?? null,
        a.complete ?? null,
        a.oneshot ?? null,
        a.authors ?? null,
        a.page ?? p20,
      )
    : c.getSeriesDeprecated(
        p,
        a.searchTerm ?? null,
        a.searchRegex ?? null,
        a.libraryIds ?? null,
        a.collectionIds ?? null,
        a.status ?? null,
        a.readStatus ?? null,
        a.publishers ?? null,
        a.languages ?? null,
        a.genres ?? null,
        a.tags ?? null,
        a.ageRatings ?? null,
        a.releaseYears ?? null,
        a.sharingLabels ?? null,
        a.deleted ?? null,
        a.complete ?? null,
        a.oneshot ?? null,
        a.unpaged ?? false,
        a.authors ?? null,
        a.page ?? p20,
      )

func('getSeriesDeprecated', () => {
  kase('empty', () => deprecated(admin))
  kase('admin, unsorted', () => {
    samples.seed(db)
    db.thumbnailSeriesDao.insert(thumb('TS1', 'S1', true))
    db.thumbnailSeriesDao.insert(thumb('TS2', 'S1', false))
    db.thumbnailSeriesDao.insert(thumb('TS3', 'S2', true))
    return deprecated(admin)
  })
  kase('user, sorted by title desc', () => deprecated(all, { page: PageRequest.of(0, 20, Sort.by(Order.desc('metadata.titleSort'))) }))
  kase('paged', () => deprecated(admin, { page: PageRequest.of(1, 2, Sort.by('name')) }))
  kase('unpaged', () => deprecated(admin, { unpaged: true, page: PageRequest.of(1, 1, Sort.by('name')) }))
  kase('regex title', () => deprecated(admin, { searchRegex: ['^[ab]', 'TITLE'] }))
  kase('regex title_sort', () => deprecated(admin, { searchRegex: ['a$', 'title_sort'] }))
  kase('regex unknown field', () => deprecated(admin, { searchRegex: ['x', 'other'] }))
  kase('libraries and collections', () => deprecated(admin, { libraryIds: ['L1'], collectionIds: ['C1', 'C2'] }))
  kase('metadata filters', () =>
    deprecated(admin, { status: [SeriesMetadata.Status.ONGOING], publishers: ['Pub1', 'pub2'], languages: ['en'], genres: ['action'], tags: ['t1'] }),
  )
  kase('read status', () => deprecated(all, { readStatus: [ReadStatus.IN_PROGRESS] }))
  kase('authors', () => deprecated(admin, { authors: [new Author({ name: 'Author S3', role: 'writer' })] }))
  kase('age ratings and years', () => deprecated(admin, { ageRatings: ['10', 'none'], releaseYears: ['2019', 'x'] }))
  kase('sharing labels', () => deprecated(admin, { sharingLabels: ['kids'] }))
  kase('flags', () => deprecated(admin, { oneshot: false, complete: false, deleted: false }))
  kase('oneshot true', () => deprecated(admin, { oneshot: true }))
  kase('restricted users', () => [deprecated(l1), deprecated(kids), deprecated(noAdult)])
})
func('getSeries', () => {
  kase('empty search', () => c.getSeries(admin, search('{}'), false, p20))
  kase('condition', () => c.getSeries(all, search('{"condition":{"libraryId":{"operator":"is","value":"L1"}}}'), false, PageRequest.of(0, 1, Sort.by('metadata.titleSort'))))
  kase('anyOf', () =>
    c.getSeries(admin, search('{"condition":{"anyOf":[{"libraryId":{"operator":"is","value":"L2"}},{"title":{"operator":"beginsWith","value":"al"}}]}}'), false, p20),
  )
  kase('unpaged', () => c.getSeries(kids, search('{}'), true, PageRequest.of(2, 1)))
})
func('getSeriesAlphabeticalGroupsDeprecated', () => {
  kase('admin', () => deprecated(admin, { groups: true }))
  kase('filters', () => deprecated(admin, { libraryIds: ['L1'], groups: true }))
  kase('kids', () => deprecated(kids, { groups: true }))
  kase('regex', () => deprecated(admin, { searchRegex: ['^O', 'title'], groups: true }))
})
func('getSeriesAlphabeticalGroups', () => {
  kase('admin', () => c.getSeriesAlphabeticalGroups(admin, search('{}')))
  kase('condition', () => c.getSeriesAlphabeticalGroups(l1, search('{"condition":{"deleted":{"operator":"isFalse"}}}')))
})
func('getSeriesLatest', () => {
  kase('admin', () => c.getSeriesLatest(admin, null, null, null, false, p20))
  kase('filters', () => c.getSeriesLatest(all, ['L1'], false, false, false, p20))
  kase('unpaged', () => c.getSeriesLatest(kids, null, null, true, true, PageRequest.of(3, 1)))
})
func('getSeriesNew', () => {
  kase('admin', () => c.getSeriesNew(admin, null, null, null, false, p20))
  kase('filters', () => c.getSeriesNew(all, ['L2'], false, null, false, PageRequest.of(0, 1)))
  kase('deleted', () => c.getSeriesNew(admin, null, true, null, false, p20))
})
func('getSeriesUpdated', () => {
  kase('admin', () => c.getSeriesUpdated(admin, null, null, null, false, p20))
  kase('filters', () => c.getSeriesUpdated(all, ['L1'], false, false, true, p20))
})
func('getSeriesById', () => {
  kase('admin', () => c.getSeriesById(admin, 'S1'))
  kase('user', () => c.getSeriesById(all, 'S3'))
  kase('with read progress', () => c.getSeriesById(all, 'S1'))
  kase('library restricted', () => c.getSeriesById(l1, 'S3'))
  kase('age restricted', () => c.getSeriesById(kids, 'S2'))
  kase('unknown', () => c.getSeriesById(admin, 'SX'))
})
func('getSeriesThumbnail', () => {
  kase('ok', async () => [await c.getSeriesThumbnail(all, 'S1'), calls.take()])
  kase('none', async () => [await thrown(() => c.getSeriesThumbnail(admin, 'S3')), calls.take()])
  kase('restricted', async () => [await thrown(() => c.getSeriesThumbnail(kids, 'S2')), calls.take()])
  kase('unknown series', async () => [await thrown(() => c.getSeriesThumbnail(admin, 'SX')), calls.take()])
})
func('getSeriesThumbnailById', () => {
  kase('ok', () => [c.getSeriesThumbnailById(admin, 'S1', 'TS1'), calls.take()])
  kase('no bytes', async () => [await thrown(() => c.getSeriesThumbnailById(admin, 'S1', 'TS2')), calls.take()])
  kase('thumbnail restricted', async () => [await thrown(() => c.getSeriesThumbnailById(kids, 'S1', 'TS3')), calls.take()])
  kase('unknown thumbnail', async () => [await thrown(() => c.getSeriesThumbnailById(admin, 'S1', 'TX')), calls.take()])
})
func('getSeriesThumbnails', () => {
  kase('S1', () => c.getSeriesThumbnails(admin, 'S1'))
  kase('none', () => c.getSeriesThumbnails(admin, 'S3'))
  kase('restricted', () => c.getSeriesThumbnails(l1, 'S3'))
})
func('addUserUploadedSeriesThumbnail', () => {
  kase('selected', () => [stable(c.addUserUploadedSeriesThumbnail('S1', file(PNG, 'a.png', 'image/png'))), calls.take()])
  kase('not selected', () => [stable(c.addUserUploadedSeriesThumbnail('S2', file(PNG), false)), calls.take()])
  kase('oneshot', () => c.addUserUploadedSeriesThumbnail('S3', file(PNG)))
  kase('not an image', () => c.addUserUploadedSeriesThumbnail('S1', file(new Uint8Array(Buffer.from('abc')))))
  kase('unknown series', () => c.addUserUploadedSeriesThumbnail('SX', file(PNG)))
})
func('markSeriesThumbnailSelected', () => {
  kase('ok', () => {
    c.markSeriesThumbnailSelected('S1', 'TS2')
    return [calls.take(), db.thumbnailSeriesDao.findAllBySeriesId('S1').map((it) => [it.id, it.selected])]
  })
  kase('other series', () => c.markSeriesThumbnailSelected('S2', 'TS1'))
  kase('unknown thumbnail', () => c.markSeriesThumbnailSelected('S1', 'TX'))
  kase('unknown series', () => c.markSeriesThumbnailSelected('SX', 'TS1'))
})
func('deleteUserUploadedSeriesThumbnail', () => {
  kase('ok', () => {
    c.deleteUserUploadedSeriesThumbnail('S1', 'TS1')
    return calls.take()
  })
  kase('illegal argument', async () => [await thrown(() => c.deleteUserUploadedSeriesThumbnail('S1', 'TS2')), calls.take()])
  kase('other series', () => c.deleteUserUploadedSeriesThumbnail('S2', 'TS1'))
  kase('unknown thumbnail', () => c.deleteUserUploadedSeriesThumbnail('S1', 'TX'))
  kase('unknown series', () => c.deleteUserUploadedSeriesThumbnail('SX', 'TS1'))
})
const _ = undefined
func('getBooksBySeriesId', () => {
  kase('admin', () => c.getBooksBySeriesId(admin, 'S1', _, _, _, _, _, _, p20))
  kase('user sorted desc', () => c.getBooksBySeriesId(all, 'S1', _, _, _, _, _, _, PageRequest.of(0, 20, Sort.by(Order.desc('metadata.numberSort')))))
  kase('paged', () => c.getBooksBySeriesId(admin, 'S1', _, _, _, _, _, _, PageRequest.of(1, 1)))
  kase('unpaged', () => c.getBooksBySeriesId(admin, 'S1', _, _, _, _, true, _, PageRequest.of(1, 1)))
  kase('filters', () =>
    c.getBooksBySeriesId(
      all,
      'S1',
      [Media.Status.READY],
      [ReadStatus.UNREAD, ReadStatus.IN_PROGRESS],
      ['bt2'],
      false,
      false,
      [new Author({ name: 'Pen B2', role: 'penciller' })],
      p20,
    ),
  )
  kase('restricted', () => c.getBooksBySeriesId(kids, 'S2', _, _, _, _, _, _, p20))
  kase('unknown series', () => c.getBooksBySeriesId(admin, 'SX', _, _, _, _, _, _, p20))
})
func('getCollectionsBySeriesId', () => {
  kase('S1', () => c.getCollectionsBySeriesId(admin, 'S1'))
  kase('S3', () => c.getCollectionsBySeriesId(all, 'S3'))
  kase('kids', () => c.getCollectionsBySeriesId(kids, 'S1'))
  kase('restricted', () => c.getCollectionsBySeriesId(l1, 'S3'))
})
func('seriesAnalyze', () => {
  kase('S1', () => {
    c.seriesAnalyze('S1')
    return [tasks(db), calls.take()]
  })
  kase('unknown', () => {
    c.seriesAnalyze('SX')
    return [tasks(db), calls.take()]
  })
})
func('seriesRefreshMetadata', () => {
  kase('S1', () => {
    c.seriesRefreshMetadata('S1')
    return [tasks(db), calls.take()]
  })
  kase('unknown', () => {
    c.seriesRefreshMetadata('SX')
    return [tasks(db), calls.take()]
  })
})
func('markSeriesAsRead', () => {
  kase('ok', () => {
    c.markSeriesAsRead('S1', all)
    return calls.take()
  })
  kase('restricted', async () => [await thrown(() => c.markSeriesAsRead('S2', kids)), calls.take()])
})
func('markSeriesAsUnread', () => {
  kase('ok', () => {
    c.markSeriesAsUnread('S2', all)
    return calls.take()
  })
  kase('restricted', async () => [await thrown(() => c.markSeriesAsUnread('S2', noAdult)), calls.take()])
})
func('getMihonReadProgressBySeriesId', () => {
  kase('with progress', () => c.getMihonReadProgressBySeriesId('S1', all))
  kase('no progress', () => c.getMihonReadProgressBySeriesId('S2', l1))
  kase('restricted', () => c.getMihonReadProgressBySeriesId('S3', l1))
})
func('updateMihonReadProgressBySeriesId', () => {
  kase('up to 1', () => {
    c.updateMihonReadProgressBySeriesId('S1', mihon(1), all)
    return calls.take()
  })
  kase('up to 2.5', () => {
    c.updateMihonReadProgressBySeriesId('S1', mihon(2.5), all)
    return calls.take()
  })
  kase('user without progress', () => {
    c.updateMihonReadProgressBySeriesId('S1', mihon(1.5), l1)
    return calls.take()
  })
  kase('restricted', async () => [await thrown(() => c.updateMihonReadProgressBySeriesId('S2', mihon(1), kids)), calls.take()])
})
func('downloadSeriesAsZip', () => {
  kase('existing and missing files', async () => {
    const f = join(tempDir(), 'series-file.cbz')
    writeFileSync(f, oracleBytes(2000))
    db.bookDao.insert(new Book({ name: 'file', url: new URL(`file:${f}`), fileLastModified: FIXED, id: 'B6', seriesId: 'S2', libraryId: 'L1', createdDate: FIXED }))
    const e = c.downloadSeriesAsZip(admin, 'S2')
    return [e.statusCode, e.headers.getFirst('Content-Disposition'), e.headers.getFirst('Content-Type'), zipSummary(await bodyBytes(e))]
  })
  kase('no file', async () => {
    const e = c.downloadSeriesAsZip(all, 'S3')
    return [e.headers.getFirst('Content-Disposition'), zipSummary(await bodyBytes(e))]
  })
  kase('restricted', () => c.downloadSeriesAsZip(kids, 'S2'))
})
func('deleteSeriesFile', () => {
  kase('S1', () => {
    c.deleteSeriesFile('S1')
    return [tasks(db), calls.take()]
  })
  kase('unknown', () => {
    c.deleteSeriesFile('SX')
    return tasks(db)
  })
})
