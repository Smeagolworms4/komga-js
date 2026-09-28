// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/SeriesCollectionControllerOracleTest.kt
import { Author } from '../../../../../src/domain/model/Author.js'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { DuplicateNameException } from '../../../../../src/domain/model/Exceptions.js'
import { ReadStatus } from '../../../../../src/domain/model/ReadStatus.js'
import type { SeriesCollection } from '../../../../../src/domain/model/SeriesCollection.js'
import { SeriesMetadata } from '../../../../../src/domain/model/SeriesMetadata.js'
import { ThumbnailSeriesCollection } from '../../../../../src/domain/model/ThumbnailSeriesCollection.js'
import type { SeriesCollectionLifecycle } from '../../../../../src/domain/service/SeriesCollectionLifecycle.js'
import { ImageAnalyzer } from '../../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ContentDetector } from '../../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import type { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { SeriesCollectionController } from '../../../../../src/interfaces/api/rest/SeriesCollectionController.js'
import { CollectionCreationDto } from '../../../../../src/interfaces/api/rest/dto/CollectionCreationDto.js'
import { CollectionUpdateDto } from '../../../../../src/interfaces/api/rest/dto/CollectionUpdateDto.js'
import { MultipartFile } from '../../../../../src/port/servlet.js'
import { Order, PageRequest, type Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { TikaConfig } from '../../../../../src/port/tika.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { Calls, FIXED, PNG, entity, principal, publisher, thrown } from './rest-oracle.js'
import * as samples from './rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/SeriesCollectionController')

const db = new OracleDb()
const calls = new Calls()

/** Enregistre les appels (même faux côté Kotlin) */
const lifecycle = {
  getThumbnailBytes: async (c: SeriesCollection, userId: string) => {
    calls.add('getThumbnailBytes', c.id, userId)
    return new Uint8Array([7, 7])
  },
  addThumbnail: (t: ThumbnailSeriesCollection) => {
    calls.add('addThumbnail', t)
    return t
  },
  markSelectedThumbnail: (t: ThumbnailSeriesCollection) => calls.add('markSelectedThumbnail', t.id),
  deleteThumbnail: (t: ThumbnailSeriesCollection) => calls.add('deleteThumbnail', t.id),
  addCollection: (c: SeriesCollection) => {
    calls.add('addCollection', c)
    if (c.name === 'dup') throw new DuplicateNameException('Collection name already exists', 'ERR_1005')
    return c
  },
  updateCollection: (c: SeriesCollection) => {
    calls.add('updateCollection', c)
    if (c.name === 'dup') throw new DuplicateNameException('Collection name already exists', 'ERR_1005')
  },
  deleteCollection: (c: SeriesCollection) => calls.add('deleteCollection', c.id),
} as unknown as SeriesCollectionLifecycle

const c = new SeriesCollectionController(
  db.seriesCollectionDao,
  lifecycle,
  db.seriesDtoDao,
  new ContentDetector(new TikaConfig()),
  new ImageAnalyzer(),
  db.thumbnailSeriesCollectionDao,
  publisher(calls),
)
const admin = principal(samples.admin)
const all = principal(samples.all)
const l1 = principal(samples.l1Only)
const kids = principal(samples.kids)
const noAdult = principal(samples.noAdult)
const p20 = PageRequest.of(0, 20)

const thumb = (id: string, collectionId: string, selected: boolean) =>
  new ThumbnailSeriesCollection({
    thumbnail: new Uint8Array([1, 2, id.length]),
    selected,
    type: ThumbnailSeriesCollection.Type.USER_UPLOADED,
    mediaType: 'image/png',
    fileSize: 3,
    dimension: new Dimension({ width: 3, height: 2 }),
    id,
    collectionId,
    createdDate: FIXED,
  })

type SeriesArgs = {
  libraryIds?: string[] | null
  status?: SeriesMetadata.Status[] | null
  readStatus?: ReadStatus[] | null
  publishers?: string[] | null
  languages?: string[] | null
  genres?: string[] | null
  tags?: string[] | null
  ageRatings?: string[] | null
  releaseYears?: string[] | null
  deleted?: boolean | null
  complete?: boolean | null
  unpaged?: boolean
  authors?: Author[] | null
  page?: Pageable
}
const series = (id: string, p: KomgaPrincipal, a: SeriesArgs = {}) =>
  c.getSeriesByCollectionId(
    id,
    p,
    a.libraryIds ?? null,
    a.status ?? null,
    a.readStatus ?? null,
    a.publishers ?? null,
    a.languages ?? null,
    a.genres ?? null,
    a.tags ?? null,
    a.ageRatings ?? null,
    a.releaseYears ?? null,
    a.deleted ?? null,
    a.complete ?? null,
    a.unpaged ?? false,
    a.authors ?? null,
    a.page ?? p20,
  )
const update = (name: string | null, ordered: boolean | null, seriesIds: string[] | null) => new CollectionUpdateDto({ name, ordered, seriesIds })

func('getCollections', () => {
  kase('empty', () => c.getCollections(admin, null, null, false, p20))
  kase('admin, default sort by name', () => {
    samples.seed(db)
    db.thumbnailSeriesCollectionDao.insert(thumb('TC1', 'C1', true))
    db.thumbnailSeriesCollectionDao.insert(thumb('TC2', 'C1', false))
    db.thumbnailSeriesCollectionDao.insert(thumb('TC3', 'C2', true))
    return c.getCollections(admin, null, null, false, p20)
  })
  kase('sorted by name desc', () => c.getCollections(admin, null, null, false, PageRequest.of(0, 20, Sort.by(Order.desc('name')))))
  kase('paged', () => c.getCollections(admin, null, null, false, PageRequest.of(1, 1)))
  kase('unpaged', () => c.getCollections(admin, null, null, true, PageRequest.of(1, 1)))
  kase('library filter', () => c.getCollections(admin, null, ['L2'], false, p20))
  kase('library restricted', () => c.getCollections(l1, null, null, false, p20))
  kase('library restricted asks L2', () => c.getCollections(l1, null, ['L2'], false, p20))
  kase('age restricted', () => c.getCollections(kids, null, null, false, p20))
  kase('label restricted', () => c.getCollections(noAdult, null, null, false, p20))
  kase('blank search', () => c.getCollections(admin, ' ', null, false, p20))
})
func('getCollectionById', () => {
  kase('admin', () => c.getCollectionById(admin, 'C1'))
  kase('filtered for kids', () => c.getCollectionById(kids, 'C1'))
  kase('not visible', () => c.getCollectionById(l1, 'C2'))
  kase('unknown', () => c.getCollectionById(admin, 'CX'))
})
func('getCollectionThumbnail', () => {
  kase('ok', async () => [await entity(await c.getCollectionThumbnail(all, 'C1')), calls.take()])
  kase('not found', async () => [await exceptionType(() => c.getCollectionThumbnail(l1, 'C2')), calls.take()])
})
func('getCollectionThumbnailById', () => {
  kase('ok', () => c.getCollectionThumbnailById(admin, 'C1', 'TC2'))
  kase('thumbnail of other collection', () => c.getCollectionThumbnailById(admin, 'C1', 'TC3'))
  kase('unknown thumbnail', () => c.getCollectionThumbnailById(admin, 'C1', 'TX'))
  kase('collection not visible', () => c.getCollectionThumbnailById(l1, 'C2', 'TC3'))
})
func('getCollectionThumbnails', () => {
  kase('C1', () => c.getCollectionThumbnails(admin, 'C1'))
  kase('C2', () => c.getCollectionThumbnails(all, 'C2'))
  kase('not visible', () => c.getCollectionThumbnails(l1, 'C2'))
})
func('addUserUploadedCollectionThumbnail', () => {
  kase('png', () => [stable(c.addUserUploadedCollectionThumbnail(admin, 'C1', new MultipartFile('file', 'a.png', 'image/png', PNG))), calls.take()])
  kase('not selected', () => [stable(c.addUserUploadedCollectionThumbnail(admin, 'C2', new MultipartFile('file', 'a.png', null, PNG), false)), calls.take()])
  kase('not an image', async () => [
    await exceptionType(() => c.addUserUploadedCollectionThumbnail(admin, 'C1', new MultipartFile('file', 'a.txt', 'text/plain', new Uint8Array(Buffer.from('hello'))))),
    calls.take(),
  ])
  kase('empty file', () => c.addUserUploadedCollectionThumbnail(admin, 'C1', new MultipartFile('file', '', null, new Uint8Array(0))))
  kase('unknown collection', () => c.addUserUploadedCollectionThumbnail(admin, 'CX', new MultipartFile('file', 'a.png', 'image/png', PNG)))
})
func('markCollectionThumbnailSelected', () => {
  kase('ok', () => {
    c.markCollectionThumbnailSelected(admin, 'C1', 'TC2')
    return calls.take()
  })
  kase('other collection', async () => [await exceptionType(() => c.markCollectionThumbnailSelected(admin, 'C1', 'TC3')), calls.take()])
  kase('unknown thumbnail is ignored', () => [c.markCollectionThumbnailSelected(admin, 'C1', 'TX'), calls.take()])
  kase('unknown collection', () => c.markCollectionThumbnailSelected(admin, 'CX', 'TC1'))
})
func('deleteUserUploadedCollectionThumbnail', () => {
  kase('ok', () => {
    c.deleteUserUploadedCollectionThumbnail(admin, 'C1', 'TC1')
    return calls.take()
  })
  kase('other collection', () => c.deleteUserUploadedCollectionThumbnail(admin, 'C2', 'TC1'))
  kase('unknown thumbnail', () => c.deleteUserUploadedCollectionThumbnail(admin, 'C1', 'TX'))
  kase('unknown collection', () => c.deleteUserUploadedCollectionThumbnail(admin, 'CX', 'TC1'))
})
func('createCollection', () => {
  kase('ok', () => [stable(c.createCollection(new CollectionCreationDto({ name: 'New', ordered: true, seriesIds: ['S2', 'S1'] }))), calls.take()])
  kase('duplicate', async () => [await thrown(() => c.createCollection(new CollectionCreationDto({ name: 'dup', ordered: false, seriesIds: [] }))), calls.take()])
})
func('updateCollectionById', () => {
  kase('no change', () => {
    c.updateCollectionById(admin, 'C1', update(null, null, null))
    return calls.take()
  })
  kase('all fields', () => {
    c.updateCollectionById(admin, 'C1', update('Renamed', false, ['S1']))
    return calls.take()
  })
  kase('filtered for kids', () => {
    c.updateCollectionById(kids, 'C1', update('K', null, null))
    return calls.take()
  })
  kase('duplicate', async () => [await thrown(() => c.updateCollectionById(admin, 'C2', update('dup', null, null))), calls.take()])
  kase('not found', () => c.updateCollectionById(l1, 'C2', update('x', null, null)))
})
func('deleteCollectionById', () => {
  kase('ok', () => {
    c.deleteCollectionById(admin, 'C2')
    return calls.take()
  })
  kase('not found', () => c.deleteCollectionById(admin, 'CX'))
})
func('getSeriesByCollectionId', () => {
  kase('ordered collection, admin', () => series('C1', admin))
  kase('unordered collection, user url restricted', () => series('C2', all))
  kase('paged', () => series('C1', admin, { page: PageRequest.of(1, 1) }))
  kase('unpaged', () => series('C1', admin, { unpaged: true, page: PageRequest.of(1, 1) }))
  kase('kids', () => series('C1', kids))
  kase('library filter', () => series('C1', admin, { libraryIds: ['L2'] }))
  kase('status', () => series('C1', admin, { status: [SeriesMetadata.Status.ONGOING, SeriesMetadata.Status.ENDED] }))
  kase('read status', () => series('C1', all, { readStatus: [ReadStatus.IN_PROGRESS] }))
  kase('publisher', () => series('C1', admin, { publishers: ['pub2'] }))
  kase('language', () => series('C1', admin, { languages: ['EN'] }))
  kase('genre and tag', () => series('C1', admin, { genres: ['drama'], tags: ['t1'] }))
  kase('age ratings, invalid is null', () => series('C1', admin, { ageRatings: ['16', 'x'] }))
  kase('release years, invalid ignored', () => series('C1', admin, { releaseYears: ['2019', 'abc'] }))
  kase('deleted and complete', () => series('C1', admin, { deleted: false, complete: false }))
  kase('deleted true', () => series('C1', admin, { deleted: true }))
  kase('authors', () => series('C1', admin, { authors: [new Author({ name: 'Author S2', role: 'writer' })] }))
  kase('not visible', () => series('C2', l1))
})
