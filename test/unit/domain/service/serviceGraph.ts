// Services Komga construits à la main sur une OracleDb, pour les tests à oracle de `domain/service` : miroir exact de
// `ServiceGraph` (komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/ServiceGraph.kt, branche unit-oracles).
// Collaborateurs réels, sauf : l'émetteur d'événements (les enregistre), le planificateur (enregistre les
// planifications) et le convertisseur Kepub (indisponible).
import type { Duration } from '@js-joda/core'
import { LocalDateTime } from '@js-joda/core'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LibraryScanScheduler } from '../../../../src/application/scheduler/LibraryScanScheduler.js'
import { TaskEmitter } from '../../../../src/application/tasks/TaskEmitter.js'
import { Book } from '../../../../src/domain/model/Book.js'
import { BookMetadata } from '../../../../src/domain/model/BookMetadata.js'
import { Library } from '../../../../src/domain/model/Library.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { Series } from '../../../../src/domain/model/Series.js'
import { BookAnalyzer } from '../../../../src/domain/service/BookAnalyzer.js'
import { BookConverter } from '../../../../src/domain/service/BookConverter.js'
import { BookLifecycle } from '../../../../src/domain/service/BookLifecycle.js'
import { BookMetadataLifecycle } from '../../../../src/domain/service/BookMetadataLifecycle.js'
import { FileSystemScanner } from '../../../../src/domain/service/FileSystemScanner.js'
import { MetadataAggregator } from '../../../../src/domain/service/MetadataAggregator.js'
import { MetadataApplier } from '../../../../src/domain/service/MetadataApplier.js'
import { ReadListLifecycle } from '../../../../src/domain/service/ReadListLifecycle.js'
import { ReadListMatcher } from '../../../../src/domain/service/ReadListMatcher.js'
import { SeriesCollectionLifecycle } from '../../../../src/domain/service/SeriesCollectionLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { SeriesMetadataLifecycle } from '../../../../src/domain/service/SeriesMetadataLifecycle.js'
import { KomgaSettingsProvider } from '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { Hasher } from '../../../../src/infrastructure/hash/Hasher.js'
import { KoreaderHasher } from '../../../../src/infrastructure/hash/KoreaderHasher.js'
import { ImageAnalyzer } from '../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ImageConverter } from '../../../../src/infrastructure/image/ImageConverter.js'
import { ImageType } from '../../../../src/infrastructure/image/ImageType.js'
import { MosaicGenerator } from '../../../../src/infrastructure/image/MosaicGenerator.js'
import type { KepubConverter } from '../../../../src/infrastructure/kobo/KepubConverter.js'
import { ContentDetector } from '../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { RarExtractor } from '../../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import { ZipExtractor } from '../../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import { EpubExtractor } from '../../../../src/infrastructure/mediacontainer/epub/EpubExtractor.js'
import { PdfExtractor } from '../../../../src/infrastructure/mediacontainer/pdf/PdfExtractor.js'
import { IsbnBarcodeProvider } from '../../../../src/infrastructure/metadata/barcode/IsbnBarcodeProvider.js'
import { ComicInfoProvider } from '../../../../src/infrastructure/metadata/comicrack/ComicInfoProvider.js'
import { ReadListProvider } from '../../../../src/infrastructure/metadata/comicrack/ReadListProvider.js'
import { EpubMetadataProvider } from '../../../../src/infrastructure/metadata/epub/EpubMetadataProvider.js'
import { LocalArtworkProvider } from '../../../../src/infrastructure/metadata/localartwork/LocalArtworkProvider.js'
import { MylarSeriesProvider } from '../../../../src/infrastructure/metadata/mylar/MylarSeriesProvider.js'
import { OneShotSeriesProvider } from '../../../../src/infrastructure/metadata/oneshot/OneShotSeriesProvider.js'
import { ISBNValidator } from '../../../../src/port/commons-validator.js'
import { ImageIO } from '../../../../src/port/imageio-codecs.js'
import { ByteArrayInputStream } from '../../../../src/port/java-io.js'
import { URL, pathToUrl } from '../../../../src/port/java-net.js'
import { UnsupportedOperationException } from '../../../../src/port/kotlin.js'
import { type Runnable, type ScheduledFuture, TaskScheduler } from '../../../../src/port/spring-scheduling.js'
import { JdbcTransactionManager, TransactionTemplate } from '../../../../src/port/spring-tx.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { TikaConfig } from '../../../../src/port/tika.js'
import { type Canon, Canonical, canon, canonThrowable, stableCanon } from '../../canon.js'
import type { OracleDb } from '../../db.js'
import { type ZipEntrySpec, zipBytes } from '../../infrastructure/mediacontainer/oracleZip.js'

