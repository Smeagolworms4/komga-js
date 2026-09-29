// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/BookAnalyzerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires ; SpringBootTest d'abord pour que la migration
// Flyway soit créée avant KomgaSettingsProvider (qui lit la base dans son constructeur)
import '../../SpringBootTest.js'
import '../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../src/domain/service/BookAnalyzer.js'
import { LocalDateTime } from '@js-joda/core'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { Book } from '../../../src/domain/model/Book.js'
import { BookPage } from '../../../src/domain/model/BookPage.js'
import { BookWithMedia } from '../../../src/domain/model/BookWithMedia.js'
import { Media } from '../../../src/domain/model/Media.js'
import { MediaExtensionEpub } from '../../../src/domain/model/MediaExtension.js'
import { BookAnalyzer } from '../../../src/domain/service/BookAnalyzer.js'
import { KomgaProperties } from '../../../src/infrastructure/configuration/KomgaProperties.js'
import '../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import { EpubExtractor } from '../../../src/infrastructure/mediacontainer/epub/EpubExtractor.js'
import { Exception, nn } from '../../../src/port/kotlin.js'
import { extension, listDirectoryEntries } from '../../../src/port/kotlin-io-path.js'
import { pathToUrl } from '../../../src/port/java.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { makeBook } from '../model/Utils.js'
import { any, clearMocks, coEvery, every, verify } from '../../support/mockk.js'

// PORT: ClassPathResource(p).url / .uri.toPath() sur le classpath de test (test/resources)
function classPathResourceUrl(p: string) {
  return pathToUrl(resolve('test/resources', p))
}

