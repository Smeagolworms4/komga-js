// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/opds/v1/OpdsControllerOracleTest.kt
import { ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { SearchContext } from '../../../../../../src/domain/model/SearchContext.js'
import { ImageType } from '../../../../../../src/infrastructure/image/ImageType.js'
import { KomgaPrincipal } from '../../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { OpdsController } from '../../../../../../src/interfaces/api/opds/v1/OpdsController.js'
import type { BookDto } from '../../../../../../src/interfaces/api/rest/dto/BookDto.js'
import type { SeriesDto } from '../../../../../../src/interfaces/api/rest/dto/SeriesDto.js'
import { OpdsAuthor } from '../../../../../../src/interfaces/api/opds/v1/dto/OpdsAuthor.js'
import { OpdsEntryAcquisition, OpdsEntryNavigation } from '../../../../../../src/interfaces/api/opds/v1/dto/OpdsEntry.js'
import { OpdsFeedAcquisition, OpdsFeedNavigation } from '../../../../../../src/interfaces/api/opds/v1/dto/OpdsFeed.js'
import { PageImpl, PageRequest, type Pageable } from '../../../../../../src/port/spring-data.js'
import { ServletWebRequest } from '../../../../../../src/port/spring-web-filter.js'
import { UriComponentsBuilder } from '../../../../../../src/port/spring-web-uri.js'
import { OracleDb } from '../../../../db.js'
import { oracle, tempDir } from '../../../../oracle.js'
import { describeEntity, request, withRequest } from '../../../../web-oracle.js'
import { admin as adminUser, limited as limitedUser, realBooks, restricted as restrictedUser, setup } from '../../../data.js'
import { thumbnails, xml } from '../../../opds-support.js'
import { InterfacesServices } from '../../../services.js'

const { func, kase } = oracle('interfaces/api/opds/v1/OpdsController')

const db = new OracleDb()
const services = new InterfacesServices(db)
let instance: OpdsController | null = null
const controller = (): OpdsController =>
  (instance ??= new OpdsController(
    db.libraryDao,
    db.seriesCollectionDao,
    db.readListDao,
    db.seriesDtoDao,
    db.bookDtoDao,
    db.mediaDao,
    db.referentialDao,
    services.bookLifecycle,
    services.commonBookController,
    services.settings,
    services.contentRestrictionChecker,
    ImageType.JPEG,
  ))
const admin = new KomgaPrincipal(adminUser)
const limited = new KomgaPrincipal(limitedUser)
const restricted = new KomgaPrincipal(restrictedUser)
const page20: Pageable = PageRequest.of(0, 20)
const page0: Pageable = PageRequest.of(0, 2)
const page1: Pageable = PageRequest.of(1, 2)

const web = <T>(block: () => T, contextPath = ''): Promise<T> =>
  withRequest(request({ uri: `${contextPath}/opds/v1.2/catalog`, host: 'komga.local', port: 8080, contextPath }), block)

// PORT: méthodes privées et fonctions d'extension privées appelées par réflexion côté Kotlin
const call = (name: string, ...args: unknown[]): unknown => {
  const c = controller() as unknown as Record<string, (...a: unknown[]) => unknown>
  return c[name]!.apply(c, args)
}

/** les entrées sont sérialisées dans un flux, comme Komga les envoie (espaces de noms déclarés par le flux) */
const inFeed = (entry: unknown): string => {
  const base = { id: 'id', title: 't', updated: ZonedDateTime.of(2020, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC), author: new OpdsAuthor({ name: 'a' }), links: [] }
  return xml(entry instanceof OpdsEntryAcquisition ? new OpdsFeedAcquisition({ ...base, entries: [entry] }) : new OpdsFeedNavigation({ ...base, entries: [entry as OpdsEntryNavigation] }))
}

const book = (id: string): BookDto => db.bookDtoDao.findByIdOrNull(id, 'U1')!
const series = (id: string): SeriesDto => db.seriesDtoDao.findByIdOrNull(id, 'U1')!

func('getCatalog', () => {
  kase('setup', () => {
    setup(db)
    realBooks(db, tempDir())
    thumbnails(db)
  })
  kase('catalog', () => web(() => xml(controller().getCatalog())))
  kase('context path', () => web(() => xml(controller().getCatalog()), '/komga'))
})

func('getSearch', () => {
  kase('search', () => web(() => xml(controller().getSearch())))
})

func('getOnDeck', () => {
  kase('admin', () => web(() => xml(controller().getOnDeck(admin, page20))))
  kase('limited', () => web(() => xml(controller().getOnDeck(limited, page20))))
})

func('getKeepReading', () => {
  kase('admin', () => web(() => xml(controller().getKeepReading(admin, page20))))
  kase('restricted', () => web(() => xml(controller().getKeepReading(restricted, page20))))
})

func('getAllSeries', () => {
  kase('admin', () => web(() => xml(controller().getAllSeries(admin, null, null, page20))))
  kase('first page', () => web(() => xml(controller().getAllSeries(admin, null, null, page0))))
  kase('second page', () => web(() => xml(controller().getAllSeries(admin, null, null, page1))))
  kase('publisher', () => web(() => xml(controller().getAllSeries(admin, null, ['DC Comics', 'Nope'], page20))))
  kase('search, empty index', () => web(() => xml(controller().getAllSeries(admin, 'bat', null, page20))))
  kase('blank search', () => web(() => xml(controller().getAllSeries(admin, ' ', null, page20))))
  kase('limited', () => web(() => xml(controller().getAllSeries(limited, null, null, page20))))
  kase('restricted', () => web(() => xml(controller().getAllSeries(restricted, null, null, page20))))
})

func('getLatestSeries', () => {
  kase('admin', () => web(() => xml(controller().getLatestSeries(admin, page20))))
  kase('paged', () => web(() => xml(controller().getLatestSeries(admin, page1))))
})

func('getLatestBooks', () => {
  kase('admin', () => web(() => xml(controller().getLatestBooks(admin, page20))))
  kase('limited, paged', () => web(() => xml(controller().getLatestBooks(limited, page0))))
})

func('getLibraries', () => {
  kase('admin', () => web(() => xml(controller().getLibraries(admin))))
  kase('limited', () => web(() => xml(controller().getLibraries(limited))))
})

func('getCollections', () => {
  kase('admin', () => web(() => xml(controller().getCollections(admin, page20))))
  kase('restricted', () => web(() => xml(controller().getCollections(restricted, page20))))
})

func('getReadLists', () => {
  kase('admin', () => web(() => xml(controller().getReadLists(admin, page20))))
  kase('limited', () => web(() => xml(controller().getReadLists(limited, page20))))
})

func('getPublishers', () => {
  kase('admin', () => web(() => xml(controller().getPublishers(admin, page20))))
  kase('limited', () => web(() => xml(controller().getPublishers(limited, page20))))
  kase('paged', () => web(() => xml(controller().getPublishers(admin, PageRequest.of(0, 1)))))
})

func('getOneSeries', () => {
  kase('S1', () => web(() => xml(controller().getOneSeries(admin, 'S1', page20))))
  kase('S1 paged', () => web(() => xml(controller().getOneSeries(admin, 'S1', page1))))
  kase('S2', () => web(() => xml(controller().getOneSeries(admin, 'S2', page20))))
  kase('S3 oneshot', () => web(() => xml(controller().getOneSeries(admin, 'S3', page20))))
  kase('restricted', () => web(() => xml(controller().getOneSeries(restricted, 'S2', page20))))
  kase('unknown', () => web(() => xml(controller().getOneSeries(admin, 'SX', page20))))
})

func('getOneLibrary', () => {
  kase('L1', () => web(() => xml(controller().getOneLibrary(admin, 'L1', page20))))
  kase('L2 limited', () => web(() => xml(controller().getOneLibrary(limited, 'L2', page20))))
  kase('unknown', () => web(() => xml(controller().getOneLibrary(admin, 'LX', page20))))
})

func('getOneCollection', () => {
  kase('C1', () => web(() => xml(controller().getOneCollection(admin, 'C1', page20))))
  kase('C1 restricted', () => web(() => xml(controller().getOneCollection(restricted, 'C1', page20))))
  kase('unknown', () => web(() => xml(controller().getOneCollection(admin, 'CX', page20))))
})

func('getOneReadList', () => {
  kase('R1', () => web(() => xml(controller().getOneReadList(admin, 'R1', page20))))
  kase('R1 limited', () => web(() => xml(controller().getOneReadList(limited, 'R1', page20))))
  kase('unknown', () => web(() => xml(controller().getOneReadList(admin, 'RX', page20))))
})

func('getBookThumbnailSmall', () => {
  kase('generated thumbnail', () => controller().getBookThumbnailSmall(admin, 'B7'))
  kase('no thumbnail', () => controller().getBookThumbnailSmall(admin, 'B1'))
  kase('restricted', () => controller().getBookThumbnailSmall(restricted, 'B4'))
})

func('getBookPageOpds', () => {
  kase('page 0 is the first page', async () => describeEntity(await controller().getBookPageOpds(admin, new ServletWebRequest(request()), 'B7', 0, null)))
  kase('page 2', async () => describeEntity(await controller().getBookPageOpds(admin, new ServletWebRequest(request()), 'B7', 2, '')))
  kase('out of range', async () => describeEntity(await controller().getBookPageOpds(admin, new ServletWebRequest(request()), 'B7', 3, null)))
})

func('linkStart', () => {
  kase('link', () => web(() => xml(call('linkStart'))))
})

func('uriBuilder', () => {
  kase('path', () => web(() => (call('uriBuilder', 'series/a b') as UriComponentsBuilder).toUriString()))
  kase('empty', () => web(() => (call('uriBuilder', '') as UriComponentsBuilder).toUriString(), '/ctx'))
})

func('linkPage', () => {
  const builder = () => UriComponentsBuilder.fromUriString('http://h/opds/v1.2/series?x=1')
  kase('single page', () => (call('linkPage', builder(), new PageImpl([1, 2], PageRequest.of(0, 20), 2)) as unknown[]).map(xml))
  kase('first of three', () => (call('linkPage', builder(), new PageImpl([1, 2], PageRequest.of(0, 2), 6)) as unknown[]).map(xml))
  kase('middle', () => (call('linkPage', builder(), new PageImpl([1, 2], PageRequest.of(1, 2), 6)) as unknown[]).map(xml))
  kase('last', () => (call('linkPage', builder(), new PageImpl([1, 2], PageRequest.of(2, 2), 6)) as unknown[]).map(xml))
  kase('unpaged', () => (call('linkPage', builder(), new PageImpl([1, 2])) as unknown[]).map(xml))
})

func('toOpdsEntry@729', () => {
  kase('series', () => web(() => inFeed(call('seriesToOpdsEntry', series('S1'), null))))
  kase('series with prepend', () => web(() => inFeed(call('seriesToOpdsEntry', series('S2'), 12))))
})

func('toOpdsEntry@740', () => {
  for (const id of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'])
    kase(id, () => web(() => inFeed(call('bookToOpdsEntry', book(id), db.mediaDao.findById(id), (b: BookDto) => `[${b.number}] `))))
  kase('epub divina compatible', () =>
    web(() => inFeed(call('bookToOpdsEntry', book('B4'), db.mediaDao.findById('B7').copy({ mediaType: 'application/epub+zip', epubDivinaCompatible: true }), () => ''))),
  )
  kase('mixed page types', () =>
    web(() => inFeed(call('bookToOpdsEntry', book('B7'), db.mediaDao.findById('B7').copy({ pages: [...db.mediaDao.findById('B1').pages, ...db.mediaDao.findById('B3').pages] }), () => ''))),
  )
})

func('toOpdsEntry@787', () => {
  kase('library', () => web(() => inFeed(call('libraryToOpdsEntry', db.libraryDao.findById('L2')))))
})

func('toOpdsEntry@796', () => {
  kase('collection', () => web(() => inFeed(call('collectionToOpdsEntry', db.seriesCollectionDao.findByIdOrNull('C1', SearchContext.empty())!))))
})

func('toOpdsEntry@805', () => {
  kase('read list', () => web(() => inFeed(call('readListToOpdsEntry', db.readListDao.findByIdOrNull('R1', SearchContext.empty())!))))
})

func('getEntriesWithSeriesTitle', () => {
  kase('books', () => web(() => (call('getEntriesWithSeriesTitle', [book('B1'), book('B6')]) as unknown[]).map((it) => inFeed(it))))
  kase('empty', () => web(() => (call('getEntriesWithSeriesTitle', []) as unknown[]).map(xml)))
})

func('sanitize', () => {
  for (const it of ['a.cbz', 'a;b;c.cbz', ';', '', 'é;漫.cbz']) kase(it, () => call('sanitize', it))
})
