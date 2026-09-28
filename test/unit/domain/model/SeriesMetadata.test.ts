// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/SeriesMetadataOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { AlternateTitle } from '../../../../src/domain/model/AlternateTitle.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { WebLink } from '../../../../src/domain/model/WebLink.js'
import { URI } from '../../../../src/port/java-net.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/SeriesMetadata')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)
const minimal = new SeriesMetadata({ title: '  Title  ', seriesId: 'S1', createdDate: date })
const full = new SeriesMetadata({
  status: SeriesMetadata.Status.HIATUS,
  title: ' Été ',
  titleSort: ' sort ',
  summary: ' summary\n',
  readingDirection: SeriesMetadata.ReadingDirection.WEBTOON,
  publisher: ' Pub ',
  ageRating: 16,
  language: ' EN-us ',
  genres: new Set(['Action', ' action', '', 'Drame']),
  tags: new Set(['TAG', 'tag ', ' ']),
  totalBookCount: 12,
  sharingLabels: new Set(['Kids', 'KIDS']),
  links: [new WebLink({ label: 'Site', url: new URI('https://example.org/a?b=c') })],
  alternateTitles: [new AlternateTitle({ label: 'JP', title: '漫画' })],
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
  seriesId: 'S2',
  createdDate: LocalDateTime.of(2021, 1, 2, 3, 4, 5, 6),
  lastModifiedDate: LocalDateTime.of(2022, 1, 2, 3, 4),
})

func('<init>', () => {
  kase('minimal', () => minimal)
  kase('full', () => full)
  kase('invalid language', () => new SeriesMetadata({ title: 't', language: 'not a language', createdDate: date }).language)
  kase('blank title', () => {
    const it = new SeriesMetadata({ title: ' \t ', createdDate: date })
    return [it.title, it.titleSort]
  })
})
func('copy', () => {
  kase('no change', () => full.copy())
  kase('renormalizes values', () =>
    full.copy({ title: '  New ', titleSort: '  ', summary: ' s ', publisher: ' p ', language: 'FR', genres: new Set([' X ']), tags: new Set(['Y', 'y']), sharingLabels: new Set([' ']) }),
  )
  kase('nullables', () => full.copy({ readingDirection: null, ageRating: null, totalBookCount: null }))
  kase('lists and locks', () =>
    minimal.copy({ links: [new WebLink({ label: 'a', url: new URI('file:/x') })], alternateTitles: [], statusLock: true, alternateTitlesLock: true, seriesId: '' }),
  )
  kase('dates', () => minimal.copy({ createdDate: LocalDateTime.of(2019, 1, 1, 0, 0), lastModifiedDate: LocalDateTime.of(2018, 1, 1, 0, 0) }))
  kase('title sort not recomputed', () => minimal.copy({ title: 'other' }).titleSort)
  kase('status', () => minimal.copy({ status: SeriesMetadata.Status.ENDED }).status)
})
func('toString', () => {
  kase('minimal', () => minimal.toString())
  kase('full', () => full.toString())
  kase('quotes', () => new SeriesMetadata({ title: "it's", summary: "'", createdDate: date }).toString())
})
