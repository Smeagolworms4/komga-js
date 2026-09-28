// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/BookControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { LocalDate } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Author } from '../../../../src/domain/model/Author.js'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { MarkSelectedPreference } from '../../../../src/domain/model/MarkSelectedPreference.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { BookMetadataRepository } from '../../../../src/domain/persistence/BookMetadataRepository.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../../src/domain/persistence/MediaRepository.js'
import { SeriesMetadataRepository } from '../../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { BookLifecycle } from '../../../../src/domain/service/BookLifecycle.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { KomgaPrincipal } from '../../../../src/infrastructure/security/KomgaPrincipal.js'
import { URL } from '../../../../src/port/java-net.js'
import { first, nn } from '../../../../src/port/kotlin.js'
import { createTempFile } from '../../../../src/port/kotlin-io-path.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import {
  MockMvc,
  MockMvcRequestBuilders,
  MockMvcResultMatchers,
  type MockMvcResultMatchersDsl,
  closeContext,
  containsString,
  mockMvcTest,
  nullValue,
  user,
} from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

describe('BookControllerTest', () => {
  // @SpringBootTest @AutoConfigureMockMvc(printOnlyOnFailure = false)
  const ctx = mockMvcTest()
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const mediaRepository = ctx.getBean(MediaRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const bookRepository = ctx.getBean(BookRepository)
  const bookLifecycle = ctx.getBean(BookLifecycle)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const mockMvc = ctx.getBean(MockMvc)

  const library = makeLibrary({ id: '1' })
  const user1 = new KomgaUser({ email: 'user@example.org', password: '', id: '1' })
  const user2 = new KomgaUser({ email: 'user2@example.org', password: '', id: '2' })
  // PORT: deleteOnExit() des fichiers temporaires
  const tempFiles: string[] = []

  beforeAll(() => {
    libraryRepository.insert(library)
    userRepository.insert(user1)
    userRepository.insert(user2)
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
  })

  describe('LimitedUser', () => {
    it(
      'given user with access to a single library when getting books then only gets books from this library',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const otherLibrary = makeLibrary({ name: 'other' })
        libraryRepository.insert(otherLibrary)
        {
          const series = makeSeries('otherSeries', { libraryId: otherLibrary.id })
          const created = seriesLifecycle.createSeries(series)
          const otherBooks = [makeBook('2', { libraryId: otherLibrary.id })]
          seriesLifecycle.addBooks(created, otherBooks)
        }

        await mockMvc.get('/api/v1/books').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(1))
          m.jsonPath('$.content[0].name', (j) => j.value('1'))
        })
      }),
    )
  })

  describe('RestrictedContent', () => {
    it(
      'given user only allowed content with specific age rating when getting books then only gets books that satisfies this criteria',
      withMockCustomUser({ allowAgeUnder: 10 }, async () => {
        const book10 = makeBook('book_10', { libraryId: library.id })
        {
          const series = makeSeries('series_10', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book10]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ ageRating: 10 }))
          }
        }

        const book5 = makeBook('book_5', { libraryId: library.id })
        {
          const series = makeSeries('series_5', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book5]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ ageRating: 5 }))
          }
        }

        const book15 = makeBook('book_15', { libraryId: library.id })
        {
          const series = makeSeries('series_15', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book15]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ ageRating: 15 }))
          }
        }

        const book = makeBook('book', { libraryId: library.id })
        {
          const series = makeSeries('series_no', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book]
            seriesLifecycle.addBooks(created, books)
          }
        }

        await mockMvc.get(`/api/v1/books/${book5.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))
        await mockMvc.get(`/api/v1/books/${book10.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))
        await mockMvc.get(`/api/v1/books/${book15.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))

        await mockMvc.get('/api/v1/books?sort=metadata.title').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value(book10.name))
          m.jsonPath('$.content[1].name', (j) => j.value(book5.name))
        })
      }),
    )

    it(
      'given user disallowed content with specific age rating when getting books then only gets books that satisfies this criteria',
      withMockCustomUser({ excludeAgeOver: 10 }, async () => {
        const book10 = makeBook('book_10', { libraryId: library.id })
        {
          const series = makeSeries('series_10', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book10]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ ageRating: 10 }))
          }
        }

        const book5 = makeBook('book_5', { libraryId: library.id })
        {
          const series = makeSeries('series_5', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book5]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ ageRating: 5 }))
          }
        }

        const book15 = makeBook('book_15', { libraryId: library.id })
        {
          const series = makeSeries('series_15', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book15]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ ageRating: 15 }))
          }
        }

        const book = makeBook('book', { libraryId: library.id })
        {
          const series = makeSeries('series_no', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book]
            seriesLifecycle.addBooks(created, books)
          }
        }

        await mockMvc.get(`/api/v1/books/${book5.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))
        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))
        await mockMvc.get(`/api/v1/books/${book10.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
        await mockMvc.get(`/api/v1/books/${book15.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))

        await mockMvc.get('/api/v1/books?sort=metadata.title').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value(book.name))
          m.jsonPath('$.content[1].name', (j) => j.value(book5.name))
        })
      }),
    )

    it(
      'given user allowed content with specific labels when getting series then only gets books that satisfies this criteria',
      withMockCustomUser({ allowLabels: ['kids', 'cute'] }, async () => {
        const bookKids = makeBook('book_kids', { libraryId: library.id })
        {
          const series = makeSeries('series_kids', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookKids]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['kids']) }))
          }
        }

        const bookCute = makeBook('book_cute', { libraryId: library.id })
        {
          const series = makeSeries('series_cute', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookCute]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['cute', 'other']) }))
          }
        }

        const bookAdult = makeBook('book_adult', { libraryId: library.id })
        {
          const series = makeSeries('series_adult', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookAdult]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['adult']) }))
          }
        }

        const book = makeBook('book', { libraryId: library.id })
        {
          const series = makeSeries('series_no', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book]
            seriesLifecycle.addBooks(created, books)
          }
        }

        await mockMvc.get(`/api/v1/books/${bookKids.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))
        await mockMvc.get(`/api/v1/books/${bookCute.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))
        await mockMvc.get(`/api/v1/books/${bookAdult.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))

        await mockMvc.get('/api/v1/books?sort=metadata.title').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value(bookCute.name))
          m.jsonPath('$.content[1].name', (j) => j.value(bookKids.name))
        })
      }),
    )

    it(
      'given user disallowed content with specific labels when getting books then only gets books that satisfies this criteria',
      withMockCustomUser({ excludeLabels: ['kids', 'cute'] }, async () => {
        const bookKids = makeBook('book_kids', { libraryId: library.id })
        {
          const series = makeSeries('series_kids', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookKids]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['kids']) }))
          }
        }

        const bookCute = makeBook('book_cute', { libraryId: library.id })
        {
          const series = makeSeries('series_cute', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookCute]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['cute', 'other']) }))
          }
        }

        const bookAdult = makeBook('book_adult', { libraryId: library.id })
        {
          const series = makeSeries('series_adult', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookAdult]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['adult']) }))
          }
        }

        const book = makeBook('book', { libraryId: library.id })
        {
          const series = makeSeries('series_no', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book]
            seriesLifecycle.addBooks(created, books)
          }
        }

        await mockMvc.get(`/api/v1/books/${bookKids.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
        await mockMvc.get(`/api/v1/books/${bookCute.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
        await mockMvc.get(`/api/v1/books/${bookAdult.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))
        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))

        await mockMvc.get('/api/v1/books?sort=metadata.title').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value(book.name))
          m.jsonPath('$.content[1].name', (j) => j.value(bookAdult.name))
        })
      }),
    )

    it(
      'given user allowed and disallowed content labels when getting books then only gets books that satisfies this criteria',
      withMockCustomUser({ allowAgeUnder: 10, allowLabels: ['kids'], excludeLabels: ['adult', 'teen'] }, async () => {
        const bookKids = makeBook('book_kids', { libraryId: library.id })
        {
          const series = makeSeries('series_kids', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookKids]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['kids']) }))
          }
        }

        const bookCute = makeBook('book_cute', { libraryId: library.id })
        {
          const series = makeSeries('series_cute', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookCute]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ ageRating: 5, sharingLabels: new Set(['cute', 'other']) }))
          }
        }

        const bookAdult = makeBook('book_adult', { libraryId: library.id })
        {
          const series = makeSeries('series_adult', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookAdult]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['adult']) }))
          }
        }

        const book = makeBook('book', { libraryId: library.id })
        {
          const series = makeSeries('series_no', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [book]
            seriesLifecycle.addBooks(created, books)
          }
        }

        await mockMvc.get(`/api/v1/books/${bookKids.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))
        await mockMvc.get(`/api/v1/books/${bookCute.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isOk()))
        await mockMvc.get(`/api/v1/books/${bookAdult.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))

        await mockMvc.get('/api/v1/books?sort=metadata.title').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          m.jsonPath('$.content[0].name', (j) => j.value(bookCute.name))
          m.jsonPath('$.content[1].name', (j) => j.value(bookKids.name))
        })
      }),
    )

    it(
      'given user allowed and disallowed content labels when getting books then only gets books that satisfies this criteria (2)',
      withMockCustomUser({ excludeAgeOver: 16, allowLabels: ['teen'] }, async () => {
        const bookTeen16 = makeBook('book_teen_16', { libraryId: library.id })
        {
          const series = makeSeries('series_teen_16', { libraryId: library.id })
          {
            const created = seriesLifecycle.createSeries(series)
            const books = [bookTeen16]
            seriesLifecycle.addBooks(created, books)
          }
          {
            const it = seriesMetadataRepository.findById(series.id)
            seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['teen']), ageRating: 16 }))
          }
        }

        await mockMvc.get(`/api/v1/books/${bookTeen16.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))

        await mockMvc.get('/api/v1/books').andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(0))
        })
      }),
    )
  })

  describe('UserWithoutLibraryAccess', () => {
    it(
      'given user with no access to any library when getting specific book then returns forbidden',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: [] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
      }),
    )

    it(
      'given user with no access to any library when getting specific book thumbnail then returns forbidden',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: [] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        await mockMvc.get(`/api/v1/books/${book.id}/thumbnail`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
      }),
    )

    it(
      'given user with no access to any library when getting specific book file then returns forbidden',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: [] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        await mockMvc.get(`/api/v1/books/${book.id}/file`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
      }),
    )

    it(
      'given user with no access to any library when getting specific book pages then returns forbidden',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: [] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        await mockMvc.get(`/api/v1/books/${book.id}/pages`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
      }),
    )

    it(
      'given user with no access to any library when getting specific book page then returns forbidden',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: [] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        await mockMvc.get(`/api/v1/books/${book.id}/pages/1`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
      }),
    )
  })

  describe('RestrictedUserByRole', () => {
    it(
      'given user without page streaming role when getting specific book page then returns unauthorized',
      withMockCustomUser({ roles: [] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        await mockMvc.get(`/api/v1/books/${book.id}/pages/1`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
      }),
    )

    it(
      'given user without file download role when getting specific book file then returns unauthorized',
      withMockCustomUser({ roles: [] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        await mockMvc.get(`/api/v1/books/${book.id}/file`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isForbidden()))
      }),
    )
  })

  describe('MediaNotReady', () => {
    it(
      'given book without thumbnail when getting book thumbnail then returns not found',
      withMockCustomUser({}, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        await mockMvc.get(`/api/v1/books/${book.id}/thumbnail`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isNotFound()))
      }),
    )

    it(
      'given book without file when getting book file then returns not found',
      withMockCustomUser({}, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        await mockMvc.get(`/api/v1/books/${book.id}/file`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isNotFound()))
      }),
    )

    // @ParameterizedTest @EnumSource(value = Media.Status::class, names = ["READY"], mode = EnumSource.Mode.EXCLUDE)
    it.each(Media.Status.entries().filter((it) => it.name !== 'READY'))(
      'given book with media status not ready when getting book pages then returns not found',
      withMockCustomUser({}, async (status: Media.Status) => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())
        {
          const it = mediaRepository.findById(book.id)
          mediaRepository.update(it.copy({ status: status }))
        }

        await mockMvc.get(`/api/v1/books/${book.id}/pages`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isNotFound()))
      }),
    )

    // @ParameterizedTest @EnumSource(value = Media.Status::class, names = ["READY"], mode = EnumSource.Mode.EXCLUDE)
    it.each(Media.Status.entries().filter((it) => it.name !== 'READY'))(
      'given book with media status not ready when getting specific book page then returns not found',
      withMockCustomUser({}, async (status: Media.Status) => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())
        {
          const it = mediaRepository.findById(book.id)
          mediaRepository.update(it.copy({ status: status }))
        }

        await mockMvc.get(`/api/v1/books/${book.id}/pages/1`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isNotFound()))
      }),
    )
  })

  // @ParameterizedTest @ValueSource(strings = ["25", "-5", "0"])
  it.each(['25', '-5', '0'])(
    'given book with pages when getting non-existent page then returns bad request',
    withMockCustomUser({}, async (page: string) => {
      {
        const series = makeSeries('series', { libraryId: library.id })
        const created = seriesLifecycle.createSeries(series)
        const books = [makeBook('1', { libraryId: library.id })]
        seriesLifecycle.addBooks(created, books)
      }

      const book = first(bookRepository.findAll())
      {
        const it = mediaRepository.findById(book.id)
        mediaRepository.update(
          it.copy({
            status: Media.Status.READY,
            pages: [new BookPage({ fileName: 'file', mediaType: 'image/jpeg' })],
          }),
        )
      }

      await mockMvc.get(`/api/v1/books/${book.id}/pages/${page}`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isBadRequest()))
    }),
  )

  describe('Siblings', () => {
    it(
      'given series with multiple books when getting siblings then it is returned or not found',
      withMockCustomUser({}, async () => {
        const book1 = makeBook('1', { libraryId: library.id })
        const book2 = makeBook('2', { libraryId: library.id })
        const book3 = makeBook('3', { libraryId: library.id })
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [book1, book2, book3]
          seriesLifecycle.addBooks(created, books)
          seriesLifecycle.sortBooks(created)
        }

        await mockMvc.get(`/api/v1/books/${book1.id}/previous`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isNotFound()))
        await mockMvc.get(`/api/v1/books/${book1.id}/next`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('2'))
        })

        await mockMvc.get(`/api/v1/books/${book2.id}/previous`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('1'))
        })
        await mockMvc.get(`/api/v1/books/${book2.id}/next`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('3'))
        })

        await mockMvc.get(`/api/v1/books/${book3.id}/previous`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('2'))
        })
        await mockMvc.get(`/api/v1/books/${book3.id}/next`).andExpect((m: MockMvcResultMatchersDsl) => m.status((s) => s.isNotFound()))
      }),
    )
  })

  describe('DtoUrlSanitization', () => {
    it(
      'given regular user when getting books then full url is hidden',
      withMockCustomUser({}, async () => {
        const createdSeries = (() => {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
          return created
        })()

        const book = first(bookRepository.findAll())

        const validation = (m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content[0].url', (j) => j.value('1.cbr'))
        }

        await mockMvc.get('/api/v1/books').andExpect(validation)

        await mockMvc.get('/api/v1/books/latest').andExpect(validation)

        await mockMvc.get(`/api/v1/series/${createdSeries.id}/books`).andExpect(validation)

        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.url', (j) => j.value('1.cbr'))
        })
      }),
    )

    it(
      'given admin user when getting books then full url is available',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const createdSeries = (() => {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
          return created
        })()

        const book = first(bookRepository.findAll())

        const validation = (m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content[0].url', (j) => j.value(containsString('1.cbr')))
        }

        await mockMvc.get('/api/v1/books').andExpect(validation)

        await mockMvc.get('/api/v1/books/latest').andExpect(validation)

        await mockMvc.get(`/api/v1/series/${createdSeries.id}/books`).andExpect(validation)

        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.url', (j) => j.value(containsString('1.cbr')))
        })
      }),
    )
  })

  describe('HttpCache', () => {
    it(
      'given request with cache headers when getting thumbnail then returns 304 not modified',
      withMockCustomUser({}, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())
        bookLifecycle.addThumbnailForBook(
          new ThumbnailBook({
            thumbnail: randomBytes(100),
            bookId: book.id,
            type: ThumbnailBook.Type.GENERATED,
            fileSize: 0,
            mediaType: '',
            dimension: new Dimension({ width: 0, height: 0 }),
          }),
          MarkSelectedPreference.YES,
        )

        const url = `/api/v1/books/${book.id}/thumbnail`

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
      'given request with If-Modified-Since headers when getting page then returns 304 not modified',
      withMockCustomUser({}, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())

        const url = `/api/v1/books/${book.id}/pages/1`

        const lastModified = (await mockMvc.get(url).andReturn()).response.getHeader('Last-Modified')

        await mockMvc
          .get(url, (r) => {
            r.headers((h) => {
              h.set('If-Modified-Since', nn(lastModified))
            })
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNotModified())
          })
      }),
    )

    it(
      'given request with cache headers and modified resource when getting thumbnail then returns 200 ok',
      withMockCustomUser({}, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

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

        const url = `/api/v1/books/${book.id}/thumbnail`

        const response = (await mockMvc.get(url).andReturn()).response

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

  describe('MetadataUpdate', () => {
    it(
      'given non-admin user when updating metadata then raise forbidden',
      withMockCustomUser({}, async () => {
        await mockMvc
          .patch('/api/v1/books/1/metadata', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = '{}'
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isForbidden())
          })
      }),
    )

    // @ParameterizedTest @ValueSource(strings = [...])
    it.each([
      '{"title":""}',
      '{"number":""}',
      '{"authors":"[{"name":""}]"}',
      '{"isbn":"1617290459"}', // isbn 10
      '{"isbn":"978-123-456-789-6"}', // invalid check digit
    ])(
      'given invalid json when updating metadata then raise validation error',
      withMockCustomUser({ roles: ['ADMIN'] }, async (jsonString: string) => {
        await mockMvc
          .patch('/api/v1/books/1/metadata', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given valid json when updating metadata then fields are updated',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const bookId = first(bookRepository.findAll()).id

        // language=JSON
        const jsonString = `{
  "title":"newTitle",
  "titleLock":true,
  "summary":"newSummary",
  "summaryLock":true,
  "number":"newNumber",
  "numberLock":true,
  "numberSort": 1.0,
  "numberSortLock":true,
  "releaseDate":"2020-01-01",
  "releaseDateLock":true,
  "authors":[
    {
      "name":"newAuthor",
      "role":"newAuthorRole"
    },
    {
      "name":"newAuthor2",
      "role":"newAuthorRole2"
    }
  ],
  "authorsLock":true,
  "tags":["tag"],
  "tagsLock":true,
  "isbn":"978-161-729-045-9abc xxxoefj",
  "isbnLock":true
}`

        await mockMvc
          .patch(`/api/v1/books/${bookId}/metadata`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        const metadata = bookMetadataRepository.findById(bookId)
        {
          expect(metadata.title).toBe('newTitle')
          expect(metadata.summary).toBe('newSummary')
          expect(metadata.number).toBe('newNumber')
          expect(metadata.numberSort).toBe(1)
          expect(metadata.releaseDate?.equals(LocalDate.of(2020, 1, 1))).toBe(true)
          expect(metadata.authors).toHaveLength(2)
          expect(metadata.authors.map((it) => [it.name, it.role]).sort()).toEqual(
            [
              ['newAuthor', 'newauthorrole'],
              ['newAuthor2', 'newauthorrole2'],
            ].sort(),
          )
          expect([...metadata.tags]).toEqual(['tag'])
          expect(metadata.isbn).toBe('9781617290459')

          expect(metadata.titleLock).toBe(true)
          expect(metadata.summaryLock).toBe(true)
          expect(metadata.numberLock).toBe(true)
          expect(metadata.numberSortLock).toBe(true)
          expect(metadata.releaseDateLock).toBe(true)
          expect(metadata.authorsLock).toBe(true)
          expect(metadata.tagsLock).toBe(true)
          expect(metadata.isbnLock).toBe(true)
        }
      }),
    )

    it(
      'given json with blank fields when updating metadata then fields with blanks are unset',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const bookId = first(bookRepository.findAll()).id
        {
          const metadata = bookMetadataRepository.findById(bookId)
          const updated = metadata.copy({
            summary: 'summary',
            isbn: '9781617290459',
          })

          bookMetadataRepository.update(updated)
        }

        // language=JSON
        const jsonString = `{
  "summary":"",
  "isbn":""
}`

        await mockMvc
          .patch(`/api/v1/books/${bookId}/metadata`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        const updatedMetadata = bookMetadataRepository.findById(bookId)
        {
          expect(updatedMetadata.summary.trim()).toBe('')
          expect(updatedMetadata.isbn.trim()).toBe('')
        }
      }),
    )

    it(
      'given json with null fields when updating metadata then fields with null are unset',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const testDate = LocalDate.of(2020, 1, 1)

        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const bookId = first(bookRepository.findAll()).id
        {
          const metadata = bookMetadataRepository.findById(bookId)
          const updated = metadata.copy({
            authors: [...metadata.authors, new Author({ name: 'Author', role: 'role' })],
            releaseDate: testDate,
            tags: new Set(['tag']),
            summary: 'summary',
            isbn: '9781617290459',
          })

          bookMetadataRepository.update(updated)
        }

        const metadata = bookMetadataRepository.findById(bookId)
        {
          expect(metadata.authors).toHaveLength(1)
          expect(metadata.releaseDate?.equals(testDate)).toBe(true)
        }

        // language=JSON
        const jsonString = `{
  "authors":null,
  "releaseDate":null,
  "tags":null,
  "summary":null,
  "isbn":null
}`

        await mockMvc
          .patch(`/api/v1/books/${bookId}/metadata`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        const updatedMetadata = bookMetadataRepository.findById(bookId)
        {
          expect(updatedMetadata.authors).toHaveLength(0)
          expect(updatedMetadata.releaseDate).toBeNull()
          expect(updatedMetadata.tags.size).toBe(0)
          expect(updatedMetadata.summary.trim()).toBe('')
          expect(updatedMetadata.isbn.trim()).toBe('')
        }
      }),
    )

    it(
      'given json without fields when updating metadata then existing fields are untouched',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const testDate = LocalDate.of(2020, 1, 1)

        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const bookId = first(bookRepository.findAll()).id
        {
          const metadata = bookMetadataRepository.findById(bookId)
          const updated = metadata.copy({
            authors: [...metadata.authors, new Author({ name: 'Author', role: 'role' })],
            releaseDate: testDate,
            summary: 'summary',
            number: 'number',
            numberLock: true,
            numberSort: 2,
            numberSortLock: true,
            title: 'title',
            isbn: '9781617290459',
          })

          bookMetadataRepository.update(updated)
        }

        // language=JSON
        const jsonString = `{
}`

        await mockMvc
          .patch(`/api/v1/books/${bookId}/metadata`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        const metadata = bookMetadataRepository.findById(bookId)
        {
          expect(metadata.authors).toHaveLength(1)
          expect(metadata.releaseDate?.equals(testDate)).toBe(true)
          expect(metadata.summary).toBe('summary')
          expect(metadata.number).toBe('number')
          expect(metadata.numberSort).toBe(2)
          expect(metadata.title).toBe('title')
          expect(metadata.isbn).toBe('9781617290459')
        }
      }),
    )
  })

  describe('ReadProgress', () => {
    // @ParameterizedTest @ValueSource(strings = [...])
    it.each(['{"completed": false}', '{}', '{"page":0}'])(
      'given invalid payload when marking book in progress then validation error is returned',
      withMockCustomUser({}, async (jsonString: string) => {
        await mockMvc
          .patch('/api/v1/books/1/read-progress', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given user when marking book in progress with page read then progress is marked accordingly',
      withMockCustomUser({ id: '1' }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())
        {
          const media = mediaRepository.findById(book.id)
          mediaRepository.update(
            media.copy({
              status: Media.Status.READY,
              pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
              pageCount: 10,
            }),
          )
        }

        // language=JSON
        const jsonString = `{
  "page": 5
}`

        await mockMvc
          .patch(`/api/v1/books/${book.id}/read-progress`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.readProgress.page', (j) => j.value(5))
          m.jsonPath('$.readProgress.completed', (j) => j.value(false))
        })
      }),
    )

    it(
      'given user when marking book completed then progress is marked accordingly',
      withMockCustomUser({ id: '1' }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())
        {
          const media = mediaRepository.findById(book.id)
          mediaRepository.update(
            media.copy({
              status: Media.Status.READY,
              pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
              pageCount: 10,
            }),
          )
        }

        // language=JSON
        const jsonString = `{
  "completed": true
}`

        await mockMvc
          .patch(`/api/v1/books/${book.id}/read-progress`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.readProgress.page', (j) => j.value(10))
          m.jsonPath('$.readProgress.completed', (j) => j.value(true))
        })
      }),
    )

    it(
      'given user when deleting read progress then progress is removed',
      withMockCustomUser({ id: '1' }, async () => {
        {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1.cbr', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
        }

        const book = first(bookRepository.findAll())
        {
          const media = mediaRepository.findById(book.id)
          mediaRepository.update(
            media.copy({
              status: Media.Status.READY,
              pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
              pageCount: 10,
            }),
          )
        }

        // language=JSON
        const jsonString = `{
  "page": 5,
  "completed": false
}`

        await mockMvc
          .patch(`/api/v1/books/${book.id}/read-progress`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        await mockMvc
          .delete(`/api/v1/books/${book.id}/read-progress`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
          })
          .andExpect((m: MockMvcResultMatchersDsl) => {
            m.status((s) => s.isNoContent())
          })

        await mockMvc.get(`/api/v1/books/${book.id}`).andExpect((m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.readProgress', (j) => j.value(nullValue()))
        })
      }),
    )
  })

  it('given a user with read progress when getting books for the other user then books are returned correctly', async () => {
    {
      const series = makeSeries('series', { libraryId: library.id })
      const created = seriesLifecycle.createSeries(series)
      const books = [makeBook('1.cbr', { libraryId: library.id }), makeBook('2.cbr', { libraryId: library.id })]
      seriesLifecycle.addBooks(created, books)
    }

    const book = first(bookRepository.findAll())
    {
      const media = mediaRepository.findById(book.id)
      mediaRepository.update(
        media.copy({
          status: Media.Status.READY,
          pages: Array.from({ length: 10 }, (_, i) => new BookPage({ fileName: `${i + 1}`, mediaType: 'image/jpeg' })),
        }),
      )
    }

    // language=JSON
    const jsonString = `{
  "completed": true
}`

    await mockMvc.perform(
      MockMvcRequestBuilders.patch(`/api/v1/books/${book.id}/read-progress`)
        .with(user(new KomgaPrincipal(user1)))
        .contentType(MediaType.APPLICATION_JSON_VALUE)
        .content(jsonString),
    )

    await mockMvc
      .perform(MockMvcRequestBuilders.get('/api/v1/books').with(user(new KomgaPrincipal(user1))).contentType(MediaType.APPLICATION_JSON_VALUE))
      .andExpect(MockMvcResultMatchers.jsonPath('$.totalElements').value(2))

    await mockMvc
      .perform(MockMvcRequestBuilders.get('/api/v1/books').with(user(new KomgaPrincipal(user2))).contentType(MediaType.APPLICATION_JSON_VALUE))
      .andExpect(MockMvcResultMatchers.jsonPath('$.totalElements').value(2))
  })

  it(
    'given book with Unicode name when getting book file then attachment name is correct',
    withMockCustomUser({}, async () => {
      const bookName = 'アキラ'
      // PORT: Files.createTempFile(bookName, ".cbz").also { it.toFile().deleteOnExit() }
      const tempFile = createTempFile(bookName, '.cbz', tmpdir())
      tempFiles.push(tempFile)
      {
        const series = makeSeries('series', { libraryId: library.id })
        const created = seriesLifecycle.createSeries(series)
        const books = [makeBook(bookName, { libraryId: library.id, url: new URL(pathToFileURL(tempFile).href) })]
        seriesLifecycle.addBooks(created, books)
      }

      const book = first(bookRepository.findAll())

      await mockMvc.get(`/api/v1/books/${book.id}/file`).andExpect((m: MockMvcResultMatchersDsl) => {
        m.status((s) => s.isOk())
        // PORT: URLEncoder.encode(bookName, UTF-8), identique à encodeURIComponent pour ce nom
        m.header((h) => h.string('Content-Disposition', containsString(encodeURIComponent(bookName))))
      })
    }),
  )
})
