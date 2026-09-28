// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/KoboController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { rmSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { ZonedDateTime } from '@js-joda/core'
import { LRUCache } from 'lru-cache'
import type { Book } from '../../../domain/model/Book.js'
import { KEPUB_DEFAULT } from '../../../domain/model/BookProjectionProfiles.js'
import { BookWithMedia } from '../../../domain/model/BookWithMedia.js'
import { KomgaSyncToken } from '../../../domain/model/KomgaSyncToken.js'
import { MediaExtensionEpub } from '../../../domain/model/MediaExtension.js'
import { MediaType as KomgaMediaType } from '../../../domain/model/MediaType.js'
import { R2Device } from '../../../domain/model/R2Device.js'
import { R2Locator } from '../../../domain/model/R2Locator.js'
import { R2Progression } from '../../../domain/model/R2Progression.js'
import type { SyncPoint } from '../../../domain/model/SyncPoint.js'
import { BookRepository } from '../../../domain/persistence/BookRepository.js'
import { MediaRepository } from '../../../domain/persistence/MediaRepository.js'
import { ReadProgressRepository } from '../../../domain/persistence/ReadProgressRepository.js'
import { SyncPointRepository } from '../../../domain/persistence/SyncPointRepository.js'
import { ThumbnailBookRepository } from '../../../domain/persistence/ThumbnailBookRepository.js'
import { BookLifecycle } from '../../../domain/service/BookLifecycle.js'
import { SyncPointLifecycle } from '../../../domain/service/SyncPointLifecycle.js'
import { KomgaProperties } from '../../../infrastructure/configuration/KomgaProperties.js'
import { ImageConverter } from '../../../infrastructure/image/ImageConverter.js'
import { ImageType } from '../../../infrastructure/image/ImageType.js'
import { KepubConverter } from '../../../infrastructure/kobo/KepubConverter.js'
import { KoboHeaders } from '../../../infrastructure/kobo/KoboHeaders.js'
import { KoboProxy } from '../../../infrastructure/kobo/KoboProxy.js'
import { KomgaSyncTokenGenerator } from '../../../infrastructure/kobo/KomgaSyncTokenGenerator.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { getCurrentRequest, getMediaTypeOrDefault } from '../../../infrastructure/web/Utils.js'
import { toUTCZoned } from '../../../language/LanguageUtils.js'
import { FileNotFoundException } from '../../../port/java-io.js'
import { JsonTypes, ObjectMapper } from '../../../port/jackson-mapper.js'
import { JsonNumber, javaDoubleToString, type JsonNode } from '../../../port/jackson-tree.js'
import { IllegalArgumentException, associateBy, buildList, equalsIgnoreCase, groupBy, kFloat, last, mapNotNull, nn } from '../../../port/kotlin.js'
import { deleteIfExists, exists, nameWithoutExtension } from '../../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../../port/logging.js'
import { RandomStringUtils } from '../../../port/commons-lang.js'
import { FileSystemResource } from '../../../port/spring-core-io.js'
import { Page, Pageable } from '../../../port/spring-data.js'
import {
  HttpStatus,
  MediaType,
  ResponseEntity,
  ResponseStatusException,
  type StreamingResponseBody,
  authenticationPrincipal,
  contentDisposition,
  pathVariable,
  requestBody,
  requestHeader,
  requestParam,
  restController,
  streamingResponseBody,
} from '../../../port/spring-web.js'
import { ServletUriComponentsBuilder, type UriComponentsBuilder, UriComponentsBuilder as UriComponentsBuilderClass } from '../../../port/spring-web-uri.js'
import { CommonBookController } from '../CommonBookController.js'
import { ContentRestrictionChecker } from '../ContentRestrictionChecker.js'
import { AuthDto } from './dto/AuthDto.js'
import { BookEntitlementContainerDto } from './dto/BookEntitlementContainerDto.js'
import { BookmarkDto } from './dto/BookmarkDto.js'
import { toBookEntitlementDto } from './dto/BookEntitlementDto.js'
import { DownloadUrlDto } from './dto/DownloadUrlDto.js'
import { FormatDto } from './dto/FormatDto.js'
import { KoboBookMetadataDto } from './dto/KoboBookMetadataDto.js'
import { ReadingStateDto, WrappedReadingStateDto, toDto } from './dto/ReadingStateDto.js'
import { ReadingStateStateUpdateDto } from './dto/ReadingStateStateUpdateDto.js'
import { ReadingStateUpdateResultDto, RequestResultDto } from './dto/ReadingStateUpdateResultDto.js'
import { ResourcesDto } from './dto/ResourcesDto.js'
import { ResultDto } from './dto/ResultDto.js'
import { StatisticsDto } from './dto/StatisticsDto.js'
import { StatusDto } from './dto/StatusDto.js'
import { StatusInfoDto } from './dto/StatusInfoDto.js'
import {
  ChangedEntitlementDto,
  ChangedProductMetadataDto,
  ChangedReadingStateDto,
  ChangedTagDto,
  DeletedTagDto,
  NewEntitlementDto,
  NewTagDto,
  type SyncResultDto,
} from './dto/SyncResultDto.js'
import { TagItemDto } from './dto/TagItemDto.js'
import { toWrappedTagDto } from './dto/TagDto.js'
import { TestsDto } from './dto/TestsDto.js'
import { KoboDtoRepository } from './persistence/KoboDtoRepository.js'

