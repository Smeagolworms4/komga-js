// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/divina/ZipExtractor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { MediaContainerEntry } from '../../../domain/model/MediaContainerEntry.js'
import { MediaType } from '../../../domain/model/MediaType.js'
import { cooperativeYield } from '../../../port/async-io.js'
import { ArchiveEntry, ZipFile } from '../../../port/commons-compress.js'
import { BufferedInputStream, use } from '../../../port/java-io.js'
import { KotlinLogging } from '../../../port/logging.js'
import { CaseInsensitiveSimpleNaturalComparator } from '../../../port/natsort.js'
import { component } from '../../../port/spring.js'
import { NoClassDefFoundError } from '../../../port/zip.js'
import { ImageAnalyzer } from '../../image/ImageAnalyzer.js'
import { getZipEntryBytes, useAsync as useZipAsync } from '../../util/ZipFileUtils.js'
import { ContentDetector } from '../ContentDetector.js'
import { DivinaExtractor } from './DivinaExtractor.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.mediacontainer.divina.ZipExtractor')

/** PORT: octets lus d'avance au début de chaque entrée pour l'analyse (le reste éventuel est lu à la demande) */
const ZIP_ENTRY_PREFETCH = 16 * 1024

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

  // PORT: async : archive ouverte avec lecture anticipée, sur le pool de libuv, du répertoire central et du début de
  // chaque entrée (ZIP_ENTRY_PREFETCH octets : type et dimensions) ; passage coopératif avant chaque entrée
  async getEntries(path: string, analyzeDimensions: boolean): Promise<MediaContainerEntry[]> {
    return await useZipAsync(
      ZipFile.builder().setPath(path),
      async (zip) => {
        // PORT: map -> boucle (passage coopératif avant chaque entrée)
        const entries: MediaContainerEntry[] = []
        for (const entry of zip.getEntries().filter((it) => !it.isDirectory())) {
          await cooperativeYield()
          entries.push(
            (() => {
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
            })(),
          )
        }
        return entries.sort((a, b) => this.natSortComparator(a.name, b.name))
      },
      { entryBytes: ZIP_ENTRY_PREFETCH },
    )
  }

  // PORT: async (getZipEntryBytes)
  getEntryStream(path: string, entryName: string): Promise<Uint8Array> {
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
