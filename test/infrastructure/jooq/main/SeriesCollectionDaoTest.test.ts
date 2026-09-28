// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/SeriesCollectionDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneHelper.js'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { SeriesCollectionDao } from '../../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import { eq, nn } from '../../../../src/port/kotlin.js'
import { Pageable } from '../../../../src/port/spring-data.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { expectCloseTo } from '../TestUtils.js'

describe('SeriesCollectionDaoTest', () => {
  const ctx = springBootTest()
  const collectionDao = ctx.getBean(SeriesCollectionDao)
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
    collectionDao.deleteAll()
    seriesRepository.deleteAll()
  })

  afterAll(() => {
    libraryRepository.deleteAll()
    closeContext(ctx)
  })

  // PORT: (1..10)
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

  it('given collection with series when inserting then it is persisted', () => {
    // given
    const series = range(1, 10).map((it) => makeSeries(`Series ${it}`, { libraryId: library.id }))
    series.forEach((it) => seriesRepository.insert(it))

    const collection = new SeriesCollection({
      name: 'MyCollection',
      seriesIds: series.map((it) => it.id),
    })

    // when
    const now = LocalDateTime.now()

    collectionDao.insert(collection)
    const created = nn(collectionDao.findByIdOrNull(collection.id, SearchContext.empty()))

    // then
    expect(created.name).toBe(collection.name)
    expect(created.ordered).toBe(collection.ordered)
    expect(eq(created.createdDate, created.lastModifiedDate)).toBe(true)
    expectCloseTo(created.createdDate, now)
    expect(created.seriesIds).toEqual(series.map((it) => it.id))
  })

  it('given collection with updated series when updating then it is persisted', () => {
    // given
    const series = range(1, 10).map((it) => makeSeries(`Series ${it}`, { libraryId: library.id }))
    series.forEach((it) => seriesRepository.insert(it))

    const collection = new SeriesCollection({
      name: 'MyCollection',
      seriesIds: series.map((it) => it.id),
    })

    collectionDao.insert(collection)

    // when
    const updatedCollection = collection.copy({
      name: 'UpdatedCollection',
      ordered: true,
      seriesIds: collection.seriesIds.slice(0, 5),
    })

    const now = LocalDateTime.now()
    collectionDao.update(updatedCollection)
    const updated = nn(collectionDao.findByIdOrNull(updatedCollection.id, SearchContext.empty()))

    // then
    expect(updated.name).toBe(updatedCollection.name)
    expect(updated.ordered).toBe(updatedCollection.ordered)
    expect(eq(updated.createdDate, updated.lastModifiedDate)).toBe(false)
    expectCloseTo(updated.lastModifiedDate, now)
    expect(updated.seriesIds).toHaveLength(5)
    expect(updated.seriesIds).toEqual(series.map((it) => it.id).slice(0, 5))
  })

  it('given collections with series when removing one series from all then it is removed from all', () => {
    // given
    const series = range(1, 10).map((it) => makeSeries(`Series ${it}`, { libraryId: library.id }))
    series.forEach((it) => seriesRepository.insert(it))

    const collection1 = new SeriesCollection({
      name: 'MyCollection',
      seriesIds: series.map((it) => it.id),
    })
    collectionDao.insert(collection1)

    const collection2 = new SeriesCollection({
      name: 'MyCollection2',
      seriesIds: series.map((it) => it.id).slice(0, 5),
    })
    collectionDao.insert(collection2)

    // when
    collectionDao.removeSeriesFromAll(nn(series[0]).id)

    // then
    const col1 = nn(collectionDao.findByIdOrNull(collection1.id, SearchContext.empty()))
    expect(col1.seriesIds).toHaveLength(9)
    expect(col1.seriesIds).not.toContain(nn(series[0]).id)

    const col2 = nn(collectionDao.findByIdOrNull(collection2.id, SearchContext.empty()))
    expect(col2.seriesIds).toHaveLength(4)
    expect(col2.seriesIds).not.toContain(nn(series[0]).id)
  })

  it('given collections spanning different libraries when finding by library then only matching collections are returned', () => {
    // given
    const seriesLibrary1 = makeSeries('Series1', { libraryId: library.id })
    seriesRepository.insert(seriesLibrary1)
    const seriesLibrary2 = makeSeries('Series2', { libraryId: library2.id })
    seriesRepository.insert(seriesLibrary2)

    collectionDao.insert(
      new SeriesCollection({
        name: 'collectionLibrary1',
        seriesIds: [seriesLibrary1.id],
      }),
    )

    collectionDao.insert(
      new SeriesCollection({
        name: 'collectionLibrary2',
        seriesIds: [seriesLibrary2.id],
      }),
    )

    collectionDao.insert(
      new SeriesCollection({
        name: 'collectionLibraryBoth',
        seriesIds: [seriesLibrary1.id, seriesLibrary2.id],
      }),
    )

    // when
    const foundLibrary1Filtered = collectionDao.findAll(
      new SearchContext(testUser.copy({ sharedAllLibraries: false, sharedLibrariesIds: new Set([library.id]) })),
      Pageable.unpaged(),
      { belongsToLibraryIds: [library.id] },
    ).content
    const foundLibrary1Unfiltered = collectionDao.findAll(new SearchContext(testUser), Pageable.unpaged(), { belongsToLibraryIds: [library.id] }).content
    const foundLibrary2Filtered = collectionDao.findAll(
      new SearchContext(testUser.copy({ sharedAllLibraries: false, sharedLibrariesIds: new Set([library2.id]) })),
      Pageable.unpaged(),
      { belongsToLibraryIds: [library2.id] },
    ).content
    const foundLibrary2Unfiltered = collectionDao.findAll(new SearchContext(testUser), Pageable.unpaged(), { belongsToLibraryIds: [library2.id] }).content
    const foundBothUnfiltered = collectionDao.findAll(new SearchContext(testUser), Pageable.unpaged(), { belongsToLibraryIds: [library.id, library2.id] }).content

    // then
    expect(foundLibrary1Filtered).toHaveLength(2)
    expect(foundLibrary1Filtered.map((it) => it.name)).toEqual(['collectionLibrary1', 'collectionLibraryBoth'])
    {
      const it = nn(foundLibrary1Filtered.find((it) => it.name === 'collectionLibraryBoth') ?? null)
      expect(it.seriesIds).toHaveLength(1)
      expect(it.seriesIds).toEqual([seriesLibrary1.id])
      expect(it.filtered).toBe(true)
    }

    expect(foundLibrary1Unfiltered).toHaveLength(2)
    expect(foundLibrary1Unfiltered.map((it) => it.name)).toEqual(['collectionLibrary1', 'collectionLibraryBoth'])
    {
      const it = nn(foundLibrary1Unfiltered.find((it) => it.name === 'collectionLibraryBoth') ?? null)
      expect(it.seriesIds).toHaveLength(2)
      expect(it.seriesIds).toEqual([seriesLibrary1.id, seriesLibrary2.id])
      expect(it.filtered).toBe(false)
    }

    expect(foundLibrary2Filtered).toHaveLength(2)
    expect(foundLibrary2Filtered.map((it) => it.name)).toEqual(['collectionLibrary2', 'collectionLibraryBoth'])
    {
      const it = nn(foundLibrary2Filtered.find((it) => it.name === 'collectionLibraryBoth') ?? null)
      expect(it.seriesIds).toHaveLength(1)
      expect(it.seriesIds).toEqual([seriesLibrary2.id])
      expect(it.filtered).toBe(true)
    }

    expect(foundLibrary2Unfiltered).toHaveLength(2)
    expect(foundLibrary2Unfiltered.map((it) => it.name)).toEqual(['collectionLibrary2', 'collectionLibraryBoth'])
    {
      const it = nn(foundLibrary2Unfiltered.find((it) => it.name === 'collectionLibraryBoth') ?? null)
      expect(it.seriesIds).toHaveLength(2)
      expect(it.seriesIds).toEqual([seriesLibrary1.id, seriesLibrary2.id])
      expect(it.filtered).toBe(false)
    }

    expect(foundBothUnfiltered).toHaveLength(3)
    expect(foundBothUnfiltered.map((it) => it.name)).toEqual(['collectionLibrary1', 'collectionLibrary2', 'collectionLibraryBoth'])
    {
      const it = nn(foundBothUnfiltered.find((it) => it.name === 'collectionLibraryBoth') ?? null)
      expect(it.seriesIds).toHaveLength(2)
      expect(it.seriesIds).toEqual([seriesLibrary1.id, seriesLibrary2.id])
      expect(it.filtered).toBe(false)
    }
  })
})