const { X_KOBO_DEVICEID, X_KOBO_SYNC, X_KOBO_SYNCTOKEN } = KoboHeaders

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.api.kobo.KoboController')

/**
 * The following documentation is coming from the awesome work from [Calibre-web](https://github.com/gotson/calibre-web/blob/14b578dd3a15bd371102d5b9828da830e59b4557/cps/kobo_auth.py).
 *
 * **Log-in**
 *
 * When first booting a Kobo device the user must sign into a Kobo (or affiliate) account.
 * Upon successful sign-in, the user is redirected to
 *     https://auth.kobobooks.com/CrossDomainSignIn?id=<some id>
 * which serves the following response:
 *
 * ```html
 *     <script type='text/javascript'>
 *         location.href='kobo://UserAuthenticated?userId=<redacted>&userKey<redacted>&email=<redacted>&returnUrl=https%3a%2f%2fwww.kobo.com';
 *     </script>
 * ```
 *
 * And triggers the insertion of a userKey into the device's User table.
 *
 * Together, the device's DeviceId and UserKey act as an *irrevocable* authentication
 * token to most (if not all) Kobo APIs. In fact, in most cases only the UserKey is
 * required to authorize the API call.
 *
 * Changing Kobo password *does not* invalidate user keys! This is apparently a known
 * issue for a few years now https://www.mobileread.com/forums/showpost.php?p=3476851&postcount=13
 * (although this poster hypothesised that Kobo could blacklist a DeviceId, many endpoints
 * will still grant access given the userkey.)
 *
 * **Official Kobo Store Api authorization**
 *
 * * For most of the endpoints we care about (sync, metadata, tags, etc), the userKey is
 * passed in the x-kobo-userkey header, and is sufficient to authorize the API call.
 * * Some endpoints (e.g: AnnotationService) instead make use of Bearer tokens pass through
 * an authorization header. To get a BearerToken, the device makes a POST request to the
 * /v1/auth/device endpoint with the secret UserKey and the device's DeviceId.
 * * The book download endpoint passes an auth token as a URL param instead of a header.
 *
 * **Komga implementation**
 *
 * To authenticate the user, an API key is added to the Komga URL when setting up the api_store
 * setting on the device.
 * Thus, every request from the device to the api_store will hit Komga with the
 * API key in the url (e.g: https://mylibrary.com/kobo/<api_key>/v1/library/sync).
 *
 * In addition, once authenticated a session cookie is set on response, which will
 * be sent back for the duration of the session to authorize subsequent API calls
 * and avoid having to lookup the API key in database.
 */
export class KoboController {
  // PORT: Caffeine.newBuilder().expireAfterAccess(5, TimeUnit.MINUTES).removalListener -> lru-cache sans limite de taille,
  // ttl de 5 minutes réarmé à chaque lecture, `dispose` appelé à l'expiration, au remplacement et à la suppression
  private readonly cachedKepub = new LRUCache<string, string>({
    ttl: 5 * 60 * 1000,
    updateAgeOnGet: true,
    ttlAutopurge: true,
    dispose: (value) => {
      if (deleteIfExists(value) === true) logger.debug(() => `Deleted cached kepub: ${value}`)
    },
  })

  constructor(
    private readonly koboProxy: KoboProxy,
    private readonly kepubConverter: KepubConverter,
    private readonly syncPointLifecycle: SyncPointLifecycle,
    private readonly syncPointRepository: SyncPointRepository,
    private readonly komgaSyncTokenGenerator: KomgaSyncTokenGenerator,
    private readonly komgaProperties: KomgaProperties,
    private readonly koboDtoRepository: KoboDtoRepository,
    private readonly mapper: ObjectMapper,
    private readonly commonBookController: CommonBookController,
    private readonly bookLifecycle: BookLifecycle,
    private readonly bookRepository: BookRepository,
    private readonly thumbnailBookRepository: ThumbnailBookRepository,
    private readonly readProgressRepository: ReadProgressRepository,
    private readonly imageConverter: ImageConverter,
    private readonly mediaRepository: MediaRepository,
    private readonly contentRestrictionChecker: ContentRestrictionChecker,
    private readonly objectMapper: ObjectMapper,
  ) {}

  ping(): string {
    return 'pong'
  }

  // PORT: async (KoboProxy.proxyCurrentRequest fait un appel HTTP)
  async initialization(authToken: string): Promise<ResponseEntity<ResourcesDto>> {
    let resources: JsonNode
    try {
      resources = nodeGet((await this.koboProxy.proxyCurrentRequest()).body, 'Resources') ?? this.koboProxy.nativeKoboResources
    } catch (e) {
      if (e instanceof ResponseStatusException && e.status === HttpStatus.UNAUTHORIZED) throw e
      logger.warn(() => 'Failed to get response from Kobo /v1/initialization, fallback to noproxy')
      resources = this.koboProxy.nativeKoboResources
    }

    {
      // PORT: with(resources as ObjectNode) { put(..) }
      const self = resources as Map<string, JsonNode>
      self.set('image_host', ServletUriComponentsBuilder.fromCurrentContextPath().toUriString())
      self.set(
        'image_url_template',
        ServletUriComponentsBuilder.fromCurrentContextPath()
          .pathSegment('kobo', authToken, 'v1', 'books', '{ImageId}', 'thumbnail', '{Width}', '{Height}', 'false', 'image.jpg')
          .build()
          .toUriString(),
      )
      self.set(
        'image_url_quality_template',
        ServletUriComponentsBuilder.fromCurrentContextPath()
          .pathSegment('kobo', authToken, 'v1', 'books', '{ImageId}', 'thumbnail', '{Width}', '{Height}', '{Quality}', '{IsGreyscale}', 'image.jpg')
          .build()
          .toUriString(),
      )
    }

    return ResponseEntity.ok().header('x-kobo-apitoken', 'e30=').body(new ResourcesDto({ resources: resources }))
  }

