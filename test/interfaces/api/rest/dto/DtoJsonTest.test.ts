// Support de test (sans jumeau Kotlin) : JSON des DTO de l'API (interfaces/api/rest/dto et interfaces/api/kobo/dto)
// comparé à celui de Komga. Les valeurs attendues (DtoJsonTest.expected.ts) sont produites par les vraies classes Kotlin
// avec l'ObjectMapper de Spring Boot configuré comme Komga (application.yml), via
// `tools/jshell-komga.sh test/interfaces/api/rest/dto/DtoJsonTest.oracle.jsh`.
// - W : écriture d'un DTO construit avec les mêmes valeurs des deux côtés (chaîne JSON identique, ordre des clés compris) ;
// - R : lecture d'un JSON puis réécriture (ou même classe d'exception) ;
// - B : lecture d'un DTO « à setters » (classe sans constructeur principal) : propriétés lues et isSet(...).
// Les modules qui dépendent de fichiers pas encore portés sont importés dynamiquement et leurs cas sont ignorés tant
// que l'import échoue.
import { LocalDate, LocalDateTime, OffsetDateTime, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { describe, expect, it } from 'vitest'
import { AgeRestriction, AllowExclude } from '../../../../../src/domain/model/AgeRestriction.js'
import { AlternateTitle } from '../../../../../src/domain/model/AlternateTitle.js'
import { Author } from '../../../../../src/domain/model/Author.js'
import { BookMetadata } from '../../../../../src/domain/model/BookMetadata.js'
import { ContentRestrictions } from '../../../../../src/domain/model/ContentRestrictions.js'
import { CopyMode } from '../../../../../src/domain/model/CopyMode.js'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { PageHashKnown } from '../../../../../src/domain/model/PageHashKnown.js'
import { PageHashUnknown } from '../../../../../src/domain/model/PageHashUnknown.js'
import { R2Locator } from '../../../../../src/domain/model/R2Locator.js'
import {
  ReadListMatch,
  ReadListRequestBook,
  ReadListRequestBookMatchBook,
  ReadListRequestBookMatches,
  ReadListRequestBookMatchSeries,
  ReadListRequestMatch,
} from '../../../../../src/domain/model/ReadListRequest.js'
import { ReadProgress } from '../../../../../src/domain/model/ReadProgress.js'
import { SyncPoint } from '../../../../../src/domain/model/SyncPoint.js'
import { ThumbnailBook } from '../../../../../src/domain/model/ThumbnailBook.js'
import { UserRoles } from '../../../../../src/domain/model/UserRoles.js'
import { WebLink } from '../../../../../src/domain/model/WebLink.js'
import { AmountDto } from '../../../../../src/interfaces/api/kobo/dto/AmountDto.js'
import { AuthDto } from '../../../../../src/interfaces/api/kobo/dto/AuthDto.js'
import { BookEntitlementContainerDto } from '../../../../../src/interfaces/api/kobo/dto/BookEntitlementContainerDto.js'
import { BookEntitlementDto } from '../../../../../src/interfaces/api/kobo/dto/BookEntitlementDto.js'
import { BookmarkDto } from '../../../../../src/interfaces/api/kobo/dto/BookmarkDto.js'
import { ContributorDto } from '../../../../../src/interfaces/api/kobo/dto/ContributorDto.js'
import { DownloadUrlDto } from '../../../../../src/interfaces/api/kobo/dto/DownloadUrlDto.js'
import { FormatDto } from '../../../../../src/interfaces/api/kobo/dto/FormatDto.js'
import { DUMMY_ID, KoboBookMetadataDto } from '../../../../../src/interfaces/api/kobo/dto/KoboBookMetadataDto.js'
import { KoboSeriesDto } from '../../../../../src/interfaces/api/kobo/dto/KoboSeriesDto.js'
import { LocationDto } from '../../../../../src/interfaces/api/kobo/dto/LocationDto.js'
import { PeriodDto, toPeriodDto } from '../../../../../src/interfaces/api/kobo/dto/PeriodDto.js'
import { PublisherDto } from '../../../../../src/interfaces/api/kobo/dto/PublisherDto.js'
import { ReadingStateDto, WrappedReadingStateDto, toDto as readProgressToDto } from '../../../../../src/interfaces/api/kobo/dto/ReadingStateDto.js'
import { ReadingStateStateUpdateDto } from '../../../../../src/interfaces/api/kobo/dto/ReadingStateStateUpdateDto.js'
import { ReadingStateUpdateResultDto, RequestResultDto, WrappedResultDto } from '../../../../../src/interfaces/api/kobo/dto/ReadingStateUpdateResultDto.js'
import { ResourcesDto } from '../../../../../src/interfaces/api/kobo/dto/ResourcesDto.js'
import { ResultDto } from '../../../../../src/interfaces/api/kobo/dto/ResultDto.js'
import { StatisticsDto } from '../../../../../src/interfaces/api/kobo/dto/StatisticsDto.js'
import { StatusDto } from '../../../../../src/interfaces/api/kobo/dto/StatusDto.js'
import { StatusInfoDto } from '../../../../../src/interfaces/api/kobo/dto/StatusInfoDto.js'
import {
  ChangedEntitlementDto,
  ChangedProductMetadataDto,
  ChangedReadingStateDto,
  ChangedTagDto,
  DeletedTagDto,
  NewEntitlementDto,
  NewTagDto,
} from '../../../../../src/interfaces/api/kobo/dto/SyncResultDto.js'
import { TagDto, WrappedTagDto, toWrappedTagDto } from '../../../../../src/interfaces/api/kobo/dto/TagDto.js'
import { TagItemDto } from '../../../../../src/interfaces/api/kobo/dto/TagItemDto.js'
import { TagTypeDto } from '../../../../../src/interfaces/api/kobo/dto/TagTypeDto.js'
import { TestsDto } from '../../../../../src/interfaces/api/kobo/dto/TestsDto.js'
import { AlternateTitleDto, toDto as alternateTitleToDto } from '../../../../../src/interfaces/api/rest/dto/AlternateTitleDto.js'
import { AlternateTitleUpdateDto } from '../../../../../src/interfaces/api/rest/dto/AlternateTitleUpdateDto.js'
import { ApiKeyDto, redacted } from '../../../../../src/interfaces/api/rest/dto/ApiKeyDto.js'
import { ApiKeyRequestDto } from '../../../../../src/interfaces/api/rest/dto/ApiKeyRequestDto.js'
import { AuthenticationActivityDto } from '../../../../../src/interfaces/api/rest/dto/AuthenticationActivityDto.js'
import { AuthorDto, toDto as authorToDto } from '../../../../../src/interfaces/api/rest/dto/AuthorDto.js'
import { BookDto, BookMetadataDto, MediaDto, ReadProgressDto, restrictUrl as bookRestrictUrl } from '../../../../../src/interfaces/api/rest/dto/BookDto.js'
import { BookImportBatchDto, BookImportDto } from '../../../../../src/interfaces/api/rest/dto/BookImportBatchDto.js'
import { ClientSettingDto, ClientSettingGlobalUpdateDto, ClientSettingUserUpdateDto } from '../../../../../src/interfaces/api/rest/dto/ClientSettingDto.js'
import { CollectionCreationDto } from '../../../../../src/interfaces/api/rest/dto/CollectionCreationDto.js'
import { CollectionDto } from '../../../../../src/interfaces/api/rest/dto/CollectionDto.js'
import { GithubReleaseDto } from '../../../../../src/interfaces/api/rest/dto/GithubReleaseDto.js'
import { GroupCountDto } from '../../../../../src/interfaces/api/rest/dto/GroupCountDto.js'
import { HistoricalEventDto } from '../../../../../src/interfaces/api/rest/dto/HistoricalEventDto.js'
import { JsonFeedDto } from '../../../../../src/interfaces/api/rest/dto/JsonFeedDto.js'
import { LibraryCreationDto } from '../../../../../src/interfaces/api/rest/dto/LibraryCreationDto.js'
import { PageDto } from '../../../../../src/interfaces/api/rest/dto/PageDto.js'
import { PageHashCreationDto } from '../../../../../src/interfaces/api/rest/dto/PageHashCreationDto.js'
import { PageHashKnownDto } from '../../../../../src/interfaces/api/rest/dto/PageHashKnownDto.js'
import { PageHashUnknownDto, toDto as pageHashUnknownToDto } from '../../../../../src/interfaces/api/rest/dto/PageHashUnknownDto.js'
import { PasswordUpdateDto } from '../../../../../src/interfaces/api/rest/dto/PasswordUpdateDto.js'
import { R2Positions } from '../../../../../src/interfaces/api/rest/dto/R2Positions.js'
import { ReadListCreationDto } from '../../../../../src/interfaces/api/rest/dto/ReadListCreationDto.js'
import { ReadListDto } from '../../../../../src/interfaces/api/rest/dto/ReadListDto.js'
import {
  ReadListMatchDto,
  ReadListRequestBookDto,
  ReadListRequestBookMatchBookDto,
  ReadListRequestBookMatchDto,
  ReadListRequestBookMatchesDto,
  ReadListRequestBookMatchSeriesDto,
  ReadListRequestMatchDto,
  toDto as readListRequestMatchToDto,
} from '../../../../../src/interfaces/api/rest/dto/ReadListRequestMatchDto.js'
import { ReadProgressUpdateDto } from '../../../../../src/interfaces/api/rest/dto/ReadProgressUpdateDto.js'
import { ReleaseDto } from '../../../../../src/interfaces/api/rest/dto/ReleaseDto.js'
import { ScanIntervalDto } from '../../../../../src/interfaces/api/rest/dto/ScanIntervalDto.js'
import { SeriesCoverDto } from '../../../../../src/interfaces/api/rest/dto/SeriesCoverDto.js'
import { BookMetadataAggregationDto, SeriesDto, SeriesMetadataDto, restrictUrl as seriesRestrictUrl } from '../../../../../src/interfaces/api/rest/dto/SeriesDto.js'
import { SettingMultiSource, SettingsDto, publicSettings } from '../../../../../src/interfaces/api/rest/dto/SettingsDto.js'
import { SettingsUpdateDto } from '../../../../../src/interfaces/api/rest/dto/SettingsUpdateDto.js'
import { TachiyomiReadProgressDto } from '../../../../../src/interfaces/api/rest/dto/TachiyomiReadProgressDto.js'
import { TachiyomiReadProgressUpdateDto, TachiyomiReadProgressUpdateV2Dto } from '../../../../../src/interfaces/api/rest/dto/TachiyomiReadProgressUpdateDto.js'
import { TachiyomiReadProgressV2Dto } from '../../../../../src/interfaces/api/rest/dto/TachiyomiReadProgressV2Dto.js'
import { ThumbnailBookDto, toDto as thumbnailBookToDto } from '../../../../../src/interfaces/api/rest/dto/ThumbnailBookDto.js'
import { ThumbnailReadListDto } from '../../../../../src/interfaces/api/rest/dto/ThumbnailReadListDto.js'
import { ThumbnailSeriesCollectionDto } from '../../../../../src/interfaces/api/rest/dto/ThumbnailSeriesCollectionDto.js'
import { ThumbnailSeriesDto } from '../../../../../src/interfaces/api/rest/dto/ThumbnailSeriesDto.js'
import { ThumbnailSizeDto } from '../../../../../src/interfaces/api/rest/dto/ThumbnailSizeDto.js'
import { UserCreationDto } from '../../../../../src/interfaces/api/rest/dto/UserCreationDto.js'
import { AgeRestrictionDto, UserDto, toDto as komgaUserToDto } from '../../../../../src/interfaces/api/rest/dto/UserDto.js'
import { AgeRestrictionUpdateDto, AllowExcludeDto, SharedLibrariesUpdateDto, UserUpdateDto } from '../../../../../src/interfaces/api/rest/dto/UserUpdateDto.js'
import { WebLinkDto, toDto as webLinkToDto } from '../../../../../src/interfaces/api/rest/dto/WebLinkDto.js'
import { BinaryByteUnit } from '../../../../../src/port/byteunits.js'
import { URI } from '../../../../../src/port/java-net.js'
import { type JsonType, ObjectMapper, jsonPropertiesOf, toTree } from '../../../../../src/port/jackson-mapper.js'
import { type JsonNode, javaFloatToString, readTree, writeTree } from '../../../../../src/port/jackson-tree.js'
import { BEANS, BEAN_INPUTS, BYTE_UNITS, FUNCTIONS, READS, READ_INPUTS, WRITES } from './DtoJsonTest.expected.js'

// Modules qui importent des fichiers pas encore portés (infrastructure/validation, infrastructure/web)
async function tryImport<T>(path: string): Promise<T | null> {
  try {
    return (await import(path)) as T
  } catch {
    return null
  }
}
const bookMetadataUpdateDtoModule = await tryImport<typeof import('../../../../../src/interfaces/api/rest/dto/BookMetadataUpdateDto.js')>(
  '../../../../../src/interfaces/api/rest/dto/BookMetadataUpdateDto.js',
)
const collectionUpdateDtoModule = await tryImport<typeof import('../../../../../src/interfaces/api/rest/dto/CollectionUpdateDto.js')>(
  '../../../../../src/interfaces/api/rest/dto/CollectionUpdateDto.js',
)
const libraryDtoModule = await tryImport<typeof import('../../../../../src/interfaces/api/rest/dto/LibraryDto.js')>('../../../../../src/interfaces/api/rest/dto/LibraryDto.js')
const libraryUpdateDtoModule = await tryImport<typeof import('../../../../../src/interfaces/api/rest/dto/LibraryUpdateDto.js')>(
  '../../../../../src/interfaces/api/rest/dto/LibraryUpdateDto.js',
)
const pageHashMatchDtoModule = await tryImport<typeof import('../../../../../src/interfaces/api/rest/dto/PageHashMatchDto.js')>(
  '../../../../../src/interfaces/api/rest/dto/PageHashMatchDto.js',
)
const readListUpdateDtoModule = await tryImport<typeof import('../../../../../src/interfaces/api/rest/dto/ReadListUpdateDto.js')>(
  '../../../../../src/interfaces/api/rest/dto/ReadListUpdateDto.js',
)
const seriesMetadataUpdateDtoModule = await tryImport<typeof import('../../../../../src/interfaces/api/rest/dto/SeriesMetadataUpdateDto.js')>(
  '../../../../../src/interfaces/api/rest/dto/SeriesMetadataUpdateDto.js',
)

const m = new ObjectMapper()

const U = 'Été – 日本語 😀 "q" \\ \n\t/'
const ldt = LocalDateTime.of(2024, 3, 5, 7, 8, 9, 123456789)
const ldt0 = LocalDateTime.of(2024, 3, 5, 7, 8)
const ld = LocalDate.of(2024, 3, 5)
const zdt = ZonedDateTime.of(2024, 3, 5, 7, 8, 9, 120000000, ZoneOffset.ofHours(2))
const zdt0 = ZonedDateTime.of(2024, 3, 5, 7, 8, 0, 0, ZoneOffset.UTC)

// ---------------------------------------------------------------------------
// Valeurs écrites (mêmes constructions que DtoJsonTest.oracle.jsh)
// ---------------------------------------------------------------------------

const media = new MediaDto({ status: 'READY', mediaType: 'application/zip', pagesCount: 12, comment: '', epubDivinaCompatible: true, epubIsKepub: false })
const media2 = new MediaDto({ status: 'ERROR', mediaType: 'application/x-unknown', pagesCount: 0, comment: U, epubDivinaCompatible: false, epubIsKepub: true })
const bmeta = new BookMetadataDto({
  title: 't',
  titleLock: true,
  summary: U,
  summaryLock: false,
  number: '1.5',
  numberLock: true,
  numberSort: 1.5,
  numberSortLock: false,
  releaseDate: ld,
  releaseDateLock: true,
  authors: [new AuthorDto({ name: 'n', role: 'r' })],
  authorsLock: false,
  tags: new Set(['b', 'a']),
  tagsLock: true,
  isbn: '978',
  isbnLock: true,
  links: [new WebLinkDto({ label: 'l', url: 'https://x/y?z=1' })],
  linksLock: false,
  created: ldt,
  lastModified: ldt0,
})
const bmeta2 = new BookMetadataDto({
  title: '',
  titleLock: false,
  summary: '',
  summaryLock: false,
  number: '',
  numberLock: false,
  numberSort: 0.1,
  numberSortLock: false,
  releaseDate: null,
  releaseDateLock: false,
  authors: [],
  authorsLock: false,
  tags: new Set(),
  tagsLock: false,
  isbn: '',
  isbnLock: false,
  links: [],
  linksLock: false,
  created: ldt0,
  lastModified: ldt,
})
const rp = new ReadProgressDto({ page: 3, completed: false, readDate: ldt, created: ldt0, lastModified: ldt, deviceId: 'dev', deviceName: U })
const item = new JsonFeedDto.ItemDto({
  id: 'i1',
  url: 'https://u',
  title: 't',
  summary: 's',
  contentHtml: '<p>x</p>',
  dateModified: OffsetDateTime.of(2023, 12, 15, 0, 0, 0, 0, ZoneOffset.ofHours(1)),
  author: new JsonFeedDto.ItemAuthorDto({ name: 'gotson', url: null }),
  tags: new Set(['upgrade', 'komga']),
  komgaExtension: new JsonFeedDto.KomgaExtensionDto({ read: true }),
})
const item2 = new JsonFeedDto.ItemDto({ id: 'i2', url: null, title: null, summary: null, contentHtml: null, dateModified: null, author: null, komgaExtension: null })
const loc = new R2Locator({
  href: 'h.xhtml',
  type: 'application/xhtml+xml',
  title: 'title',
  locations: new R2Locator.Location({ fragments: ['f'], progression: 0.1, position: 3, totalProgression: 1.0 }),
})
const smeta = new SeriesMetadataDto({
  status: 'ONGOING',
  statusLock: true,
  title: U,
  titleLock: false,
  titleSort: 'ts',
  titleSortLock: true,
  summary: 'sum',
  summaryLock: false,
  readingDirection: 'LEFT_TO_RIGHT',
  readingDirectionLock: true,
  publisher: 'pub',
  publisherLock: false,
  ageRating: 16,
  ageRatingLock: true,
  language: 'fr',
  languageLock: false,
  genres: new Set(['g2', 'g1']),
  genresLock: true,
  tags: new Set(),
  tagsLock: false,
  totalBookCount: 10,
  totalBookCountLock: true,
  sharingLabels: new Set(['l']),
  sharingLabelsLock: false,
  links: [new WebLinkDto({ label: 'a', url: 'b' })],
  linksLock: true,
  alternateTitles: [new AlternateTitleDto({ label: 'jp', title: '日本' })],
  alternateTitlesLock: false,
  created: ldt,
  lastModified: ldt0,
})
const smeta2 = new SeriesMetadataDto({
  status: 'ENDED',
  statusLock: false,
  title: '',
  titleLock: false,
  titleSort: '',
  titleSortLock: false,
  summary: '',
  summaryLock: false,
  readingDirection: '',
  readingDirectionLock: false,
  publisher: '',
  publisherLock: false,
  ageRating: null,
  ageRatingLock: false,
  language: '',
  languageLock: false,
  genres: new Set(),
  genresLock: false,
  tags: new Set(),
  tagsLock: false,
  totalBookCount: null,
  totalBookCountLock: false,
  sharingLabels: new Set(),
  sharingLabelsLock: false,
  links: [],
  linksLock: false,
  alternateTitles: [],
  alternateTitlesLock: false,
  created: ldt0,
  lastModified: ldt0,
})
const bagg = new BookMetadataAggregationDto({
  authors: [new AuthorDto({ name: 'a', role: 'b' })],
  tags: new Set(['t1', 't2']),
  releaseDate: ld,
  summary: U,
  summaryNumber: '3',
  created: ldt,
  lastModified: ldt0,
})
const bagg2 = new BookMetadataAggregationDto({ releaseDate: null, summary: '', summaryNumber: '', created: ldt0, lastModified: ldt0 })

const ent = new BookEntitlementDto({
  activePeriod: new PeriodDto({ from: zdt0 }),
  created: zdt,
  crossRevisionId: 'c',
  id: 'i',
  isRemoved: true,
  lastModified: zdt0,
  revisionId: 'r',
})
const km = new KoboBookMetadataDto({
  contributorRoles: [new ContributorDto({ name: 'a' })],
  contributors: ['a'],
  coverImageId: 'cover',
  crossRevisionId: 'c',
  description: U,
  downloadUrls: [new DownloadUrlDto({ format: FormatDto.KEPUB, size: 5000000000, url: 'https://u' })],
  entitlementId: 'e',
  isbn: '978',
  phoneticPronunciations: new Map([['a', 'b']]),
  publicationDate: zdt,
  publisher: new PublisherDto({ name: 'pub' }),
  revisionId: 'r',
  series: new KoboSeriesDto({ id: 's', name: 'n', number: '1.5', numberFloat: 1.5 }),
  slug: 'slug',
  title: 'title',
  workId: 'w',
  isKepub: true,
  isPrePaginated: false,
  fileSize: 12,
  extraFileSizes: new Map([['x', 1]]),
})
const km2 = new KoboBookMetadataDto({
  categories: [],
  crossRevisionId: 'c',
  entitlementId: 'e',
  genre: '',
  revisionId: 'r',
  title: 'title',
  workId: 'w',
  isKepub: false,
  isPrePaginated: true,
  fileSize: 0,
})
const bm = new BookmarkDto({
  lastModified: zdt,
  progressPercent: 33.333332,
  contentSourceProgressPercent: 0.1,
  location: new LocationDto({ value: 'kobo.1.1', source: 'c.xhtml' }),
})
const rs = new ReadingStateDto({
  created: zdt0,
  currentBookmark: bm,
  entitlementId: 'e',
  lastModified: zdt,
  priorityTimestamp: zdt,
  statistics: new StatisticsDto({ lastModified: zdt, remainingTimeMinutes: 10 }),
  statusInfo: new StatusInfoDto({ lastModified: zdt, status: StatusDto.READY_TO_READ, timesStartedReading: 1, lastTimeFinished: zdt0 }),
})
const rs2 = new ReadingStateDto({
  currentBookmark: new BookmarkDto({ lastModified: zdt0 }),
  entitlementId: 'e',
  lastModified: zdt0,
  statistics: new StatisticsDto({ lastModified: zdt0 }),
  statusInfo: new StatusInfoDto({ lastModified: zdt0, status: StatusDto.FINISHED }),
})
const ctr = new BookEntitlementContainerDto({ bookEntitlement: ent, bookMetadata: km, readingState: rs })
const tag = new WrappedTagDto({
  tag: new TagDto({ id: 't', created: zdt, lastModified: zdt0, name: U, type: TagTypeDto.USER_TAG, items: [new TagItemDto({ revisionId: 'r' })] }),
})
const tag2 = new WrappedTagDto({ tag: new TagDto({ id: 't', created: zdt, lastModified: zdt0, name: 'n', type: TagTypeDto.SYSTEM_TAG }) })
const rsur = new ReadingStateUpdateResultDto({
  entitlementId: 'e',
  currentBookmarkResult: ResultDto.SUCCESS.wrapped(),
  statisticsResult: new WrappedResultDto({ result: ResultDto.FAILURE }),
  statusInfoResult: new WrappedResultDto({ result: ResultDto.IGNORED }),
})

const WRITE_VALUES: Record<string, () => unknown> = {
  AlternateTitleDto: () => new AlternateTitleDto({ label: 'fr', title: U }),
  ApiKeyDto: () => new ApiKeyDto({ id: 'id1', userId: 'user1', key: 'key', comment: U, createdDate: zdt, lastModifiedDate: zdt0 }),
  'AuthenticationActivityDto.nulls': () =>
    new AuthenticationActivityDto({ userId: null, email: null, ip: null, userAgent: null, success: false, error: null, dateTime: ldt, source: null }),
  'AuthenticationActivityDto.full': () =>
    new AuthenticationActivityDto({
      userId: 'u',
      email: 'a@b.c',
      apiKeyId: 'k',
      apiKeyComment: 'c',
      ip: '127.0.0.1',
      userAgent: U,
      success: true,
      error: 'err',
      dateTime: ldt0,
      source: 'Password',
    }),
  AuthorDto: () => new AuthorDto({ name: U, role: 'writer' }),
  MediaDto: () => media,
  'MediaDto.unknown': () => media2,
  BookMetadataDto: () => bmeta,
  'BookMetadataDto.empty': () => bmeta2,
  ReadProgressDto: () => rp,
  BookDto: () =>
    new BookDto({
      id: 'b1',
      seriesId: 's1',
      seriesTitle: U,
      libraryId: 'l1',
      name: 'name',
      url: '/a/b/c.cbz',
      number: 7,
      created: ldt,
      lastModified: ldt0,
      fileLastModified: ldt,
      sizeBytes: 2048,
      media,
      metadata: bmeta,
      readProgress: rp,
      deleted: false,
      fileHash: 'hash',
      oneshot: true,
    }),
  'BookDto.noProgress': () =>
    new BookDto({
      id: 'b2',
      seriesId: 's1',
      seriesTitle: 'st',
      libraryId: 'l1',
      name: 'name',
      url: 'c.cbz',
      number: 0,
      created: ldt0,
      lastModified: ldt0,
      fileLastModified: ldt0,
      sizeBytes: 5000000000,
      size: '4,7 GiB',
      media: media2,
      metadata: bmeta2,
      deleted: true,
      fileHash: '',
      oneshot: false,
    }),
  'BookDto.restrictUrl': () =>
    bookRestrictUrl(
      new BookDto({
        id: 'b2',
        seriesId: 's1',
        seriesTitle: 'st',
        libraryId: 'l1',
        name: 'name',
        url: '/x/y\\z.cbz',
        number: 0,
        created: ldt0,
        lastModified: ldt0,
        fileLastModified: ldt0,
        sizeBytes: 512,
        media: media2,
        metadata: bmeta2,
        deleted: true,
        fileHash: '',
        oneshot: false,
      }),
      true,
    ),
  BookImportBatchDto: () =>
    new BookImportBatchDto({
      books: [new BookImportDto({ sourceFile: '/a', seriesId: 's' }), new BookImportDto({ sourceFile: '/b', seriesId: 's', upgradeBookId: 'u', destinationName: 'd' })],
      copyMode: CopyMode.HARDLINK,
    }),
  ClientSettingDto: () => new ClientSettingDto({ value: 'v', allowUnauthorized: true }),
  'ClientSettingDto.null': () => new ClientSettingDto({ value: U, allowUnauthorized: null }),
  ClientSettingGlobalUpdateDto: () => new ClientSettingGlobalUpdateDto({ value: 'v', allowUnauthorized: false }),
  ClientSettingUserUpdateDto: () => new ClientSettingUserUpdateDto({ value: 'v' }),
  CollectionCreationDto: () => new CollectionCreationDto({ name: 'n', ordered: true, seriesIds: ['a', 'b'] }),
  CollectionDto: () => new CollectionDto({ id: 'c1', name: U, ordered: false, seriesIds: [], createdDate: ldt, lastModifiedDate: ldt0, filtered: true }),
  CollectionUpdateDto: () => (collectionUpdateDtoModule ? new collectionUpdateDtoModule.CollectionUpdateDto({ name: null, ordered: null, seriesIds: null }) : null),
  GithubReleaseDto: () => new GithubReleaseDto({ htmlUrl: 'https://h', tagName: '1.0.0', publishedAt: zdt, body: U, prerelease: false }),
  GroupCountDto: () => new GroupCountDto({ group: 'A', count: 42 }),
  HistoricalEventDto: () =>
    new HistoricalEventDto({
      id: 'e1',
      type: 'BookFileDeleted',
      timestamp: ldt,
      bookId: 'b',
      seriesId: null,
      properties: new Map([
        ['reason', U],
        ['name', 'x'],
      ]),
    }),
  'HistoricalEventDto.empty': () =>
    new HistoricalEventDto({ id: 'e1', type: 'SeriesFolderDeleted', timestamp: ldt0, bookId: null, seriesId: 's', properties: new Map() }),
  JsonFeedDto: () =>
    new JsonFeedDto({ version: 'https://jsonfeed.org/version/1', title: 'Announcements', homePageUrl: 'https://komga.org/blog', description: U, items: [item, item2] }),
  'JsonFeedDto.ItemDto': () => item,
  LibraryCreationDto: () =>
    new LibraryCreationDto({
      name: 'n',
      root: '/r',
      importComicInfoBook: true,
      importComicInfoSeries: false,
      importComicInfoCollection: true,
      importComicInfoReadList: false,
      importComicInfoSeriesAppendVolume: true,
      importEpubBook: false,
      importEpubSeries: true,
      importMylarSeries: false,
      importLocalArtwork: true,
      importBarcodeIsbn: false,
      scanForceModifiedTime: true,
      scanInterval: ScanIntervalDto.DAILY,
      scanOnStartup: false,
      scanCbx: true,
      scanPdf: false,
      scanEpub: true,
      scanDirectoryExclusions: new Set(['#recycle']),
      repairExtensions: false,
      convertToCbz: true,
      emptyTrashAfterScan: false,
      seriesCover: SeriesCoverDto.LAST,
      hashFiles: true,
      hashPages: false,
      hashKoreader: true,
      analyzeDimensions: false,
      oneshotsDirectory: null,
    }),
  LibraryDto: () =>
    libraryDtoModule
      ? new libraryDtoModule.LibraryDto({
          id: 'l1',
          name: U,
          root: '/root',
          importComicInfoBook: true,
          importComicInfoSeries: false,
          importComicInfoCollection: true,
          importComicInfoReadList: false,
          importComicInfoSeriesAppendVolume: true,
          importEpubBook: false,
          importEpubSeries: true,
          importMylarSeries: false,
          importLocalArtwork: true,
          importBarcodeIsbn: false,
          scanForceModifiedTime: true,
          scanInterval: ScanIntervalDto.EVERY_12H,
          scanOnStartup: false,
          scanCbx: true,
          scanPdf: false,
          scanEpub: true,
          scanDirectoryExclusions: new Set(['#recycle', '@eaDir']),
          repairExtensions: false,
          convertToCbz: true,
          emptyTrashAfterScan: false,
          seriesCover: SeriesCoverDto.FIRST_UNREAD_OR_LAST,
          hashFiles: true,
          hashPages: false,
          hashKoreader: true,
          analyzeDimensions: false,
          oneshotsDirectory: '_oneshots',
          unavailable: true,
        })
      : null,
  PageDto: () => new PageDto({ number: 1, fileName: U, mediaType: 'image/jpeg', width: 800, height: 1200, sizeBytes: 2048 }),
  'PageDto.nulls': () => new PageDto({ number: 2, fileName: 'p.png', mediaType: 'image/png', width: null, height: null, sizeBytes: null }),
  PageHashCreationDto: () => new PageHashCreationDto({ hash: 'h', size: 12, action: PageHashKnown.Action.DELETE_AUTO }),
  PageHashKnownDto: () =>
    new PageHashKnownDto({ hash: 'h', size: null, action: PageHashKnown.Action.IGNORE, deleteCount: 1, matchCount: 2, created: ldt, lastModified: ldt0 }),
  PageHashMatchDto: () =>
    pageHashMatchDtoModule
      ? new pageHashMatchDtoModule.PageHashMatchDto({ bookId: 'b', url: '/a/b.cbz', pageNumber: 3, fileName: 'p.jpg', fileSize: 5000000000, mediaType: 'image/jpeg' })
      : null,
  PageHashUnknownDto: () => new PageHashUnknownDto({ hash: 'h', size: 123, matchCount: 4 }),
  PasswordUpdateDto: () => new PasswordUpdateDto({ password: U }),
  R2Positions: () => new R2Positions({ total: 2, positions: [loc, new R2Locator({ href: 'h2', type: 't', koboSpan: 'kobo.1.1' })] }),
  'R2Positions.empty': () => new R2Positions({ total: 0, positions: [] }),
  ReadListCreationDto: () => new ReadListCreationDto({ name: 'n', summary: U, ordered: false, bookIds: ['a'] }),
  ReadListDto: () => new ReadListDto({ id: 'r1', name: 'n', summary: U, ordered: true, bookIds: ['b1', 'b2'], createdDate: ldt, lastModifiedDate: ldt0, filtered: false }),
  ReadListRequestMatchDto: () =>
    new ReadListRequestMatchDto({
      readListMatch: new ReadListMatchDto({ name: 'rl', errorCode: 'ERR_1' }),
      requests: [
        new ReadListRequestBookMatchesDto({
          request: new ReadListRequestBookDto({ series: new Set(['S1', 'S2']), number: '1' }),
          matches: [
            new ReadListRequestBookMatchDto({
              series: new ReadListRequestBookMatchSeriesDto({ seriesId: 's', title: U, releaseDate: ld }),
              books: [new ReadListRequestBookMatchBookDto({ bookId: 'b', number: '1', title: 't' })],
            }),
            new ReadListRequestBookMatchDto({ series: new ReadListRequestBookMatchSeriesDto({ seriesId: 's2', title: 't2', releaseDate: null }), books: [] }),
          ],
        }),
        new ReadListRequestBookMatchesDto({ request: new ReadListRequestBookDto({ series: new Set(), number: '' }), matches: [] }),
      ],
      errorCode: '',
    }),
  ReadListUpdateDto: () => (readListUpdateDtoModule ? new readListUpdateDtoModule.ReadListUpdateDto({ name: 'n', summary: null, bookIds: ['a'], ordered: true }) : null),
  ReadProgressUpdateDto: () => new ReadProgressUpdateDto({ page: null, completed: true }),
  ReleaseDto: () => new ReleaseDto({ version: '1.2.3', releaseDate: zdt, url: 'https://u', latest: true, preRelease: false, description: U }),
  SeriesMetadataDto: () => smeta,
  BookMetadataAggregationDto: () => bagg,
  SeriesDto: () =>
    new SeriesDto({
      id: 's1',
      libraryId: 'l1',
      name: U,
      url: '/a/b',
      created: ldt,
      lastModified: ldt0,
      fileLastModified: ldt,
      booksCount: 10,
      booksReadCount: 2,
      booksUnreadCount: 7,
      booksInProgressCount: 1,
      metadata: smeta,
      booksMetadata: bagg,
      deleted: false,
      oneshot: true,
    }),
  'SeriesDto.empty': () =>
    seriesRestrictUrl(
      new SeriesDto({
        id: 's2',
        libraryId: 'l1',
        name: 'n',
        url: '/a/b',
        created: ldt0,
        lastModified: ldt0,
        fileLastModified: ldt0,
        booksCount: 0,
        booksReadCount: 0,
        booksUnreadCount: 0,
        booksInProgressCount: 0,
        metadata: smeta2,
        booksMetadata: bagg2,
        deleted: true,
        oneshot: false,
      }),
      true,
    ),
  SettingsDto: () =>
    new SettingsDto({
      deleteEmptyCollections: true,
      deleteEmptyReadLists: false,
      rememberMeDurationDays: 365,
      thumbnailSize: ThumbnailSizeDto.LARGE,
      taskPoolSize: 4,
      serverPort: new SettingMultiSource<number>({ configurationSource: 25600, databaseSource: null, effectiveValue: 25600 }),
      serverContextPath: new SettingMultiSource<string>({ configurationSource: null, databaseSource: '/komga', effectiveValue: '/komga' }),
      koboProxy: false,
      koboPort: 8080,
      kepubifyPath: new SettingMultiSource<string>({ configurationSource: null, databaseSource: null, effectiveValue: null }),
      maxUploadFileSizeBytes: 5000000000,
    }),
  'SettingsDto.empty': () => new SettingsDto(),
  'SettingsDto.public': () =>
    publicSettings(
      new SettingsDto({
        deleteEmptyCollections: true,
        deleteEmptyReadLists: false,
        rememberMeDurationDays: 365,
        thumbnailSize: ThumbnailSizeDto.LARGE,
        taskPoolSize: 4,
        koboProxy: false,
        koboPort: 8080,
        maxUploadFileSizeBytes: 1024,
      }),
    ),
  TachiyomiReadProgressDto: () =>
    new TachiyomiReadProgressDto({ booksCount: 10, booksReadCount: 2, booksUnreadCount: 7, booksInProgressCount: 1, lastReadContinuousIndex: 3 }),
  TachiyomiReadProgressUpdateDto: () => new TachiyomiReadProgressUpdateDto({ lastBookRead: 5 }),
  TachiyomiReadProgressUpdateV2Dto: () => new TachiyomiReadProgressUpdateV2Dto({ lastBookNumberSortRead: 0.1 }),
  TachiyomiReadProgressV2Dto: () =>
    new TachiyomiReadProgressV2Dto({
      booksCount: 10,
      booksReadCount: 2,
      booksUnreadCount: 7,
      booksInProgressCount: 1,
      lastReadContinuousNumberSort: 3.0,
      maxNumberSort: 12.3,
    }),
  ThumbnailBookDto: () =>
    new ThumbnailBookDto({ id: 't', bookId: 'b', type: 'GENERATED', selected: true, mediaType: 'image/jpeg', fileSize: 5000000000, width: 300, height: 400 }),
  ThumbnailReadListDto: () =>
    new ThumbnailReadListDto({ id: 't', readListId: 'r', type: 'USER_UPLOADED', selected: false, mediaType: 'image/png', fileSize: 12, width: 0, height: 0 }),
  ThumbnailSeriesCollectionDto: () =>
    new ThumbnailSeriesCollectionDto({ id: 't', collectionId: 'c', type: 'USER_UPLOADED', selected: false, mediaType: 'image/png', fileSize: 12, width: 1, height: 2 }),
  ThumbnailSeriesDto: () =>
    new ThumbnailSeriesDto({ id: 't', seriesId: 's', type: 'SIDECAR', selected: true, mediaType: 'image/webp', fileSize: 12, width: 1, height: 2 }),
  UserCreationDto: () =>
    new UserCreationDto({
      email: 'a@b.c',
      password: 'p',
      roles: ['ADMIN'],
      ageRestriction: new AgeRestrictionUpdateDto({ age: 12, restriction: AllowExcludeDto.NONE }),
      labelsAllow: null,
      labelsExclude: new Set(['x']),
      sharedLibraries: new SharedLibrariesUpdateDto({ all: false, libraryIds: new Set(['l']) }),
    }),
  UserDto: () =>
    new UserDto({
      id: 'u',
      email: 'a@b.c',
      roles: new Set(['ADMIN', 'USER']),
      sharedAllLibraries: false,
      sharedLibrariesIds: new Set(['l1', 'l2']),
      labelsAllow: new Set(),
      labelsExclude: new Set(['x']),
      ageRestriction: new AgeRestrictionDto({ age: 16, restriction: AllowExclude.EXCLUDE }),
    }),
  'UserDto.noAge': () =>
    new UserDto({
      id: 'u',
      email: 'a@b.c',
      roles: new Set(['USER']),
      sharedAllLibraries: true,
      sharedLibrariesIds: new Set(),
      labelsAllow: new Set(),
      labelsExclude: new Set(),
      ageRestriction: null,
    }),
  AgeRestrictionUpdateDto: () => new AgeRestrictionUpdateDto({ age: 3, restriction: AllowExcludeDto.ALLOW_ONLY }),
  SharedLibrariesUpdateDto: () => new SharedLibrariesUpdateDto({ all: true, libraryIds: new Set() }),
  WebLinkDto: () => new WebLinkDto({ label: U, url: 'https://a/b' }),
  // kobo
  AmountDto: () => new AmountDto({ currencyCode: 'USD', totalAmount: 0 }),
  'AmountDto.null': () => new AmountDto({ totalAmount: 5 }),
  AuthDto: () => new AuthDto({ accessToken: 'a', refreshToken: 'r', trackingId: 't', userKey: 'u' }),
  BookEntitlementContainerDto: () => ctr,
  'BookEntitlementContainerDto.noState': () => new BookEntitlementContainerDto({ bookEntitlement: ent, bookMetadata: km2 }),
  BookEntitlementDto: () => ent,
  BookmarkDto: () => bm,
  'BookmarkDto.nulls': () => new BookmarkDto({ lastModified: zdt0 }),
  ContributorDto: () => new ContributorDto({ name: U }),
  DownloadUrlDto: () => new DownloadUrlDto({ format: FormatDto.EPUB3FL, size: 1, platform: 'Android', url: 'u' }),
  KoboBookMetadataDto: () => km,
  'KoboBookMetadataDto.min': () => km2,
  KoboSeriesDto: () => new KoboSeriesDto({ id: 's', name: 'n', number: '1', numberFloat: 0.1 }),
  LocationDto: () => new LocationDto({ type: null, source: 's' }),
  'LocationDto.default': () => new LocationDto({ source: 's' }),
  PeriodDto: () => new PeriodDto({ from: zdt }),
  PublisherDto: () => new PublisherDto({ imprint: 'imp', name: U }),
  ReadingStateDto: () => rs,
  'ReadingStateDto.min': () => rs2,
  WrappedReadingStateDto: () => new WrappedReadingStateDto({ readingState: rs2 }),
  ReadingStateStateUpdateDto: () => new ReadingStateStateUpdateDto({ readingStates: [rs, rs2] }),
  RequestResultDto: () => new RequestResultDto({ requestResult: ResultDto.SUCCESS, updateResults: [rsur] }),
  'RequestResultDto.empty': () => new RequestResultDto({ requestResult: ResultDto.IGNORED, updateResults: [] }),
  ReadingStateUpdateResultDto: () => rsur,
  WrappedResultDto: () => new WrappedResultDto({ result: ResultDto.FAILURE }),
  ResourcesDto: () => new ResourcesDto({ resources: m.readTree('{"a":1,"b":[1.5,"x",null,true],"c":{"d":1.0E10}}') }),
  StatisticsDto: () => new StatisticsDto({ lastModified: zdt, remainingTimeMinutes: 1, spentReadingMinutes: 2 }),
  StatusInfoDto: () => new StatusInfoDto({ lastModified: zdt, status: StatusDto.READING, timesStartedReading: 2, lastTimeFinished: zdt, lastTimeStartedReading: zdt0 }),
  NewEntitlementDto: () => new NewEntitlementDto({ newEntitlement: ctr }),
  ChangedEntitlementDto: () => new ChangedEntitlementDto({ changedEntitlement: new BookEntitlementContainerDto({ bookEntitlement: ent, bookMetadata: km2 }) }),
  ChangedProductMetadataDto: () => new ChangedProductMetadataDto({ changedProductMetadata: km2 }),
  NewTagDto: () => new NewTagDto({ newTag: tag }),
  ChangedTagDto: () => new ChangedTagDto({ changedTag: tag2 }),
  DeletedTagDto: () => new DeletedTagDto({ deletedTag: tag2 }),
  ChangedReadingStateDto: () => new ChangedReadingStateDto({ changedReadingState: new WrappedReadingStateDto({ readingState: rs }) }),
  SyncResultList: () => [new NewEntitlementDto({ newEntitlement: ctr }), new NewTagDto({ newTag: tag2 })],
  TagDto: () => tag.tag,
  WrappedTagDto: () => tag,
  TagItemDto: () => new TagItemDto({ revisionId: 'r', type: 'x' }),
  TestsDto: () => new TestsDto({ result: 'Success', testKey: 'k', tests: new Map([['t', 'v']]) }),
  'TestsDto.empty': () => new TestsDto({ result: 'Success', testKey: 'k' }),
  FormatDto: () => FormatDto.EPUB3,
  ResultDto: () => ResultDto.SUCCESS,
  StatusDto: () => StatusDto.READY_TO_READ,
  TagTypeDto: () => TagTypeDto.SYSTEM_TAG,
}

// ---------------------------------------------------------------------------
// Classes lues
// ---------------------------------------------------------------------------

const READ_CLASSES: Record<string, object | null> = {
  AlternateTitleDto,
  ApiKeyRequestDto,
  BookImportBatchDto,
  ClientSettingGlobalUpdateDto,
  ClientSettingUserUpdateDto,
  CollectionCreationDto,
  CollectionUpdateDto: collectionUpdateDtoModule?.CollectionUpdateDto ?? null,
  GithubReleaseDto,
  JsonFeedDto,
  LibraryCreationDto,
  PageHashCreationDto,
  PasswordUpdateDto,
  ReadListCreationDto,
  ReadListUpdateDto: readListUpdateDtoModule?.ReadListUpdateDto ?? null,
  ReadProgressUpdateDto,
  TachiyomiReadProgressUpdateDto,
  TachiyomiReadProgressUpdateV2Dto,
  UserCreationDto,
  ReadingStateStateUpdateDto,
  TagDto,
  WrappedResultDto,
  AuthDto,
  AlternateTitleUpdateDto,
  BookMetadataUpdateDto: bookMetadataUpdateDtoModule?.BookMetadataUpdateDto ?? null,
  LibraryUpdateDto: libraryUpdateDtoModule?.LibraryUpdateDto ?? null,
  SeriesMetadataUpdateDto: seriesMetadataUpdateDtoModule?.SeriesMetadataUpdateDto ?? null,
  SettingsUpdateDto,
  UserUpdateDto,
}

// Cas écartés : divergence connue de port/jackson-mapper.ts (lecture des enums insensible à la casse,
// alors que MapperFeature.ACCEPT_CASE_INSENSITIVE_VALUES ne s'applique pas aux enums dans Jackson)
// Écarts de l'ObjectMapper corrigés (casse des enums, null explicite pour un paramètre non nul) : plus aucun cas exclu
const KNOWN_MAPPER_DIVERGENCES = new Set<string>([])

/** Exceptions Jackson (Java) -> exceptions de port/jackson-mapper.ts */
const EXCEPTIONS: Record<string, string> = {
  KotlinInvalidNullException: 'MissingKotlinParameterException',
  MissingKotlinParameterException: 'MissingKotlinParameterException',
  InvalidFormatException: 'InvalidFormatException',
  MismatchedInputException: 'MismatchedInputException',
}

function canon(n: JsonNode): JsonNode {
  if (n instanceof Map) return new Map([...n].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, canon(v)]))
  if (Array.isArray(n)) return n.map(canon)
  return n
}

