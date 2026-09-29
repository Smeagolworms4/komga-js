// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/search/SearchIndexLifecycleOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../src/domain/model/Book.js'
import { DomainEvent } from '../../../../src/domain/model/DomainEvent.js'
import { Library } from '../../../../src/domain/model/Library.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { Series } from '../../../../src/domain/model/Series.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import type { ReadListRepository } from '../../../../src/domain/persistence/ReadListRepository.js'
import type { SeriesCollectionRepository } from '../../../../src/domain/persistence/SeriesCollectionRepository.js'
import { LuceneEntity } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { SearchIndexLifecycle } from '../../../../src/infrastructure/search/SearchIndexLifecycle.js'
import type { BookDtoRepository } from '../../../../src/interfaces/api/persistence/BookDtoRepository.js'
import type { SeriesDtoRepository } from '../../../../src/interfaces/api/persistence/SeriesDtoRepository.js'
import type { BookDto } from '../../../../src/interfaces/api/rest/dto/BookDto.js'
import type { SeriesDto } from '../../../../src/interfaces/api/rest/dto/SeriesDto.js'
import { URL } from '../../../../src/port/java-net.js'
import { PageImpl, type Pageable } from '../../../../src/port/spring-data.js'
import { exceptionType, oracle } from '../../oracle.js'
import { Index, books as allBooks, collections as allCollections, readLists as allReadLists, series as allSeries } from './searchSamples.js'

const { func, kase } = oracle('infrastructure/search/SearchIndexLifecycle')

const page = <T>(list: T[], p: Pageable) => new PageImpl(list.slice(p.offset, p.offset + p.pageSize), p, list.length)

/** Dépôts appuyés sur des listes modifiables, vrai LuceneHelper sur un index en mémoire */
class Env {
  books = [...allBooks]
  series = [...allSeries]
  collections = [...allCollections]
  readLists = [...allReadLists]
  readonly index = new Index()
  readonly lifecycle = new SearchIndexLifecycle(
    {
      findAll: (_: unknown, p: Pageable) => page(this.collections, p),
      findByIdOrNull: (id: string) => this.collections.find((it) => it.id === id) ?? null,
    } as unknown as SeriesCollectionRepository,
    {
      findAll: (_: unknown, p: Pageable) => page(this.readLists, p),
      findByIdOrNull: (id: string) => this.readLists.find((it) => it.id === id) ?? null,
    } as unknown as ReadListRepository,
    {
      findAll: (p: Pageable) => page(this.books, p),
      findByIdOrNull: (id: string) => this.books.find((it) => it.id === id) ?? null,
    } as unknown as BookDtoRepository,
    {
      findAll: (p: Pageable) => page(this.series, p),
      findByIdOrNull: (id: string) => this.series.find((it) => it.id === id) ?? null,
    } as unknown as SeriesDtoRepository,
    this.index.helper,
  )

  state(): unknown[] {
    return [this.index.helper.getIndexVersion(), this.index.searchAll()]
  }

  stateSorted(): unknown[] {
    return [this.index.helper.getIndexVersion(), this.index.searchAllSorted()]
  }
}

function env<R>(block: (e: Env) => R): R {
  return block(new Env())
}

const date = LocalDateTime.of(2020, 1, 1, 0, 0)

const book = (id: string) => new Book({ name: 'b', url: new URL(`file:/komga/${id}.cbz`), fileLastModified: date, id, createdDate: date })
const series = (id: string) => new Series({ name: 's', url: new URL(`file:/komga/${id}`), fileLastModified: date, id, createdDate: date })
const collection = (id: string) => new SeriesCollection({ name: 'c', id, createdDate: date })
const readList = (id: string) => new ReadList({ name: 'r', id, createdDate: date })

const renamedBook = (b: BookDto) => b.copy({ metadata: b.metadata.copy({ title: `Renamed ${b.metadata.title}` }) })
const renamedSeries = (s: SeriesDto) => s.copy({ metadata: s.metadata.copy({ title: `Renamed ${s.metadata.title}` }) })

func('upgradeIndex', () => {
  kase('empty index', () => env((e) => exceptionType(() => e.lifecycle.upgradeIndex())))
  kase('after rebuild', () =>
    env(async (e) => {
      await e.lifecycle.rebuildIndex()
      return [await exceptionType(() => e.lifecycle.upgradeIndex()), e.state()]
    }),
  )
})

func('rebuildIndex@40', () => {
  kase('all entities', () =>
    env(async (e) => {
      await e.lifecycle.rebuildIndex()
      return e.state()
    }),
  )
  for (const entity of LuceneEntity.entries()) {
    kase(`only ${entity}`, () =>
      env(async (e) => {
        await e.lifecycle.rebuildIndex(new Set([entity]))
        return e.state()
      }),
    )
  }
  kase('no entity', () =>
    env(async (e) => {
      await e.lifecycle.rebuildIndex(new Set())
      return e.state()
    }),
  )
  kase('twice', () =>
    env(async (e) => {
      await e.lifecycle.rebuildIndex()
      await e.lifecycle.rebuildIndex()
      return e.stateSorted()
    }),
  )
  kase('empty repositories', () =>
    env(async (e) => {
      e.books = []
      e.series = []
      e.collections = []
      e.readLists = []
      await e.lifecycle.rebuildIndex()
      return e.state()
    }),
  )
})

