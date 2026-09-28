// @port-of komga/src/main/kotlin/org/gotson/komga/application/tasks/Task.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BookMetadataPatchCapability } from '../../domain/model/BookMetadataPatch.js'
import { BookPageNumbered } from '../../domain/model/BookPageNumbered.js'
import { CopyMode } from '../../domain/model/CopyMode.js'
import { LuceneEntity } from '../../infrastructure/search/LuceneEntity.js'
import { registerClass } from '../../port/jackson.js'
import { jsonFields, jsonProperties } from '../../port/jackson-mapper.js'
import { str } from '../../port/kotlin.js'

export const HIGHEST_PRIORITY = 8
export const HIGH_PRIORITY = 6
export const DEFAULT_PRIORITY = 4
export const LOW_PRIORITY = 2
export const LOWEST_PRIORITY = 0

type TaskParams = {
  priority?: number
  groupId?: string | null
}

type ScanLibraryParams = {
  libraryId: string
  scanDeep: boolean
  priority?: number
}

type FindBooksToConvertParams = {
  libraryId: string
  priority?: number
}

type FindBooksWithMissingPageHashParams = {
  libraryId: string
  priority?: number
}

type FindDuplicatePagesToDeleteParams = {
  libraryId: string
  priority?: number
}

type EmptyTrashParams = {
  libraryId: string
  priority?: number
}

type AnalyzeBookParams = {
  bookId: string
  priority?: number
  groupId: string
}

type GenerateBookThumbnailParams = {
  bookId: string
  priority?: number
}

type RefreshBookMetadataParams = {
  bookId: string
  capabilities: ReadonlySet<BookMetadataPatchCapability>
  priority?: number
  groupId: string
}

type HashBookParams = {
  bookId: string
  priority?: number
}

type HashBookPagesParams = {
  bookId: string
  priority?: number
}

type HashBookKoreaderParams = {
  bookId: string
  priority?: number
}

type RefreshSeriesMetadataParams = {
  seriesId: string
  priority?: number
}

type AggregateSeriesMetadataParams = {
  seriesId: string
  priority?: number
}

type RefreshBookLocalArtworkParams = {
  bookId: string
  priority?: number
}

type RefreshSeriesLocalArtworkParams = {
  seriesId: string
  priority?: number
}

type ImportBookParams = {
  sourceFile: string
  seriesId: string
  copyMode: CopyMode
  destinationName: string | null
  upgradeBookId: string | null
  priority?: number
}

type ConvertBookParams = {
  bookId: string
  priority?: number
  groupId: string
}

type RepairExtensionParams = {
  bookId: string
  priority?: number
  groupId: string
}

type RemoveHashedPagesParams = {
  bookId: string
  pages: readonly BookPageNumbered[]
  priority?: number
}

type RebuildIndexParams = {
  entities: ReadonlySet<LuceneEntity> | null
  priority?: number
}

type UpgradeIndexParams = {
  priority?: number
}

type DeleteBookParams = {
  bookId: string
  priority?: number
}

type DeleteSeriesParams = {
  seriesId: string
  priority?: number
}

type FindBookThumbnailsToRegenerateParams = {
  forBiggerResultOnly: boolean
  priority?: number
}

// PORT: sealed class -> classe abstraite ; les sous-classes sont dans le namespace Task ci-dessous
export abstract class Task {
  readonly priority: number
  readonly groupId: string | null

  constructor({ priority = DEFAULT_PRIORITY, groupId = null }: TaskParams = {}) {
    this.priority = priority
    this.groupId = groupId
  }

  abstract readonly uniqueId: string
}

export namespace Task {
  export class ScanLibrary extends Task {
    readonly libraryId: string
    readonly scanDeep: boolean
    readonly uniqueId: string

    constructor({ libraryId, scanDeep, priority = DEFAULT_PRIORITY }: ScanLibraryParams) {
      super({ priority: priority })
      this.libraryId = libraryId
      this.scanDeep = scanDeep
      this.uniqueId = `SCAN_LIBRARY_${libraryId}_DEEP_${scanDeep}`
    }

    toString(): string {
      return `ScanLibrary(libraryId='${this.libraryId}', scanDeep='${this.scanDeep}', priority='${this.priority}')`
    }
  }

  export class FindBooksToConvert extends Task {
    readonly libraryId: string
    readonly uniqueId: string

    constructor({ libraryId, priority = DEFAULT_PRIORITY }: FindBooksToConvertParams) {
      super({ priority: priority })
      this.libraryId = libraryId
      this.uniqueId = `FIND_BOOKS_TO_CONVERT_${libraryId}`
    }

