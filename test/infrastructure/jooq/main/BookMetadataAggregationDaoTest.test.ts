// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/BookMetadataAggregationDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Author } from '../../../../src/domain/model/Author.js'
import { BookMetadataAggregation } from '../../../../src/domain/model/BookMetadataAggregation.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { BookMetadataAggregationDao } from '../../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import { Exception, eq, first, isBlank } from '../../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
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

describe('BookMetadataAggregationDaoTest', () => {
  const ctx = springBootTest()
  const bookMetadataAggregationDao = ctx.getBean(BookMetadataAggregationDao)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const library = makeLibrary()

  beforeAll(() => {
    libraryRepository.insert(library)
  })

  afterEach(() => {
    for (const it of seriesRepository.findAll()) {
      bookMetadataAggregationDao.delete(it.id)
    }
    seriesRepository.deleteAll()
  })

  afterAll(async () => {
    libraryRepository.deleteAll()
    await closeContext(ctx)
  })

  it('given a bookMetadataAggregation when inserting then it is persisted', () => {
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)

    const now = LocalDateTime.now()
    const metadata = new BookMetadataAggregation({
      authors: [new Author({ name: 'author', role: 'role' })],
      tags: new Set(['tag1', 'tag2']),
      releaseDate: LocalDate.now(),
      summary: 'Summary',
      summaryNumber: '1',
      seriesId: series.id,
    })

    bookMetadataAggregationDao.insert(metadata)
    const created = bookMetadataAggregationDao.findById(metadata.seriesId)

    expect(created.seriesId).toBe(series.id)
    expectCloseTo(created.createdDate, now)
    expectCloseTo(created.lastModifiedDate, now)

    expect(eq(created.releaseDate, metadata.releaseDate)).toBe(true)
    expect(created.summary).toBe(metadata.summary)
    expect(created.summaryNumber).toBe(metadata.summaryNumber)
    {
      const it = first(created.authors)
      expect(it.name).toBe(first(metadata.authors).name)
      expect(it.role).toBe(first(metadata.authors).role)
    }
    expect([...created.tags].sort()).toEqual([...metadata.tags].sort())
  })

  it('given a minimum bookMetadataAggregation when inserting then it is persisted', () => {
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)

    const now = LocalDateTime.now()
    const metadata = new BookMetadataAggregation({
      seriesId: series.id,
    })

    bookMetadataAggregationDao.insert(metadata)
    const created = bookMetadataAggregationDao.findById(metadata.seriesId)

    expect(created.seriesId).toBe(series.id)
    expectCloseTo(created.createdDate, now)
    expectCloseTo(created.lastModifiedDate, now)

    expect(created.releaseDate).toBeNull()
    expect(isBlank(created.summary)).toBe(true)
    expect(isBlank(created.summaryNumber)).toBe(true)
    expect(created.authors).toHaveLength(0)
  })

  it('given existing bookMetadataAggregation when finding by id then metadata is returned', () => {
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)

    const metadata = new BookMetadataAggregation({
      authors: [new Author({ name: 'author', role: 'role' })],
      tags: new Set(['tag1', 'tag2']),
      releaseDate: LocalDate.now(),
      summary: 'Summary',
      seriesId: series.id,
    })

    bookMetadataAggregationDao.insert(metadata)

    const found = bookMetadataAggregationDao.findById(series.id)

    expect(found).not.toBeNull()
    expect(found.summary).toBe('Summary')
  })

  it('given non-existing bookMetadataAggregation when finding by id then exception is thrown', () => {
    const found = catchThrowable(() => bookMetadataAggregationDao.findById('128742'))

    expect(found).toBeInstanceOf(Exception)
  })

  it('given non-existing bookMetadataAggregation when findByIdOrNull then null is returned', () => {
    const found = bookMetadataAggregationDao.findByIdOrNull('128742')

    expect(found).toBeNull()
  })

  it('given a bookMetadataAggregation when updating then it is persisted', () => {
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)

    const metadata = new BookMetadataAggregation({
      authors: [new Author({ name: 'author', role: 'role' })],
      tags: new Set(['tag1', 'tag2']),
      releaseDate: LocalDate.now(),
      summary: 'Summary',
      summaryNumber: '1',
      seriesId: series.id,
    })
    bookMetadataAggregationDao.insert(metadata)
    const created = bookMetadataAggregationDao.findById(metadata.seriesId)

    const modificationDate = LocalDateTime.now()

    const updated = created.copy({
      releaseDate: LocalDate.now().plusYears(1),
      summary: 'SummaryUpdated',
      summaryNumber: '2',
      authors: [new Author({ name: 'authorUpdated', role: 'roleUpdated' }), new Author({ name: 'author2', role: 'role2' })],
      tags: new Set(['tag1', 'tag2updated']),
    })

    bookMetadataAggregationDao.update(updated)
    const modified = bookMetadataAggregationDao.findById(updated.seriesId)

    expect(modified.seriesId).toBe(series.id)
    expect(modified.createdDate.equals(updated.createdDate)).toBe(true)
    expectCloseTo(modified.lastModifiedDate, modificationDate)
    expect(modified.lastModifiedDate.equals(modified.createdDate)).toBe(false)

    expect(eq(modified.releaseDate, updated.releaseDate)).toBe(true)
    expect(modified.summary).toBe(updated.summary)
    expect(modified.authors).toHaveLength(2)
    expect(modified.authors.map((it) => it.name).sort()).toEqual(updated.authors.map((it) => it.name).sort())
    expect(modified.authors.map((it) => it.role).sort()).toEqual(updated.authors.map((it) => it.role).sort())
    expect([...modified.tags].sort()).toEqual([...updated.tags].sort())
  })
})
