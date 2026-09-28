// Support des tests unitaires à oracle (sans jumeau Kotlin) : bases Komga en mémoire, sans contexte Spring.
// Miroir exact de `OracleDb` dans komga/src/test/kotlin/org/gotson/komga/oracle/OracleDb.kt (branche unit-oracles).
//
// - base principale : SqliteUdfDataSource (REGEXP, UDF_STRIP_ACCENTS, collations unicode) sur `:memory:`, clés
//   étrangères actives (DataSourcesConfiguration), migrée comme au démarrage de Komga (db/migration/sqlite,
//   migrations code, placeholders par défaut d'application.yml)
// - base des tâches (paresseuse) : SQLiteDataSource, migrée depuis tasks/migration/sqlite
// - `dsl` / `tasksDsl` : DSLContext de KomgaJooqConfiguration, le même pour les rôles RW et RO
// - chaque DAO de infrastructure/jooq (propriétés paresseuses, mêmes noms qu'en Kotlin), avec le batchChunkSize par
//   défaut, l'ObjectMapper de Spring Boot (`mapper`) et un index Lucene en mémoire (`lucene`).
//
// Les cas d'un fichier partagent sa base et s'exécutent dans l'ordre de déclaration (comme en Kotlin) ;
// les ids et dates « maintenant » générés par Komga sont neutralisés par `stable` (oracle.ts).
import { join } from 'node:path'
import { afterAll } from 'vitest'
import { KomgaProperties } from '../../src/infrastructure/configuration/KomgaProperties.js'
import { SqliteUdfDataSource } from '../../src/infrastructure/datasource/SqliteUdfDataSource.js'
import { KomgaJooqConfiguration } from '../../src/infrastructure/jooq/KomgaJooqConfiguration.js'
import { AuthenticationActivityDao } from '../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import { BookCommonDao } from '../../src/infrastructure/jooq/main/BookCommonDao.js'
import { BookDao } from '../../src/infrastructure/jooq/main/BookDao.js'
import { BookDtoDao } from '../../src/infrastructure/jooq/main/BookDtoDao.js'
import { BookMetadataAggregationDao } from '../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import { BookMetadataDao } from '../../src/infrastructure/jooq/main/BookMetadataDao.js'
import { BookProjectionDao } from '../../src/infrastructure/jooq/main/BookProjectionDao.js'
import { ClientSettingsDtoDao } from '../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import { HistoricalEventDao } from '../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import { HistoricalEventDtoDao } from '../../src/infrastructure/jooq/main/HistoricalEventDtoDao.js'
import { KoboDtoDao } from '../../src/infrastructure/jooq/main/KoboDtoDao.js'
import { KomgaUserDao } from '../../src/infrastructure/jooq/main/KomgaUserDao.js'
import { LibraryDao } from '../../src/infrastructure/jooq/main/LibraryDao.js'
import { MediaDao } from '../../src/infrastructure/jooq/main/MediaDao.js'
import { PageHashDao } from '../../src/infrastructure/jooq/main/PageHashDao.js'
import { ReadListDao } from '../../src/infrastructure/jooq/main/ReadListDao.js'
import { ReadListRequestDao } from '../../src/infrastructure/jooq/main/ReadListRequestDao.js'
import { ReadProgressDao } from '../../src/infrastructure/jooq/main/ReadProgressDao.js'
import { ReadProgressDtoDao } from '../../src/infrastructure/jooq/main/ReadProgressDtoDao.js'
import { ReferentialDao } from '../../src/infrastructure/jooq/main/ReferentialDao.js'
import { SeriesCollectionDao } from '../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import { SeriesDao } from '../../src/infrastructure/jooq/main/SeriesDao.js'
import { SeriesDtoDao } from '../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import { SeriesMetadataDao } from '../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import { ServerSettingsDao } from '../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import { SidecarDao } from '../../src/infrastructure/jooq/main/SidecarDao.js'
import { SyncPointDao } from '../../src/infrastructure/jooq/main/SyncPointDao.js'
import { ThumbnailBookDao } from '../../src/infrastructure/jooq/main/ThumbnailBookDao.js'
import { ThumbnailReadListDao } from '../../src/infrastructure/jooq/main/ThumbnailReadListDao.js'
import { ThumbnailSeriesCollectionDao } from '../../src/infrastructure/jooq/main/ThumbnailSeriesCollectionDao.js'
import { ThumbnailSeriesDao } from '../../src/infrastructure/jooq/main/ThumbnailSeriesDao.js'
import { TasksDao } from '../../src/infrastructure/jooq/tasks/TasksDao.js'
import { LuceneHelper } from '../../src/infrastructure/search/LuceneHelper.js'
import { LuceneSyncCommitter } from '../../src/infrastructure/search/LuceneSyncCommitter.js'
import { MultiLingualAnalyzer } from '../../src/infrastructure/search/MultiLingualAnalyzer.js'
import { MultiLingualNGramAnalyzer } from '../../src/infrastructure/search/MultiLingualNGramAnalyzer.js'
import { MAIN_CODE_MIGRATIONS } from '../../src/port/flyway-migrations.js'
import { Flyway } from '../../src/port/flyway.js'
import { ObjectMapper } from '../../src/port/jackson-mapper.js'
import type { DSLContext } from '../../src/port/jooq/dsl.js'
import { IndexWriter, IndexWriterConfig } from '../../src/port/lucene/index.js'
import { SearcherFactory, SearcherManager } from '../../src/port/lucene/search.js'
import { ByteBuffersDirectory } from '../../src/port/lucene/store.js'
import { resourcesDir } from '../../src/port/resources.js'
import { HikariDataSource, SQLiteDataSource } from '../../src/port/sqlite.js'

