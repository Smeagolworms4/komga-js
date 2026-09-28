// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/opds/OpdsControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { Media } from '../../../../src/domain/model/Media.js'
import type { Series } from '../../../../src/domain/model/Series.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { MediaRepository } from '../../../../src/domain/persistence/MediaRepository.js'
import { SeriesMetadataRepository } from '../../../../src/domain/persistence/SeriesMetadataRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { equalToIgnoringCase } from '../../../support/hamcrest.js'
import { MockMvc, closeContext, mockMvcTest } from '../../../support/mockmvc.js'
import { withMockCustomUser } from '../rest/MockSpringSecurity.js'

describe('OpdsControllerTest', () => {
  const ctx = mockMvcTest()
  const seriesRepository = ctx.getBean(SeriesRepository)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const bookRepository = ctx.getBean(BookRepository)
  const mediaRepository = ctx.getBean(MediaRepository)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const mockMvc = ctx.getBean(MockMvc)

  const library = makeLibrary({ id: '1' })
  const user = new KomgaUser({ email: 'user@example.org', password: '', id: '1' })
  const user2 = new KomgaUser({ email: 'user2@example.org', password: '', id: '2' })

  beforeAll(() => {
    libraryRepository.insert(library)
    userRepository.insert(user)
    userRepository.insert(user2)
  })

  afterAll(async () => {
    for (const it of userRepository.findAll()) {
      userLifecycle.deleteUser(it)
    }
    for (const it of libraryRepository.findAll()) {
      libraryLifecycle.deleteLibrary(it)
    }
    await closeContext(ctx)
  })

  afterEach(() => {
    seriesLifecycle.deleteMany(seriesRepository.findAll())
  })

  /** `makeSeries(..).also { series -> createSeries ; addBooks(listOf(makeBook("1"))) ; seriesMetadataRepository.update(it.copy(ageRating = ..)) }` */
  function makeSeriesWithBook(name: string, ageRating: number | null = null): Series {
    const series = makeSeries(name, { libraryId: library.id })
    {
      const created = seriesLifecycle.createSeries(series)
      const books = [makeBook('1', { libraryId: library.id })]
      seriesLifecycle.addBooks(created, books)
    }
    if (ageRating !== null) {
      const it = seriesMetadataRepository.findById(series.id)
      seriesMetadataRepository.update(it.copy({ ageRating: ageRating }))
    }
    return series
  }

  describe('LimitedUser', () => {
    it(
      'given user with access to a single library when getting series then only gets series from this library',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        const createdSeries = makeSeries('series', { libraryId: library.id })
        {
          const created = seriesLifecycle.createSeries(createdSeries)
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

        await mockMvc.get('/opds/v1.2/series').andExpect((m) => {
          m.status((s) => s.isOk())
          m.xpath('/feed/entry/id', (x) => {
            x.nodeCount(1)
            x.string(createdSeries.id)
          })
        })
      }),
    )
  })

  describe('ContentRestriction', () => {
    it(
      'given user only allowed content with specific age rating when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ allowAgeUnder: 10 }, async () => {
        const series10 = makeSeriesWithBook('series_10', 10)

        const series5 = makeSeriesWithBook('series_5', 5)

        const series15 = makeSeriesWithBook('series_15', 15)

        const series = makeSeriesWithBook('series_no')

        await mockMvc.get(`/opds/v1.2/series/${series5.id}`).andExpect((m) => m.status((s) => s.isOk()))
        await mockMvc.get(`/opds/v1.2/series/${series10.id}`).andExpect((m) => m.status((s) => s.isOk()))
        await mockMvc.get(`/opds/v1.2/series/${series15.id}`).andExpect((m) => m.status((s) => s.isForbidden()))
        await mockMvc.get(`/opds/v1.2/series/${series.id}`).andExpect((m) => m.status((s) => s.isForbidden()))

        await mockMvc.get('/opds/v1.2/series').andExpect((m) => {
          m.status((s) => s.isOk())
          m.xpath('/feed/entry/id', (x) => x.nodeCount(2))
          m.xpath('/feed/entry[1]/id', (x) => x.string(series10.id))
          m.xpath('/feed/entry[2]/id', (x) => x.string(series5.id))
        })
      }),
    )

    it(
      'given user disallowed content with specific age rating when getting series then only gets series that satisfies this criteria',
      withMockCustomUser({ excludeAgeOver: 16 }, async () => {
        const series10 = makeSeriesWithBook('series_10', 10)

        const series18 = makeSeriesWithBook('series_18', 18)

        const series16 = makeSeriesWithBook('series_16', 16)

        const series = makeSeriesWithBook('series_no')

        await mockMvc.get(`/opds/v1.2/series/${series.id}`).andExpect((m) => m.status((s) => s.isOk()))
        await mockMvc.get(`/opds/v1.2/series/${series10.id}`).andExpect((m) => m.status((s) => s.isOk()))
        await mockMvc.get(`/opds/v1.2/series/${series16.id}`).andExpect((m) => m.status((s) => s.isForbidden()))
        await mockMvc.get(`/opds/v1.2/series/${series18.id}`).andExpect((m) => m.status((s) => s.isForbidden()))

        await mockMvc.get('/opds/v1.2/series').andExpect((m) => {
          m.status((s) => s.isOk())
          m.xpath('/feed/entry/id', (x) => x.nodeCount(2))
          m.xpath('/feed/entry[1]/id', (x) => x.string(series10.id))
          m.xpath('/feed/entry[2]/id', (x) => x.string(series.id))
        })
      }),
    )
  })

  describe('SeriesSort', () => {
    it(
      'given series with titleSort when requesting via opds then series are sorted by titleSort',
      withMockCustomUser({}, async () => {
        const alphaC = seriesLifecycle.createSeries(makeSeries('TheAlpha', { libraryId: library.id }))
        {
          const it = seriesMetadataRepository.findById(alphaC.id)
          seriesMetadataRepository.update(it.copy({ titleSort: 'Alpha, The' }))
        }
        seriesLifecycle.createSeries(makeSeries('Beta', { libraryId: library.id }))

        await mockMvc.get('/opds/v1.2/series').andExpect((m) => {
          m.status((s) => s.isOk())
          m.xpath('/feed/entry[1]/title', (x) => x.string('TheAlpha'))
          m.xpath('/feed/entry[2]/title', (x) => x.string('Beta'))
        })
      }),
    )

    it(
      'given series when requesting via opds then series are sorted insensitive of case',
      withMockCustomUser({}, async () => {
        ;['a', 'b', 'B', 'C']
          .map((name) => makeSeries(name, { libraryId: library.id }))
          .forEach((it) => {
            seriesLifecycle.createSeries(it)
          })

        await mockMvc.get('/opds/v1.2/series').andExpect((m) => {
          m.status((s) => s.isOk())
          m.xpath('/feed/entry[1]/title', (x) => x.string('a'))
          m.xpath('/feed/entry[2]/title', (x) => x.string(equalToIgnoringCase('b')))
          m.xpath('/feed/entry[3]/title', (x) => x.string(equalToIgnoringCase('b')))
          m.xpath('/feed/entry[4]/title', (x) => x.string('C'))
        })
      }),
    )
  })

  describe('SeriesStatus', () => {
    it(
      'given series when requesting via opds then deleted series are not returned',
      withMockCustomUser({}, async () => {
        {
          const it = seriesLifecycle.createSeries(makeSeries('Alpha', { libraryId: library.id }))
          seriesRepository.update(it.copy({ deletedDate: LocalDateTime.now() }))
        }
        seriesLifecycle.createSeries(makeSeries('Beta', { libraryId: library.id }))

        await mockMvc.get('/opds/v1.2/series').andExpect((m) => {
          m.status((s) => s.isOk())
          m.xpath('/feed/entry', (x) => x.nodeCount(1))
          m.xpath('/feed/entry[1]/title', (x) => x.string('Beta'))
        })
      }),
    )
  })

  describe('BookOrdering', () => {
    it(
      'given books with unordered index when requesting via opds then books are ordered',
      withMockCustomUser({}, async () => {
        const createdSeries = (() => {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
          return created
        })()

        const addedBook = makeBook('2', { libraryId: library.id })
        seriesLifecycle.addBooks(createdSeries, [addedBook])
        seriesLifecycle.sortBooks(createdSeries)

        for (const it of bookRepository.findAll()) {
          const media = mediaRepository.findById(it.id)
          mediaRepository.update(media.copy({ status: Media.Status.READY, pages: [new BookPage({ fileName: '1.jpg', mediaType: 'image/jpeg' })] }))
        }

        await mockMvc.get(`/opds/v1.2/series/${createdSeries.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.xpath('/feed/entry[1]/title', (x) => x.string('1'))
          m.xpath('/feed/entry[2]/title', (x) => x.string('2'))
          m.xpath('/feed/entry[3]/title', (x) => x.string('3'))
        })
      }),
    )
  })

  describe('BookStatus', () => {
    it(
      'given books not ready when requesting via opds then no books are returned',
      withMockCustomUser({}, async () => {
        const createdSeries = (() => {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
          return created
        })()

        for (const it of bookRepository.findAll()) {
          const media = mediaRepository.findById(it.id)
          mediaRepository.update(media.copy({ status: Media.Status.READY, pages: [new BookPage({ fileName: '1.jpg', mediaType: 'image/jpeg' })] }))
        }

        const addedBook = makeBook('2', { libraryId: library.id })
        seriesLifecycle.addBooks(createdSeries, [addedBook])
        seriesLifecycle.sortBooks(createdSeries)

        await mockMvc.get(`/opds/v1.2/series/${createdSeries.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.xpath('/feed/entry', (x) => x.nodeCount(2))
          m.xpath('/feed/entry[1]/title', (x) => x.string('1'))
          m.xpath('/feed/entry[2]/title', (x) => x.string('3'))
        })
      }),
    )

    it(
      'given deleted ready books when requesting via opds then no books are returned',
      withMockCustomUser({}, async () => {
        const createdSeries = (() => {
          const series = makeSeries('series', { libraryId: library.id })
          const created = seriesLifecycle.createSeries(series)
          const books = [makeBook('1', { libraryId: library.id }), makeBook('3', { libraryId: library.id })]
          seriesLifecycle.addBooks(created, books)
          return created
        })()

        const addedBook = makeBook('2', { libraryId: library.id })
        seriesLifecycle.addBooks(createdSeries, [addedBook])
        seriesLifecycle.sortBooks(createdSeries)

        for (const it of bookRepository.findAll()) {
          const media = mediaRepository.findById(it.id)
          mediaRepository.update(media.copy({ status: Media.Status.READY, pages: [new BookPage({ fileName: '1.jpg', mediaType: 'image/jpeg' })] }))
          if (it.id === addedBook.id) bookRepository.update(it.copy({ deletedDate: LocalDateTime.now() }))
        }

        await mockMvc.get(`/opds/v1.2/series/${createdSeries.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.xpath('/feed/entry', (x) => x.nodeCount(2))
          m.xpath('/feed/entry[1]/title', (x) => x.string('1'))
          m.xpath('/feed/entry[2]/title', (x) => x.string('3'))
        })
      }),
    )
  })
})
