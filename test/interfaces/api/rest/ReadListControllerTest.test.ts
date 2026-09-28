// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/ReadListControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalDate } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest'
import type { Book } from '../../../../src/domain/model/Book.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { BookMetadataRepository } from '../../../../src/domain/persistence/BookMetadataRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { ReadListRepository } from '../../../../src/domain/persistence/ReadListRepository.js'
import { SeriesMetadataRepository } from '../../../../src/domain/persistence/SeriesMetadataRepository.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { ReadListLifecycle } from '../../../../src/domain/service/ReadListLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { toIndexedMap } from '../../../../src/language/LanguageUtils.js'
import { pathToUrl } from '../../../../src/port/java-net.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { contains, containsString } from '../../../support/hamcrest.js'
import { MockMvc, type MockMvcResultMatchersDsl, closeContext, mockMvcTest } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

describe('ReadListControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)
  const readListLifecycle = ctx.getBean(ReadListLifecycle)
  const readListRepository = ctx.getBean(ReadListRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)

  const library1 = makeLibrary({ name: 'Library1', id: '1' })
  const library2 = makeLibrary({ name: 'Library2', id: '2' })
  const seriesLib1 = makeSeries('Series1', { libraryId: library1.id })
  const seriesLib2 = makeSeries('Series2', { libraryId: library2.id })
  let booksLibrary1: Book[]
  let booksLibrary2: Book[]
  let rlLib1: ReadList
  let rlLib2: ReadList
  let rlLibBoth: ReadList

  // PORT: Files.createTempFile(..).deleteOnExit() -> fichiers supprimés en fin de fichier
  const tempDirs: string[] = []

  beforeAll(() => {
    libraryRepository.insert(library1)
    libraryRepository.insert(library2)

    seriesLifecycle.createSeries(seriesLib1)
    seriesLifecycle.createSeries(seriesLib2)

    booksLibrary1 = [1, 2, 3, 4, 5].map((it) => makeBook(`Book_${it}`, { libraryId: library1.id, seriesId: seriesLib1.id }))
    seriesLifecycle.addBooks(seriesLib1, booksLibrary1)

    booksLibrary2 = [6, 7, 8, 9, 10].map((it) => makeBook(`Book_${it}`, { libraryId: library2.id, seriesId: seriesLib2.id }))
    seriesLifecycle.addBooks(seriesLib2, booksLibrary2)
  })

  afterAll(async () => {
    for (const it of libraryRepository.findAll()) {
      libraryLifecycle.deleteLibrary(it)
    }
    await closeContext(ctx)
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true })
  })

  afterEach(() => {
    readListRepository.deleteAll()
  })

  function makeReadLists(): void {
    rlLib1 = readListLifecycle.addReadList(
      new ReadList({
        name: 'Lib1',
        bookIds: toIndexedMap(booksLibrary1.map((it) => it.id)),
      }),
    )

    rlLib2 = readListLifecycle.addReadList(
      new ReadList({
        name: 'Lib2',
        bookIds: toIndexedMap(booksLibrary2.map((it) => it.id)),
      }),
    )

    rlLibBoth = readListLifecycle.addReadList(
      new ReadList({
        name: 'Lib1+2',
        bookIds: toIndexedMap([...booksLibrary1, ...booksLibrary2].map((it) => it.id)),
      }),
    )
  }

  /** `makeSeries(..).also { series -> createSeries ; addBooks(listOf(book)) ; seriesMetadataRepository.update(it.copy(..)) }` */
  function makeSeriesWithBook(name: string, book: Book, metadata: Record<string, unknown> | null = null): void {
    const series = makeSeries(name, { libraryId: library1.id })
    {
      const created = seriesLifecycle.createSeries(series)
      const books = [book]
      seriesLifecycle.addBooks(created, books)
    }
    if (metadata !== null) {
      const it = seriesMetadataRepository.findById(series.id)
      seriesMetadataRepository.update(it.copy(metadata))
    }
  }

  describe('GetAndFilter', () => {
    it(
      'given user with access to all libraries when getting read lists then get all read lists',
      withMockCustomUser({}, async () => {
        makeReadLists()

        await mockMvc.get('/api/v1/readlists').andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(3))
          m.jsonPath("$.content[?(@.name == 'Lib1')].filtered", (j) => j.value(false))
          m.jsonPath("$.content[?(@.name == 'Lib2')].filtered", (j) => j.value(false))
          m.jsonPath("$.content[?(@.name == 'Lib1+2')].filtered", (j) => j.value(false))
        })
      }),
    )

    it(
      'given user with access to a single library when getting read lists then only get read lists from this library',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeReadLists()

        await mockMvc.get('/api/v1/readlists').andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath("$.content[?(@.name == 'Lib1')].filtered", (j) => j.value(false))
          m.jsonPath("$.content[?(@.name == 'Lib1+2')].filtered", (j) => j.value(true))
        })
      }),
    )

    it(
      'given user with access to all libraries when getting single read list then it is not filtered',
      withMockCustomUser({}, async () => {
        makeReadLists()

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(10))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })
      }),
    )

    it(
      'given user with access to a single library when getting single read list with items from 2 libraries then it is filtered',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeReadLists()

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(5))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })
      }),
    )

    it(
      'given user with access to a single library when getting single read list from another library then return not found',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeReadLists()

        await mockMvc.get(`/api/v1/readlists/${rlLib2.id}`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })
      }),
    )
  })

  describe('ContentRestriction', () => {
    it(
      'given user only allowed content with specific age rating when getting read lists then only get read lists that satisfies this criteria',
      withMockCustomUser({ allowAgeUnder: 10 }, async () => {
        const book10 = makeBook('book_10', { libraryId: library1.id })
        makeSeriesWithBook('series_10', book10, { ageRating: 10 })

        const book = makeBook('book', { libraryId: library1.id })
        makeSeriesWithBook('series_no', book)

        const rlAllowed = readListLifecycle.addReadList(
          new ReadList({
            name: 'Allowed',
            bookIds: toIndexedMap([book10.id]),
          }),
        )

        const rlFiltered = readListLifecycle.addReadList(
          new ReadList({
            name: 'Filtered',
            bookIds: toIndexedMap([book10.id, book.id]),
          }),
        )

        const rlDenied = readListLifecycle.addReadList(
          new ReadList({
            name: 'Denied',
            bookIds: toIndexedMap([book.id]),
          }),
        )

        await mockMvc.get('/api/v1/readlists').andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlAllowed.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlDenied.id}`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/books/${book10.id}/readlists`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}/books`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(1))
          m.jsonPath('$.content[0].id', (j) => j.value(book10.id))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}/books/${book10.id}/previous`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}/books/${book10.id}/next`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })
      }),
    )

    it(
      'given user disallowed content with specific age rating when getting read lists then only get read lists that satisfies this criteria',
      withMockCustomUser({ excludeAgeOver: 16 }, async () => {
        const book10 = makeBook('book_10', { libraryId: library1.id })
        makeSeriesWithBook('series_10', book10, { ageRating: 10 })

        const book18 = makeBook('1', { libraryId: library1.id })
        makeSeriesWithBook('series_18', book18, { ageRating: 18 })

        const book16 = makeBook('1', { libraryId: library1.id })
        makeSeriesWithBook('series_16', book16, { ageRating: 16 })

        const book = makeBook('book', { libraryId: library1.id })
        makeSeriesWithBook('series_no', book)

        bookMetadataRepository.update(bookMetadataRepository.findById(book10.id).copy({ releaseDate: LocalDate.of(2000, 1, 1) }))
        bookMetadataRepository.update(bookMetadataRepository.findById(book.id).copy({ releaseDate: LocalDate.of(2001, 1, 1) }))
        bookMetadataRepository.update(bookMetadataRepository.findById(book16.id).copy({ releaseDate: LocalDate.of(2002, 1, 1) }))
        bookMetadataRepository.update(bookMetadataRepository.findById(book18.id).copy({ releaseDate: LocalDate.of(2003, 1, 1) }))

        const rlAllowed = readListLifecycle.addReadList(
          new ReadList({
            name: 'Allowed',
            bookIds: toIndexedMap([book10.id, book.id]),
          }),
        )

        const rlFiltered = readListLifecycle.addReadList(
          new ReadList({
            name: 'Filtered',
            ordered: false,
            bookIds: toIndexedMap([book10.id, book.id, book16.id, book18.id]),
          }),
        )

        const rlDenied = readListLifecycle.addReadList(
          new ReadList({
            name: 'Denied',
            bookIds: toIndexedMap([book16.id, book18.id]),
          }),
        )

        await mockMvc.get('/api/v1/readlists').andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlAllowed.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlDenied.id}`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/books/${book10.id}/readlists`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}/books`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(2))
          // UPSTREAM-BUG: `jsonPath(..) { contains(..) }` crée un Matcher hamcrest sans l'appliquer (aucune vérification)
          m.jsonPath("$.content.[*].['id']", () => {
            contains([book10, book].map((it) => it.id))
          })
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}/books/${book10.id}/previous`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}/books/${book10.id}/next`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.id', (j) => j.value(book.id))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}/books/${book.id}/previous`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.id', (j) => j.value(book10.id))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}/books/${book.id}/next`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })
      }),
    )

    it(
      'given user disallowed content with specific labels when getting read lists then only get read lists that satisfies this criteria',
      withMockCustomUser({ excludeLabels: ['kids', 'cute'] }, async () => {
        const bookKids = makeBook('book_kids', { libraryId: library1.id })
        makeSeriesWithBook('series_kids', bookKids, { sharingLabels: new Set(['kids']) })

        const bookCute = makeBook('1', { libraryId: library1.id })
        makeSeriesWithBook('series_cute', bookCute, { sharingLabels: new Set(['cute', 'other']) })

        const bookAdult = makeBook('1', { libraryId: library1.id })
        makeSeriesWithBook('series_adult', bookAdult, { sharingLabels: new Set(['adult']) })

        const book = makeBook('book', { libraryId: library1.id })
        makeSeriesWithBook('series_no', book)

        const rlAllowed = readListLifecycle.addReadList(
          new ReadList({
            name: 'Allowed',
            bookIds: toIndexedMap([bookAdult.id, book.id]),
          }),
        )

        const rlFiltered = readListLifecycle.addReadList(
          new ReadList({
            name: 'Filtered',
            bookIds: toIndexedMap([bookKids.id, book.id, bookAdult.id, bookCute.id]),
          }),
        )

        const rlDenied = readListLifecycle.addReadList(
          new ReadList({
            name: 'Denied',
            bookIds: toIndexedMap([bookKids.id, bookCute.id]),
          }),
        )

        await mockMvc.get('/api/v1/readlists').andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlAllowed.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlDenied.id}`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/books/${bookAdult.id}/readlists`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })
      }),
    )

    it(
      'given user allowed and disallowed content when getting read lists then only get read lists that satisfies this criteria',
      withMockCustomUser({ allowAgeUnder: 10, allowLabels: ['kids'], excludeLabels: ['adult', 'teen'] }, async () => {
        const bookKids = makeBook('book_kids', { libraryId: library1.id })
        makeSeriesWithBook('series_kids', bookKids, { sharingLabels: new Set(['kids']) })

        const bookCute = makeBook('book_cute', { libraryId: library1.id })
        makeSeriesWithBook('series_cute', bookCute, { ageRating: 5, sharingLabels: new Set(['cute', 'other']) })

        const bookAdult = makeBook('book_adult', { libraryId: library1.id })
        makeSeriesWithBook('series_adult', bookAdult, { sharingLabels: new Set(['adult']) })

        const book = makeBook('book', { libraryId: library1.id })
        makeSeriesWithBook('series_no', book)

        const rlAllowed = readListLifecycle.addReadList(
          new ReadList({
            name: 'Allowed',
            bookIds: toIndexedMap([bookKids.id, bookCute.id]),
          }),
        )

        const rlFiltered = readListLifecycle.addReadList(
          new ReadList({
            name: 'Filtered',
            bookIds: toIndexedMap([bookKids.id, book.id, bookAdult.id, bookCute.id]),
          }),
        )

        const rlDenied = readListLifecycle.addReadList(
          new ReadList({
            name: 'Denied',
            bookIds: toIndexedMap([bookAdult.id, book.id]),
          }),
        )

        await mockMvc.get('/api/v1/readlists').andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlAllowed.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(2))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlDenied.id}`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/books/${bookKids.id}/readlists`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })
      }),
    )

    it(
      'given user allowed and disallowed content when getting read lists then only get read lists that satisfies this criteria (2)',
      withMockCustomUser({ excludeAgeOver: 16, allowLabels: ['teen'] }, async () => {
        const bookTeen16 = makeBook('book_teen_16', { libraryId: library1.id })
        makeSeriesWithBook('series_teen_16', bookTeen16, { sharingLabels: new Set(['teen']), ageRating: 16 })

        const bookTeen = makeBook('1', { libraryId: library1.id })
        makeSeriesWithBook('series_teen', bookTeen, { sharingLabels: new Set(['teen']) })

        const rlAllowed = readListLifecycle.addReadList(
          new ReadList({
            name: 'Allowed',
            bookIds: toIndexedMap([bookTeen.id]),
          }),
        )

        const rlFiltered = readListLifecycle.addReadList(
          new ReadList({
            name: 'Filtered',
            bookIds: toIndexedMap([bookTeen16.id, bookTeen.id]),
          }),
        )

        const rlDenied = readListLifecycle.addReadList(
          new ReadList({
            name: 'Denied',
            bookIds: toIndexedMap([bookTeen16.id]),
          }),
        )

        await mockMvc.get('/api/v1/readlists').andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.totalElements', (j) => j.value(2))
          m.jsonPath(`$.content[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$.content[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlAllowed.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })

        await mockMvc.get(`/api/v1/readlists/${rlFiltered.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.bookIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(true))
        })

        await mockMvc.get(`/api/v1/readlists/${rlDenied.id}`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })

        await mockMvc.get(`/api/v1/books/${bookTeen.id}/readlists`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(2))
          m.jsonPath(`$[?(@.name == '${rlAllowed.name}')].filtered`, (j) => j.value(false))
          m.jsonPath(`$[?(@.name == '${rlFiltered.name}')].filtered`, (j) => j.value(true))
        })
      }),
    )
  })

  describe('GetBooksAndFilter', () => {
    it(
      'given user with access to all libraries when getting books from single read list then it is not filtered',
      withMockCustomUser({}, async () => {
        makeReadLists()

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(10))
        })
      }),
    )

    it(
      'given user with access to a single library when getting books from single read list with items from 2 libraries then it is filtered',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeReadLists()

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.content.length()', (j) => j.value(5))
        })
      }),
    )

    it(
      'given user with access to a single library when getting books from single read list from another library then return not found',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeReadLists()

        await mockMvc.get(`/api/v1/readlists/${rlLib2.id}/books`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })
      }),
    )
  })

  describe('Siblings', () => {
    it(
      'given user with access to all libraries when getting book siblings then it is returned or not found',
      withMockCustomUser({}, async () => {
        makeReadLists()

        const first = booksLibrary1[0]!.id // Book_1
        const second = booksLibrary1[1]!.id // Book_2
        const last = booksLibrary2[booksLibrary2.length - 1]!.id // Book_10

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${first}/previous`).andExpect((m) => m.status((s) => s.isNotFound()))
        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${first}/next`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Book_2'))
        })

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${second}/previous`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Book_1'))
        })
        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${second}/next`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Book_3'))
        })

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${last}/previous`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Book_9'))
        })
        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${last}/next`).andExpect((m) => m.status((s) => s.isNotFound()))
      }),
    )

    it(
      'given user with access to a single library when getting book siblings then it takes into account the library filter',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeReadLists()

        const first = booksLibrary1[0]!.id // Book_1
        const second = booksLibrary1[1]!.id // Book_2
        const last = booksLibrary1[booksLibrary1.length - 1]!.id // Book_5

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${first}/previous`).andExpect((m) => m.status((s) => s.isNotFound()))
        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${first}/next`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Book_2'))
        })

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${second}/previous`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Book_1'))
        })
        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${second}/next`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Book_3'))
        })

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${last}/previous`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Book_4'))
        })
        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}/books/${last}/next`).andExpect((m) => m.status((s) => s.isNotFound()))
      }),
    )

    it(
      'given user with access to a single library when getting books from single read list from another library then return not found',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        makeReadLists()

        await mockMvc.get(`/api/v1/readlists/${rlLib2.id}/books`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })
      }),
    )
  })

  describe('Creation', () => {
    it(
      'given non-admin user when creating read list then return forbidden',
      withMockCustomUser({}, async () => {
        // language=JSON
        const jsonString = '{"name":"readlist","bookIds":["3"]}'

        await mockMvc
          .post('/api/v1/readlists', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => {
            m.status((s) => s.isForbidden())
          })
      }),
    )

    it(
      'given admin user when creating read list then return ok',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        // language=JSON
        const jsonString = `{"name":"readlist","summary":"summary","bookIds":["${booksLibrary1[0]!.id}"]}`

        await mockMvc
          .post('/api/v1/readlists', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => {
            m.status((s) => s.isOk())
            m.jsonPath('$.bookIds.length()', (j) => j.value(1))
            m.jsonPath('$.name', (j) => j.value('readlist'))
            m.jsonPath('$.summary', (j) => j.value('summary'))
          })
      }),
    )

    it(
      'given existing read lists when creating read list with existing name then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeReadLists()

        // language=JSON
        const jsonString = `{"name":"Lib1","bookIds":["${booksLibrary1[0]!.id}"]}`

        await mockMvc
          .post('/api/v1/readlists', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given read list with duplicate bookIds when creating read list then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        // language=JSON
        const jsonString = `{"name":"Lib1","bookIds":["${booksLibrary1[0]!.id}","${booksLibrary1[0]!.id}"]}`

        await mockMvc
          .post('/api/v1/readlists', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )
  })

  describe('Update', () => {
    it(
      'given non-admin user when updating read list then return forbidden',
      withMockCustomUser({}, async () => {
        // language=JSON
        const jsonString = '{"name":"readlist","bookIds":["3"]}'

        await mockMvc
          .patch('/api/v1/readlists/5', (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => {
            m.status((s) => s.isForbidden())
          })
      }),
    )

    it(
      'given admin user when updating read list then return no content',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeReadLists()

        // language=JSON
        const jsonString = `{"name":"updated","summary":"updatedSummary","bookIds":["${booksLibrary1[0]!.id}"]}`

        await mockMvc
          .patch(`/api/v1/readlists/${rlLib1.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => {
            m.status((s) => s.isNoContent())
          })

        await mockMvc.get(`/api/v1/readlists/${rlLib1.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('updated'))
          m.jsonPath('$.summary', (j) => j.value('updatedSummary'))
          m.jsonPath('$.bookIds.length()', (j) => j.value(1))
          m.jsonPath('$.filtered', (j) => j.value(false))
        })
      }),
    )

    it(
      'given existing read lists when updating read list with existing name then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeReadLists()

        // language=JSON
        const jsonString = '{"name":"Lib2"}'

        await mockMvc
          .patch(`/api/v1/readlists/${rlLib1.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given existing read list when updating read list with duplicate bookIds then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeReadLists()

        // language=JSON
        const jsonString = `{"bookIds":["${booksLibrary1[0]!.id}","${booksLibrary1[0]!.id}"]}`

        await mockMvc
          .patch(`/api/v1/readlists/${rlLib1.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => {
            m.status((s) => s.isBadRequest())
          })
      }),
    )

    it(
      'given admin user when updating read list then only updated fields are modified',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeReadLists()

        await mockMvc.patch(`/api/v1/readlists/${rlLib2.id}`, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = '{"name":"newName"}'
        })

        await mockMvc.get(`/api/v1/readlists/${rlLib2.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('newName'))
          m.jsonPath('$.summary', (j) => j.value(''))
          m.jsonPath('$.bookIds.length()', (j) => j.value(5))
        })

        await mockMvc.patch(`/api/v1/readlists/${rlLib1.id}`, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = '{"summary":"newSummary"}'
        })

        await mockMvc.get(`/api/v1/readlists/${rlLib1.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Lib1'))
          m.jsonPath('$.summary', (j) => j.value('newSummary'))
          m.jsonPath('$.bookIds.length()', (j) => j.value(5))
        })

        await mockMvc.patch(`/api/v1/readlists/${rlLibBoth.id}`, (r) => {
          r.contentType = MediaType.APPLICATION_JSON_VALUE
          r.content = `{"bookIds":["${booksLibrary1[0]!.id}"]}`
        })

        await mockMvc.get(`/api/v1/readlists/${rlLibBoth.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.name', (j) => j.value('Lib1+2'))
          m.jsonPath('$.summary', (j) => j.value(''))
          m.jsonPath('$.bookIds.length()', (j) => j.value(1))
        })
      }),
    )
  })

  describe('Delete', () => {
    it(
      'given non-admin user when deleting read list then return forbidden',
      withMockCustomUser({}, async () => {
        await mockMvc.delete('/api/v1/readlists/5').andExpect((m) => {
          m.status((s) => s.isForbidden())
        })
      }),
    )

    it(
      'given admin user when deleting read list then return no content',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        makeReadLists()

        await mockMvc.delete(`/api/v1/readlists/${rlLib1.id}`).andExpect((m) => {
          m.status((s) => s.isNoContent())
        })

        await mockMvc.get(`/api/v1/readlists/${rlLib1.id}`).andExpect((m) => {
          m.status((s) => s.isNotFound())
        })
      }),
    )
  })

  describe('FileDownload', () => {
    it(
      'given readlist with Unicode name when getting readlist file then attachment name is correct',
      withMockCustomUser({}, async () => {
        const name = 'アキラ'
        // PORT: Files.createTempFile(name, ".cbz") + deleteOnExit
        const dir = mkdtempSync(join(tmpdir(), 'junit-'))
        tempDirs.push(dir)
        const tempFile = join(dir, `${name}${Date.now()}.cbz`)
        writeFileSync(tempFile, '')
        const book = makeBook(name, { libraryId: library1.id, url: pathToUrl(tempFile) })
        {
          const series = makeSeries('series', { libraryId: library1.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [book]
          seriesLifecycle.addBooks(created, books)
        }

        const readlist = readListLifecycle.addReadList(
          new ReadList({
            name: name,
            bookIds: toIndexedMap([book.id]),
          }),
        )

        await mockMvc.get(`/api/v1/readlists/${readlist.id}/file`).andExpect((m) => {
          m.status((s) => s.isOk())
          // PORT: URLEncoder.encode(name, UTF-8) (caractères non ASCII : même encodage que encodeURIComponent)
          m.header((h) => h.string('Content-Disposition', containsString(encodeURIComponent(name))))
        })
      }),
    )
  })

  describe('Unordered', () => {
    const library = makeLibrary({ name: 'Library' })
    const series = makeSeries('Series', { libraryId: library.id })
    let books: Book[]
    let rlAllDiffDates: ReadList
    let rlAllNullDates: ReadList
    let rlAllBooks: ReadList

    beforeAll(() => {
      libraryRepository.insert(library)

      seriesLifecycle.createSeries(series)

      books = [1, 2, 3, 4, 5].map((it) => makeBook(`Book_${it}`, { libraryId: library.id, seriesId: series.id }))
      seriesLifecycle.addBooks(series, books)

      bookMetadataRepository.update(bookMetadataRepository.findById(books[0]!.id).copy({ releaseDate: LocalDate.of(2020, 1, 1) }))
      bookMetadataRepository.update(bookMetadataRepository.findById(books[1]!.id).copy({ releaseDate: LocalDate.of(2020, 1, 1) }))
      bookMetadataRepository.update(bookMetadataRepository.findById(books[2]!.id).copy({ releaseDate: LocalDate.of(2021, 1, 1) }))
    })

    beforeEach(() => {
      rlAllDiffDates = readListLifecycle.addReadList(
        new ReadList({
          name: 'All different dates',
          ordered: false,
          bookIds: toIndexedMap([2, 1].map((it) => books[it]!.id)),
        }),
      )

      rlAllNullDates = readListLifecycle.addReadList(
        new ReadList({
          name: 'All null dates',
          ordered: false,
          bookIds: toIndexedMap(books.slice(3).map((it) => it.id)),
        }),
      )

      rlAllBooks = readListLifecycle.addReadList(
        new ReadList({
          name: 'All books',
          ordered: false,
          bookIds: toIndexedMap(books.map((it) => it.id)),
        }),
      )
    })

    it(
      'given unordered read lists when getting books then books are sorted by release date',
      withMockCustomUser({}, async () => {
        await mockMvc.get(`/api/v1/readlists/${rlAllDiffDates.id}/books`).andExpect((m) => {
          m.status((s) => s.isOk())
          // UPSTREAM-BUG: `jsonPath(..) { contains(..) }` crée un Matcher hamcrest sans l'appliquer (aucune vérification)
          m.jsonPath("$.content.[*].['id']", () => {
            contains([1, 2].map((it) => books[it]!.id))
          })
        })

        await mockMvc.get(`/api/v1/readlists/${rlAllNullDates.id}/books`).andExpect((m) => {
          m.status((s) => s.isOk())
          // UPSTREAM-BUG: Matcher créé sans être appliqué
          m.jsonPath("$.content.[*].['id']", () => {
            contains([3, 4].map((it) => books[it]!.id))
          })
        })

        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books`).andExpect((m) => {
          m.status((s) => s.isOk())
          // UPSTREAM-BUG: Matcher créé sans être appliqué
          m.jsonPath("$.content.[*].['id']", () => {
            contains([3, 4, 0, 1, 2].map((it) => books[it]!.id))
          })
        })
      }),
    )

    it(
      'given unordered read lists when getting book siblings then it is returned according to release date sort or not found',
      withMockCustomUser({}, async () => {
        const expectId = (id: string) => (m: MockMvcResultMatchersDsl) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.id', (j) => j.value(id))
        }
        const notFound = (m: MockMvcResultMatchersDsl) => m.status((s) => s.isNotFound())

        // rlAllDiffDates: 1, 2
        // first book: id=1
        await mockMvc.get(`/api/v1/readlists/${rlAllDiffDates.id}/books/${books[1]!.id}/previous`).andExpect(notFound)
        await mockMvc.get(`/api/v1/readlists/${rlAllDiffDates.id}/books/${books[1]!.id}/next`).andExpect(expectId(books[2]!.id))

        // second book: id=2
        await mockMvc.get(`/api/v1/readlists/${rlAllDiffDates.id}/books/${books[2]!.id}/previous`).andExpect(expectId(books[1]!.id))
        await mockMvc.get(`/api/v1/readlists/${rlAllDiffDates.id}/books/${books[2]!.id}/next`).andExpect(notFound)

        // rlAllNullDates: 3, 4
        // first book: id=3
        await mockMvc.get(`/api/v1/readlists/${rlAllNullDates.id}/books/${books[3]!.id}/previous`).andExpect(notFound)
        await mockMvc.get(`/api/v1/readlists/${rlAllNullDates.id}/books/${books[3]!.id}/next`).andExpect(expectId(books[4]!.id))

        // second book: id=4
        await mockMvc.get(`/api/v1/readlists/${rlAllNullDates.id}/books/${books[4]!.id}/previous`).andExpect(expectId(books[3]!.id))
        await mockMvc.get(`/api/v1/readlists/${rlAllNullDates.id}/books/${books[4]!.id}/next`).andExpect(notFound)

        // rlAllBooks: 3, 4, 0, 1, 2
        // first book: id=3
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[3]!.id}/previous`).andExpect(notFound)
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[3]!.id}/next`).andExpect(expectId(books[4]!.id))

        // second book: id=4
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[4]!.id}/previous`).andExpect(expectId(books[3]!.id))
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[4]!.id}/next`).andExpect(expectId(books[0]!.id))

        // third book: id=0
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[0]!.id}/previous`).andExpect(expectId(books[4]!.id))
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[0]!.id}/next`).andExpect(expectId(books[1]!.id))

        // fourth book: id=1
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[1]!.id}/previous`).andExpect(expectId(books[0]!.id))
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[1]!.id}/next`).andExpect(expectId(books[2]!.id))

        // last book: id=2
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[2]!.id}/previous`).andExpect(expectId(books[1]!.id))
        await mockMvc.get(`/api/v1/readlists/${rlAllBooks.id}/books/${books[2]!.id}/next`).andExpect(notFound)
      }),
    )
  })

  describe('Match', () => {
    it(
      'given non-admin user when matching cbl file then return forbidden',
      withMockCustomUser({}, async () => {
        await mockMvc
          .multipart('/api/v1/readlists/match/comicrack', (r) => {
            r.file('file', new Uint8Array())
          })
          .andExpect((m) => {
            m.status((s) => s.isForbidden())
          })
      }),
    )

    it(
      'given invalid cbl file when matching then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const content = 'garbled'

        await mockMvc
          .multipart('/api/v1/readlists/match/comicrack', (r) => {
            r.file('file', Buffer.from(content))
          })
          .andExpect((m) => {
            m.status((s) => {
              s.isBadRequest()
              s.reason('ERR_1015')
            })
          })
      }),
    )

    it(
      'given cbl file without books when matching then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const content = `<?xml version="1.0"?>
<ReadingList>
  <Name>RL</Name>
  <Books>
  </Books>
</ReadingList>`

        await mockMvc
          .multipart('/api/v1/readlists/match/comicrack', (r) => {
            r.file('file', Buffer.from(content))
          })
          .andExpect((m) => {
            m.status((s) => {
              s.isBadRequest()
              s.reason('ERR_1029')
            })
          })
      }),
    )

    it(
      'given cbl file without name when matching then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const content = `<?xml version="1.0"?>
<ReadingList>
  <Name></Name>
  <Books>
    <Book Series="Civil War" Number="1" Volume="2006" Year="2006"/>
  </Books>
</ReadingList>`

        await mockMvc
          .multipart('/api/v1/readlists/match/comicrack', (r) => {
            r.file('file', Buffer.from(content))
          })
          .andExpect((m) => {
            m.status((s) => {
              s.isBadRequest()
              s.reason('ERR_1030')
            })
          })
      }),
    )

    it(
      'given cbl file with book without series when matching then return bad request',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const content = `<?xml version="1.0"?>
<ReadingList>
  <Name>RL</Name>
  <Books>
    <Book Number="1" Volume="2006" Year="2006"/>
  </Books>
</ReadingList>`

        await mockMvc
          .multipart('/api/v1/readlists/match/comicrack', (r) => {
            r.file('file', Buffer.from(content))
          })
          .andExpect((m) => {
            m.status((s) => {
              s.isBadRequest()
              s.reason('ERR_1031')
            })
          })
      }),
    )
  })
})
