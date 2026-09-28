// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/opds/v2/Opds2ControllerOracleTest.kt
import type { Library } from '../../../../../../src/domain/model/Library.js'
import { SearchContext } from '../../../../../../src/domain/model/SearchContext.js'
import { KomgaPrincipal } from '../../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { Opds2Controller } from '../../../../../../src/interfaces/api/opds/v2/Opds2Controller.js'
import { PageImpl, PageRequest, type Pageable } from '../../../../../../src/port/spring-data.js'
import { ServletWebRequest } from '../../../../../../src/port/spring-web-filter.js'
import { UriComponentsBuilder } from '../../../../../../src/port/spring-web-uri.js'
import { OracleDb } from '../../../../db.js'
import { oracle, tempDir } from '../../../../oracle.js'
import { describeEntity, request, withRequest } from '../../../../web-oracle.js'
import { admin as adminUser, limited as limitedUser, realBooks, restricted as restrictedUser, setup } from '../../../data.js'
import { json, thumbnails } from '../../../opds-support.js'
import { InterfacesServices } from '../../../services.js'

const { func, kase } = oracle('interfaces/api/opds/v2/Opds2Controller')

const db = new OracleDb()
const services = new InterfacesServices(db)
let instance: Opds2Controller | null = null
const controller = (): Opds2Controller =>
  (instance ??= new Opds2Controller(
    db.libraryDao,
    db.seriesCollectionDao,
    db.readListDao,
    db.seriesDtoDao,
    db.bookDtoDao,
    db.referentialDao,
    services.commonBookController,
    services.opdsGenerator,
    services.contentRestrictionChecker,
  ))
const admin = new KomgaPrincipal(adminUser)
const limited = new KomgaPrincipal(limitedUser)
const restricted = new KomgaPrincipal(restrictedUser)
const page20: Pageable = PageRequest.of(0, 20)
const page1: Pageable = PageRequest.of(1, 1)

const web = <T>(block: () => T, contextPath = ''): Promise<T> =>
  withRequest(request({ uri: `${contextPath}/opds/v2/catalog`, host: 'opds.example', port: 443, scheme: 'https', contextPath }), block)

// PORT: méthodes privées et fonctions d'extension privées appelées par réflexion côté Kotlin
const call = (name: string, ...args: unknown[]): unknown => {
  const c = controller() as unknown as Record<string, (...a: unknown[]) => unknown>
  return c[name]!.apply(c, args)
}

func('getLibrariesRecommended', () => {
  kase('setup', () => {
    setup(db)
    realBooks(db, tempDir())
    thumbnails(db)
  })
  kase('catalog admin', () => web(() => json(controller().getLibrariesRecommended(admin, null))))
  kase('catalog limited', () => web(() => json(controller().getLibrariesRecommended(limited, null))))
  kase('library L1', () => web(() => json(controller().getLibrariesRecommended(admin, 'L1'))))
  kase('library L2 restricted', () => web(() => json(controller().getLibrariesRecommended(restricted, 'L2'))))
  kase('context path', () => web(() => json(controller().getLibrariesRecommended(admin, 'L2')), '/komga'))
})

func('getKeepReading', () => {
  kase('admin', () => web(() => json(controller().getKeepReading(admin, null, page20))))
  kase('library', () => web(() => json(controller().getKeepReading(admin, 'L2', page20))))
})

func('getOnDeck', () => {
  kase('admin', () => web(() => json(controller().getOnDeck(admin, null, page20))))
  kase('library', () => web(() => json(controller().getOnDeck(admin, 'L1', page20))))
})

func('getLatestBooks', () => {
  kase('admin', () => web(() => json(controller().getLatestBooks(admin, null, page20))))
  kase('paged', () => web(() => json(controller().getLatestBooks(admin, 'L1', page1))))
  kase('limited, forbidden library', () => web(() => json(controller().getLatestBooks(limited, 'L2', page20))))
})

func('getLatestSeries', () => {
  kase('admin', () => web(() => json(controller().getLatestSeries(admin, null, page20))))
  kase('paged', () => web(() => json(controller().getLatestSeries(admin, null, page1))))
  kase('unknown library', () => web(() => json(controller().getLatestSeries(admin, 'LX', page20))))
})

func('getLibrariesBrowse', () => {
  kase('admin', () => web(() => json(controller().getLibrariesBrowse(admin, null, null, page20))))
  kase('publisher', () => web(() => json(controller().getLibrariesBrowse(admin, null, ['Shueisha'], page20))))
  kase('library paged', () => web(() => json(controller().getLibrariesBrowse(admin, 'L1', null, page1))))
  kase('restricted', () => web(() => json(controller().getLibrariesBrowse(restricted, null, null, page20))))
})

func('getLibrariesCollections', () => {
  kase('admin', () => web(() => json(controller().getLibrariesCollections(admin, null, page20))))
  kase('library L2', () => web(() => json(controller().getLibrariesCollections(admin, 'L2', page20))))
})

func('getOneCollection', () => {
  kase('C1', () => web(() => json(controller().getOneCollection(admin, 'C1', page20))))
  kase('C1 paged', () => web(() => json(controller().getOneCollection(admin, 'C1', page1))))
  kase('unknown', () => web(() => json(controller().getOneCollection(admin, 'CX', page20))))
})