/** Enregistre les planifications à intervalle fixe, n'exécute rien (même faux que le Kotlin) */
export class FakeScheduler extends TaskScheduler {
  readonly log: string[] = []
  scheduleAtFixedRate(_task: Runnable, _startTime: unknown, period?: Duration): ScheduledFuture {
    this.log.push(`schedule ${period}`)
    const log = this.log
    return {
      cancel: () => {
        log.push('cancel')
        return true
      },
      isCancelled: () => false,
      isDone: () => false,
    }
  }
  schedule(): ScheduledFuture {
    throw new UnsupportedOperationException()
  }
  scheduleWithFixedDelay(): ScheduledFuture {
    throw new UnsupportedOperationException()
  }
}

export class ServiceGraph {
  private readonly cache = new Map<string, unknown>()

  private lazy<T>(name: string, create: () => T): T {
    if (!this.cache.has(name)) this.cache.set(name, create())
    return this.cache.get(name) as T
  }

  readonly events: unknown[] = []
  readonly publisher: ApplicationEventPublisher

  constructor(readonly db: OracleDb) {
    const events = this.events
    this.publisher = new (class extends ApplicationEventPublisher {
      publishEvent(event: unknown): void {
        events.push(event)
      }
    })()
  }

  /** Événements publiés depuis le dernier appel */
  takeEvents(): unknown[] {
    return this.events.splice(0)
  }

  /** Type et dimensions d'une image (les images générées diffèrent en octets entre Komga et KomgaJS) */
  async describeImage(bytes: Uint8Array | null): Promise<unknown> {
    if (bytes === null) return null
    const image = await ImageIO.read(new ByteArrayInputStream(bytes))
    return [this.contentDetector.detectMediaType(new ByteArrayInputStream(bytes)), image?.width ?? null, image?.height ?? null]
  }

