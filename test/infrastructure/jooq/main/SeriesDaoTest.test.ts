// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/SeriesDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Series } from '../../../../src/domain/model/Series.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesDao } from '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import { URL } from '../../../../src/port/java-net.js'
import { eq, first, nn } from '../../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeLibrary } from '../../../domain/model/Utils.js'
import { expectCloseTo } from '../TestUtils.js'

/** `assertThat(actual).isEqualToIgnoringNanos(expected)` */
function expectEqualToIgnoringNanos(actual: LocalDateTime | null, expected: LocalDateTime | null): void {
  expect(actual?.withNano(0).toString()).toBe(expected?.withNano(0).toString())
}

describe('SeriesDaoTest', () => {
  const ctx = springBootTest()
  const seriesDao = ctx.getBean(SeriesDao)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const library = makeLibrary()

  beforeAll(() => {
    libraryRepository.insert(library)
  })

  afterEach(() => {
    seriesDao.deleteAll()
    expect(seriesDao.count()).toBe(0)
  })

  afterAll(async () => {
    libraryRepository.deleteAll()
    await closeContext(ctx)
  })

  it('given a series when inserting then it is persisted', () => {
    const now = LocalDateTime.now()
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: now,
      libraryId: library.id,
      deletedDate: now,
    })

    seriesDao.insert(series)
    const created = nn(seriesDao.findByIdOrNull(series.id))

    expect(created.id).not.toBe(0)
    expectCloseTo(created.createdDate, now)
    expectCloseTo(created.lastModifiedDate, now)
    expect(created.name).toBe(series.name)
    expect(eq(created.url, series.url)).toBe(true)
    expectEqualToIgnoringNanos(created.fileLastModified, series.fileLastModified)
    expectEqualToIgnoringNanos(created.deletedDate, series.deletedDate)
  })

  it('given a series when updating then it is persisted', () => {
    const now = LocalDateTime.now()
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: now,
      libraryId: library.id,
    })

    seriesDao.insert(series)

    const modificationDate = LocalDateTime.now()

    const updated = nn(seriesDao.findByIdOrNull(series.id)).copy({
      name: 'Updated',
      url: new URL('file://updated'),
      fileLastModified: modificationDate,
      bookCount: 5,
      deletedDate: LocalDateTime.now(),
    })

    seriesDao.update(updated)
    const modified = nn(seriesDao.findByIdOrNull(updated.id))

    expect(modified.id).toBe(updated.id)
    expect(modified.createdDate.equals(updated.createdDate)).toBe(true)
    expectCloseTo(modified.lastModifiedDate, modificationDate)
    expect(modified.lastModifiedDate.equals(updated.lastModifiedDate)).toBe(false)
    expect(modified.name).toBe('Updated')
    expect(eq(modified.url, new URL('file://updated'))).toBe(true)
    expectEqualToIgnoringNanos(modified.fileLastModified, modificationDate)
    expect(modified.bookCount).toBe(5)
    expectEqualToIgnoringNanos(modified.deletedDate, updated.deletedDate)
  })

  it('given a series when deleting then it is deleted', () => {
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: LocalDateTime.now(),
      libraryId: library.id,
    })

    seriesDao.insert(series)
    expect(seriesDao.count()).toBe(1)

    seriesDao.delete(series.id)

    expect(seriesDao.count()).toBe(0)
  })

  it('given series when deleting all then all are deleted', () => {
    const now = LocalDateTime.now()
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: now,
      libraryId: library.id,
    })

    const series2 = new Series({
      name: 'Series2',
      url: new URL('file://series2'),
      fileLastModified: now,
      libraryId: library.id,
    })

    seriesDao.insert(series)
    seriesDao.insert(series2)
    expect(seriesDao.count()).toBe(2)

    seriesDao.deleteAll()

    expect(seriesDao.count()).toBe(0)
  })

  it('given series when finding all then all are returned', () => {
    const now = LocalDateTime.now()
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: now,
      libraryId: library.id,
    })

    const series2 = new Series({
      name: 'Series2',
      url: new URL('file://series2'),
      fileLastModified: now,
      libraryId: library.id,
    })

    seriesDao.insert(series)
    seriesDao.insert(series2)

    const all = seriesDao.findAll()

    expect(all).toHaveLength(2)
    expect(all.map((it) => it.name).sort()).toEqual(['Series', 'Series2'].sort())
  })

  it('given existing series when finding by id then series is returned', () => {
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: LocalDateTime.now(),
      libraryId: library.id,
    })

    seriesDao.insert(series)

    const found = seriesDao.findByIdOrNull(series.id)

    expect(found).not.toBeNull()
    expect(found?.name).toBe('Series')
  })

  it('given non-existing series when finding by id then null is returned', () => {
    const found = seriesDao.findByIdOrNull('1287746')

    expect(found).toBeNull()
  })

  it('given existing series when finding by libraryId then series are returned', () => {
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: LocalDateTime.now(),
      libraryId: library.id,
    })
    seriesDao.insert(series)

    const found = seriesDao.findAllByLibraryId(library.id)

    expect(found).toHaveLength(1)
    expect(first(found).name).toBe('Series')
  })

  it('given existing series when finding by other libraryId then empty list is returned', () => {
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: LocalDateTime.now(),
      libraryId: library.id,
    })
    seriesDao.insert(series)

    const found = seriesDao.findAllByLibraryId(library.id + 1)

    expect(found).toHaveLength(0)
  })

  it('given existing series when finding by libraryId and Url not in list then results are returned', () => {
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: LocalDateTime.now(),
      libraryId: library.id,
    })
    seriesDao.insert(series)

    const found = seriesDao.findAllNotDeletedByLibraryIdAndUrlNotIn(library.id, [new URL('file://series2')])
    const notFound = seriesDao.findAllNotDeletedByLibraryIdAndUrlNotIn(library.id, [new URL('file://series')])

    expect(found).toHaveLength(1)
    expect(first(found).name).toBe('Series')

    expect(notFound).toHaveLength(0)
  })

  it('given existing series when finding by libraryId and Url in list then results are returned', () => {
    const series = new Series({
      name: 'Series',
      url: new URL('file://series'),
      fileLastModified: LocalDateTime.now(),
      libraryId: library.id,
    })
    seriesDao.insert(series)

    const found = seriesDao.findNotDeletedByLibraryIdAndUrlOrNull(library.id, new URL('file://series'))
    const notFound1 = seriesDao.findNotDeletedByLibraryIdAndUrlOrNull(library.id, new URL('file://series2'))
    const notFound2 = seriesDao.findNotDeletedByLibraryIdAndUrlOrNull(library.id + 1, new URL('file://series'))
    const notFound3 = seriesDao.findNotDeletedByLibraryIdAndUrlOrNull(library.id + 1, new URL('file://series2'))

    expect(found).not.toBeNull()
    expect(found?.name).toBe('Series')

    expect(notFound1).toBeNull()
    expect(notFound2).toBeNull()
    expect(notFound3).toBeNull()
  })
})