/** Propriétés d'un DTO à setters, comme Jackson les écrit (getters), clés triées */
function dumpBean(o: object, cls: object): string {
  const props = jsonPropertiesOf(cls)?.props ?? {}
  const tree = new Map<string, JsonNode>(Object.entries(props).map(([k, t]) => [k, toTree((o as Record<string, unknown>)[k], t as JsonType)]))
  return writeTree(canon(tree))
}

function readAndWrite(json: string, cls: object): string {
  try {
    return m.writeValueAsString(m.readValue(json, { class: cls }))
  } catch (e) {
    return `ERR ${(e as Error).constructor.name}`
  }
}

function expectedError(s: string): string {
  return s.startsWith('ERR ') ? `ERR ${EXCEPTIONS[s.slice(4)] ?? s.slice(4)}` : s
}

// ---------------------------------------------------------------------------
// Fonctions d'extension (cas indépendants du fuseau horaire)
// ---------------------------------------------------------------------------

function fl(v: number | null): string {
  return v === null ? 'null' : javaFloatToString(v)
}

function pm(b: BookMetadata): string {
  return [
    b.title,
    b.summary,
    b.number,
    javaFloatToString(b.numberSort),
    b.releaseDate === null ? 'null' : b.releaseDate.toString(),
    `[${b.authors.map((a) => `${a.name}:${a.role}`).join(', ')}]`,
    `[${[...b.tags].join(', ')}]`,
    b.isbn,
    `[${b.links.map((l) => `${l.label}=${l.url.toString()}`).join(', ')}]`,
    `${b.titleLock}${b.summaryLock}${b.numberLock}${b.numberSortLock}${b.releaseDateLock}${b.authorsLock}${b.tagsLock}${b.isbnLock}${b.linksLock}`,
  ].join('|')
}

