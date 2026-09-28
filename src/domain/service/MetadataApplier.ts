// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/MetadataApplier.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookMetadata } from '../model/BookMetadata.js'
import { BookMetadataPatch } from '../model/BookMetadataPatch.js'
import type { SeriesMetadata } from '../model/SeriesMetadata.js'
import type { SeriesMetadataPatch } from '../model/SeriesMetadataPatch.js'
import { component } from '../../port/spring.js'

export class MetadataApplier {
  private getIfNotLocked<T>(original: T, patched: T | null, lock: boolean): T {
    if (patched !== null && !lock) return patched
    else return original
  }

  // PORT: surcharges apply(BookMetadataPatch, BookMetadata) / apply(SeriesMetadataPatch, SeriesMetadata) fusionnées
  apply(patch: BookMetadataPatch, metadata: BookMetadata): BookMetadata
  apply(patch: SeriesMetadataPatch, metadata: SeriesMetadata): SeriesMetadata
  apply(patch: BookMetadataPatch | SeriesMetadataPatch, metadata: BookMetadata | SeriesMetadata): BookMetadata | SeriesMetadata {
    if (patch instanceof BookMetadataPatch) {
      const m = metadata as BookMetadata
      return m.copy({
        title: this.getIfNotLocked(m.title, patch.title, m.titleLock),
        summary: this.getIfNotLocked(m.summary, patch.summary, m.summaryLock),
        number: this.getIfNotLocked(m.number, patch.number, m.numberLock),
        numberSort: this.getIfNotLocked(m.numberSort, patch.numberSort, m.numberSortLock),
        releaseDate: this.getIfNotLocked(m.releaseDate, patch.releaseDate, m.releaseDateLock),
        authors: this.getIfNotLocked(m.authors, patch.authors, m.authorsLock),
        isbn: this.getIfNotLocked(m.isbn, patch.isbn, m.isbnLock),
        links: this.getIfNotLocked(m.links, patch.links, m.linksLock),
        tags: this.getIfNotLocked(m.tags, patch.tags, m.tagsLock),
      })
    } else {
      const m = metadata as SeriesMetadata
      return m.copy({
        status: this.getIfNotLocked(m.status, patch.status, m.statusLock),
        title: this.getIfNotLocked(m.title, patch.title, m.titleLock),
        titleSort: this.getIfNotLocked(m.titleSort, patch.titleSort, m.titleSortLock),
        summary: this.getIfNotLocked(m.summary, patch.summary, m.summaryLock),
        readingDirection: this.getIfNotLocked(m.readingDirection, patch.readingDirection, m.readingDirectionLock),
        ageRating: this.getIfNotLocked(m.ageRating, patch.ageRating, m.ageRatingLock),
        publisher: this.getIfNotLocked(m.publisher, patch.publisher, m.publisherLock),
        language: this.getIfNotLocked(m.language, patch.language, m.languageLock),
        genres: this.getIfNotLocked(m.genres, patch.genres, m.genresLock),
        totalBookCount: this.getIfNotLocked(m.totalBookCount, patch.totalBookCount, m.totalBookCountLock),
      })
    }
  }
}

// @Service
component(MetadataApplier)