  /** Tâches soumises depuis le dernier appel (toString), retirées de la base des tâches */
  takeTasks(): string[] {
    const tasks = this.db.tasksDao.findAll().map((it) => it.toString().replace(/capabilities=\[([^\]]*)\]/g, (_, l: string) => `capabilities=[${l.split(', ').sort().join(', ')}]`).replace(/'[0-9A-HJKMNP-TV-Z]{13}'/g, "'<tsid>'"))
    this.db.tasksDao.deleteAll()
    return tasks
  }

  readonly scheduler = new FakeScheduler()

  get transactionTemplate(): TransactionTemplate {
    return this.lazy('transactionTemplate', () => new TransactionTemplate(new JdbcTransactionManager(this.db.dataSource)))
  }
  get contentDetector(): ContentDetector {
    return this.lazy('contentDetector', () => new ContentDetector(new TikaConfig()))
  }
  get imageAnalyzer(): ImageAnalyzer {
    return this.lazy('imageAnalyzer', () => new ImageAnalyzer())
  }
  get imageConverter(): ImageConverter {
    return this.lazy('imageConverter', () => new ImageConverter(this.imageAnalyzer, this.contentDetector))
  }
  get hasher(): Hasher {
    return this.lazy('hasher', () => new Hasher())
  }
  get koreaderHasher(): KoreaderHasher {
    return this.lazy('koreaderHasher', () => new KoreaderHasher())
  }
  get settings(): KomgaSettingsProvider {
    return this.lazy('settings', () => new KomgaSettingsProvider(this.db.serverSettingsDao, this.publisher))
  }
  get kepubConverter(): KepubConverter {
    return this.lazy('kepubConverter', () => ({ isAvailable: false }) as unknown as KepubConverter)
  }
  get epubExtractor(): EpubExtractor {
    return this.lazy('epubExtractor', () => new EpubExtractor(this.contentDetector, this.imageAnalyzer, this.kepubConverter, this.db.properties.epubDivinaLetterCountThreshold))
  }
  get pdfExtractor(): PdfExtractor {
    return this.lazy('pdfExtractor', () => new PdfExtractor(ImageType.JPEG, 3200))
  }
  get zipExtractor(): ZipExtractor {
    return this.lazy('zipExtractor', () => new ZipExtractor(this.contentDetector, this.imageAnalyzer))
  }
  get rarExtractor(): RarExtractor {
    return this.lazy('rarExtractor', () => new RarExtractor(this.contentDetector, this.imageAnalyzer))
  }
  get bookAnalyzer(): BookAnalyzer {
    return this.lazy(
      'bookAnalyzer',
      () =>
        new BookAnalyzer(
          this.contentDetector,
          [this.rarExtractor, this.zipExtractor],
          this.pdfExtractor,
          this.epubExtractor,
          this.imageConverter,
          this.imageAnalyzer,
          this.hasher,
          this.db.properties.pageHashing,
          this.settings,
          ImageType.JPEG,
          ImageType.JPEG,
        ),
    )
  }
  get mosaicGenerator(): MosaicGenerator {
    return this.lazy('mosaicGenerator', () => new MosaicGenerator(this.settings, ImageType.JPEG, this.imageConverter))
  }
  get isbnValidator(): ISBNValidator {
    return this.lazy('isbnValidator', () => new ISBNValidator(true))
  }
  get localArtworkProvider(): LocalArtworkProvider {
    return this.lazy('localArtworkProvider', () => new LocalArtworkProvider(this.contentDetector, this.imageAnalyzer))
  }
  get mylarSeriesProvider(): MylarSeriesProvider {
    return this.lazy('mylarSeriesProvider', () => new MylarSeriesProvider(this.db.mapper))
  }
  get comicInfoProvider(): ComicInfoProvider {
    return this.lazy('comicInfoProvider', () => new ComicInfoProvider(null, this.bookAnalyzer, this.isbnValidator))
  }
  get epubMetadataProvider(): EpubMetadataProvider {
    return this.lazy('epubMetadataProvider', () => new EpubMetadataProvider(this.isbnValidator))
  }
  get isbnBarcodeProvider(): IsbnBarcodeProvider {
    return this.lazy('isbnBarcodeProvider', () => new IsbnBarcodeProvider(this.bookAnalyzer, this.isbnValidator))
  }
  get oneShotSeriesProvider(): OneShotSeriesProvider {
    return this.lazy('oneShotSeriesProvider', () => new OneShotSeriesProvider(this.db.bookDao, this.db.bookMetadataDao))
  }
  get readListProvider(): ReadListProvider {
    return this.lazy('readListProvider', () => new ReadListProvider())
  }
  get fileSystemScanner(): FileSystemScanner {
    return this.lazy('fileSystemScanner', () => new FileSystemScanner([this.localArtworkProvider], [this.localArtworkProvider, this.mylarSeriesProvider]))
  }
  get metadataApplier(): MetadataApplier {
    return this.lazy('metadataApplier', () => new MetadataApplier())
  }
  get metadataAggregator(): MetadataAggregator {
    return this.lazy('metadataAggregator', () => new MetadataAggregator())
  }

  get bookConverter(): BookConverter {
    return this.lazy(
      'bookConverter',
      () =>
        new BookConverter(
          this.bookAnalyzer,
          this.fileSystemScanner,
          this.db.bookDao,
          this.db.mediaDao,
          this.db.libraryDao,
          this.transactionTemplate,
          this.publisher,
          this.db.historicalEventDao,
        ),
    )
  }
  get taskEmitter(): TaskEmitter {
    return this.lazy('taskEmitter', () => new TaskEmitter(this.db.bookDao, this.bookConverter, this.db.tasksDao, this.publisher))
  }
  get libraryScanScheduler(): LibraryScanScheduler {
    return this.lazy('libraryScanScheduler', () => new LibraryScanScheduler(this.scheduler, this.taskEmitter))
  }

  get bookLifecycle(): BookLifecycle {
    return this.lazy(
      'bookLifecycle',
      () =>
        new BookLifecycle(
          this.db.bookDao,
          this.db.mediaDao,
          this.db.bookMetadataDao,
          this.db.bookProjectionDao,
          this.db.readProgressDao,
          this.db.thumbnailBookDao,
          this.db.readListDao,
          this.db.libraryDao,
          this.bookAnalyzer,
          this.imageConverter,
          this.publisher,
          this.transactionTemplate,
          this.hasher,
          this.koreaderHasher,
          this.db.historicalEventDao,
          this.settings,
          ImageType.JPEG,
        ),
    )
  }
  get seriesLifecycle(): SeriesLifecycle {
    return this.lazy(
      'seriesLifecycle',
      () =>
        new SeriesLifecycle(
          this.db.libraryDao,
          this.db.bookDao,
          this.bookLifecycle,
          this.db.mediaDao,
          this.db.bookMetadataDao,
          this.db.seriesDao,
          this.db.thumbnailSeriesDao,
          this.db.seriesMetadataDao,
          this.db.bookMetadataAggregationDao,
          this.db.seriesCollectionDao,
          this.db.readProgressDao,
          this.taskEmitter,
          this.publisher,
          this.transactionTemplate,
          this.db.historicalEventDao,
        ),
    )
  }
  get readListMatcher(): ReadListMatcher {
    return this.lazy('readListMatcher', () => new ReadListMatcher(this.db.readListDao, this.db.readListRequestDao))
  }
  get readListLifecycle(): ReadListLifecycle {
    return this.lazy(
      'readListLifecycle',
      () =>
        new ReadListLifecycle(
          this.db.readListDao,
          this.db.thumbnailReadListDao,
          this.bookLifecycle,
          this.mosaicGenerator,
          this.readListMatcher,
          this.readListProvider,
          this.publisher,
          this.transactionTemplate,
        ),
    )
  }
  get seriesCollectionLifecycle(): SeriesCollectionLifecycle {
    return this.lazy(
      'seriesCollectionLifecycle',
      () =>
        new SeriesCollectionLifecycle(
          this.db.seriesCollectionDao,
          this.db.thumbnailSeriesCollectionDao,
          this.seriesLifecycle,
          this.mosaicGenerator,
          this.publisher,
          this.transactionTemplate,
        ),
    )
  }
  get bookMetadataLifecycle(): BookMetadataLifecycle {
    return this.lazy(
      'bookMetadataLifecycle',
      () =>
        new BookMetadataLifecycle(
          [this.isbnBarcodeProvider, this.comicInfoProvider, this.epubMetadataProvider],
          this.metadataApplier,
          this.db.mediaDao,
          this.db.bookMetadataDao,
          this.db.libraryDao,
          this.readListLifecycle,
          this.publisher,
        ),
    )
  }
  get seriesMetadataLifecycle(): SeriesMetadataLifecycle {
    return this.lazy(
      'seriesMetadataLifecycle',
      () =>
        new SeriesMetadataLifecycle(
          [this.comicInfoProvider, this.epubMetadataProvider],
          [this.mylarSeriesProvider, this.oneShotSeriesProvider],
          this.metadataApplier,
          this.metadataAggregator,
          this.db.mediaDao,
          this.db.bookMetadataDao,
          this.db.seriesMetadataDao,
          this.db.bookMetadataAggregationDao,
          this.db.libraryDao,
          this.db.bookDao,
          this.seriesCollectionLifecycle,
          this.publisher,
        ),
    )
  }
}

