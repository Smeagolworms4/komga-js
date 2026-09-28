// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/SeriesDtoDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../../src/infrastructure/jooq/main/BookCommonDao.js'
import '../../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../../src/domain/service/SeriesLifecycle.js'
import '../../../../src/domain/service/SeriesMetadataLifecycle.js'
import '../../../../src/domain/service/LibraryLifecycle.js'
import '../../../../src/domain/service/KomgaUserLifecycle.js'
import '../../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneHelper.js'
import '../../../../src/infrastructure/search/SearchIndexLifecycle.js'
// PORT: équivalent du scan de composants (contexte complet de @SpringBootTest) : dépendances des services
import '../../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import '../../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../../src/infrastructure/jooq/main/HistoricalEventDtoDao.js'
import '../../../../src/infrastructure/jooq/main/KoboDtoDao.js'
import '../../../../src/infrastructure/jooq/main/PageHashDao.js'
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
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Author } from '../../../../src/domain/model/Author.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { ReadStatus } from '../../../../src/domain/model/ReadStatus.js'
import { SearchCondition } from '../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SearchOperator } from '../../../../src/domain/model/SearchOperator.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { SeriesSearch } from '../../../../src/domain/model/SeriesSearch.js'
import { BookMetadataRepository } from '../../../../src/domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { ReadProgressRepository } from '../../../../src/domain/persistence/ReadProgressRepository.js'
import { SeriesMetadataRepository } from '../../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { SeriesMetadataLifecycle } from '../../../../src/domain/service/SeriesMetadataLifecycle.js'
import { UnpagedSorted } from '../../../../src/infrastructure/jooq/UnpagedSorted.js'
import { SeriesDtoDao } from '../../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import { SearchIndexLifecycle } from '../../../../src/infrastructure/search/SearchIndexLifecycle.js'
import { sortedBy } from '../../../../src/port/kotlin.js'
import { PageRequest, Sort } from '../../../../src/port/spring-data.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'

