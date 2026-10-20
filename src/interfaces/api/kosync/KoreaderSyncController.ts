// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kosync/KoreaderSyncController.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { BookWithMedia } from '../../../domain/model/BookWithMedia.js'
import { MediaExtensionEpub } from '../../../domain/model/MediaExtension.js'
import { MediaProfile } from '../../../domain/model/MediaProfile.js'
import { BookRepository } from '../../../domain/persistence/BookRepository.js'
import { MediaRepository } from '../../../domain/persistence/MediaRepository.js'
import { ReadProgressRepository } from '../../../domain/persistence/ReadProgressRepository.js'
import { BookLifecycle } from '../../../domain/service/BookLifecycle.js'
import { KoreaderProgressConverter } from '../../../infrastructure/koreader/KoreaderProgressConverter.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { groupBy, kFloat } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { HttpStatus, MediaType, type ResponseEntity, ResponseStatusException, authenticationPrincipal, pathVariable, requestBody, restController } from '../../../port/spring-web.js'
import { DocumentProgressDto } from './dto/DocumentProgressDto.js'
import { UserAuthenticationDto } from './dto/UserAuthenticationDto.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.api.kosync.KoreaderSyncController')

export class KoreaderSyncController {
  constructor(
    private readonly bookRepository: BookRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly readProgressRepository: ReadProgressRepository,
    private readonly bookLifecycle: BookLifecycle,
    private readonly koreaderProgressConverter: KoreaderProgressConverter,
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

    const r2Progression =
      this.koreaderProgressConverter.convertKoreaderProgressToR2(koreaderProgress, new BookWithMedia({ book: book, media: media })) ??
      (() => {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST)
      })()

    this.bookLifecycle.markProgression(book, principal.user, r2Progression)
  }
}

// @RestController
restController(KoreaderSyncController, {
  inject: [BookRepository, MediaRepository, ReadProgressRepository, BookLifecycle, KoreaderProgressConverter],
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
