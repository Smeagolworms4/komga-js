// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/BookAnalyzer.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Book } from '../model/Book.js'
import { BookPage } from '../model/BookPage.js'
import type { BookWithMedia } from '../model/BookWithMedia.js'
import { Dimension } from '../model/Dimension.js'
import { Media } from '../model/Media.js'
import { MediaExtensionEpub } from '../model/MediaExtension.js'
import { MediaFile } from '../model/MediaFile.js'
import type { EpubTocEntry } from '../model/EpubTocEntry.js'
import type { R2Locator } from '../model/R2Locator.js'
import { MediaNotReadyException, MediaUnsupportedException, NoThumbnailFoundException } from '../model/Exceptions.js'
import { MediaProfile } from '../model/MediaProfile.js'
import { MediaType } from '../model/MediaType.js'
import { ThumbnailBook } from '../model/ThumbnailBook.js'
import { TypedBytes } from '../model/TypedBytes.js'
import { KomgaProperties } from '../../infrastructure/configuration/KomgaProperties.js'
import { KomgaSettingsProvider } from '../../infrastructure/configuration/KomgaSettingsProvider.js'
import { Hasher } from '../../infrastructure/hash/Hasher.js'
import { ImageAnalyzer } from '../../infrastructure/image/ImageAnalyzer.js'
import { ImageConverter } from '../../infrastructure/image/ImageConverter.js'
import { ImageType } from '../../infrastructure/image/ImageType.js'
import { ContentDetector } from '../../infrastructure/mediacontainer/ContentDetector.js'
import { DivinaExtractor } from '../../infrastructure/mediacontainer/divina/DivinaExtractor.js'
import { EpubExtractor } from '../../infrastructure/mediacontainer/epub/EpubExtractor.js'
import { epub } from '../../infrastructure/mediacontainer/epub/Epub.js'
import { PdfExtractor } from '../../infrastructure/mediacontainer/pdf/PdfExtractor.js'
import { ByteArrayOutputStream, ImageIO } from '../../port/imageio-codecs.js'
import { ByteArrayInputStream } from '../../port/java-io.js'
import { IllegalArgumentException, IndexOutOfBoundsException, NoSuchElementException, filterNotNull, isBlank, isNullOrBlank, nn, partition } from '../../port/kotlin.js'
import { AccessDeniedException, NoSuchFileException, extension, translateNodeError } from '../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../port/logging.js'
import { type Token, component } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.BookAnalyzer')

export class BookAnalyzer {
  readonly divinaExtractors: Map<string, DivinaExtractor>

  constructor(
    private readonly contentDetector: ContentDetector,
    extractors: DivinaExtractor[],
    private readonly pdfExtractor: PdfExtractor,
    private readonly epubExtractor: EpubExtractor,
    private readonly imageConverter: ImageConverter,
    private readonly imageAnalyzer: ImageAnalyzer,
    private readonly hasher: Hasher,
    private readonly pageHashing: number,
    private readonly komgaSettingsProvider: KomgaSettingsProvider,
    // @Qualifier("thumbnailType")
    private readonly thumbnailType: ImageType,
    // @Qualifier("pdfImageType")
    private readonly pdfImageType: ImageType,
  ) {
    this.divinaExtractors = new Map(extractors.flatMap((e) => e.mediaTypes().map((it) => [it, e] as [string, DivinaExtractor])))
  }

