// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/SeriesMetadataDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AlternateTitle } from '../../../../src/domain/model/AlternateTitle.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { WebLink } from '../../../../src/domain/model/WebLink.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { SeriesMetadataDao } from '../../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import { URI } from '../../../../src/port/java-net.js'
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

describe('SeriesMetadataDaoTest', () => {
  const ctx = springBootTest()
  const seriesMetadataDao = ctx.getBean(SeriesMetadataDao)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const library = makeLibrary()

  beforeAll(() => {
    libraryRepository.insert(library)
  })

  afterEach(() => {
    for (const it of seriesRepository.findAll()) {
      seriesMetadataDao.delete(it.id)
    }
    seriesRepository.deleteAll()
  })

  afterAll(() => {
    libraryRepository.deleteAll()
    closeContext(ctx)
  })

  it('given a seriesMetadata when inserting then it is persisted', () => {
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)

    const now = LocalDateTime.now()
    const metadata = new SeriesMetadata({
      status: SeriesMetadata.Status.ENDED,
      title: 'Series',
      titleSort: 'Series, The',
      summary: 'Summary',
      readingDirection: SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT,
      publisher: 'publisher',
      ageRating: 18,
      genres: new Set(['Action', 'Adventure']),
      tags: new Set(['tag', 'another']),
      language: 'en',
      totalBookCount: 5,
      sharingLabels: new Set(['kids']),
      links: [new WebLink({ label: 'Comicvine', url: new URI('https://comicvine.gamespot.com/doctor-strange/4050-2676/') })],
      alternateTitles: [new AlternateTitle({ label: 'fr', title: 'La Series' })],
      titleLock: true,
      titleSortLock: true,
      summaryLock: true,
      readingDirectionLock: true,
      publisherLock: true,
      ageRatingLock: true,
      genresLock: true,
      languageLock: true,
      tagsLock: true,
      totalBookCountLock: true,
      sharingLabelsLock: true,
      linksLock: true,
      alternateTitlesLock: true,
      seriesId: series.id,
    })

    seriesMetadataDao.insert(metadata)
    const created = seriesMetadataDao.findById(metadata.seriesId)

    expect(created.seriesId).toBe(series.id)
    expectCloseTo(created.createdDate, now)
    expectCloseTo(created.lastModifiedDate, now)

    expect(created.title).toBe(metadata.title)
    expect(created.titleSort).toBe(metadata.titleSort)
    expect(created.summary).toBe(metadata.summary)
    expect(created.status).toBe(SeriesMetadata.Status.ENDED)
    expect(created.readingDirection).toBe(metadata.readingDirection)
    expect(created.publisher).toBe(metadata.publisher)
    expect(created.ageRating).toBe(metadata.ageRating)
    expect(created.language).toBe(metadata.language)
    expect([...created.genres]).toEqual(expect.arrayContaining([...metadata.genres]))
    expect([...created.tags]).toEqual(expect.arrayContaining([...metadata.tags]))
    expect(created.totalBookCount).toBe(metadata.totalBookCount)
    expect([...created.sharingLabels]).toEqual(expect.arrayContaining([...metadata.sharingLabels]))
    {
      const it = first(created.links)
      expect(it.label).toBe(first(metadata.links).label)
      expect(eq(it.url, first(metadata.links).url)).toBe(true)
    }
    {
      const it = first(created.alternateTitles)
      expect(it.label).toBe(first(metadata.alternateTitles).label)
      expect(it.title).toBe(first(metadata.alternateTitles).title)
    }

    expect(created.titleLock).toBe(metadata.titleLock)
    expect(created.titleSortLock).toBe(metadata.titleSortLock)
    expect(created.statusLock).toBe(metadata.statusLock)
    expect(created.summaryLock).toBe(metadata.summaryLock)
    expect(created.readingDirectionLock).toBe(metadata.readingDirectionLock)
    expect(created.publisherLock).toBe(metadata.publisherLock)
    expect(created.ageRatingLock).toBe(metadata.ageRatingLock)
    expect(created.genresLock).toBe(metadata.genresLock)
    expect(created.languageLock).toBe(metadata.languageLock)
    expect(created.tagsLock).toBe(metadata.tagsLock)
    expect(created.totalBookCountLock).toBe(metadata.totalBookCountLock)
    expect(created.sharingLabelsLock).toBe(metadata.sharingLabelsLock)
    expect(created.linksLock).toBe(metadata.linksLock)
    expect(created.alternateTitlesLock).toBe(metadata.alternateTitlesLock)
  })

  it('given a minimum seriesMetadata when inserting then it is persisted', () => {
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)

    const now = LocalDateTime.now()
    const metadata = new SeriesMetadata({
      title: 'Series',
      seriesId: series.id,
    })

    seriesMetadataDao.insert(metadata)
    const created = seriesMetadataDao.findById(metadata.seriesId)

    expect(created.seriesId).toBe(series.id)
    expectCloseTo(created.createdDate, now)
    expectCloseTo(created.lastModifiedDate, now)

    expect(created.title).toBe(metadata.title)
    expect(created.titleSort).toBe(metadata.title)
    expect(isBlank(created.summary)).toBe(true)
    expect(created.status).toBe(SeriesMetadata.Status.ONGOING)
    expect(created.readingDirection).toBeNull()
    expect(isBlank(created.publisher)).toBe(true)
    expect(isBlank(created.language)).toBe(true)
    expect(created.ageRating).toBeNull()
    expect(created.genres.size).toBe(0)
    expect(created.tags.size).toBe(0)
    expect(created.totalBookCount).toBeNull()
    expect(created.sharingLabels.size).toBe(0)
    expect(created.links).toHaveLength(0)
    expect(created.alternateTitles).toHaveLength(0)

    expect(created.titleLock).toBe(false)
    expect(created.titleSortLock).toBe(false)
    expect(created.statusLock).toBe(false)
    expect(created.summaryLock).toBe(false)
    expect(created.readingDirectionLock).toBe(false)
    expect(created.publisherLock).toBe(false)
    expect(created.ageRatingLock).toBe(false)
    expect(created.genresLock).toBe(false)
    expect(created.languageLock).toBe(false)
    expect(created.tagsLock).toBe(false)
    expect(created.totalBookCountLock).toBe(false)
    expect(created.sharingLabelsLock).toBe(false)
    expect(created.linksLock).toBe(false)
    expect(created.alternateTitlesLock).toBe(false)
  })

  it('given existing seriesMetadata when finding by id then metadata is returned', () => {
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)

    const metadata = new SeriesMetadata({
      status: SeriesMetadata.Status.ENDED,
      title: 'Series',
      titleSort: 'Series, The',
      seriesId: series.id,
    })

    seriesMetadataDao.insert(metadata)

    const found = seriesMetadataDao.findById(series.id)

    expect(found).not.toBeNull()
    expect(found.title).toBe('Series')
  })

  it('given non-existing seriesMetadata when finding by id then exception is thrown', () => {
    const found = catchThrowable(() => seriesMetadataDao.findById('128742'))

    expect(found).toBeInstanceOf(Exception)
  })

  it('given non-existing seriesMetadata when findByIdOrNull then null is returned', () => {
    const found = seriesMetadataDao.findByIdOrNull('128742')

    expect(found).toBeNull()
  })

  it('given a seriesMetadata when updating then it is persisted', () => {
    const series = makeSeries('Series', { libraryId: library.id })
    seriesRepository.insert(series)

    const metadata = new SeriesMetadata({
      status: SeriesMetadata.Status.ENDED,
      title: 'Series',
      titleSort: 'Series, The',
      summary: 'Summary',
      readingDirection: SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT,
      publisher: 'publisher',
      ageRating: 18,
      language: 'en',
      genres: new Set(['Action']),
      tags: new Set(['tag']),
      totalBookCount: 3,
      sharingLabels: new Set(['kids']),
      links: [new WebLink({ label: 'Comicvine', url: new URI('https://comicvine.gamespot.com/doctor-strange/4050-2676/') })],
      alternateTitles: [new AlternateTitle({ label: 'fr', title: 'La Series' })],
      seriesId: series.id,
    })
    seriesMetadataDao.insert(metadata)
    const created = seriesMetadataDao.findById(metadata.seriesId)

    const modificationDate = LocalDateTime.now()

    const updated = created.copy({
      status: SeriesMetadata.Status.HIATUS,
      title: 'Changed',
      titleSort: 'Changed, The',
      summary: 'SummaryUpdated',
      readingDirection: SeriesMetadata.ReadingDirection.RIGHT_TO_LEFT,
      publisher: 'publisher2',
      ageRating: 15,
      language: 'jp',
      genres: new Set(['Adventure']),
      tags: new Set(['Another']),
      totalBookCount: 8,
      sharingLabels: new Set(['adult']),
      links: [],
      alternateTitles: [],
      statusLock: true,
      titleLock: true,
      titleSortLock: true,
      summaryLock: true,
      readingDirectionLock: true,
      publisherLock: true,
      ageRatingLock: true,
      languageLock: true,
      genresLock: true,
      tagsLock: true,
      totalBookCountLock: true,
      sharingLabelsLock: true,
      linksLock: true,
      alternateTitlesLock: true,
    })

    seriesMetadataDao.update(updated)
    const modified = seriesMetadataDao.findById(updated.seriesId)

    expect(modified.seriesId).toBe(series.id)
    expect(modified.createdDate.equals(updated.createdDate)).toBe(true)
    expectCloseTo(modified.lastModifiedDate, modificationDate)
    expect(modified.lastModifiedDate.equals(modified.createdDate)).toBe(false)
    expect(modified.title).toBe(updated.title)
    expect(modified.titleSort).toBe(updated.titleSort)
    expect(modified.summary).toBe(updated.summary)
    expect(modified.status).toBe(updated.status)
    expect(modified.readingDirection).toBe(updated.readingDirection)
    expect(modified.publisher).toBe(updated.publisher)
    expect(modified.ageRating).toBe(updated.ageRating)
    expect(modified.language).toBe(updated.language)
    expect([...modified.genres]).toEqual(expect.arrayContaining([...updated.genres]))
    expect([...modified.tags]).toEqual(expect.arrayContaining([...updated.tags]))
    expect(modified.totalBookCount).toBe(updated.totalBookCount)
    expect([...modified.sharingLabels]).toEqual(expect.arrayContaining([...updated.sharingLabels]))
    expect(modified.links).toHaveLength(0)
    expect(modified.alternateTitles).toHaveLength(0)

    expect(modified.titleLock).toBe(true)
    expect(modified.titleSortLock).toBe(true)
    expect(modified.statusLock).toBe(true)
    expect(modified.summaryLock).toBe(true)
    expect(modified.readingDirectionLock).toBe(true)
    expect(modified.ageRatingLock).toBe(true)
    expect(modified.languageLock).toBe(true)
    expect(modified.genresLock).toBe(true)
    expect(modified.publisherLock).toBe(true)
    expect(modified.tagsLock).toBe(true)
    expect(modified.totalBookCountLock).toBe(true)
    expect(modified.sharingLabelsLock).toBe(true)
    expect(modified.linksLock).toBe(true)
    expect(modified.alternateTitlesLock).toBe(true)
  })
})
