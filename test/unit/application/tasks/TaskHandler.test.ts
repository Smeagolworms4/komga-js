// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/tasks/TaskHandlerOracleTest.kt
import { Task } from '../../../../src/application/tasks/Task.js'
import { TaskEmitter } from '../../../../src/application/tasks/TaskEmitter.js'
import { TaskHandler } from '../../../../src/application/tasks/TaskHandler.js'
import { Book } from '../../../../src/domain/model/Book.js'
import { BookAction } from '../../../../src/domain/model/BookAction.js'
import { BookMetadataPatchCapability } from '../../../../src/domain/model/BookMetadataPatch.js'
import { BookPageNumbered } from '../../../../src/domain/model/BookPageNumbered.js'
import { CopyMode } from '../../../../src/domain/model/CopyMode.js'
import type { Library } from '../../../../src/domain/model/Library.js'
import type { Series } from '../../../../src/domain/model/Series.js'
import type { BookConverter } from '../../../../src/domain/service/BookConverter.js'
import type { BookImporter } from '../../../../src/domain/service/BookImporter.js'
import type { BookLifecycle } from '../../../../src/domain/service/BookLifecycle.js'
import type { BookMetadataLifecycle } from '../../../../src/domain/service/BookMetadataLifecycle.js'
import type { BookPageEditor } from '../../../../src/domain/service/BookPageEditor.js'
import type { LibraryContentLifecycle } from '../../../../src/domain/service/LibraryContentLifecycle.js'
import type { LocalArtworkLifecycle } from '../../../../src/domain/service/LocalArtworkLifecycle.js'
import type { PageHashLifecycle } from '../../../../src/domain/service/PageHashLifecycle.js'
import type { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import type { SeriesMetadataLifecycle } from '../../../../src/domain/service/SeriesMetadataLifecycle.js'
import { LuceneEntity } from '../../../../src/infrastructure/search/LuceneEntity.js'
import type { SearchIndexLifecycle } from '../../../../src/infrastructure/search/SearchIndexLifecycle.js'
import { METER_TASKS_EXECUTION, METER_TASKS_FAILURE } from '../../../../src/interfaces/scheduler/MetricsPublisherController.js'
import { IllegalArgumentException, IllegalStateException } from '../../../../src/port/kotlin.js'
import { SimpleMeterRegistry } from '../../../../src/port/micrometer.js'
import { OracleDb, query } from '../../db.js'
import { insert } from '../../infrastructure/jooq/JooqSamples.js'
import { oracle } from '../../oracle.js'

// Les collaborateurs qui font le travail sont des faux (les mêmes côté Kotlin) qui notent leurs appels, les dépôts et le
// TaskEmitter sont les vrais, sur la base de l'oracle.
const { func, kase } = oracle('application/tasks/TaskHandler')

const db = new OracleDb()
const log: string[] = []

const pages = [
  new BookPageNumbered({ fileName: 'p1.jpg', mediaType: 'image/jpeg', fileHash: 'h1', pageNumber: 1 }),
  new BookPageNumbered({ fileName: 'p2.jpg', mediaType: 'image/jpeg', fileHash: 'h2', pageNumber: 2 }),
]

const cbr = (library: Library) => db.bookDao.findAll().filter((it) => it.libraryId === library.id && it.url.toString().endsWith('.cbr'))
const list = (it: Iterable<unknown>) => `[${[...it].map(String).join(', ')}]`

const converter = {
  getMismatchedExtensionBooks: (library: Library) => cbr(library),
  getConvertibleBooks: (library: Library) => {
    log.push(`getConvertibleBooks(${library.id})`)
    return cbr(library)
  },
  convertToCbz: (book: Book) => {
    log.push(`convertToCbz(${book.id})`)
  },
  repairExtension: (book: Book) => {
    log.push(`repairExtension(${book.id})`)
    if (book.id === 'B6') throw new IllegalStateException('cannot repair')
  },
} as unknown as BookConverter
const libraryContentLifecycle = {
  scanRootFolder: (library: Library, { scanDeep = false }: { scanDeep?: boolean } = {}) => {
    log.push(`scanRootFolder(${library.id}, ${scanDeep})`)
  },
  emptyTrash: (library: Library) => {
    log.push(`emptyTrash(${library.id})`)
  },
} as unknown as LibraryContentLifecycle
const bookLifecycle = {
  analyzeAndPersist: (b: Book) => {
    log.push(`analyzeAndPersist(${b.id})`)
    switch (b.id) {
      case 'B1':
        return new Set([BookAction.GENERATE_THUMBNAIL, BookAction.REFRESH_METADATA])
      case 'B4':
        return new Set([BookAction.REFRESH_METADATA])
      case 'B5':
        return new Set([BookAction.GENERATE_THUMBNAIL])
      default:
        return new Set()
    }
  },
  generateThumbnailAndPersist: (b: Book) => {
    log.push(`generateThumbnailAndPersist(${b.id})`)
  },
  hashAndPersist: (b: Book) => {
    log.push(`hashAndPersist(${b.id})`)
  },
  hashKoreaderAndPersist: (b: Book) => {
    log.push(`hashKoreaderAndPersist(${b.id})`)
  },
  hashPagesAndPersist: (b: Book) => {
    log.push(`hashPagesAndPersist(${b.id})`)
  },
  deleteBookFiles: (b: Book) => {
    log.push(`deleteBookFiles(${b.id})`)
  },
  findBookThumbnailsToRegenerate: (forBiggerResultOnly: boolean) => {
    log.push(`findBookThumbnailsToRegenerate(${forBiggerResultOnly})`)
    return forBiggerResultOnly ? ['B2', 'B1'] : []
  },
} as unknown as BookLifecycle
const bookMetadataLifecycle = {
  refreshMetadata: (b: Book, capabilities: ReadonlySet<BookMetadataPatchCapability>) => {
    log.push(`refreshMetadata(${b.id}, ${list(capabilities)})`)
  },
} as unknown as BookMetadataLifecycle
const seriesLifecycle = {
  deleteSeriesFiles: (s: Series) => {
    log.push(`deleteSeriesFiles(${s.id})`)
  },
} as unknown as SeriesLifecycle
const seriesMetadataLifecycle = {
  refreshMetadata: (s: Series) => {
    log.push(`refreshMetadata(${s.id})`)
  },
  aggregateMetadata: (s: Series) => {
    log.push(`aggregateMetadata(${s.id})`)
  },
} as unknown as SeriesMetadataLifecycle
const localArtworkLifecycle = {
  // PORT: surcharges refreshLocalArtwork(book) / refreshLocalArtwork(series)
  refreshLocalArtwork: (it: Book | Series) => {
    log.push(it instanceof Book ? `refreshLocalArtwork(book ${it.id})` : `refreshLocalArtwork(series ${it.id})`)
  },
} as unknown as LocalArtworkLifecycle
const bookImporter = {
  importBook: (
    source: string,
    series: Series,
    copyMode: CopyMode,
    { destinationName = null, upgradeBookId = null }: { destinationName?: string | null; upgradeBookId?: string | null } = {},
  ) => {
    log.push(`importBook(${source}, ${series.id}, ${copyMode}, ${destinationName}, ${upgradeBookId})`)
    if (source.endsWith('fail.cbz')) throw new IllegalArgumentException('import failed')
    return db.bookDao.findByIdOrNull('B5') as Book
  },
} as unknown as BookImporter
const bookPageEditor = {
  removeHashedPages: (b: Book, p: BookPageNumbered[]) => {
    log.push(`removeHashedPages(${b.id}, ${list(p.map((it) => it.pageNumber))})`)
    return p.length === 0 ? null : BookAction.GENERATE_THUMBNAIL
  },
} as unknown as BookPageEditor
const searchIndexLifecycle = {
  rebuildIndex: (entities: ReadonlySet<LuceneEntity> | null) => {
    log.push(`rebuildIndex(${entities === null ? 'null' : list([...entities].map((it) => it.type))})`)
  },
  upgradeIndex: () => {
    log.push('upgradeIndex()')
  },
} as unknown as SearchIndexLifecycle
const pageHashLifecycle = {
  getBookIdsWithMissingPageHash: (library: Library) => {
    log.push(`getBookIdsWithMissingPageHash(${library.id})`)
    return ['B1', 'B4']
  },
  getBookPagesToDeleteAutomatically: (library: Library) => {
    log.push(`getBookPagesToDeleteAutomatically(${library.id})`)
    return new Map([['B2', pages]])
  },
} as unknown as PageHashLifecycle

const emitter = new TaskEmitter(db.bookDao, converter, db.tasksDao, { publishEvent: () => {} })

/** appels faits, tâches émises, nombres d'échecs et d'exécutions */
async function handled(task: Task): Promise<unknown[]> {
  db.tasksDao.deleteAll()
  log.length = 0
  const registry = new SimpleMeterRegistry()
  const handler = new TaskHandler(
    emitter,
    db.libraryDao,
    db.bookDao,
    db.seriesDao,
    libraryContentLifecycle,
    bookLifecycle,
    bookMetadataLifecycle,
    seriesLifecycle,
    seriesMetadataLifecycle,
    localArtworkLifecycle,
    bookImporter,
    converter,
    bookPageEditor,
    searchIndexLifecycle,
    pageHashLifecycle,
    registry,
  )
  await handler.handleTask(task)
  const type = task.constructor.name
  return [
    [...log],
    query(db.tasksDataSource.getConnection(), 'select ID, PRIORITY, GROUP_ID from TASK order by ID'),
    registry.counter(METER_TASKS_FAILURE, 'type', type).count(),
    registry.timer(METER_TASKS_EXECUTION, 'type', type).count(),
  ]
}

func('handleTask', () => {
  kase('sample rows', () => insert(db))
  kase('scan library', () => handled(new Task.ScanLibrary({ libraryId: 'L1', scanDeep: true })))
  kase('scan library L2', () => handled(new Task.ScanLibrary({ libraryId: 'L2', scanDeep: false, priority: 6 })))
  kase('scan missing library', () => handled(new Task.ScanLibrary({ libraryId: 'NOPE', scanDeep: false })))
  kase('find books to convert', () => handled(new Task.FindBooksToConvert({ libraryId: 'L2', priority: 2 })))
  kase('find books to convert, missing library', () => handled(new Task.FindBooksToConvert({ libraryId: 'NOPE' })))
  kase('find books with missing page hash', () => handled(new Task.FindBooksWithMissingPageHash({ libraryId: 'L1', priority: 0 })))
  kase('find books with missing page hash, missing library', () => handled(new Task.FindBooksWithMissingPageHash({ libraryId: 'NOPE' })))
  kase('find duplicate pages to delete', () => handled(new Task.FindDuplicatePagesToDelete({ libraryId: 'L1', priority: 1 })))
  kase('find duplicate pages to delete, missing library', () => handled(new Task.FindDuplicatePagesToDelete({ libraryId: 'NOPE' })))
  kase('empty trash', () => handled(new Task.EmptyTrash({ libraryId: 'L2' })))
  kase('empty trash, missing library', () => handled(new Task.EmptyTrash({ libraryId: 'NOPE' })))
  kase('analyze book, all actions', () => handled(new Task.AnalyzeBook({ bookId: 'B1', priority: 3, groupId: 'S1' })))
  kase('analyze book, refresh metadata', () => handled(new Task.AnalyzeBook({ bookId: 'B4', groupId: 'S2' })))
  kase('analyze book, no action', () => handled(new Task.AnalyzeBook({ bookId: 'B2', groupId: 'S1' })))
  kase('analyze missing book', () => handled(new Task.AnalyzeBook({ bookId: 'NOPE', groupId: 'S1' })))
  kase('generate thumbnail', () => handled(new Task.GenerateBookThumbnail({ bookId: 'B1' })))
  kase('generate thumbnail, missing book', () => handled(new Task.GenerateBookThumbnail({ bookId: 'NOPE' })))
  kase('refresh book metadata', () =>
    handled(
      new Task.RefreshBookMetadata({ bookId: 'B1', capabilities: new Set([BookMetadataPatchCapability.TITLE, BookMetadataPatchCapability.TAGS]), priority: 5, groupId: 'S1' }),
    ),
  )
  kase('refresh book metadata, missing book', () => handled(new Task.RefreshBookMetadata({ bookId: 'NOPE', capabilities: new Set(), groupId: 'S1' })))
  kase('refresh series metadata', () => handled(new Task.RefreshSeriesMetadata({ seriesId: 'S1', priority: 2 })))
  kase('refresh series metadata, missing series', () => handled(new Task.RefreshSeriesMetadata({ seriesId: 'NOPE' })))
  kase('aggregate series metadata', () => handled(new Task.AggregateSeriesMetadata({ seriesId: 'S2' })))
  kase('aggregate series metadata, missing series', () => handled(new Task.AggregateSeriesMetadata({ seriesId: 'NOPE' })))
  kase('refresh book local artwork', () => handled(new Task.RefreshBookLocalArtwork({ bookId: 'B3' })))
  kase('refresh book local artwork, missing book', () => handled(new Task.RefreshBookLocalArtwork({ bookId: 'NOPE' })))
  kase('refresh series local artwork', () => handled(new Task.RefreshSeriesLocalArtwork({ seriesId: 'S3' })))
  kase('refresh series local artwork, missing series', () => handled(new Task.RefreshSeriesLocalArtwork({ seriesId: 'NOPE' })))
  kase('import book', () =>
    handled(new Task.ImportBook({ sourceFile: '/import/new.cbz', seriesId: 'S1', copyMode: CopyMode.HARDLINK, destinationName: 'dest.cbz', upgradeBookId: null, priority: 5 })),
  )
  kase('import book failure', () =>
    handled(new Task.ImportBook({ sourceFile: '/import/fail.cbz', seriesId: 'S1', copyMode: CopyMode.MOVE, destinationName: null, upgradeBookId: 'B2' })),
  )
  kase('import book, missing series', () =>
    handled(new Task.ImportBook({ sourceFile: '/import/new.cbz', seriesId: 'NOPE', copyMode: CopyMode.COPY, destinationName: null, upgradeBookId: null })),
  )
  kase('convert book', () => handled(new Task.ConvertBook({ bookId: 'B5', groupId: 'S3' })))
  kase('convert book, missing book', () => handled(new Task.ConvertBook({ bookId: 'NOPE', groupId: 'S3' })))
  kase('repair extension', () => handled(new Task.RepairExtension({ bookId: 'B5', groupId: 'S3' })))
  kase('repair extension failure', () => handled(new Task.RepairExtension({ bookId: 'B6', groupId: 'S4' })))
  kase('remove hashed pages', () => handled(new Task.RemoveHashedPages({ bookId: 'B1', pages, priority: 6 })))
  kase('remove hashed pages, no page', () => handled(new Task.RemoveHashedPages({ bookId: 'B1', pages: [] })))
  kase('remove hashed pages, missing book', () => handled(new Task.RemoveHashedPages({ bookId: 'NOPE', pages })))
  kase('hash book', () => handled(new Task.HashBook({ bookId: 'B1' })))
  kase('hash book, missing book', () => handled(new Task.HashBook({ bookId: 'NOPE' })))
  kase('hash book koreader', () => handled(new Task.HashBookKoreader({ bookId: 'B2' })))
  kase('hash book pages', () => handled(new Task.HashBookPages({ bookId: 'B4' })))
  kase('hash book pages, missing book', () => handled(new Task.HashBookPages({ bookId: 'NOPE' })))
  kase('rebuild index', () => handled(new Task.RebuildIndex({ entities: null })))
  kase('rebuild index, some entities', () => handled(new Task.RebuildIndex({ entities: new Set([LuceneEntity.Book]) })))
  kase('upgrade index', () => handled(new Task.UpgradeIndex()))
  kase('delete book', () => handled(new Task.DeleteBook({ bookId: 'B1' })))
  kase('delete oneshot book', () => handled(new Task.DeleteBook({ bookId: 'B6' })))
  kase('delete missing book', () => handled(new Task.DeleteBook({ bookId: 'NOPE' })))
  kase('delete series', () => handled(new Task.DeleteSeries({ seriesId: 'S2' })))
  kase('delete missing series', () => handled(new Task.DeleteSeries({ seriesId: 'NOPE' })))
  kase('find thumbnails to regenerate', () => handled(new Task.FindBookThumbnailsToRegenerate({ forBiggerResultOnly: true, priority: 3 })))
  kase('find thumbnails to regenerate, none', () => handled(new Task.FindBookThumbnailsToRegenerate({ forBiggerResultOnly: false })))
})
