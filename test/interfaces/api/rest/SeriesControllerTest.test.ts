// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/SeriesControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../../src/infrastructure/jooq/main/SidecarDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailBookDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailSeriesDao.js'
import '../../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import '../../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../../src/infrastructure/jooq/main/PageHashDao.js'
import '../../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../../src/infrastructure/jooq/main/SyncPointDao.js'
import '../../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import '../../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../../src/infrastructure/jooq/tasks/TasksDao.js'
import '../../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import '../../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../../src/infrastructure/cache/TransientBookCache.js'
import '../../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneHelper.js'
import '../../../../src/infrastructure/search/SearchIndexLifecycle.js'
import '../../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import '../../../../src/infrastructure/security/session/SessionConfiguration.js'
import '../../../../src/infrastructure/metadata/barcode/IsbnConfiguration.js'
import '../../../../src/infrastructure/metadata/comicrack/ComicInfoProvider.js'
import '../../../../src/infrastructure/metadata/localartwork/LocalArtworkProvider.js'
import '../../../../src/infrastructure/metadata/mylar/MylarSeriesProvider.js'
import '../../../../src/infrastructure/jooq/main/ReadListRequestDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailReadListDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailSeriesCollectionDao.js'
import '../../../../src/domain/service/FileSystemScanner.js'
import '../../../../src/domain/service/SeriesLifecycle.js'
import '../../../../src/domain/service/BookLifecycle.js'
import '../../../../src/domain/service/ReadListLifecycle.js'
import '../../../../src/domain/service/SeriesCollectionLifecycle.js'
import '../../../../src/domain/service/KomgaUserLifecycle.js'
import '../../../../src/domain/service/LibraryLifecycle.js'
import '../../../../src/domain/service/LibraryContentLifecycle.js'
import '../../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../../src/interfaces/api/ContentRestrictionChecker.js'
import '../../../../src/interfaces/api/rest/SeriesController.js'
import '../../../../src/interfaces/api/rest/BookController.js'
import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { MarkSelectedPreference } from '../../../../src/domain/model/MarkSelectedPreference.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { BookMetadataRepository } from '../../../../src/domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../../src/domain/persistence/MediaRepository.js'
import { SeriesMetadataRepository } from '../../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { BookLifecycle } from '../../../../src/domain/service/BookLifecycle.js'
import { FileSystemScanner } from '../../../../src/domain/service/FileSystemScanner.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryContentLifecycle } from '../../../../src/domain/service/LibraryContentLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { URL } from '../../../../src/port/java-net.js'
import { first, nn, sortedBy } from '../../../../src/port/kotlin.js'
import { createTempFile } from '../../../../src/port/kotlin-io-path.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { any, clearMocks, every, mockk } from '../../../support/mockk.js'
import { MockMvc, type MockMvcResultMatchersDsl, closeContext, containsString, equalToIgnoringCase, mockMvcTest, nullValue } from '../../../support/mockmvc.js'
import { toScanResult } from '../../../Utils.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

