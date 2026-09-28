// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/SeriesLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { existsSync } from 'node:fs'
import { fileReadBytes } from '../../port/java-io.js'
import { TaskEmitter } from '../../application/tasks/TaskEmitter.js'
import type { Book } from '../model/Book.js'
import { BookMetadata } from '../model/BookMetadata.js'
import { BookMetadataAggregation } from '../model/BookMetadataAggregation.js'
import { BookMetadataPatchCapability } from '../model/BookMetadataPatch.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { HistoricalEvent } from '../model/HistoricalEvent.js'
import type { KomgaUser } from '../model/KomgaUser.js'
import { Library } from '../model/Library.js'
import { MarkSelectedPreference } from '../model/MarkSelectedPreference.js'
import { Media } from '../model/Media.js'
import { ReadProgress } from '../model/ReadProgress.js'
import type { Series } from '../model/Series.js'
import { SeriesMetadata } from '../model/SeriesMetadata.js'
import { ThumbnailSeries } from '../model/ThumbnailSeries.js'
import { BookMetadataAggregationRepository } from '../persistence/BookMetadataAggregationRepository.js'
import { BookMetadataRepository } from '../persistence/BookMetadataRepository.js'
import { BookRepository } from '../persistence/BookRepository.js'
import { HistoricalEventRepository } from '../persistence/HistoricalEventRepository.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { MediaRepository } from '../persistence/MediaRepository.js'
import { ReadProgressRepository } from '../persistence/ReadProgressRepository.js'
import { SeriesCollectionRepository } from '../persistence/SeriesCollectionRepository.js'
import { SeriesMetadataRepository } from '../persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../persistence/SeriesRepository.js'
import { ThumbnailSeriesRepository } from '../persistence/ThumbnailSeriesRepository.js'
import { stripAccents } from '../../language/LanguageUtils.js'
import { filesDeleteIfExists, filesIsWritable, listDirectoryEntries, uriToFilePath, urlToPath } from '../../port/java.js'
import { check, eq, first, mapNotNull, nn, require, str, trim } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { CaseInsensitiveSimpleNaturalComparator } from '../../port/natsort.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { TransactionTemplate } from '../../port/spring-tx.js'
import { BookLifecycle } from './BookLifecycle.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.SeriesLifecycle')
const natSortComparator: (a: string, b: string) => number = CaseInsensitiveSimpleNaturalComparator.getInstance()

