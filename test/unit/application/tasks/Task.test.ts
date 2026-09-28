// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/tasks/TaskOracleTest.kt
import { HIGHEST_PRIORITY, LOWEST_PRIORITY, Task } from '../../../../src/application/tasks/Task.js'
import { BookMetadataPatchCapability } from '../../../../src/domain/model/BookMetadataPatch.js'
import { BookPageNumbered } from '../../../../src/domain/model/BookPageNumbered.js'
import { CopyMode } from '../../../../src/domain/model/CopyMode.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { LuceneEntity } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { ObjectMapper } from '../../../../src/port/jackson-mapper.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('application/tasks/Task')

const mapper = new ObjectMapper()

/** nom simple, uniqueId, priorité, groupId, toString, charge JSON, toString (trié), uniqueId et groupId après un aller-retour JSON */
function t(task: Task): unknown[] {
  const json = mapper.writeValueAsString(task)
  // après un aller-retour JSON, l'ordre des HashSet d'enums dépend du hash d'identité côté JVM : caractères triés
  const back = mapper.readValue<Task>(json, { class: task.constructor as new (...args: never[]) => Task })
  return [task.constructor.name, task.uniqueId, task.priority, task.groupId, task.toString(), json, [...String(back)].sort().join(''), back.uniqueId, back.groupId]
}

const pages = [
  new BookPageNumbered({ fileName: 'p1.jpg', mediaType: 'image/jpeg', dimension: new Dimension({ width: 10, height: 20 }), fileHash: 'hash1', fileSize: 123, pageNumber: 1 }),
  new BookPageNumbered({ fileName: 'p2.png', mediaType: 'image/png', pageNumber: 2 }),
]

