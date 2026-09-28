// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kosync/KoreaderSyncController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ZonedDateTime } from '@js-joda/core'
import { MediaExtensionEpub } from '../../../domain/model/MediaExtension.js'
import { MediaProfile } from '../../../domain/model/MediaProfile.js'
import { R2Device } from '../../../domain/model/R2Device.js'
import { R2Locator } from '../../../domain/model/R2Locator.js'
import { R2Progression } from '../../../domain/model/R2Progression.js'
import { BookRepository } from '../../../domain/persistence/BookRepository.js'
import { MediaRepository } from '../../../domain/persistence/MediaRepository.js'
import { ReadProgressRepository } from '../../../domain/persistence/ReadProgressRepository.js'
import { BookLifecycle } from '../../../domain/service/BookLifecycle.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { IndexOutOfBoundsException, NumberFormatException, groupBy, kFloat } from '../../../port/kotlin.js'
import { toIntOrNull } from '../../../port/kotlin-numbers.js'
import { KotlinLogging } from '../../../port/logging.js'
import { HttpStatus, MediaType, type ResponseEntity, ResponseStatusException, authenticationPrincipal, pathVariable, requestBody, restController } from '../../../port/spring-web.js'
import { DocumentProgressDto } from './dto/DocumentProgressDto.js'
import { UserAuthenticationDto } from './dto/UserAuthenticationDto.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.api.kosync.KoreaderSyncController')

export class KoreaderSyncController {
  private readonly resourceRegex1 = /DocFragment\[(\d+)]/i
  private readonly resourceRegex2 = /#_doc_fragment_(\d+)_/i

  constructor(
    private readonly bookRepository: BookRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly readProgressRepository: ReadProgressRepository,
    private readonly bookLifecycle: BookLifecycle,
  ) {}

  registerUser(): ResponseEntity<string> {
    throw new ResponseStatusException(HttpStatus.FORBIDDEN, 'User creation is disabled')
  }

  authorize(): UserAuthenticationDto {
    return new UserAuthenticationDto()
  }

  getProgress(principal: KomgaPrincipal, bookHash: string): DocumentProgressDto {
    const books = this.bookRepository.findAllByHashKoreader(bookHash)
    if (books.length === 0) {
      logger.debug(() => `No book found with KOReader hash: ${bookHash}`)
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book not found')
    }
    if (books.length > 1) {
      logger.debug(() => `No unique book found with KOReader hash: ${bookHash}. Found ${books.length} books with the same hash.`)
      throw new ResponseStatusException(HttpStatus.CONFLICT, 'More than 1 book found with the same hash')
    }

    const book = books[0]!
    const media = this.mediaRepository.findById(book.id)

    const readProgress =
      this.readProgressRepository.findByBookIdAndUserIdOrNull(book.id, principal.user.id) ??
      (() => {
        throw new ResponseStatusException(HttpStatus.OK, 'No progress found for this book')
      })()

    const progressPercentage =
      readProgress.locator?.locations?.totalProgression ??
      // PORT: Float / Float -> arrondi float32
      kFloat(kFloat(readProgress.page) / kFloat(this.mediaRepository.findById(book.id).pageCount))

    let progress: string
    switch (media.profile) {
      case MediaProfile.DIVINA:
      case MediaProfile.PDF:
        progress = String(readProgress.page)
        break
      case MediaProfile.EPUB: {
        const ext = this.mediaRepository.findExtensionByIdOrNull(book.id)
        const extension =
          ext instanceof MediaExtensionEpub
            ? ext
            : (() => {
                const e = new ResponseStatusException(HttpStatus.BAD_REQUEST, 'Epub extension not found')
                logger.error(() => `Epub extension not found for book ${book.id}. Book should be re-analyzed.`)
                throw e
              })()

        // convert the href to its index for KOReader
        const resourceIndex = [...groupBy(extension.positions, (it) => it.href).keys()].indexOf(readProgress.locator?.href as string)

        // return a progress string that points to the beginning of the resource
        progress = `/body/DocFragment[${resourceIndex + 1}].0`
        break
      }

      case null:
      default:
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book has no media profile')
    }

    return new DocumentProgressDto({
      document: bookHash,
      percentage: progressPercentage,
      progress: progress,
      device: readProgress.deviceName,
      deviceId: readProgress.deviceId,
    })
  }

