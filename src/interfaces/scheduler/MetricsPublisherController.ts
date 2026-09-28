// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/scheduler/MetricsPublisherController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DomainEvent } from '../../domain/model/DomainEvent.js'
import { BookRepository } from '../../domain/persistence/BookRepository.js'
import { LibraryRepository } from '../../domain/persistence/LibraryRepository.js'
import { ReadListRepository } from '../../domain/persistence/ReadListRepository.js'
import { SeriesCollectionRepository } from '../../domain/persistence/SeriesCollectionRepository.js'
import { SeriesRepository } from '../../domain/persistence/SeriesRepository.js'
import { SidecarRepository } from '../../domain/persistence/SidecarRepository.js'
import { AtomicLong } from '../../port/java.js'
import { Counter, Gauge, MeterRegistry, MultiGauge, Tags, Timer } from '../../port/micrometer.js'
import { ApplicationReadyEvent, component } from '../../port/spring.js'

const LIBRARIES = 'libraries'
const SERIES = 'series'
const BOOKS = 'books'
const BOOKS_FILESIZE = 'books.filesize'
const COLLECTIONS = 'collections'
const READLISTS = 'readlists'
const SIDECARS = 'sidecars'

export const METER_TASKS_EXECUTION = 'komga.tasks.execution'
export const METER_TASKS_FAILURE = 'komga.tasks.failure'

export class MetricsPublisherController {
  private readonly entitiesMultiTag: string[]
  private readonly entitiesNoTags: string[]
  private readonly allEntities: string[]

  readonly multiGauges: Map<string, MultiGauge>

  readonly noTagGauges: Map<string, AtomicLong>

  readonly bookFileSizeGauge: MultiGauge

  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly bookRepository: BookRepository,
    private readonly seriesRepository: SeriesRepository,
    private readonly collectionRepository: SeriesCollectionRepository,
    private readonly readListRepository: ReadListRepository,
    private readonly sidecarRepository: SidecarRepository,
    private readonly meterRegistry: MeterRegistry,
  ) {
    // init
    Timer.builder(METER_TASKS_EXECUTION).description('Task execution time').register(meterRegistry)

    Counter.builder(METER_TASKS_FAILURE).description('Count of failed tasks').register(meterRegistry)

    // PORT: initialiseurs de propriétés Kotlin exécutés après le bloc init, dans l'ordre de déclaration
    this.entitiesMultiTag = [SERIES, BOOKS, BOOKS_FILESIZE, SIDECARS]
    this.entitiesNoTags = [LIBRARIES, COLLECTIONS, READLISTS]
    this.allEntities = [...this.entitiesMultiTag, ...this.entitiesNoTags]

    this.multiGauges = new Map(
      this.entitiesMultiTag.map((entity) => [entity, MultiGauge.builder(`komga.${entity}`).description(`The number of ${entity}`).baseUnit('count').register(meterRegistry)]),
    )

    this.noTagGauges = new Map(
      this.entitiesNoTags.map((entity) => {
        const value = new AtomicLong(0)
        Gauge.builder(`komga.${entity}`, value, () => value.get())
          .description(`The number of ${entity}`)
          .baseUnit('count')
          .register(meterRegistry)
        return [entity, value]
      }),
    )

    this.bookFileSizeGauge = MultiGauge.builder(`komga.${BOOKS_FILESIZE}`).description('The cumulated filesize of books').baseUnit('bytes').register(meterRegistry)
  }

  private pushMetricsOnEvent(event: DomainEvent): void {
    if (event instanceof DomainEvent.LibraryScanned) this.entitiesMultiTag.forEach((it) => this.pushMetricsCount(it))
    else if (event instanceof DomainEvent.LibraryAdded) this.noTagGauges.get(LIBRARIES)?.incrementAndGet()
    else if (event instanceof DomainEvent.LibraryDeleted) {
      this.noTagGauges.get(LIBRARIES)?.decrementAndGet()
      this.entitiesMultiTag.forEach((it) => this.pushMetricsCount(it))
    } else if (event instanceof DomainEvent.CollectionAdded) this.noTagGauges.get(COLLECTIONS)?.incrementAndGet()
    else if (event instanceof DomainEvent.CollectionDeleted) this.noTagGauges.get(COLLECTIONS)?.decrementAndGet()
    else if (event instanceof DomainEvent.ReadListAdded) this.noTagGauges.get(READLISTS)?.incrementAndGet()
    else if (event instanceof DomainEvent.ReadListDeleted) this.noTagGauges.get(READLISTS)?.decrementAndGet()
    else {
      // Unit
    }
  }

  pushAllMetrics(): void {
    this.allEntities.forEach((it) => this.pushMetricsCount(it))
  }

  private pushMetricsCount(entity: string): void {
    switch (entity) {
      case LIBRARIES:
        this.noTagGauges.get(LIBRARIES)?.set(this.libraryRepository.count())
        break
      case COLLECTIONS:
        this.noTagGauges.get(COLLECTIONS)?.set(this.collectionRepository.count())
        break
      case READLISTS:
        this.noTagGauges.get(READLISTS)?.set(this.readListRepository.count())
        break

      case SERIES:
        this.multiGauges.get(SERIES)?.register(
          [...this.seriesRepository.countGroupedByLibraryId()].map(([key, value]) => MultiGauge.Row.of(Tags.of('library', key), value)),
          true,
        )
        break
      case BOOKS:
        this.multiGauges.get(BOOKS)?.register(
          [...this.bookRepository.countGroupedByLibraryId()].map(([key, value]) => MultiGauge.Row.of(Tags.of('library', key), value)),
          true,
        )
        break
      case BOOKS_FILESIZE:
        this.bookFileSizeGauge.register(
          [...this.bookRepository.getFilesizeGroupedByLibraryId()].map(([key, value]) => MultiGauge.Row.of(Tags.of('library', key), value)),
          true,
        )
        break
      case SIDECARS:
        this.multiGauges.get(SIDECARS)?.register(
          [...this.sidecarRepository.countGroupedByLibraryId()].map(([key, value]) => MultiGauge.Row.of(Tags.of('library', key), value)),
          true,
        )
        break
    }
  }
}

// @Profile("!test") @Component
component(MetricsPublisherController, {
  profile: '!test',
  inject: [LibraryRepository, BookRepository, SeriesRepository, SeriesCollectionRepository, ReadListRepository, SidecarRepository, MeterRegistry],
  eventListeners: [
    // @EventListener
    { method: 'pushMetricsOnEvent', events: [DomainEvent] },
    // @EventListener(ApplicationReadyEvent::class)
    { method: 'pushAllMetrics', events: [ApplicationReadyEvent] },
  ],
})
