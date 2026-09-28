// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/SyncPointLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BookSearch } from '../model/BookSearch.js'
import type { KomgaUser } from '../model/KomgaUser.js'
import { Media } from '../model/Media.js'
import { MediaProfile } from '../model/MediaProfile.js'
import { SearchCondition } from '../model/SearchCondition.js'
import { SearchContext } from '../model/SearchContext.js'
import { SearchOperator } from '../model/SearchOperator.js'
import type { SyncPoint } from '../model/SyncPoint.js'
import { SyncPointRepository } from '../persistence/SyncPointRepository.js'
import type { Page, Pageable } from '../../port/spring-data.js'
import { component } from '../../port/spring.js'

export class SyncPointLifecycle {
  constructor(private readonly syncPointRepository: SyncPointRepository) {}

  createSyncPoint(user: KomgaUser, apiKeyId: string | null, libraryIds: string[] | null): SyncPoint {
    const context = new SearchContext(user)

    const syncPoint = this.syncPointRepository.create(
      apiKeyId,
      new BookSearch({
        condition: new SearchCondition.AllOfBook({
          conditions: ((): SearchCondition.Book[] => {
            const list: SearchCondition.Book[] = []
            if (libraryIds !== null) {
              list.push(
                new SearchCondition.AnyOfBook({
                  conditions: libraryIds.map((libraryId) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: libraryId }) })),
                }),
              )
            }
            list.push(new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }))
            list.push(new SearchCondition.MediaProfile({ operator: new SearchOperator.Is({ value: MediaProfile.EPUB }) }))
            list.push(new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }))
            return list
          })(),
        }),
      }),
      context,
    )

    this.syncPointRepository.addOnDeck(syncPoint.id, context, libraryIds)

    return syncPoint
  }

  /**
   * Retrieve a page of un-synced books and mark them as synced.
   */
  takeBooks(toSyncPointId: string, pageable: Pageable): Page<SyncPoint.Book> {
    const page = this.syncPointRepository.findBooksById(toSyncPointId, true, pageable)
    this.syncPointRepository.markBooksSynced(toSyncPointId, false, page.content.map((it) => it.bookId))
    return page
  }

  /**
   * Retrieve a page of un-synced added books and mark them as synced.
   */
  takeBooksAdded(fromSyncPointId: string, toSyncPointId: string, pageable: Pageable): Page<SyncPoint.Book> {
    const page = this.syncPointRepository.findBooksAdded(fromSyncPointId, toSyncPointId, true, pageable)
    this.syncPointRepository.markBooksSynced(toSyncPointId, false, page.content.map((it) => it.bookId))
    return page
  }

  /**
   * Retrieve a page of un-synced changed books and mark them as synced.
   */
  takeBooksChanged(fromSyncPointId: string, toSyncPointId: string, pageable: Pageable): Page<SyncPoint.Book> {
    const page = this.syncPointRepository.findBooksChanged(fromSyncPointId, toSyncPointId, true, pageable)
    this.syncPointRepository.markBooksSynced(toSyncPointId, false, page.content.map((it) => it.bookId))
    return page
  }

  /**
   * Retrieve a page of un-synced removed books and mark them as synced.
   */
  takeBooksRemoved(fromSyncPointId: string, toSyncPointId: string, pageable: Pageable): Page<SyncPoint.Book> {
    const page = this.syncPointRepository.findBooksRemoved(fromSyncPointId, toSyncPointId, true, pageable)
    this.syncPointRepository.markBooksSynced(toSyncPointId, true, page.content.map((it) => it.bookId))
    return page
  }

  /**
   * Retrieve a page of un-synced unchanged books with changed read progress and mark them as synced.
   */
  takeBooksReadProgressChanged(fromSyncPointId: string, toSyncPointId: string, pageable: Pageable): Page<SyncPoint.Book> {
    const page = this.syncPointRepository.findBooksReadProgressChanged(fromSyncPointId, toSyncPointId, true, pageable)
    this.syncPointRepository.markBooksSynced(toSyncPointId, false, page.content.map((it) => it.bookId))
    return page
  }

  takeReadLists(toSyncPointId: string, pageable: Pageable): Page<SyncPoint.ReadList> {
    const page = this.syncPointRepository.findReadListsById(toSyncPointId, true, pageable)
    this.syncPointRepository.markReadListsSynced(toSyncPointId, false, page.content.map((it) => it.readListId))
    return page
  }

  takeReadListsAdded(fromSyncPointId: string, toSyncPointId: string, pageable: Pageable): Page<SyncPoint.ReadList> {
    const page = this.syncPointRepository.findReadListsAdded(fromSyncPointId, toSyncPointId, true, pageable)
    this.syncPointRepository.markReadListsSynced(toSyncPointId, false, page.content.map((it) => it.readListId))
    return page
  }

  takeReadListsChanged(fromSyncPointId: string, toSyncPointId: string, pageable: Pageable): Page<SyncPoint.ReadList> {
    const page = this.syncPointRepository.findReadListsChanged(fromSyncPointId, toSyncPointId, true, pageable)
    this.syncPointRepository.markReadListsSynced(toSyncPointId, false, page.content.map((it) => it.readListId))
    return page
  }

  takeReadListsRemoved(fromSyncPointId: string, toSyncPointId: string, pageable: Pageable): Page<SyncPoint.ReadList> {
    const page = this.syncPointRepository.findReadListsRemoved(fromSyncPointId, toSyncPointId, true, pageable)
    this.syncPointRepository.markReadListsSynced(toSyncPointId, true, page.content.map((it) => it.readListId))
    return page
  }
}

// @Component
component(SyncPointLifecycle, { inject: [SyncPointRepository] })
