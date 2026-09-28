// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v1/OpdsController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ZoneId, ZonedDateTime } from '@js-joda/core'
import { BookSearch } from '../../../../domain/model/BookSearch.js'
import type { Library } from '../../../../domain/model/Library.js'
import { Media } from '../../../../domain/model/Media.js'
import { MediaProfile } from '../../../../domain/model/MediaProfile.js'
import type { ReadList } from '../../../../domain/model/ReadList.js'
import { ReadStatus } from '../../../../domain/model/ReadStatus.js'
import { SearchCondition } from '../../../../domain/model/SearchCondition.js'
import { SearchContext } from '../../../../domain/model/SearchContext.js'
import { SearchOperator } from '../../../../domain/model/SearchOperator.js'
import type { SeriesCollection } from '../../../../domain/model/SeriesCollection.js'
import { SeriesSearch } from '../../../../domain/model/SeriesSearch.js'
import { ThumbnailBook } from '../../../../domain/model/ThumbnailBook.js'
import { LibraryRepository } from '../../../../domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../../domain/persistence/MediaRepository.js'
import { ReadListRepository } from '../../../../domain/persistence/ReadListRepository.js'
import { ReferentialRepository } from '../../../../domain/persistence/ReferentialRepository.js'
import { SeriesCollectionRepository } from '../../../../domain/persistence/SeriesCollectionRepository.js'
import { BookLifecycle } from '../../../../domain/service/BookLifecycle.js'
import { KomgaSettingsProvider } from '../../../../infrastructure/configuration/KomgaSettingsProvider.js'
import { ImageType } from '../../../../infrastructure/image/ImageType.js'
import type { KomgaPrincipal } from '../../../../infrastructure/security/KomgaPrincipal.js'
import { toZonedDateTime } from '../../../../language/LanguageUtils.js'
import { FilenameUtils } from '../../../../port/commons-io.js'
import { URI } from '../../../../port/java-net.js'
import { distinct, isNotBlank, isNullOrBlank } from '../../../../port/kotlin.js'
import { type Token } from '../../../../port/spring.js'
import { type Page, PageRequest, type Pageable, Sort } from '../../../../port/spring-data.js'
import {
  HttpStatus,
  MediaType,
  type ResponseEntity,
  ResponseStatusException,
  authenticationPrincipal,
  pageable,
  pathVariable,
  requestParam,
  restController,
  webRequest,
} from '../../../../port/spring-web.js'
import type { ServletWebRequest } from '../../../../port/spring-web-filter.js'
import { ServletUriComponentsBuilder, type UriComponentsBuilder, UriUtils } from '../../../../port/spring-web-uri.js'
import { CommonBookController } from '../../CommonBookController.js'
import { ContentRestrictionChecker } from '../../ContentRestrictionChecker.js'
import { MEDIATYPE_OPDS_JSON_VALUE } from '../../dto/Constants.js'
import { OpdsLinkRel } from '../../dto/OpdsLinkRel.js'
import { BookDtoRepository } from '../../persistence/BookDtoRepository.js'
import { SeriesDtoRepository } from '../../persistence/SeriesDtoRepository.js'
import type { BookDto } from '../../rest/dto/BookDto.js'
import type { SeriesDto } from '../../rest/dto/SeriesDto.js'
import { OpdsAuthor } from './dto/OpdsAuthor.js'
import { OpdsEntryAcquisition, OpdsEntryNavigation } from './dto/OpdsEntry.js'
import { OpdsFeed, OpdsFeedAcquisition, OpdsFeedNavigation } from './dto/OpdsFeed.js'
import {
  OpdsLink,
  OpdsLinkFeedNavigation,
  OpdsLinkFileAcquisition,
  OpdsLinkImage,
  OpdsLinkImageThumbnail,
  OpdsLinkPageStreaming,
  OpdsLinkSearch,
} from './dto/OpdsLink.js'
import { OpenSearchDescription } from './dto/OpenSearchDescription.js'