  analyze(book: Book, analyzeDimensions: boolean): Media {
    logger.info(() => `Trying to analyze book: ${book}`)
    let result: Media
    try {
      const detected = this.contentDetector.detectMediaType(book.path)
      logger.info(() => `Detected media type: ${detected}`)
      let mediaType = MediaType.fromMediaType(detected)
      if (mediaType === null) return new Media({ mediaType: detected, status: Media.Status.UNSUPPORTED, comment: 'ERR_1001', bookId: book.id })

      if (extension(book.path).toLowerCase() === 'epub' && mediaType !== MediaType.EPUB) {
        if (this.epubExtractor.isEpub(book.path)) {
          mediaType = MediaType.EPUB
        } else {
          logger.warn(() => `Epub file is malformed, file is probably broken: ${book.path}`)
          return new Media({ mediaType: mediaType.type, status: Media.Status.ERROR, comment: 'ERR_1032', bookId: book.id })
        }
      }

      let media: Media
      switch (mediaType.profile) {
        case MediaProfile.DIVINA:
          media = this.analyzeDivina(book, mediaType, analyzeDimensions)
          break
        case MediaProfile.PDF:
          media = this.analyzePdf(book, analyzeDimensions)
          break
        case MediaProfile.EPUB:
          media = this.analyzeEpub(book, analyzeDimensions)
          break
        default:
          throw new Error('unreachable')
      }
      result = media.copy({ mediaType: mediaType.type })
    } catch (e) {
      // PORT: les erreurs système de Node (errno) sont traduites en exceptions java.nio.file comme sur la JVM
      const ex = translateNodeError(e, book.path)
      if (ex instanceof AccessDeniedException) {
        logger.error(ex, () => `Error while analyzing book: ${book}`)
        result = new Media({ status: Media.Status.ERROR, comment: 'ERR_1000' })
      } else if (ex instanceof NoSuchFileException) {
        logger.error(ex, () => `Error while analyzing book: ${book}`)
        result = new Media({ status: Media.Status.ERROR, comment: 'ERR_1018' })
      } else if (ex instanceof Error) {
        // PORT: catch (ex: Exception) : toute Error JS est traitée comme une Exception
        logger.error(ex, () => `Error while analyzing book: ${book}`)
        result = new Media({ status: Media.Status.ERROR, comment: 'ERR_1005' })
      } else throw ex
    }
    return result.copy({ bookId: book.id })
  }

  private analyzeDivina(book: Book, mediaType: MediaType, analyzeDimensions: boolean): Media {
    let entries
    try {
      const extractor = this.divinaExtractors.get(mediaType.type)
      if (extractor === undefined) return new Media({ status: Media.Status.UNSUPPORTED })
      entries = extractor.getEntries(book.path, analyzeDimensions)
    } catch (ex) {
      if (ex instanceof MediaUnsupportedException) return new Media({ status: Media.Status.UNSUPPORTED, comment: ex.code })
      logger.error(ex as Error, () => `Error while analyzing book: ${book}`)
      return new Media({ status: Media.Status.ERROR, comment: 'ERR_1008' })
    }

    const [images, others] = partition(entries, (entry) => (entry.mediaType !== null ? this.contentDetector.isImage(entry.mediaType) : null) ?? false)
    const pages = images.map((it) => new BookPage({ fileName: it.name, mediaType: nn(it.mediaType), dimension: it.dimension, fileSize: it.fileSize }))

    const errorNames = others.filter((it) => isNullOrBlank(it.mediaType)).map((it) => it.name)
    const entriesErrorSummary = errorNames.length === 0 ? null : `ERR_1007 [${errorNames.join(', ')}]`

    if (pages.length === 0) {
      logger.warn(() => `Book ${book} does not contain any pages`)
      return new Media({ status: Media.Status.ERROR, comment: 'ERR_1006' })
    }
    logger.info(() => `Book has ${pages.length} pages`)

    const files = others.map((it) => new MediaFile({ fileName: it.name, mediaType: it.mediaType, fileSize: it.fileSize }))

    return new Media({ status: Media.Status.READY, pages: pages, pageCount: pages.length, files: files, comment: entriesErrorSummary })
  }

