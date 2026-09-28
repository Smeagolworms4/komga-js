// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/PageHashRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookPageNumbered } from '../model/BookPageNumbered.js'
import type { PageHashKnown } from '../model/PageHashKnown.js'
import type { PageHashMatch } from '../model/PageHashMatch.js'
import type { PageHashUnknown } from '../model/PageHashUnknown.js'
import type { Page, Pageable } from '../../port/spring-data.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class PageHashRepository {
  abstract findKnown(pageHash: string): PageHashKnown | null

  abstract findAllKnown(actions: PageHashKnown.Action[] | null, pageable: Pageable): Page<PageHashKnown>

  abstract findAllUnknown(pageable: Pageable): Page<PageHashUnknown>

  abstract findMatchesByHash(pageHash: string, pageable: Pageable): Page<PageHashMatch>

  abstract findMatchesByKnownHashAction(actions: PageHashKnown.Action[] | null, libraryId: string | null): Map<string, BookPageNumbered[]>

  abstract getKnownThumbnail(pageHash: string): Uint8Array | null

  abstract insert(pageHash: PageHashKnown, thumbnail: Uint8Array | null): void

  abstract update(pageHash: PageHashKnown): void
}