describe('SeriesDtoDaoTest', () => {
  // @MockkBean private lateinit var mockEventPublisher: ApplicationEventPublisher
  const mockEventPublisher = { publishEvent: vi.fn<(event: unknown) => void>() }

  const ctx = springBootTest({}, [{ type: ApplicationEventPublisher, instance: mockEventPublisher }])
  const seriesDtoDao = ctx.getBean(SeriesDtoDao)
  const bookRepository = ctx.getBean(BookRepository)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const seriesMetadataLifecycle = ctx.getBean(SeriesMetadataLifecycle)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const readProgressRepository = ctx.getBean(ReadProgressRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const searchIndexLifecycle = ctx.getBean(SearchIndexLifecycle)

  const library = makeLibrary()
  const user = new KomgaUser({ email: 'user@example.org', password: '' })

  beforeAll(() => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
    libraryRepository.insert(library)
    userRepository.insert(user)
  })

  beforeEach(() => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
    searchIndexLifecycle.rebuildIndex()
  })

  afterAll(async () => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
    userRepository.findAll().forEach((it) => {
      userLifecycle.deleteUser(it)
    })
    libraryRepository.findAll().forEach((it) => {
      libraryLifecycle.deleteLibrary(it)
    })
    await closeContext(ctx)
  })

  function setupSeries(): void {
    ;[1, 2, 3, 4]
      .map((it) => makeSeries(`${it}`, { libraryId: library.id }))
      .forEach((series) => {
        const created = seriesLifecycle.createSeries(series)
        seriesLifecycle.addBooks(
          created,
          [1, 2, 3].map((it) => makeBook(`${it}`, { seriesId: created.id, libraryId: library.id })),
        )
        seriesLifecycle.sortBooks(created)
      })

    const series = sortedBy(seriesRepository.findAll(), (it) => it.name)
    // series "1": only in progress books
    bookRepository.findAllBySeriesId(series[0]!.id).forEach((it) => {
      readProgressRepository.save(new ReadProgress({ bookId: it.id, userId: user.id, page: 5, completed: false }))
    })
    // series "2": only read books
    bookRepository.findAllBySeriesId(series[1]!.id).forEach((it) => {
      readProgressRepository.save(new ReadProgress({ bookId: it.id, userId: user.id, page: 5, completed: true }))
    })
    // series "3": only unread books
    // series "4": read, unread, and in progress
    {
      const books = sortedBy(bookRepository.findAllBySeriesId(series[3]!.id), (it) => it.name)
      readProgressRepository.save(new ReadProgress({ bookId: books[0]!.id, userId: user.id, page: 5, completed: false }))
      readProgressRepository.save(new ReadProgress({ bookId: books[1]!.id, userId: user.id, page: 5, completed: true }))
    }
  }

  describe('SortCriteria', () => {
    it('given series when sorting by title sort then results are ordered', () => {
      // given
      seriesLifecycle.createSeries(makeSeries('Éb', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Ea', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Ec', { libraryId: library.id }))

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch(), new SearchContext(user), new UnpagedSorted(Sort.by('metadata.titleSort'))).content

      // then
      expect(found.map((it) => it.metadata.title)).toEqual(['Ea', 'Éb', 'Ec'])
    })
  })

  describe('ReadProgress', () => {
    it('given series in various read status when searching for read series then only read series are returned', () => {
      // given
      setupSeries()

      // when
      const found = sortedBy(
        seriesDtoDao.findAll(
          new SeriesSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }) }),
          new SearchContext(user),
          PageRequest.of(0, 20),
        ).content,
        (it) => it.name,
      )

      // then
      expect(found).toHaveLength(1)

      expect(found[0]!.booksReadCount).toBe(3)
      expect(found[0]!.name).toBe('2')
    })

    it('given series in various read status when searching for unread series then only unread series are returned', () => {
      // given
      setupSeries()

      // when
      const found = sortedBy(
        seriesDtoDao.findAll(
          new SeriesSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }) }),
          new SearchContext(user),
          PageRequest.of(0, 20),
        ).content,
        (it) => it.name,
      )

      // then
      expect(found).toHaveLength(1)

      expect(found[0]!.booksUnreadCount).toBe(3)
      expect(found[0]!.name).toBe('3')
    })

    it('given series in various read status when searching for in progress series then only in progress series are returned', () => {
      // given
      setupSeries()

      // when
      const found = sortedBy(
        seriesDtoDao.findAll(
          new SeriesSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }) }),
          new SearchContext(user),
          PageRequest.of(0, 20),
        ).content,
        (it) => it.name,
      )

      // then
      expect(found).toHaveLength(2)

      expect(found[0]!.booksInProgressCount).toBe(3)
      expect(found[0]!.name).toBe('1')

      expect(found[found.length - 1]!.booksInProgressCount).toBe(1)
      expect(found[found.length - 1]!.name).toBe('4')
    })

    it('given series in various read status when searching for read and unread series then only matching series are returned', () => {
      // given
      setupSeries()

      // when
      const found = sortedBy(
        seriesDtoDao.findAll(
          new SeriesSearch({
            condition: new SearchCondition.AnyOfSeries({
              conditions: [
                new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }),
                new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }),
              ],
            }),
          }),
          new SearchContext(user),
          PageRequest.of(0, 20),
        ).content,
        (it) => it.name,
      )

      // then
      expect(found).toHaveLength(2)
      expect(found.map((it) => it.name).sort()).toEqual(['2', '3'].sort())
    })

    it('given series in various read status when searching for read and in progress series then only matching series are returned', () => {
      // given
      setupSeries()

      // when
      const found = sortedBy(
        seriesDtoDao.findAll(
          new SeriesSearch({
            condition: new SearchCondition.AnyOfSeries({
              conditions: [
                new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }),
                new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }),
              ],
            }),
          }),
          new SearchContext(user),
          PageRequest.of(0, 20),
        ).content,
        (it) => it.name,
      )

      // then
      expect(found).toHaveLength(3)
      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '4'].sort())
    })

    it('given series in various read status when searching for unread and in progress series then only matching series are returned', () => {
      // given
      setupSeries()

      // when
      const found = sortedBy(
        seriesDtoDao.findAll(
          new SeriesSearch({
            condition: new SearchCondition.AnyOfSeries({
              conditions: [
                new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }),
                new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }),
              ],
            }),
          }),
          new SearchContext(user),
          PageRequest.of(0, 20),
        ).content,
        (it) => it.name,
      )

      // then
      expect(found).toHaveLength(3)
      expect(found.map((it) => it.name).sort()).toEqual(['1', '3', '4'].sort())
    })

    it('given series in various read status when searching for read and unread and in progress series then only matching series are returned', () => {
      // given
      setupSeries()

      // when
      const found = sortedBy(
        seriesDtoDao.findAll(
          new SeriesSearch({
            condition: new SearchCondition.AnyOfSeries({
              conditions: [
                new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }),
                new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }),
                new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }),
              ],
            }),
          }),
          new SearchContext(user),
          PageRequest.of(0, 20),
        ).content,
        (it) => it.name,
      )

      // then
      expect(found).toHaveLength(4)
      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3', '4'].sort())
    })

    it('given series in various read status when searching without read progress then all series are returned', () => {
      // given
      setupSeries()

      // when
      const found = sortedBy(seriesDtoDao.findAll(new SearchContext(user), PageRequest.of(0, 20)).content, (it) => it.name)

      // then
      expect(found).toHaveLength(4)
      expect(found.map((it) => it.name).sort()).toEqual(['1', '2', '3', '4'].sort())
    })
  })

  describe('FullTextSearch', () => {
    it('given series when searching by term then results are ordered by rank', () => {
      // given
      seriesLifecycle.createSeries(makeSeries('The incredible adventures of Batman, the man who is also a bat!', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'batman' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(3)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman', 'Batman and Robin', 'The incredible adventures of Batman, the man who is also a bat!'])
    })

    it('given series when searching by publisher then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ publisher: 'Vertigo' }))
      }

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'publisher:vertigo' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by status then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ status: SeriesMetadata.Status.HIATUS }))
      }

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'status:hiatus' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by reading direction then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ readingDirection: SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT }))
      }

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(
        new SeriesSearch({ fullTextSearch: 'reading_direction:left_to_right' }),
        new SearchContext(user),
        new UnpagedSorted(Sort.by('relevance')),
      ).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by age rating then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ ageRating: 12 }))
      }

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'age_rating:12' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by language then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ language: 'en-us' }))
      }

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'language:en-us' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by tags then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      const book = makeBook('Batman 01', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book])
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ tags: new Set(['seriestag']) }))
      }
      {
        const it = bookMetadataRepository.findById(book.id)
        bookMetadataRepository.update(it.copy({ tags: new Set(['booktag']) }))
      }

      seriesMetadataLifecycle.aggregateMetadata(series)
      searchIndexLifecycle.rebuildIndex()

      // when
      const foundByBookTag = seriesDtoDao.findAll(
        new SeriesSearch({ fullTextSearch: 'book_tag:booktag' }),
        new SearchContext(user),
        new UnpagedSorted(Sort.by('relevance')),
      ).content

      const notFoundByBookTag = seriesDtoDao.findAll(
        new SeriesSearch({ fullTextSearch: 'book_tag:seriestag' }),
        new SearchContext(user),
        new UnpagedSorted(Sort.by('relevance')),
      ).content

      const foundBySeriesTag = seriesDtoDao.findAll(
        new SeriesSearch({ fullTextSearch: 'series_tag:seriestag' }),
        new SearchContext(user),
        new UnpagedSorted(Sort.by('relevance')),
      ).content

      const notFoundBySeriesTag = seriesDtoDao.findAll(
        new SeriesSearch({ fullTextSearch: 'series_tag:booktag' }),
        new SearchContext(user),
        new UnpagedSorted(Sort.by('relevance')),
      ).content

      const foundByTagFromBook = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'tag:booktag' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      const foundByTagFromSeries = seriesDtoDao.findAll(
        new SeriesSearch({ fullTextSearch: 'tag:seriestag' }),
        new SearchContext(user),
        new UnpagedSorted(Sort.by('relevance')),
      ).content

      // then
      expect(foundByBookTag).toHaveLength(1)
      expect(foundByBookTag.map((it) => it.metadata.title)).toEqual(['Batman'])

      expect(notFoundByBookTag).toHaveLength(0)

      expect(foundBySeriesTag).toHaveLength(1)
      expect(foundBySeriesTag.map((it) => it.metadata.title)).toEqual(['Batman'])

      expect(notFoundBySeriesTag).toHaveLength(0)

      expect(foundByTagFromBook).toHaveLength(1)
      expect(foundByTagFromBook.map((it) => it.metadata.title)).toEqual(['Batman'])

      expect(foundByTagFromSeries).toHaveLength(1)
      expect(foundByTagFromSeries.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by genre then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ genres: new Set(['action']) }))
      }

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'genre:action' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by total book count then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ totalBookCount: 5 }))
      }

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'total_book_count:5' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by book count then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      seriesLifecycle.addBooks(series, [
        makeBook('Batman 01', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman 02', { seriesId: series.id, libraryId: library.id }),
      ])
      seriesLifecycle.sortBooks(series)
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = seriesMetadataRepository.findById(series.id)
        seriesMetadataRepository.update(it.copy({ genres: new Set(['action']) }))
      }

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'book_count:2' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by authors then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      const book = makeBook('Batman 01', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book])
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = bookMetadataRepository.findById(book.id)
        bookMetadataRepository.update(
          it.copy({
            authors: [new Author({ name: 'David', role: 'penciller' })],
          }),
        )
      }

      seriesMetadataLifecycle.aggregateMetadata(series)
      searchIndexLifecycle.rebuildIndex()

      // when
      const foundGeneric = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'author:david' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      const foundByRole = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'penciller:david' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      const notFoundByRole = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'writer:david' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(foundGeneric).toHaveLength(1)
      expect(foundGeneric.map((it) => it.metadata.title)).toEqual(['Batman'])

      expect(foundByRole).toHaveLength(1)
      expect(foundByRole.map((it) => it.metadata.title)).toEqual(['Batman'])

      expect(notFoundByRole).toHaveLength(0)
    })

    it('given series when searching by release year then results are matched', () => {
      // given
      const series = seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }))
      const book = makeBook('Batman 01', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book])
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      {
        const it = bookMetadataRepository.findById(book.id)
        bookMetadataRepository.update(it.copy({ releaseDate: LocalDate.of(1999, 10, 10) }))
      }

      seriesMetadataLifecycle.aggregateMetadata(series)
      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'release_date:1999' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })

    it('given series when searching by deleted then results are matched', () => {
      // given
      seriesLifecycle.createSeries(makeSeries('Batman', { libraryId: library.id }).copy({ deletedDate: LocalDateTime.now() }))
      seriesLifecycle.createSeries(makeSeries('Batman and Robin', { libraryId: library.id }))

      searchIndexLifecycle.rebuildIndex()

      // when
      const found = seriesDtoDao.findAll(new SeriesSearch({ fullTextSearch: 'deleted:true' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Batman'])
    })
  })
})
