// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/divina/ZipExtractor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { MediaContainerEntry } from '../../../domain/model/MediaContainerEntry.js'
import { MediaType } from '../../../domain/model/MediaType.js'
import { ArchiveEntry, ZipFile } from '../../../port/commons-compress.js'
import { BufferedInputStream, use } from '../../../port/java-io.js'
import { KotlinLogging } from '../../../port/logging.js'
import { CaseInsensitiveSimpleNaturalComparator } from '../../../port/natsort.js'
import { component } from '../../../port/spring.js'
import { NoClassDefFoundError } from '../../../port/zip.js'
import { ImageAnalyzer } from '../../image/ImageAnalyzer.js'
import { getZipEntryBytes, use as useZip } from '../../util/ZipFileUtils.js'
import { ContentDetector } from '../ContentDetector.js'
import { DivinaExtractor } from './DivinaExtractor.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.mediacontainer.divina.ZipExtractor')

export class ZipExtractor extends DivinaExtractor {
  private readonly natSortComparator: (a: string, b: string) => number = CaseInsensitiveSimpleNaturalComparator.getInstance()

  constructor(
    private readonly contentDetector: ContentDetector,
    private readonly imageAnalyzer: ImageAnalyzer,
  ) {
    super()
  }

  mediaTypes(): string[] {
    return [MediaType.ZIP.type]
  }

  getEntries(path: string, analyzeDimensions: boolean): MediaContainerEntry[] {
    return useZip(ZipFile.builder().setPath(path), (zip) =>
      zip
        .getEntries()
        .filter((it) => !it.isDirectory())
        .map((entry) => {
          try {
            return use(new BufferedInputStream(zip.getInputStream(entry)), (stream) => {
              const mediaType = this.contentDetector.detectMediaType(stream)
              const dimension = analyzeDimensions && this.contentDetector.isImage(mediaType) ? this.imageAnalyzer.getDimension(stream) : null
              const fileSize = entry.getSize() === ArchiveEntry.SIZE_UNKNOWN ? null : entry.getSize()
              return new MediaContainerEntry({ name: entry.getName(), mediaType: mediaType, dimension: dimension, fileSize: fileSize })
            })
          } catch (e) {
            // PORT: catch (e: Exception) : une erreur JVM (NoClassDefFoundError) n'est pas interceptée
            if (e instanceof NoClassDefFoundError) throw e
            logger.warn(e as Error, () => `Could not analyze entry: ${entry.getName()}`)
            return new MediaContainerEntry({ name: entry.getName(), comment: messageOf(e) })
          }
        })
        .sort((a, b) => this.natSortComparator(a.name, b.name)),
    )
  }

  getEntryStream(path: string, entryName: string): Uint8Array {
    return getZipEntryBytes(path, entryName)
  }
}

/** `Throwable.message` : null quand l'exception n'a pas de message */
export function messageOf(e: unknown): string | null {
  const m = (e as Error).message
  return m === undefined || m === '' ? null : m
}

// @Service
component(ZipExtractor, { inject: [ContentDetector, ImageAnalyzer], types: [DivinaExtractor] })
