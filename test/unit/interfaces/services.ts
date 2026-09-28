// Miroir de InterfacesServices (oracle/interfaces/InterfacesServices.kt) : vrais services de la couche web construits
// à la main sur une OracleDb (sans contexte), événements publiés enregistrés dans `events`.
import { BookAnalyzer } from '../../../src/domain/service/BookAnalyzer.js'
import { BookLifecycle } from '../../../src/domain/service/BookLifecycle.js'
import { KomgaSettingsProvider } from '../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { Hasher } from '../../../src/infrastructure/hash/Hasher.js'
import { KoreaderHasher } from '../../../src/infrastructure/hash/KoreaderHasher.js'
import { ImageAnalyzer } from '../../../src/infrastructure/image/ImageAnalyzer.js'
import { ImageConverter } from '../../../src/infrastructure/image/ImageConverter.js'
import { ImageType } from '../../../src/infrastructure/image/ImageType.js'
import { KepubConverter } from '../../../src/infrastructure/kobo/KepubConverter.js'
import { ContentDetector } from '../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { ZipExtractor } from '../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import { EpubExtractor } from '../../../src/infrastructure/mediacontainer/epub/EpubExtractor.js'
import { PdfExtractor } from '../../../src/infrastructure/mediacontainer/pdf/PdfExtractor.js'
import { TransactionConfiguration } from '../../../src/infrastructure/transaction/TransactionConfiguration.js'
import { CommonBookController } from '../../../src/interfaces/api/CommonBookController.js'
import { ContentRestrictionChecker } from '../../../src/interfaces/api/ContentRestrictionChecker.js'
import { OpdsGenerator } from '../../../src/interfaces/api/OpdsGenerator.js'
import { WebPubGenerator } from '../../../src/interfaces/api/WebPubGenerator.js'
import { ApplicationEventPublisher } from '../../../src/port/spring.js'
import { JdbcTransactionManager } from '../../../src/port/spring-tx.js'
import { TikaConfig } from '../../../src/port/tika.js'
import type { OracleDb } from '../db.js'

export class InterfacesServices {
  readonly events: unknown[] = []
  readonly publisher: ApplicationEventPublisher
  private readonly cache = new Map<string, unknown>()

  constructor(readonly db: OracleDb) {
    const events = this.events
    this.publisher = new (class extends ApplicationEventPublisher {
      publishEvent(event: unknown): void {
        events.push(event)
      }
    })()
  }

  private lazy<T>(name: string, create: () => T): T {
    if (!this.cache.has(name)) this.cache.set(name, create())
    return this.cache.get(name) as T
  }

  get settings(): KomgaSettingsProvider {
    return this.lazy('settings', () => new KomgaSettingsProvider(this.db.serverSettingsDao, this.publisher))
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
  get kepubConverter(): KepubConverter {
    return this.lazy('kepubConverter', () => new KepubConverter(this.settings, this.db.bookProjectionDao, null))
  }
  get pdfExtractor(): PdfExtractor {
    return this.lazy('pdfExtractor', () => new PdfExtractor(ImageType.JPEG, 1536))
  }
  get epubExtractor(): EpubExtractor {
    return this.lazy('epubExtractor', () => new EpubExtractor(this.contentDetector, this.imageAnalyzer, this.kepubConverter, 15))
  }
  get bookAnalyzer(): BookAnalyzer {
    return this.lazy(
      'bookAnalyzer',
      () => new BookAnalyzer(this.contentDetector, [new ZipExtractor(this.contentDetector, this.imageAnalyzer)], this.pdfExtractor, this.epubExtractor, this.imageConverter, this.imageAnalyzer, this.hasher, 3, this.settings, ImageType.JPEG, ImageType.JPEG),
    )
  }
  get transactionTemplate() {
    return this.lazy('transactionTemplate', () => new TransactionConfiguration().transactionTemplate(new JdbcTransactionManager(this.db.dataSource)))
  }
  get bookLifecycle(): BookLifecycle {
    const db = this.db
    return this.lazy(
      'bookLifecycle',
      () =>
        new BookLifecycle(
          db.bookDao,
          db.mediaDao,
          db.bookMetadataDao,
          db.bookProjectionDao,
          db.readProgressDao,
          db.thumbnailBookDao,
          db.readListDao,
          db.libraryDao,
          this.bookAnalyzer,
          this.imageConverter,
          this.publisher,
          this.transactionTemplate,
          this.hasher,
          this.koreaderHasher,
          db.historicalEventDao,
          this.settings,
          ImageType.JPEG,
        ),
    )
  }
  get contentRestrictionChecker(): ContentRestrictionChecker {
    const db = this.db
    return this.lazy('contentRestrictionChecker', () => new ContentRestrictionChecker(db.seriesMetadataDao, db.bookDao, db.thumbnailBookDao, db.seriesDao, db.thumbnailSeriesDao))
  }
  get commonBookController(): CommonBookController {
    const db = this.db
    return this.lazy(
      'commonBookController',
      () =>
        new CommonBookController(db.mediaDao, db.bookDao, db.bookDtoDao, db.seriesMetadataDao, this.bookLifecycle, this.bookAnalyzer, this.contentRestrictionChecker, this.contentDetector, db.readProgressDao),
    )
  }
  get webPubGenerator(): WebPubGenerator {
    return this.lazy('webPubGenerator', () => new WebPubGenerator(ImageType.JPEG, this.imageConverter, this.bookAnalyzer, this.db.mediaDao))
  }
  get opdsGenerator(): OpdsGenerator {
    return this.lazy('opdsGenerator', () => new OpdsGenerator(ImageType.JPEG, this.imageConverter, this.bookAnalyzer, this.db.mediaDao))
  }

  /** noms simples des événements enregistrés, puis vidés */
  drainEvents(): string[] {
    return this.events.splice(0).map((it) => (it as object).constructor.name)
  }
}