  /**
   * @return an [AuthDto]
   */
  // PORT: async (KoboProxy.proxyCurrentRequest fait un appel HTTP)
  async authDevice(rawBody: Uint8Array): Promise<unknown> {
    try {
      return await this.koboProxy.proxyCurrentRequest({ body: rawBody })
    } catch {
      logger.warn(() => 'Failed to get response from Kobo /v1/auth/device, fallback to noproxy')
    }

    const body = this.objectMapper.readTree(rawBody)

    /*
     * Komga does not use the /v1/auth/device API call for authentication/authorization.
     * Return dummy data to keep the device happy.
     */
    const userKey = nodeGet(body, 'UserKey')
    return new AuthDto({
      accessToken: RandomStringUtils.secure().nextAlphanumeric(24),
      refreshToken: RandomStringUtils.secure().nextAlphanumeric(24),
      trackingId: crypto.randomUUID(),
      userKey: userKey !== undefined ? asText(userKey) : '',
    })
  }

  //  @RequestMapping(value = ["/v1/analytics/gettests"], method = [RequestMethod.GET, RequestMethod.POST])
  // @RequestHeader(name = X_KOBO_USERKEY, required = false)
  analyticsGetTests(userKey: string | null): TestsDto {
    return new TestsDto({
      result: 'Success',
      testKey: userKey ?? '',
    })
  }

