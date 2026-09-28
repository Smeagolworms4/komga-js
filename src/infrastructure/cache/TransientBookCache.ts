// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/cache/TransientBookCache.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LRUCache } from 'lru-cache'
import { TransientBook } from '../../domain/model/TransientBook.js'
import { TransientBookRepository } from '../../domain/persistence/TransientBookRepository.js'
import { associateBy } from '../../port/kotlin.js'
import { component } from '../../port/spring.js'

export class TransientBookCache extends TransientBookRepository {
  // PORT: Caffeine.newBuilder().expireAfterAccess(1, TimeUnit.HOURS) -> lru-cache sans limite de taille,
  // ttl d'une heure réarmé à chaque lecture (updateAgeOnGet) et à chaque écriture, purge automatique
  private readonly cache = new LRUCache<string, TransientBook>({
    ttl: 60 * 60 * 1000,
    updateAgeOnGet: true,
    ttlAutopurge: true,
  })

  findByIdOrNull(transientBookId: string): TransientBook | null {
    return this.cache.get(transientBookId) ?? null
  }

  // PORT: surcharges save(transientBook) / save(transientBooks: Collection) fusionnées
  save(transientBookOrBooks: TransientBook | Iterable<TransientBook>): void {
    if (transientBookOrBooks instanceof TransientBook) {
      const transientBook = transientBookOrBooks
      this.cache.set(transientBook.book.id, transientBook)
    } else {
      const transientBooks = transientBookOrBooks
      // PORT: cache.putAll(map)
      for (const [k, v] of associateBy(transientBooks, (it) => it.book.id)) this.cache.set(k, v)
    }
  }
}

// @Service
component(TransientBookCache, { types: [TransientBookRepository] })
