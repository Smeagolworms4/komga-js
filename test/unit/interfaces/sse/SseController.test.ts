// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/sse/SseControllerOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Task } from '../../../../src/application/tasks/Task.js'
import { Book } from '../../../../src/domain/model/Book.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { DomainEvent } from '../../../../src/domain/model/DomainEvent.js'
import { Library } from '../../../../src/domain/model/Library.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { Series } from '../../../../src/domain/model/Series.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { ThumbnailReadList } from '../../../../src/domain/model/ThumbnailReadList.js'
import { ThumbnailSeries } from '../../../../src/domain/model/ThumbnailSeries.js'
import { ThumbnailSeriesCollection } from '../../../../src/domain/model/ThumbnailSeriesCollection.js'
import { KomgaPrincipal } from '../../../../src/infrastructure/security/KomgaPrincipal.js'
import { SseController } from '../../../../src/interfaces/sse/SseController.js'
import { sortedMapOf } from '../../../../src/port/extra-metadata.js'
import { URL } from '../../../../src/port/java-net.js'
import type { DataWithMediaType, SseEmitter } from '../../../../src/port/spring-web-sse.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { mapper } from '../../web-oracle.js'
import { admin, limited, restricted, setup } from '../data.js'

const { func, kase } = oracle('interfaces/sse/SseController')

const db = new OracleDb()
const controller = new SseController(db.bookDao, db.tasksDao)
const date = LocalDateTime.of(2020, 1, 1, 0, 0)
const emitters: [string, SseEmitter][] = []

/** texte envoyé à chaque émetteur depuis le dernier appel (en attente tant que Spring MVC n'a pas initialisé l'émetteur) */
function drain(): string[][] {
  return emitters.map(([name, e]) => {
    const sent = (e as unknown as { earlySendAttempts: DataWithMediaType[] }).earlySendAttempts
    const text = sent.map((it) => (typeof it.data === 'string' ? it.data : mapper().writeValueAsString(it.data))).join('')
    sent.length = 0
    return [name, text]
  })
}

const library = new Library({ name: 'L', root: new URL('file:/l'), id: 'L1' })
const series = new Series({ name: 'S', url: new URL('file:/l/s'), fileLastModified: date, id: 'S1', libraryId: 'L1' })
const book = new Book({ name: 'B', url: new URL('file:/l/s/b.cbz'), fileLastModified: date, id: 'B1', seriesId: 'S1', libraryId: 'L1' })
const readList = new ReadList({ name: 'R', bookIds: sortedMapOf<number, string>([2, 'B2'], [1, 'B1']), id: 'R1' })
const collection = new SeriesCollection({ name: 'C', seriesIds: ['S2', 'S1'], id: 'C1' })
const dimension = new Dimension({ width: 1, height: 1 })

const event = (name: string, e: DomainEvent) =>
  kase(name, () => {
    controller.handleSseEvent(e)
    return drain()
  })

func('sse', () => {
  kase('setup', () => setup(db))
  kase('admin', () => {
    emitters.push(['admin', controller.sse(new KomgaPrincipal(admin))])
    return emitters.length
  })
  kase('limited', () => {
    emitters.push(['limited', controller.sse(new KomgaPrincipal(limited))])
    return emitters.length
  })
  kase('restricted', () => {
    emitters.push(['restricted', controller.sse(new KomgaPrincipal(restricted))])
    return emitters.length
  })
  kase('nothing sent yet', () => drain())
})

func('heartbeat', () => {
  kase('all emitters', () => {
    controller.heartbeat()
    return drain()
  })
})

func('taskCount', () => {
  kase('no task', () => {
    controller.taskCount()
    return drain()
  })
  kase('tasks', () => {
    db.tasksDao.save(new Task.ScanLibrary({ libraryId: 'L1', scanDeep: false, priority: 5 }))
    db.tasksDao.save(new Task.ScanLibrary({ libraryId: 'L2', scanDeep: true, priority: 4 }))
    db.tasksDao.save(new Task.AnalyzeBook({ bookId: 'B1', priority: 3, groupId: 'S1' }))
    controller.taskCount()
    return drain()
  })
})