export class SeriesLifecycle {
  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly bookRepository: BookRepository,
    private readonly bookLifecycle: BookLifecycle,
    private readonly mediaRepository: MediaRepository,
    private readonly bookMetadataRepository: BookMetadataRepository,
    private readonly seriesRepository: SeriesRepository,
    private readonly thumbnailsSeriesRepository: ThumbnailSeriesRepository,
    private readonly seriesMetadataRepository: SeriesMetadataRepository,
    private readonly bookMetadataAggregationRepository: BookMetadataAggregationRepository,
    private readonly collectionRepository: SeriesCollectionRepository,
    private readonly readProgressRepository: ReadProgressRepository,
    private readonly taskEmitter: TaskEmitter,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly transactionTemplate: TransactionTemplate,
    private readonly historicalEventRepository: HistoricalEventRepository,
  ) {}

  // PORT: \s de java.util.regex = [ \t\n\x0B\f\r] (le \s JS inclut aussi les espaces Unicode)
  private readonly whitespacePattern = /[ \t\n\x0B\f\r]+/g

  sortBooks(series: Series): void {
    logger.info(() => `Sorting books for ${series}`)

    const books = this.bookRepository.findAllBySeriesId(series.id)
    const metadatas = this.bookMetadataRepository.findAllByIds(books.map((it) => it.id))
    logger.debug(() => `Existing books: ${str(books)}`)
    logger.debug(() => `Existing metadata: ${str(metadatas)}`)

    const sortKey = (it: Book) => stripAccents(trim(it.name)).replace(this.whitespacePattern, ' ')
    const sorted = [...books]
      .sort((a, b) => natSortComparator(sortKey(a), sortKey(b)))
      .map((book): [Book, BookMetadata] => [book, first(metadatas, (it) => it.bookId === book.id)])
    logger.debug(() => `Sorted books: ${str(sorted.map(([b, m]) => `(${b}, ${m})`))}`)

    this.bookRepository.update(sorted.map(([book], index) => book.copy({ number: index + 1 })))

    const oldToNew = mapNotNull(sorted, ([book, metadata], index): [Book, BookMetadata, BookMetadata] | null => {
      if (metadata.numberLock && metadata.numberSortLock) return null
      else
        return [
          book,
          metadata,
          metadata.copy({
            number: !metadata.numberLock ? (index + 1).toString() : metadata.number,
            numberSort: !metadata.numberSortLock ? index + 1 : metadata.numberSort,
          }),
        ]
    })
    this.bookMetadataRepository.update(oldToNew.map((it) => it[2]))

    // refresh metadata to reimport book number, else the series resorting would overwrite it
    oldToNew.forEach(([book, old, neu]) => {
      if (old.number !== neu.number || old.numberSort !== neu.numberSort) {
        logger.debug(() => `Metadata numbering has changed, refreshing metadata for book ${neu.bookId} `)
        this.taskEmitter.refreshBookMetadata(book, { capabilities: new Set([BookMetadataPatchCapability.NUMBER, BookMetadataPatchCapability.NUMBER_SORT]) })
      }
    })

    // update book count for series
    const it = this.seriesRepository.findByIdOrNull(series.id)
    if (it !== null) this.seriesRepository.update(it.copy({ bookCount: books.length }), { updateModifiedTime: false })
  }

  addBooks(series: Series, booksToAdd: Iterable<Book>): void {
    for (const it of booksToAdd) {
      check(it.libraryId === series.libraryId, () => "Cannot add book to series if they don't share the same libraryId")
    }
    const toAdd = [...booksToAdd].map((it) => it.copy({ seriesId: series.id }))

    this.transactionTemplate.executeWithoutResult(() => {
      this.bookRepository.insert(toAdd)

      // create associated media
      this.mediaRepository.insert(toAdd.map((it) => new Media({ bookId: it.id })))

      // create associated metadata
      this.bookMetadataRepository.insert(
        toAdd.map(
          (it) =>
            new BookMetadata({
              title: it.name,
              number: it.number.toString(),
              numberSort: it.number,
              bookId: it.id,
            }),
        ),
      )
    })

    toAdd.forEach((it) => this.eventPublisher.publishEvent(new DomainEvent.BookAdded({ book: it })))
  }

  createSeries(series: Series): Series {
    this.transactionTemplate.executeWithoutResult(() => {
      this.seriesRepository.insert(series)

      this.seriesMetadataRepository.insert(
        new SeriesMetadata({
          title: series.name,
          titleSort: series.name,
          seriesId: series.id,
        }),
      )

      this.bookMetadataAggregationRepository.insert(new BookMetadataAggregation({ seriesId: series.id }))
    })

    this.eventPublisher.publishEvent(new DomainEvent.SeriesAdded({ series: series }))

    return nn(this.seriesRepository.findByIdOrNull(series.id))
  }

  softDeleteMany(series: Iterable<Series>): void {
    logger.info(() => `Soft delete series: ${str([...series])}`)
    const deletedDate = LocalDateTime.now()

    this.transactionTemplate.executeWithoutResult(() => {
      this.bookLifecycle.softDeleteMany(this.bookRepository.findAllBySeriesIds([...series].map((it) => it.id)))
      for (const it of series) {
        this.seriesRepository.update(it.copy({ deletedDate: deletedDate }))
      }
    })

    for (const it of series) this.eventPublisher.publishEvent(new DomainEvent.SeriesUpdated({ series: it }))
  }

  deleteMany(series: Iterable<Series>): void {
    const seriesIds = [...series].map((it) => it.id)
    logger.info(() => `Delete series ids: ${str(seriesIds)}`)

    this.transactionTemplate.executeWithoutResult(() => {
      this.bookLifecycle.deleteMany(this.bookRepository.findAllBySeriesIds(seriesIds))

      this.readProgressRepository.deleteBySeriesIds(seriesIds)
      this.collectionRepository.removeSeriesFromAll(seriesIds)
      this.thumbnailsSeriesRepository.deleteBySeriesIds(seriesIds)
      this.seriesMetadataRepository.delete(seriesIds)
      this.bookMetadataAggregationRepository.delete(seriesIds)

      this.seriesRepository.delete(seriesIds)
    })

    for (const it of series) this.eventPublisher.publishEvent(new DomainEvent.SeriesDeleted({ series: it }))
  }

  markReadProgressCompleted(seriesId: string, user: KomgaUser): void {
    const bookIds = this.bookRepository.findAllIdsBySeriesId(seriesId).filter((bookId) => {
      const readProgress = this.readProgressRepository.findByBookIdAndUserIdOrNull(bookId, user.id)
      return readProgress === null || !readProgress.completed
    })
    const progresses = this.mediaRepository.getPagesSizes(bookIds).map(([bookId, pageSize]) => new ReadProgress({ bookId: bookId, userId: user.id, page: pageSize, completed: true }))

    this.readProgressRepository.save(progresses)
    progresses.forEach((it) => this.eventPublisher.publishEvent(new DomainEvent.ReadProgressChanged({ progress: it })))
    this.eventPublisher.publishEvent(new DomainEvent.ReadProgressSeriesChanged({ seriesId: seriesId, userId: user.id }))
  }

  deleteReadProgress(seriesId: string, user: KomgaUser): void {
    const bookIds = this.bookRepository.findAllIdsBySeriesId(seriesId)
    const progresses = this.readProgressRepository.findAllByBookIdsAndUserId(bookIds, user.id)
    this.readProgressRepository.deleteByBookIdsAndUserId(bookIds, user.id)

    progresses.forEach((it) => this.eventPublisher.publishEvent(new DomainEvent.ReadProgressDeleted({ progress: it })))
    this.eventPublisher.publishEvent(new DomainEvent.ReadProgressSeriesDeleted({ seriesId: seriesId, userId: user.id }))
  }

  getSelectedThumbnail(seriesId: string): ThumbnailSeries | null {
    const selected = this.thumbnailsSeriesRepository.findSelectedBySeriesIdOrNull(seriesId)

    if (selected === null || (selected.type === ThumbnailSeries.Type.SIDECAR && !selected.exists())) {
      this.thumbnailsHouseKeeping(seriesId)
      return this.thumbnailsSeriesRepository.findSelectedBySeriesIdOrNull(seriesId)
    }

    return selected
  }

  private getBytesFromThumbnailSeries(thumbnail: ThumbnailSeries): Uint8Array | null {
    if (thumbnail.thumbnail !== null) return thumbnail.thumbnail
    else if (thumbnail.url !== null) return fileReadBytes(urlToPath(thumbnail.url)) // PORT: File(uri).readBytes() : FileNotFoundException comme la JVM
    else return null
  }

  getThumbnailBytesByThumbnailId(thumbnailId: string): Uint8Array | null {
    const it = this.thumbnailsSeriesRepository.findByIdOrNull(thumbnailId)
    return it !== null ? this.getBytesFromThumbnailSeries(it) : null
  }

  // PORT: async (BookLifecycle.getThumbnailBytes redimensionne avec sharp)
  async getThumbnailBytes(seriesId: string, userId: string): Promise<Uint8Array | null> {
    const selected = this.getSelectedThumbnail(seriesId)
    if (selected !== null) {
      return this.getBytesFromThumbnailSeries(selected)
    }

    const series = this.seriesRepository.findByIdOrNull(seriesId)
    if (series !== null) {
      let bookId: string | null
      switch (this.libraryRepository.findById(series.libraryId).seriesCover) {
        case Library.SeriesCover.FIRST:
          bookId = this.bookRepository.findFirstIdInSeriesOrNull(seriesId)
          break
        case Library.SeriesCover.FIRST_UNREAD_OR_FIRST:
          bookId = this.bookRepository.findFirstUnreadIdInSeriesOrNull(seriesId, userId) ?? this.bookRepository.findFirstIdInSeriesOrNull(seriesId)
          break

        case Library.SeriesCover.FIRST_UNREAD_OR_LAST:
          bookId = this.bookRepository.findFirstUnreadIdInSeriesOrNull(seriesId, userId) ?? this.bookRepository.findLastIdInSeriesOrNull(seriesId)
          break

        case Library.SeriesCover.LAST:
        default:
          bookId = this.bookRepository.findLastIdInSeriesOrNull(seriesId)
          break
      }
      if (bookId !== null) return (await this.bookLifecycle.getThumbnailBytes(bookId))?.bytes ?? null
    }

    return null
  }

  addThumbnailForSeries(thumbnail: ThumbnailSeries, markSelected: MarkSelectedPreference): ThumbnailSeries {
    // delete existing thumbnail with the same url
    if (thumbnail.url !== null) {
      this.thumbnailsSeriesRepository
        .findAllBySeriesId(thumbnail.seriesId)
        .filter((it) => eq(it.url, thumbnail.url))
        .forEach((it) => {
          this.thumbnailsSeriesRepository.delete(it.id)
        })
    }
    this.thumbnailsSeriesRepository.insert(thumbnail.copy({ selected: false }))

    let selected: boolean
    switch (markSelected) {
      case MarkSelectedPreference.YES:
        selected = true
        break
      case MarkSelectedPreference.IF_NONE_OR_GENERATED: {
        selected = this.thumbnailsSeriesRepository.findSelectedBySeriesIdOrNull(thumbnail.seriesId) === null
        break
      }

      case MarkSelectedPreference.NO:
      default:
        selected = false
        break
    }

    if (selected) this.thumbnailsSeriesRepository.markSelected(thumbnail)

    const newThumbnail = thumbnail.copy({ selected: selected })
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailSeriesAdded({ thumbnail: newThumbnail }))
    return newThumbnail
  }

  deleteThumbnailForSeries(thumbnail: ThumbnailSeries): void {
    require(thumbnail.type === ThumbnailSeries.Type.USER_UPLOADED, () => 'Only uploaded thumbnails can be deleted')
    this.thumbnailsSeriesRepository.delete(thumbnail.id)
    this.eventPublisher.publishEvent(new DomainEvent.ThumbnailSeriesDeleted({ thumbnail: thumbnail }))
  }

  deleteSeriesFiles(series: Series): void {
    // PORT: Path.notExists() -> !existsSync
    if (!existsSync(series.path)) return logger.info(() => `Cannot delete series folder, path does not exist: ${series.path}`)
    if (!filesIsWritable(series.path)) return logger.info(() => `Cannot delete series folder, path is not writable: ${series.path}`)

    const thumbnails = mapNotNull(this.thumbnailsSeriesRepository.findAllBySeriesIdIdAndType(series.id, ThumbnailSeries.Type.SIDECAR), (it) =>
      it.url !== null ? urlToPath(it.url) : null,
    ).filter((it) => existsSync(it) && filesIsWritable(it))

    this.bookRepository.findAllBySeriesId(series.id).forEach((it) => this.bookLifecycle.deleteBookFiles(it))
    thumbnails.forEach((it) => {
      if (filesDeleteIfExists(it)) logger.info(() => `Deleted file: ${it}`)
    })

    if (existsSync(series.path) && listDirectoryEntries(series.path).length === 0)
      if (filesDeleteIfExists(series.path)) {
        logger.info(() => `Deleted directory: ${series.path}`)
        this.historicalEventRepository.insert(new HistoricalEvent.SeriesFolderDeleted({ series: series, reason: 'Folder was deleted because it was empty' }))
      }

    this.softDeleteMany([series])
  }

  private thumbnailsHouseKeeping(seriesId: string): void {
    logger.info(() => `House keeping thumbnails for series: ${seriesId}`)
    const all = mapNotNull(this.thumbnailsSeriesRepository.findAllBySeriesId(seriesId), (it) => {
      if (!it.exists()) {
        logger.warn(() => "Thumbnail doesn't exist, removing entry")
        this.thumbnailsSeriesRepository.delete(it.id)
        return null
      } else {
        return it
      }
    })

    const selected = all.filter((it) => it.selected)
    if (selected.length > 1) {
      logger.info(() => 'More than one thumbnail is selected, removing extra ones')
      this.thumbnailsSeriesRepository.markSelected(nn(selected[0]))
    } else if (selected.length === 0 && all.length > 0) {
      logger.info(() => 'Series has no selected thumbnail, choosing one automatically')
      this.thumbnailsSeriesRepository.markSelected(first(all))
    }
  }
}

// @Service
component(SeriesLifecycle, {
  inject: [
    LibraryRepository,
    BookRepository,
    BookLifecycle,
    MediaRepository,
    BookMetadataRepository,
    SeriesRepository,
    ThumbnailSeriesRepository,
    SeriesMetadataRepository,
    BookMetadataAggregationRepository,
    SeriesCollectionRepository,
    ReadProgressRepository,
    TaskEmitter,
    ApplicationEventPublisher,
    TransactionTemplate,
    HistoricalEventRepository,
  ],
})