describe('SeriesControllerTest', () => {
  // @MockkBean
  const mockScanner = mockk(FileSystemScanner)

  const ctx = mockMvcTest({}, [{ type: FileSystemScanner, instance: mockScanner }])
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const libraryContentLifecycle = ctx.getBean(LibraryContentLifecycle)
  const bookRepository = ctx.getBean(BookRepository)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const mediaRepository = ctx.getBean(MediaRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const mockMvc = ctx.getBean(MockMvc)

  const library = makeLibrary({ id: '1' })
  // PORT: deleteOnExit() des fichiers temporaires
  const tempFiles: string[] = []

  beforeAll(() => {
    libraryRepository.insert(library)
    userRepository.insert(new KomgaUser({ email: 'user@example.org', password: '', id: '1' }))
  })

  afterAll(async () => {
    for (const it of userRepository.findAll()) {
      userLifecycle.deleteUser(it)
    }
    for (const it of libraryRepository.findAll()) {
      libraryLifecycle.deleteLibrary(it)
    }
    for (const f of tempFiles) rmSync(f, { force: true })
    await closeContext(ctx)
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
    // PORT: les @MockkBean sont réinitialisés après chaque test
    clearMocks(mockScanner)
  })

  describe('Search', () => {
    it(
      'given series when searching by regex then series are found',
      withMockCustomUser({}, async () => {
        const alphaC = seriesLifecycle.createSeries(makeSeries('TheAlpha', { libraryId: library.id }))
        seriesMetadataRepository.update(seriesMetadataRepository.findById(alphaC.id).copy({ titleSort: 'Alpha, The' }))
        seriesLifecycle.createSeries(makeSeries('TheBeta', { libraryId: library.id }))

        await mockMvc
          .get('/api/v1/series', (r) => {
            r.param('search_regex', 'a$,title_sort')
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isOk())
            m.jsonPath('$.content.length()', (j) => j.value(1))
            m.jsonPath('$.content[0].metadata.title', (j) => j.value('TheBeta'))
          })

        await mockMvc
          .get('/api/v1/series', (r) => {
            r.param('search_regex', '^the,title')
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isOk())
            m.jsonPath('$.content.length()', (j) => j.value(2))
            m.jsonPath('$.content[0].metadata.title', (j) => j.value('TheAlpha'))
            m.jsonPath('$.content[1].metadata.title', (j) => j.value('TheBeta'))
          })
      }),
    )
  })

  describe('SeriesSort', () => {
    it(
      'given series with titleSort when requesting via api then series are sorted by titleSort',
      withMockCustomUser({}, async () => {
        const alphaC = seriesLifecycle.createSeries(makeSeries('TheAlpha', { libraryId: library.id }))
        seriesMetadataRepository.update(seriesMetadataRepository.findById(alphaC.id).copy({ titleSort: 'Alpha, The' }))
        seriesLifecycle.createSeries(makeSeries('Beta', { libraryId: library.id }))

        await mockMvc.get('/api/v1/series').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content[0].metadata.title', (j) => j.value('TheAlpha'))
          m.jsonPath('$.content[1].metadata.title', (j) => j.value('Beta'))
        })
      }),
    )

    it(
      'given series when requesting via api then series are sorted insensitive of case',
      withMockCustomUser({}, async () => {
        for (const it of ['a', 'b', 'B', 'C'].map((name) => makeSeries(name, { libraryId: library.id }))) {
          seriesLifecycle.createSeries(it)
        }

        await mockMvc
          .get('/api/v1/series', (r) => {
            r.param('sort', 'metadata.titleSort,asc')
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isOk())
            m.jsonPath('$.content[0].metadata.title', (j) => j.value('a'))
            m.jsonPath('$.content[1].metadata.title', (j) => j.value(equalToIgnoringCase('b')))
            m.jsonPath('$.content[2].metadata.title', (j) => j.value(equalToIgnoringCase('b')))
            m.jsonPath('$.content[3].metadata.title', (j) => j.value('C'))
          })
      }),
    )
  })

  describe('BookOrdering', () => {
    it(
      'given books with unordered index when requesting via api then books are ordered',
      withMockCustomUser({}, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        const addedBook = makeBook('2', { libraryId: library.id })
        seriesLifecycle.addBooks(createdSeries, [addedBook])
        seriesLifecycle.sortBooks(createdSeries)

        await mockMvc.get(`/api/v1/series/${createdSeries.id}/books`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content[0].name', (j) => j.value('1'))
          m.jsonPath('$.content[1].name', (j) => j.value('2'))
          m.jsonPath('$.content[2].name', (j) => j.value('3'))
        })
      }),
    )

    it(
      'given many books with unordered index when requesting via api then books are ordered and paged',
      withMockCustomUser({}, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = Array.from({ length: 50 }, (_, i) => 1 + i * 2).map((it) => makeBook(`${it}`, { libraryId: library.id }))
          seriesLifecycle.addBooks(createdSeries, books)
        }

        const addedBook = makeBook('2', { libraryId: library.id })
        seriesLifecycle.addBooks(createdSeries, [addedBook])
        seriesLifecycle.sortBooks(createdSeries)

        await mockMvc.get(`/api/v1/series/${createdSeries.id}/books`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content[0].name', (j) => j.value('1'))
          m.jsonPath('$.content[1].name', (j) => j.value('2'))
          m.jsonPath('$.content[2].name', (j) => j.value('3'))
          m.jsonPath('$.content[3].name', (j) => j.value('5'))
          m.jsonPath('$.size', (j) => j.value(20))
          m.jsonPath('$.first', (j) => j.value(true))
          m.jsonPath('$.number', (j) => j.value(0))
        })
      }),
    )
  })

  describe('LimitedUser', () => {
    it(
      'given user with access to a single library when getting series then only gets series from this library',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        {
          const created = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const otherLibrary = makeLibrary({ name: 'other' })
        libraryRepository.insert(otherLibrary)
        {
          const created = seriesLifecycle.createSeries(makeSeries('otherSeries', { libraryId: otherLibrary.id }))
          const books = [makeBook('2', { libraryId: otherLibrary.id })]
          seriesLifecycle.addBooks(created, books)
        }

        await mockMvc.get('/api/v1/series').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(1))
          m.jsonPath('$.content[0].name', (j) => j.value('series'))
        })
      }),
    )
  })

  describe('ContentRestrictedUser', () => {
    it(
      'given user only allowed content with specific age rating when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ allowAgeUnder: 10 }, async () => {
        const series10 = makeSeries('series_10', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series10)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series10.id).copy({ ageRating: 10 }))

        const series5 = makeSeries('series_5', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series5)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series5.id).copy({ ageRating: 5 }))

        const series15 = makeSeries('series_15', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series15)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series15.id).copy({ ageRating: 15 }))

        const series = makeSeries('series_no', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        await mockMvc.get(`/api/v1/series/${series5.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })
        await mockMvc.get(`/api/v1/series/${series10.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })
        await mockMvc.get(`/api/v1/series/${series15.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
        await mockMvc.get(`/api/v1/series/${series.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })

        await mockMvc.get('/api/v1/series?sort=metadata.titleSort').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value('series_10'))
          m.jsonPath('$.content[1].name', (j) => j.value('series_5'))
        })
      }),
    )

    it(
      'given user disallowed content with specific age rating when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ excludeAgeOver: 16 }, async () => {
        const series10 = makeSeries('series_10', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series10)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series10.id).copy({ ageRating: 10 }))

        const series18 = makeSeries('series_18', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series18)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series18.id).copy({ ageRating: 18 }))

        const series16 = makeSeries('series_16', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series16)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series16.id).copy({ ageRating: 16 }))

        const series = makeSeries('series_no', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        await mockMvc.get(`/api/v1/series/${series.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })
        await mockMvc.get(`/api/v1/series/${series10.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })
        await mockMvc.get(`/api/v1/series/${series16.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
        await mockMvc.get(`/api/v1/series/${series18.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })

        await mockMvc.get('/api/v1/series?sort=metadata.titleSort').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value('series_10'))
          m.jsonPath('$.content[1].name', (j) => j.value('series_no'))
        })
      }),
    )

    it(
      'given user allowed only content with specific labels when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ allowLabels: ['kids', 'cute'] }, async () => {
        const seriesKids = makeSeries('series_kids', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesKids)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesKids.id).copy({ sharingLabels: new Set(['kids']) }))

        const seriesCute = makeSeries('series_cute', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesCute)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesCute.id).copy({ sharingLabels: new Set(['cute', 'other']) }))

        const seriesAdult = makeSeries('series_adult', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesAdult)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesAdult.id).copy({ sharingLabels: new Set(['adult']) }))

        const series = makeSeries('series_no', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        await mockMvc.get(`/api/v1/series/${seriesKids.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })
        await mockMvc.get(`/api/v1/series/${seriesCute.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })
        await mockMvc.get(`/api/v1/series/${seriesAdult.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
        await mockMvc.get(`/api/v1/series/${series.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })

        await mockMvc.get('/api/v1/series?sort=metadata.titleSort').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value(seriesCute.name))
          m.jsonPath('$.content[1].name', (j) => j.value(seriesKids.name))
        })
      }),
    )

    it(
      'given user disallowed content with specific labels when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ excludeLabels: ['kids', 'cute'] }, async () => {
        const seriesKids = makeSeries('series_kids', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesKids)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesKids.id).copy({ sharingLabels: new Set(['kids']) }))

        const seriesCute = makeSeries('series_cute', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesCute)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesCute.id).copy({ sharingLabels: new Set(['cute', 'other']) }))

        const seriesAdult = makeSeries('series_adult', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesAdult)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesAdult.id).copy({ sharingLabels: new Set(['adult']) }))

        const series = makeSeries('series_no', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        await mockMvc.get(`/api/v1/series/${seriesKids.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
        await mockMvc.get(`/api/v1/series/${seriesCute.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
        await mockMvc.get(`/api/v1/series/${seriesAdult.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })
        await mockMvc.get(`/api/v1/series/${series.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })

        await mockMvc.get('/api/v1/series?sort=metadata.titleSort').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value(seriesAdult.name))
          m.jsonPath('$.content[1].name', (j) => j.value(series.name))
        })
      }),
    )

    it(
      'given user allowed and disallowed content when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ allowAgeUnder: 10, allowLabels: ['kids'], excludeLabels: ['adult', 'teen'] }, async () => {
        const seriesKids = makeSeries('series_kids', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesKids)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesKids.id).copy({ sharingLabels: new Set(['kids']) }))

        const seriesCute = makeSeries('series_cute', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesCute)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesCute.id).copy({ ageRating: 5, sharingLabels: new Set(['cute', 'other']) }))

        const seriesAdult = makeSeries('series_adult', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesAdult)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesAdult.id).copy({ sharingLabels: new Set(['adult']) }))

        const series = makeSeries('series_no', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        await mockMvc.get(`/api/v1/series/${seriesKids.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })
        await mockMvc.get(`/api/v1/series/${seriesCute.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
        })
        await mockMvc.get(`/api/v1/series/${seriesAdult.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
        await mockMvc.get(`/api/v1/series/${series.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })

        await mockMvc.get('/api/v1/series?sort=metadata.titleSort').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value(seriesCute.name))
          m.jsonPath('$.content[1].name', (j) => j.value(seriesKids.name))
        })
      }),
    )

    it(
      'given user allowed and disallowed content when getting series then only gets series that satisfies this criteria (2)',
      withMockCustomUser({ excludeAgeOver: 16, allowLabels: ['teen'] }, async () => {
        const seriesTeen16 = makeSeries('series_teen_16', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(seriesTeen16)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesTeen16.id).copy({ sharingLabels: new Set(['teen']), ageRating: 16 }))

        await mockMvc.get(`/api/v1/series/${seriesTeen16.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })

        await mockMvc.get('/api/v1/series').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(0))
        })
      }),
    )
  })

  describe('UserWithoutLibraryAccess', () => {
    it(
      'given user with no access to any library when getting specific series then returns forbidden',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: [] }, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        await mockMvc.get(`/api/v1/series/${createdSeries.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
      }),
    )

    it(
      'given user with no access to any library when getting specific series thumbnail then returns forbidden',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: [] }, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        await mockMvc.get(`/api/v1/series/${createdSeries.id}/thumbnail`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
      }),
    )

    it(
      'given user with no access to any library when getting specific series books then returns forbidden',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: [] }, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        await mockMvc.get(`/api/v1/series/${createdSeries.id}/books`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
      }),
    )

    it(
      'given user with no access to any library when getting specific series file then returns forbidden',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: [] }, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        await mockMvc.get(`/api/v1/series/${createdSeries.id}/file`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
      }),
    )
  })

  describe('RestrictedUserByRole', () => {
    it(
      'given user without file download role when getting specific series file then returns forbidden',
      withMockCustomUser({ roles: [] }, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        await mockMvc.get(`/api/v1/series/${createdSeries.id}/file`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
      }),
    )
  })

  describe('MediaNotReady', () => {
    it(
      'given book without thumbnail when getting series thumbnail then returns not found',
      withMockCustomUser({}, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        await mockMvc.get(`/api/v1/series/${createdSeries.id}/thumbnail`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNotFound())
        })
      }),
    )
  })

  describe('DtoUrlSanitization', () => {
    it(
      'given regular user when getting series then url is hidden',
      withMockCustomUser({}, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        const validation = (m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content[0].url', (j) => j.value(''))
        }

        await mockMvc.get('/api/v1/series').andExpect(validation)

        await mockMvc.get('/api/v1/series/latest').andExpect(validation)

        await mockMvc.get('/api/v1/series/new').andExpect(validation)

        await mockMvc.get(`/api/v1/series/${createdSeries.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.url', (j) => j.value(''))
        })
      }),
    )

    it(
      'given admin user when getting series then url is available',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        const validation = (m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content[0].url', (j) => j.value(containsString('series')))
        }

        await mockMvc.get('/api/v1/series').andExpect(validation)

        await mockMvc.get('/api/v1/series/latest').andExpect(validation)

        await mockMvc.get('/api/v1/series/new').andExpect(validation)

        await mockMvc.get(`/api/v1/series/${createdSeries.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.url', (j) => j.value(containsString('series')))
        })
      }),
    )
  })

  describe('MetadataUpdate', () => {
    it(
      'given non-admin user when updating metadata then raise forbidden',
      withMockCustomUser({}, async () => {
        await mockMvc
          .patch('/api/v1/series/1/metadata', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = '{}'
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isForbidden())
          })
      }),
    )

    it.each(['{"title":""}', '{"titleSort":""}', '{"ageRating":-1}', '{"totalBookCount":0}', '{"language":"japanese"}'])(
      'given invalid json when updating metadata then raise validation error',
      async (jsonString: string) => {
        await withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        await mockMvc
          .patch('/api/v1/series/1/metadata', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isBadRequest())
          })
        })()
      },
    )

    it(
      'given valid json when updating metadata then fields are updated',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        // language=JSON
        const jsonString = `{
          "title":"newTitle",
          "titleLock":true,
          "titleSort":"newTitleSort",
          "titleSortLock":true,
          "status":"HIATUS",
          "statusLock":true,
          "summary":"newSummary",
          "summaryLock":true,
          "readingDirection":"LEFT_TO_RIGHT",
          "readingDirectionLock":true,
          "ageRating":12,
          "ageRatingLock":true,
          "publisher":"newPublisher",
          "publisherLock":true,
          "language":"fra",
          "languageLock":true,
          "genres":["Action"],
          "genresLock":true,
          "tags":["tag"],
          "tagsLock":true,
          "totalBookCount":5,
          "totalBookCountLock":true
        }`

        await mockMvc
          .patch(`/api/v1/series/${createdSeries.id}/metadata`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        const updatedMetadata = seriesMetadataRepository.findById(createdSeries.id)
        {
          const it = updatedMetadata
          expect(it.title).toBe('newTitle')
          expect(it.titleSort).toBe('newTitleSort')
          expect(it.status).toBe(SeriesMetadata.Status.HIATUS)
          expect(it.readingDirection).toBe(SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT)
          expect(it.publisher).toBe('newPublisher')
          expect(it.summary).toBe('newSummary')
          expect(it.language).toBe('fr')
          expect(it.ageRating).toBe(12)
          expect([...it.genres]).toEqual(['action'])
          expect([...it.tags]).toEqual(['tag'])
          expect(it.totalBookCount).toBe(5)

          expect(it.titleLock).toBe(true)
          expect(it.titleSortLock).toBe(true)
          expect(it.statusLock).toBe(true)
          expect(it.readingDirectionLock).toBe(true)
          expect(it.publisherLock).toBe(true)
          expect(it.ageRatingLock).toBe(true)
          expect(it.languageLock).toBe(true)
          expect(it.summaryLock).toBe(true)
          expect(it.genresLock).toBe(true)
          expect(it.tagsLock).toBe(true)
          expect(it.totalBookCountLock).toBe(true)
        }
      }),
    )

    it(
      'given json with null fields when updating metadata then fields with null are unset',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        {
          const metadata = seriesMetadataRepository.findById(createdSeries.id)
          const updated = metadata.copy({
            ageRating: 12,
            readingDirection: SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT,
            genres: new Set(['Action']),
            tags: new Set(['tag']),
            totalBookCount: 5,
          })

          seriesMetadataRepository.update(updated)
        }

        const metadata = seriesMetadataRepository.findById(createdSeries.id)
        expect(metadata.readingDirection).toBe(SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT)
        expect(metadata.ageRating).toBe(12)
        expect(metadata.genres.size).toBe(1)

        // language=JSON
        const jsonString = `{
          "readingDirection":null,
          "ageRating":null,
          "genres":null,
          "tags":null,
          "totalBookCount":null
        }`

        await mockMvc
          .patch(`/api/v1/series/${createdSeries.id}/metadata`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        const updatedMetadata = seriesMetadataRepository.findById(createdSeries.id)
        expect(updatedMetadata.readingDirection).toBeNull()
        expect(updatedMetadata.ageRating).toBeNull()
        expect(updatedMetadata.genres.size).toBe(0)
        expect(updatedMetadata.tags.size).toBe(0)
        expect(updatedMetadata.totalBookCount).toBeNull()
      }),
    )
  })

  describe('HttpCache', () => {
    it(
      'given request with cache headers when getting series thumbnail then returns 304 not modified',
      withMockCustomUser({}, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        {
          const book = first(bookRepository.findAll())
          bookLifecycle.addThumbnailForBook(
            new ThumbnailBook({
              thumbnail: randomBytes(1),
              bookId: book.id,
              type: ThumbnailBook.Type.GENERATED,
              fileSize: 0,
              mediaType: '',
              dimension: new Dimension({ width: 0, height: 0 }),
            }),
            MarkSelectedPreference.YES,
          )
        }

        const url = `/api/v1/series/${createdSeries.id}/thumbnail`

        const response = (await mockMvc.get(url).andReturn()).response

        await mockMvc
          .get(url, (r) => {
            r.headers((h) => {
              h.ifNoneMatch = [nn(response.getHeader('ETag'))]
            })
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNotModified())
          })
      }),
    )

    it(
      'given request with cache headers and modified first book when getting series thumbnail then returns 200 ok',
      withMockCustomUser({}, async () => {
        const createdSeries = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1', { libraryId: library.id }), makeBook('2', { libraryId: library.id })]
          seriesLifecycle.addBooks(createdSeries, books)
        }

        for (const book of bookRepository.findAll()) {
          bookLifecycle.addThumbnailForBook(
            new ThumbnailBook({
              thumbnail: randomBytes(1),
              bookId: book.id,
              type: ThumbnailBook.Type.GENERATED,
              fileSize: 0,
              mediaType: '',
              dimension: new Dimension({ width: 0, height: 0 }),
            }),
            MarkSelectedPreference.YES,
          )
        }

        const url = `/api/v1/series/${createdSeries.id}/thumbnail`

        const response = (await mockMvc.get(url).andReturn()).response

        {
          const book = nn(bookRepository.findAll().find((it) => it.name === '1'))
          bookMetadataRepository.update(bookMetadataRepository.findById(book.id).copy({ numberSort: 3 }))
        }

        await mockMvc
          .get(url, (r) => {
            r.headers((h) => {
              h.ifNoneMatch = [nn(response.getHeader('ETag'))]
            })
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isOk())
          })
      }),
    )
  })

  describe('ReadProgress', () => {
    it(
      'given user when marking series as read then progress is marked for all books',
      withMockCustomUser({ id: '1' }, async () => {
        const series = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1.cbr', { libraryId: library.id }), makeBook('2.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(series, books)
          seriesLifecycle.sortBooks(series)
        }

        for (const book of bookRepository.findAll()) {
          const media = mediaRepository.findById(book.id)
          mediaRepository.update(
            media.copy({
              status: Media.Status.READY,
              pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
            }),
          )
        }

        await mockMvc.post(`/api/v1/series/${series.id}/read-progress`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNoContent())
        })

        await mockMvc.get(`/api/v1/series/${series.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.booksUnreadCount', (j) => j.value(0))
          m.jsonPath('$.booksReadCount', (j) => j.value(2))
        })

        await mockMvc.get(`/api/v1/series/${series.id}/books`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content[0].readProgress.completed', (j) => j.value(true))
          m.jsonPath('$.content[1].readProgress.completed', (j) => j.value(true))
          m.jsonPath('$.numberOfElements', (j) => j.value(2))
        })
      }),
    )

    it(
      'given user when marking series as unread then progress is removed for all books',
      withMockCustomUser({ id: '1' }, async () => {
        const series = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1.cbr', { libraryId: library.id }), makeBook('2.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(series, books)
          seriesLifecycle.sortBooks(series)
        }

        for (const book of bookRepository.findAll()) {
          const media = mediaRepository.findById(book.id)
          mediaRepository.update(
            media.copy({
              status: Media.Status.READY,
              pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
            }),
          )
        }

        await mockMvc.post(`/api/v1/series/${series.id}/read-progress`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNoContent())
        })

        await mockMvc.delete(`/api/v1/series/${series.id}/read-progress`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNoContent())
        })

        await mockMvc.get(`/api/v1/series/${series.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.booksUnreadCount', (j) => j.value(2))
          m.jsonPath('$.booksReadCount', (j) => j.value(0))
        })

        await mockMvc.get(`/api/v1/series/${series.id}/books`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content[0].readProgress', (j) => j.value(nullValue()))
          m.jsonPath('$.content[1].readProgress', (j) => j.value(nullValue()))
          m.jsonPath('$.numberOfElements', (j) => j.value(2))
        })
      }),
    )

    it(
      'given user when marking book as in progress then progress series return books count accordingly',
      withMockCustomUser({ id: '1' }, async () => {
        const series = seriesLifecycle.createSeries(makeSeries('series', { libraryId: library.id }))
        {
          const books = [makeBook('1.cbr', { libraryId: library.id }), makeBook('2.cbr', { libraryId: library.id }), makeBook('3.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(series, books)
          seriesLifecycle.sortBooks(series)
        }

        for (const book of bookRepository.findAll()) {
          const media = mediaRepository.findById(book.id)
          mediaRepository.update(
            media.copy({
              status: Media.Status.READY,
              pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
              pageCount: 10,
            }),
          )
        }

        const books = sortedBy(bookRepository.findAll(), (it) => it.name)

        await mockMvc.patch(`/api/v1/books/${nn(books[0]).id}/read-progress`, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = '{"page": 5,"completed":false}'
        })
        await mockMvc.patch(`/api/v1/books/${nn(books[1]).id}/read-progress`, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = '{"completed":true}'
        })

        await mockMvc.get(`/api/v1/series/${series.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.booksUnreadCount', (j) => j.value(1))
          m.jsonPath('$.booksReadCount', (j) => j.value(1))
          m.jsonPath('$.booksInProgressCount', (j) => j.value(1))
        })
      }),
    )
  })

  describe('FileDownload', () => {
    it(
      'given series with Unicode name when getting series file then attachment name is correct',
      withMockCustomUser({}, async () => {
        const name = 'アキラ'
        // PORT: Files.createTempFile(name, ".cbz").also { it.toFile().deleteOnExit() }
        const tempFile = createTempFile(name, '.cbz', tmpdir())
        tempFiles.push(tempFile)
        const series = makeSeries(name, { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook(name, { libraryId: library.id, url: new URL(pathToFileURL(tempFile).href) })]
          seriesLifecycle.addBooks(created, books)
        }

        await mockMvc.get(`/api/v1/series/${series.id}/file`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.header((h) => h.string('Content-Disposition', containsString(encodeURIComponent(name)) /* PORT: URLEncoder.encode(name, UTF-8), identique pour ce nom */))
        })
      }),
    )
  })

  describe('RecentSeries', () => {
    it(
      'given series that was just created when getting updated series then series is omitted',
      withMockCustomUser({}, async () => {
        every(() => mockScanner.scanRootFolder(any())).returnsMany(
          toScanResult(new Map([[makeSeries('series'), [makeBook('book1').copy({ fileSize: 1 })]]])),
          toScanResult(new Map([[makeSeries('series'), [makeBook('book1').copy({ fileSize: 2 })]]])),
        )
        await libraryContentLifecycle.scanRootFolder(library)

        await mockMvc.get('/api/v1/series/updated').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content', (j) => j.isEmpty())
        })
      }),
    )
  })
})
