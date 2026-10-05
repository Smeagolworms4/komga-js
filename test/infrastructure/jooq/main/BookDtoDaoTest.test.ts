// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/BookDtoDaoTest.kt@2ab7a5a61a8b8bb12a6edd576fed380b4b613c99
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
import '../../../../src/domain/service/BookLifecycle.js'
import '../../../../src/domain/service/SeriesLifecycle.js'
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
import { BookSearch } from '../../../../src/domain/model/BookSearch.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { ReadStatus } from '../../../../src/domain/model/ReadStatus.js'
import { SearchCondition } from '../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SearchOperator } from '../../../../src/domain/model/SearchOperator.js'
import { BookMetadataRepository } from '../../../../src/domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../../src/domain/persistence/MediaRepository.js'
import { ReadProgressRepository } from '../../../../src/domain/persistence/ReadProgressRepository.js'
import { BookLifecycle } from '../../../../src/domain/service/BookLifecycle.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { UnpagedSorted } from '../../../../src/infrastructure/jooq/UnpagedSorted.js'
import { BookDtoDao } from '../../../../src/infrastructure/jooq/main/BookDtoDao.js'
import { SearchIndexLifecycle } from '../../../../src/infrastructure/search/SearchIndexLifecycle.js'
import { URL } from '../../../../src/port/java-net.js'
import { sortedBy } from '../../../../src/port/kotlin.js'
import { PageRequest, Pageable, Sort } from '../../../../src/port/spring-data.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'

