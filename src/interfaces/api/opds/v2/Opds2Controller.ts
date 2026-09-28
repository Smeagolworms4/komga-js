// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v2/Opds2Controller.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ZoneId, ZonedDateTime } from '@js-joda/core'
import { BookSearch } from '../../../../domain/model/BookSearch.js'
import type { KomgaUser } from '../../../../domain/model/KomgaUser.js'
import type { Library } from '../../../../domain/model/Library.js'
import { Media } from '../../../../domain/model/Media.js'
import type { ReadList } from '../../../../domain/model/ReadList.js'
import { ReadStatus } from '../../../../domain/model/ReadStatus.js'
import { SearchCondition } from '../../../../domain/model/SearchCondition.js'
import { SearchContext } from '../../../../domain/model/SearchContext.js'
import { SearchOperator } from '../../../../domain/model/SearchOperator.js'
import type { SeriesCollection } from '../../../../domain/model/SeriesCollection.js'
import { SeriesSearch } from '../../../../domain/model/SeriesSearch.js'
import { LibraryRepository } from '../../../../domain/persistence/LibraryRepository.js'
import { ReadListRepository } from '../../../../domain/persistence/ReadListRepository.js'
import { ReferentialRepository } from '../../../../domain/persistence/ReferentialRepository.js'
import { SeriesCollectionRepository } from '../../../../domain/persistence/SeriesCollectionRepository.js'
import type { KomgaPrincipal } from '../../../../infrastructure/security/KomgaPrincipal.js'
import { toZonedDateTime } from '../../../../language/LanguageUtils.js'
import { ifBlank, isNullOrEmpty } from '../../../../port/kotlin.js'
import { type Page, PageRequest, Pageable, Sort } from '../../../../port/spring-data.js'
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
import { ServletUriComponentsBuilder, type UriComponentsBuilder } from '../../../../port/spring-web-uri.js'
import { CommonBookController } from '../../CommonBookController.js'
import { ContentRestrictionChecker } from '../../ContentRestrictionChecker.js'
import { MEDIATYPE_OPDS_AUTHENTICATION_JSON_VALUE, MEDIATYPE_OPDS_JSON_VALUE, MEDIATYPE_OPDS_PUBLICATION_JSON_VALUE } from '../../dto/Constants.js'
import { OpdsLinkRel } from '../../dto/OpdsLinkRel.js'
import { WPLinkDto, WPPublicationDto } from '../../dto/WepPub.js'
import { OpdsGenerator } from '../../OpdsGenerator.js'
import { BookDtoRepository } from '../../persistence/BookDtoRepository.js'
import { SeriesDtoRepository } from '../../persistence/SeriesDtoRepository.js'
import type { SeriesDto } from '../../rest/dto/SeriesDto.js'
import { AuthenticationDocumentDto } from './dto/OpdsAuthDto.js'
import { FacetDto, FeedDto, FeedGroupDto, FeedMetadataDto } from './dto/Opds2Dto.js'

const ROUTE_CATALOG = 'catalog'
export const ROUTE_AUTH = 'auth'

const RECOMMENDED_ITEMS_NUMBER = 5

