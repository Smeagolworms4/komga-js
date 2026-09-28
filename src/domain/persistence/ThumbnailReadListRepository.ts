// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/ThumbnailReadListRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ThumbnailReadList } from '../model/ThumbnailReadList.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class ThumbnailReadListRepository {
  abstract findByIdOrNull(thumbnailId: string): ThumbnailReadList | null

  abstract findSelectedByReadListIdOrNull(readListId: string): ThumbnailReadList | null

  abstract findAllByReadListId(readListId: string): ThumbnailReadList[]

  abstract insert(thumbnail: ThumbnailReadList): void

  abstract update(thumbnail: ThumbnailReadList): void

  abstract markSelected(thumbnail: ThumbnailReadList): void

  abstract delete(thumbnailReadListId: string): void

  abstract deleteByReadListId(readListId: string): void

  abstract deleteByReadListIds(readListIds: Iterable<string>): void
}
