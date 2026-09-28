// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/SeriesSearchTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../../src/domain/service/SeriesLifecycle.js'
import '../../../../src/domain/service/LibraryLifecycle.js'
import '../../../../src/domain/service/KomgaUserLifecycle.js'
import '../../../../src/domain/service/SeriesMetadataLifecycle.js'
// PORT: équivalent du scan de composants (contexte complet de @SpringBootTest) : dépendances des services
import '../../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../../src/infrastructure/jooq/main/BookCommonDao.js'
import '../../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import '../../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../../src/infrastructure/jooq/main/HistoricalEventDtoDao.js'
import '../../../../src/infrastructure/jooq/main/KoboDtoDao.js'
import '../../../../src/infrastructure/jooq/main/PageHashDao.js'
import '../../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../../src/infrastructure/jooq/main/ReadListRequestDao.js'
import '../../../../src/infrastructure/jooq/main/ReadProgressDtoDao.js'
import '../../../../src/infrastructure/jooq/main/ReferentialDao.js'
import '../../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import '../../../../src/infrastructure/jooq/main/SidecarDao.js'
import '../../../../src/infrastructure/jooq/main/SyncPointDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailBookDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailReadListDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailSeriesCollectionDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailSeriesDao.js'
import '../../../../src/infrastructure/jooq/tasks/TasksDao.js'
import '../../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../../src/infrastructure/metadata/barcode/IsbnConfiguration.js'
import '../../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import '../../../../src/infrastructure/security/session/SessionConfiguration.js'
import '../../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneHelper.js'
import '../../../../src/infrastructure/search/SearchIndexLifecycle.js'
import { Duration, LocalDate, LocalDateTime, ZonedDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Author } from '../../../../src/domain/model/Author.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { ReadStatus } from '../../../../src/domain/model/ReadStatus.js'
import { SearchCondition } from '../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SearchOperator } from '../../../../src/domain/model/SearchOperator.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { SeriesSearch } from '../../../../src/domain/model/SeriesSearch.js'
import { BookMetadataRepository } from '../../../../src/domain/persistence/BookMetadataRepository.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { ReadProgressRepository } from '../../../../src/domain/persistence/ReadProgressRepository.js'
import { SeriesCollectionRepository } from '../../../../src/domain/persistence/SeriesCollectionRepository.js'
import { SeriesMetadataRepository } from '../../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { SeriesMetadataLifecycle } from '../../../../src/domain/service/SeriesMetadataLifecycle.js'
import { UnpagedSorted } from '../../../../src/infrastructure/jooq/UnpagedSorted.js'
import { SeriesDao } from '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import { SeriesDtoDao } from '../../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import { IllegalArgumentException, first } from '../../../../src/port/kotlin.js'
import { Pageable, Sort } from '../../../../src/port/spring-data.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'

/** `catchThrowable { }` d'AssertJ */
function catchThrowable(block: () => unknown): unknown {
  try {
    block()
    return null
  } catch (e) {
    return e
  }
}

