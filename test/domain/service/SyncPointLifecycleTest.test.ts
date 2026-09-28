// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/SyncPointLifecycleTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires
import '../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import '../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../src/infrastructure/jooq/main/SidecarDao.js'
import '../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailBookDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailSeriesDao.js'
import '../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import '../../../src/infrastructure/jooq/tasks/TasksDao.js'
import '../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../src/infrastructure/search/LuceneHelper.js'
import '../../../src/infrastructure/search/SearchIndexLifecycle.js'
import '../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../src/infrastructure/jooq/main/SyncPointDao.js'
import '../../../src/domain/service/BookLifecycle.js'
import '../../../src/domain/service/SeriesLifecycle.js'
import '../../../src/domain/service/SyncPointLifecycle.js'
import { ChronoUnit, LocalDateTime, ZonedDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AgeRestriction, AllowExclude } from '../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { Media } from '../../../src/domain/model/Media.js'
import { MediaType } from '../../../src/domain/model/MediaType.js'
import { SyncPoint } from '../../../src/domain/model/SyncPoint.js'
import { BookMetadataRepository } from '../../../src/domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../src/domain/persistence/MediaRepository.js'
import { SeriesMetadataRepository } from '../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../src/domain/persistence/SeriesRepository.js'
import { SyncPointRepository } from '../../../src/domain/persistence/SyncPointRepository.js'
import { BookLifecycle } from '../../../src/domain/service/BookLifecycle.js'
import { SeriesLifecycle } from '../../../src/domain/service/SeriesLifecycle.js'
import { SyncPointLifecycle } from '../../../src/domain/service/SyncPointLifecycle.js'
import { toZonedDateTime } from '../../../src/language/LanguageUtils.js'
import { eq, nn } from '../../../src/port/kotlin.js'
import { PageRequest, Pageable } from '../../../src/port/spring-data.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../model/Utils.js'

const ON_DECK_ID = SyncPoint.ReadList.ON_DECK_ID

// PORT: assertThat(a).isCloseTo(b, within(1, ChronoUnit.SECONDS)) sur des ZonedDateTime
function expectCloseTo(actual: ZonedDateTime, expected: ZonedDateTime, seconds: number): void {
  const diff = Math.abs(actual.until(expected, ChronoUnit.MILLIS))
  expect(diff, `${actual} close to ${expected} within ${seconds} SECONDS`).toBeLessThanOrEqual(seconds * 1000)
}

// PORT: containsExactlyInAnyOrder / containsExactlyInAnyOrderElementsOf (égalité Kotlin `eq`)
function expectContainsExactlyInAnyOrder<T>(actual: Iterable<T>, expected: Iterable<T>): void {
  const rest = [...expected]
  const a = [...actual]
  expect(a.length, `${a} contains exactly in any order ${rest}`).toBe(rest.length)
  for (const x of a) {
    const i = rest.findIndex((y) => eq(x, y))
    expect(i, `${x} expected in ${rest}`).toBeGreaterThanOrEqual(0)
    rest.splice(i, 1)
  }
}

// PORT: containsAnyElementsOf(expected).doesNotContainAnyElementsOf(other)
function expectContainsAnyAndNoneOf<T>(actual: T[], anyOf: T[], noneOf: T[]): void {
  expect(actual.some((x) => anyOf.some((y) => eq(x, y)))).toBe(true)
  expect(actual.some((x) => noneOf.some((y) => eq(x, y)))).toBe(false)
}

