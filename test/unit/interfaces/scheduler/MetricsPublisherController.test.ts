// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/scheduler/MetricsPublisherControllerOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../src/domain/model/Book.js'
import { DomainEvent } from '../../../../src/domain/model/DomainEvent.js'
import { Library } from '../../../../src/domain/model/Library.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import { MetricsPublisherController } from '../../../../src/interfaces/scheduler/MetricsPublisherController.js'
import { URL } from '../../../../src/port/java-net.js'
import { Gauge, SimpleMeterRegistry } from '../../../../src/port/micrometer.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { setup } from '../data.js'

const { func, kase } = oracle('interfaces/scheduler/MetricsPublisherController')

const db = new OracleDb()
const registry = new SimpleMeterRegistry()
const controller = new MetricsPublisherController(db.libraryDao, db.bookDao, db.seriesDao, db.seriesCollectionDao, db.readListDao, db.sidecarDao, registry)

function meters(): unknown[][] {
  return registry
    .getMeters()
    .map((it) => {
      const tags = [...it.id.tags].map((t) => `${t.key}=${t.value}`).join(',')
      return [`${it.id.name}{${tags}}`, it.id.type, it.id.description, it.id.baseUnit, it instanceof Gauge ? it.value() : null]
    })
    .sort((a, b) => ((a[0] as string) < (b[0] as string) ? -1 : (a[0] as string) > (b[0] as string) ? 1 : 0))
}

// PORT: méthodes privées appelées par réflexion côté Kotlin
const call = (name: string, arg: unknown): void => {
  ;(controller as unknown as Record<string, (a: unknown) => void>)[name]!.call(controller, arg)
}

const library = new Library({ name: 'X', root: new URL('file:/x'), id: 'LX' })
const date = LocalDateTime.of(2020, 1, 1, 0, 0)

func('pushAllMetrics', () => {
  kase('after init', () => meters())
  kase('empty database', () => {
    controller.pushAllMetrics()
    return meters()
  })
  kase('with data', () => {
    setup(db)
    controller.pushAllMetrics()
    return meters()
  })
})

func('pushMetricsOnEvent', () => {
  kase('library added', () => {
    call('pushMetricsOnEvent', new DomainEvent.LibraryAdded({ library }))
    return meters()
  })
  kase('collection added twice, read list added', () => {
    call('pushMetricsOnEvent', new DomainEvent.CollectionAdded({ collection: new SeriesCollection({ name: 'c' }) }))
    call('pushMetricsOnEvent', new DomainEvent.CollectionAdded({ collection: new SeriesCollection({ name: 'c' }) }))
    call('pushMetricsOnEvent', new DomainEvent.ReadListAdded({ readList: new ReadList({ name: 'r' }) }))
    return meters()
  })
  kase('deleted', () => {
    call('pushMetricsOnEvent', new DomainEvent.CollectionDeleted({ collection: new SeriesCollection({ name: 'c' }) }))
    call('pushMetricsOnEvent', new DomainEvent.ReadListDeleted({ readList: new ReadList({ name: 'r' }) }))
    call('pushMetricsOnEvent', new DomainEvent.ReadListDeleted({ readList: new ReadList({ name: 'r' }) }))
    return meters()
  })
  kase('book added then library scanned', () => {
    db.bookDao.insert(
      new Book({ name: 'b7', url: new URL('file:/data/manga%20co/One%20Piece/b7.cbz'), fileLastModified: date, fileSize: 5, id: 'B7', seriesId: 'S2', libraryId: 'L2', createdDate: date }),
    )
    call('pushMetricsOnEvent', new DomainEvent.LibraryScanned({ library }))
    return meters()
  })
  kase('library deleted', () => {
    call('pushMetricsOnEvent', new DomainEvent.LibraryDeleted({ library }))
    return meters()
  })
  kase('other event', () => {
    call('pushMetricsOnEvent', new DomainEvent.BookAdded({ book: new Book({ name: 'b', url: new URL('file:/b'), fileLastModified: date }) }))
    return meters()
  })
})

func('pushMetricsCount', () => {
  for (const e of ['libraries', 'series', 'books', 'books.filesize', 'collections', 'readlists', 'sidecars', 'unknown'])
    kase(e, () => {
      call('pushMetricsCount', e)
      return meters()
    })
})