/** Date fixe des entités créées par les cas */
export const date = LocalDateTime.of(2020, 1, 2, 3, 4, 5)

export const library = (id: string, root: URL = new URL(`file:/libraries/${id}`)) =>
  new Library({ name: `lib ${id}`, root, id, createdDate: date, lastModifiedDate: date })

export const series = (id: string, libraryId: string, url: URL = new URL(`file:/libraries/${libraryId}/${id}`)) =>
  new Series({ name: `series ${id}`, url, fileLastModified: date, libraryId, id, createdDate: date, lastModifiedDate: date })

export const book = (
  id: string,
  seriesId: string,
  libraryId: string,
  name = `book ${id}`,
  url: URL = new URL(`file:/libraries/${libraryId}/${seriesId}/${id}.cbz`),
  number = 0,
) => new Book({ name, url, fileLastModified: date, number, seriesId, libraryId, id, createdDate: date, lastModifiedDate: date })

/** Forme canonique stable de `v` (voir `stable`), le répertoire temporaire `dir` remplacé par `<tmp>` */
export function scrub(v: unknown, dir: string | null | [string, string][]): Canonical {
  const replacements: [string, string][] = dir === null ? [] : typeof dir === 'string' ? [[dir, '<tmp>']] : dir
  const walk = (x: Canon): Canon => {
    if (typeof x === 'string') return replacements.reduce((acc, [from, to]) => acc.split(from).join(to), x)
    if (Array.isArray(x)) return x.map(walk)
    if (x !== null && typeof x === 'object') {
      const out: { [k: string]: Canon } = {}
      for (const k of Object.keys(x)) out[k] = walk(x[k] as Canon)
      return out
    }
    return x
  }
  return new Canonical(walk(stableCanon(canon(v))))
}

/** Ressource de test de Komga (test/resources) */
export const resource = (p: string) => new Uint8Array(readFileSync(join('test/resources', p)))

/** Écrit `name` dans `dir`, ZIP des entrées `entries` (OracleZip), et renvoie son URL */
export function zipFile(dir: string, name: string, entries: ZipEntrySpec[]): URL {
  const path = join(dir, name)
  writeFileSync(path, zipBytes(entries))
  return pathToUrl(path)
}

/** `scrub` du résultat de `block`, ou de l'exception levée (`dir` : répertoire temporaire, ou remplacements dans l'ordre) */
export async function attempt(dir: string | null | [string, string][], block: () => unknown): Promise<Canonical> {
  try {
    return scrub(await block(), dir)
  } catch (e) {
    return scrub(new Canonical(canonThrowable(e)), dir)
  }
}

/** Media et métadonnées créés avec un livre, comme SeriesLifecycle.addBooks */
export const media = (bookId: string) => new Media({ bookId })

export const metadata = (b: Book) => new BookMetadata({ title: b.name, number: String(b.number), numberSort: Math.fround(b.number), bookId: b.id })
