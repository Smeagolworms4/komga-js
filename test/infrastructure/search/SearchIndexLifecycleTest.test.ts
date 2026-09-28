// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/search/SearchIndexLifecycleTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires
import '../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import '../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../src/domain/service/LibraryLifecycle.js'
import '../../../src/domain/service/SeriesLifecycle.js'
import '../../../src/domain/service/BookLifecycle.js'
import '../../../src/domain/service/SeriesCollectionLifecycle.js'
import '../../../src/domain/service/ReadListLifecycle.js'
import '../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../src/infrastructure/search/LuceneHelper.js'
import '../../../src/infrastructure/search/SearchIndexLifecycle.js'
// PORT: équivalent du scan de composants (contexte complet de @SpringBootTest) : dépendances des services
import '../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../src/infrastructure/jooq/main/BookCommonDao.js'
import '../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import '../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../src/infrastructure/jooq/main/HistoricalEventDtoDao.js'
import '../../../src/infrastructure/jooq/main/KoboDtoDao.js'
import '../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../src/infrastructure/jooq/main/PageHashDao.js'
import '../../../src/infrastructure/jooq/main/ReadListRequestDao.js'
import '../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../src/infrastructure/jooq/main/ReadProgressDtoDao.js'
import '../../../src/infrastructure/jooq/main/ReferentialDao.js'
import '../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import '../../../src/infrastructure/jooq/main/SidecarDao.js'
import '../../../src/infrastructure/jooq/main/SyncPointDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailBookDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailReadListDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailSeriesCollectionDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailSeriesDao.js'
import '../../../src/infrastructure/jooq/tasks/TasksDao.js'
import '../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../src/infrastructure/metadata/barcode/IsbnConfiguration.js'
import '../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import '../../../src/infrastructure/security/session/SessionConfiguration.js'
import '../../../src/infrastructure/transaction/TransactionConfiguration.js'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainEvent } from '../../../src/domain/model/DomainEvent.js'
import { ReadList } from '../../../src/domain/model/ReadList.js'
import { SearchContext } from '../../../src/domain/model/SearchContext.js'
import { SeriesCollection } from '../../../src/domain/model/SeriesCollection.js'
import { BookMetadataRepository } from '../../../src/domain/persistence/BookMetadataRepository.js'
import { LibraryRepository } from '../../../src/domain/persistence/LibraryRepository.js'
import { ReadListRepository } from '../../../src/domain/persistence/ReadListRepository.js'
import { SeriesCollectionRepository } from '../../../src/domain/persistence/SeriesCollectionRepository.js'
import { SeriesMetadataRepository } from '../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../src/domain/persistence/SeriesRepository.js'
import { BookLifecycle } from '../../../src/domain/service/BookLifecycle.js'
import { LibraryLifecycle } from '../../../src/domain/service/LibraryLifecycle.js'
import { ReadListLifecycle } from '../../../src/domain/service/ReadListLifecycle.js'
import { SeriesCollectionLifecycle } from '../../../src/domain/service/SeriesCollectionLifecycle.js'
import { SeriesLifecycle } from '../../../src/domain/service/SeriesLifecycle.js'
import { LuceneEntity } from '../../../src/infrastructure/search/LuceneEntity.js'
import { LuceneHelper } from '../../../src/infrastructure/search/LuceneHelper.js'
import { SearchIndexLifecycle } from '../../../src/infrastructure/search/SearchIndexLifecycle.js'
import { Pageable } from '../../../src/port/spring-data.js'
import { ApplicationEventPublisher } from '../../../src/port/spring.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../domain/model/Utils.js'