describe('SeriesSearchTest', () => {
  // @MockkBean private lateinit var mockEventPublisher: ApplicationEventPublisher
  const mockEventPublisher = { publishEvent: vi.fn<(event: unknown) => void>() }

  const ctx = springBootTest({}, [{ type: ApplicationEventPublisher, instance: mockEventPublisher }])
  const seriesDao = ctx.getBean(SeriesDao)
  const seriesDtoDao = ctx.getBean(SeriesDtoDao)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const readProgressRepository = ctx.getBean(ReadProgressRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const collectionRepository = ctx.getBean(SeriesCollectionRepository)
  const seriesMetadataLifecycle = ctx.getBean(SeriesMetadataLifecycle)

  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const library1 = makeLibrary()
  const library2 = makeLibrary()
  const user1 = new KomgaUser({ email: 'user1@example.org', password: 'p' })
  const user2 = new KomgaUser({ email: 'user2@example.org', password: 'p' })


  beforeAll(() => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
    libraryRepository.insert(library1)
    libraryRepository.insert(library2)
    userRepository.insert(user1)
    userRepository.insert(user2)
  })

  beforeEach(() => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
  })

  afterEach(() => {
    collectionRepository.deleteAll()
    seriesLifecycle.deleteMany(seriesRepository.findAll())
    expect(seriesDao.count()).toBe(0)
  })

  afterAll(async () => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
    for (const it of userRepository.findAll()) {
      userLifecycle.deleteUser(it)
    }
    for (const it of libraryRepository.findAll()) {
      libraryLifecycle.deleteLibrary(it)
    }
    await closeContext(ctx)
  })

  it('given some series when searching by library then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
    }
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library1.id }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.LibraryId({ operator: new SearchOperator.IsNot({ value: library1.id }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('when searching by empty aggregate then it works', () => {
    const series1 = makeSeries('1', { libraryId: library1.id })
    seriesLifecycle.createSeries(series1)
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: SearchCondition.AllOfSeries.of() })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: SearchCondition.AnyOfSeries.of() })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }
  })

  it('given some series when searching by collection then results are accurate', () => {
    const series1 = makeSeries('1', { libraryId: library1.id })
    seriesLifecycle.createSeries(series1)
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }
    const collection = new SeriesCollection({ name: 'col1', seriesIds: [series1.id] })
    collectionRepository.insert(collection)

    {
      const search = new SeriesSearch({ condition: new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: collection.id }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), new UnpagedSorted(Sort.by('collection.number'))).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), new UnpagedSorted(Sort.by('collection.number'))).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.CollectionId({ operator: new SearchOperator.IsNot({ value: collection.id }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('given some series in multiple collections when searching by collection then results are accurate', () => {
    const series1 = makeSeries('1', { libraryId: library1.id })
    seriesLifecycle.createSeries(series1)
    const series2 = makeSeries('2', { libraryId: library1.id })
    seriesLifecycle.createSeries(series2)
    const series3 = makeSeries('3', { libraryId: library1.id })
    seriesLifecycle.createSeries(series3)
    const collection1 = new SeriesCollection({ name: 'col1', seriesIds: [series1.id, series2.id, series3.id], ordered: true })
    const collection2 = new SeriesCollection({ name: 'col2', seriesIds: [series3.id, series2.id, series1.id], ordered: true })
    collectionRepository.insert(collection1)
    collectionRepository.insert(collection2)

    // search by collection 1
    {
      const search = new SeriesSearch({ condition: new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: collection1.id }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), new UnpagedSorted(Sort.by('collection.number'))).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), new UnpagedSorted(Sort.by('collection.number'))).content

      // order not guaranteed for seriesDao
      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name)).toEqual(['1', '2', '3'])
    }

    // search by collection 2
    {
      const search = new SeriesSearch({ condition: new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: collection2.id }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), new UnpagedSorted(Sort.by('collection.number'))).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), new UnpagedSorted(Sort.by('collection.number'))).content

      // order not guaranteed for seriesDao
      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name)).toEqual(['3', '2', '1'])
    }
    // search by collection 1 or 2 - order is not guaranteed in that case
    {
      const search = new SeriesSearch({ condition: SearchCondition.AnyOfSeries.of(new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: collection1.id }) }), new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: collection2.id }) })) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), new UnpagedSorted(Sort.by('collection.number'))).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), new UnpagedSorted(Sort.by('collection.number'))).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
    }
  })

  it('given some series when searching by deleted then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id }).copy({ deletedDate: LocalDateTime.now() })
      seriesLifecycle.createSeries(series)
    }
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Deleted({ operator: SearchOperator.IsTrue }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('given some series when searching by complete then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [makeBook('1', { libraryId: series.libraryId })])
      seriesLifecycle.sortBooks(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ totalBookCount: 1 }))
    }
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [makeBook('2', { libraryId: series.libraryId })])
      seriesLifecycle.sortBooks(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ totalBookCount: 2 }))
    }
    // series without total book count - will not be returned in complete or not complete
    {
      const series = makeSeries('3', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [makeBook('3', { libraryId: series.libraryId })])
      seriesLifecycle.sortBooks(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Complete({ operator: SearchOperator.IsTrue }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Complete({ operator: SearchOperator.IsFalse }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('given some series when searching by one-shot then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id }).copy({ oneshot: true })
      seriesLifecycle.createSeries(series)
    }
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.OneShot({ operator: SearchOperator.IsTrue }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.OneShot({ operator: SearchOperator.IsFalse }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('given some series when searching by release date then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      const book = makeBook('1', { libraryId: series.libraryId })
      seriesLifecycle.addBooks(series, [book])
      bookMetadataRepository.update(bookMetadataRepository.findById(book.id).copy({ releaseDate: LocalDate.now().minusDays(5) }))
      seriesMetadataLifecycle.aggregateMetadata(series)
    }
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(series, [makeBook('2', { libraryId: series.libraryId })])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.After({ dateTime: ZonedDateTime.now().minusDays(10) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.Before({ dateTime: ZonedDateTime.now() }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsInTheLast({ duration: Duration.ofDays(10) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsNotInTheLast({ duration: Duration.ofDays(10) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found).toHaveLength(0)
      expect(foundDto).toHaveLength(0)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsNotInTheLast({ duration: Duration.ofDays(1) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReleaseDate({ operator: SearchOperator.IsNull }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReleaseDate({ operator: SearchOperator.IsNotNull }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }
  })

  it('given some series when searching by tag then results are accurate', () => {
    // series with both aggregated and series tags
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      const book = makeBook('1', { libraryId: series.libraryId })
      seriesLifecycle.addBooks(series, [book])
      bookMetadataRepository.update(bookMetadataRepository.findById(book.id).copy({ tags: new Set(['horror']) }))
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ tags: new Set(['fiction']) }))
      seriesMetadataLifecycle.aggregateMetadata(series)
    }
    // series with series tag only
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ tags: new Set(['fiction']) }))
    }
    // series with aggregated tag only
    {
      const series = makeSeries('3', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      const book = makeBook('1', { libraryId: series.libraryId })
      seriesLifecycle.addBooks(series, [book])
      bookMetadataRepository.update(bookMetadataRepository.findById(book.id).copy({ tags: new Set(['fantasy']) }))
      seriesMetadataLifecycle.aggregateMetadata(series)
    }
    // series without tags
    {
      const series = makeSeries('4', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'FîCTION' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AllOfSeries({ conditions: [new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'FICTION' }) }), new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'hórror' }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AnyOfSeries({ conditions: [new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'horror' }) }), new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'notexist' }) }), new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'fantasy' }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '3'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AllOfSeries({ conditions: [new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'fiction' }) }), new SearchCondition.Tag({ operator: new SearchOperator.IsNot({ value: 'horror' }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Tag({ operator: new SearchOperator.IsNot({ value: 'fiction' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3', '4'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Tag({ operator: new SearchOperator.IsNullT() }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['4'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Tag({ operator: new SearchOperator.IsNotNullT() }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
    }
  })

  it('given some series when searching by sharing label then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ sharingLabels: new Set(['kids', 'teens']) }))
    }
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ sharingLabels: new Set(['kÎds']) }))
    }
    {
      const series = makeSeries('3', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ sharingLabels: new Set(['adult']) }))
    }
    {
      const series = makeSeries('4', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: 'kids' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AllOfSeries({ conditions: [new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: 'kids' }) }), new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: 'teens' }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AnyOfSeries({ conditions: [new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: 'teens' }) }), new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: 'notexist' }) }), new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: 'adult' }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '3'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AllOfSeries({ conditions: [new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: 'kids' }) }), new SearchCondition.SharingLabel({ operator: new SearchOperator.IsNot({ value: 'teens' }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.SharingLabel({ operator: new SearchOperator.IsNot({ value: 'kids' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3', '4'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.SharingLabel({ operator: new SearchOperator.IsNullT() }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['4'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.SharingLabel({ operator: new SearchOperator.IsNotNullT() }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
    }
  })

  it('given some series when searching by publisher then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id }).copy({ oneshot: true })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ publisher: 'marvelous' }))
    }
    {
      const series = makeSeries('2', { libraryId: library1.id }).copy({ oneshot: true })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ publisher: 'infinity' }))
    }
    {
      const series = makeSeries('3', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Publisher({ operator: new SearchOperator.Is({ value: 'mÂrvelOUS' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Publisher({ operator: new SearchOperator.IsNot({ value: 'mÂrvelOUS' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2', '3'])
    }
  })

  it('given some series when searching by language then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ language: 'en' }))
    }
    {
      const series = makeSeries('2', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ language: 'fr' }))
    }
    {
      const series = makeSeries('3', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Language({ operator: new SearchOperator.Is({ value: 'EN' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Language({ operator: new SearchOperator.IsNot({ value: 'en' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2', '3'])
    }
  })

  it('given some series when searching by genre then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ genres: new Set(['kids', 'teens']) }))
    }
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ genres: new Set(['kÎds']) }))
    }
    {
      const series = makeSeries('3', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ genres: new Set(['adult']) }))
    }
    {
      const series = makeSeries('4', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: 'kids' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AllOfSeries({ conditions: [new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: 'kids' }) }), new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: 'teens' }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AnyOfSeries({ conditions: [new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: 'teens' }) }), new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: 'notexist' }) }), new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: 'adult' }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '3'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AllOfSeries({ conditions: [new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: 'kids' }) }), new SearchCondition.Genre({ operator: new SearchOperator.IsNot({ value: 'teens' }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Genre({ operator: new SearchOperator.IsNot({ value: 'kids' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3', '4'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Genre({ operator: new SearchOperator.IsNullT() }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['4'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Genre({ operator: new SearchOperator.IsNotNullT() }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
    }
  })

  it('given some series when searching by series status then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ status: SeriesMetadata.Status.ENDED }))
    }
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ status: SeriesMetadata.Status.ONGOING }))
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.SeriesStatus({ operator: new SearchOperator.Is({ value: SeriesMetadata.Status.ENDED }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.SeriesStatus({ operator: new SearchOperator.IsNot({ value: SeriesMetadata.Status.ENDED }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AllOfSeries({ conditions: [new SearchCondition.SeriesStatus({ operator: new SearchOperator.Is({ value: SeriesMetadata.Status.ENDED }) }), new SearchCondition.SeriesStatus({ operator: new SearchOperator.Is({ value: SeriesMetadata.Status.HIATUS }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found).toHaveLength(0)
      expect(foundDto).toHaveLength(0)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AnyOfSeries({ conditions: [new SearchCondition.SeriesStatus({ operator: new SearchOperator.Is({ value: SeriesMetadata.Status.ENDED }) }), new SearchCondition.SeriesStatus({ operator: new SearchOperator.Is({ value: SeriesMetadata.Status.ONGOING }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }
  })

  it('given some series when searching by read progress then results are accurate', () => {
    // in progress series, 1/2 book read
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      const books = [1, 2].map((it) => makeBook(`${it}`, { libraryId: series.libraryId }))
      seriesLifecycle.addBooks(series, books)
      seriesLifecycle.sortBooks(series)
      readProgressRepository.save(new ReadProgress({ bookId: first(books).id, userId: user1.id, page: 5, completed: true }))
    }
    // read series
    {
      const series = makeSeries('2', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
      const book = makeBook('1', { libraryId: series.libraryId })
      seriesLifecycle.addBooks(series, [book])
      seriesLifecycle.sortBooks(series)
      readProgressRepository.save(new ReadProgress({ bookId: book.id, userId: user1.id, page: 5, completed: true }))
    }
    // unread series
    {
      const series = makeSeries('3', { libraryId: library2.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user2), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user2), Pageable.unpaged()).content

      expect(found).toHaveLength(0)
      expect(foundDto).toHaveLength(0)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user2), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user2), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(null), Pageable.unpaged()).content
      const thrown = catchThrowable(() => seriesDtoDao.findAll(search, new SearchContext(null), Pageable.unpaged()))

      expect(found).toHaveLength(0)
      expect(thrown).toBeInstanceOf(IllegalArgumentException)
    }
  })

  it('given some series when searching by author then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      const book = makeBook('1', { libraryId: series.libraryId })
      seriesLifecycle.addBooks(series, [book])
      bookMetadataRepository.update(bookMetadataRepository.findById(book.id).copy({ authors: [new Author({ name: 'john', role: 'writer' }), new Author({ name: 'jim', role: 'cover' })] }))
      seriesMetadataLifecycle.aggregateMetadata(series)
    }
    {
      const series = makeSeries('2', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      const book = makeBook('2', { libraryId: series.libraryId })
      seriesLifecycle.addBooks(series, [book])
      bookMetadataRepository.update(bookMetadataRepository.findById(book.id).copy({ authors: [new Author({ name: 'john', role: 'artist' }), new Author({ name: 'amanda', role: 'artist' })] }))
      seriesMetadataLifecycle.aggregateMetadata(series)
    }
    {
      const series = makeSeries('3', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      const book = makeBook('3', { libraryId: series.libraryId })
      seriesLifecycle.addBooks(series, [book])
      bookMetadataRepository.update(bookMetadataRepository.findById(book.id).copy({ authors: [new Author({ name: 'jack', role: 'writer' })] }))
      seriesMetadataLifecycle.aggregateMetadata(series)
    }
    {
      const series = makeSeries('4', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
    }

    // series with an author named 'john'
    {
      const search = new SeriesSearch({ condition: new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: 'john' }) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    // series with an author named 'john' with the 'writer' role
    {
      const search = new SeriesSearch({ condition: new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: 'john', role: 'writer' }) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    // series with any author with the 'writer' role
    {
      const search = new SeriesSearch({ condition: new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ role: 'writer' }) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '3'])
    }

    // series without any author named 'john' with a 'writer' role
    {
      const search = new SeriesSearch({ condition: new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ name: 'john', role: 'writer' }) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2', '3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2', '3', '4'])
    }

    // series without any author named 'john'
    {
      const search = new SeriesSearch({ condition: new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ name: 'jOhn' }) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3', '4'])
    }

    // series without any author with the 'writer' role
    {
      const search = new SeriesSearch({ condition: new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ role: 'writer' }) }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2', '4'])
    }

    // empty AuthorMatch does not apply any condition
    {
      const search = new SeriesSearch({ condition: new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch() }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3', '4'])
    }
  })

  it('given some series when searching by age rating then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ ageRating: 1 }))
    }
    {
      const series = makeSeries('2', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ ageRating: 10 }))
    }
    {
      const series = makeSeries('3', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AgeRating({ operator: new SearchOperator.Is({ value: 10 }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AgeRating({ operator: new SearchOperator.IsNot({ value: 10 }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '3'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AgeRating({ operator: new SearchOperator.GreaterThan({ value: 0 }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AgeRating({ operator: new SearchOperator.GreaterThan({ value: 5 }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AgeRating({ operator: new SearchOperator.LessThan({ value: 11 }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AgeRating({ operator: new SearchOperator.IsNullT() }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AgeRating({ operator: new SearchOperator.IsNotNullT() }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AnyOfSeries({ conditions: [new SearchCondition.AgeRating({ operator: new SearchOperator.Is({ value: 10 }) }), new SearchCondition.AgeRating({ operator: new SearchOperator.Is({ value: 1 }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.AllOfSeries({ conditions: [new SearchCondition.AgeRating({ operator: new SearchOperator.Is({ value: 10 }) }), new SearchCondition.AgeRating({ operator: new SearchOperator.Is({ value: 1 }) })] }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found).toHaveLength(0)
      expect(foundDto).toHaveLength(0)
    }
  })

  it('given some books when searching by title then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ title: 'Series 1' }))
    }
    {
      const series = makeSeries('2', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ title: 'Series two' }))
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.Is({ value: 'séRIES 1' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.IsNot({ value: 'séRIES 1' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.Contains({ value: 'séRIES' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.DoesNotContain({ value: 'TWÔ' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.BeginsWith({ value: 'séRIES' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.DoesNotBeginWith({ value: 'séRIES' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name)).toHaveLength(0)
      expect(foundDto.map((it) => it.name)).toHaveLength(0)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.EndsWith({ value: 'TWÔ' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.DoesNotEndWith({ value: 'TWÔ' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }
  })

  it('given some books when searching by titleSort then results are accurate', () => {
    {
      const series = makeSeries('1', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ titleSort: 'Series 1' }))
    }
    {
      const series = makeSeries('2', { libraryId: library1.id })
      seriesLifecycle.createSeries(series)
      seriesMetadataRepository.update(seriesMetadataRepository.findById(series.id).copy({ titleSort: 'Series 2' }))
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.TitleSort({ operator: new SearchOperator.Is({ value: 'seRIES 1' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.TitleSort({ operator: new SearchOperator.IsNot({ value: 'series 1' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.TitleSort({ operator: new SearchOperator.Contains({ value: 'series' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.TitleSort({ operator: new SearchOperator.DoesNotContain({ value: '1' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.TitleSort({ operator: new SearchOperator.BeginsWith({ value: 'series' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.TitleSort({ operator: new SearchOperator.DoesNotBeginWith({ value: 'series' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name)).toHaveLength(0)
      expect(foundDto.map((it) => it.name)).toHaveLength(0)
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.TitleSort({ operator: new SearchOperator.EndsWith({ value: '1' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new SeriesSearch({ condition: new SearchCondition.TitleSort({ operator: new SearchOperator.DoesNotEndWith({ value: '1' }) }) })
      const found = seriesDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = seriesDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

})