describe('BookDtoDaoTest', () => {
  // @MockkBean private lateinit var mockEventPublisher: ApplicationEventPublisher
  const mockEventPublisher = { publishEvent: vi.fn<(event: unknown) => void>() }

  const ctx = springBootTest({}, [{ type: ApplicationEventPublisher, instance: mockEventPublisher }])
  const bookDtoDao = ctx.getBean(BookDtoDao)
  const bookRepository = ctx.getBean(BookRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const mediaRepository = ctx.getBean(MediaRepository)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const readProgressRepository = ctx.getBean(ReadProgressRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const searchIndexLifecycle = ctx.getBean(SearchIndexLifecycle)

  const library = makeLibrary()
  let series = makeSeries('Series')
  const user = new KomgaUser({ email: 'user@example.org', password: '' })

  beforeAll(() => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
    libraryRepository.insert(library)
    series = seriesLifecycle.createSeries(series.copy({ libraryId: library.id }))
    userRepository.insert(user)
  })

  beforeEach(() => {
    mockEventPublisher.publishEvent.mockImplementation(() => {})
  })

  afterEach(async () => {
    bookLifecycle.deleteMany(bookRepository.findAll())
    await searchIndexLifecycle.rebuildIndex()
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

  function setupBooks(): void {
    seriesLifecycle.addBooks(
      series,
      [1, 2, 3].map((it) => makeBook(`${it}`, { seriesId: series.id, libraryId: library.id })),
    )

    const books = sortedBy(bookRepository.findAll(), (it) => it.name)
    readProgressRepository.save(new ReadProgress({ bookId: books[0]!.id, userId: user.id, page: 5, completed: false }))
    readProgressRepository.save(new ReadProgress({ bookId: books[1]!.id, userId: user.id, page: 5, completed: true }))
  }

  describe('Criteria', () => {
    it('given books when searching by multiple tags then results are matched and not duplicated', () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      const book2 = makeBook('Éric le bleu', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book1, book2])

      {
        const it = bookMetadataRepository.findById(book1.id)
        bookMetadataRepository.update(it.copy({ tags: new Set(['tag1', 'tag2']) }))
      }
      {
        const it = bookMetadataRepository.findById(book2.id)
        bookMetadataRepository.update(it.copy({ tags: new Set(['tag1', 'tag2']) }))
      }

      // when
      const page = bookDtoDao.findAll(
        new BookSearch({
          condition: new SearchCondition.AnyOfBook({
            conditions: [
              new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'tag1' }) }),
              new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'tag2' }) }),
            ],
          }),
        }),
        new SearchContext(user),
        Pageable.unpaged(),
      )

      // then
      expect(page.totalElements).toBe(2)
      expect(page.content).toHaveLength(2)
      expect(page.content.map((it) => it.metadata.title)).toEqual(['Éric le rouge', 'Éric le bleu'])
    })

    it('given books when searching by multiple authors then results are matched and not duplicated', () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      const book2 = makeBook('Éric le bleu', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book1, book2])

      {
        const it = bookMetadataRepository.findById(book1.id)
        bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'Mark', role: 'writer' }), new Author({ name: 'Jim', role: 'inker' })] }))
      }
      {
        const it = bookMetadataRepository.findById(book2.id)
        bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'Mark', role: 'writer' }), new Author({ name: 'Jim', role: 'inker' })] }))
      }

      // when
      const page = bookDtoDao.findAll(
        new BookSearch({
          condition: new SearchCondition.AnyOfBook({
            conditions: [
              new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: 'Mark', role: 'writer' }) }) }),
              new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: 'Jim', role: 'inker' }) }) }),
            ],
          }),
        }),
        new SearchContext(user),
        Pageable.unpaged(),
      )

      // then
      expect(page.totalElements).toBe(2)
      expect(page.content).toHaveLength(2)
      expect(page.content.map((it) => it.metadata.title)).toEqual(['Éric le rouge', 'Éric le bleu'])
    })

    it('given books when searching by any author then results are matched and not duplicated', () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      const book2 = makeBook('Éric le bleu', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book1, book2])

      {
        const it = bookMetadataRepository.findById(book1.id)
        bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'Mark', role: 'writer' }), new Author({ name: 'Jim', role: 'inker' })] }))
      }

      {
        // when
        const page = bookDtoDao.findAll(
          new BookSearch({
            condition: new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch() }) }),
          }),
          new SearchContext(user),
          Pageable.unpaged(),
        )

        // then
        expect(page.totalElements).toBe(1)
        expect(page.content).toHaveLength(1)
        expect(page.content.map((it) => it.metadata.title)).toEqual(['Éric le rouge'])
      }

      {
        // when
        const page = bookDtoDao.findAll(
          new BookSearch({
            condition: new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch() }) }),
          }),
          new SearchContext(user),
          Pageable.unpaged(),
        )

        // then
        expect(page.totalElements).toBe(1)
        expect(page.content).toHaveLength(1)
        expect(page.content.map((it) => it.metadata.title)).toEqual(['Éric le bleu'])
      }
    })
  })

  describe('ReadProgress', () => {
    it('given books in various read status when searching for read books then only read books are returned', () => {
      // given
      setupBooks()

      // when
      const found = bookDtoDao.findAll(
        new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }) }),
        new SearchContext(user),
        PageRequest.of(0, 20),
      )

      // then
      expect(found.content).toHaveLength(1)
      expect(found.content[0]!.readProgress?.completed).toBe(true)
      expect(found.content[0]!.name).toBe('2')
    })

    it('given books in various read status when searching for unread books then only unread books are returned', () => {
      // given
      setupBooks()

      // when
      const found = bookDtoDao.findAll(
        new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }) }),
        new SearchContext(user),
        PageRequest.of(0, 20),
      )

      // then
      expect(found.content).toHaveLength(1)
      expect(found.content[0]!.readProgress).toBeNull()
      expect(found.content[0]!.name).toBe('3')
    })

    it('given books in various read status when searching for in progress books then only in progress books are returned', () => {
      // given
      setupBooks()

      // when
      const found = bookDtoDao.findAll(
        new BookSearch({ condition: new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }) }),
        new SearchContext(user),
        PageRequest.of(0, 20),
      )

      // then
      expect(found.content).toHaveLength(1)
      expect(found.content[0]!.readProgress?.completed).toBe(false)
      expect(found.content[0]!.name).toBe('1')
    })

    it('given books in various read status when searching for read and unread books then only matching books are returned', () => {
      // given
      setupBooks()

      // when
      const found = bookDtoDao.findAll(
        new BookSearch({
          condition: new SearchCondition.AnyOfBook({
            conditions: [
              new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }),
              new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }),
            ],
          }),
        }),
        new SearchContext(user),
        PageRequest.of(0, 20),
      )

      // then
      expect(found.content).toHaveLength(2)
      expect(found.content.map((it) => it.name).sort()).toEqual(['2', '3'].sort())
    })

    it('given books in various read status when searching for read and in progress books then only matching books are returned', () => {
      // given
      setupBooks()

      // when
      const found = bookDtoDao.findAll(
        new BookSearch({
          condition: new SearchCondition.AnyOfBook({
            conditions: [
              new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }),
              new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }),
            ],
          }),
        }),
        new SearchContext(user),
        PageRequest.of(0, 20),
      )

      // then
      expect(found.content).toHaveLength(2)
      expect(found.content.map((it) => it.name).sort()).toEqual(['2', '1'].sort())
    })

    it('given books in various read status when searching for unread and in progress books then only matching books are returned', () => {
      // given
      setupBooks()

      // when
      const found = bookDtoDao.findAll(
        new BookSearch({
          condition: new SearchCondition.AnyOfBook({
            conditions: [
              new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }),
              new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }),
            ],
          }),
        }),
        new SearchContext(user),
        PageRequest.of(0, 20),
      )

      // then
      expect(found.content).toHaveLength(2)
      expect(found.content.map((it) => it.name).sort()).toEqual(['3', '1'].sort())
    })

    it('given books in various read status when searching for read and unread and in progress books then only matching books are returned', () => {
      // given
      setupBooks()

      // when
      const found = bookDtoDao.findAll(
        new BookSearch({
          condition: new SearchCondition.AnyOfBook({
            conditions: [
              new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }),
              new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.IN_PROGRESS }) }),
              new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.UNREAD }) }),
            ],
          }),
        }),
        new SearchContext(user),
        PageRequest.of(0, 20),
      )

      // then
      expect(found.content).toHaveLength(3)
      expect(found.content.map((it) => it.name).sort()).toEqual(['3', '1', '2'].sort())
    })

    it('given books in various read status when searching without read progress then all books are returned', () => {
      // given
      setupBooks()

      // when
      const found = bookDtoDao.findAll(new BookSearch(), new SearchContext(user), PageRequest.of(0, 20))

      // then
      expect(found.content).toHaveLength(3)
      expect(found.content.map((it) => it.name).sort()).toEqual(['3', '1', '2'].sort())
    })
  })

  describe('OnDeck', () => {
    it('given series with in progress books status when searching for on deck then nothing is returned', () => {
      // given
      setupBooks()

      // when
      const found = bookDtoDao.findAllOnDeck(user.id, null, PageRequest.of(0, 20))

      // then
      expect(found.content).toHaveLength(0)
    })

    it('given series with only unread books when searching for on deck then no books are returned', () => {
      // given
      seriesLifecycle.addBooks(
        series,
        [1, 2, 3].map((it) => makeBook(`${it}`, { seriesId: series.id, libraryId: library.id })),
      )

      // when
      const found = bookDtoDao.findAllOnDeck(user.id, null, PageRequest.of(0, 20))

      // then
      expect(found.content).toHaveLength(0)
    })

    it('given series with some unread books when searching for on deck then first unread book of series is returned', () => {
      // given
      seriesLifecycle.addBooks(
        series,
        [1, 2, 3].map((it) => makeBook(`${it}`, { seriesId: series.id, libraryId: library.id }).copy({ number: it })),
      )

      const books = sortedBy(bookRepository.findAll(), (it) => it.name)
      readProgressRepository.save(new ReadProgress({ bookId: books[0]!.id, userId: user.id, page: 5, completed: true }))

      // when
      const found = bookDtoDao.findAllOnDeck(user.id, null, PageRequest.of(0, 20))

      // then
      expect(found.content).toHaveLength(1)
      expect(found.content[0]!.name).toBe('2')
    })
  })

  describe('FullTextSearch', () => {
    it('given books when searching by term then results are ordered by rank', async () => {
      // given
      seriesLifecycle.addBooks(series, [
        makeBook('The incredible adventures of Batman, the man who is also a bat!', { seriesId: series.id, libraryId: library.id }),
        makeBook('Robin', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman and Robin', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman', { seriesId: series.id, libraryId: library.id }),
      ])

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'batman' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(3)
      expect(found.map((it) => it.name)).toEqual(['Batman', 'Batman and Robin', 'The incredible adventures of Batman, the man who is also a bat!'])
    })

    it('given books when searching by term and sort order then results are ordered by sort order', async () => {
      // given
      seriesLifecycle.addBooks(series, [
        makeBook('Book 3', { seriesId: series.id, libraryId: library.id }),
        makeBook('Book 1', { seriesId: series.id, libraryId: library.id }),
        makeBook('Book 2', { seriesId: series.id, libraryId: library.id }),
      ])

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'book' }), new SearchContext(user), new UnpagedSorted(Sort.by('name'))).content
      const pages = [0, 1, 2].map((it) =>
        bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'book' }), new SearchContext(user), PageRequest.of(it, 1, Sort.by('name'))),
      )
      const page0 = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'book' }), new SearchContext(user), PageRequest.of(0, 2, Sort.by('name')))
      const page1 = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'book' }), new SearchContext(user), PageRequest.of(1, 2, Sort.by('name')))

      // then
      expect(found).toHaveLength(3)
      expect(found.map((it) => it.name)).toEqual(['Book 1', 'Book 2', 'Book 3'])

      expect(pages).toHaveLength(3)
      expect(new Set(pages.map((it) => it.totalPages))).toEqual(new Set([3]))
      expect(new Set(pages.map((it) => it.totalElements))).toEqual(new Set([3]))
      expect(new Set(pages.map((it) => it.size))).toEqual(new Set([1]))
      expect(pages.flatMap((it) => it.content).map((it) => it.name)).toEqual(['Book 1', 'Book 2', 'Book 3'])

      expect(page0.content).toHaveLength(2)
      expect(page0.content.map((it) => it.name)).toEqual(['Book 1', 'Book 2'])
      expect(page1.content).toHaveLength(1)
      expect(page1.content.map((it) => it.name)).toEqual(['Book 3'])
    })

    it('given books when searching by term with accent then results are matched accent insensitive', async () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [
        book1,
        makeBook('Robin', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman and Robin', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman', { seriesId: series.id, libraryId: library.id }),
      ])

      {
        const it = bookMetadataRepository.findById(book1.id)
        bookMetadataRepository.update(it.copy({ title: 'Éric le bleu' }))
      }

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'eric' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Éric le bleu'])
    })

    it('given books when searching by ISBN then results are matched', async () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [
        book1,
        makeBook('Robin', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman and Robin', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman', { seriesId: series.id, libraryId: library.id }),
      ])

      {
        const it = bookMetadataRepository.findById(book1.id)
        bookMetadataRepository.update(it.copy({ isbn: '9782413016878' }))
      }

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: '9782413016878' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Éric le rouge'])
    })

    it('given books when searching by tags then results are matched', async () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book1])

      {
        const it = bookMetadataRepository.findById(book1.id)
        bookMetadataRepository.update(it.copy({ tags: new Set(['tag1']) }))
      }

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'tag:tag1' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Éric le rouge'])
    })

    it('given books when searching by authors then results are matched', async () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book1])

      {
        const it = bookMetadataRepository.findById(book1.id)
        bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'bob', role: 'writer' })] }))
      }

      await searchIndexLifecycle.rebuildIndex()

      // when
      const foundGeneric = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'author:bob' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content
      const foundByRole = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'writer:bob' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content
      const notFound = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'penciller:bob' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(foundGeneric).toHaveLength(1)
      expect(foundGeneric.map((it) => it.metadata.title)).toEqual(['Éric le rouge'])
      expect(foundByRole).toHaveLength(1)
      expect(foundByRole.map((it) => it.metadata.title)).toEqual(['Éric le rouge'])
      expect(notFound).toHaveLength(0)
    })

    it('given books when searching by release year then results are matched', async () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book1])

      {
        const it = bookMetadataRepository.findById(book1.id)
        bookMetadataRepository.update(it.copy({ releaseDate: LocalDate.of(1999, 5, 12) }))
      }

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'release_date:1999' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Éric le rouge'])
    })

    it('given books when searching by release year range then results are matched', async () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      const book2 = makeBook('Éric le bleu', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book1, book2])

      {
        const it = bookMetadataRepository.findById(book1.id)
        bookMetadataRepository.update(it.copy({ releaseDate: LocalDate.of(1999, 5, 12) }))
      }
      {
        const it = bookMetadataRepository.findById(book2.id)
        bookMetadataRepository.update(it.copy({ releaseDate: LocalDate.of(2005, 5, 12) }))
      }

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(
        new BookSearch({ fullTextSearch: 'release_date:[1990 TO 2010]' }),
        new SearchContext(user),
        new UnpagedSorted(Sort.by('relevance')),
      ).content

      // then
      expect(found).toHaveLength(2)
      expect(found.map((it) => it.metadata.title)).toEqual(['Éric le rouge', 'Éric le bleu'])
    })

    it('given books when searching by media status then results are matched', async () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id })
      seriesLifecycle.addBooks(series, [book1])

      {
        const it = mediaRepository.findById(book1.id)
        mediaRepository.update(it.copy({ status: Media.Status.ERROR }))
      }

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'status:error' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Éric le rouge'])
    })

    it('given books when searching by deleted then results are matched', async () => {
      // given
      const book1 = makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id }).copy({ deletedDate: LocalDateTime.now() })
      seriesLifecycle.addBooks(series, [book1, makeBook('Batman', { seriesId: series.id, libraryId: library.id })])

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'deleted:true' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['Éric le rouge'])
    })

    it('given books with dots in title when searching by title then results are matched', async () => {
      // given
      seriesLifecycle.addBooks(series, [
        makeBook('S.W.O.R.D.', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman', { seriesId: series.id, libraryId: library.id }),
      ])

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 's.w.o.r.d' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
      expect(found.map((it) => it.metadata.title)).toEqual(['S.W.O.R.D.'])
    })

    it('given books when searching with multiple words then results are matched', async () => {
      // given
      seriesLifecycle.addBooks(series, [
        makeBook('Éric le rouge', { seriesId: series.id, libraryId: library.id }),
        makeBook('Robin and Batman', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman and Robin', { seriesId: series.id, libraryId: library.id }),
        makeBook('Batman', { seriesId: series.id, libraryId: library.id }),
      ])

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'batman robin' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(2)
      expect(found.map((it) => it.metadata.title).sort()).toEqual(['Batman and Robin', 'Robin and Batman'].sort())
    })

    it('given books when searching by term containing hyphens then results are ordered by rank', async () => {
      // given
      seriesLifecycle.addBooks(series, [
        makeBook('Batman', { seriesId: series.id, libraryId: library.id }),
        makeBook('Another X-Men adventure', { seriesId: series.id, libraryId: library.id }),
        makeBook('X-Men', { seriesId: series.id, libraryId: library.id }),
      ])

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: 'x-men' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(2)
      expect(found.map((it) => it.name)).toEqual(['X-Men', 'Another X-Men adventure'])
    })

    it('when searching by unknown field then empty result are returned and no exception is thrown', () => {
      expect(() => {
        // when
        const found = bookDtoDao.findAll(
          new BookSearch({ fullTextSearch: 'publisher:batman' }),
          new SearchContext(user),
          new UnpagedSorted(Sort.by('relevance')),
        ).content

        // then
        expect(found).toHaveLength(0)
      }).not.toThrow()
    })

    it('given books in CJK when searching by CJK term then results are ordered by rank', async () => {
      // given
      seriesLifecycle.addBooks(series, [
        makeBook('[不道德公會][河添太一 ][東立]Vol.04-搬运', { seriesId: series.id, libraryId: library.id, url: new URL('file:/file.cbz') }),
      ])

      await searchIndexLifecycle.rebuildIndex()

      // when
      const found = bookDtoDao.findAll(new BookSearch({ fullTextSearch: '不道德' }), new SearchContext(user), new UnpagedSorted(Sort.by('relevance'))).content

      // then
      expect(found).toHaveLength(1)
    })
  })

  describe('Duplicates', () => {
    it('given books with same hash and size when searching then results are returned', () => {
      // given
      seriesLifecycle.addBooks(series, [
        makeBook('Book 1', { seriesId: series.id, libraryId: library.id }).copy({ fileHash: 'hashed', fileSize: 10 }),
        makeBook('Book 2', { seriesId: series.id, libraryId: library.id }).copy({ fileHash: 'hashed', fileSize: 10 }),
      ])

      // when
      const found = bookDtoDao.findAllDuplicates(user.id, Pageable.unpaged()).content

      // then
      expect(found).toHaveLength(2)
      expect(found.map((it) => it.name).sort()).toEqual(['Book 1', 'Book 2'].sort())
    })

    it('given books with same hash but different size when searching then no results are returned', () => {
      // given
      seriesLifecycle.addBooks(series, [
        makeBook('Book 1', { seriesId: series.id, libraryId: library.id }).copy({ fileHash: 'hashed', fileSize: 10 }),
        makeBook('Book 2', { seriesId: series.id, libraryId: library.id }).copy({ fileHash: 'hashed', fileSize: 12 }),
      ])

      // when
      const found = bookDtoDao.findAllDuplicates(user.id, Pageable.unpaged()).content

      // then
      expect(found).toHaveLength(0)
    })
  })
})
