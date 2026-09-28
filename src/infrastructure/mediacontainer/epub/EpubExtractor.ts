// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/EpubExtractor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { unlinkSync } from 'node:fs'
import type { Book } from '../../../domain/model/Book.js'
import { BookPage } from '../../../domain/model/BookPage.js'
import type { EpubTocEntry } from '../../../domain/model/EpubTocEntry.js'
import { MediaFile } from '../../../domain/model/MediaFile.js'
import { R2Locator } from '../../../domain/model/R2Locator.js'
import { TypedBytes } from '../../../domain/model/TypedBytes.js'
import { ArchiveEntry } from '../../../port/commons-compress.js'
import { use } from '../../../port/java-io.js'
import { urlDecode } from '../../../port/java-net-urldecoder.js'
import { deleteIfExists, pathNormalize, pathParent, pathResolve } from '../../../port/java-nio-file.js'
import { Jsoup, Parser } from '../../../port/jsoup.js'
import { IllegalStateException, distinct, eq, firstOrNull, isNotBlank, kFloat, mapNotNull, minByOrNull, nn, sumOf } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { ImageAnalyzer } from '../../image/ImageAnalyzer.js'
import { KepubConverter } from '../../kobo/KepubConverter.js'
import { getEntryBytes, getEntryInputStream, getZipEntryBytes } from '../../util/ZipFileUtils.js'
import { ContentDetector } from '../ContentDetector.js'
import { type EpubPackage, epub } from './Epub.js'
import { Epub2Nav } from './Epub2Nav.js'
import { Epub3Nav } from './Epub3Nav.js'
import { getNavResource, processNav } from './Nav.js'
import { getNcxResource, processNcx } from './Ncx.js'
import { normalizeHref, processOpfGuide } from './Opf.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.mediacontainer.epub.EpubExtractor')

/** `File.deleteOnExit()` */
const deleteOnExitPaths = new Set<string>()
function deleteOnExit(path: string): void {
  if (deleteOnExitPaths.size === 0)
    process.on('exit', () => {
      for (const p of deleteOnExitPaths)
        try {
          unlinkSync(p)
        } catch {
          // déjà supprimé
        }
    })
  deleteOnExitPaths.add(path)
}

export class EpubExtractor {
  constructor(
    private readonly contentDetector: ContentDetector,
    private readonly imageAnalyzer: ImageAnalyzer,
    private readonly kepubConverter: KepubConverter,
    private readonly letterCountThreshold: number,
  ) {}

  /**
   * Retrieves a specific entry by name from the zip archive
   */
  getEntryStream(path: string, entryName: string): Uint8Array {
    return getZipEntryBytes(path, entryName)
  }

  isEpub(path: string): boolean {
    try {
      return new TextDecoder().decode(this.getEntryStream(path, 'mimetype')).trim() === 'application/epub+zip'
    } catch {
      return false
    }
  }

  /**
   * Retrieves the book cover along with its mediaType from the epub 2/3 manifest
   */
  getCover(path: string): TypedBytes | null {
    return epub(path, ({ zip, opfDoc, opfDir, manifest }) => {
      const coverManifestItem =
        // EPUB 3 - try to get cover from manifest properties 'cover-image'
        firstOrNull(manifest.values(), (it) => it.properties.has('cover-image')) ??
        // EPUB 2 - get cover from meta element with name="cover"
        ((): ReturnType<typeof manifest.get> | null => {
          const content = opfDoc.selectFirst('*|metadata > *|meta[name=cover]')?.attr('content') ?? null
          const id = content !== null && isNotBlank(content) ? content : null
          return id !== null ? (manifest.get(id) ?? null) : null
        })() ??
        // try id="cover-image"
        firstOrNull(manifest.values(), (it) => it.id === 'cover-image')
      if (coverManifestItem !== null && coverManifestItem !== undefined) {
        const href = urlDecode(coverManifestItem.href)
        const mediaType = coverManifestItem.mediaType
        const coverPath = normalizeHref(opfDir, href)
        const coverBytes = getEntryBytes(zip, coverPath)
        return coverBytes !== null ? new TypedBytes({ bytes: coverBytes, mediaType: mediaType }) : null
      } else {
        return null
      }
    })
  }

