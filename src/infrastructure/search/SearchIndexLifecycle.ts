// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/search/SearchIndexLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DomainEvent } from '../../domain/model/DomainEvent.js'
import type { ReadList } from '../../domain/model/ReadList.js'
import { SearchContext } from '../../domain/model/SearchContext.js'
import type { SeriesCollection } from '../../domain/model/SeriesCollection.js'
import { ReadListRepository } from '../../domain/persistence/ReadListRepository.js'
import { SeriesCollectionRepository } from '../../domain/persistence/SeriesCollectionRepository.js'
import { BookDtoRepository } from '../../interfaces/api/persistence/BookDtoRepository.js'
import { SeriesDtoRepository } from '../../interfaces/api/persistence/SeriesDtoRepository.js'
import type { BookDto } from '../../interfaces/api/rest/dto/BookDto.js'
import type { SeriesDto } from '../../interfaces/api/rest/dto/SeriesDto.js'
import { mapNotNull, nn } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import type { Document } from '../../port/lucene/document.js'
import { Term } from '../../port/lucene/document.js'
import { type Page, PageRequest, Pageable } from '../../port/spring-data.js'
import { component } from '../../port/spring.js'
import { LuceneEntity, oneshotDocument, toDocument } from './LuceneEntity.js'
import { LuceneHelper } from './LuceneHelper.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.search.SearchIndexLifecycle')
const INDEX_VERSION = 8

export class SearchIndexLifecycle {
  constructor(
    private readonly collectionRepository: SeriesCollectionRepository,
    private readonly readListRepository: ReadListRepository,
    private readonly bookDtoRepository: BookDtoRepository,
    private readonly seriesDtoRepository: SeriesDtoRepository,
    private readonly luceneHelper: LuceneHelper,
  ) {}

  upgradeIndex(): void {
    this.luceneHelper.upgradeIndex()
    this.luceneHelper.setIndexVersion(INDEX_VERSION)
  }

  rebuildIndex(entities: ReadonlySet<LuceneEntity> | null = null): void {
    const targetEntities = entities ?? new Set(LuceneEntity.entries())

    logger.info(() => `Rebuild index for: [${[...targetEntities].map((it) => it.type).join(', ')}]`)

    targetEntities.forEach((it) => {
      switch (it) {
        case LuceneEntity.Book:
          this.rebuildIndexEntity(
            it,
            (p: Pageable) => this.bookDtoRepository.findAll(p),
            (e: BookDto) => this.bookToDocument(e),
          )
          break
        case LuceneEntity.Series:
          this.rebuildIndexEntity(
            it,
            (p: Pageable) => this.seriesDtoRepository.findAll(p),
            (e: SeriesDto) => toDocument(e),
          )
          break
        case LuceneEntity.Collection:
          this.rebuildIndexEntity(
            it,
            (p: Pageable) => this.collectionRepository.findAll(SearchContext.empty(), p),
            (e: SeriesCollection) => toDocument(e),
          )
          break
        case LuceneEntity.ReadList:
          this.rebuildIndexEntity(
            it,
            (p: Pageable) => this.readListRepository.findAll(SearchContext.empty(), p),
            (e: ReadList) => toDocument(e),
          )
          break
      }
    })

    this.luceneHelper.setIndexVersion(INDEX_VERSION)
  }

  // PORT: surcharge privée rebuildIndex(entity, provider, toDoc) -> rebuildIndexEntity
  private rebuildIndexEntity<T>(entity: LuceneEntity, provider: (p: Pageable) => Page<T>, toDoc: (t: T) => Document | null): void {
    logger.info(() => `Rebuilding index for ${entity.name}`)

    const count = provider(Pageable.ofSize(1)).totalElements
    const batchSize = 5_000
    const pages = Math.ceil(count / batchSize)
    logger.info(() => `Number of entities: ${count}`)

    // measureTime
    const start = performance.now()
    this.luceneHelper.deleteDocuments(new Term(LuceneEntity.TYPE, entity.type))

    for (let page = 0; page < pages; page++) {
      logger.info(() => `Processing page ${page + 1} of ${pages} (${batchSize} elements)`)
      const entityDocs = mapNotNull(provider(PageRequest.of(page, batchSize)).content, (it) => toDoc(it))
      this.luceneHelper.addDocuments(entityDocs)
    }
    const duration = performance.now() - start
    // PORT: format de kotlin.time.Duration.toString() approché (millisecondes)
    logger.info(() => `Wrote ${entity.name} index in ${(duration / 1000).toFixed(3)}s`)
  }