const ROUTE_BASE = '/opds/v1.2/'
const ROUTE_CATALOG = 'catalog'
const ROUTE_ON_DECK = 'ondeck'
const ROUTE_KEEP_READING = 'keep-reading'
const ROUTE_SERIES_ALL = 'series'
const ROUTE_SERIES_LATEST = 'series/latest'
const ROUTE_BOOKS_LATEST = 'books/latest'
const ROUTE_LIBRARIES_ALL = 'libraries'
const ROUTE_COLLECTIONS_ALL = 'collections'
const ROUTE_READLISTS_ALL = 'readlists'
const ROUTE_PUBLISHERS_ALL = 'publishers'
const ROUTE_SEARCH = 'search'

const ID_ON_DECK = 'ondeck'
const ID_KEEP_READING = 'keepReading'
const ID_SERIES_ALL = 'allSeries'
const ID_SERIES_LATEST = 'latestSeries'
const ID_BOOKS_LATEST = 'latestBooks'
const ID_LIBRARIES_ALL = 'allLibraries'
const ID_COLLECTIONS_ALL = 'allCollections'
const ID_READLISTS_ALL = 'allReadLists'
const ID_PUBLISHERS_ALL = 'allPublishers'

export class OpdsController {
  private readonly komgaAuthor = new OpdsAuthor({ name: 'Komga', uri: new URI('https://github.com/gotson/komga') })

  // PORT: DecimalFormat("0.#") appliqué à un Int : écriture décimale de l'entier
  private readonly decimalFormat = { format: (n: number): string => String(n) }

