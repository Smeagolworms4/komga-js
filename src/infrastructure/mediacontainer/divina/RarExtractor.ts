// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/divina/RarExtractor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { MediaContainerEntry } from '../../../domain/model/MediaContainerEntry.js'
import { MediaType } from '../../../domain/model/MediaType.js'
import { MediaUnsupportedException } from '../../../domain/model/Exceptions.js'
import { cooperativeYield } from '../../../port/async-io.js'
import { ByteArrayInputStream, use, useAsync } from '../../../port/java-io.js'
import { Archive, WrongPasswordException } from '../../../port/junrar.js'
import { KotlinLogging } from '../../../port/logging.js'
import { CaseInsensitiveSimpleNaturalComparator } from '../../../port/natsort.js'
import { component } from '../../../port/spring.js'
import { ImageAnalyzer } from '../../image/ImageAnalyzer.js'
import { ContentDetector } from '../ContentDetector.js'
import { DivinaExtractor } from './DivinaExtractor.js'
import { messageOf } from './ZipExtractor.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.mediacontainer.divina.RarExtractor')

export class RarExtractor extends DivinaExtractor {
  private readonly natSortComparator: (a: string, b: string) => number = CaseInsensitiveSimpleNaturalComparator.getInstance()

  constructor(
    private readonly contentDetector: ContentDetector,
    private readonly imageAnalyzer: ImageAnalyzer,
  ) {
    super()
  }

  mediaTypes(): string[] {
    return [MediaType.RAR_GENERIC.type, MediaType.RAR_4.type, MediaType.RAR_5.type]
  }

  // PORT: async (passage coopératif entre deux entrées : décompression en JS)
  async getEntries(path: string, analyzeDimensions: boolean): Promise<MediaContainerEntry[]> {
    try {
      return await useAsync(new Archive(path), async (rar) => {
        if (rar.isPasswordProtected) throw new MediaUnsupportedException('Encrypted RAR archives are not supported', 'ERR_1002')
        if (rar.mainHeader?.isMultiVolume === true) throw new MediaUnsupportedException('Multi-Volume RAR archives are not supported', 'ERR_1004')
        // PORT: map -> boucle (passage coopératif avant chaque entrée)
        const entries: MediaContainerEntry[] = []
        for (const entry of rar.fileHeaders.filter((it) => !it.isDirectory)) {
          await cooperativeYield()
          entries.push(
            (() => {
              try {
                const buffer = use(rar.getInputStream(entry), (it) => it.readBytes())
                const mediaType = use(new ByteArrayInputStream(buffer), (it) => this.contentDetector.detectMediaType(it))
                const dimension = analyzeDimensions && this.contentDetector.isImage(mediaType) ? use(new ByteArrayInputStream(buffer), (it) => this.imageAnalyzer.getDimension(it)) : null
                const fileSize = entry.fullUnpackSize
                return new MediaContainerEntry({ name: entry.fileName, mediaType: mediaType, dimension: dimension, fileSize: fileSize })
              } catch (e) {
                logger.warn(e as Error, () => `Could not analyze entry: ${entry.fileName}`)
                return new MediaContainerEntry({ name: entry.fileName, comment: messageOf(e) })
              }
            })(),
          )
        }
        return entries.sort((a, b) => this.natSortComparator(a.name, b.name))
      })
    } catch (e) {
      if (e instanceof WrongPasswordException) throw new MediaUnsupportedException('Encrypted RAR archives are not supported', 'ERR_1002')
      throw e
    }
  }

  // PORT: async (signature de DivinaExtractor ; décompression synchrone en JS)
  async getEntryStream(path: string, entryName: string): Promise<Uint8Array> {
    return use(new Archive(path), (rar) => {
      const header = rar.fileHeaders.find((it) => it.fileName === entryName)
      return use(rar.getInputStream(header), (it) => it.readBytes())
    })
  }
}

// @Service
component(RarExtractor, { inject: [ContentDetector, ImageAnalyzer], types: [DivinaExtractor] })