func('toString@27', () => {
  kase('default', () => t(new Task.ScanLibrary({ libraryId: 'L1', scanDeep: false })))
  kase('deep, priority', () => t(new Task.ScanLibrary({ libraryId: "L'1", scanDeep: true, priority: HIGHEST_PRIORITY })))
})
func('toString@36', () => {
  kase('default', () => t(new Task.FindBooksToConvert({ libraryId: 'L1' })))
  kase('priority', () => t(new Task.FindBooksToConvert({ libraryId: 'L1', priority: -3 })))
})
func('toString@45', () => {
  kase('default', () => t(new Task.FindBooksWithMissingPageHash({ libraryId: 'L1' })))
  kase('priority', () => t(new Task.FindBooksWithMissingPageHash({ libraryId: '', priority: LOWEST_PRIORITY })))
})
func('toString@54', () => {
  kase('default', () => t(new Task.FindDuplicatePagesToDelete({ libraryId: 'L1' })))
  kase('priority', () => t(new Task.FindDuplicatePagesToDelete({ libraryId: 'L 2', priority: 7 })))
})
func('toString@63', () => {
  kase('default', () => t(new Task.EmptyTrash({ libraryId: 'L1' })))
  kase('priority', () => t(new Task.EmptyTrash({ libraryId: 'L1', priority: 100 })))
})
func('toString@73', () => {
  kase('default', () => t(new Task.AnalyzeBook({ bookId: 'B1', groupId: 'S1' })))
  kase('priority', () => t(new Task.AnalyzeBook({ bookId: 'B1', priority: 6, groupId: 'S"1' })))
})
func('toString@82', () => {
  kase('default', () => t(new Task.GenerateBookThumbnail({ bookId: 'B1' })))
  kase('priority', () => t(new Task.GenerateBookThumbnail({ bookId: 'B1', priority: 1 })))
})
func('toString@93', () => {
  kase('all capabilities', () => t(new Task.RefreshBookMetadata({ bookId: 'B1', capabilities: new Set(BookMetadataPatchCapability.entries()), groupId: 'S1' })))
  kase('some capabilities', () =>
    t(new Task.RefreshBookMetadata({ bookId: 'B1', capabilities: new Set([BookMetadataPatchCapability.TAGS, BookMetadataPatchCapability.TITLE]), priority: 2, groupId: 'S1' })),
  )
  kase('no capability', () => t(new Task.RefreshBookMetadata({ bookId: 'B1', capabilities: new Set(), groupId: 'S1' })))
})
func('toString@102', () => {
  kase('default', () => t(new Task.HashBook({ bookId: 'B1' })))
  kase('priority', () => t(new Task.HashBook({ bookId: 'B1', priority: LOWEST_PRIORITY })))
})
func('toString@111', () => {
  kase('default', () => t(new Task.HashBookPages({ bookId: 'B1' })))
  kase('priority', () => t(new Task.HashBookPages({ bookId: 'B1', priority: 5 })))
})
func('toString@120', () => {
  kase('default', () => t(new Task.HashBookKoreader({ bookId: 'B1' })))
  kase('priority', () => t(new Task.HashBookKoreader({ bookId: 'B1', priority: 0 })))
})
func('toString@129', () => {
  kase('default', () => t(new Task.RefreshSeriesMetadata({ seriesId: 'S1' })))
  kase('priority', () => t(new Task.RefreshSeriesMetadata({ seriesId: 'S1', priority: 8 })))
})
func('toString@138', () => {
  kase('default', () => t(new Task.AggregateSeriesMetadata({ seriesId: 'S1' })))
  kase('priority', () => t(new Task.AggregateSeriesMetadata({ seriesId: 'S1', priority: 3 })))
})
func('toString@147', () => {
  kase('default', () => t(new Task.RefreshBookLocalArtwork({ bookId: 'B1' })))
  kase('priority', () => t(new Task.RefreshBookLocalArtwork({ bookId: 'B1', priority: 9 })))
})
func('toString@156', () => {
  kase('default', () => t(new Task.RefreshSeriesLocalArtwork({ seriesId: 'S1' })))
  kase('priority', () => t(new Task.RefreshSeriesLocalArtwork({ seriesId: 'S1', priority: 2 })))
})
func('toString@169', () => {
  kase('nulls', () => t(new Task.ImportBook({ sourceFile: '/tmp/a b.cbz', seriesId: 'S1', copyMode: CopyMode.COPY, destinationName: null, upgradeBookId: null })))
  kase('all fields', () =>
    t(new Task.ImportBook({ sourceFile: '/tmp/é.cbz', seriesId: 'S1', copyMode: CopyMode.HARDLINK, destinationName: 'dest name', upgradeBookId: 'B9', priority: 6 })),
  )
  kase('move', () => t(new Task.ImportBook({ sourceFile: '', seriesId: 'S1', copyMode: CopyMode.MOVE, destinationName: '', upgradeBookId: '' })))
})
func('toString@179', () => {
  kase('default', () => t(new Task.ConvertBook({ bookId: 'B1', groupId: 'S1' })))
  kase('priority', () => t(new Task.ConvertBook({ bookId: 'B1', priority: 5, groupId: 'S2' })))
})
func('toString@189', () => {
  kase('default', () => t(new Task.RepairExtension({ bookId: 'B1', groupId: 'S1' })))
  kase('priority', () => t(new Task.RepairExtension({ bookId: 'B1', priority: 3, groupId: 'S2' })))
})
func('toString@199', () => {
  kase('pages', () => t(new Task.RemoveHashedPages({ bookId: 'B1', pages })))
  kase('no page', () => t(new Task.RemoveHashedPages({ bookId: 'B1', pages: [], priority: 1 })))
})
func('toString@208', () => {
  kase('all entities', () => t(new Task.RebuildIndex({ entities: null })))
  kase('some entities', () => t(new Task.RebuildIndex({ entities: new Set([LuceneEntity.Series, LuceneEntity.Book]), priority: 6 })))
  kase('no entity', () => t(new Task.RebuildIndex({ entities: new Set() })))
})
func('toString@216', () => {
  kase('default', () => t(new Task.UpgradeIndex()))
  kase('priority', () => t(new Task.UpgradeIndex({ priority: 0 })))
})
func('toString@225', () => {
  kase('default', () => t(new Task.DeleteBook({ bookId: 'B1' })))
  kase('priority', () => t(new Task.DeleteBook({ bookId: 'B1', priority: 8 })))
})
func('toString@234', () => {
  kase('default', () => t(new Task.DeleteSeries({ seriesId: 'S1' })))
  kase('priority', () => t(new Task.DeleteSeries({ seriesId: 'S1', priority: 7 })))
})
func('toString@243', () => {
  kase('default', () => t(new Task.FindBookThumbnailsToRegenerate({ forBiggerResultOnly: false })))
  kase('priority', () => t(new Task.FindBookThumbnailsToRegenerate({ forBiggerResultOnly: true, priority: 1 })))
})