export class Opds2Controller {
  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly collectionRepository: SeriesCollectionRepository,
    private readonly readListRepository: ReadListRepository,
    private readonly seriesDtoRepository: SeriesDtoRepository,
    private readonly bookDtoRepository: BookDtoRepository,
    private readonly referentialRepository: ReferentialRepository,
    private readonly commonBookController: CommonBookController,
    private readonly opdsGenerator: OpdsGenerator,
    private readonly contentRestrictionChecker: ContentRestrictionChecker,
  ) {}

  private linkStart(): WPLinkDto {
    return new WPLinkDto({
      title: 'Home',
      rel: OpdsLinkRel.START,
      type: MEDIATYPE_OPDS_JSON_VALUE,
      href: this.uriBuilder(ROUTE_CATALOG).toUriString(),
    })
  }

  private linkSearch(): WPLinkDto {
    return new WPLinkDto({
      title: 'Search',
      rel: OpdsLinkRel.SEARCH,
      type: MEDIATYPE_OPDS_JSON_VALUE,
      href: this.uriBuilder('search').toUriString() + '{?query}',
      templated: true,
    })
  }

  private uriBuilder(path: string): UriComponentsBuilder {
    return ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment('opds', 'v2').path(path)
  }

  private linkPage(uriBuilder: UriComponentsBuilder, page: Page<unknown>): WPLinkDto[] {
    return [
      !page.isFirst
        ? new WPLinkDto({
            rel: OpdsLinkRel.PREVIOUS,
            href: uriBuilder.cloneBuilder().queryParam('page', page.pageable.previousOrFirst().pageNumber).toUriString(),
          })
        : null,
      !page.isLast
        ? new WPLinkDto({
            rel: OpdsLinkRel.NEXT,
            href: uriBuilder.cloneBuilder().queryParam('page', page.pageable.next().pageNumber).toUriString(),
          })
        : null,
    ].filter((it) => it !== null)
  }

  // PORT: surcharges linkSelf(path: String, type) / linkSelf(uriBuilder: UriComponentsBuilder, type) fusionnées
  private linkSelf(pathOrUriBuilder: string | UriComponentsBuilder, type: string | null = null): WPLinkDto {
    if (typeof pathOrUriBuilder === 'string') return this.linkSelf(this.uriBuilder(pathOrUriBuilder), type)
    return new WPLinkDto({
      rel: OpdsLinkRel.SELF,
      href: pathOrUriBuilder.toUriString(),
      type: type,
    })
  }

  private getLibrariesFeedGroup(principal: KomgaPrincipal): FeedGroupDto {
    const libraries = principal.user.canAccessAllLibraries() ? this.libraryRepository.findAll() : this.libraryRepository.findAllByIds(principal.user.sharedLibrariesIds)
    return new FeedGroupDto({
      metadata: new FeedMetadataDto({
        title: 'Libraries',
      }),
      links: [this.linkSelf('libraries')],
      navigation: libraries.map((it) => this.libraryToWPLinkDto(it)),
    })
  }

  private getLibraryNavigation(user: KomgaUser, libraryId: string | null): WPLinkDto[] {
    const uriBuilder = this.uriBuilder(`libraries${libraryId !== null ? `/${libraryId}` : ''}`)

    const collections = this.collectionRepository.findAll(new SearchContext(user), Pageable.ofSize(1), { belongsToLibraryIds: libraryId !== null ? [libraryId] : null })
    const readLists = this.readListRepository.findAll(new SearchContext(user), Pageable.ofSize(1), { belongsToLibraryIds: user.getAuthorizedLibraryIds(libraryId !== null ? [libraryId] : null) })

    return [
      new WPLinkDto({ title: 'Recommended', rel: OpdsLinkRel.SUBSECTION, href: uriBuilder.toUriString(), type: MEDIATYPE_OPDS_JSON_VALUE }),
      new WPLinkDto({ title: 'Browse', rel: OpdsLinkRel.SUBSECTION, href: uriBuilder.cloneBuilder().pathSegment('browse').toUriString(), type: MEDIATYPE_OPDS_JSON_VALUE }),
      collections.isEmpty()
        ? null
        : new WPLinkDto({ title: 'Collections', rel: OpdsLinkRel.SUBSECTION, href: uriBuilder.cloneBuilder().pathSegment('collections').toUriString(), type: MEDIATYPE_OPDS_JSON_VALUE }),
      readLists.isEmpty()
        ? null
        : new WPLinkDto({ title: 'Read lists', rel: OpdsLinkRel.SUBSECTION, href: uriBuilder.cloneBuilder().pathSegment('readlists').toUriString(), type: MEDIATYPE_OPDS_JSON_VALUE }),
    ].filter((it) => it !== null)
  }

  getLibrariesRecommended(principal: KomgaPrincipal, libraryId: string | null): FeedDto {
    const [library, authorizedLibraryIds] = this.checkLibraryAccess(libraryId, principal)

    const keepReading = this.bookDtoRepository
      .findAll(
        new BookSearch({
          condition: new SearchCondition.AllOfBook({
            conditions: (() => {
              const list: SearchCondition.Book[] = []
              if (library !== null) list.push(new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }))
              list.push(new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }))
              list.push(new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }))
              list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
              return list
            })(),
          }),
        }),
        new SearchContext(principal.user),
        PageRequest.of(0, RECOMMENDED_ITEMS_NUMBER, Sort.by(Sort.Order.desc('readProgress.readDate'))),
      )
      .map((it) => this.opdsGenerator.toOpdsPublicationDto(it))

    const onDeck = this.bookDtoRepository
      .findAllOnDeck(principal.user.id, authorizedLibraryIds, Pageable.ofSize(RECOMMENDED_ITEMS_NUMBER), { restrictions: principal.user.restrictions })
      .map((it) => this.opdsGenerator.toOpdsPublicationDto(it))

    const latestBooks = this.bookDtoRepository
      .findAll(
        new BookSearch({
          condition: new SearchCondition.AllOfBook({
            conditions: (() => {
              const list: SearchCondition.Book[] = []
              if (library !== null) list.push(new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }))
              list.push(new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }))
              list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
              return list
            })(),
          }),
        }),
        new SearchContext(principal.user),
        PageRequest.of(0, RECOMMENDED_ITEMS_NUMBER, Sort.by(Sort.Order.desc('createdDate'))),
      )
      .map((it) => this.opdsGenerator.toOpdsPublicationDto(it))

    const latestSeries = this.seriesDtoRepository
      .findAll(
        new SeriesSearch({
          condition: new SearchCondition.AllOfSeries({
            conditions: (() => {
              const list: SearchCondition.Series[] = []
              if (library !== null) list.push(new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }))
              list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
              list.push(new SearchCondition.OneShot({ operator: SearchOperator.IsFalse }))
              return list
            })(),
          }),
        }),
        new SearchContext(principal.user),
        PageRequest.of(0, RECOMMENDED_ITEMS_NUMBER, Sort.by(Sort.Order.desc('lastModified'))),
      )
      .map((it) => this.seriesToWPLinkDto(it))

    const uriBuilder = this.uriBuilder(`libraries${library !== null ? `/${library.id}` : ''}`)

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: (library?.name ?? 'All libraries') + ' - Recommended',
        modified: library?.lastModifiedDate?.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch()],
      navigation: this.getLibraryNavigation(principal.user, libraryId),
      groups: [
        library === null ? this.getLibrariesFeedGroup(principal) : null,
        !keepReading.isEmpty()
          ? new FeedGroupDto({
              metadata: new FeedMetadataDto({ title: 'Keep Reading', page: keepReading }),
              links: [new WPLinkDto({ title: 'Keep Reading', rel: OpdsLinkRel.SELF, href: uriBuilder.cloneBuilder().pathSegment('keep-reading').toUriString(), type: MEDIATYPE_OPDS_JSON_VALUE })],
              publications: keepReading.content,
            })
          : null,
        !onDeck.isEmpty()
          ? new FeedGroupDto({
              metadata: new FeedMetadataDto({ title: 'On Deck', page: onDeck }),
              links: [new WPLinkDto({ title: 'On Deck', rel: OpdsLinkRel.SELF, href: uriBuilder.cloneBuilder().pathSegment('on-deck').toUriString(), type: MEDIATYPE_OPDS_JSON_VALUE })],
              publications: onDeck.content,
            })
          : null,
        !latestBooks.isEmpty()
          ? new FeedGroupDto({
              metadata: new FeedMetadataDto({ title: 'Latest Books', page: latestBooks }),
              links: [new WPLinkDto({ title: 'Latest Books', rel: OpdsLinkRel.SELF, href: uriBuilder.cloneBuilder().pathSegment('books', 'latest').toUriString(), type: MEDIATYPE_OPDS_JSON_VALUE })],
              publications: latestBooks.content,
            })
          : null,
        !latestSeries.isEmpty()
          ? new FeedGroupDto({
              metadata: new FeedMetadataDto({ title: 'Latest Series', page: latestSeries }),
              links: [new WPLinkDto({ title: 'Latest Series', rel: OpdsLinkRel.SELF, href: uriBuilder.cloneBuilder().pathSegment('series', 'latest').toUriString(), type: MEDIATYPE_OPDS_JSON_VALUE })],
              navigation: latestSeries.content,
            })
          : null,
      ].filter((it) => it !== null),
    })
  }

  getKeepReading(principal: KomgaPrincipal, libraryId: string | null, page: Pageable): FeedDto {
    const [library] = this.checkLibraryAccess(libraryId, principal)

    const entries = this.bookDtoRepository
      .findAll(
        new BookSearch({
          condition: SearchCondition.AllOfBook.of(
            new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }),
            new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }),
            new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
          ),
        }),
        new SearchContext(principal.user),
        PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.desc('readProgress.readDate'))),
      )
      .map((it) => this.opdsGenerator.toOpdsPublicationDto(it))

    const uriBuilder = this.uriBuilder(`libraries${library !== null ? `/${library.id}` : ''}/keep-reading`)

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: (library?.name ?? 'All libraries') + ' - Keep Reading',
        modified: library?.lastModifiedDate?.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, entries)],
      publications: entries.content,
    })
  }

  getOnDeck(principal: KomgaPrincipal, libraryId: string | null, page: Pageable): FeedDto {
    const [library, authorizedLibraryIds] = this.checkLibraryAccess(libraryId, principal)

    const entries = this.bookDtoRepository
      .findAllOnDeck(principal.user.id, authorizedLibraryIds, page, { restrictions: principal.user.restrictions })
      .map((it) => this.opdsGenerator.toOpdsPublicationDto(it))

    const uriBuilder = this.uriBuilder(`libraries${library !== null ? `/${library.id}` : ''}/on-deck`)

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: (library?.name ?? 'All libraries') + ' - On Deck',
        modified: library?.lastModifiedDate?.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, entries)],
      publications: entries.content,
    })
  }

  getLatestBooks(principal: KomgaPrincipal, libraryId: string | null, page: Pageable): FeedDto {
    const [library] = this.checkLibraryAccess(libraryId, principal)

    const entries = this.bookDtoRepository
      .findAll(
        new BookSearch({
          condition: SearchCondition.AllOfBook.of(
            new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }),
            new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
          ),
        }),
        new SearchContext(principal.user),
        PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.desc('createdDate'))),
      )
      .map((it) => this.opdsGenerator.toOpdsPublicationDto(it))

    const uriBuilder = this.uriBuilder(`libraries${library !== null ? `/${library.id}` : ''}/books/latest`)

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: (library?.name ?? 'All libraries') + ' - Latest Books',
        modified: library?.lastModifiedDate?.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, entries)],
      publications: entries.content,
    })
  }

  getLatestSeries(principal: KomgaPrincipal, libraryId: string | null, page: Pageable): FeedDto {
    const [library] = this.checkLibraryAccess(libraryId, principal)

    const entries = this.seriesDtoRepository
      .findAll(
        new SeriesSearch({
          condition: new SearchCondition.AllOfSeries({
            conditions: (() => {
              const list: SearchCondition.Series[] = []
              if (library !== null) list.push(new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }))
              list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
              list.push(new SearchCondition.OneShot({ operator: SearchOperator.IsFalse }))
              return list
            })(),
          }),
        }),
        new SearchContext(principal.user),
        PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.desc('lastModified'))),
      )
      .map((it) => this.seriesToWPLinkDto(it))

    const uriBuilder = this.uriBuilder(`libraries${library !== null ? `/${library.id}` : ''}/series/latest`)

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: (library?.name ?? 'All libraries') + ' - Latest Series',
        modified: library?.lastModifiedDate?.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, entries)],
      navigation: entries.content,
    })
  }

  getLibrariesBrowse(principal: KomgaPrincipal, libraryId: string | null, publishers: string[] | null = null, page: Pageable): FeedDto {
    const [library, authorizedLibraryIds] = this.checkLibraryAccess(libraryId, principal)

    const seriesSearch = new SeriesSearch({
      condition: new SearchCondition.AllOfSeries({
        conditions: (() => {
          const list: SearchCondition.Series[] = []
          if (library !== null) list.push(new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }))
          if (!isNullOrEmpty(publishers)) {
            list.push(new SearchCondition.AllOfSeries({ conditions: publishers.map((it) => new SearchCondition.Publisher({ operator: new SearchOperator.Is({ value: it }) })) }))
          }
          list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
          return list
        })(),
      }),
    })

    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.asc('metadata.titleSort')))

    const entries = this.seriesDtoRepository.findAll(seriesSearch, new SearchContext(principal.user), pageable).map((it) => this.seriesToWPLinkDto(it))

    const uriBuilder = this.uriBuilder(`libraries${library !== null ? `/${library.id}` : ''}/browse`)

    const publisherLinks = [...this.referentialRepository.findAllPublishers(authorizedLibraryIds)].map(
      (it) =>
        new WPLinkDto({
          title: it,
          href: uriBuilder.cloneBuilder().queryParam('publisher', it).toUriString(),
          type: MEDIATYPE_OPDS_JSON_VALUE,
        }),
    )

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: library?.name ?? 'All libraries',
        modified: library?.lastModifiedDate?.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, entries)],
      navigation: this.getLibraryNavigation(principal.user, libraryId),
      groups: [
        new FeedGroupDto({ metadata: new FeedMetadataDto({ title: 'Series' }), navigation: entries.content }),
        publisherLinks.length > 0 ? new FeedGroupDto({ metadata: new FeedMetadataDto({ title: 'Publisher' }), navigation: publisherLinks }) : null,
      ].filter((it) => it !== null),
    })
  }

  getLibrariesCollections(principal: KomgaPrincipal, libraryId: string | null, page: Pageable): FeedDto {
    const [library] = this.checkLibraryAccess(libraryId, principal)

    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.asc('name')))
    const entries = this.collectionRepository
      .findAll(new SearchContext(principal.user), pageable, { belongsToLibraryIds: principal.user.getAuthorizedLibraryIds(libraryId !== null ? [libraryId] : null) })
      .map((it) => this.collectionToWPLinkDto(it))

    const uriBuilder = this.uriBuilder(`libraries${library !== null ? `/${library.id}` : ''}/collections`)

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: (library?.name ?? 'All libraries') + ' - Collections',
        modified: library?.lastModifiedDate?.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, entries)],
      navigation: this.getLibraryNavigation(principal.user, libraryId),
      groups: [new FeedGroupDto({ metadata: new FeedMetadataDto({ title: 'Collections' }), navigation: entries.content })],
    })
  }

  getOneCollection(principal: KomgaPrincipal, id: string, page: Pageable): FeedDto {
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

    const entries = this.seriesDtoRepository.findAll(seriesSearch, new SearchContext(principal.user), pageable).map((it) => this.seriesToWPLinkDto(it))

    const uriBuilder = this.uriBuilder(`collections/${id}`)

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: collection.name,
        modified: collection.lastModifiedDate.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, entries)],
      navigation: entries.content,
    })
  }

  getLibrariesReadLists(principal: KomgaPrincipal, libraryId: string | null, page: Pageable): FeedDto {
    const [library] = this.checkLibraryAccess(libraryId, principal)

    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.asc('name')))
    const entries = this.readListRepository
      .findAll(new SearchContext(principal.user), pageable, { belongsToLibraryIds: principal.user.getAuthorizedLibraryIds(libraryId !== null ? [libraryId] : null) })
      .map((it) => this.readListToWPLinkDto(it))

    const uriBuilder = this.uriBuilder(`libraries${library !== null ? `/${library.id}` : ''}/readlists`)

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: (library?.name ?? 'All libraries') + ' - Read Lists',
        modified: library?.lastModifiedDate?.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, entries)],
      navigation: this.getLibraryNavigation(principal.user, libraryId),
      groups: [new FeedGroupDto({ metadata: new FeedMetadataDto({ title: 'Read Lists' }), navigation: entries.content })],
    })
  }

  getOneReadList(principal: KomgaPrincipal, id: string, page: Pageable): FeedDto {
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

    const entries = booksPage.map((it) => this.opdsGenerator.toOpdsPublicationDto(it))

    const uriBuilder = this.uriBuilder(`readlists/${id}`)

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: readList.name,
        modified: readList.lastModifiedDate.atZone(ZoneId.systemDefault()) ?? ZonedDateTime.now(),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, booksPage)],
      publications: entries.content,
    })
  }

  // PORT: Pair<Library?, Collection<String>?> -> tuple
  private checkLibraryAccess(libraryId: string | null, principal: KomgaPrincipal): [Library | null, Iterable<string> | null] {
    let library: Library | null
    if (libraryId !== null) {
      const found = this.libraryRepository.findByIdOrNull(libraryId)
      if (found === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
      if (!principal.user.canAccessLibrary(found)) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      library = found
    } else library = null

    const libraryIds = principal.user.getAuthorizedLibraryIds(libraryId !== null ? [libraryId] : null)
    return [library, libraryIds]
  }

  getOneSeries(principal: KomgaPrincipal, id: string, tag: string | null = null, page: Pageable): FeedDto {
    const series = this.seriesDtoRepository.findByIdOrNull(id, principal.user.id)
    if (series === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.contentRestrictionChecker.checkContentRestrictionSeries(principal.user, series)

    const bookSearch = new BookSearch({
      condition: new SearchCondition.AllOfBook({
        conditions: (() => {
          const list: SearchCondition.Book[] = []
          list.push(new SearchCondition.SeriesId({ operator: new SearchOperator.Is({ value: series.id }) }))
          list.push(new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }))
          list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
          if (tag !== null) list.push(new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: tag }) }))
          return list
        })(),
      }),
    })
    const pageable = PageRequest.of(page.pageNumber, page.pageSize, Sort.by(Sort.Order.asc('metadata.numberSort')))

    const entries = this.bookDtoRepository.findAll(bookSearch, new SearchContext(principal.user), pageable).map((it) => this.opdsGenerator.toOpdsPublicationDto(it))

    const uriBuilder = this.uriBuilder(`series/${id}`)

    const tagLinks = [...this.referentialRepository.findAllBookTagsBySeries(series.id, null)].map(
      (it) =>
        new WPLinkDto({
          title: it,
          href: uriBuilder.cloneBuilder().queryParam('tag', it).toUriString(),
          type: MEDIATYPE_OPDS_JSON_VALUE,
          rel: it === tag ? OpdsLinkRel.SELF : null,
        }),
    )

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: series.metadata.title,
        modified: toZonedDateTime(series.lastModified),
        description: ifBlank(series.metadata.summary, () => series.booksMetadata.summary),
        page: entries,
      }),
      links: [this.linkSelf(uriBuilder), this.linkStart(), this.linkSearch(), ...this.linkPage(uriBuilder, entries)],
      publications: entries.content,
      facets: [tagLinks.length > 0 ? new FacetDto({ metadata: new FeedMetadataDto({ title: 'Tag' }), links: tagLinks }) : null].filter((it) => it !== null),
    })
  }

  getSearchResults(principal: KomgaPrincipal, query: string | null = null): FeedDto {
    const pageable = PageRequest.of(0, 20, Sort.by('relevance'))
    const queryTerms = query?.split(/\s+/) ?? null

    const resultsSeries = this.seriesDtoRepository
      .findAll(
        new SeriesSearch({
          condition: new SearchCondition.AllOfSeries({
            conditions: (() => {
              const list: SearchCondition.Series[] = []
              list.push(new SearchCondition.OneShot({ operator: SearchOperator.IsFalse }))
              list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
              if (!isNullOrEmpty(queryTerms)) {
                list.push(new SearchCondition.AllOfSeries({ conditions: queryTerms.map((it) => new SearchCondition.Title({ operator: new SearchOperator.Contains({ value: it }) })) }))
              }
              return list
            })(),
          }),
        }),
        new SearchContext(principal.user),
        pageable,
      )
      .map((it) => this.seriesToWPLinkDto(it))

    const resultsBooks = this.bookDtoRepository
      .findAll(
        new BookSearch({
          condition: new SearchCondition.AllOfBook({
            conditions: (() => {
              const list: SearchCondition.Book[] = []
              list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
              if (!isNullOrEmpty(queryTerms)) {
                list.push(new SearchCondition.AllOfBook({ conditions: queryTerms.map((it) => new SearchCondition.Title({ operator: new SearchOperator.Contains({ value: it }) })) }))
              }
              return list
            })(),
          }),
        }),
        new SearchContext(principal.user),
        pageable,
      )
      .map((it) => this.opdsGenerator.toOpdsPublicationDto(it))

    const resultsCollections = this.collectionRepository
      .findAll(new SearchContext(principal.user), pageable, { belongsToLibraryIds: principal.user.getAuthorizedLibraryIds(null), search: query })
      .map((it) => this.collectionToWPLinkDto(it))

    const resultsReadLists = this.readListRepository
      .findAll(new SearchContext(principal.user), pageable, { belongsToLibraryIds: principal.user.getAuthorizedLibraryIds(null), search: query })
      .map((it) => this.readListToWPLinkDto(it))

    return new FeedDto({
      metadata: new FeedMetadataDto({
        title: 'Search results',
        modified: ZonedDateTime.now(),
      }),
      links: [this.linkStart(), this.linkSearch()],
      groups: [
        !resultsSeries.isEmpty() ? new FeedGroupDto({ metadata: new FeedMetadataDto({ title: 'Series' }), navigation: resultsSeries.content }) : null,
        !resultsBooks.isEmpty() ? new FeedGroupDto({ metadata: new FeedMetadataDto({ title: 'Books' }), publications: resultsBooks.content }) : null,
        !resultsCollections.isEmpty() ? new FeedGroupDto({ metadata: new FeedMetadataDto({ title: 'Collections' }), navigation: resultsCollections.content }) : null,
        !resultsReadLists.isEmpty() ? new FeedGroupDto({ metadata: new FeedMetadataDto({ title: 'Read Lists' }), navigation: resultsReadLists.content }) : null,
      ].filter((it) => it !== null),
    })
  }

  getAuthDocument(): AuthenticationDocumentDto {
    return this.opdsGenerator.generateOpdsAuthDocument()
  }

  // @ApiResponse(content = [Content(mediaType = "image/*", schema = Schema(type = "string", format = "binary"))])
  // PORT: async (CommonBookController.getBookPageInternal)
  getBookPage(principal: KomgaPrincipal, request: ServletWebRequest, bookId: string, pageNumber: number, convertTo: string | null): Promise<ResponseEntity<Uint8Array>> {
    return this.commonBookController.getBookPageInternal(bookId, pageNumber, convertTo, request, principal, null)
  }

  getWebPubManifest(principal: KomgaPrincipal, bookId: string): WPPublicationDto {
    return this.commonBookController.getWebPubManifestInternal(principal, bookId, this.opdsGenerator)
  }

  getWebPubManifestEpub(principal: KomgaPrincipal, bookId: string): WPPublicationDto {
    return this.commonBookController.getWebPubManifestEpubInternal(principal, bookId, this.opdsGenerator)
  }

  getWebPubManifestPdf(principal: KomgaPrincipal, bookId: string): WPPublicationDto {
    return this.commonBookController.getWebPubManifestPdfInternal(principal, bookId, this.opdsGenerator)
  }

  getWebPubManifestDivina(principal: KomgaPrincipal, bookId: string): WPPublicationDto {
    return this.commonBookController.getWebPubManifestDivinaInternal(principal, bookId, this.opdsGenerator)
  }

  // PORT: fonction d'extension privée Library.toWPLinkDto -> méthode privée
  private libraryToWPLinkDto(self: Library): WPLinkDto {
    return new WPLinkDto({
      title: self.name,
      href: this.uriBuilder(`libraries/${self.id}`).toUriString(),
      type: MEDIATYPE_OPDS_JSON_VALUE,
    })
  }

  // PORT: fonction d'extension privée SeriesDto.toWPLinkDto -> méthode privée
  private seriesToWPLinkDto(self: SeriesDto): WPLinkDto {
    return new WPLinkDto({
      title: self.metadata.title,
      href: this.uriBuilder(`series/${self.id}`).toUriString(),
      type: MEDIATYPE_OPDS_JSON_VALUE,
    })
  }

  // PORT: fonction d'extension privée SeriesCollection.toWPLinkDto -> méthode privée
  private collectionToWPLinkDto(self: SeriesCollection): WPLinkDto {
    return new WPLinkDto({
      title: self.name,
      href: this.uriBuilder(`collections/${self.id}`).toUriString(),
      type: MEDIATYPE_OPDS_JSON_VALUE,
    })
  }

  // PORT: fonction d'extension privée ReadList.toWPLinkDto -> méthode privée
  private readListToWPLinkDto(self: ReadList): WPLinkDto {
    return new WPLinkDto({
      title: self.name,
      href: this.uriBuilder(`readlists/${self.id}`).toUriString(),
      type: MEDIATYPE_OPDS_JSON_VALUE,
    })
  }
}

