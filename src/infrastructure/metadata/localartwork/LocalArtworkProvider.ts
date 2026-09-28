// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/localartwork/LocalArtworkProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { opendirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Book } from '../../../domain/model/Book.js'
import { Dimension } from '../../../domain/model/Dimension.js'
import type { Series } from '../../../domain/model/Series.js'
import { Sidecar } from '../../../domain/model/Sidecar.js'
import { ThumbnailBook } from '../../../domain/model/ThumbnailBook.js'
import { ThumbnailSeries } from '../../../domain/model/ThumbnailSeries.js'
import { FilenameUtils } from '../../../port/commons-io.js'
import { FileInputStream, use } from '../../../port/java-io.js'
import { pathToUrl } from '../../../port/java-net.js'
import { str } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
import { ImageAnalyzer } from '../../image/ImageAnalyzer.js'
import { ContentDetector } from '../../mediacontainer/ContentDetector.js'
import { SidecarBookConsumer } from '../../sidecar/SidecarBookConsumer.js'
import { SidecarSeriesConsumer } from '../../sidecar/SidecarSeriesConsumer.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.metadata.localartwork.LocalArtworkProvider')

// PORT: Regex.escape (Pattern.quote) -> échappement des caractères spéciaux de RegExp
function regexEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

// PORT: RegexOption.IGNORE_CASE (CASE_INSENSITIVE | UNICODE_CASE) -> drapeaux 'iu' ; Regex.matches() -> ancrage ^(?:...)$
function kotlinRegex(pattern: string): RegExp {
  return new RegExp(`^(?:${pattern})$`, 'iu')
}

/** `Path.nameWithoutExtension` */
function nameWithoutExtension(path: string): string {
  const name = basename(path)
  const i = name.lastIndexOf('.')
  return i === -1 ? name : name.substring(0, i)
}

/** `Path.extension` */
function extension(path: string): string {
  const name = basename(path)
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.substring(i + 1)
}

/** `Files.list(dir)` : ordre de readdir, comme le DirectoryStream de la JVM */
function listDirectory(dir: string): string[] {
  const d = opendirSync(dir)
  const out: string[] = []
  try {
    for (let e = d.readSync(); e !== null; e = d.readSync()) out.push(join(dir, e.name))
  } finally {
    d.closeSync()
  }
  return out
}

/** `Files.isRegularFile(path)` (suit les liens) */
function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export class LocalArtworkProvider implements SidecarSeriesConsumer, SidecarBookConsumer {
  constructor(
    private readonly contentDetector: ContentDetector,
    private readonly imageAnalyzer: ImageAnalyzer,
  ) {}

  readonly supportedExtensions = ['png', 'jpeg', 'jpg', 'tbn', 'webp', 'gif']
  readonly supportedSeriesFiles = ['cover', 'default', 'folder', 'poster', 'series']

  getBookThumbnails(book: Book): ThumbnailBook[] {
    logger.info(() => `Looking for local thumbnails for book: ${str(book)}`)
    const bookPath = book.path
    const baseName = nameWithoutExtension(bookPath)

    const regex = kotlinRegex(`${regexEscape(baseName)}(-\\d+)?`)

    return listDirectory(dirname(bookPath))
      .filter((it) => isRegularFile(it))
      .filter((it) => regex.test(nameWithoutExtension(it)))
      .filter((it) => this.supportedExtensions.includes(extension(it).toLowerCase()))
      .filter((it) => this.contentDetector.isImage(this.contentDetector.detectMediaType(it)))
      .map((path, index) => {
        logger.info(() => `Found file: ${path}`)
        return new ThumbnailBook({
          url: pathToUrl(path),
          type: ThumbnailBook.Type.SIDECAR,
          bookId: book.id,
          selected: index === 0,
          fileSize: statSync(path).size,
          mediaType: this.contentDetector.detectMediaType(path),
          // PORT: path.inputStream() n'est pas fermé en Kotlin (fermé par le GC) ; fermé ici
          dimension: use(new FileInputStream(path), (it) => this.imageAnalyzer.getDimension(it)) ?? new Dimension({ width: 0, height: 0 }),
        })
      })
  }

  getSeriesThumbnails(series: Series): ThumbnailSeries[] {
    if (series.oneshot) {
      logger.debug(() => 'Disabled for oneshot series, skipping')
      return []
    }

    logger.info(() => `Looking for local thumbnails for series: ${str(series)}`)

    return listDirectory(series.path)
      .filter((it) => isRegularFile(it))
      .filter((it) => this.supportedSeriesFiles.includes(nameWithoutExtension(it).toLowerCase()))
      .filter((it) => this.supportedExtensions.includes(extension(it).toLowerCase()))
      .filter((it) => this.contentDetector.isImage(this.contentDetector.detectMediaType(it)))
      .map((path, index) => {
        logger.info(() => `Found file: ${path}`)
        return new ThumbnailSeries({
          url: pathToUrl(path),
          seriesId: series.id,
          selected: index === 0,
          type: ThumbnailSeries.Type.SIDECAR,
          fileSize: statSync(path).size,
          mediaType: this.contentDetector.detectMediaType(path),
          // PORT: path.inputStream() n'est pas fermé en Kotlin (fermé par le GC) ; fermé ici
          dimension: use(new FileInputStream(path), (it) => this.imageAnalyzer.getDimension(it)) ?? new Dimension({ width: 0, height: 0 }),
        })
      })
  }

  getSidecarBookType(): Sidecar.Type {
    return Sidecar.Type.ARTWORK
  }

  getSidecarBookPrefilter(): RegExp[] {
    return this.supportedExtensions.map((ext) => kotlinRegex(`.*(-\\d+)?\\.${ext}`))
  }

  isSidecarBookMatch(basename: string, sidecar: string): boolean {
    return kotlinRegex(`${regexEscape(basename)}(-\\d+)?`).test(FilenameUtils.getBaseName(sidecar))
  }

  getSidecarSeriesType(): Sidecar.Type {
    return Sidecar.Type.ARTWORK
  }

  getSidecarSeriesFilenames(): string[] {
    return this.supportedSeriesFiles.flatMap((filename) => this.supportedExtensions.map((ext) => `${filename}.${ext}`))
  }
}

// @Service
component(LocalArtworkProvider, { inject: [ContentDetector, ImageAnalyzer], types: [SidecarSeriesConsumer, SidecarBookConsumer] })
