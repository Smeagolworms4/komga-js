// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/ReadListControllerOracleTest.kt
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Author } from '../../../../../src/domain/model/Author.js'
import { Book } from '../../../../../src/domain/model/Book.js'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { ComicRackListException, DuplicateNameException } from '../../../../../src/domain/model/Exceptions.js'
import type { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { ReadList } from '../../../../../src/domain/model/ReadList.js'
import { ReadListMatch, ReadListRequestMatch } from '../../../../../src/domain/model/ReadListRequest.js'
import { ReadStatus } from '../../../../../src/domain/model/ReadStatus.js'
import { ThumbnailReadList } from '../../../../../src/domain/model/ThumbnailReadList.js'
import type { BookLifecycle } from '../../../../../src/domain/service/BookLifecycle.js'
import type { ReadListLifecycle } from '../../../../../src/domain/service/ReadListLifecycle.js'
import { ImageAnalyzer } from '../../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ContentDetector } from '../../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import type { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { ReadListController } from '../../../../../src/interfaces/api/rest/ReadListController.js'
import { ReadListCreationDto } from '../../../../../src/interfaces/api/rest/dto/ReadListCreationDto.js'
import { ReadListUpdateDto } from '../../../../../src/interfaces/api/rest/dto/ReadListUpdateDto.js'
import { TachiyomiReadProgressUpdateDto } from '../../../../../src/interfaces/api/rest/dto/TachiyomiReadProgressUpdateDto.js'
import { sortedMapOf } from '../../../../../src/port/extra-metadata.js'
import { URL } from '../../../../../src/port/java-net.js'
import { MultipartFile } from '../../../../../src/port/servlet.js'
import { Order, PageRequest, type Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { TikaConfig } from '../../../../../src/port/tika.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, oracleBytes, stable, tempDir } from '../../../oracle.js'
import { Calls, FIXED, PNG, bodyBytes, entity, principal, publisher, thrown, zipSummary } from './rest-oracle.js'
import * as samples from './rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/ReadListController')

const db = new OracleDb()
const calls = new Calls()

/** Enregistre les appels (mêmes faux côté Kotlin) */
const lifecycle = {
  getThumbnailBytes: async (r: ReadList) => {
    calls.add('getThumbnailBytes', r.id)
    return new Uint8Array([5])
  },
  addThumbnail: (t: ThumbnailReadList) => {
    calls.add('addThumbnail', t)
    return t
  },
  markSelectedThumbnail: (t: ThumbnailReadList) => calls.add('markSelectedThumbnail', t.id),
  deleteThumbnail: (t: ThumbnailReadList) => calls.add('deleteThumbnail', t.id),
  addReadList: (r: ReadList) => {
    calls.add('addReadList', r)
    if (r.name === 'dup') throw new DuplicateNameException('Read list name already exists', 'ERR_1009')
    return r
  },
  updateReadList: (r: ReadList) => {
    calls.add('updateReadList', r)
    if (r.name === 'dup') throw new DuplicateNameException('Read list name already exists', 'ERR_1009')
  },
  deleteReadList: (r: ReadList) => calls.add('deleteReadList', r.id),
  matchComicRackList: (bytes: Uint8Array) => {
    calls.add('matchComicRackList', bytes)
    if (bytes.length === 0) throw new ComicRackListException('empty', 'ERR_1029')
    return new ReadListRequestMatch({ readListMatch: new ReadListMatch({ name: Buffer.from(bytes).toString('utf8'), errorCode: '' }), requests: [] })
  },
} as unknown as ReadListLifecycle
const bookLifecycle = {
  markReadProgressCompleted: (bookId: string, user: KomgaUser) => calls.add('markReadProgressCompleted', bookId, user.id),
} as unknown as BookLifecycle

const c = new ReadListController(
  db.readListDao,
  lifecycle,
  db.bookDtoDao,
  db.bookDao,
  db.readProgressDtoDao,
  db.thumbnailReadListDao,
  new ContentDetector(new TikaConfig()),
  new ImageAnalyzer(),
  bookLifecycle,
  publisher(calls),
)
const admin = principal(samples.admin)
const all = principal(samples.all)
const l1 = principal(samples.l1Only)
const kids = principal(samples.kids)
const p20 = PageRequest.of(0, 20)

const thumb = (id: string, readListId: string, selected: boolean) =>
  new ThumbnailReadList({
    thumbnail: new Uint8Array([3, id.length]),
    selected,
    type: ThumbnailReadList.Type.USER_UPLOADED,
    mediaType: 'image/png',
    fileSize: 2,
    dimension: new Dimension({ width: 3, height: 2 }),
    id,
    readListId,
    createdDate: FIXED,
  })

type BooksArgs = {
  libraryIds?: string[] | null
  readStatus?: ReadStatus[] | null
  tags?: string[] | null
  mediaStatus?: Media.Status[] | null
  deleted?: boolean | null
  unpaged?: boolean
  authors?: Author[] | null
  page?: Pageable
}
const books = (id: string, p: KomgaPrincipal, a: BooksArgs = {}) =>
  c.getBooksByReadListId(id, p, a.libraryIds ?? null, a.readStatus ?? null, a.tags ?? null, a.mediaStatus ?? null, a.deleted ?? null, a.unpaged ?? false, a.authors ?? null, a.page ?? p20)
const update = (name: string | null, summary: string | null, bookIds: string[] | null, ordered: boolean | null) => new ReadListUpdateDto({ name, summary, bookIds, ordered })
const mihon = (lastBookRead: number) => new TachiyomiReadProgressUpdateDto({ lastBookRead })
const file = (bytes: Uint8Array, name = '', contentType: string | null = null) => new MultipartFile('file', name, contentType, bytes)

func('getReadLists', () => {
  kase('empty', () => c.getReadLists(admin, null, null, false, p20))
  kase('admin', () => {
    samples.seed(db)
    db.thumbnailReadListDao.insert(thumb('TR1', 'R1', true))
    db.thumbnailReadListDao.insert(thumb('TR2', 'R1', false))
    db.thumbnailReadListDao.insert(thumb('TR3', 'R2', true))
    return c.getReadLists(admin, null, null, false, p20)
  })
  kase('sorted desc', () => c.getReadLists(admin, null, null, false, PageRequest.of(0, 20, Sort.by(Order.desc('name')))))
  kase('paged', () => c.getReadLists(admin, null, null, false, PageRequest.of(1, 1)))
  kase('unpaged', () => c.getReadLists(admin, null, null, true, PageRequest.of(1, 1)))
  kase('library filter', () => c.getReadLists(admin, null, ['L2'], false, p20))
  kase('restricted', () => c.getReadLists(l1, null, null, false, p20))
  kase('kids', () => c.getReadLists(kids, null, null, false, p20))
  kase('blank search', () => c.getReadLists(admin, '', null, false, p20))
})
func('getReadListById', () => {
  kase('admin', () => c.getReadListById(admin, 'R1'))
  kase('kids filtered', () => c.getReadListById(kids, 'R1'))
  kase('not visible', () => c.getReadListById(l1, 'R2'))
  kase('unknown', () => c.getReadListById(admin, 'RX'))
})
func('getReadListThumbnail', () => {
  kase('ok', async () => [await entity(await c.getReadListThumbnail(all, 'R1')), calls.take()])
  kase('not found', async () => [await exceptionType(() => c.getReadListThumbnail(l1, 'R2')), calls.take()])
})
func('getReadListThumbnailById', () => {
  kase('ok', () => c.getReadListThumbnailById(admin, 'R1', 'TR2'))
  kase('other read list', () => c.getReadListThumbnailById(admin, 'R1', 'TR3'))
  kase('unknown thumbnail', () => c.getReadListThumbnailById(admin, 'R1', 'TX'))
  kase('not visible', () => c.getReadListThumbnailById(l1, 'R2', 'TR3'))
})
func('getReadListThumbnails', () => {
  kase('R1', () => c.getReadListThumbnails(admin, 'R1'))
  kase('not visible', () => c.getReadListThumbnails(l1, 'R2'))
})
func('addUserUploadedReadListThumbnail', () => {
  kase('png', () => [stable(c.addUserUploadedReadListThumbnail(admin, 'R1', file(PNG, 'a.png', 'image/png'))), calls.take()])
  kase('not selected', () => {
    const r = stable(c.addUserUploadedReadListThumbnail(admin, 'R2', file(PNG), false))
    calls.take()
    return r
  })
  kase('not an image', () => c.addUserUploadedReadListThumbnail(admin, 'R1', file(new Uint8Array(Buffer.from('x')))))
  kase('unknown', () => c.addUserUploadedReadListThumbnail(admin, 'RX', file(PNG)))
})
func('markReadListThumbnailSelected', () => {
  kase('ok', () => {
    c.markReadListThumbnailSelected(admin, 'R1', 'TR2')
    return calls.take()
  })
  kase('other read list', () => c.markReadListThumbnailSelected(admin, 'R1', 'TR3'))
  kase('unknown thumbnail ignored', () => [c.markReadListThumbnailSelected(admin, 'R1', 'TX'), calls.take()])
  kase('unknown read list', () => c.markReadListThumbnailSelected(admin, 'RX', 'TR1'))
})
func('deleteUserUploadedReadListThumbnail', () => {
  kase('ok', () => {
    c.deleteUserUploadedReadListThumbnail(admin, 'R1', 'TR1')
    return calls.take()
  })
  kase('other read list', () => c.deleteUserUploadedReadListThumbnail(admin, 'R2', 'TR1'))
  kase('unknown thumbnail', () => c.deleteUserUploadedReadListThumbnail(admin, 'R1', 'TX'))
})
func('createReadList', () => {
  kase('ok, summary ignored', () => [
    stable(c.createReadList(new ReadListCreationDto({ name: 'New', summary: 'sum', ordered: false, bookIds: ['B3', 'B1', 'B2'] }))),
    calls.take(),
  ])
  kase('duplicate', async () => [await thrown(() => c.createReadList(new ReadListCreationDto({ name: 'dup', summary: '', ordered: true, bookIds: ['B1'] }))), calls.take()])
})
func('matchComicRackList', () => {
  kase('ok', () => [c.matchComicRackList(file(new Uint8Array(Buffer.from('My list')), 'list.cbl')), calls.take()])
  kase('coded exception', async () => [await thrown(() => c.matchComicRackList(file(new Uint8Array(0)))), calls.take()])
})
func('updateReadListById', () => {
  kase('no change', () => {
    c.updateReadListById(admin, 'R1', update(null, null, null, null))
    return calls.take()
  })
  kase('all fields, summary ignored', () => {
    c.updateReadListById(admin, 'R1', update('Renamed', 's', ['B2', 'B1'], false))
    return calls.take()
  })
  kase('kids', () => {
    c.updateReadListById(kids, 'R1', update('k', null, null, null))
    return calls.take()
  })
  kase('duplicate', async () => [await thrown(() => c.updateReadListById(admin, 'R2', update('dup', null, null, null))), calls.take()])
  kase('not found', () => c.updateReadListById(l1, 'R2', update('x', null, null, null)))
})
func('deleteReadListById', () => {
  kase('ok', () => {
    c.deleteReadListById(admin, 'R2')
    return calls.take()
  })
  kase('not found', () => c.deleteReadListById(admin, 'RX'))
})
func('getBooksByReadListId', () => {
  kase('ordered, admin', () => books('R1', admin))
  kase('user url restricted', () => books('R1', all))
  kase('unordered read list', () => books('R2', admin))
  kase('paged', () => books('R1', admin, { page: PageRequest.of(1, 1) }))
  kase('unpaged', () => books('R1', admin, { unpaged: true, page: PageRequest.of(1, 1) }))
  kase('kids', () => books('R1', kids))
  kase('library filter', () => books('R1', admin, { libraryIds: ['L2'] }))
  kase('read status', () => books('R1', all, { readStatus: [ReadStatus.READ, ReadStatus.IN_PROGRESS] }))
  kase('unread status', () => books('R1', all, { readStatus: [ReadStatus.UNREAD] }))
  kase('tags', () => books('R1', admin, { tags: ['BT1'] }))
  kase('media status', () => books('R1', admin, { mediaStatus: [Media.Status.ERROR] }))
  kase('deleted', () => books('R1', admin, { deleted: false }))
  kase('authors', () => books('R1', admin, { authors: [new Author({ name: 'Pen B3', role: 'penciller' })] }))
  kase('not visible', () => books('R2', l1))
})
func('getBookSiblingPreviousInReadList', () => {
  kase('previous of B1', () => c.getBookSiblingPreviousInReadList(admin, 'R1', 'B1'))
  kase('first has none', () => c.getBookSiblingPreviousInReadList(admin, 'R1', 'B3'))
  kase('kids', () => c.getBookSiblingPreviousInReadList(kids, 'R1', 'B1'))
  kase('user', () => c.getBookSiblingPreviousInReadList(all, 'R1', 'B1'))
  kase('book not in list', () => c.getBookSiblingPreviousInReadList(admin, 'R1', 'B4'))
})
func('getBookSiblingNextInReadList', () => {
  kase('next of B3', () => c.getBookSiblingNextInReadList(all, 'R1', 'B3'))
  kase('last has none', () => c.getBookSiblingNextInReadList(admin, 'R1', 'B1'))
  kase('not visible', () => c.getBookSiblingNextInReadList(l1, 'R2', 'B4'))
})
func('getMihonReadProgressByReadListId', () => {
  kase('with progress', () => c.getMihonReadProgressByReadListId('R1', all))
  kase('no progress', () => c.getMihonReadProgressByReadListId('R1', kids))
  kase('not found', () => c.getMihonReadProgressByReadListId('RX', admin))
})
func('updateMihonReadProgressByReadListId', () => {
  kase('first book', () => {
    c.updateMihonReadProgressByReadListId('R1', mihon(1), all)
    return calls.take()
  })
  kase('all, completed skipped', () => {
    c.updateMihonReadProgressByReadListId('R1', mihon(5), all)
    return calls.take()
  })
  kase('zero', () => {
    c.updateMihonReadProgressByReadListId('R1', mihon(0), kids)
    return calls.take()
  })
  kase('kids sees one book', () => {
    c.updateMihonReadProgressByReadListId('R1', mihon(2), kids)
    return calls.take()
  })
  kase('not found', () => c.updateMihonReadProgressByReadListId('RX', mihon(1), all))
})
func('downloadReadListAsZip', () => {
  kase('existing and missing files', async () => {
    const f = join(tempDir(), 'readlist-file.cbz')
    writeFileSync(f, oracleBytes(3000))
    db.bookDao.insert(new Book({ name: 'file', url: new URL(`file:${f}`), fileLastModified: FIXED, id: 'B5', seriesId: 'S1', libraryId: 'L1', createdDate: FIXED }))
    db.readListDao.insert(new ReadList({ name: 'Zip é', bookIds: sortedMapOf<number, string>([0, 'B1'], [4, 'B5']), id: 'R3', createdDate: FIXED }))
    const e = c.downloadReadListAsZip(admin, 'R3')
    return [e.statusCode, e.headers.getFirst('Content-Disposition'), e.headers.getFirst('Content-Type'), zipSummary(await bodyBytes(e))]
  })
  kase('no file', async () => {
    const e = c.downloadReadListAsZip(admin, 'R1')
    return [e.headers.getFirst('Content-Disposition'), zipSummary(await bodyBytes(e))]
  })
  kase('not found', () => c.downloadReadListAsZip(l1, 'R2'))
})