  private analyzeEpub(book: Book, analyzeDimensions: boolean): Media {
    return epub(book.path, (epub) => {
      const [resources, missingResources] = partition(this.epubExtractor.getResources(epub), (it) => it.fileSize !== null)
      const isKepub = this.epubExtractor.isKepub(epub, resources)

      const errors: string[] = []

      let toc: EpubTocEntry[]
      try {
        toc = this.epubExtractor.getToc(epub)
      } catch (e) {
        logger.error(e as Error, () => 'Error while getting EPUB TOC')
        errors.push('ERR_1035')
        toc = []
      }

      let landmarks: EpubTocEntry[]
      try {
        landmarks = this.epubExtractor.getLandmarks(epub)
      } catch (e) {
        logger.error(e as Error, () => 'Error while getting EPUB Landmarks')
        errors.push('ERR_1036')
        landmarks = []
      }

      let pageList: EpubTocEntry[]
      try {
        pageList = this.epubExtractor.getPageList(epub)
      } catch (e) {
        logger.error(e as Error, () => 'Error while getting EPUB page list')
        errors.push('ERR_1037')
        pageList = []
      }

      let divinaPages: BookPage[]
      try {
        divinaPages = this.epubExtractor.getDivinaPages(epub, analyzeDimensions)
      } catch (e) {
        logger.error(e as Error, () => 'Error while getting EPUB Divina pages')
        errors.push('ERR_1038')
        divinaPages = []
      }

      const isFixedLayout = divinaPages.length > 0 || this.epubExtractor.isFixedLayout(epub)

      let positions: R2Locator[]
      try {
        positions = this.epubExtractor.computePositions(epub, book, resources, isFixedLayout, isKepub)
      } catch (e) {
        logger.error(e as Error, () => 'Error while getting EPUB positions')
        errors.push('ERR_1039')
        positions = []
      }

      const missingNames = missingResources.map((it) => it.fileName)
      const entriesErrorSummary = missingNames.length === 0 ? null : `ERR_1033 [${missingNames.join(', ')}]`

      const joined = filterNotNull([...errors, entriesErrorSummary]).join(' ')
      const allErrors = isBlank(joined) ? null : joined

      return new Media({
        status: Media.Status.READY,
        pages: divinaPages,
        files: resources,
        pageCount: divinaPages.length > 0 ? divinaPages.length : this.epubExtractor.computePageCount(epub),
        epubDivinaCompatible: divinaPages.length > 0,
        epubIsKepub: isKepub,
        extension: new MediaExtensionEpub({
          toc: toc,
          landmarks: landmarks,
          pageList: pageList,
          isFixedLayout: isFixedLayout,
          positions: positions,
        }),
        comment: allErrors,
      })
    })
  }

  private analyzePdf(book: Book, analyzeDimensions: boolean): Media {
    const pages = this.pdfExtractor.getPages(book.path, analyzeDimensions).map((it) => new BookPage({ fileName: it.name, mediaType: '', dimension: it.dimension }))
    return new Media({ status: Media.Status.READY, pages: pages })
  }

  // @Throws(MediaNotReadyException::class, NoThumbnailFoundException::class)
  // PORT: async (ImageConverter.resizeImageToByteArray)
  async generateThumbnail(book: BookWithMedia): Promise<ThumbnailBook> {
    logger.info(() => `Generate thumbnail for book: ${book}`)

    if (book.media.status !== Media.Status.READY) {
      logger.warn(() => `Book media is not ready, cannot generate thumbnail. Book: ${book}`)
      throw new MediaNotReadyException()
    }

    const cover = this.getPoster(book)
    const thumbnail = cover !== null ? await this.imageConverter.resizeImageToByteArray(cover.bytes, this.thumbnailType, this.komgaSettingsProvider.thumbnailSize.maxEdge) : null
    if (thumbnail === null) throw new NoThumbnailFoundException()

    return new ThumbnailBook({
      thumbnail: thumbnail,
      type: ThumbnailBook.Type.GENERATED,
      bookId: book.book.id,
      mediaType: this.thumbnailType.mediaType,
      dimension: this.imageAnalyzer.getDimension(new ByteArrayInputStream(thumbnail)) ?? new Dimension({ width: 0, height: 0 }),
      fileSize: thumbnail.length,
    })
  }