  getResources(epub: EpubPackage): MediaFile[] {
    const spine = mapNotNull(
      epub.opfDoc.select('*|spine > *|itemref').map((it) => it.attr('idref')),
      (it) => epub.manifest.get(it) ?? null,
    )

    const pages = spine.map(
      (page) =>
        new MediaFile({
          fileName: normalizeHref(epub.opfDir, urlDecode(page.href)),
          mediaType: page.mediaType,
          subType: MediaFile.SubType.EPUB_PAGE,
        }),
    )

    const assets = [...epub.manifest.values()]
      .filter((it) => !spine.some((s) => eq(s, it)))
      .map(
        (it) =>
          new MediaFile({
            fileName: normalizeHref(epub.opfDir, urlDecode(it.href)),
            mediaType: it.mediaType,
            subType: MediaFile.SubType.EPUB_ASSET,
          }),
      )

    const zipEntries = epub.zip.getEntries()
    return [...pages, ...assets].map((resource) => {
      const entry = firstOrNull(zipEntries, (it) => it.getName() === resource.fileName)
      return resource.copy({ fileSize: entry !== null ? (entry.getSize() === ArchiveEntry.SIZE_UNKNOWN ? null : entry.getSize()) : null })
    })
  }

  getDivinaPages(epub: EpubPackage, analyzeDimensions: boolean): BookPage[] {
    const pageCount = (() => {
      const spine = mapNotNull(
        epub.opfDoc.select('*|spine > *|itemref').map((it) => it.attr('idref')),
        (idref) => {
          const href = epub.manifest.get(idref)?.href
          return href !== undefined ? normalizeHref(epub.opfDir, href) : null
        },
      )

      return epub.zip.getEntries().filter((it) => spine.includes(it.getName())).length
    })()

    const pagesWithImages: string[][] = []
    for (const [pagePath, mediaType] of mapNotNull(
      epub.opfDoc.select('*|spine > *|itemref').map((it) => it.attr('idref')),
      (idref): [string, string] | null => {
        const manifestItem = epub.manifest.get(idref)
        if (manifestItem === undefined) return null
        return [normalizeHref(epub.opfDir, manifestItem.href), manifestItem.mediaType]
      },
    )) {
      if (mediaType.toLowerCase().startsWith('image')) {
        // image in spine
        pagesWithImages.push([pathNormalize(pagePath)])
      } else {
        const stream = getEntryInputStream(epub.zip, pagePath)
        const doc = stream !== null ? use(stream, (it) => Jsoup.parse(it, null, '', Parser.xmlParser())) : null
        if (doc === null) {
          pagesWithImages.push([])
          continue
        }

        // if a page has text over the threshold then the book is not divina compatible
        if (doc.body().text().length > this.letterCountThreshold) return []

        const img = doc.getElementsByTag('img').map((it) => it.attr('src')) // get the src, which can be a relative path

        const svg = doc.select('svg > image[xlink:href]').map((it) => it.attr('xlink:href')) // get the source, which can be a relative path

        pagesWithImages.push([...img, ...svg].map((it) => pathNormalize(pathResolve(pathParent(pagePath) ?? '', it)))) // resolve it against the page folder
      }
    }

    if (pagesWithImages.length !== pageCount) {
      logger.info(() => `Epub Divina detection failed: book has ${pagesWithImages.length} pages with images, but ${pageCount} total pages`)
      return []
    }
    // Only keep unique image path for each page. KCC sometimes generates HTML pages with 5 times the same image.
    const imagesPath = pagesWithImages.flatMap((it) => distinct(it))
    if (imagesPath.length !== pageCount) {
      logger.info(() => `Epub Divina detection failed: book has ${imagesPath.length} detected images, but ${pageCount} total pages`)
      return []
    }

    const divinaPages = mapNotNull(imagesPath, (imagePath) => {
      const mediaType = firstOrNull(epub.manifest.values(), (it) => normalizeHref(epub.opfDir, it.href) === imagePath)?.mediaType ?? null
      if (mediaType === null) return null
      const zipEntry = epub.zip.getEntry(imagePath)
      if (!this.contentDetector.isImage(mediaType)) return null

      // PORT: une entrée absente donne une NullPointerException en Kotlin (type plateforme)
      const dimension = analyzeDimensions ? use(epub.zip.getInputStream(nn(zipEntry)), (it) => this.imageAnalyzer.getDimension(it)) : null
      const fileSize = nn(zipEntry).getSize() === ArchiveEntry.SIZE_UNKNOWN ? null : nn(zipEntry).getSize()
      return new BookPage({ fileName: imagePath, mediaType: mediaType, dimension: dimension, fileSize: fileSize })
    })

    if (divinaPages.length !== pageCount) {
      logger.info(() => `Epub Divina detection failed: book has ${divinaPages.length} detected divina pages, but ${pageCount} total pages`)
      return []
    }
    return divinaPages
  }