    toString(): string {
      return `FindBooksToConvert(libraryId='${this.libraryId}', priority='${this.priority}')`
    }
  }

  export class FindBooksWithMissingPageHash extends Task {
    readonly libraryId: string
    readonly uniqueId: string

    constructor({ libraryId, priority = DEFAULT_PRIORITY }: FindBooksWithMissingPageHashParams) {
      super({ priority: priority })
      this.libraryId = libraryId
      this.uniqueId = `FIND_BOOKS_WITH_MISSING_PAGE_HASH_${libraryId}`
    }

    toString(): string {
      return `FindBooksWithMissingPageHash(libraryId='${this.libraryId}', priority='${this.priority}')`
    }
  }

  export class FindDuplicatePagesToDelete extends Task {
    readonly libraryId: string
    readonly uniqueId: string

    constructor({ libraryId, priority = DEFAULT_PRIORITY }: FindDuplicatePagesToDeleteParams) {
      super({ priority: priority })
      this.libraryId = libraryId
      this.uniqueId = `FIND_DUPLICATE_PAGES_TO_DELETE_${libraryId}`
    }

    toString(): string {
      return `FindDuplicatePagesToDelete(libraryId='${this.libraryId}', priority='${this.priority}')`
    }
  }

  export class EmptyTrash extends Task {
    readonly libraryId: string
    readonly uniqueId: string

    constructor({ libraryId, priority = DEFAULT_PRIORITY }: EmptyTrashParams) {
      super({ priority: priority })
      this.libraryId = libraryId
      this.uniqueId = `EMPTY_TRASH_${libraryId}`
    }

    toString(): string {
      return `EmptyTrash(libraryId='${this.libraryId}', priority='${this.priority}')`
    }
  }

  export class AnalyzeBook extends Task {
    readonly bookId: string
    readonly uniqueId: string

    constructor({ bookId, priority = DEFAULT_PRIORITY, groupId }: AnalyzeBookParams) {
      super({ priority: priority, groupId: groupId })
      this.bookId = bookId
      this.uniqueId = `ANALYZE_BOOK_${bookId}`
    }