const libraryIdArg = () => pathVariable('id', { nullable: 'String' }, { required: false, nullable: true })
const PUBLICATION = { class: WPPublicationDto }

// @RestController
restController(Opds2Controller, {
  inject: [
    LibraryRepository,
    SeriesCollectionRepository,
    ReadListRepository,
    SeriesDtoRepository,
    BookDtoRepository,
    ReferentialRepository,
    CommonBookController,
    // PORT: cycle d'imports ESM (OpdsGenerator importe ROUTE_AUTH d'ici) : jeton résolu à la création du bean
    { expression: (ctx) => ctx.getBean(OpdsGenerator) },
    ContentRestrictionChecker,
  ],
  javaName: 'org.gotson.komga.interfaces.api.opds.v2.Opds2Controller',
  requestMapping: { path: ['/opds/v2/'], produces: [MEDIATYPE_OPDS_JSON_VALUE] },
  handlers: {
    getLibrariesRecommended: {
      mapping: { method: 'GET', path: [ROUTE_CATALOG, 'libraries', 'libraries/{id}'] },
      args: [authenticationPrincipal(), libraryIdArg()],
      returns: { class: FeedDto },
    },
    getKeepReading: {
      mapping: { method: 'GET', path: ['libraries/keep-reading', 'libraries/{id}/keep-reading'] },
      args: [authenticationPrincipal(), libraryIdArg(), pageable()],
      returns: { class: FeedDto },
    },
    getOnDeck: {
      mapping: { method: 'GET', path: ['libraries/on-deck', 'libraries/{id}/on-deck'] },
      args: [authenticationPrincipal(), libraryIdArg(), pageable()],
      returns: { class: FeedDto },
    },
    getLatestBooks: {
      mapping: { method: 'GET', path: ['libraries/books/latest', 'libraries/{id}/books/latest'] },
      args: [authenticationPrincipal(), libraryIdArg(), pageable()],
      returns: { class: FeedDto },
    },
    getLatestSeries: {
      mapping: { method: 'GET', path: ['libraries/series/latest', 'libraries/{id}/series/latest'] },
      args: [authenticationPrincipal(), libraryIdArg(), pageable()],
      returns: { class: FeedDto },
    },
    getLibrariesBrowse: {
      mapping: { method: 'GET', path: ['libraries/browse', 'libraries/{id}/browse'] },
      args: [authenticationPrincipal(), libraryIdArg(), requestParam('publisher', { nullable: { list: 'String' } }, { required: false, nullable: true }), pageable()],
      returns: { class: FeedDto },
    },
    getLibrariesCollections: {
      mapping: { method: 'GET', path: ['libraries/collections', 'libraries/{id}/collections'] },
      args: [authenticationPrincipal(), libraryIdArg(), pageable()],
      returns: { class: FeedDto },
    },
    getOneCollection: { mapping: { method: 'GET', path: ['collections/{id}'] }, args: [authenticationPrincipal(), pathVariable('id'), pageable()], returns: { class: FeedDto } },
    getLibrariesReadLists: {
      mapping: { method: 'GET', path: ['libraries/readlists', 'libraries/{id}/readlists'] },
      args: [authenticationPrincipal(), libraryIdArg(), pageable()],
      returns: { class: FeedDto },
    },
    getOneReadList: { mapping: { method: 'GET', path: ['readlists/{id}'] }, args: [authenticationPrincipal(), pathVariable('id'), pageable()], returns: { class: FeedDto } },
    getOneSeries: {
      mapping: { method: 'GET', path: ['series/{id}'] },
      args: [authenticationPrincipal(), pathVariable('id'), requestParam('tag', { nullable: 'String' }, { required: false, nullable: true }), pageable()],
      returns: { class: FeedDto },
    },
    getSearchResults: {
      mapping: { method: 'GET', path: ['search'] },
      args: [authenticationPrincipal(), requestParam('query', { nullable: 'String' }, { required: false, nullable: true })],
      returns: { class: FeedDto },
    },
    getAuthDocument: { mapping: { method: 'GET', path: [ROUTE_AUTH], produces: [MEDIATYPE_OPDS_AUTHENTICATION_JSON_VALUE] }, returns: { class: AuthenticationDocumentDto } },
    getBookPage: {
      mapping: { method: 'GET', path: ['books/{bookId}/pages/{pageNumber}'], produces: [MediaType.ALL_VALUE] },
      preAuthorize: "hasRole('PAGE_STREAMING')",
      args: [
        authenticationPrincipal(),
        webRequest(),
        pathVariable('bookId'),
        pathVariable('pageNumber', 'Int'),
        requestParam('convert', { nullable: 'String' }, { required: false, nullable: true }),
      ],
    },
    getWebPubManifest: {
      mapping: { method: 'GET', path: ['books/{bookId}/manifest'], produces: [MEDIATYPE_OPDS_PUBLICATION_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: PUBLICATION,
    },
    getWebPubManifestEpub: {
      mapping: { method: 'GET', path: ['books/{bookId}/manifest/epub'], produces: [MEDIATYPE_OPDS_PUBLICATION_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: PUBLICATION,
    },
    getWebPubManifestPdf: {
      mapping: { method: 'GET', path: ['books/{bookId}/manifest/pdf'], produces: [MEDIATYPE_OPDS_PUBLICATION_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: PUBLICATION,
    },
    getWebPubManifestDivina: {
      mapping: { method: 'GET', path: ['books/{bookId}/manifest/divina'], produces: [MEDIATYPE_OPDS_PUBLICATION_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: PUBLICATION,
    },
  },
})
