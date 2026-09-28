// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/ReadListLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Book } from '../model/Book.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { DuplicateNameException } from '../model/Exceptions.js'
import { ReadList } from '../model/ReadList.js'
import type { ReadListRequestMatch } from '../model/ReadListRequest.js'
import { SearchContext } from '../model/SearchContext.js'
import { ThumbnailReadList } from '../model/ThumbnailReadList.js'
import { ReadListRepository } from '../persistence/ReadListRepository.js'
import { ThumbnailReadListRepository } from '../persistence/ThumbnailReadListRepository.js'
import { MosaicGenerator } from '../../infrastructure/image/MosaicGenerator.js'
import { ReadListProvider } from '../../infrastructure/metadata/comicrack/ReadListProvider.js'
import { sortedMapOf, toSortedMap } from '../../port/extra-metadata.js'
import { IllegalArgumentException, equalsIgnoreCase, first, last, nn } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { TransactionTemplate } from '../../port/spring-tx.js'
import { BookLifecycle } from './BookLifecycle.js'
import { ReadListMatcher } from './ReadListMatcher.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.ReadListLifecycle')

export class ReadListLifecycle {
  constructor(
    private readonly readListRepository: ReadListRepository,
    private readonly thumbnailReadListRepository: ThumbnailReadListRepository,
    private readonly bookLifecycle: BookLifecycle,
    private readonly mosaicGenerator: MosaicGenerator,
    private readonly readListMatcher: ReadListMatcher,
    private readonly readListProvider: ReadListProvider,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly transactionTemplate: TransactionTemplate,
  ) {}

  // @Throws(DuplicateNameException)
  // @Transactional
  // PORT: @Transactional -> transactionTemplate.execute
  addReadList(readList: ReadList): ReadList {
    return this.transactionTemplate.execute(() => {
      logger.info(() => `Adding new read list: ${readList}`)

      if (this.readListRepository.existsByName(readList.name)) throw new DuplicateNameException('Read list name already exists')

      this.readListRepository.insert(readList)

      this.eventPublisher.publishEvent(new DomainEvent.ReadListAdded({ readList: readList }))

      return nn(this.readListRepository.findByIdOrNull(readList.id, SearchContext.empty()))
    })
  }

  // @Transactional
  // PORT: @Transactional -> transactionTemplate.execute
  updateReadList(toUpdate: ReadList): void {
    this.transactionTemplate.execute(() => {
      logger.info(() => `Update read list: ${toUpdate}`)
      const existing = this.readListRepository.findByIdOrNull(toUpdate.id, SearchContext.empty())
      if (existing === null) throw new IllegalArgumentException('Cannot update read list that does not exist')

      if (!equalsIgnoreCase(existing.name, toUpdate.name) && this.readListRepository.existsByName(toUpdate.name)) throw new DuplicateNameException('Read list name already exists')

      this.readListRepository.update(toUpdate)

      this.eventPublisher.publishEvent(new DomainEvent.ReadListUpdated({ readList: toUpdate }))
    })
  }

  deleteReadList(readList: ReadList): void {
    this.transactionTemplate.executeWithoutResult(() => {
      this.thumbnailReadListRepository.deleteByReadListId(readList.id)
      this.readListRepository.delete(readList.id)
    })

    this.eventPublisher.publishEvent(new DomainEvent.ReadListDeleted({ readList: readList }))
  }

  /**
   * Add book to read list by name.
   * Read list will be created if it doesn't exist.
   */
  // @Transactional
  // PORT: @Transactional -> transactionTemplate.execute
  addBookToReadList(readListName: string, book: Book, numberInList: number | null): void {
    this.transactionTemplate.execute(() => {
      const existing = this.readListRepository.findByNameOrNull(readListName)
      if (existing !== null) {
        if ([...existing.bookIds.values()].includes(book.id)) {
          logger.debug(() => `Book is already in existing read list '${existing.name}'`)
        } else {
          const map = toSortedMap(existing.bookIds)
          let key: number
          if (numberInList !== null && existing.bookIds.has(numberInList)) {
            logger.debug(() => `Existing read list '${existing.name}' already contains a book at position ${numberInList}, adding book '${book.name}' at the end`)
            key = last([...existing.bookIds.keys()]) + 1
          } else {
            logger.debug(() => `Adding book '${book.name}' to existing read list '${existing.name}'`)
            key = numberInList ?? last([...existing.bookIds.keys()]) + 1
          }
          map.set(key, book.id)
          this.updateReadList(existing.copy({ bookIds: map }))
        }
      } else {
        logger.debug(() => `Adding book '${book.name}' to new read list '${readListName}'`)
        this.addReadList(
          new ReadList({
            name: readListName,
            bookIds: sortedMapOf([numberInList ?? 0, book.id]),
          }),
        )
      }
    })
  }

