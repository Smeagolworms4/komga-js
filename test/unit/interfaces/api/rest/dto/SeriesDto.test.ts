// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/SeriesDtoOracleTest.kt
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { AlternateTitleDto } from '../../../../../../src/interfaces/api/rest/dto/AlternateTitleDto.js'
import { AuthorDto } from '../../../../../../src/interfaces/api/rest/dto/AuthorDto.js'
import { BookMetadataAggregationDto, SeriesDto, SeriesMetadataDto, restrictUrl } from '../../../../../../src/interfaces/api/rest/dto/SeriesDto.js'
import { WebLinkDto } from '../../../../../../src/interfaces/api/rest/dto/WebLinkDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/SeriesDto')

const d = LocalDateTime.of(2020, 3, 4, 5, 6, 7)
const s = new SeriesDto({
  id: 'S1',
  libraryId: 'L1',
  name: 'Series',
  url: '/data/lib/series',
  created: d,
  lastModified: d,
  fileLastModified: d,
  booksCount: 3,
  booksReadCount: 1,
  booksUnreadCount: 1,
  booksInProgressCount: 1,
  metadata: new SeriesMetadataDto({
    status: 'ONGOING',
    statusLock: false,
    title: 'Title',
    titleLock: false,
    titleSort: 'title',
    titleSortLock: false,
    summary: 'sum',
    summaryLock: false,
    readingDirection: 'LEFT_TO_RIGHT',
    readingDirectionLock: false,
    publisher: 'pub',
    publisherLock: false,
    ageRating: 16,
    ageRatingLock: false,
    language: 'en',
    languageLock: false,
    genres: new Set(['g']),
    genresLock: false,
    tags: new Set(['t']),
    tagsLock: false,
    totalBookCount: 10,
    totalBookCountLock: false,
    sharingLabels: new Set(['s']),
    sharingLabelsLock: false,
    links: [new WebLinkDto({ label: 'l', url: 'https://l' })],
    linksLock: false,
    alternateTitles: [new AlternateTitleDto({ label: 'en', title: 'Alt' })],
    alternateTitlesLock: false,
    created: d,
    lastModified: d,
  }),
  booksMetadata: new BookMetadataAggregationDto({
    authors: [new AuthorDto({ name: 'a', role: 'writer' })],
    tags: new Set(['t']),
    releaseDate: LocalDate.of(2020, 1, 1),
    summary: 's',
    summaryNumber: '1',
    created: d,
    lastModified: d,
  }),
  deleted: false,
  oneshot: true,
})

func('restrictUrl', () => {
  kase('not restricted', () => restrictUrl(s, false))
  kase('restricted', () => restrictUrl(s, true).url)
  kase('json restricted', () => json(restrictUrl(s, true)))
})