  /**
   * @return an array of [SyncResultDto]
   */
  // PORT: async (KoboProxy.proxyCurrentRequest fait un appel HTTP)
  async syncLibrary(principal: KomgaPrincipal, authToken: string): Promise<ResponseEntity<unknown[]>> {
    const syncTokenReceived = this.komgaSyncTokenGenerator.fromRequestHeaders(getCurrentRequest()) ?? new KomgaSyncToken()

    // find the ongoing sync point, else create one
    const toSyncPoint =
      this.getSyncPointVerified(syncTokenReceived.ongoingSyncPointId, principal.user.id) ??
      this.syncPointLifecycle.createSyncPoint(principal.user, principal.apiKey?.id ?? null, null) // for now we sync all libraries

    // find the last successful sync, if any
    const fromSyncPoint = this.getSyncPointVerified(syncTokenReceived.lastSuccessfulSyncPointId, principal.user.id)

    logger.debug(() => `Library sync from SyncPoint ${fromSyncPoint}, to SyncPoint: ${toSyncPoint}`)

    let shouldContinueSync: boolean
    const downloadUriBuilder = this.getDownloadUrlBuilder(authToken)
    let syncResultKomga: SyncResultDto[]
    if (fromSyncPoint !== null) {
      // find books added/changed/removed and map to DTO
      let maxRemainingCount = this.komgaProperties.kobo.syncItemLimit

      const booksAdded = this.syncPointLifecycle.takeBooksAdded(fromSyncPoint.id, toSyncPoint.id, Pageable.ofSize(maxRemainingCount))
      maxRemainingCount -= booksAdded.numberOfElements
      shouldContinueSync = booksAdded.hasNext()

      let booksChanged: Page<SyncPoint.Book>
      if (booksAdded.isLast && maxRemainingCount > 0) {
        booksChanged = this.syncPointLifecycle.takeBooksChanged(fromSyncPoint.id, toSyncPoint.id, Pageable.ofSize(maxRemainingCount))
        maxRemainingCount -= booksChanged.numberOfElements
        shouldContinueSync = shouldContinueSync || booksChanged.hasNext()
      } else booksChanged = Page.empty()

      let booksRemoved: Page<SyncPoint.Book>
      if (booksChanged.isLast && maxRemainingCount > 0) {
        booksRemoved = this.syncPointLifecycle.takeBooksRemoved(fromSyncPoint.id, toSyncPoint.id, Pageable.ofSize(maxRemainingCount))
        maxRemainingCount -= booksRemoved.numberOfElements
        shouldContinueSync = shouldContinueSync || booksRemoved.hasNext()
      } else booksRemoved = Page.empty()

      let changedReadingState: Page<SyncPoint.Book>
      if (booksRemoved.isLast && maxRemainingCount > 0) {
        changedReadingState = this.syncPointLifecycle.takeBooksReadProgressChanged(fromSyncPoint.id, toSyncPoint.id, Pageable.ofSize(maxRemainingCount))
        maxRemainingCount -= changedReadingState.numberOfElements
        shouldContinueSync = shouldContinueSync || changedReadingState.hasNext()
      } else changedReadingState = Page.empty()

      let readListsAdded: Page<SyncPoint.ReadList>
      if (changedReadingState.isLast && maxRemainingCount > 0) {
        readListsAdded = this.syncPointLifecycle.takeReadListsAdded(fromSyncPoint.id, toSyncPoint.id, Pageable.ofSize(maxRemainingCount))
        maxRemainingCount -= readListsAdded.numberOfElements
        shouldContinueSync = shouldContinueSync || readListsAdded.hasNext()
      } else readListsAdded = Page.empty()

      let readListsChanged: Page<SyncPoint.ReadList>
      if (readListsAdded.isLast && maxRemainingCount > 0) {
        readListsChanged = this.syncPointLifecycle.takeReadListsChanged(fromSyncPoint.id, toSyncPoint.id, Pageable.ofSize(maxRemainingCount))
        maxRemainingCount -= readListsChanged.numberOfElements
        shouldContinueSync = shouldContinueSync || readListsChanged.hasNext()
      } else readListsChanged = Page.empty()

      let readListsRemoved: Page<SyncPoint.ReadList>
      if (readListsChanged.isLast && maxRemainingCount > 0) {
        readListsRemoved = this.syncPointLifecycle.takeReadListsRemoved(fromSyncPoint.id, toSyncPoint.id, Pageable.ofSize(maxRemainingCount))
        maxRemainingCount -= readListsRemoved.numberOfElements
        shouldContinueSync = shouldContinueSync || readListsRemoved.hasNext()
      } else readListsRemoved = Page.empty()

      logger.debug(
        () =>
          `Library sync: ${booksAdded.numberOfElements} books added, ${booksChanged.numberOfElements} books changed, ${booksRemoved.numberOfElements} books removed, ${changedReadingState.numberOfElements} books with changed reading state, ${readListsAdded} readlists added, ${readListsChanged} readlists changed, ${readListsRemoved} removed`,
      )

      const metadata = mapValues(
        associateBy(this.koboDtoRepository.findBookMetadataByIds([...booksAdded.content, ...booksChanged.content].map((it) => it.bookId)), (it) => it.entitlementId),
        (it) => this.withDownloadUrls(it, downloadUriBuilder),
      )
      const readProgress = associateBy(
        this.readProgressRepository.findAllByBookIdsAndUserId(
          [...booksAdded.content, ...booksChanged.content, ...changedReadingState.content].map((it) => it.bookId),
          principal.user.id,
        ),
        (it) => it.bookId,
      )
      const readListsBooks = groupBy(
        this.syncPointRepository.findBookIdsByReadListIds(
          toSyncPoint.id,
          [...readListsAdded.content, ...readListsChanged.content].map((it) => it.readListId),
        ),
        (it) => it.readListId,
      )

      syncResultKomga = buildList<SyncResultDto>((list) => {
        list.push(
          ...booksAdded.content.map(
            (it) =>
              new NewEntitlementDto({
                newEntitlement: new BookEntitlementContainerDto({
                  bookEntitlement: toBookEntitlementDto(it, false),
                  bookMetadata: nn(metadata.get(it.bookId)),
                  readingState: mapOrNull(readProgress.get(it.bookId), toDto) ?? this.getEmptyReadProgressForBook(it.bookId, it.createdDate),
                }),
              }),
          ),
        )
        list.push(
          ...booksChanged.content.map(
            (it) =>
              new NewEntitlementDto({
                newEntitlement: new BookEntitlementContainerDto({
                  bookEntitlement: toBookEntitlementDto(it, false),
                  bookMetadata: nn(metadata.get(it.bookId)),
                  readingState: mapOrNull(readProgress.get(it.bookId), toDto) ?? this.getEmptyReadProgressForBook(it.bookId, it.createdDate),
                }),
              }),
          ),
        )
        list.push(...booksChanged.content.map((it) => new ChangedProductMetadataDto({ changedProductMetadata: nn(metadata.get(it.bookId)) })))
        list.push(
          ...booksRemoved.content.map(
            (it) =>
              new ChangedEntitlementDto({
                changedEntitlement: new BookEntitlementContainerDto({
                  bookEntitlement: toBookEntitlementDto(it, true),
                  bookMetadata: this.getMetadataForRemovedBook(it.bookId),
                }),
              }),
          ),
        )
        list.push(
          // changed books are also passed as changed reading state because Kobo does not process ChangedEntitlement even if it contains a ReadingState
          ...mapNotNull([...booksChanged.content, ...changedReadingState.content], (book) =>
            mapOrNull(
              readProgress.get(book.bookId),
              (it) =>
                new ChangedReadingStateDto({
                  changedReadingState: new WrappedReadingStateDto({
                    readingState: toDto(it),
                  }),
                }),
            ),
          ),
        )
        list.push(
          ...readListsAdded.content.map(
            (it) => new NewTagDto({ newTag: toWrappedTagDto(it, { items: readListsBooks.get(it.readListId)?.map((b) => new TagItemDto({ revisionId: b.bookId })) ?? null }) }),
          ),
        )
        list.push(
          ...readListsChanged.content.map(
            (it) => new ChangedTagDto({ changedTag: toWrappedTagDto(it, { items: readListsBooks.get(it.readListId)?.map((b) => new TagItemDto({ revisionId: b.bookId })) ?? null }) }),
          ),
        )
        list.push(...readListsRemoved.content.map((it) => new DeletedTagDto({ deletedTag: toWrappedTagDto(it) })))
      })
    } else {
      // no starting point, sync everything
      let maxRemainingCount = this.komgaProperties.kobo.syncItemLimit

      const books = this.syncPointLifecycle.takeBooks(toSyncPoint.id, Pageable.ofSize(maxRemainingCount))
      maxRemainingCount -= books.numberOfElements
      shouldContinueSync = books.hasNext()

      let readLists: Page<SyncPoint.ReadList>
      if (books.isLast && maxRemainingCount > 0) {
        readLists = this.syncPointLifecycle.takeReadLists(toSyncPoint.id, Pageable.ofSize(maxRemainingCount))
        maxRemainingCount -= readLists.numberOfElements
        shouldContinueSync = shouldContinueSync || readLists.hasNext()
      } else readLists = Page.empty()

      logger.debug(() => `Library sync: ${books.numberOfElements} books, ${readLists.numberOfElements} readlists`)

      const metadata = mapValues(
        associateBy(this.koboDtoRepository.findBookMetadataByIds(books.content.map((it) => it.bookId)), (it) => it.entitlementId),
        (it) => this.withDownloadUrls(it, downloadUriBuilder),
      )
      const readProgress = associateBy(
        this.readProgressRepository.findAllByBookIdsAndUserId(
          books.content.map((it) => it.bookId),
          principal.user.id,
        ),
        (it) => it.bookId,
      )
      const readListsBooks = groupBy(
        this.syncPointRepository.findBookIdsByReadListIds(
          toSyncPoint.id,
          readLists.content.map((it) => it.readListId),
        ),
        (it) => it.readListId,
      )

      syncResultKomga = buildList<SyncResultDto>((list) => {
        list.push(
          ...books.content.map(
            (it) =>
              new NewEntitlementDto({
                newEntitlement: new BookEntitlementContainerDto({
                  bookEntitlement: toBookEntitlementDto(it, false),
                  bookMetadata: nn(metadata.get(it.bookId)),
                  readingState: mapOrNull(readProgress.get(it.bookId), toDto) ?? this.getEmptyReadProgressForBook(it.bookId, it.createdDate),
                }),
              }),
          ),
        )
        list.push(
          ...readLists.content.map(
            (it) => new NewTagDto({ newTag: toWrappedTagDto(it, { items: readListsBooks.get(it.readListId)?.map((b) => new TagItemDto({ revisionId: b.bookId })) ?? null }) }),
          ),
        )
      })
    }

    // merge Kobo store sync response, we only trigger this once all Komga updates have been processed (shouldContinueSync == false)
    let syncResultMerged: unknown[]
    let syncTokenMerged: KomgaSyncToken
    let shouldContinueSyncMerged: boolean
    if (!shouldContinueSync && this.koboProxy.isEnabled()) {
      try {
        const koboStoreResponse = await this.koboProxy.proxyCurrentRequest({ includeSyncToken: true })
        const syncResultsKobo = koboStoreResponse.body !== null ? this.mapper.treeToValue<unknown[]>(koboStoreResponse.body, { list: 'Any' }) : []
        const rawSyncTokenKobo = koboStoreResponse.headers.getFirst(X_KOBO_SYNCTOKEN)
        const syncTokenKobo = rawSyncTokenKobo !== null ? this.komgaSyncTokenGenerator.fromBase64(rawSyncTokenKobo) : null
        const shouldContinueSyncKobo = koboStoreResponse.headers.getFirst(X_KOBO_SYNC)?.toLowerCase() === 'continue'

        ;[syncResultMerged, syncTokenMerged, shouldContinueSyncMerged] = [[...syncResultKomga, ...syncResultsKobo], syncTokenKobo ?? syncTokenReceived, shouldContinueSyncKobo]
      } catch (e) {
        logger.error(e as Error, () => 'Kobo sync endpoint failure')
        ;[syncResultMerged, syncTokenMerged, shouldContinueSyncMerged] = [syncResultKomga, syncTokenReceived, false]
      }
    } else {
      ;[syncResultMerged, syncTokenMerged, shouldContinueSyncMerged] = [syncResultKomga, syncTokenReceived, shouldContinueSync]
    }

    // update synctoken to send back to Kobo device
    let syncTokenUpdated: KomgaSyncToken
    if (shouldContinueSyncMerged) {
      syncTokenUpdated = syncTokenMerged.copy({ ongoingSyncPointId: toSyncPoint.id })
    } else {
      // cleanup old syncpoint if it exists
      if (fromSyncPoint !== null) this.syncPointRepository.deleteOne(fromSyncPoint.id)

      syncTokenUpdated = syncTokenMerged.copy({ ongoingSyncPointId: null, lastSuccessfulSyncPointId: toSyncPoint.id })
    }

    return ResponseEntity.ok()
      .headersFrom((it) => {
        if (shouldContinueSyncMerged) it.set(X_KOBO_SYNC, 'continue')
        it.set(X_KOBO_SYNCTOKEN, this.komgaSyncTokenGenerator.toBase64(syncTokenUpdated))
      })
      .body(syncResultMerged)
  }

