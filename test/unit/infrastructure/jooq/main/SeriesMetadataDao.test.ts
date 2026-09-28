// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/SeriesMetadataDaoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { AlternateTitle } from '../../../../../src/domain/model/AlternateTitle.js'
import { Series } from '../../../../../src/domain/model/Series.js'
import { SeriesMetadata } from '../../../../../src/domain/model/SeriesMetadata.js'
import { WebLink } from '../../../../../src/domain/model/WebLink.js'
import { URI, URL } from '../../../../../src/port/java-net.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/SeriesMetadataDao')

const db = new OracleDb()
const dao = db.seriesMetadataDao

const series = (id: string) => new Series({ name: id, url: new URL(`file:/lib1/${id}`), fileLastModified: LocalDateTime.of(2020, 1, 1, 0, 0), id, libraryId: 'L1' })

const big = new SeriesMetadata({
  status: SeriesMetadata.Status.HIATUS,
  title: '  Big ünïcode  ',
  titleSort: ' big ',
  summary: 'line1\nline2',
  readingDirection: SeriesMetadata.ReadingDirection.WEBTOON,
  publisher: ' Pub ',
  ageRating: 0,
  language: 'EN-us',
  genres: new Set([...Array.from({ length: 1200 }, (_, i) => `Genre ${i + 1}`), '', '  ', 'ÉPIQUE']),
  tags: new Set(['Tag B', 'tag a', 'tag a ']),
  totalBookCount: 0,
  sharingLabels: new Set(['Label1', 'Label2', 'Label3']),
  links: Array.from({ length: 1100 }, (_, i) => new WebLink({ label: `link ${i + 1}`, url: new URI(`https://example.org/${i + 1}?q=%C3%A9`) })),
  alternateTitles: [new AlternateTitle({ label: 'ja', title: 'ビッグ' }), new AlternateTitle({ label: '', title: '' }), new AlternateTitle({ label: 'ja', title: 'ビッグ' })],
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
  seriesId: 'TMP',
})

const summary = (m: SeriesMetadata) => [
  m.title,
  m.titleSort,
  m.language,
  m.genres.size,
  [...m.genres].slice(0, 3),
  m.tags,
  m.sharingLabels,
  m.links.length,
  m.links.slice(-1),
  m.alternateTitles,
]

func('count', () => {
  kase('seeded', () => {
    seed(db)
    return dao.count()
  })
})

func('findById', () => {
  kase('all fields', () => dao.findById('S1'))
  kase('japanese title', () => dao.findById('S3'))
  kase('missing', () => exceptionType(() => dao.findById('NOPE')))
})

func('findByIdOrNull', () => {
  kase('no optional values', () => dao.findByIdOrNull('S4'))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
})

func('findOne', () => {
  kase('dates converted to current time zone', () => {
    const it = dao.findById('S2')
    return [it.createdDate, it.lastModifiedDate]
  })
})

func('findGenres', () => {
  kase('several', () => dao.findById('S3').genres)
  kase('none', () => dao.findById('S4').genres)
})

func('findTags', () => {
  kase('several', () => dao.findById('S1').tags)
})

func('findSharingLabels', () => {
  kase('several', () => dao.findById('S6').sharingLabels)
})

func('findLinks', () => {
  kase('one', () => dao.findById('S1').links)
  kase('none', () => dao.findById('S2').links)
})

func('findAlternateTitles', () => {
  kase('duplicated labels', () => dao.findById('S3').alternateTitles)
})

func('insert', () => {
  kase('large collections over batch size', () => {
    db.seriesDao.insert(series('TMP'))
    dao.insert(big)
    return summary(dao.findById('TMP'))
  })
  kase('stored values', () =>
    db.rawQuery(
      "select STATUS, TITLE, TITLE_SORT, SUMMARY, READING_DIRECTION, PUBLISHER, AGE_RATING, LANGUAGE, TOTAL_BOOK_COUNT, STATUS_LOCK, ALTERNATE_TITLES_LOCK from SERIES_METADATA where SERIES_ID = 'TMP'",
    ),
  )
  kase('child rows', () =>
    ['SERIES_METADATA_GENRE', 'SERIES_METADATA_TAG', 'SERIES_METADATA_SHARING', 'SERIES_METADATA_LINK', 'SERIES_METADATA_ALTERNATE_TITLE'].map((it) =>
      db.rawQuery(`select count(*) from ${it} where SERIES_ID = 'TMP'`),
    ),
  )
  kase('duplicate', () => exceptionType(() => dao.insert(big)))
  kase('unknown series', () => exceptionType(() => dao.insert(new SeriesMetadata({ title: 'x', seriesId: 'NOPE' }))))
})

func('insertGenres', () => {
  kase('lower cased and not blank', () => [...dao.findById('TMP').genres].filter((it) => !it.startsWith('genre ')))
})

func('insertTags', () => {
  kase('deduplicated after trim', () => dao.findById('TMP').tags)
})

func('insertSharingLabels', () => {
  kase('lower cased', () => dao.findById('TMP').sharingLabels)
})

func('insertLinks', () => {
  kase('first links', () => dao.findById('TMP').links.slice(0, 2))
})

func('insertAlternateTitles', () => {
  kase('duplicates kept', () => dao.findById('TMP').alternateTitles)
})

func('update', () => {
  kase('all fields', () => {
    dao.update(
      dao.findById('S2').copy({
        status: SeriesMetadata.Status.ONGOING,
        title: 'Élan II',
        titleSort: 'Elan II',
        summary: 'new',
        readingDirection: SeriesMetadata.ReadingDirection.VERTICAL,
        publisher: 'Casterman',
        ageRating: 10,
        language: 'fr-BE',
        genres: new Set(['comedy']),
        tags: new Set(),
        totalBookCount: null,
        sharingLabels: new Set(['kids']),
        links: [new WebLink({ label: 'site', url: new URI('http://casterman.com') })],
        alternateTitles: [new AlternateTitle({ label: 'en', title: 'Momentum' })],
        summaryLock: true,
      }),
    )
    return stable(dao.findById('S2'))
  })
  kase('clear collections of large metadata', () => {
    dao.update(
      dao.findById('TMP').copy({
        genres: new Set(),
        tags: new Set(),
        sharingLabels: new Set(),
        links: [],
        alternateTitles: [],
        readingDirection: null,
        ageRating: null,
      }),
    )
    return summary(dao.findById('TMP'))
  })
  kase('missing', async () => {
    const e = await exceptionType(() => dao.update(new SeriesMetadata({ title: 'x', genres: new Set(['g']), seriesId: 'NOPE' })))
    return [e, dao.findByIdOrNull('NOPE'), db.rawQuery("select count(*) from SERIES_METADATA_GENRE where SERIES_ID = 'NOPE'")]
  })
})

func('toDomain', () => {
  kase('trimmed and normalized values', () => {
    const it = dao.findById('TMP')
    return [it.title, it.titleSort, it.publisher, it.language, it.readingDirection, it.ageRating, it.totalBookCount]
  })
})

func('delete@268', () => {
  kase('existing', () => {
    dao.delete('TMP')
    return [dao.findByIdOrNull('TMP'), dao.count()]
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return dao.count()
  })
})

func('delete@278', () => {
  kase('empty', () => {
    dao.delete([])
    return dao.count()
  })
  kase('several with large list', () => {
    dao.delete([...Array.from({ length: 1500 }, (_, i) => `X${i + 1}`), 'S1', 'S3'])
    return [dao.count(), dao.findByIdOrNull('S1'), db.rawQuery("select count(*) from SERIES_METADATA_GENRE where SERIES_ID in ('S1', 'S3')")]
  })
})
