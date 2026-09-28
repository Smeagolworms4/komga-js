// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/SeriesCollectionLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DomainEvent } from '../model/DomainEvent.js'
import { DuplicateNameException } from '../model/Exceptions.js'
import { SearchContext } from '../model/SearchContext.js'
import type { Series } from '../model/Series.js'
import { SeriesCollection } from '../model/SeriesCollection.js'
import { ThumbnailSeriesCollection } from '../model/ThumbnailSeriesCollection.js'
import { SeriesCollectionRepository } from '../persistence/SeriesCollectionRepository.js'
import { ThumbnailSeriesCollectionRepository } from '../persistence/ThumbnailSeriesCollectionRepository.js'
import { MosaicGenerator } from '../../infrastructure/image/MosaicGenerator.js'
import { IllegalArgumentException, equalsIgnoreCase, first, nn } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { TransactionTemplate } from '../../port/spring-tx.js'
import { SeriesLifecycle } from './SeriesLifecycle.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.SeriesCollectionLifecycle')

export class SeriesCollectionLifecycle {
  constructor(
    private readonly collectionRepository: SeriesCollectionRepository,
    private readonly thumbnailSeriesCollectionRepository: ThumbnailSeriesCollectionRepository,
    private readonly seriesLifecycle: SeriesLifecycle,
    private readonly mosaicGenerator: MosaicGenerator,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly transactionTemplate: TransactionTemplate,
  ) {}

  // @Throws(DuplicateNameException)
  // @Transactional
  // PORT: @Transactional -> transactionTemplate.execute
  addCollection(collection: SeriesCollection): SeriesCollection {
    return this.transactionTemplate.execute(() => {
      logger.info(() => `Adding new collection: ${collection}`)

      if (this.collectionRepository.existsByName(collection.name)) throw new DuplicateNameException('Collection name already exists')

      this.collectionRepository.insert(collection)

      this.eventPublisher.publishEvent(new DomainEvent.CollectionAdded({ collection: collection }))

      return nn(this.collectionRepository.findByIdOrNull(collection.id, SearchContext.empty()))
    })
  }

  // @Transactional
  // PORT: @Transactional -> transactionTemplate.execute
  updateCollection(toUpdate: SeriesCollection): void {
    this.transactionTemplate.execute(() => {
      logger.info(() => `Update collection: ${toUpdate}`)

      const existing = this.collectionRepository.findByIdOrNull(toUpdate.id, SearchContext.empty())
      if (existing === null) throw new IllegalArgumentException('Cannot update collection that does not exist')

      if (!equalsIgnoreCase(existing.name, toUpdate.name) && this.collectionRepository.existsByName(toUpdate.name)) throw new DuplicateNameException('Collection name already exists')

      this.collectionRepository.update(toUpdate)

      this.eventPublisher.publishEvent(new DomainEvent.CollectionUpdated({ collection: toUpdate }))
    })
  }

  deleteCollection(collection: SeriesCollection): void {
    this.transactionTemplate.executeWithoutResult(() => {
      this.thumbnailSeriesCollectionRepository.deleteByCollectionId(collection.id)
      this.collectionRepository.delete(collection.id)
    })
    this.eventPublisher.publishEvent(new DomainEvent.CollectionDeleted({ collection: collection }))
  }

  /**
   * Add series to collection by name.
   * Collection will be created if it doesn't exist.
   */
  // @Transactional
  // PORT: @Transactional -> transactionTemplate.execute
  addSeriesToCollection(collectionName: string, series: Series): void {
    this.transactionTemplate.execute(() => {
      const existing = this.collectionRepository.findByNameOrNull(collectionName)
      if (existing !== null) {
        if (existing.seriesIds.includes(series.id)) {
          logger.debug(() => `Series is already in existing collection '${existing.name}'`)
        } else {
          logger.debug(() => `Adding series '${series.name}' to existing collection '${existing.name}'`)
          this.updateCollection(existing.copy({ seriesIds: [...existing.seriesIds, series.id] }))
        }
      } else {
        logger.debug(() => `Adding series '${series.name}' to new collection '${collectionName}'`)
        this.addCollection(
          new SeriesCollection({
            name: collectionName,
            seriesIds: [series.id],
          }),
        )
      }
    })
  }