  getPoster(book: BookWithMedia): TypedBytes | null {
    switch (book.media.profile) {
      case MediaProfile.DIVINA: {
        const extractor = this.divinaExtractors.get(nn(book.media.mediaType))
        return extractor !== undefined ? this.divinaGetPoster(extractor, book) : null
      }
      case MediaProfile.PDF:
        return this.pdfExtractor.getPageContentAsImage(book.book.path, 1)
      case MediaProfile.EPUB: {
        const cover = this.epubExtractor.getCover(book.book.path)
        if (cover !== null) return cover
        if (book.media.epubDivinaCompatible) {
          const extractor = this.divinaExtractors.get(MediaType.ZIP.type)
          return extractor !== undefined ? this.divinaGetPoster(extractor, book) : null
        }
        return null
      }
      case null:
        return null
    }
    return null
  }

  // PORT: fonction d'extension privée DivinaExtractor.getPoster(book) -> méthode privée (nom distinct de getPoster(book))
  private divinaGetPoster(self: DivinaExtractor, book: BookWithMedia): TypedBytes {
    const it = self.getEntryStream(book.book.path, nn(book.media.pages[0]).fileName)
    return new TypedBytes({
      bytes: it,
      mediaType: nn(book.media.pages[0]).mediaType,
    })
  }

  // @Throws(MediaNotReadyException::class, IndexOutOfBoundsException::class)
  getPageContent(book: BookWithMedia, number: number): Uint8Array {
    logger.debug(() => `Get page #${number} for book: ${book}`)

    if (book.media.status !== Media.Status.READY) {
      logger.warn(() => 'Book media is not ready, cannot get pages')
      throw new MediaNotReadyException()
    }

    if (number > book.media.pageCount || number <= 0) {
      logger.error(() => `Page number #${number} is out of bounds. Book has ${book.media.pageCount} pages`)
      throw new IndexOutOfBoundsException(`Page ${number} does not exist`)
    }

    switch (book.media.profile) {
      case MediaProfile.DIVINA:
        return getValue(this.divinaExtractors, nn(book.media.mediaType)).getEntryStream(book.book.path, nn(book.media.pages[number - 1]).fileName)
      case MediaProfile.PDF:
        return this.pdfExtractor.getPageContentAsImage(book.book.path, number).bytes
      case MediaProfile.EPUB:
        if (book.media.epubDivinaCompatible) return this.epubExtractor.getEntryStream(book.book.path, nn(book.media.pages[number - 1]).fileName)
        else throw new MediaUnsupportedException('Epub profile does not support getting page content')

      case null:
        throw new MediaNotReadyException()
    }
    throw new MediaNotReadyException()
  }

  // @Throws(MediaNotReadyException::class, IndexOutOfBoundsException::class)
  getPageContentRaw(book: BookWithMedia, number: number): TypedBytes {
    logger.debug(() => `Get raw page #${number} for book: ${book}`)
    if (book.media.profile !== MediaProfile.PDF) throw new MediaUnsupportedException('Extractor does not support raw extraction of pages')

    if (book.media.status !== Media.Status.READY) {
      logger.warn(() => 'Book media is not ready, cannot get pages')
      throw new MediaNotReadyException()
    }

    if (number > book.media.pageCount || number <= 0) {
      logger.error(() => `Page number #${number} is out of bounds. Book has ${book.media.pageCount} pages`)
      throw new IndexOutOfBoundsException(`Page ${number} does not exist`)
    }

    return this.pdfExtractor.getPageContentAsPdf(book.book.path, number)
  }

  // @Throws(MediaNotReadyException::class)
  getFileContent(book: BookWithMedia, fileName: string): Uint8Array {
    logger.debug(() => `Get file ${fileName} for book: ${book}`)

    if (book.media.status !== Media.Status.READY) {
      logger.warn(() => 'Book media is not ready, cannot get files')
      throw new MediaNotReadyException()
    }

    switch (book.media.profile) {
      case MediaProfile.DIVINA:
        return getValue(this.divinaExtractors, nn(book.media.mediaType)).getEntryStream(book.book.path, fileName)
      case MediaProfile.EPUB:
        return this.epubExtractor.getEntryStream(book.book.path, fileName)
      case MediaProfile.PDF:
      case null:
        throw new MediaUnsupportedException('Extractor does not support extraction of files')
    }
    throw new MediaUnsupportedException('Extractor does not support extraction of files')
  }

