// @port-of komga/src/main/kotlin/org/gotson/komga/application/tasks/TaskHandler.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Duration } from '@js-joda/core'
import { BookAction } from '../../domain/model/BookAction.js'
import { BookRepository } from '../../domain/persistence/BookRepository.js'
import { LibraryRepository } from '../../domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../domain/persistence/SeriesRepository.js'
import { BookConverter } from '../../domain/service/BookConverter.js'
import { BookImporter } from '../../domain/service/BookImporter.js'
import { BookLifecycle } from '../../domain/service/BookLifecycle.js'
import { BookMetadataLifecycle } from '../../domain/service/BookMetadataLifecycle.js'
import { BookPageEditor } from '../../domain/service/BookPageEditor.js'
import { LibraryContentLifecycle } from '../../domain/service/LibraryContentLifecycle.js'
import { LocalArtworkLifecycle } from '../../domain/service/LocalArtworkLifecycle.js'
import { PageHashLifecycle } from '../../domain/service/PageHashLifecycle.js'
import { SeriesLifecycle } from '../../domain/service/SeriesLifecycle.js'
import { SeriesMetadataLifecycle } from '../../domain/service/SeriesMetadataLifecycle.js'
import { SearchIndexLifecycle } from '../../infrastructure/search/SearchIndexLifecycle.js'
import { METER_TASKS_EXECUTION, METER_TASKS_FAILURE } from '../../interfaces/scheduler/MetricsPublisherController.js'
import { nn } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { MeterRegistry } from '../../port/micrometer.js'
import { component } from '../../port/spring.js'
import { LOW_PRIORITY, LOWEST_PRIORITY, Task } from './Task.js'
import { TaskEmitter } from './TaskEmitter.js'

const logger = KotlinLogging.logger('org.gotson.komga.application.tasks.TaskHandler')

export class TaskHandler {
  constructor(
    private readonly taskEmitter: TaskEmitter,
    private readonly libraryRepository: LibraryRepository,
    private readonly bookRepository: BookRepository,
    private readonly seriesRepository: SeriesRepository,
    private readonly libraryContentLifecycle: LibraryContentLifecycle,
    private readonly bookLifecycle: BookLifecycle,
    private readonly bookMetadataLifecycle: BookMetadataLifecycle,
    private readonly seriesLifecycle: SeriesLifecycle,
    private readonly seriesMetadataLifecycle: SeriesMetadataLifecycle,
    private readonly localArtworkLifecycle: LocalArtworkLifecycle,
    private readonly bookImporter: BookImporter,
    private readonly bookConverter: BookConverter,
    private readonly bookPageEditor: BookPageEditor,
    private readonly searchIndexLifecycle: SearchIndexLifecycle,
    private readonly pageHashLifecycle: PageHashLifecycle,
    private readonly meterRegistry: MeterRegistry,
  ) {}

