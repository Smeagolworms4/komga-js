// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/metadata/localartwork/LocalArtworkProviderTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { LocalDateTime } from '@js-joda/core'
import { describe, expect, it, vi } from 'vitest'
import { Book } from '../../../../src/domain/model/Book.js'
import { Series } from '../../../../src/domain/model/Series.js'
import { ImageAnalyzer } from '../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ContentDetector } from '../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { TikaConfiguration } from '../../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import { LocalArtworkProvider } from '../../../../src/infrastructure/metadata/localartwork/LocalArtworkProvider.js'
import { FilenameUtils } from '../../../../src/port/commons-io.js'
import { pathToUrl } from '../../../../src/port/java-net.js'

/** PORT: Jimfs (système de fichiers en mémoire) -> répertoire temporaire */
function withFileSystem(block: (root: string) => void): void {
  const fs = mkdtempSync(join(tmpdir(), 'jimfs-'))
  try {
    block(fs)
  } finally {
    rmSync(fs, { recursive: true, force: true })
  }
}

describe('LocalArtworkProviderTest', () => {
  // PORT: spyk(ContentDetector(...)) avec detectMediaType(Path) remplacé -> vi.spyOn
  const contentDetector = new ContentDetector(new TikaConfiguration().tika())
  vi.spyOn(contentDetector, 'detectMediaType').mockImplementation((path) => {
    switch (extname(path as string).substring(1).toLowerCase()) {
      case 'jpg':
      case 'jpeg':
      case 'tbn':
        return 'image/jpeg'
      case 'png':
        return 'image/png'
      case 'webp':
        return 'image/webp'
      case 'avif':
        return 'image/avif'
      case 'jxl':
        return 'image/jxl'
      default:
        return 'application/octet-stream'
    }
  })

  const localMediaAssetsProvider = new LocalArtworkProvider(contentDetector, new ImageAnalyzer())

  it('given book with sidecar files when getting thumbnails then return valid ones', () => {
    withFileSystem((fs) => {
      // given
      const root = join(fs, 'root')
      mkdirSync(root)

      const bookFile = join(root, 'book(e).cbz')
      writeFileSync(bookFile, '')
      const thumbsFiles = ['bOOk(e).jpeg', 'Book(e).tbn', 'book(e).PNG', 'book(e).jpeg', 'book(e).webp']
      const thumbsDashFiles = ['book(e)-1.jpeg', 'book(e)-2.tbn', 'book(e)-23.png', 'book(e)-111.jpeg', 'book(e)-123.webp']
      const invalidFiles = ['book12(e).jpeg', 'book(e).gif', 'cover.png', 'other.jpeg', 'book.webp', 'book(e).avif', 'book(e).jxl']

      ;[...thumbsFiles, ...thumbsDashFiles, ...invalidFiles].forEach((it) => writeFileSync(join(root, it), ''))

      // PORT: spyk(Book) avec book.path remplacé -> Book dont l'URL désigne le fichier
      const book = new Book({
        name: 'Book',
        url: pathToUrl(bookFile),
        fileLastModified: LocalDateTime.now(),
      })

      // when
      const thumbnails = localMediaAssetsProvider.getBookThumbnails(book)

      // then
      expect(thumbnails).toHaveLength(thumbsFiles.length + thumbsDashFiles.length)
      expect(thumbnails.filter((it) => it.selected)).toHaveLength(1)
      const names = thumbnails.map((it) => FilenameUtils.getName(it.url!.toString()))
      expect(names).toEqual(expect.arrayContaining(thumbsFiles))
      expect(names).toEqual(expect.arrayContaining(thumbsDashFiles))
      expect(names.filter((it) => invalidFiles.includes(it))).toEqual([])
    })
  })

  it('given series with sidecar files when getting thumbnails then return valid ones', () => {
    withFileSystem((fs) => {
      // given
      const seriesPath = join(fs, 'series')
      mkdirSync(seriesPath)
      const seriesFile = seriesPath

      const thumbsFiles = ['CoVeR.jpeg', 'DefauLt.tbn', 'POSter.PNG', 'FoLDer.jpeg', 'serIES.TBN', 'serIes.WebP']
      const invalidFiles = ['cover.gif', 'artwork.jpg', 'other.jpeg', 'cover.avif', 'series.jxl']

      ;[...thumbsFiles, ...invalidFiles].forEach((it) => writeFileSync(join(seriesPath, it), ''))

      // PORT: spyk(Series) avec series.path remplacé -> Series dont l'URL désigne le répertoire
      const series = new Series({
        name: 'Series',
        url: pathToUrl(seriesFile),
        fileLastModified: LocalDateTime.now(),
      })

      // when
      const thumbnails = localMediaAssetsProvider.getSeriesThumbnails(series)

      // then
      expect(thumbnails).toHaveLength(thumbsFiles.length)
      expect(thumbnails.filter((it) => it.selected)).toHaveLength(1)
      const names = thumbnails.map((it) => FilenameUtils.getName(it.url!.toString()))
      expect(names).toEqual(expect.arrayContaining(thumbsFiles))
      expect(names.filter((it) => invalidFiles.includes(it))).toEqual([])
    })
  })
})
