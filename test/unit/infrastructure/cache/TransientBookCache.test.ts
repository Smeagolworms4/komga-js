// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/cache/TransientBookCacheOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../src/domain/model/Book.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { TransientBook } from '../../../../src/domain/model/TransientBook.js'
import { TransientBookCache } from '../../../../src/infrastructure/cache/TransientBookCache.js'
import { URL } from '../../../../src/port/java-net.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/cache/TransientBookCache')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)

const tb = (id: string, name = `book ${id}`, number: number | null = null) =>
  new TransientBook({
    book: new Book({ name, url: new URL(`file:/tmp/${id}.cbz`), fileLastModified: date, id, createdDate: date }),
    media: new Media({ bookId: id, createdDate: date }),
    metadata: new TransientBook.Metadata({ number, seriesId: null }),
  })

const cache = new TransientBookCache()
func('findByIdOrNull', () => {
  kase('empty cache', () => cache.findByIdOrNull('A'))
  kase('empty id', () => cache.findByIdOrNull(''))
})
func('save@19', () => {
  kase('single', () => {
    cache.save(tb('A'))
    return cache.findByIdOrNull('A')
  })
  kase('same instance returned', () => {
    const b = tb('S')
    cache.save(b)
    return cache.findByIdOrNull('S') === b
  })
  kase('overwrite', () => {
    cache.save(tb('A', 'second', 2.5))
    return cache.findByIdOrNull('A')?.book?.name ?? null
  })
  kase('empty id', () => {
    cache.save(tb(''))
    return cache.findByIdOrNull('')?.book?.name ?? null
  })
})
func('save@23', () => {
  kase('empty collection', () => {
    cache.save([])
    return cache.findByIdOrNull('B')
  })
  kase('several', () => {
    cache.save([tb('B'), tb('C', 'c', 1)])
    return [cache.findByIdOrNull('B')?.book?.name ?? null, cache.findByIdOrNull('C')?.metadata?.number ?? null, cache.findByIdOrNull('A')?.book?.name ?? null]
  })
  kase('duplicate ids, last wins', () => {
    cache.save([tb('D', 'first'), tb('D', 'last')])
    return cache.findByIdOrNull('D')?.book?.name ?? null
  })
  kase('set of books', () => {
    cache.save(new Set([tb('E'), tb('F')]))
    return ['E', 'F', 'G'].map((it) => cache.findByIdOrNull(it) !== null)
  })
})
func('findByIdOrNull', () => {
  kase('case sensitive', () => cache.findByIdOrNull('a'))
  kase('existing', () => cache.findByIdOrNull('C')?.book?.id ?? null)
})