  isKepub(epub: EpubPackage, resources: MediaFile[]): boolean {
    try {
      const readingOrder = resources.filter((it) => it.subType === MediaFile.SubType.EPUB_PAGE)

      for (const mediaFile of readingOrder) {
        const stream = getEntryInputStream(epub.zip, mediaFile.fileName)
        const doc = stream !== null ? use(stream, (it) => Jsoup.parse(it, null, '')) : null
        const spans = doc?.getElementsByClass('koboSpan') ?? null
        if (!(spans === null || spans.length === 0)) return true
      }
    } catch (e) {
      logger.warn(e as Error, () => 'Error while checking if EPUB is KEPUB')
    }
    return false
  }

  /**
   * Computes an approximate page count using the Readium method,
   * which counts 1 page for every 1024 bytes of compressed data for each resource.
   */
  computePageCount(epub: EpubPackage): number {
    const spine = mapNotNull(
      epub.opfDoc.select('*|spine > *|itemref').map((it) => it.attr('idref')),
      (idref) => {
        const href = epub.manifest.get(idref)?.href
        return href !== undefined ? normalizeHref(epub.opfDir, href) : null
      },
    )

    return sumOf(
      epub.zip.getEntries().filter((it) => spine.includes(it.getName())),
      (it) => Math.trunc(Math.ceil(it.getCompressedSize() / 1024.0)),
    )
  }

  isFixedLayout(epub: EpubPackage): boolean {
    return (
      epub.opfDoc.selectFirst('*|metadata > *|meta[property=rendition:layout]')?.text() === 'pre-paginated' ||
      epub.opfDoc.selectFirst('*|metadata > *|meta[name=fixed-layout]')?.attr('content') === 'true'
    )
  }

  computePositions(epub: EpubPackage, book: Book, resources: MediaFile[], isFixedLayout: boolean, isKepub: boolean): R2Locator[] {
    const readingOrder = resources.filter((it) => it.subType === MediaFile.SubType.EPUB_PAGE)

    let startPosition = 1

    let koboPositions: Map<string, [string, number][] | null>
    if (isFixedLayout) koboPositions = new Map()
    else if (isKepub)
      koboPositions = this.computePositionsFromKoboSpan(readingOrder, (filename) => {
        const stream = getEntryInputStream(epub.zip, filename)
        return stream !== null ? use(stream, (it) => new TextDecoder().decode(it.readBytes())) : null
      })
    else if (this.kepubConverter.isAvailable) {
      try {
        const kepub = this.kepubConverter.convertEpubToKepubWithoutChecks(book)
        if (kepub !== null) deleteOnExit(kepub)
        // if the conversion failed, throw an exception that will be caught in the catch block
        if (kepub === null) throw new IllegalStateException()
        const positions = this.computePositionsFromKoboSpan(readingOrder, (filename) => new TextDecoder().decode(getZipEntryBytes(kepub, filename)))
        deleteIfExists(kepub)
        koboPositions = positions
      } catch {
        logger.warn(() => `Could not convert to Kepub to compute positions: ${book}`)
        koboPositions = new Map()
      }
    } else koboPositions = new Map()

    let positions: R2Locator[]
    if (isFixedLayout) {
      // for fixed-layout book we create 1 position per page
      positions = readingOrder.map(
        (it) =>
          new R2Locator({
            href: it.fileName,
            type: it.mediaType ?? 'application/octet-stream',
            koboSpan: 'kobo.1.1',
            locations: new R2Locator.Location({ progression: 0, position: startPosition++ }),
          }),
      )
    } else {
      // this is the Readium algorithm
      // we create 1 position every 1024 bytes
      positions = readingOrder.flatMap((file) => {
        const positionCount = Math.max(1, Math.round(Math.ceil((file.fileSize ?? 0) / 1024.0)))
        return Array.from({ length: positionCount }, (_, p) => {
          const progression = kFloat(p / positionCount)
          const koboSpan =
            positionCount === 1 || p === 0
              ? 'kobo.1.1'
              : (() => {
                  const spans = koboPositions.get(file.fileName) ?? null
                  return spans !== null ? (minByOrNull(spans, (it) => Math.fround(Math.abs(Math.fround(progression - it[1]))))?.[0] ?? null) : null
                })()

          return new R2Locator({
            href: file.fileName,
            type: file.mediaType ?? 'application/octet-stream',
            locations: new R2Locator.Location({ progression: progression, position: startPosition++ }),
            koboSpan: koboSpan,
          })
        })
      })
    }

    // finally we compute the total progression for each position
    return positions.map((locator) => {
      const position = locator.locations?.position ?? null
      const totalProgression = position !== null ? kFloat(position / positions.length) : null
      return locator.copy({ locations: locator.locations !== null ? locator.locations.copy({ totalProgression: totalProgression }) : null })
    })
  }

