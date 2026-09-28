// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/MediaDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/MediaDao.js'
import { gunzipSync } from 'node:zlib'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { EpubTocEntry } from '../../../../src/domain/model/EpubTocEntry.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { MediaExtensionEpub, ProxyExtension } from '../../../../src/domain/model/MediaExtension.js'
import { MediaFile } from '../../../../src/domain/model/MediaFile.js'
import { MediaType } from '../../../../src/domain/model/MediaType.js'
import { R2Locator } from '../../../../src/domain/model/R2Locator.js'
import { BookRepository } from '../../../../src/domain/persistence/BookRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { KomgaProperties } from '../../../../src/infrastructure/configuration/KomgaProperties.js'
import { MediaDao } from '../../../../src/infrastructure/jooq/main/MediaDao.js'
import { serializeJsonGz } from '../../../../src/infrastructure/jooq/Utils.js'
import { ObjectMapper } from '../../../../src/port/jackson-mapper.js'
import { qualifiedNameOf } from '../../../../src/port/jackson.js'
import { DSLContext } from '../../../../src/port/jooq/dsl.js'
import { Tables } from '../../../../src/port/jooq/generated/main/Tables.js'
import { Exception, eq, nn } from '../../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'
import { expectCloseTo } from '../TestUtils.js'

/** `catchThrowable { }` d'AssertJ */
function catchThrowable(fn: () => unknown): unknown {
  try {
    fn()
    return null
  } catch (e) {
    return e
  }
}

