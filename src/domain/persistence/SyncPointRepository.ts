// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/SyncPointRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookSearch } from '../model/BookSearch.js'
import type { SearchContext } from '../model/SearchContext.js'
import type { SyncPoint } from '../model/SyncPoint.js'
import type { Page, Pageable } from '../../port/spring-data.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class SyncPointRepository {
  abstract create(apiKeyId: string | null, search: BookSearch, context: SearchContext): SyncPoint

  abstract addOnDeck(syncPointId: string, context: SearchContext, filterOnLibraryIds: string[] | null): void

  abstract findByIdOrNull(syncPointId: string): SyncPoint | null

  abstract findBooksById(syncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book>

  abstract findBooksAdded(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book>

  abstract findBooksRemoved(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book>

  abstract findBooksChanged(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book>

  abstract findBooksReadProgressChanged(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book>

  abstract findReadListsById(syncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.ReadList>

  abstract findReadListsAdded(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.ReadList>

  abstract findReadListsChanged(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.ReadList>

  abstract findReadListsRemoved(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.ReadList>

  abstract findBookIdsByReadListIds(syncPointId: string, readListIds: Iterable<string>): SyncPoint.ReadList.Book[]

  abstract markBooksSynced(syncPointId: string, forRemovedBooks: boolean, bookIds: Iterable<string>): void

  abstract markReadListsSynced(syncPointId: string, forRemovedReadLists: boolean, readListIds: Iterable<string>): void

  abstract deleteByUserId(userId: string): void

  abstract deleteByUserIdAndApiKeyIds(userId: string, apiKeyIds: Iterable<string>): void

  abstract deleteOne(syncPointId: string): void

  abstract deleteAll(): void
}