    toString(): string {
      return `AnalyzeBook(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class GenerateBookThumbnail extends Task {
    readonly bookId: string
    readonly uniqueId: string

    constructor({ bookId, priority = DEFAULT_PRIORITY }: GenerateBookThumbnailParams) {
      super({ priority: priority })
      this.bookId = bookId
      this.uniqueId = `GENERATE_BOOK_THUMBNAIL_${bookId}`
    }

    toString(): string {
      return `GenerateBookThumbnail(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class RefreshBookMetadata extends Task {
    readonly bookId: string
    readonly capabilities: ReadonlySet<BookMetadataPatchCapability>
    readonly uniqueId: string

    constructor({ bookId, capabilities, priority = DEFAULT_PRIORITY, groupId }: RefreshBookMetadataParams) {
      super({ priority: priority, groupId: groupId })
      this.bookId = bookId
      this.capabilities = capabilities
      this.uniqueId = `REFRESH_BOOK_METADATA_${bookId}`
    }

    toString(): string {
      return `RefreshBookMetadata(bookId='${this.bookId}', capabilities=${str(this.capabilities)}, priority='${this.priority}')`
    }
  }

  export class HashBook extends Task {
    readonly bookId: string
    readonly uniqueId: string

    constructor({ bookId, priority = DEFAULT_PRIORITY }: HashBookParams) {
      super({ priority: priority })
      this.bookId = bookId
      this.uniqueId = `HASH_BOOK_${bookId}`
    }

    toString(): string {
      return `HashBook(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class HashBookPages extends Task {
    readonly bookId: string
    readonly uniqueId: string

    constructor({ bookId, priority = DEFAULT_PRIORITY }: HashBookPagesParams) {
      super({ priority: priority })
      this.bookId = bookId
      this.uniqueId = `HASH_BOOK_PAGES_${bookId}`
    }

    toString(): string {
      return `HashBookPages(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class HashBookKoreader extends Task {
    readonly bookId: string
    readonly uniqueId: string

    constructor({ bookId, priority = DEFAULT_PRIORITY }: HashBookKoreaderParams) {
      super({ priority: priority })
      this.bookId = bookId
      this.uniqueId = `HASH_BOOK_KOREADER_${bookId}`
    }

    toString(): string {
      return `HashBookKoreader(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class RefreshSeriesMetadata extends Task {
    readonly seriesId: string
    readonly uniqueId: string

    constructor({ seriesId, priority = DEFAULT_PRIORITY }: RefreshSeriesMetadataParams) {
      super({ priority: priority, groupId: seriesId })
      this.seriesId = seriesId
      this.uniqueId = `REFRESH_SERIES_METADATA_${seriesId}`
    }

    toString(): string {
      return `RefreshSeriesMetadata(seriesId='${this.seriesId}', priority='${this.priority}')`
    }
  }

  export class AggregateSeriesMetadata extends Task {
    readonly seriesId: string
    readonly uniqueId: string

    constructor({ seriesId, priority = DEFAULT_PRIORITY }: AggregateSeriesMetadataParams) {
      super({ priority: priority, groupId: seriesId })
      this.seriesId = seriesId
      this.uniqueId = `AGGREGATE_SERIES_METADATA_${seriesId}`
    }

    toString(): string {
      return `AggregateSeriesMetadata(seriesId='${this.seriesId}', priority='${this.priority}')`
    }
  }

  export class RefreshBookLocalArtwork extends Task {
    readonly bookId: string
    readonly uniqueId: string

    constructor({ bookId, priority = DEFAULT_PRIORITY }: RefreshBookLocalArtworkParams) {
      super({ priority: priority })
      this.bookId = bookId
      this.uniqueId = `REFRESH_BOOK_LOCAL_ARTWORK_${bookId}`
    }

    toString(): string {
      return `RefreshBookLocalArtwork(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class RefreshSeriesLocalArtwork extends Task {
    readonly seriesId: string
    readonly uniqueId: string

    constructor({ seriesId, priority = DEFAULT_PRIORITY }: RefreshSeriesLocalArtworkParams) {
      super({ priority: priority })
      this.seriesId = seriesId
      this.uniqueId = `REFRESH_SERIES_LOCAL_ARTWORK_${seriesId}`
    }

    toString(): string {
      return `RefreshSeriesLocalArtwork(seriesId=${this.seriesId}, priority='${this.priority}')`
    }
  }

  export class ImportBook extends Task {
    readonly sourceFile: string
    readonly seriesId: string
    readonly copyMode: CopyMode
    readonly destinationName: string | null
    readonly upgradeBookId: string | null
    readonly uniqueId: string

    constructor({ sourceFile, seriesId, copyMode, destinationName, upgradeBookId, priority = DEFAULT_PRIORITY }: ImportBookParams) {
      super({ priority: priority, groupId: seriesId })
      this.sourceFile = sourceFile
      this.seriesId = seriesId
      this.copyMode = copyMode
      this.destinationName = destinationName
      this.upgradeBookId = upgradeBookId
      this.uniqueId = `IMPORT_BOOK_${seriesId}_${sourceFile}`
    }

    toString(): string {
      return `ImportBook(sourceFile='${this.sourceFile}', seriesId='${this.seriesId}', copyMode=${str(this.copyMode)}, destinationName=${str(this.destinationName)}, upgradeBookId=${str(this.upgradeBookId)}, priority='${this.priority}')`
    }
  }

  export class ConvertBook extends Task {
    readonly bookId: string
    readonly uniqueId: string

    constructor({ bookId, priority = DEFAULT_PRIORITY, groupId }: ConvertBookParams) {
      super({ priority: priority, groupId: groupId })
      this.bookId = bookId
      this.uniqueId = `CONVERT_BOOK_${bookId}`
    }

    toString(): string {
      return `ConvertBook(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class RepairExtension extends Task {
    readonly bookId: string
    readonly uniqueId: string

    constructor({ bookId, priority = DEFAULT_PRIORITY, groupId }: RepairExtensionParams) {
      super({ priority: priority, groupId: groupId })
      this.bookId = bookId
      this.uniqueId = `REPAIR_EXTENSION_${bookId}`
    }

    toString(): string {
      return `RepairExtension(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class RemoveHashedPages extends Task {
    readonly bookId: string
    readonly pages: readonly BookPageNumbered[]
    readonly uniqueId: string

    constructor({ bookId, pages, priority = DEFAULT_PRIORITY }: RemoveHashedPagesParams) {
      super({ priority: priority })
      this.bookId = bookId
      this.pages = pages
      this.uniqueId = `REMOVE_HASHED_PAGES_${bookId}`
    }

    toString(): string {
      return `RemoveHashedPages(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class RebuildIndex extends Task {
    readonly entities: ReadonlySet<LuceneEntity> | null
    readonly uniqueId: string

    constructor({ entities, priority = DEFAULT_PRIORITY }: RebuildIndexParams) {
      super({ priority: priority })
      this.entities = entities
      this.uniqueId = 'REBUILD_INDEX'
    }

    toString(): string {
      return `RebuildIndex(priority='${this.priority}',entities='${str(this.entities !== null ? [...this.entities].map((it) => it.type) : null)}')`
    }
  }

  export class UpgradeIndex extends Task {
    readonly uniqueId: string

    constructor({ priority = DEFAULT_PRIORITY }: UpgradeIndexParams = {}) {
      super({ priority: priority })
      this.uniqueId = 'UPGRADE_INDEX'
    }

    toString(): string {
      return `UpgradeIndex(priority='${this.priority}')`
    }
  }

  export class DeleteBook extends Task {
    readonly bookId: string
    readonly uniqueId: string

    constructor({ bookId, priority = DEFAULT_PRIORITY }: DeleteBookParams) {
      super({ priority: priority })
      this.bookId = bookId
      this.uniqueId = `DELETE_BOOK_${bookId}`
    }

    toString(): string {
      return `DeleteBook(bookId='${this.bookId}', priority='${this.priority}')`
    }
  }

  export class DeleteSeries extends Task {
    readonly seriesId: string
    readonly uniqueId: string

    constructor({ seriesId, priority = DEFAULT_PRIORITY }: DeleteSeriesParams) {
      super({ priority: priority })
      this.seriesId = seriesId
      this.uniqueId = `DELETE_SERIES_${seriesId}`
    }

    toString(): string {
      return `DeleteSeries(seriesId='${this.seriesId}', priority='${this.priority}')`
    }
  }

  export class FindBookThumbnailsToRegenerate extends Task {
    readonly forBiggerResultOnly: boolean
    readonly uniqueId: string

    constructor({ forBiggerResultOnly, priority = DEFAULT_PRIORITY }: FindBookThumbnailsToRegenerateParams) {
      super({ priority: priority })
      this.forBiggerResultOnly = forBiggerResultOnly
      this.uniqueId = 'FIND_BOOK_THUMBNAILS_TO_REGENERATE'
    }

    toString(): string {
      return `FindBookThumbnailsToRegenerate(forBiggerResultOnly='${this.forBiggerResultOnly}', priority='${this.priority}')`
    }
  }
}

// PORT: Class.forName(TASK.CLASS) et javaClass.typeName -> registre des noms qualifiés (port/jackson.ts)
registerClass('org.gotson.komga.application.tasks.Task$ScanLibrary', Task.ScanLibrary)
registerClass('org.gotson.komga.application.tasks.Task$FindBooksToConvert', Task.FindBooksToConvert)
registerClass('org.gotson.komga.application.tasks.Task$FindBooksWithMissingPageHash', Task.FindBooksWithMissingPageHash)
registerClass('org.gotson.komga.application.tasks.Task$FindDuplicatePagesToDelete', Task.FindDuplicatePagesToDelete)
registerClass('org.gotson.komga.application.tasks.Task$EmptyTrash', Task.EmptyTrash)
registerClass('org.gotson.komga.application.tasks.Task$AnalyzeBook', Task.AnalyzeBook)
registerClass('org.gotson.komga.application.tasks.Task$GenerateBookThumbnail', Task.GenerateBookThumbnail)
registerClass('org.gotson.komga.application.tasks.Task$RefreshBookMetadata', Task.RefreshBookMetadata)
registerClass('org.gotson.komga.application.tasks.Task$HashBook', Task.HashBook)
registerClass('org.gotson.komga.application.tasks.Task$HashBookPages', Task.HashBookPages)
registerClass('org.gotson.komga.application.tasks.Task$HashBookKoreader', Task.HashBookKoreader)
registerClass('org.gotson.komga.application.tasks.Task$RefreshSeriesMetadata', Task.RefreshSeriesMetadata)
registerClass('org.gotson.komga.application.tasks.Task$AggregateSeriesMetadata', Task.AggregateSeriesMetadata)
registerClass('org.gotson.komga.application.tasks.Task$RefreshBookLocalArtwork', Task.RefreshBookLocalArtwork)
registerClass('org.gotson.komga.application.tasks.Task$RefreshSeriesLocalArtwork', Task.RefreshSeriesLocalArtwork)
registerClass('org.gotson.komga.application.tasks.Task$ImportBook', Task.ImportBook)
registerClass('org.gotson.komga.application.tasks.Task$ConvertBook', Task.ConvertBook)
registerClass('org.gotson.komga.application.tasks.Task$RepairExtension', Task.RepairExtension)
registerClass('org.gotson.komga.application.tasks.Task$RemoveHashedPages', Task.RemoveHashedPages)
registerClass('org.gotson.komga.application.tasks.Task$RebuildIndex', Task.RebuildIndex)
registerClass('org.gotson.komga.application.tasks.Task$UpgradeIndex', Task.UpgradeIndex)
registerClass('org.gotson.komga.application.tasks.Task$DeleteBook', Task.DeleteBook)
registerClass('org.gotson.komga.application.tasks.Task$DeleteSeries', Task.DeleteSeries)
registerClass('org.gotson.komga.application.tasks.Task$FindBookThumbnailsToRegenerate', Task.FindBookThumbnailsToRegenerate)

// PORT: réflexion Kotlin (paramètres des constructeurs, lus et écrits par Jackson)
// champs `val` hors constructeur (groupId, uniqueId) : Jackson les renseigne aussi en lecture
jsonFields(Task, { groupId: { nullable: 'String' }, uniqueId: { nullable: 'String' } })
jsonProperties(Task.ScanLibrary, { libraryId: 'String', scanDeep: 'Boolean', priority: 'Int' }, [], { required: ['libraryId', 'scanDeep'] })
jsonProperties(Task.FindBooksToConvert, { libraryId: 'String', priority: 'Int' }, [], { required: ['libraryId'] })
jsonProperties(Task.FindBooksWithMissingPageHash, { libraryId: 'String', priority: 'Int' }, [], { required: ['libraryId'] })
jsonProperties(Task.FindDuplicatePagesToDelete, { libraryId: 'String', priority: 'Int' }, [], { required: ['libraryId'] })
jsonProperties(Task.EmptyTrash, { libraryId: 'String', priority: 'Int' }, [], { required: ['libraryId'] })
jsonProperties(Task.AnalyzeBook, { bookId: 'String', priority: 'Int', groupId: 'String' }, [], { required: ['bookId', 'groupId'] })
jsonProperties(Task.GenerateBookThumbnail, { bookId: 'String', priority: 'Int' }, [], { required: ['bookId'] })
jsonProperties(Task.RefreshBookMetadata, { bookId: 'String', capabilities: { set: { enum: BookMetadataPatchCapability } }, priority: 'Int', groupId: 'String' }, [], { required: ['bookId', 'capabilities', 'groupId'] })
jsonProperties(Task.HashBook, { bookId: 'String', priority: 'Int' }, [], { required: ['bookId'] })
jsonProperties(Task.HashBookPages, { bookId: 'String', priority: 'Int' }, [], { required: ['bookId'] })
jsonProperties(Task.HashBookKoreader, { bookId: 'String', priority: 'Int' }, [], { required: ['bookId'] })
jsonProperties(Task.RefreshSeriesMetadata, { seriesId: 'String', priority: 'Int' }, [], { required: ['seriesId'] })
jsonProperties(Task.AggregateSeriesMetadata, { seriesId: 'String', priority: 'Int' }, [], { required: ['seriesId'] })
jsonProperties(Task.RefreshBookLocalArtwork, { bookId: 'String', priority: 'Int' }, [], { required: ['bookId'] })
jsonProperties(Task.RefreshSeriesLocalArtwork, { seriesId: 'String', priority: 'Int' }, [], { required: ['seriesId'] })
jsonProperties(Task.ImportBook, { sourceFile: 'String', seriesId: 'String', copyMode: { enum: CopyMode }, destinationName: { nullable: 'String' }, upgradeBookId: { nullable: 'String' }, priority: 'Int' }, [], { required: ['sourceFile', 'seriesId', 'copyMode'] })
jsonProperties(Task.ConvertBook, { bookId: 'String', priority: 'Int', groupId: 'String' }, [], { required: ['bookId', 'groupId'] })
jsonProperties(Task.RepairExtension, { bookId: 'String', priority: 'Int', groupId: 'String' }, [], { required: ['bookId', 'groupId'] })
jsonProperties(Task.RemoveHashedPages, { bookId: 'String', pages: { list: { class: BookPageNumbered } }, priority: 'Int' }, [], { required: ['bookId', 'pages'] })
jsonProperties(Task.RebuildIndex, { entities: { nullable: { set: { enum: LuceneEntity } } }, priority: 'Int' }, [], { required: [] })
jsonProperties(Task.UpgradeIndex, { priority: 'Int' }, [], { required: [] })
jsonProperties(Task.DeleteBook, { bookId: 'String', priority: 'Int' }, [], { required: ['bookId'] })
jsonProperties(Task.DeleteSeries, { seriesId: 'String', priority: 'Int' }, [], { required: ['seriesId'] })
jsonProperties(Task.FindBookThumbnailsToRegenerate, { forBiggerResultOnly: 'Boolean', priority: 'Int' }, [], { required: ['forBiggerResultOnly'] })
