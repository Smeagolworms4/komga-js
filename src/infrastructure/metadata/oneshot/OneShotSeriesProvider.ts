// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/oneshot/OneShotSeriesProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Library } from '../../../domain/model/Library.js'
import { MetadataPatchTarget } from '../../../domain/model/MetadataPatchTarget.js'
import type { Series } from '../../../domain/model/Series.js'
import { SeriesMetadata } from '../../../domain/model/SeriesMetadata.js'
import { SeriesMetadataPatch } from '../../../domain/model/SeriesMetadataPatch.js'
import { BookMetadataRepository } from '../../../domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../domain/persistence/BookRepository.js'
import { first } from '../../../port/kotlin.js'
import { component } from '../../../port/spring.js'
import { SeriesMetadataProvider } from '../SeriesMetadataProvider.js'

export class OneShotSeriesProvider implements SeriesMetadataProvider {
  constructor(
    private readonly bookRepository: BookRepository,
    private readonly bookMetadataRepository: BookMetadataRepository,
  ) {}

  getSeriesMetadata(series: Series): SeriesMetadataPatch | null {
    if (!series.oneshot) return null
    const bookMetadata = this.bookMetadataRepository.findById(first(this.bookRepository.findAllIdsBySeriesId(series.id)))
    return new SeriesMetadataPatch({
      title: bookMetadata.title,
      titleSort: bookMetadata.title,
      status: SeriesMetadata.Status.ENDED,
      summary: bookMetadata.summary,
      readingDirection: null,
      publisher: null,
      ageRating: null,
      language: null,
      genres: null,
      totalBookCount: 1,
      collections: new Set(),
    })
  }

  shouldLibraryHandlePatch(library: Library, target: MetadataPatchTarget): boolean {
    return target === MetadataPatchTarget.SERIES
  }
}

// @Service
component(OneShotSeriesProvider, { inject: [BookRepository, BookMetadataRepository], types: [SeriesMetadataProvider] })
