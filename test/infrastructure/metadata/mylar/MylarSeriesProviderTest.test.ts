// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/metadata/mylar/MylarSeriesProviderTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import type { Series as DomainSeries } from '../../../../src/domain/model/Series.js'
import { MylarSeriesProvider } from '../../../../src/infrastructure/metadata/mylar/MylarSeriesProvider.js'
import { AgeRating } from '../../../../src/infrastructure/metadata/mylar/dto/AgeRating.js'
import { MylarMetadata } from '../../../../src/infrastructure/metadata/mylar/dto/MylarMetadata.js'
import { Series } from '../../../../src/infrastructure/metadata/mylar/dto/Series.js'
import { Status } from '../../../../src/infrastructure/metadata/mylar/dto/Status.js'
import { pathToUrl } from '../../../../src/port/java-net.js'
import { makeSeries } from '../../../domain/model/Utils.js'

describe('MylarSeriesProviderTest', () => {
  const mockMapper = { readValue: vi.fn() }

  const mylarSeriesProvider = new MylarSeriesProvider(mockMapper as never)

  let series: DomainSeries
  // PORT: @TempDir -> répertoire temporaire créé et supprimé ici
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mylar-'))
    writeFileSync(join(dir, 'series.json'), '')
    series = makeSeries('series', { url: pathToUrl(dir) })
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('given seriesJson when getting series metadata then metadata patch is valid', () => {
    const metadata = new MylarMetadata({
      type: 'comicSeries',
      publisher: 'DC',
      imprint: 'Vertigo',
      name: 'Sàndman',
      comicid: '12345',
      year: 1990,
      descriptionText: 'Sandman comics',
      descriptionFormatted: 'Sandman comics formatted',
      volume: null,
      bookType: 'TPB',
      ageRating: AgeRating.ADULT,
      comicImage: 'unused',
      totalIssues: 2,
      publicationRun: 'unused',
      status: Status.Ended,
    })
    const root = new Series({ metadata })

    mockMapper.readValue.mockReturnValue(root)

    const patch = mylarSeriesProvider.getSeriesMetadata(series)!

    expect(patch.title).toBe('Sàndman')
    expect(patch.titleSort).toBe('Sàndman')
    expect(patch.status).toBe(SeriesMetadata.Status.ENDED)
    expect(patch.summary).toBe('Sandman comics formatted')
    expect(patch.readingDirection).toBeNull()
    expect(patch.publisher).toBe('DC')
    expect(patch.ageRating).toBe(18)
    expect(patch.language).toBeNull()
    expect(patch.genres).toBeNull()
    expect(patch.totalBookCount).toBe(2)
    expect([...patch.collections]).toHaveLength(0)
  })

  it('given another seriesJson when getting series metadata then metadata patch is valid', () => {
    const metadata = new MylarMetadata({
      type: 'comicSeries',
      publisher: 'DC',
      imprint: 'Vertigo',
      name: 'Sandman',
      comicid: '12345',
      year: 1990,
      descriptionText: 'Sandman comics',
      descriptionFormatted: null,
      volume: null,
      bookType: 'TPB',
      ageRating: null,
      comicImage: 'unused',
      totalIssues: 2,
      publicationRun: 'unused',
      status: Status.Continuing,
    })
    const root = new Series({ metadata })

    mockMapper.readValue.mockReturnValue(root)

    const patch = mylarSeriesProvider.getSeriesMetadata(series)!

    expect(patch.title).toBe('Sandman')
    expect(patch.titleSort).toBe('Sandman')
    expect(patch.status).toBe(SeriesMetadata.Status.ONGOING)
    expect(patch.summary).toBe('Sandman comics')
    expect(patch.readingDirection).toBeNull()
    expect(patch.publisher).toBe('DC')
    expect(patch.ageRating).toBeNull()
    expect(patch.language).toBeNull()
    expect(patch.genres).toBeNull()
    expect(patch.totalBookCount).toBe(2)
    expect([...patch.collections]).toHaveLength(0)
  })

  it('given seriesJson with volume != 1 and year when getting series metadata then metadata patch has title containing the year', () => {
    const metadata = new MylarMetadata({
      type: 'comicSeries',
      publisher: 'DC',
      imprint: 'Vertigo',
      name: 'Sandman',
      comicid: '12345',
      year: 1990,
      descriptionText: 'Sandman comics',
      descriptionFormatted: 'Sandman comics formatted',
      volume: 2,
      bookType: 'TPB',
      ageRating: AgeRating.ADULT,
      comicImage: 'unused',
      totalIssues: 2,
      publicationRun: 'unused',
      status: Status.Ended,
    })
    const root = new Series({ metadata })

    mockMapper.readValue.mockReturnValue(root)

    const patch = mylarSeriesProvider.getSeriesMetadata(series)!

    expect(patch.title).toBe('Sandman (1990)')
    expect(patch.titleSort).toBe('Sandman (1990)')
  })

  it('given seriesJson with volume == 1 and year when getting series metadata then metadata patch has title not containing the year', () => {
    const metadata = new MylarMetadata({
      type: 'comicSeries',
      publisher: 'DC',
      imprint: 'Vertigo',
      name: 'Sandman',
      comicid: '12345',
      year: 1990,
      descriptionText: 'Sandman comics',
      descriptionFormatted: 'Sandman comics formatted',
      volume: 1,
      bookType: 'TPB',
      ageRating: AgeRating.ADULT,
      comicImage: 'unused',
      totalIssues: 2,
      publicationRun: 'unused',
      status: Status.Ended,
    })
    const root = new Series({ metadata })

    mockMapper.readValue.mockReturnValue(root)

    const patch = mylarSeriesProvider.getSeriesMetadata(series)!

    expect(patch.title).toBe('Sandman')
    expect(patch.titleSort).toBe('Sandman')
  })

  it('given seriesJson with volume == null and year when getting series metadata then metadata patch has title not containing the year', () => {
    const metadata = new MylarMetadata({
      type: 'comicSeries',
      publisher: 'DC',
      imprint: 'Vertigo',
      name: 'Sandman',
      comicid: '12345',
      year: 1990,
      descriptionText: 'Sandman comics',
      descriptionFormatted: 'Sandman comics formatted',
      volume: null,
      bookType: 'TPB',
      ageRating: AgeRating.ADULT,
      comicImage: 'unused',
      totalIssues: 2,
      publicationRun: 'unused',
      status: Status.Ended,
    })
    const root = new Series({ metadata })

    mockMapper.readValue.mockReturnValue(root)

    const patch = mylarSeriesProvider.getSeriesMetadata(series)!

    expect(patch.title).toBe('Sandman')
    expect(patch.titleSort).toBe('Sandman')
  })
})
