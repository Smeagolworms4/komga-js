// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/BookSearchTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../../src/domain/service/BookLifecycle.js'
import '../../../../src/domain/service/SeriesLifecycle.js'
import '../../../../src/domain/service/LibraryLifecycle.js'
import '../../../../src/domain/service/KomgaUserLifecycle.js'
// PORT: équivalent du scan de composants (contexte complet de @SpringBootTest) : dépendances des services
import '../../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../../src/infrastructure/jooq/main/BookCommonDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import '../../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../../src/infrastructure/jooq/main/HistoricalEventDtoDao.js'
import '../../../../src/infrastructure/jooq/main/KoboDtoDao.js'
import '../../../../src/infrastructure/jooq/main/PageHashDao.js'
import '../../../../src/infrastructure/jooq/main/ReadListRequestDao.js'
import '../../../../src/infrastructure/jooq/main/ReadProgressDtoDao.js'
import '../../../../src/infrastructure/jooq/main/ReferentialDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
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
import { BookSearch } from '../../../../src/domain/model/BookSearch.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { MarkSelectedPreference } from '../../../../src/domain/model/MarkSelectedPreference.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { MediaProfile } from '../../../../src/domain/model/MediaProfile.js'
import { MediaType } from '../../../../src/domain/model/MediaType.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { ReadStatus } from '../../../../src/domain/model/ReadStatus.js'
import { SearchCondition } from '../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SearchOperator } from '../../../../src/domain/model/SearchOperator.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { BookMetadataRepository } from '../../../../src/domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../../src/domain/persistence/MediaRepository.js'
import { ReadListRepository } from '../../../../src/domain/persistence/ReadListRepository.js'
import { ReadProgressRepository } from '../../../../src/domain/persistence/ReadProgressRepository.js'
import { BookLifecycle } from '../../../../src/domain/service/BookLifecycle.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { UnpagedSorted } from '../../../../src/infrastructure/jooq/UnpagedSorted.js'
import { BookDao } from '../../../../src/infrastructure/jooq/main/BookDao.js'
import { BookDtoDao } from '../../../../src/infrastructure/jooq/main/BookDtoDao.js'
import { sortedMapOf } from '../../../../src/port/extra-metadata.js'
import { IllegalArgumentException } from '../../../../src/port/kotlin.js'
import { Pageable, Sort } from '../../../../src/port/spring-data.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'