func('getLibrariesReadLists', () => {
  kase('admin', () => web(() => json(controller().getLibrariesReadLists(admin, null, page20))))
  kase('limited', () => web(() => json(controller().getLibrariesReadLists(limited, null, page20))))
})

func('getOneReadList', () => {
  kase('R1', () => web(() => json(controller().getOneReadList(admin, 'R1', page20))))
  kase('R1 limited', () => web(() => json(controller().getOneReadList(limited, 'R1', page20))))
  kase('unknown', () => web(() => json(controller().getOneReadList(admin, 'RX', page20))))
})

func('checkLibraryAccess', () => {
  const check = (id: string | null, p: KomgaPrincipal) => {
    const [l, ids] = call('checkLibraryAccess', id, p) as [Library | null, Iterable<string> | null]
    return [l?.id ?? null, ids === null ? null : [...ids]]
  }
  kase('no library', () => check(null, admin))
  kase('no library limited', () => check(null, limited))
  kase('allowed', () => check('L1', limited))
  kase('forbidden', () => check('L2', limited))
  kase('unknown', () => check('LX', admin))
})

func('getOneSeries', () => {
  kase('S1', () => web(() => json(controller().getOneSeries(admin, 'S1', null, page20))))
  kase('S1 tag', () => web(() => json(controller().getOneSeries(admin, 'S1', 'dark', page20))))
  kase('S2 restricted', () => web(() => json(controller().getOneSeries(restricted, 'S2', null, page20))))
  kase('unknown', () => web(() => json(controller().getOneSeries(admin, 'SX', null, page20))))
})

func('getSearchResults', () => {
  kase('no query', () => web(() => json(controller().getSearchResults(admin, null))))
  kase('query, empty index', () => web(() => json(controller().getSearchResults(admin, 'one  piece'))))
})

func('getAuthDocument', () => {
  kase('document', () => web(() => json(controller().getAuthDocument())))
})

func('getBookPage', () => {
  kase('page 1', async () => describeEntity(await controller().getBookPage(admin, new ServletWebRequest(request()), 'B7', 1, null)))
  kase('page 0', async () => describeEntity(await controller().getBookPage(admin, new ServletWebRequest(request()), 'B7', 0, null)))
})

func('getWebPubManifest', () => {
  kase('B1', () => web(() => json(controller().getWebPubManifest(admin, 'B1'))))
  kase('B8', () => web(() => json(controller().getWebPubManifest(admin, 'B8'))))
})

func('getWebPubManifestEpub', () => {
  kase('B4', () => web(() => json(controller().getWebPubManifestEpub(admin, 'B4'))))
})

func('getWebPubManifestPdf', () => {
  kase('B5', () => web(() => json(controller().getWebPubManifestPdf(admin, 'B5'))))
})

func('getWebPubManifestDivina', () => {
  kase('B2', () => web(() => json(controller().getWebPubManifestDivina(admin, 'B2'))))
})

func('linkStart', () => {
  kase('link', () => web(() => json(call('linkStart'))))
})

func('linkSearch', () => {
  kase('link', () => web(() => json(call('linkSearch')), '/ctx'))
})

func('uriBuilder', () => {
  kase('path', () => web(() => (call('uriBuilder', 'a b/c') as UriComponentsBuilder).toUriString()))
})

func('linkPage', () => {
  const builder = () => UriComponentsBuilder.fromUriString('https://h/opds/v2/x')
  kase('first', () => json(call('linkPage', builder(), new PageImpl([1], PageRequest.of(0, 1), 3))))
  kase('middle', () => json(call('linkPage', builder(), new PageImpl([1], PageRequest.of(1, 1), 3))))
  kase('single', () => json(call('linkPage', builder(), new PageImpl([1]))))
})

func('linkSelf@119', () => {
  kase('path', () => web(() => json(call('linkSelf', 'series', null))))
  kase('path and type', () => web(() => json(call('linkSelf', 'series', 'application/opds+json'))))
})

func('linkSelf@124', () => {
  kase('builder', () => json(call('linkSelf', UriComponentsBuilder.fromUriString('https://h/x?y=1'), 't')))
})

func('getLibrariesFeedGroup', () => {
  kase('admin', () => web(() => json(call('getLibrariesFeedGroup', admin))))
  kase('limited', () => web(() => json(call('getLibrariesFeedGroup', limited))))
})

func('getLibraryNavigation', () => {
  kase('all admin', () => web(() => json(call('getLibraryNavigation', adminUser, null))))
  kase('L2 admin', () => web(() => json(call('getLibraryNavigation', adminUser, 'L2'))))
  kase('L1 limited', () => web(() => json(call('getLibraryNavigation', limitedUser, 'L1'))))
})

func('toWPLinkDto@905', () => {
  kase('library', () => web(() => json(call('libraryToWPLinkDto', db.libraryDao.findById('L2')))))
})

func('toWPLinkDto@912', () => {
  kase('series', () => web(() => json(call('seriesToWPLinkDto', db.seriesDtoDao.findByIdOrNull('S3', 'U1')))))
})

func('toWPLinkDto@919', () => {
  kase('collection', () => web(() => json(call('collectionToWPLinkDto', db.seriesCollectionDao.findByIdOrNull('C1', SearchContext.empty())))))
})

func('toWPLinkDto@926', () => {
  kase('read list', () => web(() => json(call('readListToWPLinkDto', db.readListDao.findByIdOrNull('R1', SearchContext.empty())))))
})
