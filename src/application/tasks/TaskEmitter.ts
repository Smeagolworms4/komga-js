// @port-of komga/src/main/kotlin/org/gotson/komga/application/tasks/TaskEmitter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Book } from '../../domain/model/Book.js'
import { BookMetadataPatchCapability } from '../../domain/model/BookMetadataPatch.js'
import type { BookPageNumbered } from '../../domain/model/BookPageNumbered.js'
import type { CopyMode } from '../../domain/model/CopyMode.js'
import type { Library } from '../../domain/model/Library.js'
import { Media } from '../../domain/model/Media.js'
import { SearchCondition } from '../../domain/model/SearchCondition.js'
import { SearchContext } from '../../domain/model/SearchContext.js'
import { SearchOperator } from '../../domain/model/SearchOperator.js'
import { BookRepository } from '../../domain/persistence/BookRepository.js'
import { BookConverter } from '../../domain/service/BookConverter.js'
import { UnpagedSorted } from '../../infrastructure/jooq/UnpagedSorted.js'
import type { LuceneEntity } from '../../infrastructure/search/LuceneEntity.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { Order, Sort } from '../../port/spring-data.js'
import { DEFAULT_PRIORITY, LOWEST_PRIORITY, Task } from './Task.js'
import { TaskAddedEvent } from './TaskAddedEvent.js'
import { TasksRepository } from './TasksRepository.js'

const logger = KotlinLogging.logger('org.gotson.komga.application.tasks.TaskEmitter')

type Priority = { priority?: number }

// PORT: toString() d'une Collection Kotlin
function collectionToString(c: Iterable<unknown>): string {
  return `[${[...c].map((it) => String(it)).join(', ')}]`
}

export class TaskEmitter {
  constructor(
    private readonly bookRepository: BookRepository,
    private readonly bookConverter: BookConverter,
    private readonly tasksRepository: TasksRepository,
    private readonly eventPublisher: ApplicationEventPublisher,
  ) {}

  scanLibrary(libraryId: string, { scanDeep = false, priority = DEFAULT_PRIORITY }: { scanDeep?: boolean; priority?: number } = {}): void {
    this.submitTask(new Task.ScanLibrary({ libraryId: libraryId, scanDeep: scanDeep, priority: priority }))
  }