func('handleSseEvent', () => {
  event('LibraryAdded', new DomainEvent.LibraryAdded({ library }))
  event('LibraryUpdated', new DomainEvent.LibraryUpdated({ library }))
  event('LibraryDeleted', new DomainEvent.LibraryDeleted({ library }))
  event('LibraryScanned', new DomainEvent.LibraryScanned({ library }))
  event('SeriesAdded', new DomainEvent.SeriesAdded({ series }))
  event('SeriesUpdated', new DomainEvent.SeriesUpdated({ series }))
  event('SeriesDeleted', new DomainEvent.SeriesDeleted({ series }))
  event('BookAdded', new DomainEvent.BookAdded({ book }))
  event('BookUpdated', new DomainEvent.BookUpdated({ book }))
  event('BookDeleted', new DomainEvent.BookDeleted({ book }))
  event('BookImported', new DomainEvent.BookImported({ book, sourceFile: new URL('file:/import/a%20b/%C3%BC.cbz'), success: true }))
  event('BookImported failed', new DomainEvent.BookImported({ book: null, sourceFile: new URL('file:/import/x.cbz'), success: false, message: 'ERR_1002' }))
  event('ReadListAdded', new DomainEvent.ReadListAdded({ readList }))
  event('ReadListUpdated', new DomainEvent.ReadListUpdated({ readList }))
  event('ReadListDeleted', new DomainEvent.ReadListDeleted({ readList }))
  event('CollectionAdded', new DomainEvent.CollectionAdded({ collection }))
  event('CollectionUpdated', new DomainEvent.CollectionUpdated({ collection }))
  event('CollectionDeleted', new DomainEvent.CollectionDeleted({ collection }))
  event('ReadProgressChanged', new DomainEvent.ReadProgressChanged({ progress: new ReadProgress({ bookId: 'B1', userId: 'U2', page: 1, completed: false, readDate: date }) }))
  event('ReadProgressDeleted', new DomainEvent.ReadProgressDeleted({ progress: new ReadProgress({ bookId: 'B1', userId: 'U1', page: 1, completed: false, readDate: date }) }))
  event('ReadProgressSeriesChanged', new DomainEvent.ReadProgressSeriesChanged({ seriesId: 'S1', userId: 'U3' }))
  event('ReadProgressSeriesDeleted', new DomainEvent.ReadProgressSeriesDeleted({ seriesId: 'S1', userId: 'UX' }))
  event(
    'ThumbnailBookAdded',
    new DomainEvent.ThumbnailBookAdded({ thumbnail: new ThumbnailBook({ type: ThumbnailBook.Type.GENERATED, mediaType: 'image/jpeg', fileSize: 1, dimension, selected: true, bookId: 'B2' }) }),
  )
  event(
    'ThumbnailBookDeleted unknown book',
    new DomainEvent.ThumbnailBookDeleted({ thumbnail: new ThumbnailBook({ type: ThumbnailBook.Type.SIDECAR, mediaType: 'image/jpeg', fileSize: 1, dimension, bookId: 'BX' }) }),
  )
  event(
    'ThumbnailSeriesAdded',
    new DomainEvent.ThumbnailSeriesAdded({ thumbnail: new ThumbnailSeries({ type: ThumbnailSeries.Type.USER_UPLOADED, mediaType: 'image/png', fileSize: 1, dimension, seriesId: 'S1', selected: true }) }),
  )
  event(
    'ThumbnailSeriesDeleted',
    new DomainEvent.ThumbnailSeriesDeleted({ thumbnail: new ThumbnailSeries({ type: ThumbnailSeries.Type.SIDECAR, mediaType: 'image/png', fileSize: 1, dimension, seriesId: 'S2' }) }),
  )
  event(
    'ThumbnailSeriesCollectionAdded',
    new DomainEvent.ThumbnailSeriesCollectionAdded({
      thumbnail: new ThumbnailSeriesCollection({ thumbnail: new Uint8Array(0), type: ThumbnailSeriesCollection.Type.USER_UPLOADED, mediaType: 'image/png', fileSize: 1, dimension, collectionId: 'C1' }),
    }),
  )
  event(
    'ThumbnailSeriesCollectionDeleted',
    new DomainEvent.ThumbnailSeriesCollectionDeleted({
      thumbnail: new ThumbnailSeriesCollection({ thumbnail: new Uint8Array(0), selected: true, type: ThumbnailSeriesCollection.Type.USER_UPLOADED, mediaType: 'image/png', fileSize: 1, dimension, collectionId: 'C1' }),
    }),
  )
  event(
    'ThumbnailReadListAdded',
    new DomainEvent.ThumbnailReadListAdded({
      thumbnail: new ThumbnailReadList({ thumbnail: new Uint8Array(0), type: ThumbnailReadList.Type.USER_UPLOADED, mediaType: 'image/png', fileSize: 1, dimension, readListId: 'R1' }),
    }),
  )
  event(
    'ThumbnailReadListDeleted',
    new DomainEvent.ThumbnailReadListDeleted({
      thumbnail: new ThumbnailReadList({ thumbnail: new Uint8Array(0), selected: true, type: ThumbnailReadList.Type.USER_UPLOADED, mediaType: 'image/png', fileSize: 1, dimension, readListId: 'R1' }),
    }),
  )
  event('UserUpdated without expiry', new DomainEvent.UserUpdated({ user: limited, expireSession: false }))
  event('UserUpdated with expiry', new DomainEvent.UserUpdated({ user: limited, expireSession: true }))
  event('UserDeleted', new DomainEvent.UserDeleted({ user: restricted }))
})

func('emitSse', () => {
  event('admin only', new DomainEvent.BookImported({ book, sourceFile: new URL('file:/i.cbz'), success: true, message: 'msg "quoted"\nline' }))
  event('user only', new DomainEvent.ReadProgressChanged({ progress: new ReadProgress({ bookId: 'B1', userId: 'U1', page: 1, completed: true, readDate: date }) }))
})

func('start', () => {
  kase('no-op', () => controller.start())
})

func('isRunning', () => {
  kase('always', () => controller.isRunning())
})

func('getPhase', () => {
  kase('default phase', () => controller.getPhase())
})

func('stop', () => {
  kase('stop', () => {
    controller.stop()
    return drain()
  })
  kase('new connection refused', () => controller.sse(new KomgaPrincipal(admin)))
  kase('send after stop', () => {
    controller.handleSseEvent(new DomainEvent.LibraryAdded({ library }))
    return 'sent'
  })
  kase('stop twice', () => controller.stop())
})