  private readonly opdsPseSupportedFormats = ['image/jpeg', 'image/png', 'image/gif']

  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly collectionRepository: SeriesCollectionRepository,
    private readonly readListRepository: ReadListRepository,
    private readonly seriesDtoRepository: SeriesDtoRepository,
    private readonly bookDtoRepository: BookDtoRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly referentialRepository: ReferentialRepository,
    private readonly bookLifecycle: BookLifecycle,
    private readonly commonBookController: CommonBookController,
    private readonly komgaSettingsProvider: KomgaSettingsProvider,
    private readonly contentRestrictionChecker: ContentRestrictionChecker,
    // @Qualifier("pdfImageType")
    private readonly pdfImageType: ImageType,
  ) {}

  private linkStart(): OpdsLinkFeedNavigation {
    return new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.START, href: this.uriBuilder(ROUTE_CATALOG).toUriString() })
  }

  private uriBuilder(path: string): UriComponentsBuilder {
    return ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment('opds', 'v1.2').path(path)
  }

  private linkPage<T>(uriBuilder: UriComponentsBuilder, page: Page<T>): OpdsLink[] {
    return [
      !page.isFirst
        ? new OpdsLinkFeedNavigation({
            rel: OpdsLinkRel.PREVIOUS,
            href: uriBuilder.cloneBuilder().queryParam('page', page.pageable.previousOrFirst().pageNumber).toUriString(),
          })
        : null,
      !page.isLast
        ? new OpdsLinkFeedNavigation({
            rel: OpdsLinkRel.NEXT,
            href: uriBuilder.cloneBuilder().queryParam('page', page.pageable.next().pageNumber).toUriString(),
          })
        : null,
    ].filter((it) => it !== null)
  }

  getCatalog(): OpdsFeed {
    return new OpdsFeedNavigation({
      id: 'root',
      title: 'Komga OPDS catalog',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [
        new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: this.uriBuilder(ROUTE_CATALOG).toUriString() }),
        this.linkStart(),
        new OpdsLinkSearch({ href: this.uriBuilder(ROUTE_SEARCH).toUriString() }),
        new OpdsLink({ type: MEDIATYPE_OPDS_JSON_VALUE, rel: 'alternate', href: ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment('opds', 'v2', 'catalog').toUriString() }),
      ],
      entries: [
        new OpdsEntryNavigation({
          title: 'Keep Reading',
          updated: ZonedDateTime.now(),
          id: ID_KEEP_READING,
          content: 'Continue reading your in progress books',
          link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_KEEP_READING).toUriString() }),
        }),
        new OpdsEntryNavigation({
          title: 'On Deck',
          updated: ZonedDateTime.now(),
          id: ID_ON_DECK,
          content: 'Browse what to read next',
          link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_ON_DECK).toUriString() }),
        }),
        new OpdsEntryNavigation({
          title: 'All series',
          updated: ZonedDateTime.now(),
          id: ID_SERIES_ALL,
          content: 'Browse by series',
          link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_SERIES_ALL).toUriString() }),
        }),
        new OpdsEntryNavigation({
          title: 'Latest series',
          updated: ZonedDateTime.now(),
          id: ID_SERIES_LATEST,
          content: 'Browse latest series',
          link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_SERIES_LATEST).toUriString() }),
        }),
        new OpdsEntryNavigation({
          title: 'Latest books',
          updated: ZonedDateTime.now(),
          id: ID_BOOKS_LATEST,
          content: 'Browse latest books',
          link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_BOOKS_LATEST).toUriString() }),
        }),
        new OpdsEntryNavigation({
          title: 'All libraries',
          updated: ZonedDateTime.now(),
          id: ID_LIBRARIES_ALL,
          content: 'Browse by library',
          link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_LIBRARIES_ALL).toUriString() }),
        }),
        new OpdsEntryNavigation({
          title: 'All collections',
          updated: ZonedDateTime.now(),
          id: ID_COLLECTIONS_ALL,
          content: 'Browse by collection',
          link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_COLLECTIONS_ALL).toUriString() }),
        }),
        new OpdsEntryNavigation({
          title: 'All read lists',
          updated: ZonedDateTime.now(),
          id: ID_READLISTS_ALL,
          content: 'Browse by read lists',
          link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_READLISTS_ALL).toUriString() }),
        }),
        new OpdsEntryNavigation({
          title: 'All publishers',
          updated: ZonedDateTime.now(),
          id: ID_PUBLISHERS_ALL,
          content: 'Browse by publishers',
          link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_PUBLISHERS_ALL).toUriString() }),
        }),
      ],
    })
  }

  getSearch(): OpenSearchDescription {
    return new OpenSearchDescription({
      shortName: 'Search',
      description: 'Search for series',
      url: new OpenSearchDescription.OpenSearchUrl({ template: this.uriBuilder(ROUTE_SERIES_ALL).toUriString() + '?search={searchTerms}' }),
    })
  }

  getOnDeck(principal: KomgaPrincipal, page: Pageable): OpdsFeed {
    const bookPage = this.bookDtoRepository.findAllOnDeck(principal.user.id, principal.user.getAuthorizedLibraryIds(null), page, { restrictions: principal.user.restrictions })

    const builder = this.uriBuilder(ROUTE_ON_DECK)

    return new OpdsFeedAcquisition({
      id: ID_ON_DECK,
      title: 'On Deck',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: builder.toUriString() }), this.linkStart(), ...this.linkPage(builder, bookPage)],
      entries: this.getEntriesWithSeriesTitle(bookPage.content),
    })
  }

  getKeepReading(principal: KomgaPrincipal, page: Pageable): OpdsFeed {
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.desc('readProgress.readDate')))

    const bookSearch = new BookSearch({
      condition: SearchCondition.AllOfBook.of(
        new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }),
        new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }),
        new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
      ),
    })

    const bookPage = this.bookDtoRepository.findAll(bookSearch, new SearchContext(principal.user), pageable)

    const builder = this.uriBuilder(ROUTE_KEEP_READING)

    return new OpdsFeedAcquisition({
      id: ID_KEEP_READING,
      title: 'Keep Reading',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: builder.toUriString() }), this.linkStart(), ...this.linkPage(builder, bookPage)],
      entries: this.getEntriesWithSeriesTitle(bookPage.content),
    })
  }

  getAllSeries(principal: KomgaPrincipal, searchTerm: string | null, publishers: string[] | null, page: Pageable): OpdsFeed {
    const sort = !isNullOrBlank(searchTerm) ? Sort.by('relevance') : Sort.by(Sort.Order.asc('metadata.titleSort'))
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, sort)

    const seriesSearch = new SeriesSearch({
      condition: new SearchCondition.AllOfSeries({
        conditions: (() => {
          const list: SearchCondition.Series[] = []
          if (searchTerm !== null) list.push(new SearchCondition.Title({ operator: new SearchOperator.Contains({ value: searchTerm }) }))
          if (publishers !== null) list.push(new SearchCondition.AnyOfSeries({ conditions: publishers.map((publisher) => new SearchCondition.Publisher({ operator: new SearchOperator.Is({ value: publisher }) })) }))
          list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
          return list
        })(),
      }),
    })

    const seriesPage = this.seriesDtoRepository.findAll(seriesSearch, new SearchContext(principal.user), pageable)

    const builder = this.uriBuilder(ROUTE_SERIES_ALL).queryParamIfPresent('search', searchTerm).queryParamIfPresent('publisher', publishers)

    return new OpdsFeedNavigation({
      id: ID_SERIES_ALL,
      title: !isNullOrBlank(searchTerm) ? `Series search for: ${searchTerm}` : 'All series',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: builder.toUriString() }), this.linkStart(), ...this.linkPage(builder, seriesPage)],
      entries: seriesPage.content.map((it) => this.seriesToOpdsEntry(it)),
    })
  }

  getLatestSeries(principal: KomgaPrincipal, page: Pageable): OpdsFeed {
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.desc('lastModified')))

    const seriesSearch = new SeriesSearch({ condition: new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }) })

    const seriesPage = this.seriesDtoRepository.findAll(seriesSearch, new SearchContext(principal.user), pageable)

    const uriBuilder = this.uriBuilder(ROUTE_SERIES_LATEST)

    return new OpdsFeedNavigation({
      id: ID_SERIES_LATEST,
      title: 'Latest series',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: uriBuilder.toUriString() }), this.linkStart(), ...this.linkPage(uriBuilder, seriesPage)],
      entries: seriesPage.content.map((it) => this.seriesToOpdsEntry(it)),
    })
  }

  getLatestBooks(principal: KomgaPrincipal, page: Pageable): OpdsFeed {
    const bookSearch = new BookSearch({
      condition: SearchCondition.AllOfBook.of(
        new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }),
        new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
      ),
    })
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.desc('createdDate')))

    const bookPage = this.bookDtoRepository.findAll(bookSearch, new SearchContext(principal.user), pageable)

    const uriBuilder = this.uriBuilder(ROUTE_BOOKS_LATEST)

    return new OpdsFeedAcquisition({
      id: ID_BOOKS_LATEST,
      title: 'Latest books',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: uriBuilder.toUriString() }), this.linkStart(), ...this.linkPage(uriBuilder, bookPage)],
      entries: this.getEntriesWithSeriesTitle(bookPage.content),
    })
  }

  getLibraries(principal: KomgaPrincipal): OpdsFeed {
    const libraries = principal.user.canAccessAllLibraries() ? this.libraryRepository.findAll() : this.libraryRepository.findAllByIds(principal.user.sharedLibrariesIds)
    return new OpdsFeedNavigation({
      id: ID_LIBRARIES_ALL,
      title: 'All libraries',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: this.uriBuilder(ROUTE_LIBRARIES_ALL).toUriString() }), this.linkStart()],
      entries: libraries.map((it) => this.libraryToOpdsEntry(it)),
    })
  }

  getCollections(principal: KomgaPrincipal, page: Pageable): OpdsFeed {
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.asc('name')))
    const collections = this.collectionRepository.findAll(new SearchContext(principal.user), pageable, { belongsToLibraryIds: principal.user.getAuthorizedLibraryIds(null) })

    const uriBuilder = this.uriBuilder(ROUTE_COLLECTIONS_ALL)

    return new OpdsFeedNavigation({
      id: ID_COLLECTIONS_ALL,
      title: 'All collections',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: uriBuilder.toUriString() }), this.linkStart(), ...this.linkPage(uriBuilder, collections)],
      entries: collections.content.map((it) => this.collectionToOpdsEntry(it)),
    })
  }

  getReadLists(principal: KomgaPrincipal, page: Pageable): OpdsFeed {
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.asc('name')))
    const readLists = this.readListRepository.findAll(new SearchContext(principal.user), pageable, { belongsToLibraryIds: principal.user.getAuthorizedLibraryIds(null) })

    const uriBuilder = this.uriBuilder(ROUTE_READLISTS_ALL)

    return new OpdsFeedNavigation({
      id: ID_READLISTS_ALL,
      title: 'All read lists',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: uriBuilder.toUriString() }), this.linkStart(), ...this.linkPage(uriBuilder, readLists)],
      entries: readLists.content.map((it) => this.readListToOpdsEntry(it)),
    })
  }

  getPublishers(principal: KomgaPrincipal, page: Pageable): OpdsFeed {
    const publishers = this.referentialRepository.findAllPublishers(principal.user.getAuthorizedLibraryIds(null), page)

    const uriBuilder = this.uriBuilder(ROUTE_PUBLISHERS_ALL)

    return new OpdsFeedNavigation({
      id: ID_PUBLISHERS_ALL,
      title: 'All publishers',
      updated: ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: uriBuilder.toUriString() }), this.linkStart(), ...this.linkPage(uriBuilder, publishers)],
      entries: publishers.content.map(
        (publisher) =>
          new OpdsEntryNavigation({
            title: publisher,
            updated: ZonedDateTime.now(),
            id: `publisher:${UriUtils.encodeQueryParam(publisher)}`,
            content: '',
            link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(ROUTE_SERIES_ALL).queryParam('publisher', publisher).toUriString() }),
          }),
      ),
    })
  }

  getOneSeries(principal: KomgaPrincipal, id: string, page: Pageable): OpdsFeed {
    const series = this.seriesDtoRepository.findByIdOrNull(id, principal.user.id)
    if (series === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, series)

    const bookSearch = new BookSearch({
      condition: SearchCondition.AllOfBook.of(
        new SearchCondition.SeriesId({ operator: new SearchOperator.Is({ value: series.id }) }),
        new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }),
        new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
      ),
    })
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.asc('metadata.numberSort')))

    const entries = this.bookDtoRepository.findAll(bookSearch, new SearchContext(principal.user), pageable).map((it) => this.bookToOpdsEntry(it, this.mediaRepository.findById(it.id)))

    const uriBuilder = this.uriBuilder(`series/${id}`)

    return new OpdsFeedAcquisition({
      id: series.id,
      title: series.metadata.title,
      updated: toZonedDateTime(series.lastModified),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: uriBuilder.toUriString() }), this.linkStart(), ...this.linkPage(uriBuilder, entries)],
      entries: entries.content,
    })
  }

  getOneLibrary(principal: KomgaPrincipal, id: string, page: Pageable): OpdsFeed {
    const library = this.libraryRepository.findByIdOrNull(id)
    if (library === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (!principal.user.canAccessLibrary(library)) throw new ResponseStatusException(HttpStatus.FORBIDDEN)

    const seriesSearch = new SeriesSearch({
      condition: SearchCondition.AllOfSeries.of(
        new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }),
        new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
      ),
    })

    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.asc('metadata.titleSort')))

    const entries = this.seriesDtoRepository.findAll(seriesSearch, new SearchContext(principal.user), pageable).map((it) => this.seriesToOpdsEntry(it))

    const uriBuilder = this.uriBuilder(`libraries/${id}`)

    return new OpdsFeedNavigation({
      id: library.id,
      title: library.name,
      updated: library.lastModifiedDate.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: uriBuilder.toUriString() }), this.linkStart(), ...this.linkPage(uriBuilder, entries)],
      entries: entries.content,
    })
  }

  getOneCollection(principal: KomgaPrincipal, id: string, page: Pageable): OpdsFeed {
    const collection = this.collectionRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (collection === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const sort = collection.ordered ? Sort.by(Sort.Order.asc('collection.number')) : Sort.by(Sort.Order.asc('metadata.titleSort'))
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, sort)

    const seriesSearch = new SeriesSearch({
      condition: SearchCondition.AllOfSeries.of(
        new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: collection.id }) }),
        new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
      ),
    })

    const entries = this.seriesDtoRepository.findAll(seriesSearch, new SearchContext(principal.user), pageable).map((it) => this.seriesToOpdsEntry(it))

    const uriBuilder = this.uriBuilder(`collections/${id}`)

    return new OpdsFeedNavigation({
      id: collection.id,
      title: collection.name,
      updated: collection.lastModifiedDate.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: uriBuilder.toUriString() }), this.linkStart(), ...this.linkPage(uriBuilder, entries)],
      entries: entries.content,
    })
  }

  getOneReadList(principal: KomgaPrincipal, id: string, page: Pageable): OpdsFeed {
    const readList = this.readListRepository.findByIdOrNull(id, new SearchContext(principal.user))
    if (readList === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const sort = readList.ordered ? Sort.by(Sort.Order.asc('readList.number')) : Sort.by(Sort.Order.asc('metadata.releaseDate'))
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, sort)

    const bookSearch = new BookSearch({
      condition: SearchCondition.AllOfBook.of(
        new SearchCondition.ReadListId({ operator: new SearchOperator.Is({ value: readList.id }) }),
        new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }),
        new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
      ),
    })
    const booksPage = this.bookDtoRepository.findAll(bookSearch, new SearchContext(principal.user), pageable)

    const entries = booksPage.map((bookDto) => this.bookToOpdsEntry(bookDto, this.mediaRepository.findById(bookDto.id), (it) => `${it.seriesTitle} ${it.metadata.number}: `))

    const uriBuilder = this.uriBuilder(`readlists/${id}`)

    return new OpdsFeedAcquisition({
      id: readList.id,
      title: readList.name,
      updated: readList.lastModifiedDate.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
      author: this.komgaAuthor,
      links: [new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SELF, href: uriBuilder.toUriString() }), this.linkStart(), ...this.linkPage(uriBuilder, booksPage)],
      entries: entries.content,
    })
  }

  // @ApiResponse(content = [Content(schema = Schema(type = "string", format = "binary"))])
  // PORT: async (BookLifecycle.getThumbnailBytes)
  async getBookThumbnailSmall(principal: KomgaPrincipal, bookId: string): Promise<Uint8Array> {
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookId)
    const thumbnail = this.bookLifecycle.getThumbnail(bookId)
    if (thumbnail === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)

    const bytes = (await this.bookLifecycle.getThumbnailBytes(bookId, thumbnail.type === ThumbnailBook.Type.GENERATED ? null : this.komgaSettingsProvider.thumbnailSize.maxEdge))?.bytes
    if (bytes === undefined) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    return bytes
  }

  // @ApiResponse(content = [Content(mediaType = "image/*", schema = Schema(type = "string", format = "binary"))])
  // PORT: async (CommonBookController.getBookPageInternal)
  getBookPageOpds(principal: KomgaPrincipal, request: ServletWebRequest, bookId: string, pageNumber: number, convertTo: string | null): Promise<ResponseEntity<Uint8Array>> {
    return this.commonBookController.getBookPageInternal(bookId, pageNumber + 1, convertTo, request, principal, null)
  }

  // PORT: fonction d'extension privée SeriesDto.toOpdsEntry -> méthode privée
  private seriesToOpdsEntry(self: SeriesDto, prepend: number | null = null): OpdsEntryNavigation {
    const pre = prepend !== null ? this.decimalFormat.format(prepend) + ' - ' : ''
    return new OpdsEntryNavigation({
      title: pre + self.metadata.title,
      updated: self.lastModified.atZone(ZoneId.of('Z')) ?? ZonedDateTime.now(),
      id: self.id,
      content: '',
      link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(`series/${self.id}`).toUriString() }),
    })
  }

  // PORT: fonction d'extension privée BookDto.toOpdsEntry -> méthode privée
  private bookToOpdsEntry(self: BookDto, media: Media, prepend: (bookDto: BookDto) => string = () => ''): OpdsEntryAcquisition {
    const mediaTypes = (() => {
      switch (media.profile) {
        case MediaProfile.DIVINA:
          return distinct(media.pages.map((it) => it.mediaType))
        case MediaProfile.PDF:
          return [this.pdfImageType.mediaType]
        case MediaProfile.EPUB:
          return media.epubDivinaCompatible ? distinct(media.pages.map((it) => it.mediaType)) : []
        case null:
          return []
      }
      return []
    })()

    const opdsLinkPageStreaming =
      mediaTypes.length === 0
        ? null
        : mediaTypes.length === 1 && this.opdsPseSupportedFormats.includes(mediaTypes[0] as string)
          ? new OpdsLinkPageStreaming({
              mediaType: mediaTypes[0] as string,
              href: this.uriBuilder(`books/${self.id}/pages/`).toUriString() + '{pageNumber}',
              count: media.pageCount,
              lastRead: self.readProgress?.page ?? null,
              lastReadDate: self.readProgress?.readDate ?? null,
            })
          : new OpdsLinkPageStreaming({
              mediaType: 'image/jpeg',
              href: this.uriBuilder(`books/${self.id}/pages/`).toUriString() + '{pageNumber}?convert=jpeg',
              count: media.pageCount,
              lastRead: self.readProgress?.page ?? null,
              lastReadDate: self.readProgress?.readDate ?? null,
            })

    const thumbnailMediaType = (() => {
      switch (media.profile) {
        case MediaProfile.PDF:
          return this.pdfImageType.mediaType
        default:
          return 'image/jpeg'
      }
    })()

    return new OpdsEntryAcquisition({
      title: `${prepend(self)}${self.metadata.title}`,
      updated: toZonedDateTime(self.lastModified),
      id: self.id,
      content: (() => {
        let s = ''
        s += `${FilenameUtils.getExtension(self.url).toLowerCase()} - ${self.size}`
        if (isNotBlank(self.metadata.summary)) s += `\n\n${self.metadata.summary}`
        return s
      })(),
      authors: self.metadata.authors.map((it) => new OpdsAuthor({ name: it.name })),
      links: [
        new OpdsLinkImageThumbnail({ mediaType: 'image/jpeg', href: this.uriBuilder(`books/${self.id}/thumbnail/small`).toUriString() }),
        new OpdsLinkImage({ mediaType: thumbnailMediaType, href: this.uriBuilder(`books/${self.id}/thumbnail`).toUriString() }),
        new OpdsLinkFileAcquisition({ mediaType: media.mediaType, href: this.uriBuilder(`books/${self.id}/file/${this.sanitize(FilenameUtils.getName(self.url))}`).toUriString() }),
        opdsLinkPageStreaming,
      ].filter((it) => it !== null),
    })
  }

  // PORT: fonction d'extension privée Library.toOpdsEntry -> méthode privée
  private libraryToOpdsEntry(self: Library): OpdsEntryNavigation {
    return new OpdsEntryNavigation({
      title: self.name,
      updated: self.lastModifiedDate.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
      id: self.id,
      content: '',
      link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(`libraries/${self.id}`).toUriString() }),
    })
  }

  // PORT: fonction d'extension privée SeriesCollection.toOpdsEntry -> méthode privée
  private collectionToOpdsEntry(self: SeriesCollection): OpdsEntryNavigation {
    return new OpdsEntryNavigation({
      title: self.name,
      updated: self.lastModifiedDate.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
      id: self.id,
      content: '',
      link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(`collections/${self.id}`).toUriString() }),
    })
  }

  // PORT: fonction d'extension privée ReadList.toOpdsEntry -> méthode privée
  private readListToOpdsEntry(self: ReadList): OpdsEntryNavigation {
    return new OpdsEntryNavigation({
      title: self.name,
      updated: self.lastModifiedDate.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
      id: self.id,
      content: '',
      link: new OpdsLinkFeedNavigation({ rel: OpdsLinkRel.SUBSECTION, href: this.uriBuilder(`readlists/${self.id}`).toUriString() }),
    })
  }

  // PORT: fonction d'extension privée List<BookDto>.getEntriesWithSeriesTitle -> méthode privée
  private getEntriesWithSeriesTitle(self: BookDto[]): OpdsEntryAcquisition[] {
    return self.map((bookDto) => this.bookToOpdsEntry(bookDto, this.mediaRepository.findById(bookDto.id), (it) => `${it.seriesTitle} ${it.metadata.number}: `))
  }

  private sanitize(fileName: string): string {
    return fileName.replaceAll(';', '')
  }
}