function readProgressCase(pr: ReadProgress): string {
  const st = readProgressToDto(pr)
  const b = st.currentBookmark
  return [fl(b.progressPercent), fl(b.contentSourceProgressPercent), m.writeValueAsString(b.location), st.statusInfo.status.name, String(st.statusInfo.timesStartedReading), st.entitlementId].join('|')
}

const base = new BookMetadata({
  title: 'Title',
  summary: 'Summary',
  number: '1',
  numberSort: 1.0,
  releaseDate: ld,
  authors: [new Author({ name: 'a', role: 'writer' })],
  tags: new Set(['t1', 't2']),
  isbn: '9781234567897',
  links: [new WebLink({ label: 'l', url: new URI('https://l') })],
  bookId: 'bid',
  createdDate: ldt,
  lastModifiedDate: ldt,
})

function patchCase(json: string): string | null {
  if (!bookMetadataUpdateDtoModule) return null
  const { BookMetadataUpdateDto, patch } = bookMetadataUpdateDtoModule
  return pm(patch(base, m.readValue(json, { class: BookMetadataUpdateDto })))
}

const FUNCTION_VALUES: Record<string, () => unknown> = {
  'AlternateTitle.toDto': () => alternateTitleToDto(new AlternateTitle({ label: 'l', title: U })),
  'Author.toDto': () => authorToDto(new Author({ name: ' N é ', role: ' WRITER ' })),
  'WebLink.toDto': () => webLinkToDto(new WebLink({ label: 'l', url: new URI('https://a/b%20c?x=1#f') })),
  'ThumbnailBook.toDto': () =>
    thumbnailBookToDto(
      new ThumbnailBook({
        selected: true,
        type: ThumbnailBook.Type.SIDECAR,
        mediaType: 'image/png',
        fileSize: 10,
        dimension: new Dimension({ width: 3, height: 4 }),
        id: 'tid',
        bookId: 'bid',
        createdDate: ldt,
        lastModifiedDate: ldt,
      }),
    ),
  'PageHashUnknown.toDto': () => pageHashUnknownToDto(new PageHashUnknown({ hash: 'h', size: 5, matchCount: 3 })),
  'ApiKeyDto.redacted': () => redacted(new ApiKeyDto({ id: 'id1', userId: 'user1', key: 'secret', comment: 'c', createdDate: zdt, lastModifiedDate: zdt0 })),
  'KomgaUser.toDto': () =>
    komgaUserToDto(
      new KomgaUser({
        email: 'a@b.c',
        password: 'p',
        roles: new Set([UserRoles.ADMIN, UserRoles.FILE_DOWNLOAD]),
        sharedLibrariesIds: new Set(['l1']),
        sharedAllLibraries: false,
        restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }), labelsAllow: new Set(['A']) }),
        id: 'uid',
        createdDate: ldt,
        lastModifiedDate: ldt,
      }),
    ),
  'KomgaUser.toDto.noRestriction': () =>
    komgaUserToDto(
      new KomgaUser({
        email: 'a@b.c',
        password: 'p',
        roles: new Set(),
        sharedLibrariesIds: new Set(),
        sharedAllLibraries: true,
        restrictions: new ContentRestrictions({}),
        id: 'uid',
        createdDate: ldt,
        lastModifiedDate: ldt,
      }),
    ),
  'ReadListRequestMatch.toDto': () =>
    readListRequestMatchToDto(
      new ReadListRequestMatch({
        readListMatch: new ReadListMatch({ name: 'rl', errorCode: 'E' }),
        requests: [
          new ReadListRequestBookMatches({
            request: new ReadListRequestBook({ series: new Set(['x', 'y']), number: '1' }),
            matches: new Map([
              [
                new ReadListRequestBookMatchSeries({ id: 's1', title: 'S1', releaseDate: ld }),
                [new ReadListRequestBookMatchBook({ id: 'b1', number: '1', title: 'B1' }), new ReadListRequestBookMatchBook({ id: 'b2', number: '2', title: 'B2' })],
              ],
              [new ReadListRequestBookMatchSeries({ id: 's2', title: 'S2', releaseDate: null }), []],
            ]),
          }),
        ],
        errorCode: 'ignored',
      }),
    ),
  'SyncPoint.ReadList.toWrappedTagDto': () =>
    toWrappedTagDto(
      new SyncPoint.ReadList({ syncPointId: 'sp', readListId: 'rl', readListName: 'name', createdDate: zdt, lastModifiedDate: zdt0, synced: false }),
      { items: [new TagItemDto({ revisionId: 'b1', type: 'ProductRevisionTagItem' })] },
    ),
  'SyncPoint.ReadList.toWrappedTagDto.noItems': () =>
    toWrappedTagDto(new SyncPoint.ReadList({ syncPointId: 'sp', readListId: 'rl', readListName: 'name', createdDate: zdt, lastModifiedDate: zdt0, synced: false })),
  'ZonedDateTime.toPeriodDto': () => toPeriodDto(zdt),
  'ReadProgress.toDto.true.h.loc': () =>
    readProgressCase(
      new ReadProgress({
        bookId: 'b',
        userId: 'u',
        page: 1,
        completed: true,
        readDate: ldt,
        locator: new R2Locator({ href: 'h', type: 't', locations: new R2Locator.Location({ progression: 0.123, position: 1, totalProgression: 0.3333 }), koboSpan: 'kobo.2.3' }),
        createdDate: ldt,
        lastModifiedDate: ldt,
      }),
    ),
  'ReadProgress.toDto.false.null': () =>
    readProgressCase(new ReadProgress({ bookId: 'b', userId: 'u', page: 1, completed: false, readDate: ldt, createdDate: ldt, lastModifiedDate: ldt })),
  'ReadProgress.toDto.false.h': () =>
    readProgressCase(
      new ReadProgress({ bookId: 'b', userId: 'u', page: 1, completed: false, readDate: ldt, locator: new R2Locator({ href: 'h', type: 't' }), createdDate: ldt, lastModifiedDate: ldt }),
    ),
}
for (const name of Object.keys(FUNCTIONS)) if (name.startsWith('BookMetadata.patch ')) FUNCTION_VALUES[name] = () => patchCase(name.slice('BookMetadata.patch '.length))