const open: OracleDb[] = []
afterAll(() => {
  for (const db of open.splice(0)) db.close()
})

function openDataSource(ds: SQLiteDataSource): HikariDataSource {
  ds.setUrl('jdbc:sqlite::memory:')
  ds.setEnforceForeignKeys(true)
  ds.setGetGeneratedKeys(false)
  return new HikariDataSource(ds)
}

export class OracleDb {
  private readonly cache = new Map<string, unknown>()

  private lazy<T>(name: string, create: () => T): T {
    if (!this.cache.has(name)) this.cache.set(name, create())
    return this.cache.get(name) as T
  }

  readonly properties = new KomgaProperties()

  readonly dataSource: HikariDataSource

  readonly dsl: DSLContext

  constructor() {
    this.dataSource = openDataSource(new SqliteUdfDataSource())
    new Flyway(this.dataSource.getConnection(), {
      sqlLocations: [join(resourcesDir(), 'db/migration/sqlite')],
      codeMigrations: MAIN_CODE_MIGRATIONS,
      codePackage: 'db.migration.sqlite',
      placeholders: {
        'library-file-hashing': 'true',
        'library-scan-startup': 'false',
        'delete-empty-collections': 'true',
        'delete-empty-read-lists': 'true',
      },
    }).migrate()
    this.dsl = new KomgaJooqConfiguration().mainDslContextRW(this.dataSource)
    open.push(this)
  }

  get tasksDataSource(): HikariDataSource {
    return this.lazy('tasksDataSource', () => {
      const ds = openDataSource(new SQLiteDataSource())
      new Flyway(ds.getConnection(), { sqlLocations: [join(resourcesDir(), 'tasks/migration/sqlite')] }).migrate()
      return ds
    })
  }

  get tasksDsl(): DSLContext {
    return this.lazy('tasksDsl', () => new KomgaJooqConfiguration().tasksDslContextRW(this.tasksDataSource))
  }

  readonly batchSize: number = this.properties.database.batchChunkSize

  /** ObjectMapper de Spring Boot (JacksonAutoConfiguration + spring.jackson.* d'application.yml) */
  get mapper(): ObjectMapper {
    return this.lazy('mapper', () => new ObjectMapper())
  }

  /** Index Lucene en mémoire (profil « test » de LuceneConfiguration), commits synchrones */
  get lucene(): LuceneHelper {
    return this.lazy('lucene', () => {
      const directory = new ByteBuffersDirectory()
      const it = this.properties.lucene.indexAnalyzer
      const indexAnalyzer = new MultiLingualNGramAnalyzer(it.minGram, it.maxGram, it.preserveOriginal)
      const indexWriter = new IndexWriter(directory, new IndexWriterConfig(indexAnalyzer))
      const searcherManager = new SearcherManager(indexWriter, new SearcherFactory())
      return new LuceneHelper(directory, new MultiLingualAnalyzer(), indexAnalyzer, indexWriter, searcherManager, new LuceneSyncCommitter(indexWriter, searcherManager))
    })
  }

  get authenticationActivityDao(): AuthenticationActivityDao {
    return this.lazy('authenticationActivityDao', () => new AuthenticationActivityDao(this.dsl, this.dsl))
  }

  get bookCommonDao(): BookCommonDao {
    return this.lazy('bookCommonDao', () => new BookCommonDao(this.dsl, this.dsl))
  }

  get bookDao(): BookDao {
    return this.lazy('bookDao', () => new BookDao(this.dsl, this.dsl, this.batchSize))
  }

  get bookDtoDao(): BookDtoDao {
    return this.lazy('bookDtoDao', () => new BookDtoDao(this.dsl, this.dsl, this.lucene, this.batchSize, this.bookCommonDao))
  }

  get bookMetadataAggregationDao(): BookMetadataAggregationDao {
    return this.lazy('bookMetadataAggregationDao', () => new BookMetadataAggregationDao(this.dsl, this.dsl, this.batchSize))
  }

  get bookMetadataDao(): BookMetadataDao {
    return this.lazy('bookMetadataDao', () => new BookMetadataDao(this.dsl, this.dsl, this.batchSize))
  }

  get bookProjectionDao(): BookProjectionDao {
    return this.lazy('bookProjectionDao', () => new BookProjectionDao(this.dsl, this.dsl, this.batchSize))
  }