describe('MediaDaoTest', () => {
  const ctx = springBootTest()
  const mediaDao = ctx.getBean(MediaDao)
  const bookRepository = ctx.getBean(BookRepository)
  const seriesRepository = ctx.getBean(SeriesRepository)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const komgaProperties = ctx.getBean(KomgaProperties)

  const library = makeLibrary()
  const series = makeSeries('Series', { libraryId: library.id })
  const book = makeBook('Book', { libraryId: library.id, seriesId: series.id })

  beforeAll(() => {
    libraryRepository.insert(library)

    seriesRepository.insert(series)

    bookRepository.insert(book)
  })

  afterEach(() => {
    bookRepository.findAll().forEach((it) => {
      mediaDao.delete(it.id)
    })
  })

  afterAll(() => {
    bookRepository.deleteAll()
    seriesRepository.deleteAll()
    libraryRepository.deleteAll()
    closeContext(ctx)
  })

  it('given a media when inserting then it is persisted', () => {
    const now = LocalDateTime.now()
    const media = new Media({
      status: Media.Status.READY,
      mediaType: 'application/zip',
      pages: [
        new BookPage({
          fileName: '1.jpg',
          mediaType: 'image/jpeg',
          dimension: new Dimension({ width: 10, height: 10 }),
          fileHash: 'hashed',
          fileSize: 10,
        }),
      ],
      files: [new MediaFile({ fileName: 'ComicInfo.xml', mediaType: 'application/xml', subType: MediaFile.SubType.EPUB_ASSET, fileSize: 3 })],
      comment: 'comment',
      bookId: book.id,
    })

    mediaDao.insert(media)
    const created = mediaDao.findById(media.bookId)

    expect(created.bookId).toBe(book.id)
    expectCloseTo(created.createdDate, now)
    expectCloseTo(created.lastModifiedDate, now)
    expect(created.status).toBe(media.status)
    expect(created.mediaType).toBe(media.mediaType)
    expect(created.comment).toBe(media.comment)
    expect(created.pages).toHaveLength(1)
    {
      const it = nn(created.pages[0])
      const first = nn(media.pages[0])
      expect(it.fileName).toBe(first.fileName)
      expect(it.mediaType).toBe(first.mediaType)
      expect(eq(it.dimension, first.dimension)).toBe(true)
      expect(it.fileHash).toBe(first.fileHash)
      expect(it.fileSize).toBe(first.fileSize)
    }
    expect(created.files).toHaveLength(1)
    {
      const it = nn(created.files[0])
      const first = nn(media.files[0])
      expect(it.fileName).toBe(first.fileName)
      expect(it.mediaType).toBe(first.mediaType)
      expect(it.subType).toBe(first.subType)
      expect(it.fileSize).toBe(first.fileSize)
    }
  })

  it('given a minimum media when inserting then it is persisted', () => {
    const media = new Media({ bookId: book.id })

    mediaDao.insert(media)
    const created = mediaDao.findById(media.bookId)

    expect(created.bookId).toBe(book.id)
    expect(created.status).toBe(Media.Status.UNKNOWN)
    expect(created.mediaType).toBeNull()
    expect(created.comment).toBeNull()
    expect(created.pages).toHaveLength(0)
    expect(created.files).toHaveLength(0)
    expect(created.extension).toBeNull()
  })

  it('given existing media when updating then it is persisted', () => {
    const media = new Media({
      status: Media.Status.READY,
      mediaType: 'application/zip',
      pages: [
        new BookPage({
          fileName: '1.jpg',
          mediaType: 'image/jpeg',
        }),
      ],
      files: [new MediaFile({ fileName: 'ComicInfo.xml', mediaType: 'application/xml', subType: MediaFile.SubType.EPUB_ASSET, fileSize: 5 })],
      comment: 'comment',
      bookId: book.id,
    })
    mediaDao.insert(media)

    const modificationDate = LocalDateTime.now()

    const updated = mediaDao.findById(media.bookId).copy({
      status: Media.Status.ERROR,
      mediaType: 'application/rar',
      pages: [
        new BookPage({
          fileName: '2.png',
          mediaType: 'image/png',
          dimension: new Dimension({ width: 10, height: 10 }),
          fileHash: 'hashed',
          fileSize: 10,
        }),
      ],
      files: [new MediaFile({ fileName: 'id.txt' })],
      comment: 'comment2',
    })

    mediaDao.update(updated)
    const modified = mediaDao.findById(updated.bookId)

    expect(modified.bookId).toBe(updated.bookId)
    expect(eq(modified.createdDate, updated.createdDate)).toBe(true)
    expectCloseTo(modified.lastModifiedDate, modificationDate)
    expect(eq(modified.lastModifiedDate, updated.lastModifiedDate)).toBe(false)
    expect(modified.status).toBe(updated.status)
    expect(modified.mediaType).toBe(updated.mediaType)
    expect(modified.comment).toBe(updated.comment)
    expect(nn(modified.pages[0]).fileName).toBe(nn(updated.pages[0]).fileName)
    expect(nn(modified.pages[0]).mediaType).toBe(nn(updated.pages[0]).mediaType)
    expect(eq(nn(modified.pages[0]).dimension, nn(updated.pages[0]).dimension)).toBe(true)
    expect(nn(modified.pages[0]).fileHash).toBe(nn(updated.pages[0]).fileHash)
    expect(nn(modified.pages[0]).fileSize).toBe(nn(updated.pages[0]).fileSize)
    expect(nn(modified.files[0]).fileName).toBe(nn(updated.files[0]).fileName)
    expect(nn(modified.files[0]).mediaType).toBe(nn(updated.files[0]).mediaType)
    expect(nn(modified.files[0]).subType).toBe(nn(updated.files[0]).subType)
    expect(nn(modified.files[0]).fileSize).toBe(nn(updated.files[0]).fileSize)
  })

  it('given existing media when finding by id then media is returned', () => {
    const media = new Media({
      status: Media.Status.READY,
      mediaType: 'application/zip',
      pages: [
        new BookPage({
          fileName: '1.jpg',
          mediaType: 'image/jpeg',
        }),
      ],
      files: [new MediaFile({ fileName: 'ComicInfo.xml' })],
      comment: 'comment',
      bookId: book.id,
    })
    mediaDao.insert(media)

    const found = catchThrowable(() => mediaDao.findById(media.bookId))

    // PORT: assertThat(throwable).doesNotThrowAnyException() -> aucune exception capturée
    expect(found).toBeNull()
  })

  it('given non-existing media when finding by id then exception is thrown', () => {
    const found = catchThrowable(() => mediaDao.findById('128742'))

    expect(found).toBeInstanceOf(Exception)
  })

  describe('MediaExtension', () => {
    it('given a media with extension when inserting then it is persisted', () => {
      const media = new Media({
        status: Media.Status.READY,
        mediaType: 'application/epub+zip',
        extension: new MediaExtensionEpub({
          toc: [new EpubTocEntry({ title: 'title', href: 'href', children: [new EpubTocEntry({ title: 'subtitle', href: 'subhref' })] })],
          landmarks: [new EpubTocEntry({ title: 'title2', href: 'href2', children: [new EpubTocEntry({ title: 'subtitle2', href: 'subhref2' })] })],
        }),
        bookId: book.id,
      })

      mediaDao.insert(media)
      const created = mediaDao.findById(media.bookId)

      expect(created.extension).not.toBeNull()
      expect(created.extension).toBeInstanceOf(ProxyExtension)
      expect((created.extension as ProxyExtension).extensionClassName).toBe(qualifiedNameOf(MediaExtensionEpub))

      const extension = mediaDao.findExtensionByIdOrNull(media.bookId)
      expect(extension).not.toBeNull()
      expect(extension).toBeInstanceOf(MediaExtensionEpub)
      expect(eq(extension, media.extension)).toBe(true)
    })

    it('given existing media with extension when updating then it is persisted', () => {
      const media = new Media({
        status: Media.Status.READY,
        mediaType: 'application/epub+zip',
        extension: new MediaExtensionEpub({
          landmarks: [new EpubTocEntry({ title: 'title2', href: 'href2', children: [new EpubTocEntry({ title: 'subtitle2', href: 'subhref2' })] })],
        }),
        bookId: book.id,
      })
      mediaDao.insert(media)

      const updated = mediaDao.findById(media.bookId).copy({
        extension: new MediaExtensionEpub({
          toc: [new EpubTocEntry({ title: 'title', href: 'href', children: [new EpubTocEntry({ title: 'subtitle', href: 'subhref' })] })],
        }),
      })

      mediaDao.update(updated)
      const modified = mediaDao.findById(updated.bookId)

      expect(modified.bookId).toBe(updated.bookId)
      expect(eq(modified.createdDate, updated.createdDate)).toBe(true)
      expect(eq(modified.lastModifiedDate, updated.lastModifiedDate)).toBe(false)
      expect(modified.extension).not.toBeNull()
      expect(modified.extension).toBeInstanceOf(ProxyExtension)
      expect((modified.extension as ProxyExtension).extensionClassName).toBe(qualifiedNameOf(MediaExtensionEpub))

      expect(eq(mediaDao.findExtensionByIdOrNull(media.bookId), updated.extension)).toBe(true)
    })

    it('given existing media with proxy extension when updating then it is kept as-is', () => {
      const media = new Media({
        status: Media.Status.READY,
        mediaType: 'application/epub+zip',
        extension: new MediaExtensionEpub({
          landmarks: [new EpubTocEntry({ title: 'title2', href: 'href2', children: [new EpubTocEntry({ title: 'subtitle2', href: 'subhref2' })] })],
        }),
        bookId: book.id,
      })
      mediaDao.insert(media)

      const updated = mediaDao.findById(media.bookId).copy({ comment: 'updated' })

      mediaDao.update(updated)
      const modified = mediaDao.findById(updated.bookId)

      expect(modified.bookId).toBe(updated.bookId)
      expect(eq(modified.createdDate, updated.createdDate)).toBe(true)
      expect(eq(modified.lastModifiedDate, updated.lastModifiedDate)).toBe(false)
      expect(modified.comment).toBe(updated.comment)
      expect(modified.extension).not.toBeNull()
      expect(modified.extension).toBeInstanceOf(ProxyExtension)
      expect((modified.extension as ProxyExtension).extensionClassName).toBe(qualifiedNameOf(MediaExtensionEpub))

      const extension = mediaDao.findExtensionByIdOrNull(media.bookId)
      expect(extension).not.toBeNull()
      expect(extension).toBeInstanceOf(MediaExtensionEpub)
      expect(eq(extension, media.extension)).toBe(true)
    })
  })

  describe('MissingPageHash', () => {
    it('given media with single page not hashed when finding for missing page hash then it is returned', () => {
      const media = new Media({
        status: Media.Status.READY,
        pages: [
          new BookPage({
            fileName: '1.jpg',
            mediaType: 'image/jpeg',
          }),
        ],
        mediaType: MediaType.ZIP.type,
        bookId: book.id,
      })
      mediaDao.insert(media)

      const found = mediaDao.findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(book.libraryId, [MediaType.ZIP.type], komgaProperties.pageHashing)

      expect(found).toEqual([book.id])
    })

    it('given non-convertible media not hashed when finding for missing page hash then it is returned', () => {
      const media = new Media({
        status: Media.Status.READY,
        pages: [
          new BookPage({
            fileName: '1.jpg',
            mediaType: 'image/jpeg',
          }),
        ],
        mediaType: MediaType.RAR_4.type,
        bookId: book.id,
      })
      mediaDao.insert(media)

      const found = mediaDao.findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(book.libraryId, [MediaType.ZIP.type], komgaProperties.pageHashing)

      expect(found).toHaveLength(0)
    })

    it('given media with no pages hashed when finding for missing page hash then it is not returned', () => {
      const media = new Media({
        status: Media.Status.READY,
        pages: Array.from(
          { length: 12 },
          (_, i) =>
            new BookPage({
              fileName: `${i + 1}.jpg`,
              mediaType: 'image/jpeg',
            }),
        ),
        mediaType: MediaType.ZIP.type,
        bookId: book.id,
      })
      mediaDao.insert(media)

      const found = mediaDao.findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(book.libraryId, [MediaType.ZIP.type], komgaProperties.pageHashing)

      // PORT: containsOnly
      expect(new Set(found)).toEqual(new Set([book.id]))
    })

    it('given media with single page hashed when finding for missing page hash then it is not returned', () => {
      const media = new Media({
        status: Media.Status.READY,
        pages: [
          new BookPage({
            fileName: '1.jpg',
            mediaType: 'image/jpeg',
            fileHash: 'hashed',
          }),
        ],
        mediaType: MediaType.ZIP.type,
        bookId: book.id,
      })
      mediaDao.insert(media)

      const found = mediaDao.findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(book.libraryId, [MediaType.ZIP.type], komgaProperties.pageHashing)

      expect(found).toHaveLength(0)
    })

    it('given media with required pages hashed when finding for missing page hash then it is not returned', () => {
      const media = new Media({
        status: Media.Status.READY,
        pages: Array.from({ length: 12 }, (_, i) => i + 1).map(
          (it) =>
            new BookPage({
              fileName: `${it}.jpg`,
              mediaType: 'image/jpeg',
              fileHash: it <= 3 || it >= 9 ? 'hashed' : '',
            }),
        ),
        mediaType: MediaType.ZIP.type,
        bookId: book.id,
      })
      mediaDao.insert(media)

      const found = mediaDao.findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(book.libraryId, [MediaType.ZIP.type], komgaProperties.pageHashing)

      expect(found).toHaveLength(0)
    })

    it('given media with more pages hashed than required when finding for missing page hash then it is not returned', () => {
      const media = new Media({
        status: Media.Status.READY,
        pages: Array.from(
          { length: 12 },
          (_, i) =>
            new BookPage({
              fileName: `${i + 1}.jpg`,
              mediaType: 'image/jpeg',
              fileHash: 'hashed',
            }),
        ),
        mediaType: MediaType.ZIP.type,
        bookId: book.id,
      })
      mediaDao.insert(media)

      const found = mediaDao.findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(book.libraryId, [MediaType.ZIP.type], komgaProperties.pageHashing)

      expect(found).toHaveLength(0)
    })
  })

  // PORT: tests supplémentaires sans jumeau Kotlin : compatibilité des blobs EXTENSION_VALUE_BLOB avec Komga (JVM).
  // Fixtures produites par tools/jshell-komga.sh avec l'ObjectMapper de Spring Boot
  // (Jackson2ObjectMapperBuilder.json().featuresToDisable(WRITE_DATES_AS_TIMESTAMPS, WRITE_DURATIONS_AS_TIMESTAMPS).build())
  // et org.gotson.komga.infrastructure.jooq.UtilsKt.serializeJsonGz.
  describe('PORT: blobs Komga', () => {
    const KOMGA_EXTENSION_JSON =
      '{"toc":[{"title":"title","href":"href","children":[{"title":"subtitle","href":null,"children":[]}]}],"landmarks":[{"title":"landmark","href":"lhref","children":[]}],"pageList":[],"isFixedLayout":true,"positions":[{"href":"chapter1.xhtml","type":"application/xhtml+xml","title":"Chapître 1 \\"é\\"","locations":{"fragments":["#p1","t=3"],"progression":0.1,"position":7,"totalProgression":0.33333334},"text":{"after":"after","highlight":"héllo ✓"},"koboSpan":"kobo.1.2"},{"href":"p2.xhtml","type":"application/xhtml+xml","locations":{"progression":1.0,"position":2,"totalProgression":0.5}}]}'
    const KOMGA_EXTENSION_GZ =
      'H4sIAAAAAAAA/41RQU7DMBD8SrQciUKTgpAicULi1AMSR8rBTd3E6ia27I2UKsoruPKBXvhEfsJLWCeFYsEBR9bGuzM7O3YPpAvIn3sgRSghP8UYKit3fJxCDEWlcGtlE0BduwnRTYsYYF8G/mJA0WxrYfcuoH9lz2L4W23iG1HKlXLkzzEo96A6uV2Jg245RbaVDNFOkdLNLHHqV1TCkLRp0lVUIzemg/HKwhhUhfD4q6l02c3l02T3zBvfycoojdYwHtfARdQzgxV62FlR1rIhLwcXJvXkuyX4Wa0urXSOkZAvkvQ8GuS3jNIk8DHELOd1PXBZduT7ix3P7SedIl+QKivkTf5JxiOijj7eXoEZe73RT0Zwo+k3SZOM099XYLL/mg/8BS7SZPHTRfa3i5uBH/sT4DbCo1ACAAA='
    const extension = new MediaExtensionEpub({
      toc: [new EpubTocEntry({ title: 'title', href: 'href', children: [new EpubTocEntry({ title: 'subtitle', href: null, children: [] })] })],
      landmarks: [new EpubTocEntry({ title: 'landmark', href: 'lhref', children: [] })],
      pageList: [],
      isFixedLayout: true,
      positions: [
        new R2Locator({
          href: 'chapter1.xhtml',
          type: 'application/xhtml+xml',
          title: 'Chapître 1 "é"',
          locations: new R2Locator.Location({ fragments: ['#p1', 't=3'], progression: 0.1, position: 7, totalProgression: 0.33333334 }),
          text: new R2Locator.Text({ after: 'after', before: null, highlight: 'héllo ✓' }),
          koboSpan: 'kobo.1.2',
        }),
        new R2Locator({
          href: 'p2.xhtml',
          type: 'application/xhtml+xml',
          title: null,
          locations: new R2Locator.Location({ fragments: [], progression: 1.0, position: 2, totalProgression: 0.5 }),
          text: null,
          koboSpan: null,
        }),
      ],
    })

    it('extension blob written by Komga is read back', () => {
      mediaDao.insert(new Media({ status: Media.Status.READY, mediaType: 'application/epub+zip', bookId: book.id }))
      const m = Tables.MEDIA
      ctx
        .getBean(DSLContext)
        .update(m)
        .set(m.EXTENSION_CLASS, 'org.gotson.komga.domain.model.MediaExtensionEpub')
        .set(m.EXTENSION_VALUE_BLOB, new Uint8Array(Buffer.from(KOMGA_EXTENSION_GZ, 'base64')))
        .where(m.BOOK_ID.eq(book.id))
        .execute()

      const created = mediaDao.findById(book.id)
      expect(created.extension).toBeInstanceOf(ProxyExtension)
      expect((created.extension as ProxyExtension).extensionClassName).toBe('org.gotson.komga.domain.model.MediaExtensionEpub')

      const found = mediaDao.findExtensionByIdOrNull(book.id)
      expect(found).toBeInstanceOf(MediaExtensionEpub)
      expect(eq(found, extension)).toBe(true)
    })

    it('extension blob written by KomgaJS contains the same JSON as Komga', () => {
      mediaDao.insert(new Media({ status: Media.Status.READY, mediaType: 'application/epub+zip', extension: extension, bookId: book.id }))
      const m = Tables.MEDIA
      const row = nn(
        ctx.getBean(DSLContext).select(m.EXTENSION_CLASS, m.EXTENSION_VALUE_BLOB).from(m).where(m.BOOK_ID.eq(book.id)).fetchOne(),
      )
      expect(row.get(m.EXTENSION_CLASS)).toBe('org.gotson.komga.domain.model.MediaExtensionEpub')
      expect(gunzipSync(row.get(m.EXTENSION_VALUE_BLOB)).toString('utf8')).toBe(KOMGA_EXTENSION_JSON)
      expect(gunzipSync(nn(serializeJsonGz(ctx.getBean(ObjectMapper), extension))).toString('utf8')).toBe(KOMGA_EXTENSION_JSON)
    })
  })
})
