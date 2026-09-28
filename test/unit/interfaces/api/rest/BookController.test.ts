// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/BookControllerOracleTest.kt
import type { IncomingMessage } from 'node:http'
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../../src/domain/model/Book.js'
import { BookMetadata } from '../../../../../src/domain/model/BookMetadata.js'
import { BookPage } from '../../../../../src/domain/model/BookPage.js'
import { BookSearch } from '../../../../../src/domain/model/BookSearch.js'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { ImageConversionException, MediaNotReadyException } from '../../../../../src/domain/model/Exceptions.js'
import type { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import type { MarkSelectedPreference } from '../../../../../src/domain/model/MarkSelectedPreference.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { MediaExtensionEpub } from '../../../../../src/domain/model/MediaExtension.js'
import { R2Locator } from '../../../../../src/domain/model/R2Locator.js'
import { ReadStatus } from '../../../../../src/domain/model/ReadStatus.js'
import { ThumbnailBook } from '../../../../../src/domain/model/ThumbnailBook.js'
import { TypedBytes } from '../../../../../src/domain/model/TypedBytes.js'
import type { BookAnalyzer } from '../../../../../src/domain/service/BookAnalyzer.js'
import type { BookLifecycle } from '../../../../../src/domain/service/BookLifecycle.js'
import { ImageAnalyzer } from '../../../../../src/infrastructure/image/ImageAnalyzer.js'
import type { ImageType } from '../../../../../src/infrastructure/image/ImageType.js'
import { ContentDetector } from '../../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import type { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import type { CommonBookController } from '../../../../../src/interfaces/api/CommonBookController.js'
import { ContentRestrictionChecker } from '../../../../../src/interfaces/api/ContentRestrictionChecker.js'
import type { WebPubGenerator } from '../../../../../src/interfaces/api/WebPubGenerator.js'
import { WPMetadataDto, WPPublicationDto } from '../../../../../src/interfaces/api/dto/WepPub.js'
import { BookController } from '../../../../../src/interfaces/api/rest/BookController.js'
import { BookImportBatchDto } from '../../../../../src/interfaces/api/rest/dto/BookImportBatchDto.js'
import { BookMetadataUpdateDto } from '../../../../../src/interfaces/api/rest/dto/BookMetadataUpdateDto.js'
import { URL } from '../../../../../src/port/java-net.js'
import { NoSuchFileException } from '../../../../../src/port/java-nio-file.js'
import { IllegalArgumentException, IndexOutOfBoundsException, kFloat } from '../../../../../src/port/kotlin.js'
import { HttpServletRequest, MultipartFile } from '../../../../../src/port/servlet.js'
import { Order, PageRequest, type Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { ServletWebRequest } from '../../../../../src/port/spring-web-filter.js'
import { TikaConfig } from '../../../../../src/port/tika.js'
import { OracleDb } from '../../../db.js'
import { oracle, stable } from '../../../oracle.js'
import { Calls, FIXED, PNG, entity, fixNow, json, principal, publisher, read, taskEmitter, tasks, thrown } from './rest-oracle.js'
import * as samples from './rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/BookController')

const db = new OracleDb()
const calls = new Calls()

/** Enregistre les appels (mêmes faux côté Kotlin) */
const bookLifecycle = {
  getThumbnailBytes: async (bookId: string, resizeTo: number | null = null) => {
    calls.add('getThumbnailBytes', bookId, resizeTo)
    return bookId === 'B4' ? null : new TypedBytes({ bytes: new Uint8Array([6]), mediaType: 'image/jpeg' })
  },
  getThumbnailBytesByThumbnailId: (id: string) => {
    calls.add('getThumbnailBytesByThumbnailId', id)
    return id === 'TB2' ? null : new TypedBytes({ bytes: new Uint8Array([7]), mediaType: 'image/png' })
  },
  addThumbnailForBook: (t: ThumbnailBook, pref: MarkSelectedPreference) => {
    calls.add('addThumbnailForBook', t, pref)
    return t
  },
  deleteThumbnailForBook: (t: ThumbnailBook) => {
    calls.add('deleteThumbnailForBook', t.id)
    if (t.selected) throw new IllegalArgumentException('selected thumbnail cannot be deleted')
  },
  getBookPage: async (book: Book, n: number, { convertTo = null, resizeTo = null }: { convertTo?: ImageType | null; resizeTo?: number | null } = {}) => {
    calls.add('getBookPage', book.id, n, convertTo, resizeTo)
    if (n === 99) throw new IndexOutOfBoundsException('99')
    if (n === 98) throw new ImageConversionException('Cannot convert', 'ERR_1011')
    if (n === 97) throw new MediaNotReadyException()
    if (n === 96) throw new NoSuchFileException('/x')
    return new TypedBytes({ bytes: new Uint8Array([n]), mediaType: n === 2 ? 'invalid' : 'image/jpeg' })
  },
  markReadProgressCompleted: (bookId: string, user: KomgaUser) => calls.add('markReadProgressCompleted', bookId, user.id),
  markReadProgress: (book: Book, user: KomgaUser, page: number) => {
    calls.add('markReadProgress', book.id, user.id, page)
    if (page > 3) throw new IllegalArgumentException('page out of range')
  },
  deleteReadProgress: (book: Book, user: KomgaUser) => calls.add('deleteReadProgress', book.id, user.id),
} as unknown as BookLifecycle
const analyzer = {
  getPdfPagesDynamic: (media: Media) => {
    calls.add('getPdfPagesDynamic', media.bookId)
    return [new BookPage({ fileName: '0', mediaType: 'image/jpeg', dimension: new Dimension({ width: 1, height: 2 }) })]
  },
} as unknown as BookAnalyzer
const manifest = new WPPublicationDto({ mediaType: 'application/divina+json', context: null, metadata: new WPMetadataDto({ title: 'Manifest' }), links: [] })
const manifestCall = (name: string) => (p: KomgaPrincipal, bookId: string) => {
  calls.add(name, p.user.id, bookId)
  return manifest
}
const common = {
  getWebPubManifestInternal: manifestCall('getWebPubManifestInternal'),
  getWebPubManifestEpubInternal: manifestCall('getWebPubManifestEpubInternal'),
  getWebPubManifestPdfInternal: manifestCall('getWebPubManifestPdfInternal'),
  getWebPubManifestDivinaInternal: manifestCall('getWebPubManifestDivinaInternal'),
} as unknown as CommonBookController

const c = new BookController(
  taskEmitter(db, calls),
  analyzer,
  bookLifecycle,
  db.bookDao,
  db.bookMetadataDao,
  db.mediaDao,
  db.bookDtoDao,
  db.readListDao,
  new ContentDetector(new TikaConfig()),
  new ImageAnalyzer(),
  publisher(calls),
  db.thumbnailBookDao,
  null as unknown as WebPubGenerator,
  new ContentRestrictionChecker(db.seriesMetadataDao, db.bookDao, db.thumbnailBookDao, db.seriesDao, db.thumbnailSeriesDao),
  common,
)
const admin = principal(samples.admin)
const all = principal(samples.all)
const l1 = principal(samples.l1Only)
const kids = principal(samples.kids)
const noAdult = principal(samples.noAdult)
const p20 = PageRequest.of(0, 20)

const thumb = (id: string, bookId: string, selected: boolean) =>
  new ThumbnailBook({
    thumbnail: new Uint8Array([2, id.length]),
    selected,
    type: ThumbnailBook.Type.USER_UPLOADED,
    mediaType: 'image/png',
    fileSize: 2,
    dimension: new Dimension({ width: 3, height: 2 }),
    id,
    bookId,
    createdDate: FIXED,
  })

const extraBook = (id: string, seriesId: string, fileHash: string, media: Media) => {
  db.bookDao.insert(new Book({ name: id, url: new URL(`file:/lib1/extra/${id}.cbz`), fileLastModified: FIXED, fileHash, number: 5, id, seriesId, libraryId: 'L1', createdDate: FIXED }))
  db.mediaDao.insert(media.copy({ bookId: id, createdDate: FIXED }))
  db.bookMetadataDao.insert(new BookMetadata({ title: id, number: '5', numberSort: kFloat(5), bookId: id, createdDate: FIXED }))
  fixNow(db)
}

const request = (ifModifiedSince: string | null = null) =>
  new HttpServletRequest(
    { method: 'GET', url: '/x', headers: ifModifiedSince === null ? {} : { 'if-modified-since': ifModifiedSince }, socket: {} } as unknown as IncomingMessage,
    Buffer.alloc(0),
  )
const web = (r: HttpServletRequest) => new ServletWebRequest(r)
const search = (src: string) => read<BookSearch>(src, { class: BookSearch })
const update = (src: string) => read<BookMetadataUpdateDto>(src, { class: BookMetadataUpdateDto })
const file = (bytes: Uint8Array, name = '', contentType: string | null = null) => new MultipartFile('file', name, contentType, bytes)

type DeprecatedArgs = {
  searchTerm?: string | null
  libraryIds?: string[] | null
  mediaStatus?: Media.Status[] | null
  readStatus?: ReadStatus[] | null
  releasedAfter?: LocalDate | null
  tags?: string[] | null
  unpaged?: boolean
  page?: Pageable
}
const deprecated = (p: KomgaPrincipal, a: DeprecatedArgs = {}) =>
  c.getAllBooksDeprecated(p, a.searchTerm ?? null, a.libraryIds ?? null, a.mediaStatus ?? null, a.readStatus ?? null, a.releasedAfter ?? null, a.tags ?? null, a.unpaged ?? false, a.page ?? p20)

func('getAllBooksDeprecated', () => {
  kase('empty', () => deprecated(admin))
  kase('admin', () => {
    samples.seed(db)
    db.thumbnailBookDao.insert(thumb('TB1', 'B1', true))
    db.thumbnailBookDao.insert(thumb('TB2', 'B1', false))
    db.thumbnailBookDao.insert(thumb('TB3', 'B3', true))
    return deprecated(admin)
  })
  kase('user, sorted', () => deprecated(all, { page: PageRequest.of(0, 20, Sort.by(Order.desc('metadata.title'))) }))
  kase('paged', () => deprecated(admin, { page: PageRequest.of(1, 2, Sort.by('name')) }))
  kase('unpaged', () => deprecated(admin, { unpaged: true, page: PageRequest.of(1, 1, Sort.by('name')) }))
  kase('filters', () => deprecated(all, { libraryIds: ['L1'], mediaStatus: [Media.Status.READY], readStatus: [ReadStatus.UNREAD, ReadStatus.READ], tags: ['bt1'] }))
  kase('released after', () => deprecated(admin, { releasedAfter: LocalDate.of(2019, 1, 1) }))
  kase('restricted', () => [deprecated(l1), deprecated(kids), deprecated(noAdult)])
})
func('getBooks', () => {
  kase('empty search', () => c.getBooks(admin, search('{}'), false, p20))
  kase('condition', () => c.getBooks(all, search('{"condition":{"seriesId":{"operator":"is","value":"S1"}}}'), false, PageRequest.of(0, 1, Sort.by('metadata.numberSort'))))
  kase('allOf', () =>
    c.getBooks(admin, search('{"condition":{"allOf":[{"libraryId":{"operator":"is","value":"L1"}},{"readStatus":{"operator":"isNot","value":"READ"}}]}}'), false, p20),
  )
  kase('unpaged', () => c.getBooks(kids, search('{}'), true, PageRequest.of(1, 1)))
})
func('getBooksLatest', () => {
  kase('admin', () => c.getBooksLatest(admin, false, p20))
  kase('paged', () => c.getBooksLatest(all, false, PageRequest.of(1, 2)))
  kase('unpaged kids', () => c.getBooksLatest(kids, true, PageRequest.of(1, 2)))
})
func('getBooksOnDeck', () => {
  kase('all', () => c.getBooksOnDeck(all, null, p20))
  kase('admin library L2', () => c.getBooksOnDeck(admin, ['L2'], p20))
  kase('kids', () => c.getBooksOnDeck(kids, null, p20))
})
func('getBookById', () => {
  kase('admin', () => c.getBookById(admin, 'B1'))
  kase('user with progress', () => c.getBookById(all, 'B2'))
  kase('restricted library', () => c.getBookById(l1, 'B4'))
  kase('age restricted', () => c.getBookById(kids, 'B3'))
  kase('unknown', () => c.getBookById(admin, 'BX'))
})
func('getBookSiblingPrevious', () => {
  kase('B2', () => c.getBookSiblingPrevious(all, 'B2'))
  kase('first', () => c.getBookSiblingPrevious(admin, 'B1'))
  kase('restricted', () => c.getBookSiblingPrevious(kids, 'B3'))
  kase('unknown', () => c.getBookSiblingPrevious(admin, 'BX'))
})
func('getBookSiblingNext', () => {
  kase('B1', () => c.getBookSiblingNext(admin, 'B1'))
  kase('last', () => c.getBookSiblingNext(all, 'B2'))
  kase('restricted', () => c.getBookSiblingNext(l1, 'B4'))
})
func('getReadListsByBookId', () => {
  kase('B1', () => c.getReadListsByBookId(admin, 'B1'))
  kase('kids', () => c.getReadListsByBookId(kids, 'B1'))
  kase('none', () => c.getReadListsByBookId(all, 'B2'))
  kase('restricted', () => c.getReadListsByBookId(kids, 'B3'))
})
func('getBookThumbnail', () => {
  kase('ok', async () => [await c.getBookThumbnail(all, 'B1'), calls.take()])
  kase('none', async () => [await thrown(() => c.getBookThumbnail(admin, 'B4')), calls.take()])
  kase('restricted', async () => [await thrown(() => c.getBookThumbnail(kids, 'B3')), calls.take()])
})
func('getBookThumbnailById', () => {
  kase('ok', () => [c.getBookThumbnailById(admin, 'B1', 'TB1'), calls.take()])
  kase('no bytes', async () => [await thrown(() => c.getBookThumbnailById(admin, 'B1', 'TB2')), calls.take()])
  kase('thumbnail of restricted book', async () => [await thrown(() => c.getBookThumbnailById(kids, 'B1', 'TB3')), calls.take()])
  kase('unknown thumbnail', async () => [await thrown(() => c.getBookThumbnailById(admin, 'B1', 'TX')), calls.take()])
})
func('getBookThumbnails', () => {
  kase('B1', () => c.getBookThumbnails(admin, 'B1'))
  kase('none', () => c.getBookThumbnails(all, 'B2'))
  kase('restricted', () => c.getBookThumbnails(l1, 'B4'))
})
func('addUserUploadedBookThumbnail', () => {
  kase('selected', () => [stable(c.addUserUploadedBookThumbnail(admin, 'B1', file(PNG, 'a.png', 'image/png'))), calls.take()])
  kase('not selected', () => [stable(c.addUserUploadedBookThumbnail(admin, 'B2', file(PNG), false)), calls.take()])
  kase('not an image', () => c.addUserUploadedBookThumbnail(admin, 'B1', file(new Uint8Array(Buffer.from('abc')))))
  kase('unknown book', () => c.addUserUploadedBookThumbnail(admin, 'BX', file(PNG)))
})
func('markBookThumbnailSelected', () => {
  kase('ok', () => {
    c.markBookThumbnailSelected(admin, 'B1', 'TB2')
    return [calls.take(), db.thumbnailBookDao.findAllByBookId('B1').map((it) => [it.id, it.selected])]
  })
  kase('other book', () => c.markBookThumbnailSelected(admin, 'B3', 'TB1'))
  kase('unknown thumbnail', () => c.markBookThumbnailSelected(admin, 'B1', 'TX'))
  kase('unknown book', () => c.markBookThumbnailSelected(admin, 'BX', 'TB1'))
})
func('deleteUserUploadedBookThumbnail', () => {
  kase('ok', () => {
    c.deleteUserUploadedBookThumbnail(admin, 'B1', 'TB1')
    return calls.take()
  })
  kase('illegal argument', async () => [await thrown(() => c.deleteUserUploadedBookThumbnail(admin, 'B1', 'TB2')), calls.take()])
  kase('other book', () => c.deleteUserUploadedBookThumbnail(admin, 'B3', 'TB1'))
  kase('unknown thumbnail', () => c.deleteUserUploadedBookThumbnail(admin, 'B1', 'TX'))
  kase('unknown book', () => c.deleteUserUploadedBookThumbnail(admin, 'BX', 'TB1'))
})
func('getBookPages', () => {
  kase('ready', () => c.getBookPages(all, 'B1'))
  kase('restricted', () => c.getBookPages(kids, 'B3'))
  kase('unknown', () => c.getBookPages(admin, 'BX'))
  kase('statuses', async () => {
    extraBook('B10', 'S1', 'h10', new Media({ status: Media.Status.UNKNOWN }))
    extraBook('B11', 'S1', 'h11', new Media({ status: Media.Status.OUTDATED }))
    extraBook('B12', 'S1', 'h12', new Media({ status: Media.Status.ERROR }))
    extraBook('B13', 'S1', 'h13', new Media({ status: Media.Status.UNSUPPORTED }))
    extraBook('B14', 'S1', 'h14', new Media({ status: Media.Status.READY, mediaType: 'application/pdf', pages: [new BookPage({ fileName: '1', mediaType: 'image/jpeg' })] }))
    const out = []
    for (const it of ['B10', 'B11', 'B12', 'B13']) out.push(await thrown(() => c.getBookPages(admin, it)))
    return out
  })
  kase('pdf uses dynamic pages', () => [c.getBookPages(admin, 'B14'), calls.take()])
})
func('getBookPageThumbnailByNumber', () => {
  kase('ok', async () => [await entity(await c.getBookPageThumbnailByNumber(all, web(request()), 'B1', 1)), calls.take()])
  kase('invalid media type', async () => [await entity(await c.getBookPageThumbnailByNumber(all, web(request()), 'B1', 2)), calls.take()])
  kase('not modified', async () => [await entity(await c.getBookPageThumbnailByNumber(all, web(request('Sat, 14 Mar 2020 09:00:00 GMT')), 'B1', 1)), calls.take()])
  kase('not modified before restriction check', async () => entity(await c.getBookPageThumbnailByNumber(kids, web(request('Wed, 01 Jan 2031 00:00:00 GMT')), 'B3', 1)))
  kase('restricted', async () => [await thrown(() => c.getBookPageThumbnailByNumber(kids, web(request()), 'B3', 1)), calls.take()])
  kase('errors', async () => {
    const out: unknown[] = []
    for (const n of [99, 98, 97, 96]) out.push(await thrown(() => c.getBookPageThumbnailByNumber(admin, web(request()), 'B1', n)))
    out.push(calls.take())
    return out
  })
  kase('unknown book', () => c.getBookPageThumbnailByNumber(admin, web(request()), 'BX', 1))
})
func('getBookWebPubManifest', () => {
  kase('ok', () => {
    const e = c.getBookWebPubManifest(all, 'B1')
    return [e.statusCode, e.headers.getFirst('Content-Type'), json(e.body, { class: WPPublicationDto }), calls.take()]
  })
})
func('getBookWebPubManifestEpub', () => {
  kase('ok', () => [json(c.getBookWebPubManifestEpub(admin, 'B1'), { class: WPPublicationDto }), calls.take()])
})
func('getBookWebPubManifestPdf', () => {
  kase('ok', () => [json(c.getBookWebPubManifestPdf(admin, 'B2'), { class: WPPublicationDto }), calls.take()])
})
func('getBookWebPubManifestDivina', () => {
  kase('ok', () => [json(c.getBookWebPubManifestDivina(kids, 'B1'), { class: WPPublicationDto }), calls.take()])
})
func('getBooksDuplicates', () => {
  kase('none', () => c.getBooksDuplicates(admin, false, p20))
  kase('duplicates by hash', () => {
    extraBook('B7', 'S2', 'hashB1', new Media({ status: Media.Status.READY, mediaType: 'application/zip' }))
    extraBook('B8', 'S3', 'hashB3', new Media({ status: Media.Status.READY, mediaType: 'application/zip' }))
    return c.getBooksDuplicates(admin, false, p20)
  })
  kase('sorted desc', () => c.getBooksDuplicates(admin, false, PageRequest.of(0, 20, Sort.by(Order.desc('fileHash')))))
  kase('paged', () => c.getBooksDuplicates(all, false, PageRequest.of(1, 2)))
  kase('unpaged', () => c.getBooksDuplicates(admin, true, PageRequest.of(1, 1)))
})
func('getBookPositions', () => {
  kase('no extension', () => c.getBookPositions(request(), admin, 'B1'))
  kase('epub', () => {
    extraBook(
      'B9',
      'S1',
      'h9',
      new Media({
        status: Media.Status.READY,
        mediaType: 'application/epub+zip',
        extension: new MediaExtensionEpub({
          positions: [
            new R2Locator({
              href: 'ch1.xhtml',
              type: 'application/xhtml+xml',
              title: 'Chapter 1',
              locations: new R2Locator.Location({ progression: kFloat(0), position: 1, totalProgression: kFloat(0) }),
            }),
          ],
        }),
        lastModifiedDate: LocalDateTime.of(2021, 1, 1, 0, 0),
      }),
    )
    return entity(c.getBookPositions(request(), admin, 'B9'))
  })
  kase('not modified', () => entity(c.getBookPositions(request('Sat, 02 Jan 2021 00:00:00 GMT'), kids, 'B9')))
  kase('restricted', () => c.getBookPositions(request(), kids, 'B3'))
  kase('unknown', () => c.getBookPositions(request(), admin, 'BX'))
})
func('bookAnalyze', () => {
  kase('ok', () => {
    c.bookAnalyze('B1')
    return [tasks(db), calls.take()]
  })
  kase('unknown', async () => [await thrown(() => c.bookAnalyze('BX')), tasks(db)])
})
func('bookRefreshMetadata', () => {
  kase('ok', () => {
    c.bookRefreshMetadata('B3')
    return [tasks(db), calls.take()]
  })
  kase('unknown', async () => [await thrown(() => c.bookRefreshMetadata('BX')), tasks(db)])
})
func('updateBookMetadata', () => {
  kase('patch', () => {
    c.updateBookMetadata('B2', update('{"title":"New title","summary":null,"tags":["x"],"releaseDate":"2022-02-02","numberSort":7.5}'))
    return [stable(db.bookMetadataDao.findById('B2')), tasks(db), calls.take()]
  })
  kase('unknown', async () => [await thrown(() => c.updateBookMetadata('BX', update('{}'))), tasks(db), calls.take()])
})
func('updateBookMetadataByBatch', () => {
  kase('batch', () => {
    c.updateBookMetadataByBatch(
      new Map([
        ['B1', update('{"titleLock":true}')],
        ['BX', update('{"title":"nope"}')],
        ['B3', update('{"authors":[{"name":"New","role":"writer"}]}')],
        ['B2', update('{"isbn":null}')],
      ]),
    )
    return [['B1', 'B2', 'B3'].map((it) => stable(db.bookMetadataDao.findById(it))), tasks(db), calls.take()]
  })
  kase('empty', () => {
    c.updateBookMetadataByBatch(new Map())
    return [tasks(db), calls.take()]
  })
})
func('deleteBookReadProgress', () => {
  kase('ok', () => {
    c.deleteBookReadProgress('B1', all)
    return calls.take()
  })
  kase('restricted', async () => [await thrown(() => c.deleteBookReadProgress('B3', kids)), calls.take()])
  kase('unknown', () => c.deleteBookReadProgress('BX', all))
})
func('importBooks', () => {
  kase('batch', () => {
    c.importBooks(
      read<BookImportBatchDto>(
        '{"books":[{"sourceFile":"/import/a.cbz","seriesId":"S1"},{"sourceFile":"/import/b.cbz","seriesId":"S2","upgradeBookId":"B3","destinationName":"b2"}],"copyMode":"HARDLINK"}',
        { class: BookImportBatchDto },
      ),
    )
    return [tasks(db), calls.take()]
  })
  kase('empty', () => {
    c.importBooks(read<BookImportBatchDto>('{"copyMode":"MOVE"}', { class: BookImportBatchDto }))
    return tasks(db)
  })
})
func('deleteBookFile', () => {
  kase('ok', () => {
    c.deleteBookFile('B1')
    return [tasks(db), calls.take()]
  })
  kase('unknown id is still submitted', () => {
    c.deleteBookFile('BX')
    return tasks(db)
  })
})
func('booksRegenerateThumbnails', () => {
  kase('default', () => {
    c.booksRegenerateThumbnails()
    return [tasks(db), calls.take()]
  })
  kase('bigger only', () => {
    c.booksRegenerateThumbnails(true)
    return tasks(db)
  })
})