  /**
   * Will hash the first and last pages of the given book.
   * The number of pages hashed from start/end is configurable.
   *
   * See [org.gotson.komga.infrastructure.configuration.KomgaProperties.pageHashing]
   */
  // PORT: async (hashPage)
  async hashPages(book: BookWithMedia): Promise<Media> {
    const hashedPages: BookPage[] = []
    for (const [index, bookPage] of book.media.pages.entries()) {
      if (isBlank(bookPage.fileHash) && (index < this.pageHashing || index >= book.media.pageCount - this.pageHashing)) {
        const content = this.getPageContent(book, index + 1)
        const hash = await this.hashPage(bookPage, content)
        hashedPages.push(bookPage.copy({ fileHash: hash }))
      } else {
        hashedPages.push(bookPage)
      }
    }

    return book.media.copy({ pages: hashedPages })
  }

  /**
   * Hash a single page, using the file content for hashing.
   *
   * For JPEG, the image is read/written to remove the metadata.
   */
  // PORT: async (décodage/encodage JPEG : port/imageio-codecs.ts)
  async hashPage(page: BookPage, content: Uint8Array): Promise<string> {
    const bytes =
      page.mediaType === ImageType.JPEG.mediaType
        ? // JPEG could contain different EXIF data, reading and writing back the image will get rid of it
          await useAsync(new ByteArrayOutputStream(), async (buffer) => {
            // PORT: ImageIO.write(null, ...) lève IllegalArgumentException sur la JVM
            await ImageIO.write(nnArg(await ImageIO.read(new ByteArrayInputStream(content))), ImageType.JPEG.imageIOFormat, buffer)
            return buffer.toByteArray()
          })
        : content

    return this.hasher.computeHash(new ByteArrayInputStream(bytes))
  }

  getPdfPagesDynamic(media: Media): BookPage[] {
    if (media.profile !== MediaProfile.PDF) throw new MediaUnsupportedException('Cannot get synthetic pages for non-PDF media')

    return media.pages.map((page) =>
      page.copy({
        mediaType: this.pdfImageType.mediaType,
        dimension: page.dimension !== null ? this.pdfExtractor.scaleDimension(page.dimension) : null,
      }),
    )
  }
}

/** `use { }` sur une ressource fermable, bloc asynchrone */
async function useAsync<C extends { close(): void }, R>(c: C, block: (c: C) => Promise<R>): Promise<R> {
  try {
    return await block(c)
  } finally {
    c.close()
  }
}

/** ImageIO.write(null, ...) : IllegalArgumentException("image == null!") */
function nnArg<T>(v: T | null): T {
  if (v === null) throw new IllegalArgumentException('image == null!')
  return v
}

/** `Map.getValue(key)` : NoSuchElementException si la clé est absente */
function getValue<K, V>(map: Map<K, V>, key: K): V {
  if (!map.has(key)) throw new NoSuchElementException(`Key ${key} is missing in the map.`)
  return map.get(key) as V
}

// @Service
component(BookAnalyzer, {
  // PORT: constructeur privé de l'enum ImageType : conversion explicite en jeton d'injection
  inject: [
    ContentDetector,
    { list: DivinaExtractor },
    PdfExtractor,
    EpubExtractor,
    ImageConverter,
    ImageAnalyzer,
    Hasher,
    { expression: (ctx) => ctx.getBean(KomgaProperties).pageHashing },
    KomgaSettingsProvider,
    { type: ImageType as unknown as Token, qualifier: 'thumbnailType' },
    { type: ImageType as unknown as Token, qualifier: 'pdfImageType' },
  ],
})
