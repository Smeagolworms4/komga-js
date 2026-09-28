// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/ReadProgressDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import { gunzipSync } from 'node:zlib'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { R2Locator } from '../../../../src/domain/model/R2Locator.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { ReadProgressDao } from '../../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import { DSLContext } from '../../../../src/port/jooq/dsl.js'
import { Tables } from '../../../../src/port/jooq/generated/main/Tables.js'
import { eq, nn } from '../../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { expectCloseTo } from '../TestUtils.js'

/** `assertThat(actual).isEqualToIgnoringNanos(expected)` */
function expectEqualToIgnoringNanos(actual: LocalDateTime, expected: LocalDateTime): void {
  expect(actual.withNano(0).toString()).toBe(expected.withNano(0).toString())
}

describe('ReadProgressDaoTest', () => {
  const ctx = springBootTest()
  const readProgressDao = ctx.getBean(ReadProgressDao)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const bookRepository = ctx.getBean(BookRepository)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const library = makeLibrary()
  const series = makeSeries('Series')

  const user1 = new KomgaUser({ email: 'user1@example.org', password: '' })
  const user2 = new KomgaUser({ email: 'user2@example.org', password: '' })

  const book1 = makeBook('Book1')
  const book2 = makeBook('Book2')

  beforeAll(() => {
    libraryRepository.insert(library)
    seriesRepository.insert(series.copy({ libraryId: library.id }))
    userRepository.insert(user1)
    userRepository.insert(user2)
    bookRepository.insert(book1.copy({ libraryId: library.id, seriesId: series.id }))
    bookRepository.insert(book2.copy({ libraryId: library.id, seriesId: series.id }))
  })

  afterEach(() => {
    readProgressDao.deleteAll()
  })

  afterAll(() => {
    userRepository.deleteAll()
    bookRepository.deleteAll()
    seriesRepository.deleteAll()
    libraryRepository.deleteAll()
    closeContext(ctx)
  })

  it('given book without user progress when saving progress then progress is saved', () => {
    const now = LocalDateTime.now()

    readProgressDao.save(
      new ReadProgress({
        bookId: book1.id,
        userId: user1.id,
        page: 5,
        completed: false,
      }),
    )

    const readProgressList = readProgressDao.findAllByUserId(user1.id)

    expect(readProgressList).toHaveLength(1)
    {
      const it = nn(readProgressList[0])
      expect(it.page).toBe(5)
      expect(it.completed).toBe(false)
      expect(it.bookId).toBe(book1.id)
      expectCloseTo(it.readDate, now)
      expectCloseTo(it.createdDate, now)
      expectEqualToIgnoringNanos(it.createdDate, it.lastModifiedDate)
    }
  })

  it('given book with user progress when saving progress then progress is updated', () => {
    readProgressDao.save(
      new ReadProgress({
        bookId: book1.id,
        userId: user1.id,
        page: 5,
        completed: false,
      }),
    )

    const modificationDate = LocalDateTime.now()
    const readDateInThePast = LocalDateTime.now().minusYears(1)

    readProgressDao.save(
      new ReadProgress({
        bookId: book1.id,
        userId: user1.id,
        page: 10,
        completed: true,
        readDate: readDateInThePast,
      }),
    )

    const readProgressList = readProgressDao.findAllByUserId(user1.id)

    expect(readProgressList).toHaveLength(1)
    {
      const it = nn(readProgressList[0])
      expect(it.page).toBe(10)
      expect(it.completed).toBe(true)
      expect(it.bookId).toBe(book1.id)
      expectEqualToIgnoringNanos(it.readDate, readDateInThePast)
      expect(it.createdDate.isBefore(modificationDate)).toBe(true)
      expect(eq(it.createdDate, it.lastModifiedDate)).toBe(false)
      expectCloseTo(it.lastModifiedDate, modificationDate)
    }
  })

  // PORT: tests supplémentaires sans jumeau Kotlin : compatibilité des blobs READ_PROGRESS.LOCATOR avec Komga (JVM).
  // Fixtures produites par tools/jshell-komga.sh avec l'ObjectMapper de Spring Boot
  // (Jackson2ObjectMapperBuilder.json().featuresToDisable(WRITE_DATES_AS_TIMESTAMPS, WRITE_DURATIONS_AS_TIMESTAMPS).build())
  // et org.gotson.komga.infrastructure.jooq.UtilsKt.serializeJsonGz.
  describe('PORT: blobs Komga', () => {
    const KOMGA_LOCATOR_JSON =
      '{"href":"chapter1.xhtml","type":"application/xhtml+xml","title":"Chapître 1 \\"é\\"","locations":{"fragments":["#p1","t=3"],"progression":0.1,"position":7,"totalProgression":0.33333334},"text":{"after":"after","highlight":"héllo ✓"},"koboSpan":"kobo.1.2"}'
    const KOMGA_LOCATOR_GZ =
      'H4sIAAAAAAAA/1WOTQrCMBCFr1KeS0s1VhAKrryA4FJdxJI2wbQJySwq4incegE3XqI38SRO25UDw/x87w1zhw6qQoFSS08qiKzT1FikoJtXvJfeW1NKMq5djGjeTdiQHfiOff2HgkpEckL/PoGhdZMjorijCrJuVEs8HDHzYjBvc5xT+ODqoGJkJYplJnjjoqFx3LDKkbT7f00+xfrBWHU03JcV/z18OtYU2tTacjKE7t/WuuT7eoIdV3dxBy/50NhmIlvh8QNjGbt6AgEAAA=='
    const KOMGA_LOCATOR_MIN_JSON = '{"href":"c.xhtml","type":"text/html"}'
    const KOMGA_LOCATOR_MIN_GZ = 'H4sIAAAAAAAA/6tWyihKTVOyUkrWq8goyc1R0lEqqSxIBQqUpFaU6IOFagGVdJtlJQAAAA=='
    const locator = new R2Locator({
      href: 'chapter1.xhtml',
      type: 'application/xhtml+xml',
      title: 'Chapître 1 "é"',
      locations: new R2Locator.Location({ fragments: ['#p1', 't=3'], progression: 0.1, position: 7, totalProgression: 0.33333334 }),
      text: new R2Locator.Text({ after: 'after', before: null, highlight: 'héllo ✓' }),
      koboSpan: 'kobo.1.2',
    })
    const locatorMin = new R2Locator({ href: 'c.xhtml', type: 'text/html' })

    it('locator blob written by Komga is read back', () => {
      const r = Tables.READ_PROGRESS
      for (const [bookId, gz] of [
        [book1.id, KOMGA_LOCATOR_GZ],
        [book2.id, KOMGA_LOCATOR_MIN_GZ],
      ] as const) {
        readProgressDao.save(new ReadProgress({ bookId: bookId, userId: user1.id, page: 1, completed: false }))
        ctx
          .getBean(DSLContext)
          .update(r)
          .set(r.LOCATOR, new Uint8Array(Buffer.from(gz, 'base64')))
          .where(r.BOOK_ID.eq(bookId).and(r.USER_ID.eq(user1.id)))
          .execute()
      }

      expect(eq(nn(readProgressDao.findByBookIdAndUserIdOrNull(book1.id, user1.id)).locator, locator)).toBe(true)
      expect(eq(nn(readProgressDao.findByBookIdAndUserIdOrNull(book2.id, user1.id)).locator, locatorMin)).toBe(true)
    })

    it('locator blob written by KomgaJS contains the same JSON as Komga', () => {
      readProgressDao.save([
        new ReadProgress({ bookId: book1.id, userId: user1.id, page: 1, completed: false, locator: locator }),
        new ReadProgress({ bookId: book2.id, userId: user1.id, page: 1, completed: false, locator: locatorMin }),
      ])
      const r = Tables.READ_PROGRESS
      const blobs = ctx.getBean(DSLContext).select(r.BOOK_ID, r.LOCATOR).from(r).where(r.USER_ID.eq(user1.id)).fetchMap(r.BOOK_ID, r.LOCATOR)

      expect(gunzipSync(nn(blobs.get(book1.id))).toString('utf8')).toBe(KOMGA_LOCATOR_JSON)
      expect(gunzipSync(nn(blobs.get(book2.id))).toString('utf8')).toBe(KOMGA_LOCATOR_MIN_JSON)
    })
  })
})
