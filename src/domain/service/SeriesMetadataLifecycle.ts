// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/SeriesMetadataLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BookWithMedia } from '../model/BookWithMedia.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { MetadataPatchTarget } from '../model/MetadataPatchTarget.js'
import type { Series } from '../model/Series.js'
import { SeriesMetadataPatch } from '../model/SeriesMetadataPatch.js'
import { BookMetadataAggregationRepository } from '../persistence/BookMetadataAggregationRepository.js'
import { BookMetadataRepository } from '../persistence/BookMetadataRepository.js'
import { BookRepository } from '../persistence/BookRepository.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { MediaRepository } from '../persistence/MediaRepository.js'
import { SeriesMetadataRepository } from '../persistence/SeriesMetadataRepository.js'
import { SeriesMetadataFromBookProvider } from '../../infrastructure/metadata/SeriesMetadataFromBookProvider.js'
import { SeriesMetadataProvider } from '../../infrastructure/metadata/SeriesMetadataProvider.js'
import { mostFrequent } from '../../language/LanguageUtils.js'
import { distinct, mapNotNull, maxByOrNull } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { MetadataAggregator } from './MetadataAggregator.js'
import { MetadataApplier } from './MetadataApplier.js'
import { SeriesCollectionLifecycle } from './SeriesCollectionLifecycle.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.SeriesMetadataLifecycle')

export class SeriesMetadataLifecycle {
  constructor(
    private readonly seriesMetadataFromBookProviders: SeriesMetadataFromBookProvider[],
    private readonly seriesMetadataProviders: SeriesMetadataProvider[],
    private readonly metadataApplier: MetadataApplier,
    private readonly metadataAggregator: MetadataAggregator,
    private readonly mediaRepository: MediaRepository,
    private readonly bookMetadataRepository: BookMetadataRepository,
    private readonly seriesMetadataRepository: SeriesMetadataRepository,
    private readonly bookMetadataAggregationRepository: BookMetadataAggregationRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly bookRepository: BookRepository,
    private readonly collectionLifecycle: SeriesCollectionLifecycle,
    private readonly eventPublisher: ApplicationEventPublisher,
  ) {}

  refreshMetadata(series: Series): void {
    logger.info(() => `Refresh metadata for series: ${series}`)

    const library = this.libraryRepository.findById(series.libraryId)
    let changed = false

    this.seriesMetadataFromBookProviders.forEach((provider) => {
      if (!(provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.SERIES) || provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.COLLECTION)))
        logger.info(() => `Library is not set to import series or collection metadata for this provider, skipping: ${provider.constructor.name}`)
      else {
        logger.debug(() => `Provider: ${provider.constructor.name}`)
        const patches = mapNotNull(this.bookRepository.findAllBySeriesId(series.id), (book) => {
          try {
            return provider.getSeriesMetadataFromBook(new BookWithMedia({ book: book, media: this.mediaRepository.findById(book.id) }), library.importComicInfoSeriesAppendVolume)
          } catch (e) {
            logger.error(e as Error, () => `Error while getting metadata from ${provider.constructor.name} for book: ${book}`)
            return null
          }
        })

        if (provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.SERIES)) {
          this.handlePatchForSeriesMetadataList(patches, series)
          changed = true
        }

        if (provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.COLLECTION)) {
          distinct(patches.flatMap((it) => [...it.collections])).forEach((collection) => {
            this.collectionLifecycle.addSeriesToCollection(collection, series)
          })
        }
      }
    })

    this.seriesMetadataProviders.forEach((provider) => {
      if (!provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.SERIES))
        logger.info(() => `Library is not set to import series metadata for this provider, skipping: ${provider.constructor.name}`)
      else {
        logger.debug(() => `Provider: ${provider.constructor.name}`)
        let patch: SeriesMetadataPatch | null
        try {
          patch = provider.getSeriesMetadata(series)
        } catch (e) {
          logger.error(e as Error, () => `Error while getting metadata from ${provider.constructor.name} for series: ${series}`)
          patch = null
        }

        if (provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.SERIES)) {
          this.handlePatchForSeriesMetadata(patch, series)
          changed = true
        }
      }
    })

    if (changed) this.eventPublisher.publishEvent(new DomainEvent.SeriesUpdated({ series: series }))
  }

  // PORT: surcharge privée handlePatchForSeriesMetadata(List<SeriesMetadataPatch>, Series) -> handlePatchForSeriesMetadataList
  private handlePatchForSeriesMetadataList(patches: SeriesMetadataPatch[], series: Series): void {
    const genres = new Set(mapNotNull(patches, (it) => it.genres).flatMap((it) => [...it]))
    const aggregatedPatch = new SeriesMetadataPatch({
      title: mostFrequent(patches, (it) => it.title),
      titleSort: mostFrequent(patches, (it) => it.titleSort),
      status: mostFrequent(patches, (it) => it.status),
      genres: genres.size === 0 ? null : genres,
      language: mostFrequent(patches, (it) => it.language),
      summary: null,
      readingDirection: mostFrequent(patches, (it) => it.readingDirection),
      ageRating: maxByOrNull(
        mapNotNull(patches, (it) => it.ageRating),
        (it) => it,
      ),
      publisher: mostFrequent(patches, (it) => it.publisher),
      totalBookCount: maxByOrNull(
        mapNotNull(patches, (it) => it.totalBookCount),
        (it) => it,
      ),
      collections: new Set(),
    })

    this.handlePatchForSeriesMetadata(aggregatedPatch, series)
  }

  private handlePatchForSeriesMetadata(patch: SeriesMetadataPatch | null, series: Series): void {
    if (patch !== null) {
      const sPatch = patch
      const it = this.seriesMetadataRepository.findById(series.id)
      logger.debug(() => `Apply metadata for series: ${series}`)

      logger.debug(() => `Original metadata: ${it}`)
      logger.debug(() => `Patch: ${sPatch}`)
      const patched = this.metadataApplier.apply(sPatch, it)
      logger.debug(() => `Patched metadata: ${patched}`)

      this.seriesMetadataRepository.update(patched)
    }
  }

  aggregateMetadata(series: Series): void {
    logger.info(() => `Aggregate book metadata for series: ${series}`)

    const metadatas = this.bookMetadataRepository.findAllByIds(this.bookRepository.findAllIdsBySeriesId(series.id))
    const aggregation = this.metadataAggregator.aggregate(metadatas).copy({ seriesId: series.id })

    this.bookMetadataAggregationRepository.update(aggregation)

    this.eventPublisher.publishEvent(new DomainEvent.SeriesUpdated({ series: series }))
  }
}

// @Service
component(SeriesMetadataLifecycle, {
  inject: [
    { list: SeriesMetadataFromBookProvider },
    { list: SeriesMetadataProvider },
    MetadataApplier,
    MetadataAggregator,
    MediaRepository,
    BookMetadataRepository,
    SeriesMetadataRepository,
    BookMetadataAggregationRepository,
    LibraryRepository,
    BookRepository,
    SeriesCollectionLifecycle,
    ApplicationEventPublisher,
  ],
})
