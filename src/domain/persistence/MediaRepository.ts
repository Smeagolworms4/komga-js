// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/MediaRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Media } from '../model/Media.js'
import type { MediaExtension } from '../model/MediaExtension.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class MediaRepository {
  abstract findById(bookId: string): Media

  abstract findByIdOrNull(bookId: string): Media | null

  abstract findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(
    libraryId: string,
    mediaTypes: Iterable<string>,
    pageHashing: number,
  ): string[]

  abstract getPagesSizes(bookIds: Iterable<string>): [string, number][]

  abstract findExtensionByIdOrNull(bookId: string): MediaExtension | null

  // PORT: surcharges insert(media: Media) / insert(medias: Collection<Media>) fusionnées
  abstract insert(mediaOrMedias: Media | Iterable<Media>): void

  abstract update(media: Media): void

  /**
   * Performs a full copy of a Media, including MediaExtension, pages, and files.
   */
  abstract copy(fromBookId: string, toBookId: string): void

  // PORT: surcharges delete(bookId: String) / delete(bookIds: Collection<String>) fusionnées
  abstract delete(bookIdOrIds: string | Iterable<string>): void

  abstract count(): number
}
