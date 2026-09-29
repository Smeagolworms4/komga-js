// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/SseController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { TasksRepository } from '../../application/tasks/TasksRepository.js'
import { DomainEvent } from '../../domain/model/DomainEvent.js'
import type { KomgaUser } from '../../domain/model/KomgaUser.js'
import { BookRepository } from '../../domain/persistence/BookRepository.js'
import type { KomgaPrincipal } from '../../infrastructure/security/KomgaPrincipal.js'
import { toFilePath } from '../../infrastructure/web/Utils.js'
import { IOException } from '../../port/java-io.js'
import { IllegalStateException } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { DEFAULT_PHASE } from '../../port/spring.js'
import { scheduled } from '../../port/spring-scheduling.js'
import { MediaType, authenticationPrincipal, restController } from '../../port/spring-web.js'
import { SseEmitter } from '../../port/spring-web-sse.js'
import { BookImportSseDto } from './dto/BookImportSseDto.js'
import { BookSseDto } from './dto/BookSseDto.js'
import { CollectionSseDto } from './dto/CollectionSseDto.js'
import { LibrarySseDto } from './dto/LibrarySseDto.js'
import { ReadListSseDto } from './dto/ReadListSseDto.js'
import { ReadProgressSeriesSseDto } from './dto/ReadProgressSeriesSseDto.js'
import { ReadProgressSseDto } from './dto/ReadProgressSseDto.js'
import { SeriesSseDto } from './dto/SeriesSseDto.js'
import { SessionExpiredDto } from './dto/SessionExpiredDto.js'
import { TaskQueueSseDto } from './dto/TaskQueueSseDto.js'
import { ThumbnailBookSseDto } from './dto/ThumbnailBookSseDto.js'
import { ThumbnailReadListSseDto } from './dto/ThumbnailReadListSseDto.js'
import { ThumbnailSeriesCollectionSseDto } from './dto/ThumbnailSeriesCollectionSseDto.js'
import { ThumbnailSeriesSseDto } from './dto/ThumbnailSeriesSseDto.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.sse.SseController')

export class SseController {
  private acceptingConnections = true
  // PORT: Collections.synchronizedMap(HashMap) -> Map (fil unique)
  private readonly emitters = new Map<SseEmitter, KomgaUser>()

  constructor(
    private readonly bookRepository: BookRepository,
    private readonly tasksRepository: TasksRepository,
  ) {}

  sse(principal: KomgaPrincipal): SseEmitter {
    if (!this.acceptingConnections) throw new IllegalStateException('Server is shutting down, not accepting new SSE connections')
    const emitter = new SseEmitter()
    emitter.onCompletion(() => this.emitters.delete(emitter))
    emitter.onTimeout(() => this.emitters.delete(emitter))
    emitter.onError(() => this.emitters.delete(emitter))
    this.emitters.set(emitter, principal.user)
    return emitter
  }

  heartbeat(): void {
    if (this.emitters.size > 0)
      this.emitters.forEach((_, emitter) => {
        try {
          emitter.send(SseEmitter.event().comment('heartbeat'))
        } catch (e) {
          if (!(e instanceof IOException)) throw e
        }
      })
  }

  taskCount(): void {
    if (this.emitters.size > 0) {
      const tasksCount = this.tasksRepository.countBySimpleType()
      this.emitSse('TaskQueueStatus', new TaskQueueSseDto({ count: [...tasksCount.values()].reduce((a, b) => a + b, 0), countByType: tasksCount }), { adminOnly: true })
    }
  }