  deleteEmptyCollections(): void {
    logger.info(() => 'Deleting empty collections')
    const toDelete = this.collectionRepository.findAllEmpty()
    this.transactionTemplate.executeWithoutResult(() => {
      this.thumbnailSeriesCollectionRepository.deleteByCollectionIds(toDelete.map((it) => it.id))
      this.collectionRepository.delete(toDelete.map((it) => it.id))
    })

    toDelete.forEach((it) => this.eventPublisher.publishEvent(new DomainEvent.CollectionDeleted({ collection: it })))
  }

  addThumbnail(thumbnail: ThumbnailSeriesCollection): ThumbnailSeriesCollection {
    switch (thumbnail.type) {
      case ThumbnailSeriesCollection.Type.USER_UPLOADED: {
        this.thumbnailSeriesCollectionRepository.insert(thumbnail)
        if (thumbnail.selected) {
          this.thumbnailSeriesCollectionRepository.markSelected(thumbnail)
        }
      }
    }

    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailSeriesCollectionAdded({ thumbnail: thumbnail }))
    return thumbnail
  }

  markSelectedThumbnail(thumbnail: ThumbnailSeriesCollection): void {
    this.thumbnailSeriesCollectionRepository.markSelected(thumbnail)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailSeriesCollectionAdded({ thumbnail: thumbnail.copy({ selected: true }) }))
  }

  deleteThumbnail(thumbnail: ThumbnailSeriesCollection): void {
    this.thumbnailSeriesCollectionRepository.delete(thumbnail.id)
    this.thumbnailsHouseKeeping(thumbnail.collectionId)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailSeriesCollectionDeleted({ thumbnail: thumbnail }))
  }

  // PORT: async (SeriesLifecycle.getThumbnailBytes et MosaicGenerator.createMosaic utilisent sharp)
  async getThumbnailBytes(collection: SeriesCollection, userId: string): Promise<Uint8Array> {
    const selected = this.thumbnailSeriesCollectionRepository.findSelectedByCollectionIdOrNull(collection.id)
    if (selected !== null) {
      return selected.thumbnail
    }

    // UPSTREAM-BUG: boucle infinie si la collection ne contient aucune série
    const ids = ((): string[] => {
      const list: string[] = []
      while (list.length < 4) {
        list.push(...collection.seriesIds.slice(0, 4))
      }
      return list.slice(0, 4)
    })()

    const images: Uint8Array[] = []
    for (const it of ids) {
      const bytes = await this.seriesLifecycle.getThumbnailBytes(it, userId)
      if (bytes !== null) images.push(bytes)
    }
    return await this.mosaicGenerator.createMosaic(images)
  }

  private thumbnailsHouseKeeping(collectionId: string): void {
    logger.info(() => `House keeping thumbnails for collection: ${collectionId}`)
    const all = this.thumbnailSeriesCollectionRepository.findAllByCollectionId(collectionId)

    const selected = all.filter((it) => it.selected)
    if (selected.length > 1) {
      logger.info(() => 'More than one thumbnail is selected, removing extra ones')
      this.thumbnailSeriesCollectionRepository.markSelected(nn(selected[0]))
    } else if (selected.length === 0 && all.length > 0) {
      logger.info(() => 'Collection has no selected thumbnail, choosing one automatically')
      this.thumbnailSeriesCollectionRepository.markSelected(first(all))
    }
  }
}

// @Service
component(SeriesCollectionLifecycle, {
  inject: [SeriesCollectionRepository, ThumbnailSeriesCollectionRepository, SeriesLifecycle, MosaicGenerator, ApplicationEventPublisher, TransactionTemplate],
})
