// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/LocalArtworkLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Book } from '../model/Book.js'
import { MarkSelectedPreference } from '../model/MarkSelectedPreference.js'
import type { Series } from '../model/Series.js'
import type { ThumbnailBook } from '../model/ThumbnailBook.js'
import type { ThumbnailSeries } from '../model/ThumbnailSeries.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { LocalArtworkProvider } from '../../infrastructure/metadata/localartwork/LocalArtworkProvider.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'
import { BookLifecycle } from './BookLifecycle.js'
import { SeriesLifecycle } from './SeriesLifecycle.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.LocalArtworkLifecycle')

export class LocalArtworkLifecycle {
  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly bookLifecycle: BookLifecycle,
    private readonly seriesLifecycle: SeriesLifecycle,
    private readonly localArtworkProvider: LocalArtworkProvider,
  ) {}

  // PORT: surcharges refreshLocalArtwork(book: Book) / refreshLocalArtwork(series: Series) fusionnées (union de types)
  refreshLocalArtwork(bookOrSeries: Book | Series): void {
    if (bookOrSeries instanceof Book) {
      const book = bookOrSeries
      logger.info(() => `Refresh local artwork for book: ${book}`)
      const library = this.libraryRepository.findById(book.libraryId)

      if (library.importLocalArtwork)
        this.localArtworkProvider.getBookThumbnails(book).forEach((it: ThumbnailBook) => {
          this.bookLifecycle.addThumbnailForBook(it, it.selected ? MarkSelectedPreference.IF_NONE_OR_GENERATED : MarkSelectedPreference.NO)
        })
      else logger.info(() => 'Library is not set to import local artwork, skipping')
      return
    }

    const series = bookOrSeries
    logger.info(() => `Refresh local artwork for series: ${series}`)
    const library = this.libraryRepository.findById(series.libraryId)

    if (library.importLocalArtwork)
      this.localArtworkProvider.getSeriesThumbnails(series).forEach((it: ThumbnailSeries) => {
        this.seriesLifecycle.addThumbnailForSeries(it, it.selected ? MarkSelectedPreference.IF_NONE_OR_GENERATED : MarkSelectedPreference.NO)
      })
    else logger.info(() => 'Library is not set to import local artwork, skipping')
  }
}

// @Service
component(LocalArtworkLifecycle, { inject: [LibraryRepository, BookLifecycle, SeriesLifecycle, LocalArtworkProvider] })