  handleSseEvent(event: DomainEvent): void {
    if (event instanceof DomainEvent.LibraryAdded) this.emitSse('LibraryAdded', new LibrarySseDto({ libraryId: event.library.id }))
    else if (event instanceof DomainEvent.LibraryUpdated) this.emitSse('LibraryChanged', new LibrarySseDto({ libraryId: event.library.id }))
    else if (event instanceof DomainEvent.LibraryDeleted) this.emitSse('LibraryDeleted', new LibrarySseDto({ libraryId: event.library.id }))
    else if (event instanceof DomainEvent.LibraryScanned) {
      // Unit
    }

    else if (event instanceof DomainEvent.SeriesAdded) this.emitSse('SeriesAdded', new SeriesSseDto({ seriesId: event.series.id, libraryId: event.series.libraryId }))
    else if (event instanceof DomainEvent.SeriesUpdated) this.emitSse('SeriesChanged', new SeriesSseDto({ seriesId: event.series.id, libraryId: event.series.libraryId }))
    else if (event instanceof DomainEvent.SeriesDeleted) this.emitSse('SeriesDeleted', new SeriesSseDto({ seriesId: event.series.id, libraryId: event.series.libraryId }))

    else if (event instanceof DomainEvent.BookAdded) this.emitSse('BookAdded', new BookSseDto({ bookId: event.book.id, seriesId: event.book.seriesId, libraryId: event.book.libraryId }))
    else if (event instanceof DomainEvent.BookUpdated) this.emitSse('BookChanged', new BookSseDto({ bookId: event.book.id, seriesId: event.book.seriesId, libraryId: event.book.libraryId }))
    else if (event instanceof DomainEvent.BookDeleted) this.emitSse('BookDeleted', new BookSseDto({ bookId: event.book.id, seriesId: event.book.seriesId, libraryId: event.book.libraryId }))
    else if (event instanceof DomainEvent.BookImported) this.emitSse('BookImported', new BookImportSseDto({ bookId: event.book?.id ?? null, sourceFile: toFilePath(event.sourceFile), success: event.success, message: event.message }), { adminOnly: true })

    else if (event instanceof DomainEvent.ReadListAdded) this.emitSse('ReadListAdded', new ReadListSseDto({ readListId: event.readList.id, bookIds: [...event.readList.bookIds.values()] }))
    else if (event instanceof DomainEvent.ReadListUpdated) this.emitSse('ReadListChanged', new ReadListSseDto({ readListId: event.readList.id, bookIds: [...event.readList.bookIds.values()] }))
    else if (event instanceof DomainEvent.ReadListDeleted) this.emitSse('ReadListDeleted', new ReadListSseDto({ readListId: event.readList.id, bookIds: [...event.readList.bookIds.values()] }))

    else if (event instanceof DomainEvent.CollectionAdded) this.emitSse('CollectionAdded', new CollectionSseDto({ collectionId: event.collection.id, seriesIds: event.collection.seriesIds }))
    else if (event instanceof DomainEvent.CollectionUpdated) this.emitSse('CollectionChanged', new CollectionSseDto({ collectionId: event.collection.id, seriesIds: event.collection.seriesIds }))
    else if (event instanceof DomainEvent.CollectionDeleted) this.emitSse('CollectionDeleted', new CollectionSseDto({ collectionId: event.collection.id, seriesIds: event.collection.seriesIds }))

    else if (event instanceof DomainEvent.ReadProgressChanged) this.emitSse('ReadProgressChanged', new ReadProgressSseDto({ bookId: event.progress.bookId, userId: event.progress.userId }), { userIdOnly: event.progress.userId })
    else if (event instanceof DomainEvent.ReadProgressDeleted) this.emitSse('ReadProgressDeleted', new ReadProgressSseDto({ bookId: event.progress.bookId, userId: event.progress.userId }), { userIdOnly: event.progress.userId })
    else if (event instanceof DomainEvent.ReadProgressSeriesChanged) this.emitSse('ReadProgressSeriesChanged', new ReadProgressSeriesSseDto({ seriesId: event.seriesId, userId: event.userId }), { userIdOnly: event.userId })
    else if (event instanceof DomainEvent.ReadProgressSeriesDeleted) this.emitSse('ReadProgressSeriesDeleted', new ReadProgressSeriesSseDto({ seriesId: event.seriesId, userId: event.userId }), { userIdOnly: event.userId })

    else if (event instanceof DomainEvent.ThumbnailBookAdded) this.emitSse('ThumbnailBookAdded', new ThumbnailBookSseDto({ bookId: event.thumbnail.bookId, seriesId: this.bookRepository.getSeriesIdOrNull(event.thumbnail.bookId) ?? '', selected: event.thumbnail.selected }))
    else if (event instanceof DomainEvent.ThumbnailBookDeleted) this.emitSse('ThumbnailBookDeleted', new ThumbnailBookSseDto({ bookId: event.thumbnail.bookId, seriesId: this.bookRepository.getSeriesIdOrNull(event.thumbnail.bookId) ?? '', selected: event.thumbnail.selected }))
    else if (event instanceof DomainEvent.ThumbnailSeriesAdded) this.emitSse('ThumbnailSeriesAdded', new ThumbnailSeriesSseDto({ seriesId: event.thumbnail.seriesId, selected: event.thumbnail.selected }))
    else if (event instanceof DomainEvent.ThumbnailSeriesDeleted) this.emitSse('ThumbnailSeriesDeleted', new ThumbnailSeriesSseDto({ seriesId: event.thumbnail.seriesId, selected: event.thumbnail.selected }))
    else if (event instanceof DomainEvent.ThumbnailSeriesCollectionAdded) this.emitSse('ThumbnailSeriesCollectionAdded', new ThumbnailSeriesCollectionSseDto({ collectionId: event.thumbnail.collectionId, selected: event.thumbnail.selected }))
    else if (event instanceof DomainEvent.ThumbnailSeriesCollectionDeleted) this.emitSse('ThumbnailSeriesCollectionDeleted', new ThumbnailSeriesCollectionSseDto({ collectionId: event.thumbnail.collectionId, selected: event.thumbnail.selected }))
    else if (event instanceof DomainEvent.ThumbnailReadListAdded) this.emitSse('ThumbnailReadListAdded', new ThumbnailReadListSseDto({ readListId: event.thumbnail.readListId, selected: event.thumbnail.selected }))
    else if (event instanceof DomainEvent.ThumbnailReadListDeleted) this.emitSse('ThumbnailReadListDeleted', new ThumbnailReadListSseDto({ readListId: event.thumbnail.readListId, selected: event.thumbnail.selected }))

    else if (event instanceof DomainEvent.UserUpdated) {
      if (event.expireSession) this.emitSse('SessionExpired', new SessionExpiredDto({ userId: event.user.id }), { userIdOnly: event.user.id })
    } else if (event instanceof DomainEvent.UserDeleted) this.emitSse('SessionExpired', new SessionExpiredDto({ userId: event.user.id }), { userIdOnly: event.user.id })
  }