const OPDS_FEED = { class: OpdsFeed }

// @RestController
restController(OpdsController, {
  inject: [
    LibraryRepository,
    SeriesCollectionRepository,
    ReadListRepository,
    SeriesDtoRepository,
    BookDtoRepository,
    MediaRepository,
    ReferentialRepository,
    BookLifecycle,
    CommonBookController,
    KomgaSettingsProvider,
    ContentRestrictionChecker,
    // PORT: constructeur privé de l'enum ImageType : conversion explicite en jeton d'injection
    { type: ImageType as unknown as Token, qualifier: 'pdfImageType' },
  ],
  javaName: 'org.gotson.komga.interfaces.api.opds.v1.OpdsController',
  requestMapping: { path: [ROUTE_BASE], produces: [MediaType.APPLICATION_ATOM_XML_VALUE, MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE] },
  handlers: {
    getCatalog: { mapping: { method: 'GET', path: [ROUTE_CATALOG] }, returns: OPDS_FEED },
    getSearch: { mapping: { method: 'GET', path: [ROUTE_SEARCH] }, returns: { class: OpenSearchDescription } },
    getOnDeck: { mapping: { method: 'GET', path: [ROUTE_ON_DECK] }, args: [authenticationPrincipal(), pageable()], returns: OPDS_FEED },
    getKeepReading: { mapping: { method: 'GET', path: [ROUTE_KEEP_READING] }, args: [authenticationPrincipal(), pageable()], returns: OPDS_FEED },
    getAllSeries: {
      mapping: { method: 'GET', path: [ROUTE_SERIES_ALL] },
      args: [
        authenticationPrincipal(),
        requestParam('search', { nullable: 'String' }, { required: false, nullable: true }),
        requestParam('publisher', { nullable: { list: 'String' } }, { required: false, nullable: true }),
        pageable(),
      ],
      returns: OPDS_FEED,
    },
    getLatestSeries: { mapping: { method: 'GET', path: [ROUTE_SERIES_LATEST] }, args: [authenticationPrincipal(), pageable()], returns: OPDS_FEED },
    getLatestBooks: { mapping: { method: 'GET', path: [ROUTE_BOOKS_LATEST] }, args: [authenticationPrincipal(), pageable()], returns: OPDS_FEED },
    getLibraries: { mapping: { method: 'GET', path: [ROUTE_LIBRARIES_ALL] }, args: [authenticationPrincipal()], returns: OPDS_FEED },
    getCollections: { mapping: { method: 'GET', path: [ROUTE_COLLECTIONS_ALL] }, args: [authenticationPrincipal(), pageable()], returns: OPDS_FEED },
    getReadLists: { mapping: { method: 'GET', path: [ROUTE_READLISTS_ALL] }, args: [authenticationPrincipal(), pageable()], returns: OPDS_FEED },
    getPublishers: { mapping: { method: 'GET', path: [ROUTE_PUBLISHERS_ALL] }, args: [authenticationPrincipal(), pageable()], returns: OPDS_FEED },
    getOneSeries: { mapping: { method: 'GET', path: ['series/{id}'] }, args: [authenticationPrincipal(), pathVariable('id'), pageable()], returns: OPDS_FEED },
    getOneLibrary: { mapping: { method: 'GET', path: ['libraries/{id}'] }, args: [authenticationPrincipal(), pathVariable('id'), pageable()], returns: OPDS_FEED },
    getOneCollection: { mapping: { method: 'GET', path: ['collections/{id}'] }, args: [authenticationPrincipal(), pathVariable('id'), pageable()], returns: OPDS_FEED },
    getOneReadList: { mapping: { method: 'GET', path: ['readlists/{id}'] }, args: [authenticationPrincipal(), pathVariable('id'), pageable()], returns: OPDS_FEED },
    getBookThumbnailSmall: {
      mapping: { method: 'GET', path: ['books/{bookId}/thumbnail/small'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
    },
    getBookPageOpds: {
      mapping: { method: 'GET', path: ['books/{bookId}/pages/{pageNumber}'], produces: ['image/png', 'image/gif', 'image/jpeg'] },
      preAuthorize: "hasRole('PAGE_STREAMING')",
      args: [
        authenticationPrincipal(),
        webRequest(),
        pathVariable('bookId'),
        pathVariable('pageNumber', 'Int'),
        requestParam('convert', { nullable: 'String' }, { required: false, nullable: true }),
      ],
    },
  },
})