  consumeEvents(event: DomainEvent): void {
    if (event instanceof DomainEvent.SeriesAdded) {
      const it = this.seriesDtoRepository.findByIdOrNull(event.series.id, 'unused')
      if (it !== null) this.addEntity(toDocument(it))
    } else if (event instanceof DomainEvent.SeriesUpdated) {
      const it = this.seriesDtoRepository.findByIdOrNull(event.series.id, 'unused')
      if (it !== null) this.updateEntity(LuceneEntity.Series, event.series.id, toDocument(it))
    } else if (event instanceof DomainEvent.SeriesDeleted) this.deleteEntity(LuceneEntity.Series, event.series.id)
    else if (event instanceof DomainEvent.BookAdded) {
      const it = this.bookDtoRepository.findByIdOrNull(event.book.id, 'unused')
      if (it !== null) this.addEntity(this.bookToDocument(it))
    } else if (event instanceof DomainEvent.BookUpdated) {
      const it = this.bookDtoRepository.findByIdOrNull(event.book.id, 'unused')
      if (it !== null) this.updateEntity(LuceneEntity.Book, event.book.id, this.bookToDocument(it))
    } else if (event instanceof DomainEvent.BookDeleted) this.deleteEntity(LuceneEntity.Book, event.book.id)
    else if (event instanceof DomainEvent.ReadListAdded) {
      const it = this.readListRepository.findByIdOrNull(event.readList.id, SearchContext.empty())
      if (it !== null) this.addEntity(toDocument(it))
    } else if (event instanceof DomainEvent.ReadListUpdated) {
      const it = this.readListRepository.findByIdOrNull(event.readList.id, SearchContext.empty())
      if (it !== null) this.updateEntity(LuceneEntity.ReadList, event.readList.id, toDocument(it))
    } else if (event instanceof DomainEvent.ReadListDeleted) this.deleteEntity(LuceneEntity.ReadList, event.readList.id)
    else if (event instanceof DomainEvent.CollectionAdded) {
      const it = this.collectionRepository.findByIdOrNull(event.collection.id, SearchContext.empty())
      if (it !== null) this.addEntity(toDocument(it))
    } else if (event instanceof DomainEvent.CollectionUpdated) {
      const it = this.collectionRepository.findByIdOrNull(event.collection.id, SearchContext.empty())
      if (it !== null) this.updateEntity(LuceneEntity.Collection, event.collection.id, toDocument(it))
    } else if (event instanceof DomainEvent.CollectionDeleted) this.deleteEntity(LuceneEntity.Collection, event.collection.id)
    else {
      // Unit
    }
  }

  private bookToDocument(self: BookDto): Document {
    return self.oneshot ? oneshotDocument(nn(this.seriesDtoRepository.findByIdOrNull(self.seriesId, 'unused')), toDocument(self)) : toDocument(self)
  }

  private addEntity(doc: Document): void {
    this.luceneHelper.addDocument(doc)
  }

  private updateEntity(entity: LuceneEntity, entityId: string, newDoc: Document): void {
    this.luceneHelper.updateDocument(new Term(entity.id, entityId), newDoc)
  }

  private deleteEntity(entity: LuceneEntity, entityId: string): void {
    this.luceneHelper.deleteDocuments(new Term(entity.id, entityId))
  }
}

// @Component
component(SearchIndexLifecycle, {
  inject: [SeriesCollectionRepository, ReadListRepository, BookDtoRepository, SeriesDtoRepository, LuceneHelper],
  // @EventListener
  eventListeners: [{ method: 'consumeEvents', events: [DomainEvent] }],
  // PORT: l'index est celui du thread principal : les événements des tâches y sont traités, et les tâches
  // RebuildIndex / UpgradeIndex du worker y appellent ce bean (port/task-worker.ts)
  taskWorker: 'callMain',
})