describe('BookSearchTest', () => {
  // @MockkBean private lateinit var mockEventPublisher: ApplicationEventPublisher
  const mockEventPublisher = { publishEvent: vi.fn<(event: unknown) => void>() }

  const ctx = springBootTest({}, [{ type: ApplicationEventPublisher, instance: mockEventPublisher }])
  const bookDao = ctx.getBean(BookDao)
  const bookDtoDao = ctx.getBean(BookDtoDao)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const mediaRepository = ctx.getBean(MediaRepository)
  const readProgressRepository = ctx.getBean(ReadProgressRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const bookRepository = ctx.getBean(BookRepository)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const readListRepository = ctx.getBean(ReadListRepository)

  const library1 = makeLibrary()
  const library2 = makeLibrary()
  const series1 = makeSeries('Series 1').copy({ libraryId: library1.id })
  const series2 = makeSeries('Series 2').copy({ libraryId: library2.id })
  const user1 = new KomgaUser({ email: 'user1@example.org', password: 'p' })
  const user2 = new KomgaUser({ email: 'user2@example.org', password: 'p' })


  beforeAll(() => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
    libraryRepository.insert(library1)
    libraryRepository.insert(library2)
    seriesLifecycle.createSeries(series1)
    seriesLifecycle.createSeries(series2)
    userRepository.insert(user1)
    userRepository.insert(user2)
  })

  beforeEach(() => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
  })

  afterEach(() => {
    readListRepository.deleteAll()
    bookLifecycle.deleteMany(bookRepository.findAll())
    expect(bookDao.count()).toBe(0)
  })

  afterAll(() => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
    for (const it of userRepository.findAll()) {
      userLifecycle.deleteUser(it)
    }
    for (const it of libraryRepository.findAll()) {
      libraryLifecycle.deleteLibrary(it)
    }
    closeContext(ctx)
  })

  it('given some books when searching by library then results are accurate', () => {
    const book1 = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
    const book2 = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
    seriesLifecycle.addBooks(series1, [book1])
    seriesLifecycle.addBooks(series2, [book2])

    {
      const search = new BookSearch({ condition: new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library1.id }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), new UnpagedSorted(Sort.by('readList.number'))).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), new UnpagedSorted(Sort.by('readList.number'))).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.LibraryId({ operator: new SearchOperator.IsNot({ value: library1.id }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('given some books when searching by series then results are accurate', () => {
    const book1 = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
    const book2 = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
    seriesLifecycle.addBooks(series1, [book1])
    seriesLifecycle.addBooks(series2, [book2])

    {
      const search = new BookSearch({ condition: new SearchCondition.SeriesId({ operator: new SearchOperator.Is({ value: series1.id }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.SeriesId({ operator: new SearchOperator.IsNot({ value: series1.id }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('given some books when searching by read list then results are accurate', () => {
    const book1 = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
    const book2 = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
    seriesLifecycle.addBooks(series1, [book1])
    seriesLifecycle.addBooks(series2, [book2])
    const readList = new ReadList({ name: 'rl1', bookIds: sortedMapOf([1, book1.id]) })
    readListRepository.insert(readList)

    {
      const search = new BookSearch({ condition: new SearchCondition.ReadListId({ operator: new SearchOperator.Is({ value: readList.id }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReadListId({ operator: new SearchOperator.IsNot({ value: readList.id }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('given some books in multiple read lists when searching by read list then results are accurate', () => {
    const book1 = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
    const book2 = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
    seriesLifecycle.addBooks(series1, [book1])
    seriesLifecycle.addBooks(series2, [book2])
    const readList1 = new ReadList({ name: 'rl1', bookIds: sortedMapOf([1, book1.id], [2, book2.id]) })
    const readList2 = new ReadList({ name: 'rl2', bookIds: sortedMapOf([1, book2.id], [2, book1.id]) })
    readListRepository.insert(readList1)
    readListRepository.insert(readList2)

    // search by readList 1
    {
      const search = new BookSearch({ condition: new SearchCondition.ReadListId({ operator: new SearchOperator.Is({ value: readList1.id }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), new UnpagedSorted(Sort.by(Sort.Order.asc('readList.number')))).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), new UnpagedSorted(Sort.by(Sort.Order.asc('readList.number')))).content

      // order not guaranteed for bookDao
      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name)).toEqual(['1', '2'])
    }

    // search by readList 2
    {
      const search = new BookSearch({ condition: new SearchCondition.ReadListId({ operator: new SearchOperator.Is({ value: readList2.id }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), new UnpagedSorted(Sort.by(Sort.Order.asc('readList.number')))).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), new UnpagedSorted(Sort.by(Sort.Order.asc('readList.number')))).content

      // order not guaranteed for bookDao
      expect(found.map((it) => it.name).sort()).toEqual(['2', '1'].sort())
      expect(foundDto.map((it) => it.name)).toEqual(['2', '1'])
    }

    // search by readList 1 or 2 - order is not guaranteed in that case
    {
      const search = new BookSearch({
        condition: SearchCondition.AnyOfBook.of(
          new SearchCondition.ReadListId({ operator: new SearchOperator.Is({ value: readList1.id }) }),
          new SearchCondition.ReadListId({ operator: new SearchOperator.Is({ value: readList2.id }) }),
        ),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), new UnpagedSorted(Sort.by(Sort.Order.asc('readList.number')))).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), new UnpagedSorted(Sort.by(Sort.Order.asc('readList.number')))).content

      expect(found.map((it) => it.name).sort()).toEqual(['2', '1'].sort())
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2', '1'].sort())
    }
  })

  it('given some books when searching by deleted then results are accurate', () => {
    const book1 = makeBook('1', { libraryId: library1.id, seriesId: series1.id }).copy({ deletedDate: LocalDateTime.now() })
    const book2 = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
    seriesLifecycle.addBooks(series1, [book1])
    seriesLifecycle.addBooks(series2, [book2])

    {
      const search = new BookSearch({ condition: new SearchCondition.Deleted({ operator: SearchOperator.IsTrue }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('given some books when searching by title then results are accurate', () => {
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ title: 'Book 1' }))
    }
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ title: 'Book 2' }))
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.Is({ value: 'boOK 1' }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.IsNot({ value: 'book 1' }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.Contains({ value: 'book' }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.DoesNotContain({ value: '1' }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.BeginsWith({ value: 'book' }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Title({ operator: new SearchOperator.EndsWith({ value: '1' }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }
  })

  it('given some books when searching by release date then results are accurate', () => {
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ releaseDate: LocalDate.now().minusDays(5) }))
    }
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.After({ dateTime: ZonedDateTime.now().minusDays(10) }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.Before({ dateTime: ZonedDateTime.now() }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsInTheLast({ duration: Duration.ofDays(10) }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsNotInTheLast({ duration: Duration.ofDays(10) }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found).toHaveLength(0)
      expect(foundDto).toHaveLength(0)
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsNotInTheLast({ duration: Duration.ofDays(1) }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReleaseDate({ operator: SearchOperator.IsNull }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReleaseDate({ operator: SearchOperator.IsNotNull }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }
  })

  it('given some books when searching by number sort then results are accurate', () => {
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ numberSort: 1 }))
    }
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ numberSort: 10.5 }))
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.NumberSort({ operator: new SearchOperator.Is({ value: 10.5 }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.NumberSort({ operator: new SearchOperator.IsNot({ value: 10.5 }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.NumberSort({ operator: new SearchOperator.GreaterThan({ value: 0 }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.NumberSort({ operator: new SearchOperator.GreaterThan({ value: 5 }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.NumberSort({ operator: new SearchOperator.LessThan({ value: 11 }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.AnyOfBook({
          conditions: [
            new SearchCondition.NumberSort({ operator: new SearchOperator.Is({ value: 10.5 }) }),
            new SearchCondition.NumberSort({ operator: new SearchOperator.Is({ value: 1 }) }),
          ],
        }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.AllOfBook({
          conditions: [
            new SearchCondition.NumberSort({ operator: new SearchOperator.Is({ value: 10.5 }) }),
            new SearchCondition.NumberSort({ operator: new SearchOperator.Is({ value: 1 }) }),
          ],
        }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found).toHaveLength(0)
      expect(foundDto).toHaveLength(0)
    }
  })

  it('given some books when searching by tag then results are accurate', () => {
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ tags: new Set(['fiction', 'horror']) }))
    }
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ tags: new Set(['fiction']) }))
    }
    {
      const book = makeBook('3', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ tags: new Set(['fantasy']) }))
    }
    {
      const book = makeBook('4', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'FICTîON' }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.AllOfBook({
          conditions: [
            new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'FICTION' }) }),
            new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'horror' }) }),
          ],
        }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.AnyOfBook({
          conditions: [
            new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'horror' }) }),
            new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'notexist' }) }),
            new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'fantasy' }) }),
          ],
        }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '3'])
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.AllOfBook({
          conditions: [
            new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'fiction' }) }),
            new SearchCondition.Tag({ operator: new SearchOperator.IsNot({ value: 'horror' }) }),
          ],
        }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Tag({ operator: new SearchOperator.IsNot({ value: 'fiction' }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3', '4'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Tag({ operator: new SearchOperator.IsNullT() }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['4'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.Tag({ operator: new SearchOperator.IsNotNullT() }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
    }
  })

  it('given some books when searching by media status then results are accurate', () => {
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      const it = mediaRepository.findById(book.id)
      mediaRepository.update(it.copy({ status: Media.Status.READY }))
    }
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      const it = mediaRepository.findById(book.id)
      mediaRepository.update(it.copy({ status: Media.Status.ERROR }))
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.MediaStatus({ operator: new SearchOperator.IsNot({ value: Media.Status.READY }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.AllOfBook({
          conditions: [
            new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }),
            new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.ERROR }) }),
          ],
        }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found).toHaveLength(0)
      expect(foundDto).toHaveLength(0)
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.AnyOfBook({
          conditions: [
            new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }),
            new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.ERROR }) }),
          ],
        }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }
  })

  it('given some books when searching by media profile then results are accurate', () => {
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      const it = mediaRepository.findById(book.id)
      mediaRepository.update(it.copy({ mediaType: MediaType.ZIP.type }))
    }
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      const it = mediaRepository.findById(book.id)
      mediaRepository.update(it.copy({ mediaType: MediaType.RAR_4.type }))
    }
    {
      const book = makeBook('3', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      const it = mediaRepository.findById(book.id)
      mediaRepository.update(it.copy({ mediaType: MediaType.EPUB.type }))
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.MediaProfile({ operator: new SearchOperator.Is({ value: MediaProfile.DIVINA }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.MediaProfile({ operator: new SearchOperator.IsNot({ value: MediaProfile.EPUB }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.MediaProfile({ operator: new SearchOperator.Is({ value: MediaProfile.EPUB }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3'])
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.AllOfBook({
          conditions: [
            new SearchCondition.MediaProfile({ operator: new SearchOperator.Is({ value: MediaProfile.DIVINA }) }),
            new SearchCondition.MediaProfile({ operator: new SearchOperator.Is({ value: MediaProfile.EPUB }) }),
          ],
        }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found).toHaveLength(0)
      expect(foundDto).toHaveLength(0)
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.AnyOfBook({
          conditions: [
            new SearchCondition.MediaProfile({ operator: new SearchOperator.Is({ value: MediaProfile.DIVINA }) }),
            new SearchCondition.MediaProfile({ operator: new SearchOperator.Is({ value: MediaProfile.EPUB }) }),
          ],
        }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
    }
  })

  it('given some books when searching by read progress then results are accurate', () => {
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      readProgressRepository.save(new ReadProgress({ bookId: book.id, userId: user1.id, page: 5, completed: false }))
    }
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      readProgressRepository.save(new ReadProgress({ bookId: book.id, userId: user1.id, page: 10, completed: true }))
    }
    {
      const book = makeBook('3', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user2), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user2), Pageable.unpaged()).content

      expect(found).toHaveLength(0)
      expect(foundDto).toHaveLength(0)
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(user2), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user2), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
    }

    {
      const search = new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }) })
      const found = bookDao.findAll(search.condition, new SearchContext(null), Pageable.unpaged()).content
      // PORT: catchThrowable { } -> try / catch
      let thrown: unknown = null
      try {
        bookDtoDao.findAll(search, new SearchContext(null), Pageable.unpaged())
      } catch (e) {
        thrown = e
      }

      expect(found).toHaveLength(0)
      expect(thrown).toBeInstanceOf(IllegalArgumentException)
    }
  })

  it('given some books when searching by author then results are accurate', () => {
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'john', role: 'writer' }), new Author({ name: 'jim', role: 'cover' })] }))
    }
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'john', role: 'artist' }), new Author({ name: 'amanda', role: 'artist' })] }))
    }
    {
      const book = makeBook('3', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      const it = bookMetadataRepository.findById(book.id)
      bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'jack', role: 'writer' })] }))
    }
    {
      const book = makeBook('4', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
    }

    // books with an author named 'john'
    {
      const search = new BookSearch({
        condition: new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: 'jÒhn' }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2'])
    }

    // books with an author named 'john' with the 'writer' role
    {
      const search = new BookSearch({
        condition: new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: 'john', role: 'WRÎTER' }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    // books with any author with the 'writer' role
    {
      const search = new BookSearch({
        condition: new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ role: 'writer' }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '3'])
    }

    // books without any author named 'john' with a 'writer' role
    {
      const search = new BookSearch({
        condition: new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ name: 'john', role: 'writer' }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2', '3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2', '3', '4'])
    }

    // books without any author named 'john'
    {
      const search = new BookSearch({
        condition: new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ name: 'jOhn' }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['3', '4'])
    }

    // books without any author with the 'writer' role
    {
      const search = new BookSearch({
        condition: new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ role: 'writer' }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2', '4'])
    }

    // empty AuthorMatch does not apply any condition
    {
      const search = new BookSearch({
        condition: new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch() }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3', '4'])
    }
  })

  it('given some books when searching by one-shot then results are accurate', () => {
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id }).copy({ oneshot: true })
      seriesLifecycle.addBooks(series1, [book])
    }
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.OneShot({ operator: SearchOperator.IsTrue }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    {
      const search = new BookSearch({
        condition: new SearchCondition.OneShot({ operator: SearchOperator.IsFalse }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2'])
    }
  })

  it('given some books when searching by poster then results are accurate', () => {
    // book with GENERATED selected
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      bookLifecycle.addThumbnailForBook(new ThumbnailBook({ bookId: book.id, type: ThumbnailBook.Type.GENERATED, mediaType: 'image/jpeg', fileSize: 0, dimension: new Dimension({ width: 0, height: 0 }) }), MarkSelectedPreference.YES)
    }
    // book with GENERATED not selected, SIDECAR selected
    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      bookLifecycle.addThumbnailForBook(new ThumbnailBook({ bookId: book.id, type: ThumbnailBook.Type.GENERATED, mediaType: 'image/jpeg', fileSize: 0, dimension: new Dimension({ width: 0, height: 0 }) }), MarkSelectedPreference.YES)
      bookLifecycle.addThumbnailForBook(new ThumbnailBook({ bookId: book.id, type: ThumbnailBook.Type.SIDECAR, mediaType: 'image/jpeg', fileSize: 0, dimension: new Dimension({ width: 0, height: 0 }) }), MarkSelectedPreference.YES)
    }
    // book with GENERATED not selected, USER_UPLOADED selected
    {
      const book = makeBook('3', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      bookLifecycle.addThumbnailForBook(new ThumbnailBook({ bookId: book.id, type: ThumbnailBook.Type.GENERATED, mediaType: 'image/jpeg', fileSize: 0, dimension: new Dimension({ width: 0, height: 0 }) }), MarkSelectedPreference.YES)
      bookLifecycle.addThumbnailForBook(new ThumbnailBook({ bookId: book.id, type: ThumbnailBook.Type.USER_UPLOADED, mediaType: 'image/jpeg', fileSize: 0, dimension: new Dimension({ width: 0, height: 0 }) }), MarkSelectedPreference.YES)
    }
    // book without poster
    {
      const book = makeBook('4', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
    }

    // books with a poster of type GENERATED
    {
      const search = new BookSearch({
        condition: new SearchCondition.Poster({ operator: new SearchOperator.Is({ value: new SearchCondition.PosterMatch({ type: SearchCondition.PosterMatch.Type.GENERATED }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3'])
    }

    // books with a poster of type GENERATED, selected
    {
      const search = new BookSearch({
        condition: new SearchCondition.Poster({ operator: new SearchOperator.Is({ value: new SearchCondition.PosterMatch({ type: SearchCondition.PosterMatch.Type.GENERATED, selected: true }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1'])
    }

    // books with any poster not selected
    {
      const search = new BookSearch({
        condition: new SearchCondition.Poster({ operator: new SearchOperator.Is({ value: new SearchCondition.PosterMatch({ selected: false }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['2', '3'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['2', '3'])
    }

    // books without a poster of type SIDECAR
    {
      const search = new BookSearch({
        condition: new SearchCondition.Poster({ operator: new SearchOperator.IsNot({ value: new SearchCondition.PosterMatch({ type: SearchCondition.PosterMatch.Type.SIDECAR }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '3', '4'])
    }

    // books without a poster of type GENERATED
    {
      const search = new BookSearch({
        condition: new SearchCondition.Poster({ operator: new SearchOperator.IsNot({ value: new SearchCondition.PosterMatch({ type: SearchCondition.PosterMatch.Type.GENERATED }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['4'])
    }

    // books without selected poster
    {
      const search = new BookSearch({
        condition: new SearchCondition.Poster({ operator: new SearchOperator.IsNot({ value: new SearchCondition.PosterMatch({ selected: true }) }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['4'])
    }

    // empty PosterMatch does not apply any condition
    {
      const search = new BookSearch({
        condition: new SearchCondition.Poster({ operator: new SearchOperator.Is({ value: new SearchCondition.PosterMatch() }) }),
      })
      const found = bookDao.findAll(search.condition, new SearchContext(user1), Pageable.unpaged()).content
      const foundDto = bookDtoDao.findAll(search, new SearchContext(user1), Pageable.unpaged()).content

      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3', '4'])
      expect(foundDto.map((it) => it.name).sort()).toEqual(['1', '2', '3', '4'])
    }
  })
})
