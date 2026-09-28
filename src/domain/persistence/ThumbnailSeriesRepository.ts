// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/ThumbnailSeriesRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ThumbnailSeries } from '../model/ThumbnailSeries.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class ThumbnailSeriesRepository {
  abstract findByIdOrNull(thumbnailId: string): ThumbnailSeries | null

  abstract findSelectedBySeriesIdOrNull(seriesId: string): ThumbnailSeries | null

  abstract findAllBySeriesId(seriesId: string): ThumbnailSeries[]

  abstract findAllBySeriesIdIdAndType(seriesId: string, type: ThumbnailSeries.Type): ThumbnailSeries[]

  abstract getLibraryIdOrNull(thumbnailId: string): string | null

  abstract getSeriesIdOrNull(thumbnailId: string): string | null

  abstract insert(thumbnail: ThumbnailSeries): void

  abstract update(thumbnail: ThumbnailSeries): void

  abstract markSelected(thumbnail: ThumbnailSeries): void

  abstract delete(thumbnailSeriesId: string): void

  abstract deleteBySeriesId(seriesId: string): void

  abstract deleteBySeriesIds(seriesIds: Iterable<string>): void
}
