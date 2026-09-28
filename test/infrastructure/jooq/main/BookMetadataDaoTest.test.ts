// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/BookMetadataDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Author } from '../../../../src/domain/model/Author.js'
import { BookMetadata } from '../../../../src/domain/model/BookMetadata.js'
import { WebLink } from '../../../../src/domain/model/WebLink.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { BookMetadataDao } from '../../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import { URI } from '../../../../src/port/java-net.js'
import { Exception, eq, first, isBlank } from '../../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { expectCloseTo } from '../TestUtils.js'

/** `catchThrowable { }` d'AssertJ */
function catchThrowable(block: () => unknown): unknown {
  try {
    block()
    return null
  } catch (e) {
    return e
  }
}

describe('BookMetadataDaoTest', () => {
  const ctx = springBootTest()
  const bookMetadataDao = ctx.getBean(BookMetadataDao)
  const bookRepository = ctx.getBean(BookRepository)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const library = makeLibrary()
  const series = makeSeries('Series')
  const book = makeBook('Book')

  beforeAll(() => {
    libraryRepository.insert(library)

    seriesRepository.insert(series.copy({ libraryId: library.id }))

    bookRepository.insert(book.copy({ libraryId: library.id, seriesId: series.id }))
  })

  afterEach(() => {
    for (const it of bookRepository.findAll()) {
      bookMetadataDao.delete(it.id)
    }
  })

  afterAll(() => {
    bookRepository.deleteAll()
    seriesRepository.deleteAll()
    libraryRepository.deleteAll()
    closeContext(ctx)
  })

  it('given a metadata when inserting then it is persisted', () => {
    const now = LocalDateTime.now()
    const metadata = new BookMetadata({
      title: 'Book',
      summary: 'Summary',
      number: '1',
      numberSort: 1,
      releaseDate: LocalDate.now(),
      authors: [new Author({ name: 'author', role: 'role' })],
      tags: new Set(['tag', 'another']),
      isbn: '987654321',
      links: [new WebLink({ label: 'Comicvine', url: new URI('https://comicvine.gamespot.com/doctor-strange-30-a-gathering-of-fear/4000-18731/') })],
      bookId: book.id,
      titleLock: true,
      summaryLock: true,
      numberLock: true,
      numberSortLock: true,
      releaseDateLock: true,
      authorsLock: true,
      tagsLock: true,
      isbnLock: true,
    })

    bookMetadataDao.insert(metadata)
    const created = bookMetadataDao.findById(metadata.bookId)

    expect(created.bookId).toBe(book.id)
    expectCloseTo(created.createdDate, now)
    expectCloseTo(created.lastModifiedDate, now)

    expect(created.title).toBe(metadata.title)
    expect(created.summary).toBe(metadata.summary)
    expect(created.number).toBe(metadata.number)
    expect(created.numberSort).toBe(metadata.numberSort)
    expect(eq(created.releaseDate, metadata.releaseDate)).toBe(true)
    expect(created.authors).toHaveLength(1)
    {
      const it = first(created.authors)
      expect(it.name).toBe(first(metadata.authors).name)
      expect(it.role).toBe(first(metadata.authors).role)
    }
    expect([...created.tags]).toEqual(expect.arrayContaining([...metadata.tags]))
    expect(created.isbn).toBe(metadata.isbn)
    {
      const it = first(created.links)
      expect(it.label).toBe(first(metadata.links).label)
      expect(eq(it.url, first(metadata.links).url)).toBe(true)
    }

    expect(created.titleLock).toBe(metadata.titleLock)
    expect(created.summaryLock).toBe(metadata.summaryLock)
    expect(created.numberLock).toBe(metadata.numberLock)
    expect(created.numberSortLock).toBe(metadata.numberSortLock)
    expect(created.releaseDateLock).toBe(metadata.releaseDateLock)
    expect(created.authorsLock).toBe(metadata.authorsLock)
    expect(created.tagsLock).toBe(metadata.tagsLock)
    expect(created.isbnLock).toBe(metadata.isbnLock)
    expect(created.linksLock).toBe(metadata.linksLock)
  })

  it('given a minimum metadata when inserting then it is persisted', () => {
    const metadata = new BookMetadata({
      title: 'Book',
      number: '1',
      numberSort: 1,
      bookId: book.id,
    })

    bookMetadataDao.insert(metadata)
    const created = bookMetadataDao.findById(metadata.bookId)

    expect(created.bookId).toBe(book.id)

    expect(created.title).toBe(metadata.title)
    expect(isBlank(created.summary)).toBe(true)
    expect(created.number).toBe(metadata.number)
    expect(created.numberSort).toBe(metadata.numberSort)
    expect(created.releaseDate).toBeNull()
    expect(created.authors).toHaveLength(0)
    expect(created.tags.size).toBe(0)
    expect(isBlank(created.isbn)).toBe(true)
    expect(created.links).toHaveLength(0)

    expect(created.titleLock).toBe(false)
    expect(created.summaryLock).toBe(false)
    expect(created.numberLock).toBe(false)
    expect(created.numberSortLock).toBe(false)
    expect(created.releaseDateLock).toBe(false)
    expect(created.authorsLock).toBe(false)
    expect(created.tagsLock).toBe(false)
    expect(created.isbnLock).toBe(false)
    expect(created.linksLock).toBe(false)
  })

  it('given existing metadata when updating then it is persisted', () => {
    const metadata = new BookMetadata({
      title: 'Book',
      summary: 'Summary',
      number: '1',
      numberSort: 1,
      releaseDate: LocalDate.now(),
      authors: [new Author({ name: 'author', role: 'role' })],
      tags: new Set(['tag']),
      links: [new WebLink({ label: 'Comicvine', url: new URI('https://comicvine.gamespot.com/doctor-strange-30-a-gathering-of-fear/4000-18731/') })],
      bookId: book.id,
    })
    bookMetadataDao.insert(metadata)

    const modificationDate = LocalDateTime.now()
    const updated = bookMetadataDao.findById(metadata.bookId).copy({
      title: 'BookUpdated',
      summary: 'SummaryUpdated',
      number: '2',
      numberSort: 2,
      releaseDate: LocalDate.now(),
      authors: [new Author({ name: 'author2', role: 'role2' })],
      tags: new Set(['another']),
      isbn: '987654321',
      links: [new WebLink({ label: 'Bedetheque', url: new URI('https://www.bedetheque.com/BD-AD-Grand-Riviere-Tome-1-Terre-d-election-12596.html') })],
      titleLock: true,
      summaryLock: true,
      numberLock: true,
      numberSortLock: true,
      releaseDateLock: true,
      authorsLock: true,
      tagsLock: true,
      isbnLock: true,
      linksLock: true,
    })

    bookMetadataDao.update(updated)
    const modified = bookMetadataDao.findById(updated.bookId)

    expect(modified.bookId).toBe(updated.bookId)
    expect(modified.createdDate.equals(updated.createdDate)).toBe(true)
    expectCloseTo(modified.lastModifiedDate, modificationDate)
    expect(modified.lastModifiedDate.equals(updated.lastModifiedDate)).toBe(false)

    expect(modified.title).toBe(updated.title)
    expect(modified.summary).toBe(updated.summary)
    expect(modified.number).toBe(updated.number)
    expect(modified.numberSort).toBe(updated.numberSort)
    expect(modified.isbn).toBe(updated.isbn)

    expect(modified.titleLock).toBe(updated.titleLock)
    expect(modified.summaryLock).toBe(updated.summaryLock)
    expect(modified.numberLock).toBe(updated.numberLock)
    expect(modified.numberSortLock).toBe(updated.numberSortLock)
    expect(modified.releaseDateLock).toBe(updated.releaseDateLock)
    expect(modified.authorsLock).toBe(updated.authorsLock)
    expect(modified.tagsLock).toBe(updated.tagsLock)
    expect(modified.isbnLock).toBe(updated.isbnLock)
    expect(modified.linksLock).toBe(updated.linksLock)

    expect([...modified.tags]).toEqual(expect.arrayContaining([...updated.tags]))
    expect(first(modified.authors).name).toBe(first(updated.authors).name)
    expect(first(modified.authors).role).toBe(first(updated.authors).role)
    expect(first(modified.links).label).toBe(first(updated.links).label)
    expect(eq(first(modified.links).url, first(updated.links).url)).toBe(true)
  })

  it('given existing metadata when finding by id then metadata is returned', () => {
    const metadata = new BookMetadata({
      title: 'Book',
      summary: 'Summary',
      number: '1',
      numberSort: 1,
      releaseDate: LocalDate.now(),
      authors: [new Author({ name: 'author', role: 'role' })],
      bookId: book.id,
    })
    bookMetadataDao.insert(metadata)

    const found = catchThrowable(() => bookMetadataDao.findById(metadata.bookId))

    // doesNotThrowAnyException()
    expect(found).toBeNull()
  })

  it('given non-existing metadata when finding by id then exception is thrown', () => {
    const found = catchThrowable(() => bookMetadataDao.findById('128742'))

    expect(found).toBeInstanceOf(Exception)
  })
})
