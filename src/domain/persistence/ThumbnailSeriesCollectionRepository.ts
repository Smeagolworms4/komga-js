// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/ThumbnailSeriesCollectionRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ThumbnailSeriesCollection } from '../model/ThumbnailSeriesCollection.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class ThumbnailSeriesCollectionRepository {
  abstract findByIdOrNull(thumbnailId: string): ThumbnailSeriesCollection | null

  abstract findSelectedByCollectionIdOrNull(collectionId: string): ThumbnailSeriesCollection | null

  abstract findAllByCollectionId(collectionId: string): ThumbnailSeriesCollection[]

  abstract insert(thumbnail: ThumbnailSeriesCollection): void

  abstract update(thumbnail: ThumbnailSeriesCollection): void

  abstract markSelected(thumbnail: ThumbnailSeriesCollection): void

  abstract delete(thumbnailCollectionId: string): void

  abstract deleteByCollectionId(collectionId: string): void

  abstract deleteByCollectionIds(collectionIds: Iterable<string>): void
}