  emptyTrash(libraryId: string, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.EmptyTrash({ libraryId: libraryId, priority: priority }))
  }

  analyzeUnknownAndOutdatedBooks(library: Library): void {
    this.submitTasks(
      this.bookRepository
        .findAll(
          SearchCondition.AllOfBook.of(
            new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }),
            SearchCondition.AnyOfBook.of(
              new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.UNKNOWN }) }),
              new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.OUTDATED }) }),
            ),
          ),
          SearchContext.empty(),
          new UnpagedSorted(Sort.by(Order.asc('seriesId'), Order.asc('number'))),
        )
        .content.map((it) => new Task.AnalyzeBook({ bookId: it.id, groupId: it.seriesId })),
    )
  }

  hashBooksWithoutHash(library: Library): void {
    if (library.hashFiles)
      this.submitTasks(this.bookRepository.findAllByLibraryIdAndWithEmptyHash(library.id).map((it) => new Task.HashBook({ bookId: it.id, priority: LOWEST_PRIORITY })))
  }

  hashBooksWithoutHashKoreader(library: Library): void {
    if (library.hashKoreader)
      this.submitTasks(
        this.bookRepository.findAllByLibraryIdAndWithEmptyHashKoreader(library.id).map((it) => new Task.HashBookKoreader({ bookId: it.id, priority: LOWEST_PRIORITY })),
      )
  }

  findBooksWithMissingPageHash(library: Library, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.FindBooksWithMissingPageHash({ libraryId: library.id, priority: priority }))
  }

  hashBookPages(bookIdToSeriesId: Iterable<string>, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTasks([...bookIdToSeriesId].map((it) => new Task.HashBookPages({ bookId: it, priority: priority })))
  }

  findBooksToConvert(library: Library, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.FindBooksToConvert({ libraryId: library.id, priority: priority }))
  }

  convertBookToCbz(books: Iterable<Book>, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTasks([...books].map((it) => new Task.ConvertBook({ bookId: it.id, priority: priority, groupId: it.seriesId })))
  }

  repairExtensions(library: Library, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    if (library.repairExtensions)
      this.submitTasks(this.bookConverter.getMismatchedExtensionBooks(library).map((it) => new Task.RepairExtension({ bookId: it.id, priority: priority, groupId: it.seriesId })))
  }

  findDuplicatePagesToDelete(library: Library, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.FindDuplicatePagesToDelete({ libraryId: library.id, priority: priority }))
  }

  // PORT: surcharges removeDuplicatePages(bookId, pages, priority) / removeDuplicatePages(bookIdToPages, priority)
  // -> une seule méthode : (bookId, pages, { priority }) ou (bookIdToPages, { priority })
  removeDuplicatePages(
    bookIdOrBookIdToPages: string | Map<string, Iterable<BookPageNumbered>>,
    pagesOrOptions?: Iterable<BookPageNumbered> | Priority,
    options: Priority = {},
  ): void {
    if (typeof bookIdOrBookIdToPages === 'string') {
      const bookId = bookIdOrBookIdToPages
      const pages = pagesOrOptions as Iterable<BookPageNumbered>
      const { priority = DEFAULT_PRIORITY } = options
      this.submitTask(new Task.RemoveHashedPages({ bookId: bookId, pages: [...pages], priority: priority }))
    } else {
      const bookIdToPages = bookIdOrBookIdToPages
      const { priority = DEFAULT_PRIORITY } = (pagesOrOptions as Priority | undefined) ?? {}
      this.submitTasks([...bookIdToPages].map(([key, value]) => new Task.RemoveHashedPages({ bookId: key, pages: [...value], priority: priority })))
    }
  }

  // PORT: surcharges analyzeBook(book) / analyzeBook(books) -> une seule méthode
  analyzeBook(bookOrBooks: Book | Iterable<Book>, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    if (bookOrBooks instanceof Book) {
      const book = bookOrBooks
      this.submitTask(new Task.AnalyzeBook({ bookId: book.id, priority: priority, groupId: book.seriesId }))
    } else {
      this.submitTasks([...bookOrBooks].map((it) => new Task.AnalyzeBook({ bookId: it.id, priority: priority, groupId: it.seriesId })))
    }
  }

  // PORT: surcharges generateBookThumbnail(bookId) / generateBookThumbnail(bookIds) -> une seule méthode
  generateBookThumbnail(bookIdOrBookIds: string | Iterable<string>, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    if (typeof bookIdOrBookIds === 'string') {
      this.submitTask(new Task.GenerateBookThumbnail({ bookId: bookIdOrBookIds, priority: priority }))
    } else {
      this.submitTasks([...bookIdOrBookIds].map((it) => new Task.GenerateBookThumbnail({ bookId: it, priority: priority })))
    }
  }

  // PORT: surcharges refreshBookMetadata(book) / refreshBookMetadata(books) -> une seule méthode
  refreshBookMetadata(
    bookOrBooks: Book | Iterable<Book>,
    {
      capabilities = new Set(BookMetadataPatchCapability.entries()),
      priority = DEFAULT_PRIORITY,
    }: { capabilities?: ReadonlySet<BookMetadataPatchCapability>; priority?: number } = {},
  ): void {
    if (bookOrBooks instanceof Book) {
      const book = bookOrBooks
      this.submitTask(new Task.RefreshBookMetadata({ bookId: book.id, capabilities: capabilities, priority: priority, groupId: book.seriesId }))
    } else {
      this.submitTasks([...bookOrBooks].map((it) => new Task.RefreshBookMetadata({ bookId: it.id, capabilities: capabilities, priority: priority, groupId: it.seriesId })))
    }
  }

  refreshSeriesMetadata(seriesId: string, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.RefreshSeriesMetadata({ seriesId: seriesId, priority: priority }))
  }

  aggregateSeriesMetadata(seriesId: string, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.AggregateSeriesMetadata({ seriesId: seriesId, priority: priority }))
  }

  // PORT: surcharges refreshBookLocalArtwork(book) / refreshBookLocalArtwork(books) -> une seule méthode
  refreshBookLocalArtwork(bookOrBooks: Book | Iterable<Book>, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    if (bookOrBooks instanceof Book) {
      this.submitTask(new Task.RefreshBookLocalArtwork({ bookId: bookOrBooks.id, priority: priority }))
    } else {
      this.submitTasks([...bookOrBooks].map((it) => new Task.RefreshBookLocalArtwork({ bookId: it.id, priority: priority })))
    }
  }

  // PORT: surcharges refreshSeriesLocalArtwork(seriesId) / refreshSeriesLocalArtwork(seriesIds) -> une seule méthode
  refreshSeriesLocalArtwork(seriesIdOrSeriesIds: string | Iterable<string>, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    if (typeof seriesIdOrSeriesIds === 'string') {
      this.submitTask(new Task.RefreshSeriesLocalArtwork({ seriesId: seriesIdOrSeriesIds, priority: priority }))
    } else {
      this.submitTasks([...seriesIdOrSeriesIds].map((it) => new Task.RefreshSeriesLocalArtwork({ seriesId: it, priority: priority })))
    }
  }

  importBook(
    sourceFile: string,
    seriesId: string,
    copyMode: CopyMode,
    destinationName: string | null,
    upgradeBookId: string | null,
    { priority = DEFAULT_PRIORITY }: Priority = {},
  ): void {
    this.submitTask(
      new Task.ImportBook({
        sourceFile: sourceFile,
        seriesId: seriesId,
        copyMode: copyMode,
        destinationName: destinationName,
        upgradeBookId: upgradeBookId,
        priority: priority,
      }),
    )
  }

  rebuildIndex({ priority = DEFAULT_PRIORITY, entities = null }: { priority?: number; entities?: ReadonlySet<LuceneEntity> | null } = {}): void {
    this.submitTask(new Task.RebuildIndex({ entities: entities, priority: priority }))
  }

  upgradeIndex({ priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.UpgradeIndex({ priority: priority }))
  }

  deleteBook(bookId: string, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.DeleteBook({ bookId: bookId, priority: priority }))
  }

  deleteSeries(seriesId: string, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.DeleteSeries({ seriesId: seriesId, priority: priority }))
  }

  findBookThumbnailsToRegenerate(forBiggerResultOnly: boolean, { priority = DEFAULT_PRIORITY }: Priority = {}): void {
    this.submitTask(new Task.FindBookThumbnailsToRegenerate({ forBiggerResultOnly: forBiggerResultOnly, priority: priority }))
  }

  private submitTask(task: Task): void {
    logger.info(() => `Sending task: ${task}`)
    this.tasksRepository.save(task)
    this.eventPublisher.publishEvent(TaskAddedEvent)
  }

  private submitTasks(tasks: Task[]): void {
    logger.info(() => `Sending tasks: ${collectionToString(tasks)}`)
    this.tasksRepository.save(tasks)
    this.eventPublisher.publishEvent(TaskAddedEvent)
  }
}

// @Service
component(TaskEmitter, { inject: [BookRepository, BookConverter, TasksRepository, ApplicationEventPublisher] })