// privée : reconstruction d'une entité, sur plus d'une page de 5000 entités
func('rebuildIndex@57', () => {
  kase('5001 collections', () =>
    env(async (e) => {
      e.collections = Array.from({ length: 5001 }, (_, i) => new SeriesCollection({ name: `collection ${i + 1}`, id: `C${i + 1}`, createdDate: date }))
      await e.lifecycle.rebuildIndex(new Set([LuceneEntity.Collection]))
      return [
        e.index.helper.searchEntitiesIds('collection', LuceneEntity.Collection)?.length ?? null,
        e.index.helper.searchEntitiesIds('5001', LuceneEntity.Collection),
        e.index.helper.searchEntitiesIds('"collection 1"', LuceneEntity.Collection)?.length ?? null,
      ]
    }),
  )
  kase('previous documents of the entity are deleted', () =>
    env(async (e) => {
      await e.lifecycle.rebuildIndex()
      e.readLists.splice(0, 1)
      e.books.splice(0, 1)
      await e.lifecycle.rebuildIndex(new Set([LuceneEntity.ReadList]))
      return e.stateSorted()
    }),
  )
})

func('consumeEvents', () => {
  const events: [string, DomainEvent][] = [
    ['SeriesAdded S1', new DomainEvent.SeriesAdded({ series: series('S1') })],
    ['SeriesAdded unknown', new DomainEvent.SeriesAdded({ series: series('X') })],
    ['SeriesUpdated S2', new DomainEvent.SeriesUpdated({ series: series('S2') })],
    ['SeriesUpdated unknown', new DomainEvent.SeriesUpdated({ series: series('X') })],
    ['SeriesDeleted S1', new DomainEvent.SeriesDeleted({ series: series('S1') })],
    ['BookAdded B1', new DomainEvent.BookAdded({ book: book('B1') })],
    ['BookAdded oneshot B5', new DomainEvent.BookAdded({ book: book('B5') })],
    ['BookAdded unknown', new DomainEvent.BookAdded({ book: book('X') })],
    ['BookUpdated B2', new DomainEvent.BookUpdated({ book: book('B2') })],
    ['BookUpdated oneshot B5', new DomainEvent.BookUpdated({ book: book('B5') })],
    ['BookDeleted B1', new DomainEvent.BookDeleted({ book: book('B1') })],
    ['ReadListAdded R1', new DomainEvent.ReadListAdded({ readList: readList('R1') })],
    ['ReadListUpdated R2', new DomainEvent.ReadListUpdated({ readList: readList('R2') })],
    ['ReadListUpdated unknown', new DomainEvent.ReadListUpdated({ readList: readList('X') })],
    ['ReadListDeleted R1', new DomainEvent.ReadListDeleted({ readList: readList('R1') })],
    ['CollectionAdded C1', new DomainEvent.CollectionAdded({ collection: collection('C1') })],
    ['CollectionUpdated C2', new DomainEvent.CollectionUpdated({ collection: collection('C2') })],
    ['CollectionDeleted C1', new DomainEvent.CollectionDeleted({ collection: collection('C1') })],
    ['other event', new DomainEvent.LibraryAdded({ library: new Library({ name: 'l', root: new URL('file:/komga/l'), id: 'L', createdDate: date }) })],
  ]
  for (const [label, event] of events) {
    kase(`${label} on empty index`, () =>
      env((e) => {
        e.lifecycle.consumeEvents(event)
        return e.state()
      }),
    )
    kase(`${label} on rebuilt index, entities renamed`, () =>
      env(async (e) => {
        await e.lifecycle.rebuildIndex()
        e.books = e.books.map(renamedBook)
        e.series = e.series.map(renamedSeries)
        e.collections = e.collections.map((c) => c.copy({ name: `Renamed ${c.name}` }))
        e.readLists = e.readLists.map((r) => r.copy({ name: `Renamed ${r.name}` }))
        e.lifecycle.consumeEvents(event)
        return e.stateSorted()
      }),
    )
  }
})

// privée : un livre one-shot reçoit les champs de sa série
func('bookToDocument', () => {
  kase('oneshot book with its series', () =>
    env((e) => {
      e.lifecycle.consumeEvents(new DomainEvent.BookAdded({ book: book('B5') }))
      return e.index.searchAll([LuceneEntity.Book])
    }),
  )
  kase('oneshot book without its series', () =>
    env((e) => {
      e.series = e.series.filter((it) => it.id !== 'S5')
      return exceptionType(() => e.lifecycle.consumeEvents(new DomainEvent.BookAdded({ book: book('B5') })))
    }),
  )
  kase('rebuild with a oneshot book without its series', () =>
    env((e) => {
      e.series = e.series.filter((it) => it.id !== 'S5')
      return exceptionType(() => e.lifecycle.rebuildIndex(new Set([LuceneEntity.Book])))
    }),
  )
})

// privées : appelées par consumeEvents
func('addEntity', () => {
  kase('same book added twice', () =>
    env((e) => {
      e.lifecycle.consumeEvents(new DomainEvent.BookAdded({ book: book('B1') }))
      e.lifecycle.consumeEvents(new DomainEvent.BookAdded({ book: book('B1') }))
      return e.index.searchAll([LuceneEntity.Book])
    }),
  )
})

func('updateEntity', () => {
  kase('update of a missing document adds it', () =>
    env((e) => {
      e.lifecycle.consumeEvents(new DomainEvent.CollectionUpdated({ collection: collection('C3') }))
      return e.index.searchAll([LuceneEntity.Collection])
    }),
  )
})

func('deleteEntity', () => {
  kase('delete of every entity type', () =>
    env(async (e) => {
      await e.lifecycle.rebuildIndex()
      e.lifecycle.consumeEvents(new DomainEvent.BookDeleted({ book: book('B2') }))
      e.lifecycle.consumeEvents(new DomainEvent.SeriesDeleted({ series: series('S2') }))
      e.lifecycle.consumeEvents(new DomainEvent.CollectionDeleted({ collection: collection('C2') }))
      e.lifecycle.consumeEvents(new DomainEvent.ReadListDeleted({ readList: readList('R2') }))
      return e.stateSorted()
    }),
  )
})
