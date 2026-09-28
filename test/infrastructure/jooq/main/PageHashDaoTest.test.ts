// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/PageHashDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../../src/infrastructure/jooq/main/PageHashDao.js'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { PageHashKnown } from '../../../../src/domain/model/PageHashKnown.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { MediaDao } from '../../../../src/infrastructure/jooq/main/MediaDao.js'
import { PageHashDao } from '../../../../src/infrastructure/jooq/main/PageHashDao.js'
import { first, last, nn } from '../../../../src/port/kotlin.js'
import { Pageable } from '../../../../src/port/spring-data.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { expectCloseTo } from '../TestUtils.js'

describe('PageHashDaoTest', () => {
  const ctx = springBootTest()
  const pageHashDao = ctx.getBean(PageHashDao)
  const mediaDao = ctx.getBean(MediaDao)
  const bookRepository = ctx.getBean(BookRepository)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const library = makeLibrary()
  const series = makeSeries('Series', { libraryId: library.id })
  const books = [makeBook('Book', { libraryId: library.id, seriesId: series.id }), makeBook('Book2', { libraryId: library.id, seriesId: series.id })]

  beforeAll(() => {
    libraryRepository.insert(library)
    seriesRepository.insert(series)
    bookRepository.insert(books)
  })

  afterEach(() => {
    bookRepository.findAll().forEach((it) => {
      mediaDao.delete(it.id)
    })
  })

  afterAll(async () => {
    bookRepository.deleteAll()
    seriesRepository.deleteAll()
    libraryRepository.deleteAll()
    await closeContext(ctx)
  })

  describe('Known', () => {
    it('given a known page hash when inserting then it is persisted', () => {
      const now = LocalDateTime.now()
      const pageHash = new PageHashKnown({
        hash: 'hashed',
        size: 10,
        action: PageHashKnown.Action.IGNORE,
      })

      pageHashDao.insert(pageHash, null)
      const known = nn(pageHashDao.findKnown(pageHash.hash))

      expect(known.hash).toBe(pageHash.hash)
      expect(known.size).toBe(pageHash.size)
      expect(known.action).toBe(pageHash.action)
      expectCloseTo(known.createdDate, now)
      expectCloseTo(known.lastModifiedDate, now)
    })
  })

  describe('Unknown', () => {
    it('given known hashes when finding unknown then known are not included', () => {
      // given
      pageHashDao.insert(
        new PageHashKnown({
          hash: 'hash-1',
          size: 1,
          action: PageHashKnown.Action.IGNORE,
        }),
        null,
      )

      pageHashDao.insert(
        new PageHashKnown({
          hash: 'hash-2',
          size: null,
          action: PageHashKnown.Action.IGNORE,
        }),
        null,
      )

      const media = new Media({
        status: Media.Status.READY,
        mediaType: 'application/zip',
        pages: Array.from(
          { length: 10 },
          (_, i) =>
            new BookPage({
              fileName: `${i + 1}.jpg`,
              mediaType: 'image/jpeg',
              fileHash: `hash-${i + 1}`,
              fileSize: i + 1,
            }),
        ),
        comment: 'comment',
        bookId: first(books).id,
      })
      mediaDao.insert(media)
      mediaDao.insert(media.copy({ bookId: last(books).id }))

      // when
      const unknown = pageHashDao.findAllUnknown(Pageable.unpaged())

      // then
      expect(unknown.content).toHaveLength(8)
      const hashes = unknown.map((it) => it.hash).content
      expect(hashes).not.toContain('hash-1')
      expect(hashes).not.toContain('hash-2')
      expect([...hashes].sort()).toEqual(Array.from({ length: 8 }, (_, i) => `hash-${i + 3}`).sort())
    })
  })
})
