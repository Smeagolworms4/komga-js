// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/tasks/TaskEmitterOracleTest.kt
import { HIGH_PRIORITY } from '../../../../src/application/tasks/Task.js'
import { TaskEmitter } from '../../../../src/application/tasks/TaskEmitter.js'
import type { Book } from '../../../../src/domain/model/Book.js'
import { BookMetadataPatchCapability } from '../../../../src/domain/model/BookMetadataPatch.js'
import { BookPageNumbered } from '../../../../src/domain/model/BookPageNumbered.js'
import { CopyMode } from '../../../../src/domain/model/CopyMode.js'
import { Library } from '../../../../src/domain/model/Library.js'
import type { BookConverter } from '../../../../src/domain/service/BookConverter.js'
import { LuceneEntity } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { URL } from '../../../../src/port/java-net.js'
import type { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { OracleDb, query } from '../../db.js'
import { insert } from '../../infrastructure/jooq/JooqSamples.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('application/tasks/TaskEmitter')

const db = new OracleDb()
const events: string[] = []
const publisher: ApplicationEventPublisher = { publishEvent: (it: unknown) => events.push((it as object).constructor.name) }

/** faux BookConverter (même chose côté Kotlin) : les livres de la bibliothèque dont l'url finit par .cbr */
const converter = {
  getMismatchedExtensionBooks: (library: Library) => db.bookDao.findAll().filter((it) => it.libraryId === library.id && it.url.toString().endsWith('.cbr')),
} as unknown as BookConverter

const emitter = new TaskEmitter(db.bookDao, converter, db.tasksDao, publisher)

const library = (id: string, { hashFiles = true, hashKoreader = false, repairExtensions = false } = {}) =>
  new Library({ name: `lib ${id}`, root: new URL(`file:/${id.toLowerCase()}`), id, hashFiles, hashKoreader, repairExtensions })

const book = (id: string): Book => db.bookDao.findByIdOrNull(id) as Book

const pages = [
  new BookPageNumbered({ fileName: 'p1.jpg', mediaType: 'image/jpeg', fileHash: 'h1', pageNumber: 1 }),
  new BookPageNumbered({ fileName: 'p3.jpg', mediaType: 'image/jpeg', fileSize: 42, pageNumber: 3 }),
]

/** tâches enregistrées et événements publiés par `block` */
function emitted(block: () => void): unknown[] {
  db.tasksDao.deleteAll()
  events.length = 0
  block()
  return [query(db.tasksDataSource.getConnection(), 'select ID, PRIORITY, GROUP_ID, SIMPLE_TYPE, PAYLOAD from TASK order by ID'), [...events]]
}

func('scanLibrary', () => {
  kase('sample rows', () => insert(db))
  kase('defaults', () => emitted(() => emitter.scanLibrary('L1')))
  kase('deep with priority', () => emitted(() => emitter.scanLibrary('L2', { scanDeep: true, priority: HIGH_PRIORITY })))
})
func('emptyTrash', () => {
  kase('defaults', () => emitted(() => emitter.emptyTrash('L1')))
  kase('priority', () => emitted(() => emitter.emptyTrash('L1', { priority: 1 })))
})
func('analyzeUnknownAndOutdatedBooks', () => {
  kase('unknown and outdated books', () => emitted(() => emitter.analyzeUnknownAndOutdatedBooks(library('L1'))))
  kase('none', () => emitted(() => emitter.analyzeUnknownAndOutdatedBooks(library('L2'))))
  kase('missing library', () => emitted(() => emitter.analyzeUnknownAndOutdatedBooks(library('NOPE'))))
})
func('hashBooksWithoutHash', () => {
  kase('hash files', () => emitted(() => emitter.hashBooksWithoutHash(library('L1'))))
  kase('hash files disabled', () => emitted(() => emitter.hashBooksWithoutHash(library('L1', { hashFiles: false }))))
  kase('other library', () => emitted(() => emitter.hashBooksWithoutHash(library('L2'))))
})
func('hashBooksWithoutHashKoreader', () => {
  kase('hash koreader', () => emitted(() => emitter.hashBooksWithoutHashKoreader(library('L2', { hashKoreader: true }))))
  kase('disabled', () => emitted(() => emitter.hashBooksWithoutHashKoreader(library('L2'))))
})
func('findBooksWithMissingPageHash', () => {
  kase('defaults', () => emitted(() => emitter.findBooksWithMissingPageHash(library('L1'))))
  kase('priority', () => emitted(() => emitter.findBooksWithMissingPageHash(library('L3'), { priority: 0 })))
})
func('hashBookPages', () => {
  kase('books', () => emitted(() => emitter.hashBookPages(['B2', 'B1', 'B2'])))
  kase('empty', () => emitted(() => emitter.hashBookPages(new Set(), { priority: 7 })))
})
func('findBooksToConvert', () => {
  kase('defaults', () => emitted(() => emitter.findBooksToConvert(library('L1'))))
  kase('priority', () => emitted(() => emitter.findBooksToConvert(library('L1'), { priority: 3 })))
})
func('convertBookToCbz', () => {
  kase('books', () => emitted(() => emitter.convertBookToCbz([book('B5'), book('B1')])))
  kase('empty with priority', () => emitted(() => emitter.convertBookToCbz([], { priority: 2 })))
})
func('repairExtensions', () => {
  kase('enabled', () => emitted(() => emitter.repairExtensions(library('L2', { repairExtensions: true }))))
  kase('enabled, priority', () => emitted(() => emitter.repairExtensions(library('L2', { repairExtensions: true }), { priority: 1 })))
  kase('enabled, no book', () => emitted(() => emitter.repairExtensions(library('L1', { repairExtensions: true }))))
  kase('disabled', () => emitted(() => emitter.repairExtensions(library('L2'))))
})
func('findDuplicatePagesToDelete', () => {
  kase('defaults', () => emitted(() => emitter.findDuplicatePagesToDelete(library('L1'))))
  kase('priority', () => emitted(() => emitter.findDuplicatePagesToDelete(library('L1'), { priority: 8 })))
})
func('removeDuplicatePages@128', () => {
  kase('pages', () => emitted(() => emitter.removeDuplicatePages('B1', pages)))
  kase('no page, priority', () => emitted(() => emitter.removeDuplicatePages('B1', [], { priority: 5 })))
})
func('removeDuplicatePages@136', () => {
  kase('map', () =>
    emitted(() =>
      emitter.removeDuplicatePages(
        new Map([
          ['B2', pages],
          ['B1', pages.slice(0, 1)],
        ]),
      ),
    ),
  )
  kase('empty map, priority', () => emitted(() => emitter.removeDuplicatePages(new Map(), { priority: 5 })))
})
func('analyzeBook@145', () => {
  kase('book', () => emitted(() => emitter.analyzeBook(book('B1'))))
  kase('priority', () => emitted(() => emitter.analyzeBook(book('B4'), { priority: 6 })))
})
func('analyzeBook@152', () => {
  kase('books', () => emitted(() => emitter.analyzeBook([book('B1'), book('B5')])))
  kase('empty', () => emitted(() => emitter.analyzeBook([])))
})
func('generateBookThumbnail@161', () => {
  kase('book id', () => emitted(() => emitter.generateBookThumbnail('B1')))
  kase('priority', () => emitted(() => emitter.generateBookThumbnail('B1', { priority: 2 })))
})
func('generateBookThumbnail@168', () => {
  kase('book ids', () => emitted(() => emitter.generateBookThumbnail(['B3', 'B1'])))
  kase('empty', () => emitted(() => emitter.generateBookThumbnail([])))
})
func('refreshBookMetadata@177', () => {
  kase('all capabilities', () => emitted(() => emitter.refreshBookMetadata(book('B1'))))
  kase('some capabilities', () =>
    emitted(() => emitter.refreshBookMetadata(book('B1'), { capabilities: new Set([BookMetadataPatchCapability.ISBN, BookMetadataPatchCapability.AUTHORS]), priority: 5 })),
  )
})
func('refreshBookMetadata@185', () => {
  kase('books', () => emitted(() => emitter.refreshBookMetadata([book('B4'), book('B2')])))
  kase('no capability', () => emitted(() => emitter.refreshBookMetadata([book('B4')], { capabilities: new Set() })))
})
func('refreshSeriesMetadata', () => {
  kase('defaults', () => emitted(() => emitter.refreshSeriesMetadata('S1')))
  kase('priority', () => emitted(() => emitter.refreshSeriesMetadata('S1', { priority: 1 })))
})
func('aggregateSeriesMetadata', () => {
  kase('defaults', () => emitted(() => emitter.aggregateSeriesMetadata('S2')))
  kase('priority', () => emitted(() => emitter.aggregateSeriesMetadata('S2', { priority: 7 })))
})
func('refreshBookLocalArtwork@209', () => {
  kase('book', () => emitted(() => emitter.refreshBookLocalArtwork(book('B2'))))
  kase('priority', () => emitted(() => emitter.refreshBookLocalArtwork(book('B2'), { priority: 3 })))
})
func('refreshBookLocalArtwork@216', () => {
  kase('books', () => emitted(() => emitter.refreshBookLocalArtwork([book('B2'), book('B7')])))
})
func('refreshSeriesLocalArtwork@225', () => {
  kase('series id', () => emitted(() => emitter.refreshSeriesLocalArtwork('S1')))
})
func('refreshSeriesLocalArtwork@232', () => {
  kase('series ids', () => emitted(() => emitter.refreshSeriesLocalArtwork(['S2', 'S1'], { priority: 1 })))
})
func('importBook', () => {
  kase('nulls', () => emitted(() => emitter.importBook('/import/a.cbz', 'S1', CopyMode.COPY, null, null)))
  kase('all fields', () => emitted(() => emitter.importBook('/import/b.cbz', 'S2', CopyMode.MOVE, 'new name.cbz', 'B4', { priority: 6 })))
})
func('rebuildIndex', () => {
  kase('defaults', () => emitted(() => emitter.rebuildIndex()))
  kase('entities', () => emitted(() => emitter.rebuildIndex({ priority: 2, entities: new Set([LuceneEntity.ReadList, LuceneEntity.Collection]) })))
})
func('upgradeIndex', () => {
  kase('defaults', () => emitted(() => emitter.upgradeIndex()))
  kase('priority', () => emitted(() => emitter.upgradeIndex({ priority: 8 })))
})
func('deleteBook', () => {
  kase('defaults', () => emitted(() => emitter.deleteBook('B1')))
})
func('deleteSeries', () => {
  kase('priority', () => emitted(() => emitter.deleteSeries('S1', { priority: 5 })))
})
func('findBookThumbnailsToRegenerate', () => {
  kase('defaults', () => emitted(() => emitter.findBookThumbnailsToRegenerate(false)))
  kase('priority', () => emitted(() => emitter.findBookThumbnailsToRegenerate(true, { priority: 0 })))
})
func('submitTask', () => {
  kase('replaces the queued task', () =>
    emitted(() => {
      emitter.deleteBook('B1', { priority: 1 })
      emitter.deleteBook('B1', { priority: 2 })
    }),
  )
})
func('submitTasks', () => {
  kase('several calls', () =>
    emitted(() => {
      emitter.generateBookThumbnail(['B1', 'B2'])
      emitter.generateBookThumbnail(['B2'], { priority: 9 })
    }),
  )
})