  // PORT: async (certains traitements, images notamment, sont asynchrones)
  async handleTask(task: Task): Promise<void> {
    logger.info(() => `Executing task: ${task}`)
    try {
      // measureTime
      const start = process.hrtime.bigint()
      if (task instanceof Task.ScanLibrary) {
        const library = this.libraryRepository.findByIdOrNull(task.libraryId)
        if (library !== null) {
          await this.libraryContentLifecycle.scanRootFolder(library, { scanDeep: task.scanDeep })
          this.taskEmitter.analyzeUnknownAndOutdatedBooks(library)
          this.taskEmitter.repairExtensions(library, { priority: LOW_PRIORITY })
          this.taskEmitter.findBooksToConvert(library, { priority: LOWEST_PRIORITY })
          this.taskEmitter.findBooksWithMissingPageHash(library, { priority: LOWEST_PRIORITY })
          this.taskEmitter.findDuplicatePagesToDelete(library, { priority: LOWEST_PRIORITY })
          this.taskEmitter.hashBooksWithoutHash(library)
          this.taskEmitter.hashBooksWithoutHashKoreader(library)
        } else logger.warn(() => `Cannot execute task ${task}: Library does not exist`)
      } else if (task instanceof Task.FindBooksToConvert) {
        const library = this.libraryRepository.findByIdOrNull(task.libraryId)
        if (library !== null) {
          this.taskEmitter.convertBookToCbz(this.bookConverter.getConvertibleBooks(library), { priority: task.priority + 1 })
        } else logger.warn(() => `Cannot execute task ${task}: Library does not exist`)
      } else if (task instanceof Task.FindBooksWithMissingPageHash) {
        const library = this.libraryRepository.findByIdOrNull(task.libraryId)
        if (library !== null) {
          this.taskEmitter.hashBookPages(this.pageHashLifecycle.getBookIdsWithMissingPageHash(library), { priority: task.priority + 1 })
        } else logger.warn(() => `Cannot execute task ${task}: Library does not exist`)
      } else if (task instanceof Task.FindDuplicatePagesToDelete) {
        const library = this.libraryRepository.findByIdOrNull(task.libraryId)
        if (library !== null) {
          this.taskEmitter.removeDuplicatePages(this.pageHashLifecycle.getBookPagesToDeleteAutomatically(library), { priority: task.priority + 1 })
        } else logger.warn(() => `Cannot execute task ${task}: Library does not exist`)
      } else if (task instanceof Task.EmptyTrash) {
        const library = this.libraryRepository.findByIdOrNull(task.libraryId)
        if (library !== null) {
          this.libraryContentLifecycle.emptyTrash(library)
        } else logger.warn(() => `Cannot execute task ${task}: Library does not exist`)
      } else if (task instanceof Task.AnalyzeBook) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          const actions = await this.bookLifecycle.analyzeAndPersist(book)
          if (actions.has(BookAction.GENERATE_THUMBNAIL)) this.taskEmitter.generateBookThumbnail(book.id, { priority: task.priority + 1 })
          if (actions.has(BookAction.REFRESH_METADATA)) this.taskEmitter.refreshBookMetadata(book, { priority: task.priority + 1 })
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.GenerateBookThumbnail) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          await this.bookLifecycle.generateThumbnailAndPersist(book)
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.RefreshBookMetadata) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          await this.bookMetadataLifecycle.refreshMetadata(book, task.capabilities)
          this.taskEmitter.refreshSeriesMetadata(book.seriesId, { priority: task.priority - 1 })
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.RefreshSeriesMetadata) {
        const series = this.seriesRepository.findByIdOrNull(task.seriesId)
        if (series !== null) {
          await this.seriesMetadataLifecycle.refreshMetadata(series)
          this.taskEmitter.aggregateSeriesMetadata(series.id, { priority: task.priority })
        } else logger.warn(() => `Cannot execute task ${task}: Series does not exist`)
      } else if (task instanceof Task.AggregateSeriesMetadata) {
        const series = this.seriesRepository.findByIdOrNull(task.seriesId)
        if (series !== null) {
          await this.seriesMetadataLifecycle.aggregateMetadata(series)
        } else logger.warn(() => `Cannot execute task ${task}: Series does not exist`)
      } else if (task instanceof Task.RefreshBookLocalArtwork) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          await this.localArtworkLifecycle.refreshLocalArtwork(book)
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.RefreshSeriesLocalArtwork) {
        const series = this.seriesRepository.findByIdOrNull(task.seriesId)
        if (series !== null) {
          await this.localArtworkLifecycle.refreshLocalArtwork(series)
        } else logger.warn(() => `Cannot execute task ${task}: Series does not exist`)
      } else if (task instanceof Task.ImportBook) {
        const series = this.seriesRepository.findByIdOrNull(task.seriesId)
        if (series !== null) {
          const importedBook = await this.bookImporter.importBook(task.sourceFile, series, task.copyMode, { destinationName: task.destinationName, upgradeBookId: task.upgradeBookId })
          this.taskEmitter.analyzeBook(importedBook, { priority: task.priority + 1 })
        } else logger.warn(() => `Cannot execute task ${task}: Series does not exist`)
      } else if (task instanceof Task.ConvertBook) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          await this.bookConverter.convertToCbz(book)
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.RepairExtension) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          await this.bookConverter.repairExtension(book)
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.RemoveHashedPages) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          if ((await this.bookPageEditor.removeHashedPages(book, [...task.pages])) === BookAction.GENERATE_THUMBNAIL) {
            this.taskEmitter.generateBookThumbnail(book.id, { priority: task.priority + 1 })
          }
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.HashBook) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          await this.bookLifecycle.hashAndPersist(book)
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.HashBookKoreader) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          await this.bookLifecycle.hashKoreaderAndPersist(book)
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.HashBookPages) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          await this.bookLifecycle.hashPagesAndPersist(book)
        } else logger.warn(() => `Cannot execute task ${task}: Book does not exist`)
      } else if (task instanceof Task.RebuildIndex) await this.searchIndexLifecycle.rebuildIndex(task.entities)
      else if (task instanceof Task.UpgradeIndex) this.searchIndexLifecycle.upgradeIndex()
      else if (task instanceof Task.DeleteBook) {
        const book = this.bookRepository.findByIdOrNull(task.bookId)
        if (book !== null) {
          if (book.oneshot) this.seriesLifecycle.deleteSeriesFiles(nn(this.seriesRepository.findByIdOrNull(book.seriesId)))
          else this.bookLifecycle.deleteBookFiles(book)
        }
      } else if (task instanceof Task.DeleteSeries) {
        const series = this.seriesRepository.findByIdOrNull(task.seriesId)
        if (series !== null) {
          this.seriesLifecycle.deleteSeriesFiles(series)
        }
      } else if (task instanceof Task.FindBookThumbnailsToRegenerate) {
        this.taskEmitter.generateBookThumbnail(this.bookLifecycle.findBookThumbnailsToRegenerate(task.forBiggerResultOnly), { priority: task.priority })
      }
      {
        const it = Duration.ofNanos(Number(process.hrtime.bigint() - start))
        // PORT: format de kotlin.time.Duration.toString() approché (millisecondes)
        logger.info(() => `Task ${task} executed in ${(it.toNanos() / 1e6).toFixed(3)}ms`)
        this.meterRegistry.timer(METER_TASKS_EXECUTION, 'type', task.constructor.name).record(it)
      }
    } catch (e) {
      // PORT: catch (e: Exception) : toute erreur JS (TypeError…) est traitée comme une Exception
      logger.error(e as Error, () => `Task ${task} execution failed`)
      this.meterRegistry.counter(METER_TASKS_FAILURE, 'type', task.constructor.name).increment()
    }
  }
}

// @Service
component(TaskHandler, {
  inject: [
    TaskEmitter,
    LibraryRepository,
    BookRepository,
    SeriesRepository,
    LibraryContentLifecycle,
    BookLifecycle,
    BookMetadataLifecycle,
    SeriesLifecycle,
    SeriesMetadataLifecycle,
    LocalArtworkLifecycle,
    BookImporter,
    BookConverter,
    BookPageEditor,
    SearchIndexLifecycle,
    PageHashLifecycle,
    MeterRegistry,
  ],
})