  private emitSse(
    name: string,
    data: object,
    { adminOnly = false, userIdOnly = null }: { adminOnly?: boolean; userIdOnly?: string | null } = {},
  ): void {
    logger.debug(() => `Publish SSE: '${name}':${data}`)

    ;[...this.emitters]
      .filter(([, user]) => (adminOnly ? user.isAdmin : true))
      .filter(([, user]) => (userIdOnly !== null ? user.id === userIdOnly : true))
      .forEach(([emitter]) => {
        try {
          emitter.send(SseEmitter.event().name(name).data(data, MediaType.APPLICATION_JSON_VALUE))
        } catch (e) {
          if (!(e instanceof IOException)) throw e
        }
      })
  }

  start(): void {}

  stop(): void {
    logger.debug(() => 'Closing all SSE connections')
    this.acceptingConnections = false
    this.emitters.forEach((_, emitter) => emitter.complete())
  }

  isRunning(): boolean {
    return true
  }

  getPhase(): number {
    return DEFAULT_PHASE
  }
}

// @Controller
restController(SseController, {
  inject: [BookRepository, TasksRepository],
  rest: false,
  javaName: 'org.gotson.komga.interfaces.sse.SseController',
  // SmartLifecycle : stop() à la fermeture du contexte, avant l'arrêt gracieux du serveur web (phase supérieure)
  smartLifecycle: true,
  // @EventListener
  eventListeners: [{ method: 'handleSseEvent', events: [DomainEvent] }],
  handlers: {
    sse: { mapping: { method: 'GET', path: ['sse/v1/events'] }, args: [authenticationPrincipal()] },
  },
})

scheduled(SseController, [
  // @Scheduled(fixedRate = 15_000)
  { method: 'heartbeat', fixedRate: 15_000 },
  // @Scheduled(fixedRate = 10_000)
  { method: 'taskCount', fixedRate: 10_000 },
])
