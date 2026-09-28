// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/ReadListDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneHelper.js'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { ReadListDao } from '../../../../src/infrastructure/jooq/main/ReadListDao.js'
import { toIndexedMap } from '../../../../src/language/LanguageUtils.js'
import { eq, nn } from '../../../../src/port/kotlin.js'
import { Pageable } from '../../../../src/port/spring-data.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { expectCloseTo } from '../TestUtils.js'

describe('ReadListDaoTest', () => {
  const ctx = springBootTest()
  const readListDao = ctx.getBean(ReadListDao)
  const bookRepository = ctx.getBean(BookRepository)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const library = makeLibrary()
  const library2 = makeLibrary({ name: 'library2' })
  const testUser = new KomgaUser({ email: 'test@example.org', password: '' })

  beforeAll(() => {
    libraryRepository.insert(library)
    libraryRepository.insert(library2)
  })

  afterEach(() => {
    readListDao.deleteAll()
    bookRepository.deleteAll()
    seriesRepository.deleteAll()
  })

  afterAll(() => {
    libraryRepository.deleteAll()
    closeContext(ctx)
  })

  // PORT: (1..10)
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

  it('given read list with books when inserting then it is persisted', () => {
    // given
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)
    const books = range(1, 10).map((it) => makeBook(`Book ${it}`, { libraryId: library.id, seriesId: series.id }))
    books.forEach((it) => bookRepository.insert(it))

    const readList = new ReadList({
      name: 'MyReadList',
      summary: 'summary',
      bookIds: toIndexedMap(books.map((it) => it.id)),
    })

    // when
    const now = LocalDateTime.now()

    readListDao.insert(readList)
    const created = nn(readListDao.findByIdOrNull(readList.id, SearchContext.empty()))

    // then
    expect(created.name).toBe(readList.name)
    expect(created.summary).toBe(readList.summary)
    expect(eq(created.createdDate, created.lastModifiedDate)).toBe(true)
    expectCloseTo(created.createdDate, now)
    expect([...created.bookIds.values()]).toEqual(books.map((it) => it.id))
  })

  it('given read list with updated books when updating then it is persisted', () => {
    // given
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)
    const books = range(1, 10).map((it) => makeBook(`Book ${it}`, { libraryId: library.id, seriesId: series.id }))
    books.forEach((it) => bookRepository.insert(it))

    const readList = new ReadList({
      name: 'MyReadList',
      bookIds: toIndexedMap(books.map((it) => it.id)),
    })

    readListDao.insert(readList)

    // when
    const updatedReadList = readList.copy({
      name: 'UpdatedReadList',
      summary: 'summary',
      bookIds: toIndexedMap([...readList.bookIds.values()].slice(0, 5)),
    })

    const now = LocalDateTime.now()
    readListDao.update(updatedReadList)
    const updated = nn(readListDao.findByIdOrNull(updatedReadList.id, SearchContext.empty()))

    // then
    expect(updated.name).toBe(updatedReadList.name)
    expect(updated.summary).toBe(updatedReadList.summary)
    expect(eq(updated.createdDate, updated.lastModifiedDate)).toBe(false)
    expectCloseTo(updated.lastModifiedDate, now)
    expect([...updated.bookIds.values()]).toHaveLength(5)
    expect([...updated.bookIds.values()]).toEqual(books.map((it) => it.id).slice(0, 5))
  })

  it('given read lists with books when removing one book from all then it is removed from all', () => {
    // given
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)
    const books = range(1, 10).map((it) => makeBook(`Book ${it}`, { libraryId: library.id, seriesId: series.id }))
    books.forEach((it) => bookRepository.insert(it))

    const readList1 = new ReadList({
      name: 'MyReadList',
      bookIds: toIndexedMap(books.map((it) => it.id)),
    })
    readListDao.insert(readList1)

    const readList2 = new ReadList({
      name: 'MyReadList',
      bookIds: toIndexedMap(books.map((it) => it.id).slice(0, 5)),
    })
    readListDao.insert(readList2)

    // when
    readListDao.removeBookFromAll(nn(books[0]).id)

    // then
    const rl1 = nn(readListDao.findByIdOrNull(readList1.id, SearchContext.empty()))
    expect([...rl1.bookIds.values()]).toHaveLength(9)
    expect([...rl1.bookIds.values()]).not.toContain(nn(books[0]).id)

    const col2 = nn(readListDao.findByIdOrNull(readList2.id, SearchContext.empty()))
    expect([...col2.bookIds.values()]).toHaveLength(4)
    expect([...col2.bookIds.values()]).not.toContain(nn(books[0]).id)
  })

  it('given read lists spanning different libraries when finding by library then only matching collections are returned', () => {
    // given
    const seriesLibrary1 = makeSeries('Series1', { libraryId: library.id })
    seriesRepository.insert(seriesLibrary1)
    const bookLibrary1 = makeBook('Book1', { libraryId: library.id, seriesId: seriesLibrary1.id })
    bookRepository.insert(bookLibrary1)
    const seriesLibrary2 = makeSeries('Series2', { libraryId: library2.id })
    seriesRepository.insert(seriesLibrary2)
    const bookLibrary2 = makeBook('Book2', { libraryId: library2.id, seriesId: seriesLibrary2.id })
    bookRepository.insert(bookLibrary2)

    readListDao.insert(
      new ReadList({
        name: 'readListLibrary1',
        bookIds: toIndexedMap([bookLibrary1.id]),
      }),
    )

    readListDao.insert(
      new ReadList({
        name: 'readListLibrary2',
        bookIds: toIndexedMap([bookLibrary2.id]),
      }),
    )

    readListDao.insert(
      new ReadList({
        name: 'readListLibraryBoth',
        bookIds: toIndexedMap([bookLibrary1.id, bookLibrary2.id]),
      }),
    )

    // when
    const foundLibrary1Filtered = readListDao.findAll(
      new SearchContext(testUser.copy({ sharedAllLibraries: false, sharedLibrariesIds: new Set([library.id]) })),
      Pageable.unpaged(),
      { belongsToLibraryIds: [library.id] },
    ).content
    const foundLibrary1Unfiltered = readListDao.findAll(new SearchContext(testUser), Pageable.unpaged(), { belongsToLibraryIds: [library.id] }).content
    const foundLibrary2Filtered = readListDao.findAll(
      new SearchContext(testUser.copy({ sharedAllLibraries: false, sharedLibrariesIds: new Set([library2.id]) })),
      Pageable.unpaged(),
      { belongsToLibraryIds: [library2.id] },
    ).content
    const foundLibrary2Unfiltered = readListDao.findAll(new SearchContext(testUser), Pageable.unpaged(), { belongsToLibraryIds: [library2.id] }).content
    const foundBothUnfiltered = readListDao.findAll(new SearchContext(testUser), Pageable.unpaged(), { belongsToLibraryIds: [library.id, library2.id] }).content

    // then
    expect(foundLibrary1Filtered).toHaveLength(2)
    expect(foundLibrary1Filtered.map((it) => it.name)).toEqual(['readListLibrary1', 'readListLibraryBoth'])
    {
      const it = nn(foundLibrary1Filtered.find((it) => it.name === 'readListLibraryBoth') ?? null)
      expect([...it.bookIds.values()]).toHaveLength(1)
      expect([...it.bookIds.values()]).toEqual([bookLibrary1.id])
      expect(it.filtered).toBe(true)
    }

    expect(foundLibrary1Unfiltered).toHaveLength(2)
    expect(foundLibrary1Unfiltered.map((it) => it.name)).toEqual(['readListLibrary1', 'readListLibraryBoth'])
    {
      const it = nn(foundLibrary1Unfiltered.find((it) => it.name === 'readListLibraryBoth') ?? null)
      expect([...it.bookIds.values()]).toHaveLength(2)
      expect([...it.bookIds.values()]).toEqual([bookLibrary1.id, bookLibrary2.id])
      expect(it.filtered).toBe(false)
    }

    expect(foundLibrary2Filtered).toHaveLength(2)
    expect(foundLibrary2Filtered.map((it) => it.name)).toEqual(['readListLibrary2', 'readListLibraryBoth'])
    {
      const it = nn(foundLibrary2Filtered.find((it) => it.name === 'readListLibraryBoth') ?? null)
      expect([...it.bookIds.values()]).toHaveLength(1)
      expect([...it.bookIds.values()]).toEqual([bookLibrary2.id])
      expect(it.filtered).toBe(true)
    }

    expect(foundLibrary2Unfiltered).toHaveLength(2)
    expect(foundLibrary2Unfiltered.map((it) => it.name)).toEqual(['readListLibrary2', 'readListLibraryBoth'])
    {
      const it = nn(foundLibrary2Unfiltered.find((it) => it.name === 'readListLibraryBoth') ?? null)
      expect([...it.bookIds.values()]).toHaveLength(2)
      expect([...it.bookIds.values()]).toEqual([bookLibrary1.id, bookLibrary2.id])
      expect(it.filtered).toBe(false)
    }

    expect(foundBothUnfiltered).toHaveLength(3)
    expect(foundBothUnfiltered.map((it) => it.name)).toEqual(['readListLibrary1', 'readListLibrary2', 'readListLibraryBoth'])
    {
      const it = nn(foundBothUnfiltered.find((it) => it.name === 'readListLibraryBoth') ?? null)
      expect([...it.bookIds.values()]).toHaveLength(2)
      expect([...it.bookIds.values()]).toEqual([bookLibrary1.id, bookLibrary2.id])
      expect(it.filtered).toBe(false)
    }
  })
})
