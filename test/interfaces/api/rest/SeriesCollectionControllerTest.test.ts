// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/SeriesCollectionControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
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
import '../../../../src/interfaces/api/ContentRestrictionChecker.js'
import '../../../../src/interfaces/api/rest/SeriesCollectionController.js'
import '../../../../src/interfaces/api/rest/SeriesController.js'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import type { Series } from '../../../../src/domain/model/Series.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesCollectionRepository } from '../../../../src/domain/persistence/SeriesCollectionRepository.js'
import { SeriesMetadataRepository } from '../../../../src/domain/persistence/SeriesMetadataRepository.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesCollectionLifecycle } from '../../../../src/domain/service/SeriesCollectionLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { first } from '../../../../src/port/kotlin.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { MockMvc, type MockMvcResultMatchersDsl, closeContext, mockMvcTest } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

describe('SeriesCollectionControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)
  const collectionLifecycle = ctx.getBean(SeriesCollectionLifecycle)
  const collectionRepository = ctx.getBean(SeriesCollectionRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)

  const library1 = makeLibrary({ name: 'Library1', id: '1' })
  const library2 = makeLibrary({ name: 'Library2', id: '2' })
  let seriesLibrary1: Series[]
  let seriesLibrary2: Series[]
  let colLib1: SeriesCollection
  let colLib2: SeriesCollection
  let colLibBoth: SeriesCollection

  beforeAll(() => {
    libraryRepository.insert(library1)
    libraryRepository.insert(library2)

    seriesLibrary1 = [1, 2, 3, 4, 5].map((it) => makeSeries(`Series_${it}`, { libraryId: library1.id })).map((it) => seriesLifecycle.createSeries(it))

    seriesLibrary2 = [6, 7, 8, 9, 10].map((it) => makeSeries(`Series_${it}`, { libraryId: library2.id })).map((it) => seriesLifecycle.createSeries(it))
  })

  afterAll(() => {
    for (const it of libraryRepository.findAll()) {
      libraryLifecycle.deleteLibrary(it)
    }
    closeContext(ctx)
  })

  afterEach(() => {
    collectionRepository.deleteAll()
  })

  function makeCollections(): void {
    colLib1 = collectionLifecycle.addCollection(
      new SeriesCollection({
        name: 'Lib1',
        seriesIds: seriesLibrary1.map((it) => it.id),
      }),
    )

    colLib2 = collectionLifecycle.addCollection(
      new SeriesCollection({
        name: 'Lib2',
        seriesIds: seriesLibrary2.map((it) => it.id),
      }),
    )

    colLibBoth = collectionLifecycle.addCollection(
      new SeriesCollection({
        name: 'Lib1+2',
        seriesIds: [...seriesLibrary1, ...seriesLibrary2].map((it) => it.id),
        ordered: true,
      }),
    )
  }

  describe('GetAndFilter', () => {
    it(
      'given user with access to all libraries when getting collections then get all collections',
      withMockCustomUser({}, async () => {
        makeCollections()

        await mockMvc.get('/api/v1/collections').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(3))
          m.jsonPath("$.content[?(@.name == 'Lib1')].filtered", (j) => j.value(false))
          m.jsonPath("$.content[?(@.name == 'Lib2')].filtered", (j) => j.value(false))
          m.jsonPath("$.content[?(@.name == 'Lib1+2')].filtered", (j) => j.value(false))
        })
      }),
    )

    it(
      'given user with access to a single library when getting collections then only get collections from this library',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeCollections()

        await mockMvc.get('/api/v1/collections').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath("$.content[?(@.name == 'Lib1')].filtered", (j) => j.value(false))
          m.jsonPath("$.content[?(@.name == 'Lib1+2')].filtered", (j) => j.value(true))
        })
      }),
    )

    it(
      'given user with access to all libraries when getting single collection then it is not filtered',
      withMockCustomUser({}, async () => {
        makeCollections()

        await mockMvc.get(`/api/v1/collections/${colLibBoth.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(10))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/collections/${colLibBoth.id}/series`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(10))
        })
      }),
    )

    it(
      'given user with access to a single library when getting single collection with items from 2 libraries then it is filtered',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeCollections()

        await mockMvc.get(`/api/v1/collections/${colLibBoth.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(5))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })
      }),
    )

    it(
      'given user with access to a single library when getting single collection from another library then return not found',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeCollections()

        await mockMvc.get(`/api/v1/collections/${colLib2.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNotFound())
        })
      }),
    )
  })

  describe('ContentRestriction', () => {
    it(
      'given user only allowed content with specific age rating when getting collections then only get collections that satisfies this criteria',
      withMockCustomUser({ allowAgeUnder: 10 }, async () => {
        const series10 = makeSeries('series_10', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(series10)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series10.id).copy({ ageRating: 10 }))

        const series = makeSeries('series_no', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const colAllowed = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Allowed',
            seriesIds: [series10.id],
          }),
        )

        const colFiltered = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Filtered',
            seriesIds: [series10.id, series.id],
          }),
        )

        const colDenied = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Denied',
            seriesIds: [series.id],
          }),
        )

        await mockMvc.get('/api/v1/collections').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colAllowed.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/collections/${colFiltered.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colDenied.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/series/${series10.id}/collections`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })
      }),
    )

    it(
      'given user disallowed content with specific age rating when getting collections then only gets collections that satisfies this criteria',
      withMockCustomUser({ excludeAgeOver: 16 }, async () => {
        const series10 = makeSeries('series_10', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(series10)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series10.id).copy({ ageRating: 10 }))

        const series18 = makeSeries('series_18', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(series18)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series18.id).copy({ ageRating: 18 }))

        const series16 = makeSeries('series_16', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(series16)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(series16.id).copy({ ageRating: 16 }))

        const series = makeSeries('series_no', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const colAllowed = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Allowed',
            seriesIds: [series10.id, series.id],
          }),
        )

        const colFiltered = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Filtered',
            seriesIds: [series10.id, series16.id, series18.id, series.id],
          }),
        )

        const colDenied = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Denied',
            seriesIds: [series16.id, series18.id],
          }),
        )

        await mockMvc.get('/api/v1/collections').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colAllowed.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/collections/${colFiltered.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colDenied.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/series/${series10.id}/collections`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })
      }),
    )

    it(
      'given user allowed only content with specific labels when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ allowLabels: ['kids', 'cute'] }, async () => {
        const seriesKids = makeSeries('series_kids', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesKids)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesKids.id).copy({ sharingLabels: new Set(['kids']) }))

        const seriesCute = makeSeries('series_cute', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesCute)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesCute.id).copy({ sharingLabels: new Set(['cute', 'other']) }))

        const seriesAdult = makeSeries('series_adult', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesAdult)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesAdult.id).copy({ sharingLabels: new Set(['adult']) }))

        const series = makeSeries('series_no', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const colAllowed = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Allowed',
            seriesIds: [seriesKids.id, seriesCute.id],
          }),
        )

        const colFiltered = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Filtered',
            seriesIds: [series.id, seriesKids.id, seriesCute.id, seriesAdult.id],
          }),
        )

        const colDenied = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Denied',
            seriesIds: [seriesAdult.id, series.id],
          }),
        )

        await mockMvc.get('/api/v1/collections').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colAllowed.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/collections/${colFiltered.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colDenied.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/series/${seriesKids.id}/collections`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })
      }),
    )

    it(
      'given user disallowed content with specific labels when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ excludeLabels: ['kids', 'cute'] }, async () => {
        const seriesKids = makeSeries('series_kids', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesKids)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesKids.id).copy({ sharingLabels: new Set(['kids']) }))

        const seriesCute = makeSeries('series_cute', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesCute)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesCute.id).copy({ sharingLabels: new Set(['cute', 'other']) }))

        const seriesAdult = makeSeries('series_adult', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesAdult)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesAdult.id).copy({ sharingLabels: new Set(['adult']) }))

        const series = makeSeries('series_no', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const colAllowed = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Allowed',
            seriesIds: [seriesAdult.id, series.id],
          }),
        )

        const colFiltered = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Filtered',
            seriesIds: [seriesAdult.id, seriesCute.id, seriesKids.id, series.id],
          }),
        )

        const colDenied = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Denied',
            seriesIds: [seriesKids.id, seriesCute.id],
          }),
        )

        await mockMvc.get('/api/v1/collections').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colAllowed.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/collections/${colFiltered.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colDenied.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/series/${series.id}/collections`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })
      }),
    )

    it(
      'given user allowed and disallowed content when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ allowAgeUnder: 10, allowLabels: ['kids'], excludeLabels: ['adult', 'teen'] }, async () => {
        const seriesKids = makeSeries('series_kids', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesKids)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesKids.id).copy({ sharingLabels: new Set(['kids']) }))

        const seriesCute = makeSeries('series_cute', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesCute)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesCute.id).copy({ ageRating: 5, sharingLabels: new Set(['cute', 'other']) }))

        const seriesAdult = makeSeries('series_adult', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesAdult)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesAdult.id).copy({ sharingLabels: new Set(['adult']) }))

        const series = makeSeries('series_no', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const colAllowed = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Allowed',
            seriesIds: [seriesKids.id, seriesCute.id],
          }),
        )

        const colFiltered = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Filtered',
            seriesIds: [series.id, seriesKids.id, seriesCute.id, seriesAdult.id],
          }),
        )

        const colDenied = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Denied',
            seriesIds: [seriesAdult.id, series.id],
          }),
        )

        await mockMvc.get('/api/v1/collections').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colAllowed.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/collections/${colFiltered.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colDenied.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/series/${seriesKids.id}/collections`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })
      }),
    )

    it(
      'given user allowed and disallowed content when getting series then only gets series that satisfies this criteria (2)',
      withMockCustomUser({ excludeAgeOver: 16, allowLabels: ['teen'] }, async () => {
        const seriesTeen16 = makeSeries('series_teen_16', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesTeen16)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesTeen16.id).copy({ sharingLabels: new Set(['teen']), ageRating: 16 }))

        const seriesTeen = makeSeries('series_teen', { libraryId: library1.id })
        {
          const created = seriesLifecycle.createSeries(seriesTeen)
          const books = [makeBook('1', { libraryId: library1.id })]
          seriesLifecycle.addBooks(created, books)
        }
        seriesMetadataRepository.update(seriesMetadataRepository.findById(seriesTeen.id).copy({ sharingLabels: new Set(['teen']) }))

        const colAllowed = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Allowed',
            seriesIds: [seriesTeen.id],
          }),
        )

        const colFiltered = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Filtered',
            seriesIds: [seriesTeen16.id, seriesTeen.id],
          }),
        )

        const colDenied = collectionLifecycle.addCollection(
          new SeriesCollection({
            name: 'Denied',
            seriesIds: [seriesTeen16.id],
          }),
        )

        await mockMvc.get('/api/v1/collections').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colAllowed.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/collections/${colFiltered.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.seriesIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/collections/${colDenied.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/series/${seriesTeen.id}/collections`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${colAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${colFiltered.name}')].filtered`, (j) => j.value(true))
        })
      }),
    )
  })

  describe('Creation', () => {
    it(
      'given non-admin user when creating collection then return forbidden',
      withMockCustomUser({}, async () => {
        // language=JSON
        const jsonString = '{"name":"collection","ordered":false,"seriesIds":["3"]}'

        await mockMvc
          .post('/api/v1/collections', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isForbidden())
          })
      }),
    )

    it(
      'given admin user when creating collection then return ok',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        // language=JSON
        const jsonString = `{"name":"collection","ordered":false,"seriesIds":["${first(seriesLibrary1).id}"]}`

        await mockMvc
          .post('/api/v1/collections', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isOk())
            m.jsonPath('$.seriesIds.length()', (j) => j.value(1))
            m.jsonPath('$.name', (j) => j.value('collection'))
            m.jsonPath('$.ordered', (j) => j.value(false))
          })
      }),
    )

    it(
      'given existing collections when creating collection with existing name then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeCollections()

        // language=JSON
        const jsonString = `{"name":"Lib1","ordered":false,"seriesIds":["${first(seriesLibrary1).id}"]}`

        await mockMvc
          .post('/api/v1/collections', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given collection with duplicate seriesIds when creating collection then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        // language=JSON
        const jsonString = `{"name":"Lib1","ordered":false,"seriesIds":["${first(seriesLibrary1).id}","${first(seriesLibrary1).id}"]}`

        await mockMvc
          .post('/api/v1/collections', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )
  })

  describe('Update', () => {
    it(
      'given non-admin user when updating collection then return forbidden',
      withMockCustomUser({}, async () => {
        // language=JSON
        const jsonString = '{"name":"collection","ordered":false,"seriesIds":["3"]}'

        await mockMvc
          .patch('/api/v1/collections/5', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isForbidden())
          })
      }),
    )

    it(
      'given admin user when updating collection then return no content',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeCollections()

        // language=JSON
        const jsonString = `{"name":"updated","ordered":true,"seriesIds":["${first(seriesLibrary1).id}"]}`

        await mockMvc
          .patch(`/api/v1/collections/${colLib1.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        await mockMvc.get(`/api/v1/collections/${colLib1.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('updated'))
          m.jsonPath('$.ordered', (j) => j.value(true))
          m.jsonPath('$.seriesIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })
      }),
    )

    it(
      'given existing collections when updating collection with existing name then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeCollections()

        // language=JSON
        const jsonString = '{"name":"Lib2"}'

        await mockMvc
          .patch(`/api/v1/collections/${colLib1.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given existing collection when updating collection with duplicate seriesIds then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeCollections()

        // language=JSON
        const jsonString = `{"seriesIds":["${first(seriesLibrary1).id}","${first(seriesLibrary1).id}"]}`

        await mockMvc
          .patch(`/api/v1/collections/${colLib1.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given admin user when updating collection then only updated fields are modified',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeCollections()

        await mockMvc.patch(`/api/v1/collections/${colLib1.id}`, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = '{"ordered":true}'
        })

        await mockMvc.get(`/api/v1/collections/${colLib1.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Lib1'))
          m.jsonPath('$.ordered', (j) => j.value(true))
          m.jsonPath('$.seriesIds.length()', (j) => j.value(5))
        })

        await mockMvc.patch(`/api/v1/collections/${colLib2.id}`, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = '{"name":"newName"}'
        })

        await mockMvc.get(`/api/v1/collections/${colLib2.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('newName'))
          m.jsonPath('$.ordered', (j) => j.value(false))
          m.jsonPath('$.seriesIds.length()', (j) => j.value(5))
        })

        await mockMvc.patch(`/api/v1/collections/${colLibBoth.id}`, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = `{"seriesIds":["${first(seriesLibrary1).id}"]}`
        })

        await mockMvc.get(`/api/v1/collections/${colLibBoth.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Lib1+2'))
          m.jsonPath('$.ordered', (j) => j.value(true))
          m.jsonPath('$.seriesIds.length()', (j) => j.value(1))
        })
      }),
    )
  })

  describe('Delete', () => {
    it(
      'given non-admin user when deleting collection then return forbidden',
      withMockCustomUser({}, async () => {
        await mockMvc.delete('/api/v1/collections/5').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isForbidden())
        })
      }),
    )

    it(
      'given admin user when deleting collection then return no content',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeCollections()

        await mockMvc.delete(`/api/v1/collections/${colLib1.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNoContent())
        })

        await mockMvc.get(`/api/v1/collections/${colLib1.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isNotFound())
        })
      }),
    )
  })
})