  updateProgress(principal: KomgaPrincipal, koreaderProgress: DocumentProgressDto): void {
    const books = this.bookRepository.findAllByHashKoreader(koreaderProgress.document)
    if (books.length === 0) {
      logger.debug(() => `No book found with KOReader hash: ${koreaderProgress.document}`)
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book not found')
    }
    if (books.length > 1) {
      logger.debug(() => `No unique book found with KOReader hash: ${koreaderProgress.document}. Found ${books.length} books with the same hash.`)
      throw new ResponseStatusException(HttpStatus.CONFLICT, 'More than 1 book found with the same hash')
    }

    const book = books[0]!
    const media = this.mediaRepository.findById(book.id)

    // convert the KOReader update request to an R2Progression
    let locator: R2Locator
    switch (media.profile) {
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
        const index1 = parseGroup(this.resourceRegex1, koreaderProgress.progress)
        const resourceIndex =
          // we try to parse the progress using the 2 possible formats
          // capturing group is at index 1, 0 is the full match
          // KOReader indexing starts at 1, not 0
          (index1 !== null ? index1 - 1 : null) ??
          // capturing group is at index 1, 0 is the full match
          parseGroup(this.resourceRegex2, koreaderProgress.progress) ??
          (() => {
            const e = new ResponseStatusException(HttpStatus.BAD_REQUEST, `Could not get Epub resource index from progress: ${koreaderProgress.progress}`)
            logger.error(() => `Could not get Epub resource index from progress: ${koreaderProgress.progress}`)
            throw e
          })()

        const ext = this.mediaRepository.findExtensionByIdOrNull(book.id)
        const extension =
          ext instanceof MediaExtensionEpub
            ? ext
            : (() => {
                const e = new ResponseStatusException(HttpStatus.BAD_REQUEST, 'Epub extension not found')
                logger.error(() => `Epub extension not found for book ${book.id}. Book should be re-analyzed.`)
                throw e
              })()

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
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book has no media profile')
    }

    const r2Progression = new R2Progression({
      device: new R2Device({
        id: koreaderProgress.deviceId,
        name: koreaderProgress.device,
      }),
      modified: ZonedDateTime.now(),
      locator: locator,
    })

    this.bookLifecycle.markProgression(book, principal.user, r2Progression)
  }
}

// PORT: Regex.find(..)?.groups?.get(1)?.value?.toIntOrNull()
function parseGroup(regex: RegExp, input: string): number | null {
  const m = regex.exec(input)
  const v = m?.[1]
  return v !== undefined ? toIntOrNull(v) : null
}

function throwNumberFormat(s: string): never {
  throw new NumberFormatException(`For input string: "${s}"`)
}

// @RestController
restController(KoreaderSyncController, {
  inject: [BookRepository, MediaRepository, ReadProgressRepository, BookLifecycle],
  javaName: 'org.gotson.komga.interfaces.api.kosync.KoreaderSyncController',
  requestMapping: { path: ['/koreader'], produces: [MediaType.APPLICATION_JSON_VALUE, 'application/vnd.koreader.v1+json'] },
  handlers: {
    registerUser: { mapping: { method: 'POST', path: ['users/create'] } },
    authorize: { mapping: { method: 'GET', path: ['users/auth'] } },
    getProgress: {
      mapping: { method: 'GET', path: ['syncs/progress/{bookHash}'] },
      args: [authenticationPrincipal(), pathVariable('bookHash')],
    },
    updateProgress: {
      mapping: { method: 'PUT', path: ['syncs/progress'] },
      args: [authenticationPrincipal(), requestBody({ class: DocumentProgressDto })],
    },
  },
})