  /**
   * @return an array of [KoboBookMetadataDto]
   */
  // PORT: async (KoboProxy.proxyCurrentRequest fait un appel HTTP)
  async getBookMetadata(principal: KomgaPrincipal, authToken: string, bookId: string): Promise<ResponseEntity<unknown>> {
    if (!this.bookRepository.existsById(bookId) && this.koboProxy.isEnabled()) {
      return this.koboProxy.proxyCurrentRequest()
    } else {
      this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookId)

      return ResponseEntity.ok(this.koboDtoRepository.findBookMetadataByIds([bookId]).map((it) => this.withDownloadUrls(it, this.getDownloadUrlBuilder(authToken))))
    }
  }

  /**
   * @return an array of [ReadingStateDto]
   */
  // PORT: async (KoboProxy.proxyCurrentRequest fait un appel HTTP)
  async getState(principal: KomgaPrincipal, bookId: string): Promise<ResponseEntity<unknown>> {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) {
      if (this.koboProxy.isEnabled()) return this.koboProxy.proxyCurrentRequest()
      else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }

    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    const response = mapOrNull(this.readProgressRepository.findByBookIdAndUserIdOrNull(bookId, principal.user.id), toDto) ?? this.getEmptyReadProgressForBook(book)
    return ResponseEntity.ok([response])
  }

  /**
   * @return a [RequestResultDto]
   */
  // PORT: async (KoboProxy.proxyCurrentRequest fait un appel HTTP)
  async updateState(principal: KomgaPrincipal, bookId: string, rawBody: Uint8Array, koboDeviceId: string = 'unknown'): Promise<ResponseEntity<unknown>> {
    void koboDeviceId
    const body = this.objectMapper.readValue<ReadingStateStateUpdateDto>(rawBody, { class: ReadingStateStateUpdateDto })

    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) {
      if (this.koboProxy.isEnabled()) return this.koboProxy.proxyCurrentRequest({ body: rawBody })
      else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }

    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    const koboUpdate = body.readingStates[0] ?? (() => { throw new ResponseStatusException(HttpStatus.BAD_REQUEST) })()
    if (koboUpdate.currentBookmark.location === null || koboUpdate.currentBookmark.contentSourceProgressPercent === null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
    const location = koboUpdate.currentBookmark.location
    const contentSourceProgressPercent = koboUpdate.currentBookmark.contentSourceProgressPercent

    // convert the Kobo update request to an R2Progression
    const r2Progression = new R2Progression({
      modified: koboUpdate.lastModified,
      device: new R2Device({
        id: principal.apiKey?.id ?? 'unknown',
        name: principal.apiKey?.comment ?? 'unknown',
      }),
      locator: (() => {
        if (koboUpdate.statusInfo.status === StatusDto.FINISHED) {
          // If the book is finished, Kobo sends the first resource instead of the last, so we can't trust what Kobo sent
          const ext = this.mediaRepository.findExtensionByIdOrNull(book.id)
          const epubExtension =
            ext instanceof MediaExtensionEpub
              ? ext
              : (() => {
                  const e = new IllegalArgumentException('Epub extension not found')
                  logger.error(() => `Epub extension not found for book ${book.id}. Book should be re-analyzed.`)
                  throw e
                })()
          return last(epubExtension.positions)
        } else {
          return new R2Locator({
            href: location.source,
            // assume default, will be overwritten by the correct type when saved
            type: 'application/xhtml+xml',
            koboSpan: equalsIgnoreCase(location.type, 'kobospan') ? location.value : null,
            locations: new R2Locator.Location({
              // PORT: Float / Int -> arrondi float32
              progression: kFloat(contentSourceProgressPercent / 100),
              totalProgression: koboUpdate.currentBookmark.progressPercent !== null ? kFloat(koboUpdate.currentBookmark.progressPercent / 100) : null,
            }),
          })
        }
      })(),
    })

    let response: RequestResultDto
    try {
      this.bookLifecycle.markProgression(book, principal.user, r2Progression)

      response = new RequestResultDto({
        requestResult: ResultDto.SUCCESS,
        updateResults: [
          new ReadingStateUpdateResultDto({
            entitlementId: bookId,
            currentBookmarkResult: ResultDto.SUCCESS.wrapped(),
            statisticsResult: ResultDto.IGNORED.wrapped(),
            statusInfoResult: ResultDto.SUCCESS.wrapped(),
          }),
        ],
      })
    } catch (e) {
      logger.error(e as Error, () => 'Could not update progression')
      response = new RequestResultDto({
        requestResult: ResultDto.FAILURE,
        updateResults: [
          new ReadingStateUpdateResultDto({
            entitlementId: bookId,
            currentBookmarkResult: ResultDto.FAILURE.wrapped(),
            statisticsResult: ResultDto.FAILURE.wrapped(),
            statusInfoResult: ResultDto.FAILURE.wrapped(),
          }),
        ],
      })
    }

    return ResponseEntity.ok(response)
  }

  // PORT: async (conversion kepubify et CommonBookController)
  async getBookFile(principal: KomgaPrincipal, bookId: string, convertToKepub: boolean = false): Promise<ResponseEntity<StreamingResponseBody>> {
    if (convertToKepub) {
      const book = this.bookRepository.findByIdOrNull(bookId)
      if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)

      this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

      // check cache
      const cacheKey = this.computeCacheKey(book)
      const cached = this.cachedKepub.get(cacheKey) ?? null
      let kepubPath = cached !== null ? (exists(cached) ? cached : null) : null

      if (kepubPath === null) {
        // convert
        const converted =
          (await this.kepubConverter.convertEpubToKepub(new BookWithMedia({ book: book, media: this.mediaRepository.findById(bookId) }))) ??
          (() => {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, 'Kepub conversion failed')
          })()
        // PORT: File.deleteOnExit() -> suppression à la sortie du processus
        process.once('exit', () => rmSync(converted, { force: true }))
        this.cachedKepub.set(cacheKey, converted)
        kepubPath = converted
      } else {
        logger.debug(() => 'Found kepub in cache')
      }

      try {
        const self = new FileSystemResource(kepubPath)
        if (!self.exists()) throw new FileNotFoundException(self.path)
        const stream = streamingResponseBody(async (os) => {
          // PORT: IOUtils.copyLarge(it, os, ByteArray(8192)) + os.close() -> pipeline (ferme le flux de sortie)
          await pipeline(self.getInputStream(), os)
        })
        return ResponseEntity.ok()
          .headersFrom((it) => it.setContentDisposition(contentDisposition('attachment', `${nameWithoutExtension(book.path)}.kepub.epub`, true)))
          .contentType(getMediaTypeOrDefault(KomgaMediaType.EPUB.type))
          .contentLength(self.contentLength())
          .body(stream)
      } catch (ex) {
        if (!(ex instanceof FileNotFoundException)) throw ex
        logger.warn(ex, () => `File not found: ${kepubPath}`)
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'File not found, it may have moved')
      }
    } else {
      return this.commonBookController.getBookFileInternal(principal, bookId)
    }
  }

  private computeCacheKey(self: Book): string {
    return `${self.id}-${self.fileLastModified}`
  }

  // PORT: async (ImageConverter.convertImage)
  async getBookCover(
    principal: KomgaPrincipal,
    thumbnailId: string,
    width: string | null,
    height: string | null,
    quality: string | null,
    isGreyScale: string | null,
  ): Promise<ResponseEntity<unknown>> {
    void quality
    void isGreyScale
    if (!this.thumbnailBookRepository.existsById(thumbnailId) && this.koboProxy.isEnabled()) {
      return ResponseEntity.status(HttpStatus.TEMPORARY_REDIRECT)
        .location(UriComponentsBuilderClass.fromUriString(this.koboProxy.imageHostUrl).buildAndExpand(thumbnailId, width, height).toUri())
        .build()
    } else {
      this.contentRestrictionChecker.checkContentRestrictionBookThumbnail(principal.user, thumbnailId)

      const poster = this.bookLifecycle.getThumbnailBytesByThumbnailId(thumbnailId) ?? (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()
      const posterBytes = poster.mediaType !== ImageType.JPEG.mediaType ? await this.imageConverter.convertImage(poster.bytes, ImageType.JPEG.imageIOFormat) : poster.bytes
      return ResponseEntity.ok(posterBytes)
    }
  }

  // PORT: async (KoboProxy.proxyCurrentRequest fait un appel HTTP)
  async catchAll(body: Uint8Array | null): Promise<ResponseEntity<JsonNode>> {
    if (this.koboProxy.isEnabled()) return this.koboProxy.proxyCurrentRequest({ body: body })
    else return ResponseEntity.ok().body(this.mapper.createObjectNode())
  }

  // PORT: UriBuilder -> UriComponentsBuilder
  private getDownloadUrlBuilder(token: string): UriComponentsBuilder {
    return ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment('kobo', token, 'v1', 'books', '{bookId}', 'file', 'epub').query('convert_kepub={convert}')
  }

  private withDownloadUrls(self: KoboBookMetadataDto, downloadUriBuilder: UriComponentsBuilder): KoboBookMetadataDto {
    return self.copy({
      downloadUrls: buildList<DownloadUrlDto>((list) => {
        let format: FormatDto
        let convert: boolean
        // for fixed layout we always send EPUB3FL, so the Kobo can display in full screen
        // no conversion to Kepub is necessary, as there is already 1 chapter per page, which is sufficient for progress tracking
        if (self.isPrePaginated) [format, convert] = [FormatDto.EPUB3FL, false]
        // provide Kepub if available, or convert if possible
        else if (self.isKepub || this.kepubConverter.isAvailable) [format, convert] = [FormatDto.KEPUB, !self.isKepub]
        else [format, convert] = [FormatDto.EPUB3, false]
        list.push(
          new DownloadUrlDto({
            format: format,
            size: format === FormatDto.KEPUB ? (self.extraFileSizes.get(KEPUB_DEFAULT) ?? self.fileSize) : self.fileSize,
            // PORT: UriBuilder.build(vararg).toURL().toString() -> buildAndExpand(..).toUri()
            url: downloadUriBuilder.buildAndExpand(self.entitlementId, convert).toUri(),
          }),
        )
      }),
    })
  }

  /**
   * Retrieve a SyncPoint by ID, and verifies it belongs to the same userId
   */
  private getSyncPointVerified(syncPointId: string | null, userId: string): SyncPoint | null {
    if (syncPointId !== null) {
      const syncPoint = this.syncPointRepository.findByIdOrNull(syncPointId)
      // verify that the SyncPoint is owned by the user
      if (syncPoint?.userId === userId) return syncPoint
    }
    return null
  }

  private getMetadataForRemovedBook(bookId: string): KoboBookMetadataDto {
    return new KoboBookMetadataDto({
      coverImageId: bookId,
      crossRevisionId: bookId,
      entitlementId: bookId,
      revisionId: bookId,
      workId: bookId,
      title: bookId,
      isKepub: false,
      isPrePaginated: false,
      fileSize: 0,
    })
  }

  // PORT: surcharges getEmptyReadProgressForBook(book) / getEmptyReadProgressForBook(bookId, createdDate) fusionnées
  private getEmptyReadProgressForBook(bookOrBookId: Book | string, createdDateArg?: ZonedDateTime): ReadingStateDto {
    if (typeof bookOrBookId !== 'string') {
      const book = bookOrBookId
      const createdDateUTC = toUTCZoned(book.createdDate)
      return new ReadingStateDto({
        created: createdDateUTC,
        lastModified: createdDateUTC,
        priorityTimestamp: createdDateUTC,
        entitlementId: book.id,
        currentBookmark: new BookmarkDto({ lastModified: createdDateUTC }),
        statistics: new StatisticsDto({ lastModified: createdDateUTC }),
        statusInfo: new StatusInfoDto({
          lastModified: createdDateUTC,
          status: StatusDto.READY_TO_READ,
          timesStartedReading: 0,
        }),
      })
    }
    const bookId = bookOrBookId
    const createdDate = createdDateArg as ZonedDateTime
    return new ReadingStateDto({
      created: createdDate,
      lastModified: createdDate,
      priorityTimestamp: createdDate,
      entitlementId: bookId,
      currentBookmark: new BookmarkDto({ lastModified: createdDate }),
      statistics: new StatisticsDto({ lastModified: createdDate }),
      statusInfo: new StatusInfoDto({
        lastModified: createdDate,
        status: StatusDto.READY_TO_READ,
        timesStartedReading: 0,
      }),
    })
  }
}