describe('BookAnalyzerTest', () => {
  // @SpykBean bookAnalyzer, @SpykBean epubExtractor
  const ctx = springBootTest({}, [
    { type: BookAnalyzer, spyk: true },
    { type: EpubExtractor, spyk: true },
  ])
  const komgaProperties = ctx.getBean(KomgaProperties)
  const bookAnalyzer = ctx.getBean(BookAnalyzer)
  const epubExtractor = ctx.getBean(EpubExtractor)

  afterAll(() => closeContext(ctx))

  afterEach(() => {
    // PORT: clearAllMocks() -> clearMocks des espions du test
    clearMocks(bookAnalyzer, epubExtractor)
  })

  describe('ArchiveFormats', () => {
    it.each(['rar4.rar', 'rar5.rar', 'rar4-solid.rar', 'rar5-solid.rar'])('given rar archives when analyzing then media status is READY', async (fileName) => {
      const file = classPathResourceUrl(`archives/${fileName}`)
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      const media = await bookAnalyzer.analyze(book, false)

      expect(media.mediaType?.startsWith('application/x-rar-compressed')).toBe(true)
      expect(media.status).toBe(Media.Status.READY)
    })

    it.each(['rar4-encrypted.rar', 'rar5-encrypted.rar'])('given rar encrypted archive when analyzing then media status is UNSUPPORTED', async (fileName) => {
      const file = classPathResourceUrl(`archives/${fileName}`)
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      const media = await bookAnalyzer.analyze(book, false)

      expect(media.mediaType?.startsWith('application/x-rar-compressed')).toBe(true)
      expect(media.status).toBe(Media.Status.UNSUPPORTED)
    })

    it.each(['7zip.7z', '7zip-encrypted.7z'])('given 7zip archive when analyzing then media status is UNSUPPORTED', async (fileName) => {
      const file = classPathResourceUrl(`archives/${fileName}`)
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      const media = await bookAnalyzer.analyze(book, false)

      expect(media.mediaType).toBe('application/x-7z-compressed')
      expect(media.status).toBe(Media.Status.UNSUPPORTED)
    })

    it.each(['zip.zip', 'zip-bzip2.zip', 'zip-copy.zip', 'zip-deflate64.zip', 'zip-lzma.zip', 'zip-ppmd.zip'])(
      'given zip archive when analyzing then media status is READY',
      async (fileName) => {
        const file = classPathResourceUrl(`archives/${fileName}`)
        const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

        const media = await bookAnalyzer.analyze(book, false)

        expect(media.mediaType).toBe('application/zip')
        expect(media.status).toBe(Media.Status.READY)
        expect(media.pages).toHaveLength(1)
      },
    )

    it('given zip encrypted archive when analyzing then media status is ERROR', async () => {
      const file = classPathResourceUrl('archives/zip-encrypted.zip')
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      const media = await bookAnalyzer.analyze(book, false)

      expect(media.mediaType).toBe('application/zip')
      expect(media.status).toBe(Media.Status.ERROR)
    })

    it('given epub archive when analyzing then media status is READY', async () => {
      const file = classPathResourceUrl('archives/epub3.epub')
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      const media = await bookAnalyzer.analyze(book, false)

      expect(media.mediaType).toBe('application/epub+zip')
      expect(media.status).toBe(Media.Status.READY)
    })
  })

  describe('Epub', () => {
    it('given broken epub archive when analyzing then media status is ERROR', async () => {
      const file = classPathResourceUrl('archives/zip-as-epub.epub')
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      const media = await bookAnalyzer.analyze(book, false)

      expect(media.mediaType).toBe('application/zip')
      expect(media.status).toBe(Media.Status.ERROR)
      expect(media.pages).toHaveLength(0)
    })

    it('given regular epub archive when analyzing then comment is empty', async () => {
      const file = classPathResourceUrl('epub/The Incomplete Theft - Ralph Burke.epub')
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      const media = await bookAnalyzer.analyze(book, false)

      expect(media.mediaType).toBe('application/epub+zip')
      expect(media.status).toBe(Media.Status.READY)
      expect(media.comment).toBeNull()
    })

    it('given epub archive when toc cannot be extracted then media status is READY with comments', async () => {
      const file = classPathResourceUrl('epub/The Incomplete Theft - Ralph Burke.epub')
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      every(() => epubExtractor.getToc(any())).throws(new Exception('mock exception'))

      const media = await bookAnalyzer.analyze(book, false)
      const extension = media.extension instanceof MediaExtensionEpub ? media.extension : null

      expect(media.mediaType).toBe('application/epub+zip')
      expect(media.status).toBe(Media.Status.READY)
      expect(media.comment).toContain('ERR_1035')
      expect(extension).not.toBeNull()
      expect(nn(extension).toc).toHaveLength(0)
    })

    it('given epub archive when landmarks cannot be extracted then media status is READY with comments', async () => {
      const file = classPathResourceUrl('epub/The Incomplete Theft - Ralph Burke.epub')
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      every(() => epubExtractor.getLandmarks(any())).throws(new Exception('mock exception'))

      const media = await bookAnalyzer.analyze(book, false)
      const extension = media.extension instanceof MediaExtensionEpub ? media.extension : null

      expect(media.mediaType).toBe('application/epub+zip')
      expect(media.status).toBe(Media.Status.READY)
      expect(media.comment).toContain('ERR_1036')
      expect(extension).not.toBeNull()
      expect(nn(extension).landmarks).toHaveLength(0)
    })

    it('given epub archive when page list cannot be extracted then media status is READY with comments', async () => {
      const file = classPathResourceUrl('epub/The Incomplete Theft - Ralph Burke.epub')
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      every(() => epubExtractor.getPageList(any())).throws(new Exception('mock exception'))

      const media = await bookAnalyzer.analyze(book, false)
      const extension = media.extension instanceof MediaExtensionEpub ? media.extension : null

      expect(media.mediaType).toBe('application/epub+zip')
      expect(media.status).toBe(Media.Status.READY)
      expect(media.comment).toContain('ERR_1037')
      expect(extension).not.toBeNull()
      expect(nn(extension).pageList).toHaveLength(0)
    })

    it('given epub archive when divina pages cannot be extracted then media status is READY with comments', async () => {
      const file = classPathResourceUrl('epub/The Incomplete Theft - Ralph Burke.epub')
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      every(() => epubExtractor.getDivinaPages(any(), any())).throws(new Exception('mock exception'))

      const media = await bookAnalyzer.analyze(book, false)

      expect(media.mediaType).toBe('application/epub+zip')
      expect(media.status).toBe(Media.Status.READY)
      expect(media.comment).toContain('ERR_1038')
      expect(media.pages).toHaveLength(0)
    })

    it('given epub archive when positions cannot be extracted then media status is READY with comments', async () => {
      const file = classPathResourceUrl('epub/The Incomplete Theft - Ralph Burke.epub')
      const book = new Book({ name: 'book', url: file, fileLastModified: LocalDateTime.now() })

      every(() => epubExtractor.computePositions(any(), any(), any(), any(), any())).throws(new Exception('mock exception'))

      const media = await bookAnalyzer.analyze(book, false)
      const extension = media.extension instanceof MediaExtensionEpub ? media.extension : null

      expect(media.mediaType).toBe('application/epub+zip')
      expect(media.status).toBe(Media.Status.READY)
      expect(media.comment).toContain('ERR_1039')
      expect(extension).not.toBeNull()
      expect(nn(extension).positions).toHaveLength(0)
    })
  })

  describe('PageHashing', () => {
    it('given book with a single page when hashing then all pages are hashed', async () => {
      const book = makeBook('book1')
      const pages = [new BookPage({ fileName: '1.jpeg', mediaType: 'image/jpeg' })]
      const media = new Media({ status: Media.Status.READY, pages: pages })

      every(() => bookAnalyzer.getPageContent(any(), any())).returns(new Uint8Array(1))
      // PORT: hashPage est asynchrone (coEvery)
      coEvery(() => bookAnalyzer.hashPage(any(), any())).returns(Promise.resolve('hashed'))

      const hashedMedia = await bookAnalyzer.hashPages(new BookWithMedia({ book: book, media: media }))

      expect(hashedMedia.pages).toHaveLength(1)
      expect(nn(hashedMedia.pages[0]).fileHash).toBe('hashed')
    })

    it('given book with more than 6 pages when hashing then only first and last 3 are hashed', async () => {
      const book = makeBook('book1')
      const pages = Array.from({ length: 30 }, (_, i) => new BookPage({ fileName: `${i + 1}.jpeg`, mediaType: 'image/jpeg' }))
      const media = new Media({ status: Media.Status.READY, pages: pages })

      every(() => bookAnalyzer.getPageContent(any(), any())).returns(new Uint8Array(1))
      coEvery(() => bookAnalyzer.hashPage(any(), any())).returns(Promise.resolve('hashed'))

      const hashedMedia = await bookAnalyzer.hashPages(new BookWithMedia({ book: book, media: media }))

      expect(hashedMedia.pages).toHaveLength(30)
      const first = hashedMedia.pages.slice(0, komgaProperties.pageHashing).map((it) => it.fileHash)
      expect(first).toHaveLength(komgaProperties.pageHashing)
      expect(new Set(first)).toEqual(new Set(['hashed']))
      const last = hashedMedia.pages.slice(-komgaProperties.pageHashing).map((it) => it.fileHash)
      expect(last).toHaveLength(komgaProperties.pageHashing)
      expect(new Set(last)).toEqual(new Set(['hashed']))
      const middle = hashedMedia.pages.slice(komgaProperties.pageHashing, hashedMedia.pages.length - komgaProperties.pageHashing).map((it) => it.fileHash)
      expect(middle).toHaveLength(30 - komgaProperties.pageHashing * 2)
      expect(new Set(middle)).toEqual(new Set(['']))
    })

    it('given book with already hashed pages when hashing then no hashing is done', async () => {
      const book = makeBook('book1')
      const pages = Array.from({ length: 30 }, (_, i) => new BookPage({ fileName: `${i + 1}.jpeg`, mediaType: 'image/jpeg', fileHash: 'hashed' }))
      const media = new Media({ status: Media.Status.READY, pages: pages })

      const hashedMedia = await bookAnalyzer.hashPages(new BookWithMedia({ book: book, media: media }))

      verify({ exactly: 0 }, () => bookAnalyzer.getPageContent(any(), any()))
      verify({ exactly: 0 }, () => bookAnalyzer.hashPage(any(), any()))

      const hashes = hashedMedia.pages.map((it) => it.fileHash)
      expect(hashes).toHaveLength(30)
      expect(new Set(hashes)).toEqual(new Set(['hashed']))
    })

    it.each(provideDirectoriesForPageHashing())('given 2 exact pages when hashing then hashes are the same', async (directory) => {
      const files = listDirectoryEntries(directory)
      expect(files).toHaveLength(2)

      const mediaType = `image/${extension(directory)}`

      const hashes: string[] = []
      for (const it of files) hashes.push(await bookAnalyzer.hashPage(new BookPage({ fileName: basename(it), mediaType: mediaType }), new Uint8Array(readFileSync(it))))

      expect(hashes[0]).toBe(hashes[hashes.length - 1])
    })

    function provideDirectoriesForPageHashing(): string[] {
      return listDirectoryEntries(resolve('test/resources/hashpage'))
    }
  })
})
