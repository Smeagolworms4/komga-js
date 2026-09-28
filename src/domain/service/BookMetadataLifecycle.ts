// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/BookMetadataLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Book } from '../model/Book.js'
import type { BookMetadataPatch, BookMetadataPatchCapability } from '../model/BookMetadataPatch.js'
import { BookWithMedia } from '../model/BookWithMedia.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { MetadataPatchTarget } from '../model/MetadataPatchTarget.js'
import { BookMetadataRepository } from '../persistence/BookMetadataRepository.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { MediaRepository } from '../persistence/MediaRepository.js'
import { BookMetadataProvider } from '../../infrastructure/metadata/BookMetadataProvider.js'
import { intersect, str } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { MetadataApplier } from './MetadataApplier.js'
import { ReadListLifecycle } from './ReadListLifecycle.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.BookMetadataLifecycle')

export class BookMetadataLifecycle {
  constructor(
    private readonly bookMetadataProviders: BookMetadataProvider[],
    private readonly metadataApplier: MetadataApplier,
    private readonly mediaRepository: MediaRepository,
    private readonly bookMetadataRepository: BookMetadataRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly readListLifecycle: ReadListLifecycle,
    private readonly eventPublisher: ApplicationEventPublisher,
  ) {}

  // PORT: async (BookMetadataProvider.getBookMetadataFromBook peut décoder des images avec sharp) ;
  // forEach -> for...of pour attendre chaque fournisseur dans l'ordre
  async refreshMetadata(book: Book, capabilities: ReadonlySet<BookMetadataPatchCapability>): Promise<void> {
    logger.info(() => `Refresh metadata for book: ${book} with capabilities: ${str(capabilities)}`)
    const media = this.mediaRepository.findById(book.id)

    const library = this.libraryRepository.findById(book.libraryId)
    let changed = false

    for (const provider of this.bookMetadataProviders) {
      if (intersect(capabilities, provider.capabilities).size === 0) logger.info(() => `Provider does not support requested capabilities, skipping: ${provider.constructor.name}`)
      else if (!(provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.BOOK) || provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.READLIST)))
        logger.info(() => `Library is not set to import book or read lists metadata for this provider, skipping: ${provider.constructor.name}`)
      else {
        logger.debug(() => `Provider: ${provider.constructor.name}`)
        let patch: BookMetadataPatch | null
        try {
          patch = await provider.getBookMetadataFromBook(new BookWithMedia({ book: book, media: media }))
        } catch (e) {
          logger.error(e as Error, () => `Error while getting metadata from ${provider.constructor.name} for book: ${book}`)
          patch = null
        }

        if (provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.BOOK)) {
          this.handlePatchForBookMetadata(patch, book)
          changed = true
        }

        if (provider.shouldLibraryHandlePatch(library, MetadataPatchTarget.READLIST)) {
          patch?.readLists?.forEach((readList) => {
            this.readListLifecycle.addBookToReadList(readList.name, book, readList.number)
          })
        }
      }
    }

    if (changed) this.eventPublisher.publishEvent(new DomainEvent.BookUpdated({ book: book }))
  }

  private handlePatchForBookMetadata(patch: BookMetadataPatch | null, book: Book): void {
    if (patch !== null) {
      const bPatch = patch
      const it = this.bookMetadataRepository.findById(book.id)
      logger.debug(() => `Apply metadata for book: ${book}`)

      logger.debug(() => `Original metadata: ${it}`)
      logger.debug(() => `Patch: ${bPatch}`)
      const patched = this.metadataApplier.apply(bPatch, it)
      logger.debug(() => `Patched metadata: ${patched}`)

      this.bookMetadataRepository.update(patched)
    }
  }
}

// @Service
component(BookMetadataLifecycle, {
  inject: [{ list: BookMetadataProvider }, MetadataApplier, MediaRepository, BookMetadataRepository, LibraryRepository, ReadListLifecycle, ApplicationEventPublisher],
})