// PORT: x?.let(f)
function mapOrNull<T, R>(v: T | null | undefined, f: (t: T) => R): R | null {
  return v !== null && v !== undefined ? f(v) : null
}

// PORT: Map.mapValues
function mapValues<K, V, R>(m: Map<K, V>, f: (v: V) => R): Map<K, R> {
  return new Map([...m].map(([k, v]) => [k, f(v)]))
}

// PORT: JsonNode.get(fieldName) : undefined si le nœud n'est pas un objet ou n'a pas le champ
function nodeGet(node: JsonNode | null | undefined, field: string): JsonNode | undefined {
  return node instanceof Map ? node.get(field) : undefined
}

// PORT: JsonNode.asText()
function asText(node: JsonNode): string {
  if (node === null) return 'null'
  if (typeof node === 'string') return node
  if (typeof node === 'boolean') return String(node)
  if (node instanceof JsonNumber) return node.kind === 'double' ? javaDoubleToString(Number(node.value)) : String(node.value)
  return ''
}

// @RestController
restController(KoboController, {
  inject: [
    KoboProxy,
    KepubConverter,
    SyncPointLifecycle,
    SyncPointRepository,
    KomgaSyncTokenGenerator,
    KomgaProperties,
    KoboDtoRepository,
    ObjectMapper,
    CommonBookController,
    BookLifecycle,
    BookRepository,
    ThumbnailBookRepository,
    ReadProgressRepository,
    ImageConverter,
    MediaRepository,
    ContentRestrictionChecker,
    ObjectMapper,
  ],
  javaName: 'org.gotson.komga.interfaces.api.kobo.KoboController',
  requestMapping: { path: ['/kobo/{authToken}/'], produces: ['application/json; charset=utf-8'] },
  handlers: {
    ping: { mapping: { method: 'GET', path: ['ping'] } },
    initialization: { mapping: { method: 'GET', path: ['v1/initialization'] }, args: [pathVariable('authToken')] },
    authDevice: { mapping: { method: 'POST', path: ['v1/auth/device'] }, args: [requestBody(JsonTypes.ByteArray)] },
    syncLibrary: { mapping: { method: 'GET', path: ['v1/library/sync'] }, args: [authenticationPrincipal(), pathVariable('authToken')] },
    getBookMetadata: {
      mapping: { method: 'GET', path: ['/v1/library/{bookId}/metadata'] },
      args: [authenticationPrincipal(), pathVariable('authToken'), pathVariable('bookId')],
    },
    getState: { mapping: { method: 'GET', path: ['/v1/library/{bookId}/state'] }, args: [authenticationPrincipal(), pathVariable('bookId')] },
    updateState: {
      mapping: { method: 'PUT', path: ['/v1/library/{bookId}/state'] },
      args: [
        authenticationPrincipal(),
        pathVariable('bookId'),
        requestBody(JsonTypes.ByteArray),
        requestHeader(X_KOBO_DEVICEID, 'String', { required: false, hasDefault: true }),
      ],
    },
    getBookFile: {
      mapping: { method: 'GET', path: ['v1/books/{bookId}/file/epub'], produces: [MediaType.APPLICATION_OCTET_STREAM_VALUE] },
      preAuthorize: "hasRole('FILE_DOWNLOAD')",
      args: [authenticationPrincipal(), pathVariable('bookId'), requestParam('convert_kepub', 'Boolean', { required: false, hasDefault: true })],
    },
    getBookCover: {
      mapping: {
        method: 'GET',
        path: ['v1/books/{thumbnailId}/thumbnail/{width}/{height}/{isGreyScale}/image.jpg', 'v1/books/{thumbnailId}/thumbnail/{width}/{height}/{quality}/{isGreyScale}/image.jpg'],
        produces: [MediaType.IMAGE_JPEG_VALUE],
      },
      args: [
        authenticationPrincipal(),
        pathVariable('thumbnailId'),
        pathVariable('width', { nullable: 'String' }, { nullable: true }),
        pathVariable('height', { nullable: 'String' }, { nullable: true }),
        pathVariable('quality', { nullable: 'String' }, { nullable: true }),
        pathVariable('isGreyScale', { nullable: 'String' }, { nullable: true }),
      ],
    },
    catchAll: {
      mapping: { method: ['GET', 'PUT', 'POST', 'DELETE', 'PATCH'], path: ['{*path}'] },
      args: [{ ...requestBody({ nullable: JsonTypes.ByteArray }), nullable: true }],
    },
  },
})