  deleteEmptyReadLists(): void {
    logger.info(() => 'Deleting empty read lists')
    const toDelete = this.readListRepository.findAllEmpty()
    this.transactionTemplate.executeWithoutResult(() => {
      this.thumbnailReadListRepository.deleteByReadListIds(toDelete.map((it) => it.id))
      this.readListRepository.delete(toDelete.map((it) => it.id))
    })

    toDelete.forEach((it) => this.eventPublisher.publishEvent(new DomainEvent.ReadListDeleted({ readList: it })))
  }

  addThumbnail(thumbnail: ThumbnailReadList): ThumbnailReadList {
    switch (thumbnail.type) {
      case ThumbnailReadList.Type.USER_UPLOADED: {
        this.thumbnailReadListRepository.insert(thumbnail)
        if (thumbnail.selected) {
          this.thumbnailReadListRepository.markSelected(thumbnail)
        }
      }
    }

    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailReadListAdded({ thumbnail: thumbnail }))
    return thumbnail
  }

  markSelectedThumbnail(thumbnail: ThumbnailReadList): void {
    this.thumbnailReadListRepository.markSelected(thumbnail)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailReadListAdded({ thumbnail: thumbnail.copy({ selected: true }) }))
  }

  deleteThumbnail(thumbnail: ThumbnailReadList): void {
    this.thumbnailReadListRepository.delete(thumbnail.id)
    this.thumbnailsHouseKeeping(thumbnail.readListId)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailReadListDeleted({ thumbnail: thumbnail }))
  }

  // PORT: async (BookLifecycle.getThumbnailBytes et MosaicGenerator.createMosaic utilisent sharp)
  async getThumbnailBytes(readList: ReadList): Promise<Uint8Array> {
    const selected = this.thumbnailReadListRepository.findSelectedByReadListIdOrNull(readList.id)
    if (selected !== null) {
      return selected.thumbnail
    }

    // UPSTREAM-BUG: boucle infinie si la liste de lecture ne contient aucun livre
    const ids = ((): string[] => {
      const list: string[] = []
      while (list.length < 4) {
        list.push(...[...readList.bookIds.values()].slice(0, 4))
      }
      return list.slice(0, 4)
    })()

    const images: Uint8Array[] = []
    for (const it of ids) {
      const bytes = (await this.bookLifecycle.getThumbnailBytes(it))?.bytes
      if (bytes !== undefined && bytes !== null) images.push(bytes)
    }
    return await this.mosaicGenerator.createMosaic(images)
  }

  matchComicRackList(fileContent: Uint8Array): ReadListRequestMatch {
    const request = this.readListProvider.importFromCbl(fileContent)

    return this.readListMatcher.matchReadListRequest(request)
  }

  private thumbnailsHouseKeeping(readListId: string): void {
    logger.info(() => `House keeping thumbnails for read list: ${readListId}`)
    const all = this.thumbnailReadListRepository.findAllByReadListId(readListId)

    const selected = all.filter((it) => it.selected)
    if (selected.length > 1) {
      logger.info(() => 'More than one thumbnail is selected, removing extra ones')
      this.thumbnailReadListRepository.markSelected(nn(selected[0]))
    } else if (selected.length === 0 && all.length > 0) {
      logger.info(() => 'Read list has no selected thumbnail, choosing one automatically')
      this.thumbnailReadListRepository.markSelected(first(all))
    }
  }
}

// @Service
component(ReadListLifecycle, {
  inject: [ReadListRepository, ThumbnailReadListRepository, BookLifecycle, MosaicGenerator, ReadListMatcher, ReadListProvider, ApplicationEventPublisher, TransactionTemplate],
})
