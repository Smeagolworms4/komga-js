// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/koreader/KoreaderProgressConverter.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { ZonedDateTime } from '@js-joda/core'
import type { BookWithMedia } from '../../domain/model/BookWithMedia.js'
import { MediaExtensionEpub } from '../../domain/model/MediaExtension.js'
import { MediaProfile } from '../../domain/model/MediaProfile.js'
import { R2Device } from '../../domain/model/R2Device.js'
import { R2Locator } from '../../domain/model/R2Locator.js'
import { R2Progression } from '../../domain/model/R2Progression.js'
import { MediaRepository } from '../../domain/persistence/MediaRepository.js'
import type { DocumentProgressDto } from '../../interfaces/api/kosync/dto/DocumentProgressDto.js'
import { IndexOutOfBoundsException, NumberFormatException, groupBy } from '../../port/kotlin.js'
import { toIntOrNull } from '../../port/kotlin-numbers.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'
import { KoreaderUtils } from './KoreaderUtils.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.koreader.KoreaderProgressConverter')

export class KoreaderProgressConverter {
  constructor(private readonly mediaRepository: MediaRepository) {}

  // convert the KOReader update request to an R2Progression
  convertKoreaderProgressToR2(koreaderProgress: DocumentProgressDto, bookWithMedia: BookWithMedia): R2Progression | null {
    let locator: R2Locator
    switch (bookWithMedia.media.profile) {
      case MediaProfile.DIVINA:
      case MediaProfile.PDF:
        locator = new R2Locator({
          href: '',
          type: '',
          locations: new R2Locator.Location({
            // PORT: String.toInt() (NumberFormatException si invalide)
            position: toIntOrNull(koreaderProgress.progress) ?? throwNumberFormat(koreaderProgress.progress),
            totalProgression: koreaderProgress.percentage,
          }),
        })
        break

      case MediaProfile.EPUB: {
        const resourceIndex = KoreaderUtils.parseResourceIndexFromProgressString(koreaderProgress.progress)
        if (resourceIndex === null) {
          logger.error(() => `Could not get Epub resource index from progress: ${koreaderProgress.progress}`)
          return null
        }

        const extension = this.mediaRepository.findExtensionByIdOrNull(bookWithMedia.book.id)
        if (!(extension instanceof MediaExtensionEpub)) {
          logger.error(() => `Epub extension not found for book ${bookWithMedia.book.id}. Book should be re-analyzed.`)
          return null
        }

        // get the href from the index provided by KOReader
        const keys = [...groupBy(extension.positions, (it) => it.href).keys()]
        // PORT: elementAt (IndexOutOfBoundsException hors limites)
        if (resourceIndex < 0 || resourceIndex >= keys.length)
          throw new IndexOutOfBoundsException(`Collection doesn't contain element at index ${resourceIndex}.`)
        const href = keys[resourceIndex]!

        locator = new R2Locator({
          href: href,
          // assume default, will be overwritten by the correct type when saved
          type: 'application/xhtml+xml',
          locations: new R2Locator.Location({
            progression: 0,
            totalProgression: koreaderProgress.percentage,
          }),
        })
        break
      }

      case null:
      default:
        logger.error(() => 'Book has no media profile')
        return null
    }

    return new R2Progression({
      device: new R2Device({
        id: koreaderProgress.deviceId,
        name: koreaderProgress.device,
      }),
      modified: ZonedDateTime.now(),
      locator: locator,
    })
  }
}

function throwNumberFormat(s: string): never {
  throw new NumberFormatException(`For input string: "${s}"`)
}

// @Component
component(KoreaderProgressConverter, { inject: [MediaRepository] })