describe('SyncPointLifecycleTest', () => {
  const ctx = springBootTest()
  const syncPointLifecycle = ctx.getBean(SyncPointLifecycle)
  const syncPointRepository = ctx.getBean(SyncPointRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const bookRepository = ctx.getBean(BookRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const mediaRepository = ctx.getBean(MediaRepository)
  afterAll(() => closeContext(ctx))

  const library1 = makeLibrary()
  const library2 = makeLibrary()
  const library3 = makeLibrary()
  const user1 = new KomgaUser({
    email: 'user1@example.org',
    password: '',
    sharedLibrariesIds: new Set([library1.id, library2.id]),
    restrictions: new ContentRestrictions({
      ageRestriction: new AgeRestriction({ age: 18, restriction: AllowExclude.EXCLUDE }),
      labelsExclude: new Set(['exclude']),
    }),
  })

  beforeAll(() => {
    libraryRepository.insert(library1)
    libraryRepository.insert(library2)
    libraryRepository.insert(library3)
    userRepository.insert(user1)
  })

  afterAll(() => {
    libraryRepository.deleteAll()
    syncPointRepository.deleteAll()
    userRepository.deleteAll()
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
  })

  it('given user when creating syncpoint then all in-scope books are included', () => {
    // given
    const bookValid = makeBook('valid', { libraryId: library1.id }).copy({ fileHash: 'hash', fileSize: 12, fileLastModified: LocalDateTime.now() })
    const bookExcludedByAge = makeBook('age restriction', { libraryId: library1.id })
    const bookExcludedByLabel = makeBook('label restriction', { libraryId: library1.id })
    const bookDeleted = makeBook('deleted', { libraryId: library1.id }).copy({ deletedDate: LocalDateTime.now() })
    const bookNotReady = makeBook('media not ready', { libraryId: library1.id })
    const bookNotEpub = makeBook('not epub', { libraryId: library1.id })
    const bookOtherLibrary = makeBook('lib not in list', { libraryId: library2.id })
    const bookUnauthorizedLibrary = makeBook('unauthorized lib', { libraryId: library3.id })

    {
      const series = makeSeries('series1', { libraryId: library1.id })
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [bookValid, bookDeleted, bookNotReady, bookNotEpub])
    }
    {
      const series = makeSeries('series age restricted', { libraryId: library1.id })
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [bookExcludedByAge])
      const it = seriesMetadataRepository.findById(series.id)
      seriesMetadataRepository.update(it.copy({ ageRating: 20 }))
    }
    {
      const series = makeSeries('series label restricted', { libraryId: library1.id })
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [bookExcludedByLabel])
      const it = seriesMetadataRepository.findById(series.id)
      seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['exclude']) }))
    }
    {
      const series = makeSeries('series2', { libraryId: library2.id })
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [bookOtherLibrary])
    }
    {
      const series = makeSeries('series3', { libraryId: library3.id })
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [bookUnauthorizedLibrary])
    }

    bookRepository.findAll().forEach((it) => {
      const media = mediaRepository.findById(it.id)
      mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: MediaType.EPUB.type }))
    })
    {
      const media = mediaRepository.findById(bookNotReady.id)
      mediaRepository.update(media.copy({ status: Media.Status.ERROR }))
    }
    {
      const media = mediaRepository.findById(bookNotEpub.id)
      mediaRepository.update(media.copy({ mediaType: MediaType.ZIP.type }))
    }

    // when
    const syncPoint = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])
    const syncPointBooks = syncPointRepository.findBooksById(syncPoint.id, false, Pageable.unpaged())

    // then
    expect(syncPoint.userId).toBe(user1.id)
    expect(syncPointBooks.content).toHaveLength(1)
    {
      const self = syncPointBooks.content[0]!
      expect(self.bookId).toBe(bookValid.id)
      expect(self.fileHash).toBe(bookValid.fileHash)
      expect(self.fileSize).toBe(bookValid.fileSize)
      expectCloseTo(self.fileLastModified, toZonedDateTime(bookValid.fileLastModified), 1)
    }
  })

  it('given syncpoint when adding new books then syncpoint diff contains new books', () => {
    // given
    const book1 = makeBook('valid', { libraryId: library1.id })

    const series = makeSeries('series1', { libraryId: library1.id })
    {
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [book1])
    }

    {
      const media = mediaRepository.findById(book1.id)
      mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: MediaType.EPUB.type }))
    }

    const syncPoint1 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])

    // when
    const book2 = makeBook('valid', { libraryId: library1.id })
    const book3 = makeBook('valid', { libraryId: library1.id })
    seriesLifecycle.addBooks(series, [book2, book3])
    {
      const media = mediaRepository.findById(book2.id)
      mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: MediaType.EPUB.type }))
    }
    {
      const media = mediaRepository.findById(book3.id)
      mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: MediaType.EPUB.type }))
    }

    const syncPoint2 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])
    const booksAdded = syncPointRepository.findBooksAdded(syncPoint1.id, syncPoint2.id, false, Pageable.unpaged())
    const page1 = syncPointLifecycle.takeBooksAdded(syncPoint1.id, syncPoint2.id, Pageable.ofSize(1))
    const page2 = syncPointLifecycle.takeBooksAdded(syncPoint1.id, syncPoint2.id, Pageable.ofSize(1))

    // then
    expect(booksAdded.content).toHaveLength(2)
    expectContainsExactlyInAnyOrder(
      booksAdded.content.map((it) => it.bookId),
      [book2.id, book3.id],
    )
    expect(page1.content).toHaveLength(1)
    expectContainsAnyAndNoneOf(
      page1.content.map((it) => it.bookId),
      [book2.id, book3.id],
      page2.content.map((it) => it.bookId),
    )
    expect(page2.content).toHaveLength(1)
    expectContainsAnyAndNoneOf(
      page2.content.map((it) => it.bookId),
      [book2.id, book3.id],
      page1.content.map((it) => it.bookId),
    )
  })

  it('given syncpoint when deleting books then syncpoint diff contains removed books', () => {
    // given
    const book1 = makeBook('valid1', { libraryId: library1.id })
    const book2 = makeBook('valid2', { libraryId: library1.id })
    const book3 = makeBook('valid3', { libraryId: library1.id })

    {
      const series = makeSeries('series1', { libraryId: library1.id })
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [book1, book2, book3])
    }

    bookRepository.findAll().forEach((it) => {
      const media = mediaRepository.findById(it.id)
      mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: MediaType.EPUB.type }))
    })

    const syncPoint1 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])

    // when
    bookLifecycle.softDeleteMany([nn(bookRepository.findByIdOrNull(book2.id))])
    bookLifecycle.deleteOne(nn(bookRepository.findByIdOrNull(book3.id)))

    const syncPoint2 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])
    const booksRemoved = syncPointRepository.findBooksRemoved(syncPoint1.id, syncPoint2.id, false, Pageable.unpaged())
    const page1 = syncPointLifecycle.takeBooksRemoved(syncPoint1.id, syncPoint2.id, Pageable.ofSize(1))
    const page2 = syncPointLifecycle.takeBooksRemoved(syncPoint1.id, syncPoint2.id, Pageable.ofSize(1))

    // then
    expect(booksRemoved.content).toHaveLength(2)
    expectContainsExactlyInAnyOrder(
      booksRemoved.content.map((it) => it.bookId),
      [book2.id, book3.id],
    )
    expect(page1.content).toHaveLength(1)
    expectContainsAnyAndNoneOf(
      page1.content.map((it) => it.bookId),
      [book2.id, book3.id],
      page2.content.map((it) => it.bookId),
    )
    expect(page2.content).toHaveLength(1)
    expectContainsAnyAndNoneOf(
      page2.content.map((it) => it.bookId),
      [book2.id, book3.id],
      page1.content.map((it) => it.bookId),
    )
  })

  it('given syncpoint when changing books then syncpoint diff contains changed books', () => {
    // given
    const book1 = makeBook('valid1', { libraryId: library1.id })
    const book2 = makeBook('valid2', { libraryId: library1.id }).copy({ fileSize: 1, fileHash: 'hash1' })
    const book3 = makeBook('valid3', { libraryId: library1.id })
    const book4 = makeBook('no hash to hash', { libraryId: library1.id })

    {
      const series = makeSeries('series1', { libraryId: library1.id })
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [book1, book2, book3])
    }

    bookRepository.findAll().forEach((it) => {
      const media = mediaRepository.findById(it.id)
      mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: MediaType.EPUB.type }))
    })

    const syncPoint1 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])

    // when
    {
      const it = bookRepository.findByIdOrNull(book1.id)
      if (it !== null) bookRepository.update(it.copy({ fileLastModified: LocalDateTime.of(2020, 1, 1, 1, 1) }))
    }
    {
      const it = bookRepository.findByIdOrNull(book2.id)
      if (it !== null) bookRepository.update(it.copy({ fileHash: 'hash2' }))
    }
    {
      const it = bookMetadataRepository.findById(book3.id)
      bookMetadataRepository.update(it.copy({ title: 'changed' }))
    }
    {
      const it = bookRepository.findByIdOrNull(book4.id)
      if (it !== null) bookRepository.update(it.copy({ fileHash: 'hash' })) // not included in changed books if it had no hash before
    }

    const syncPoint2 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])
    const booksChanged = syncPointRepository.findBooksChanged(syncPoint1.id, syncPoint2.id, false, Pageable.unpaged())
    const page1 = syncPointLifecycle.takeBooksChanged(syncPoint1.id, syncPoint2.id, PageRequest.ofSize(1))
    const page2 = syncPointLifecycle.takeBooksChanged(syncPoint1.id, syncPoint2.id, PageRequest.ofSize(1))
    const page3 = syncPointLifecycle.takeBooksChanged(syncPoint1.id, syncPoint2.id, PageRequest.ofSize(1))

    // then
    expect(booksChanged.content).toHaveLength(3)
    expectContainsExactlyInAnyOrder(
      booksChanged.content.map((it) => it.bookId),
      [book1.id, book2.id, book3.id],
    )
    expect(page1.content).toHaveLength(1)
    expectContainsAnyAndNoneOf(
      page1.content.map((it) => it.bookId),
      [book1.id, book2.id, book3.id],
      [...page2.content, ...page3.content].map((it) => it.bookId),
    )
    expect(page2.content).toHaveLength(1)
    expectContainsAnyAndNoneOf(
      page2.content.map((it) => it.bookId),
      [book1.id, book2.id, book3.id],
      [...page1.content, ...page3.content].map((it) => it.bookId),
    )
    expect(page3.content).toHaveLength(1)
    expectContainsAnyAndNoneOf(
      page3.content.map((it) => it.bookId),
      [book1.id, book2.id, book3.id],
      [...page1.content, ...page2.content].map((it) => it.bookId),
    )
  })

  it('given syncpoint when books are read then syncpoint diff contains on deck read list', () => {
    // given
    const book1 = makeBook('book 1', { libraryId: library1.id }).copy({ fileHash: 'hash', fileSize: 12, fileLastModified: LocalDateTime.now(), number: 1 })
    const book2 = makeBook('book 2', { libraryId: library1.id }).copy({ fileHash: 'hash', fileSize: 12, fileLastModified: LocalDateTime.now(), number: 2 })
    const book3 = makeBook('book 3', { libraryId: library1.id }).copy({ fileHash: 'hash', fileSize: 12, fileLastModified: LocalDateTime.now(), number: 3 })

    {
      const series = makeSeries('series1', { libraryId: library1.id })
      const created = seriesLifecycle.createSeries(series)
      seriesLifecycle.addBooks(created, [book1, book2, book3])
    }

    bookRepository.findAll().forEach((it) => {
      const media = mediaRepository.findById(it.id)
      mediaRepository.update(media.copy({ status: Media.Status.READY, mediaType: MediaType.EPUB.type }))
    })

    // first sync point
    const syncPoint1 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])
    const syncPoint1ReadLists = syncPointRepository.findReadListsById(syncPoint1.id, false, Pageable.unpaged())

    expect(syncPoint1ReadLists.content).toHaveLength(0)

    // book marked as read
    bookLifecycle.markReadProgressCompleted(book1.id, user1)
    const syncPoint2 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])

    // on deck is present and has 1 book
    const syncPoint2ReadLists = syncPointRepository.findReadListsById(syncPoint2.id, false, Pageable.unpaged())
    const rlAdded1to2 = syncPointRepository.findReadListsAdded(syncPoint1.id, syncPoint2.id, false, Pageable.unpaged())
    const rlChanged1to2 = syncPointRepository.findReadListsChanged(syncPoint1.id, syncPoint2.id, false, Pageable.unpaged())
    const rlRemoved1to2 = syncPointRepository.findReadListsRemoved(syncPoint1.id, syncPoint2.id, false, Pageable.unpaged())
    const syncPoint2Page1 = syncPointLifecycle.takeReadListsAdded(syncPoint1.id, syncPoint2.id, Pageable.ofSize(1))
    const syncPoint2Page2 = syncPointLifecycle.takeReadListsAdded(syncPoint1.id, syncPoint2.id, Pageable.ofSize(1))

    expect(syncPoint2ReadLists.content).toHaveLength(1)
    expectContainsExactlyInAnyOrder(rlAdded1to2.content, syncPoint2ReadLists.content)
    expect(rlChanged1to2.content).toHaveLength(0)
    expect(rlRemoved1to2.content).toHaveLength(0)
    {
      const self = syncPoint2ReadLists.content[0]!
      expect(self.readListId).toBe(ON_DECK_ID)
      expectCloseTo(self.createdDate, ZonedDateTime.now(), 1)
      expectCloseTo(self.lastModifiedDate, ZonedDateTime.now(), 1)
    }
    expectContainsExactlyInAnyOrder(syncPoint2Page1.content, rlAdded1to2.content)
    expect(syncPoint2Page2.content).toHaveLength(0)
    const syncPoint2OnDeckBooks = syncPointRepository.findBookIdsByReadListIds(syncPoint2.id, [ON_DECK_ID])
    expect(syncPoint2OnDeckBooks.map((it) => it.bookId)).toHaveLength(1)
    expectContainsExactlyInAnyOrder(
      syncPoint2OnDeckBooks.map((it) => it.bookId),
      [book2.id],
    )

    // 2nd book marked as read, on deck is still present but has changed
    bookLifecycle.markReadProgressCompleted(book2.id, user1)
    const syncPoint3 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])

    const syncPoint3ReadLists = syncPointRepository.findReadListsById(syncPoint3.id, false, Pageable.unpaged())
    const rlAdded2to3 = syncPointRepository.findReadListsAdded(syncPoint2.id, syncPoint3.id, false, Pageable.unpaged())
    const rlChanged2to3 = syncPointRepository.findReadListsChanged(syncPoint2.id, syncPoint3.id, false, Pageable.unpaged())
    const rlRemoved2to3 = syncPointRepository.findReadListsRemoved(syncPoint2.id, syncPoint3.id, false, Pageable.unpaged())
    const syncPoint3Page1 = syncPointLifecycle.takeReadListsChanged(syncPoint2.id, syncPoint3.id, Pageable.ofSize(1))
    const syncPoint3Page2 = syncPointLifecycle.takeReadListsChanged(syncPoint2.id, syncPoint3.id, Pageable.ofSize(1))

    expectContainsExactlyInAnyOrder(
      syncPoint3ReadLists.content.map((it) => it.readListId),
      [ON_DECK_ID],
    )
    expectContainsExactlyInAnyOrder(
      rlChanged2to3.content.map((it) => it.readListId),
      [ON_DECK_ID],
    )
    expect(rlAdded2to3.content).toHaveLength(0)
    expect(rlRemoved2to3.content).toHaveLength(0)
    expectContainsExactlyInAnyOrder(syncPoint3Page1.content, rlChanged2to3.content)
    expect(syncPoint3Page2.content).toHaveLength(0)

    const syncPoint3OnDeckBooks = syncPointRepository.findBookIdsByReadListIds(syncPoint3.id, [ON_DECK_ID])
    expect(syncPoint3OnDeckBooks.map((it) => it.bookId)).toHaveLength(1)
    expectContainsExactlyInAnyOrder(
      syncPoint3OnDeckBooks.map((it) => it.bookId),
      [book3.id],
    )

    // 3rd book marked as read, whole series is read now - on deck is not present anymore
    bookLifecycle.markReadProgressCompleted(book3.id, user1)
    const syncPoint4 = syncPointLifecycle.createSyncPoint(user1, null, [library1.id])

    const syncPoint4ReadLists = syncPointRepository.findReadListsById(syncPoint4.id, false, Pageable.unpaged())
    const rlAdded3to4 = syncPointRepository.findReadListsAdded(syncPoint3.id, syncPoint4.id, false, Pageable.unpaged())
    const rlChanged3to4 = syncPointRepository.findReadListsChanged(syncPoint3.id, syncPoint4.id, false, Pageable.unpaged())
    const rlRemoved3to4 = syncPointRepository.findReadListsRemoved(syncPoint3.id, syncPoint4.id, false, Pageable.unpaged())
    const syncPoint4Page1 = syncPointLifecycle.takeReadListsRemoved(syncPoint3.id, syncPoint4.id, Pageable.ofSize(1))
    const syncPoint4Page2 = syncPointLifecycle.takeReadListsRemoved(syncPoint3.id, syncPoint4.id, Pageable.ofSize(1))

    expect(syncPoint4ReadLists.content).toHaveLength(0)
    expect(rlAdded3to4.content).toHaveLength(0)
    expect(rlChanged3to4.content).toHaveLength(0)
    expect(rlRemoved3to4.content).toHaveLength(1)
    expectContainsExactlyInAnyOrder(
      rlRemoved3to4.content.map((it) => it.readListId),
      [ON_DECK_ID],
    )
    expectContainsExactlyInAnyOrder(syncPoint4Page1.content, rlRemoved3to4.content)
    expect(syncPoint4Page2.content).toHaveLength(0)
  })
})