describe('SearchIndexLifecycleTest', () => {
  // @MockkBean private lateinit var mockEventPublisher: ApplicationEventPublisher
  const mockEventPublisher = { publishEvent: vi.fn<(event: unknown) => void>() }

  const ctx = springBootTest({}, [{ type: ApplicationEventPublisher, instance: mockEventPublisher }])
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const collectionLifecycle = ctx.getBean(SeriesCollectionLifecycle)
  const collectionRepository = ctx.getBean(SeriesCollectionRepository)
  const readListLifecycle = ctx.getBean(ReadListLifecycle)
  const readListRepository = ctx.getBean(ReadListRepository)
  const searchIndexLifecycle = ctx.getBean(SearchIndexLifecycle)
  const luceneHelper = ctx.getBean(LuceneHelper)

  const library = makeLibrary()

  function captureEvents(): void {
    mockEventPublisher.publishEvent.mockImplementation((event) => {
      searchIndexLifecycle.consumeEvents(event as DomainEvent)
    })
  }

  beforeAll(() => {
    captureEvents()
    libraryRepository.insert(library)
  })

  beforeEach(() => {
    captureEvents()
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
    collectionRepository.findAll(SearchContext.empty(), Pageable.unpaged()).content.forEach((it) => {
      collectionLifecycle.deleteCollection(it)
    })
    readListRepository.findAll(SearchContext.empty(), Pageable.unpaged()).content.forEach((it) => {
      readListLifecycle.deleteReadList(it)
    })
  })

  afterAll(() => {
    captureEvents()
    libraryRepository.findAll().forEach((it) => {
      libraryLifecycle.deleteLibrary(it)
    })
    closeContext(ctx)
  })

  describe('Book', () => {
    it('given empty index when adding an entity then it is added to the index', () => {
      const series = seriesLifecycle.createSeries(makeSeries('Series', { libraryId: library.id }))
      seriesLifecycle.addBooks(series, [makeBook('book', { seriesId: series.id, libraryId: library.id })])

      const found = luceneHelper.searchEntitiesIds('book', LuceneEntity.Book)

      expect(found).not.toBeNull()
      expect(found).toHaveLength(1)
    })

    it('given an entity when updating then it is updated in the index', () => {
      const series = seriesLifecycle.createSeries(makeSeries('Series', { libraryId: library.id }))
      const book = makeBook('book', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book])

      {
        const found = luceneHelper.searchEntitiesIds('book', LuceneEntity.Book)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }

      {
        const it = bookMetadataRepository.findById(book.id)
        bookMetadataRepository.update(it.copy({ title: 'updated' }))
      }
      mockEventPublisher.publishEvent(new DomainEvent.BookUpdated({ book }))

      {
        const found = luceneHelper.searchEntitiesIds('book', LuceneEntity.Book)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(0)
      }
      {
        const found = luceneHelper.searchEntitiesIds('updated', LuceneEntity.Book)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }
    })

    it('given an entity when deleting then it is removed from the index', () => {
      const series = seriesLifecycle.createSeries(makeSeries('Series', { libraryId: library.id }))
      const book = makeBook('book', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book])

      {
        const found = luceneHelper.searchEntitiesIds('book', LuceneEntity.Book)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }

      bookLifecycle.deleteOne(book)

      {
        const found = luceneHelper.searchEntitiesIds('book', LuceneEntity.Book)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(0)
      }
    })
  })

  describe('Series', () => {
    it('given empty index when adding an entity then it is added to the index', () => {
      seriesLifecycle.createSeries(makeSeries('Series', { libraryId: library.id }))

      const found = luceneHelper.searchEntitiesIds('series', LuceneEntity.Series)

      expect(found).not.toBeNull()
      expect(found).toHaveLength(1)
    })

    it('given an entity when updating then it is updated in the index', () => {
      const series = seriesLifecycle.createSeries(makeSeries('Series', { libraryId: library.id }))

      {
        const found = luceneHelper.searchEntitiesIds('series', LuceneEntity.Series)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ title: 'updated', titleSort: 'updated' }))
      }
      mockEventPublisher.publishEvent(new DomainEvent.SeriesUpdated({ series }))

      {
        const found = luceneHelper.searchEntitiesIds('series', LuceneEntity.Series)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(0)
      }
      {
        const found = luceneHelper.searchEntitiesIds('updated', LuceneEntity.Series)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }
    })

    it('given an entity when deleting then it is removed from the index', () => {
      const series = seriesLifecycle.createSeries(makeSeries('Series', { libraryId: library.id }))

      {
        const found = luceneHelper.searchEntitiesIds('series', LuceneEntity.Series)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }

      seriesLifecycle.deleteMany([series])

      {
        const found = luceneHelper.searchEntitiesIds('series', LuceneEntity.Series)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(0)
      }
    })
  })

  describe('Collection', () => {
    it('given empty index when adding an entity then it is added to the index', () => {
      const collection = new SeriesCollection({ name: 'collection' })
      collectionLifecycle.addCollection(collection)

      const found = luceneHelper.searchEntitiesIds('collection', LuceneEntity.Collection)

      expect(found).not.toBeNull()
      expect(found).toHaveLength(1)
    })

    it('given an entity when updating then it is updated in the index', () => {
      const collection = new SeriesCollection({ name: 'collection' })
      collectionLifecycle.addCollection(collection)

      {
        const found = luceneHelper.searchEntitiesIds('collection', LuceneEntity.Collection)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }

      {
        const it = collectionRepository.findByIdOrNull(collection.id, SearchContext.empty())
        if (it !== null) collectionRepository.update(it.copy({ name: 'updated' }))
      }
      mockEventPublisher.publishEvent(new DomainEvent.CollectionUpdated({ collection }))

      {
        const found = luceneHelper.searchEntitiesIds('collection', LuceneEntity.Collection)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(0)
      }
      {
        const found = luceneHelper.searchEntitiesIds('updated', LuceneEntity.Collection)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }
    })

    it('given an entity when deleting then it is removed from the index', () => {
      const collection = new SeriesCollection({ name: 'collection' })
      collectionLifecycle.addCollection(collection)

      {
        const found = luceneHelper.searchEntitiesIds('collection', LuceneEntity.Collection)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }

      collectionLifecycle.deleteCollection(collection)

      {
        const found = luceneHelper.searchEntitiesIds('collection', LuceneEntity.Collection)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(0)
      }
    })
  })

  describe('ReadList', () => {
    it('given empty index when adding an entity then it is added to the index', () => {
      const readList = new ReadList({ name: 'readlist' })
      readListLifecycle.addReadList(readList)

      const found = luceneHelper.searchEntitiesIds('readlist', LuceneEntity.ReadList)

      expect(found).not.toBeNull()
      expect(found).toHaveLength(1)
    })

    it('given an entity when updating then it is updated in the index', () => {
      const readList = new ReadList({ name: 'readlist' })
      readListLifecycle.addReadList(readList)

      {
        const found = luceneHelper.searchEntitiesIds('readlist', LuceneEntity.ReadList)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }

      {
        const it = readListRepository.findByIdOrNull(readList.id, SearchContext.empty())
        if (it !== null) readListRepository.update(it.copy({ name: 'updated' }))
      }
      mockEventPublisher.publishEvent(new DomainEvent.ReadListUpdated({ readList }))

      {
        const found = luceneHelper.searchEntitiesIds('readlist', LuceneEntity.ReadList)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(0)
      }
      {
        const found = luceneHelper.searchEntitiesIds('updated', LuceneEntity.ReadList)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }
    })

    it('given an entity when deleting then it is removed from the index', () => {
      const readList = new ReadList({ name: 'readlist' })
      readListLifecycle.addReadList(readList)

      {
        const found = luceneHelper.searchEntitiesIds('readlist', LuceneEntity.ReadList)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(1)
      }

      readListLifecycle.deleteReadList(readList)

      {
        const found = luceneHelper.searchEntitiesIds('readlist', LuceneEntity.ReadList)
        expect(found).not.toBeNull()
        expect(found).toHaveLength(0)
      }
    })
  })
})
