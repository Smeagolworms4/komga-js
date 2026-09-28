// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/ContentRestrictionChecker.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Book } from '../../domain/model/Book.js'
import type { KomgaUser } from '../../domain/model/KomgaUser.js'
import { BookRepository } from '../../domain/persistence/BookRepository.js'
import { SeriesMetadataRepository } from '../../domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../domain/persistence/SeriesRepository.js'
import { ThumbnailBookRepository } from '../../domain/persistence/ThumbnailBookRepository.js'
import { ThumbnailSeriesRepository } from '../../domain/persistence/ThumbnailSeriesRepository.js'
import { component } from '../../port/spring.js'
import { HttpStatus, ResponseStatusException } from '../../port/spring-web.js'
import type { BookDto } from './rest/dto/BookDto.js'
import type { SeriesDto } from './rest/dto/SeriesDto.js'

export class ContentRestrictionChecker {
  constructor(
    private readonly seriesMetadataRepository: SeriesMetadataRepository,
    private readonly bookRepository: BookRepository,
    private readonly thumbnailBookRepository: ThumbnailBookRepository,
    private readonly seriesRepository: SeriesRepository,
    private readonly thumbnailSeriesRepository: ThumbnailSeriesRepository,
  ) {}

  // PORT: surcharges checkContentRestrictionBook(user, BookDto) / (user, Book) / (user, bookId) -> une seule méthode
  /**
   * Convenience function to check for content restriction.
   * This will retrieve data from repositories if needed.
   *
   * @throws[ResponseStatusException] if the user cannot access the content
   */
  checkContentRestrictionBook(komgaUser: KomgaUser, bookOrBookId: BookDto | Book | string): void {
    if (typeof bookOrBookId !== 'string') {
      const book = bookOrBookId
      if (!komgaUser.canAccessLibrary(book.libraryId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      if (komgaUser.restrictions.isRestricted) {
        const it = this.seriesMetadataRepository.findById(book.seriesId)
        if (!komgaUser.isContentAllowed({ ageRating: it.ageRating, sharingLabels: it.sharingLabels })) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      }
      return
    }

    /**
     * Convenience function to check for content restriction.
     * This will retrieve data from repositories if needed.
     *
     * @throws[ResponseStatusException] if the user cannot access the content
     */
    const bookId = bookOrBookId
    if (!komgaUser.canAccessAllLibraries()) {
      const it = this.bookRepository.getLibraryIdOrNull(bookId)
      if (it !== null) {
        if (!komgaUser.canAccessLibrary(it)) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }
    if (komgaUser.restrictions.isRestricted) {
      const seriesId = this.bookRepository.getSeriesIdOrNull(bookId)
      if (seriesId !== null) {
        const it = this.seriesMetadataRepository.findById(seriesId)
        if (!komgaUser.isContentAllowed({ ageRating: it.ageRating, sharingLabels: it.sharingLabels })) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }
  }

  /**
   * Convenience function to check for content restriction.
   *
   * @throws[ResponseStatusException] if the user cannot access the content
   */
  checkContentRestrictionBookThumbnail(komgaUser: KomgaUser, thumbnailId: string): void {
    if (!komgaUser.canAccessAllLibraries()) {
      const it = this.thumbnailBookRepository.getLibraryIdOrNull(thumbnailId)
      if (it !== null) {
        if (!komgaUser.canAccessLibrary(it)) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }
    if (komgaUser.restrictions.isRestricted) {
      const seriesId = this.thumbnailBookRepository.getSeriesIdOrNull(thumbnailId)
      if (seriesId !== null) {
        const it = this.seriesMetadataRepository.findById(seriesId)
        if (!komgaUser.isContentAllowed({ ageRating: it.ageRating, sharingLabels: it.sharingLabels })) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }
  }

  // PORT: surcharges checkContentRestrictionSeries(user, SeriesDto) / (user, seriesId) -> une seule méthode
  /**
   * Convenience function to check for content restriction.
   *
   * @throws[ResponseStatusException] if the user cannot access the content
   */
  checkContentRestrictionSeries(komgaUser: KomgaUser, seriesOrSeriesId: SeriesDto | string): void {
    if (typeof seriesOrSeriesId !== 'string') {
      const series = seriesOrSeriesId
      if (!komgaUser.canAccessLibrary(series.libraryId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      if (!komgaUser.isContentAllowed({ ageRating: series.metadata.ageRating, sharingLabels: series.metadata.sharingLabels })) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      return
    }

    /**
     * Convenience function to check for content restriction.
     *
     * @throws[ResponseStatusException] if the user cannot access the content
     */
    const seriesId = seriesOrSeriesId
    if (!komgaUser.canAccessAllLibraries()) {
      const it = this.seriesRepository.getLibraryId(seriesId)
      if (it !== null) {
        if (!komgaUser.canAccessLibrary(it)) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }
    if (komgaUser.restrictions.isRestricted) {
      const it = this.seriesMetadataRepository.findById(seriesId)
      if (!komgaUser.isContentAllowed({ ageRating: it.ageRating, sharingLabels: it.sharingLabels })) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
    }
  }

  /**
   * Convenience function to check for content restriction.
   *
   * @throws[ResponseStatusException] if the user cannot access the content
   */
  checkContentRestrictionSeriesThumbnail(komgaUser: KomgaUser, thumbnailId: string): void {
    if (!komgaUser.canAccessAllLibraries()) {
      const it = this.thumbnailSeriesRepository.getLibraryIdOrNull(thumbnailId)
      if (it !== null) {
        if (!komgaUser.canAccessLibrary(it)) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }
    if (komgaUser.restrictions.isRestricted) {
      const seriesId = this.thumbnailSeriesRepository.getSeriesIdOrNull(thumbnailId)
      if (seriesId !== null) {
        const it = this.seriesMetadataRepository.findById(seriesId)
        if (!komgaUser.isContentAllowed({ ageRating: it.ageRating, sharingLabels: it.sharingLabels })) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
      } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    }
  }
}

// @Component
component(ContentRestrictionChecker, {
  inject: [SeriesMetadataRepository, BookRepository, ThumbnailBookRepository, SeriesRepository, ThumbnailSeriesRepository],
})