  get clientSettingsDtoDao(): ClientSettingsDtoDao {
    return this.lazy('clientSettingsDtoDao', () => new ClientSettingsDtoDao(this.dsl, this.dsl))
  }

  get historicalEventDao(): HistoricalEventDao {
    return this.lazy('historicalEventDao', () => new HistoricalEventDao(this.dsl))
  }

  get historicalEventDtoDao(): HistoricalEventDtoDao {
    return this.lazy('historicalEventDtoDao', () => new HistoricalEventDtoDao(this.dsl, this.dsl))
  }

  get koboDtoDao(): KoboDtoDao {
    return this.lazy('koboDtoDao', () => new KoboDtoDao(this.dsl, this.dsl, this.mapper))
  }

  get komgaUserDao(): KomgaUserDao {
    return this.lazy('komgaUserDao', () => new KomgaUserDao(this.dsl, this.dsl))
  }

  get libraryDao(): LibraryDao {
    return this.lazy('libraryDao', () => new LibraryDao(this.dsl, this.dsl))
  }

  get mediaDao(): MediaDao {
    return this.lazy('mediaDao', () => new MediaDao(this.dsl, this.dsl, this.batchSize, this.mapper))
  }

  get pageHashDao(): PageHashDao {
    return this.lazy('pageHashDao', () => new PageHashDao(this.dsl, this.dsl))
  }

  get readListDao(): ReadListDao {
    return this.lazy('readListDao', () => new ReadListDao(this.dsl, this.dsl, this.lucene, this.batchSize))
  }

  get readListRequestDao(): ReadListRequestDao {
    return this.lazy('readListRequestDao', () => new ReadListRequestDao(this.dsl, this.dsl))
  }

  get readProgressDao(): ReadProgressDao {
    return this.lazy('readProgressDao', () => new ReadProgressDao(this.dsl, this.dsl, this.batchSize, this.mapper))
  }

  get readProgressDtoDao(): ReadProgressDtoDao {
    return this.lazy('readProgressDtoDao', () => new ReadProgressDtoDao(this.dsl, this.dsl))
  }

  get referentialDao(): ReferentialDao {
    return this.lazy('referentialDao', () => new ReferentialDao(this.dsl, this.dsl))
  }

  get seriesCollectionDao(): SeriesCollectionDao {
    return this.lazy('seriesCollectionDao', () => new SeriesCollectionDao(this.dsl, this.dsl, this.lucene, this.batchSize))
  }

  get seriesDao(): SeriesDao {
    return this.lazy('seriesDao', () => new SeriesDao(this.dsl, this.dsl, this.batchSize))
  }

  get seriesDtoDao(): SeriesDtoDao {
    return this.lazy('seriesDtoDao', () => new SeriesDtoDao(this.dsl, this.dsl, this.lucene, this.batchSize))
  }

  get seriesMetadataDao(): SeriesMetadataDao {
    return this.lazy('seriesMetadataDao', () => new SeriesMetadataDao(this.dsl, this.dsl, this.batchSize))
  }

  get serverSettingsDao(): ServerSettingsDao {
    return this.lazy('serverSettingsDao', () => new ServerSettingsDao(this.dsl, this.dsl))
  }

  get sidecarDao(): SidecarDao {
    return this.lazy('sidecarDao', () => new SidecarDao(this.dsl, this.dsl, this.batchSize))
  }

  get syncPointDao(): SyncPointDao {
    return this.lazy('syncPointDao', () => new SyncPointDao(this.dsl, this.dsl, this.bookCommonDao))
  }

  get thumbnailBookDao(): ThumbnailBookDao {
    return this.lazy('thumbnailBookDao', () => new ThumbnailBookDao(this.dsl, this.dsl, this.batchSize))
  }

  get thumbnailReadListDao(): ThumbnailReadListDao {
    return this.lazy('thumbnailReadListDao', () => new ThumbnailReadListDao(this.dsl, this.dsl))
  }

  get thumbnailSeriesCollectionDao(): ThumbnailSeriesCollectionDao {
    return this.lazy('thumbnailSeriesCollectionDao', () => new ThumbnailSeriesCollectionDao(this.dsl, this.dsl))
  }

  get thumbnailSeriesDao(): ThumbnailSeriesDao {
    return this.lazy('thumbnailSeriesDao', () => new ThumbnailSeriesDao(this.dsl, this.dsl, this.batchSize))
  }

  get tasksDao(): TasksDao {
    return this.lazy('tasksDao', () => new TasksDao(this.tasksDsl, this.tasksDsl, this.properties.tasksDb.batchChunkSize, this.mapper))
  }

  /** Lignes d'une requête SQL brute sur la base principale (valeurs SQLite : chaîne, nombre, octets, null) */
  rawQuery(sql: string): unknown[][] {
    return this.dataSource.getConnection().prepare(sql).raw().all() as unknown[][]
  }

  close(): void {
    this.dataSource.close()
    if (this.cache.has('tasksDataSource')) this.tasksDataSource.close()
  }
}