  /**
   * Builds the positions for a KEPUB book, based on koboSpan tags.
   * @return a [Map] where the key is the resource name, and the value is a [List] of [Pair] containing the koboSpan ID and the progression as a Float between 0 and 1.
   */
  private computePositionsFromKoboSpan(readingOrder: MediaFile[], resourceSupplier: (name: string) => string | null): Map<string, [string, number][] | null> {
    return new Map(
      readingOrder.map((file) => {
        const resource = resourceSupplier(file.fileName)
        const doc = resource !== null ? Jsoup.parse(resource, Parser.htmlParser().setTrackPosition(true)) : null
        return [
          file.fileName,
          doc !== null
            ? mapNotNull(doc.select('span.koboSpan'), (koboSpan): [string, number] | null => {
                const id = koboSpan.id()
                if (isNotBlank(id)) {
                  // progression is built from the position in the file of each koboSpan, divided by the file size
                  const progression = Math.fround(Math.fround(koboSpan.sourceRange().endPos()) / Math.fround(nn(file.fileSize)))
                  return [id, progression]
                } else {
                  return null
                }
              })
            : null,
        ] as [string, [string, number][] | null]
      }),
    )
  }

  getToc(epub: EpubPackage): EpubTocEntry[] {
    // Epub 3
    const nav = getNavResource(epub)
    const navToc = nav !== null ? processNav(nav, Epub3Nav.TOC) : null
    if (navToc !== null && navToc.length > 0) return navToc

    // Epub 2
    const ncx = getNcxResource(epub)
    if (ncx !== null) return processNcx(ncx, Epub2Nav.TOC)
    return []
  }

  getPageList(epub: EpubPackage): EpubTocEntry[] {
    // Epub 3
    const nav = getNavResource(epub)
    const navPageList = nav !== null ? processNav(nav, Epub3Nav.PAGELIST) : null
    if (navPageList !== null && navPageList.length > 0) return navPageList

    // Epub 2
    const ncx = getNcxResource(epub)
    if (ncx !== null) return processNcx(ncx, Epub2Nav.PAGELIST)
    return []
  }

  getLandmarks(epub: EpubPackage): EpubTocEntry[] {
    // Epub 3
    const nav = getNavResource(epub)
    const navLandmarks = nav !== null ? processNav(nav, Epub3Nav.LANDMARKS) : null
    if (navLandmarks !== null && navLandmarks.length > 0) return navLandmarks

    // Epub 2
    return processOpfGuide(epub.opfDoc, epub.opfDir)
  }
}

// @Service
component(EpubExtractor, {
  inject: [ContentDetector, ImageAnalyzer, KepubConverter, { expression: (ctx) => ctx.getBean(KomgaProperties).epubDivinaLetterCountThreshold }],
})
