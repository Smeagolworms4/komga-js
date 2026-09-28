// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/PageHashLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookPageNumbered } from '../model/BookPageNumbered.js'
import type { Library } from '../model/Library.js'
import { MediaType } from '../model/MediaType.js'
import { PageHashKnown } from '../model/PageHashKnown.js'
import type { TypedBytes } from '../model/TypedBytes.js'
import { BookRepository } from '../persistence/BookRepository.js'
import { MediaRepository } from '../persistence/MediaRepository.js'
import { PageHashRepository } from '../persistence/PageHashRepository.js'
import { KomgaProperties } from '../../infrastructure/configuration/KomgaProperties.js'
import { firstOrNull } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { Pageable } from '../../port/spring-data.js'
import { component } from '../../port/spring.js'
import { BookLifecycle } from './BookLifecycle.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.PageHashLifecycle')

export class PageHashLifecycle {
  constructor(
    private readonly pageHashRepository: PageHashRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly bookLifecycle: BookLifecycle,
    private readonly bookRepository: BookRepository,
    private readonly komgaProperties: KomgaProperties,
  ) {}

  private readonly hashableMediaTypes = [MediaType.ZIP.type]

  getBookIdsWithMissingPageHash(library: Library): string[] {
    if (library.hashPages) {
      const it = this.mediaRepository.findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(library.id, this.hashableMediaTypes, this.komgaProperties.pageHashing)
      logger.info(() => `Found ${it.length} books with missing page hash`)
      return it
    } else {
      logger.info(() => 'Page hashing is not enabled, skipping')
      return []
    }
  }

  // PORT: async (BookLifecycle.getBookPage lit le fichier et convertit l'image avec sharp)
  async getPage(pageHash: string, { resizeTo = null }: { resizeTo?: number | null } = {}): Promise<TypedBytes | null> {
    const match = firstOrNull(this.pageHashRepository.findMatchesByHash(pageHash, Pageable.ofSize(1)).content)
    if (match === null) return null
    const book = this.bookRepository.findByIdOrNull(match.bookId)
    if (book === null) return null

    return await this.bookLifecycle.getBookPage(book, match.pageNumber, { resizeTo: resizeTo })
  }

  getBookPagesToDeleteAutomatically(library: Library): Map<string, BookPageNumbered[]> {
    return this.pageHashRepository.findMatchesByKnownHashAction([PageHashKnown.Action.DELETE_AUTO], library.id)
  }

  // PORT: async (getPage)
  async createOrUpdate(pageHash: PageHashKnown): Promise<void> {
    const existing = this.pageHashRepository.findKnown(pageHash.hash)
    if (existing === null) {
      this.pageHashRepository.insert(pageHash, (await this.getPage(pageHash.hash, { resizeTo: 500 }))?.bytes ?? null)
    } else {
      this.pageHashRepository.update(existing.copy({ action: pageHash.action }))
    }
  }
}

// @Service
component(PageHashLifecycle, { inject: [PageHashRepository, MediaRepository, BookLifecycle, BookRepository, KomgaProperties] })