describe('DtoJsonTest', () => {
  describe('write', () => {
    for (const [name, expected] of Object.entries(WRITES)) {
      const build = WRITE_VALUES[name]
      const value = build ? build() : undefined
      it.skipIf(value === null)(name, () => {
        expect(build, `no TS value for ${name}`).toBeDefined()
        expect(m.writeValueAsString(value)).toBe(expected)
      })
    }

    it('covers every oracle case', () => {
      expect(Object.keys(WRITE_VALUES).sort()).toEqual(Object.keys(WRITES).sort())
    })
  })

  describe('read', () => {
    for (const [name, expected] of Object.entries(READS)) {
      const [json, className] = READ_INPUTS[name] as [string, string]
      const cls = READ_CLASSES[className]
      it.skipIf(cls === null || KNOWN_MAPPER_DIVERGENCES.has(name))(name, () => {
        expect(cls, `no TS class for ${className}`).toBeDefined()
        expect(readAndWrite(json, cls as object)).toBe(expectedError(expected))
      })
    }
  })

  describe('read (setters)', () => {
    for (const [name, [expectedJson, expectedIsSet]] of Object.entries(BEANS)) {
      const [json, className, isSetProps] = BEAN_INPUTS[name] as [string, string, string[]]
      const cls = READ_CLASSES[className]
      it.skipIf(cls === null || KNOWN_MAPPER_DIVERGENCES.has(name))(name, () => {
        expect(cls, `no TS class for ${className}`).toBeDefined()
        let actual: [string, string]
        try {
          const o = m.readValue<{ isSet?(p: string): boolean }>(json, { class: cls as object })
          actual = [dumpBean(o, cls as object), isSetProps.map((p) => `${p}=${String(o.isSet?.(p))},`).join('')]
        } catch (e) {
          actual = [`ERR ${(e as Error).constructor.name}`, '']
        }
        if (expectedJson.startsWith('ERR ')) expect(actual[0]).toBe(expectedError(expectedJson))
        else expect(actual).toEqual([writeTree(canon(readTree(expectedJson))), expectedIsSet])
      })
    }
  })

  describe('extension functions', () => {
    for (const [name, expected] of Object.entries(FUNCTIONS)) {
      const build = FUNCTION_VALUES[name]
      const value = build ? build() : undefined
      it.skipIf(value === null)(name, () => {
        expect(build, `no TS value for ${name}`).toBeDefined()
        expect(typeof value === 'string' ? value : m.writeValueAsString(value)).toBe(expected)
      })
    }
  })

  describe('BinaryByteUnit', () => {
    for (const [n, [us, fr]] of Object.entries(BYTE_UNITS)) {
      it(`format(${n})`, () => {
        expect(BinaryByteUnit.format(Number(n), 'en-US')).toBe(us)
        expect(BinaryByteUnit.format(Number(n), 'fr-FR')).toBe(fr)
      })
    }
  })

  it('computed defaults', () => {
    // MediaDto.mediaProfile (by lazy) et BookDto.size / PageDto.size (valeurs par défaut calculées)
    expect(media.mediaProfile).toBe('DIVINA')
    expect(new PageDto({ number: 1, fileName: 'f', mediaType: 't', width: null, height: null, sizeBytes: 1024 }).size).toBe('1 KiB')
    expect(DUMMY_ID).toBe('00000000-0000-0000-0000-000000000001')
  })
})
