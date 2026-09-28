// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/BookDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Book } from '../../../../src/domain/model/Book.js'
import { SearchCondition } from '../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SearchOperator } from '../../../../src/domain/model/SearchOperator.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { BookDao } from '../../../../src/infrastructure/jooq/main/BookDao.js'
import { URL } from '../../../../src/port/java-net.js'
import { eq, nn } from '../../../../src/port/kotlin.js'
import { Pageable } from '../../../../src/port/spring-data.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { expectCloseTo } from '../TestUtils.js'

/** `assertThat(actual).isEqualToIgnoringNanos(expected)` */
function expectEqualToIgnoringNanos(actual: LocalDateTime | null, expected: LocalDateTime | null): void {
  expect(actual?.withNano(0).toString()).toBe(expected?.withNano(0).toString())
}

describe('BookDaoTest', () => {
  const ctx = springBootTest()
  const bookDao = ctx.getBean(BookDao)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const library = makeLibrary()
  const series = makeSeries('Series')

  beforeAll(() => {
    libraryRepository.insert(library)
    seriesRepository.insert(series.copy({ libraryId: library.id }))
  })

  afterEach(() => {
    bookDao.deleteAll()
    expect(bookDao.count()).toBe(0)
  })

  afterAll(async () => {
    seriesRepository.deleteAll()
    libraryRepository.deleteAll()
    await closeContext(ctx)
  })

  it('given a book when inserting then it is persisted', () => {
    const now = LocalDateTime.now()
    const book = new Book({
      name: 'Book',
      url: new URL('file://book'),
      fileLastModified: now,
      fileSize: 3,
      fileHash: 'abc',
      seriesId: series.id,
      libraryId: library.id,
      deletedDate: LocalDateTime.now(),
    })

    bookDao.insert(book)
    const created = nn(bookDao.findByIdOrNull(book.id))

    expect(created.id).not.toBe(0)
    expectCloseTo(created.createdDate, now)
    expectCloseTo(created.lastModifiedDate, now)
    expect(created.name).toBe(book.name)
    expect(eq(created.url, book.url)).toBe(true)
    expectEqualToIgnoringNanos(created.fileLastModified, book.fileLastModified)
    expect(created.fileSize).toBe(book.fileSize)
    expect(created.fileHash).toBe(book.fileHash)
    expectEqualToIgnoringNanos(created.deletedDate, book.deletedDate)
  })

  it('given existing book when updating then it is persisted', () => {
    const book = new Book({
      name: 'Book',
      url: new URL('file://book'),
      fileLastModified: LocalDateTime.now(),
      fileSize: 3,
      seriesId: series.id,
      libraryId: library.id,
    })
    bookDao.insert(book)

    const modificationDate = LocalDateTime.now()

    const updated = nn(bookDao.findByIdOrNull(book.id)).copy({
      name: 'Updated',
      url: new URL('file://updated'),
      fileLastModified: modificationDate,
      fileSize: 5,
      fileHash: 'def',
      deletedDate: LocalDateTime.now(),
    })

    bookDao.update(updated)
    const modified = nn(bookDao.findByIdOrNull(updated.id))

    expect(modified.id).toBe(updated.id)
    expect(modified.createdDate.equals(updated.createdDate)).toBe(true)
    expectCloseTo(modified.lastModifiedDate, modificationDate)
    expect(modified.lastModifiedDate.equals(updated.lastModifiedDate)).toBe(false)
    expect(modified.name).toBe('Updated')
    expect(eq(modified.url, new URL('file://updated'))).toBe(true)
    expectEqualToIgnoringNanos(modified.fileLastModified, modificationDate)
    expect(modified.fileSize).toBe(5)
    expect(modified.fileHash).toBe('def')
    expectEqualToIgnoringNanos(modified.deletedDate, updated.deletedDate)
  })

  it('given existing book when finding by id then book is returned', () => {
    const book = new Book({
      name: 'Book',
      url: new URL('file://book'),
      fileLastModified: LocalDateTime.now(),
      fileSize: 3,
      seriesId: series.id,
      libraryId: library.id,
    })
    bookDao.insert(book)

    const found = bookDao.findByIdOrNull(book.id)

    expect(found).not.toBeNull()
    expect(found?.name).toBe('Book')
  })

  it('given non-existing book when finding by id then null is returned', () => {
    const found = bookDao.findByIdOrNull('128742')

    expect(found).toBeNull()
  })

  it('given some books when finding all then all are returned', () => {
    bookDao.insert(makeBook('1', { libraryId: library.id, seriesId: series.id }))
    bookDao.insert(makeBook('2', { libraryId: library.id, seriesId: series.id }))

    const found = bookDao.findAll()

    expect(found).toHaveLength(2)
  })

  it('given some books when searching then results are returned', () => {
    bookDao.insert(makeBook('1', { libraryId: library.id, seriesId: series.id }))
    bookDao.insert(makeBook('2', { libraryId: library.id, seriesId: series.id }))

    const search = SearchCondition.AllOfBook.of(
      new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: library.id }) }),
      new SearchCondition.SeriesId({ operator: new SearchOperator.Is({ value: series.id }) }),
    )
    const found = bookDao.findAll(search, SearchContext.empty(), Pageable.unpaged()).content

    expect(found).toHaveLength(2)
  })

  it('given some books when finding by libraryId then results are returned', () => {
    bookDao.insert(makeBook('1', { libraryId: library.id, seriesId: series.id }))
    bookDao.insert(makeBook('2', { libraryId: library.id, seriesId: series.id }))

    const found = bookDao.findAllIdsByLibraryId(library.id)

    expect(found).toHaveLength(2)
  })

  it('given some books when finding by seriesId then results are returned', () => {
    bookDao.insert(makeBook('1', { libraryId: library.id, seriesId: series.id }))
    bookDao.insert(makeBook('2', { libraryId: library.id, seriesId: series.id }))

    const found = bookDao.findAllIdsBySeriesId(series.id)

    expect(found).toHaveLength(2)
  })

  it('given some books when deleting all then count is zero', () => {
    bookDao.insert(makeBook('1', { libraryId: library.id, seriesId: series.id }))
    bookDao.insert(makeBook('2', { libraryId: library.id, seriesId: series.id }))

    bookDao.deleteAll()

    expect(bookDao.count()).toBe(0)
  })
})
