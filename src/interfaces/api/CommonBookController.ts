// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/CommonBookController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Book } from '../../domain/model/Book.js'
import { BookWithMedia } from '../../domain/model/BookWithMedia.js'
import { EntryNotFoundException, ImageConversionException, MediaNotReadyException, MediaUnsupportedException } from '../../domain/model/Exceptions.js'
import type { Media } from '../../domain/model/Media.js'
import { MediaProfile } from '../../domain/model/MediaProfile.js'
import { MediaType as KomgaMediaType } from '../../domain/model/MediaType.js'
import { R2Progression, toR2Progression } from '../../domain/model/R2Progression.js'
import { BookRepository } from '../../domain/persistence/BookRepository.js'
import { MediaRepository } from '../../domain/persistence/MediaRepository.js'
import { ReadProgressRepository } from '../../domain/persistence/ReadProgressRepository.js'
import { SeriesMetadataRepository } from '../../domain/persistence/SeriesMetadataRepository.js'
import { BookAnalyzer } from '../../domain/service/BookAnalyzer.js'
import { BookLifecycle } from '../../domain/service/BookLifecycle.js'
import { ImageType } from '../../infrastructure/image/ImageType.js'
import { OpenApiConfiguration } from '../../infrastructure/openapi/OpenApiConfiguration.js'
import { ContentDetector } from '../../infrastructure/mediacontainer/ContentDetector.js'
import type { KomgaPrincipal } from '../../infrastructure/security/KomgaPrincipal.js'
import { getMediaTypeOrDefault } from '../../infrastructure/web/Utils.js'
import { FilenameUtils } from '../../port/commons-io.js'
import { JsonTypes } from '../../port/jackson-mapper.js'
import { FileNotFoundException } from '../../port/java-io.js'
import { NoSuchFileException as NioNoSuchFileException } from '../../port/java-nio-file.js'
import { IllegalArgumentException, IllegalStateException, IndexOutOfBoundsException, nn } from '../../port/kotlin.js'
import { NoSuchFileException } from '../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../port/logging.js'
import { ParsedMediaType, sortBySpecificity } from '../../port/media-type.js'
import type { HttpServletRequest } from '../../port/servlet.js'
import { FileSystemResource } from '../../port/spring-core-io.js'
import {
  HttpStatus,
  MediaType,
  ResponseEntity,
  ResponseStatusException,
  type StreamingResponseBody,
  authenticationPrincipal,
  contentDisposition,
  pathVariable,
  request as requestArg,
  requestBody,
  restController,
  streamingResponseBody,
  webRequest,
} from '../../port/spring-web.js'
import { ServletWebRequest } from '../../port/spring-web-filter.js'
import { OpenApiTypes } from '../../port/swagger-annotations.js'
import { MEDIATYPE_PROGRESSION_JSON_VALUE } from './dto/Constants.js'
import type { WPPublicationDto } from './dto/WepPub.js'
import { BookDtoRepository } from './persistence/BookDtoRepository.js'
import { ContentRestrictionChecker } from './ContentRestrictionChecker.js'
import { getBookLastModified, setNotModified } from './Utils.js'
import type { WebPubGenerator } from './WebPubGenerator.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.api.CommonBookController')
const FONT_EXTENSIONS = ['otf', 'woff', 'woff2', 'eot', 'ttf', 'svg']

// PORT: java.nio.file.NoSuchFileException existe en deux classes de support (port/kotlin-io-path, port/java-nio-file)
function isNoSuchFileException(ex: unknown): boolean {
  return ex instanceof NoSuchFileException || ex instanceof NioNoSuchFileException
}

// PORT: org.springframework.http.MediaType.APPLICATION_PDF / MediaType("image")
const APPLICATION_PDF = ParsedMediaType.parse(MediaType.APPLICATION_PDF_VALUE)
const IMAGE_ANY = new ParsedMediaType('image', '*')

export class CommonBookController {
  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly bookRepository: BookRepository,
    private readonly bookDtoRepository: BookDtoRepository,
    private readonly seriesMetadataRepository: SeriesMetadataRepository,
    private readonly bookLifecycle: BookLifecycle,
    private readonly bookAnalyzer: BookAnalyzer,
    private readonly contentRestrictionChecker: ContentRestrictionChecker,
    private readonly contentDetector: ContentDetector,
    private readonly readProgressRepository: ReadProgressRepository,
  ) {}

  getWebPubManifestInternal(principal: KomgaPrincipal, bookId: string, webPubGenerator: WebPubGenerator): WPPublicationDto {
    const media = this.mediaRepository.findByIdOrNull(bookId)
    if (media === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    switch (KomgaMediaType.fromMediaType(media.mediaType)?.profile ?? null) {
      case MediaProfile.DIVINA:
        return this.getWebPubManifestDivinaInternal(principal, bookId, webPubGenerator)
      case MediaProfile.PDF:
        return this.getWebPubManifestPdfInternal(principal, bookId, webPubGenerator)
      case MediaProfile.EPUB:
        return this.getWebPubManifestEpubInternal(principal, bookId, webPubGenerator)
      default:
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book analysis failed')
    }
  }

  getWebPubManifestEpubInternal(principal: KomgaPrincipal, bookId: string, webPubGenerator: WebPubGenerator): WPPublicationDto {
    const bookDto = this.bookDtoRepository.findByIdOrNull(bookId, principal.user.id)
    if (bookDto === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (bookDto.media.mediaProfile !== MediaProfile.EPUB.name) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, `Book media type '${bookDto.media.mediaType}' not compatible with requested profile`)
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookDto)
    return webPubGenerator.toManifestEpub(bookDto, this.mediaRepository.findById(bookId), this.seriesMetadataRepository.findById(bookDto.seriesId))
  }

  getWebPubManifestPdfInternal(principal: KomgaPrincipal, bookId: string, webPubGenerator: WebPubGenerator): WPPublicationDto {
    const bookDto = this.bookDtoRepository.findByIdOrNull(bookId, principal.user.id)
    if (bookDto === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (bookDto.media.mediaProfile !== MediaProfile.PDF.name) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, `Book media type '${bookDto.media.mediaType}' not compatible with requested profile`)
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookDto)
    return webPubGenerator.toManifestPdf(bookDto, this.mediaRepository.findById(bookDto.id), this.seriesMetadataRepository.findById(bookDto.seriesId))
  }

  getWebPubManifestDivinaInternal(principal: KomgaPrincipal, bookId: string, webPubGenerator: WebPubGenerator): WPPublicationDto {
    const bookDto = this.bookDtoRepository.findByIdOrNull(bookId, principal.user.id)
    if (bookDto === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookDto)
    return webPubGenerator.toManifestDivina(bookDto, this.mediaRepository.findById(bookDto.id), this.seriesMetadataRepository.findById(bookDto.seriesId))
  }

  // PORT: async (BookLifecycle.getBookPage) ; MutableList<MediaType> -> ParsedMediaType[]
  async getBookPageInternal(
    bookId: string,
    pageNumber: number,
    convertTo: string | null,
    request: ServletWebRequest,
    principal: KomgaPrincipal,
    acceptHeaders: ParsedMediaType[] | null,
  ): Promise<ResponseEntity<Uint8Array>> {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const media = this.mediaRepository.findById(bookId)
    if (request.checkNotModified(getBookLastModified(media))) {
      return setNotModified(ResponseEntity.status(HttpStatus.NOT_MODIFIED), media).body(new Uint8Array(0))
    }

    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    if (media.profile === MediaProfile.PDF && acceptHeaders !== null && acceptHeaders.some((it) => it.isCompatibleWith(APPLICATION_PDF))) {
      // keep only pdf and image
      const kept = acceptHeaders.filter((it) => !(!it.isCompatibleWith(APPLICATION_PDF) && !it.isCompatibleWith(IMAGE_ANY)))
      acceptHeaders.splice(0, acceptHeaders.length, ...kept)
      sortBySpecificity(acceptHeaders)
      if (nn(acceptHeaders[0]).isCompatibleWith(APPLICATION_PDF)) return this.getBookPageRawInternal(book, media, pageNumber)
    }

    try {
      const convertFormat = (() => {
        switch (convertTo?.toLowerCase() ?? null) {
          case 'jpeg':
            return ImageType.JPEG
          case 'png':
            return ImageType.PNG
          case '':
          case null:
            return null
          default:
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, `Invalid conversion format: ${convertTo}`)
        }
      })()

      const pageContent = await this.bookLifecycle.getBookPage(book, pageNumber, { convertTo: convertFormat })

      return setNotModified(
        ResponseEntity.ok()
          .headersFrom((it) => {
            const extension = this.contentDetector.mediaTypeToExtension(pageContent.mediaType) ?? 'jpeg'
            const imageFileName = `${book.name}-${pageNumber}${extension}`
            it.setContentDisposition(contentDisposition('inline', imageFileName, true))
          })
          .contentType(getMediaTypeOrDefault(pageContent.mediaType)),
        media,
      ).body(pageContent.bytes)
    } catch (ex) {
      if (ex instanceof IndexOutOfBoundsException) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'Page number does not exist')
      } else if (ex instanceof ImageConversionException) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, ex.message)
      } else if (ex instanceof MediaNotReadyException) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book analysis failed')
      } else if (isNoSuchFileException(ex)) {
        logger.warn(ex as Error, () => `File not found: ${book}`)
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'File not found, it may have moved')
      }
      throw ex
    }
  }

  getBookPageRawByNumber(principal: KomgaPrincipal, request: ServletWebRequest, bookId: string, pageNumber: number): ResponseEntity<Uint8Array> {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const media = this.mediaRepository.findById(bookId)
    if (request.checkNotModified(getBookLastModified(media))) {
      return setNotModified(ResponseEntity.status(HttpStatus.NOT_MODIFIED), media).body(new Uint8Array(0))
    }

    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    return this.getBookPageRawInternal(book, media, pageNumber)
  }

  getBookPageRawInternal(book: Book, media: Media, pageNumber: number): ResponseEntity<Uint8Array> {
    try {
      const pageContent = this.bookAnalyzer.getPageContentRaw(new BookWithMedia({ book: book, media: media }), pageNumber)

      return setNotModified(
        ResponseEntity.ok()
          .headersFrom((it) => {
            const extension = this.contentDetector.mediaTypeToExtension(pageContent.mediaType) ?? ''
            const pageFileName = `${book.name}-${pageNumber}${extension}`
            it.setContentDisposition(contentDisposition('inline', pageFileName, true))
          })
          .contentType(getMediaTypeOrDefault(pageContent.mediaType)),
        media,
      ).body(pageContent.bytes)
    } catch (ex) {
      if (ex instanceof IndexOutOfBoundsException) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'Page number does not exist')
      } else if (ex instanceof MediaUnsupportedException) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.message)
      } else if (ex instanceof MediaNotReadyException) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book analysis failed')
      } else if (isNoSuchFileException(ex)) {
        logger.warn(ex as Error, () => `File not found: ${book}`)
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'File not found, it may have moved')
      }
      throw ex
    }
  }

  // PORT: async (BookAnalyzer.getFileContent)
  async getBookEpubResource(request: HttpServletRequest, principal: KomgaPrincipal | null, bookId: string, resource: string): Promise<ResponseEntity<Uint8Array>> {
    const resourceName = resource.startsWith('/') ? resource.substring(1) : resource
    const isFont = FONT_EXTENSIONS.includes(FilenameUtils.getExtension(resourceName).toLowerCase())

    if (!isFont && principal === null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED)

    const book = this.bookRepository.findByIdOrNull(bookId) ?? (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()
    const media = this.mediaRepository.findById(book.id)

    if (new ServletWebRequest(request).checkNotModified(getBookLastModified(media))) {
      return setNotModified(ResponseEntity.status(HttpStatus.NOT_MODIFIED).header('Content-Security-Policy', "script-src 'none'; object-src 'none';"), media).body(new Uint8Array(0))
    }

    if (media.profile !== MediaProfile.EPUB) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, `Book media type '${media.mediaType}' not compatible with requested profile`)
    if (!isFont) this.contentRestrictionChecker.checkContentRestrictionBook(nn(principal).user, book)

    const res = media.files.find((it) => it.fileName === resourceName) ?? (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()
    let bytes: Uint8Array
    try {
      bytes = await this.bookAnalyzer.getFileContent(new BookWithMedia({ book: book, media: media }), resourceName)
    } catch (e) {
      if (e instanceof EntryNotFoundException) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
      throw e
    }

    return setNotModified(
      ResponseEntity.ok()
        .headersFrom((it) => {
          it.setContentDisposition(contentDisposition('inline', FilenameUtils.getName(resourceName), true))
          it.set('Content-Security-Policy', "script-src 'none'; object-src 'none';")
        })
        .contentType(getMediaTypeOrDefault(res.mediaType)),
      media,
    ).body(bytes)
  }

  downloadBookFile(principal: KomgaPrincipal, bookId: string): ResponseEntity<StreamingResponseBody> {
    return this.getBookFileInternal(principal, bookId)
  }

  getBookFileInternal(principal: KomgaPrincipal, bookId: string): ResponseEntity<StreamingResponseBody> {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)
    try {
      const media = this.mediaRepository.findById(book.id)
      const self = new FileSystemResource(book.path)
      if (!self.exists()) throw new FileNotFoundException(self.path)
      const stream = streamingResponseBody(async (os: Writable) => {
        // PORT: inputStream.use { IOUtils.copyLarge(it, os, ByteArray(8192)); os.close() } -> pipeline
        await pipeline(self.getInputStream(), os)
      })
      return ResponseEntity.ok()
        .headersFrom((it) => {
          it.setContentDisposition(contentDisposition('attachment', nameOfPath(book.path), true))
        })
        .contentType(getMediaTypeOrDefault(media.mediaType))
        .contentLength(self.contentLength())
        .body(stream as StreamingResponseBody)
    } catch (ex) {
      if (ex instanceof FileNotFoundException) {
        logger.warn(ex, () => `File not found: ${book}`)
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'File not found, it may have moved')
      }
      throw ex
    }
  }

  getBookProgression(principal: KomgaPrincipal, bookId: string): ResponseEntity<R2Progression> {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    const it = this.readProgressRepository.findByBookIdAndUserIdOrNull(bookId, principal.user.id)
    return it !== null ? ResponseEntity.ok(toR2Progression(it)) : ResponseEntity.noContent().build()
  }

  updateBookProgression(principal: KomgaPrincipal, bookId: string, progression: R2Progression): void {
    const book = this.bookRepository.findByIdOrNull(bookId)
    if (book === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, book)

    try {
      this.bookLifecycle.markProgression(book, principal.user, progression)
    } catch (e) {
      if (e instanceof IllegalStateException) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, e.message)
      } else if (e instanceof IllegalArgumentException) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      }
      throw e
    }
  }
}

// PORT: kotlin.io.path.name (Path.fileName)
function nameOfPath(path: string): string {
  return path.substring(path.lastIndexOf('/') + 1)
}

// @RestController
restController(CommonBookController, {
  inject: [MediaRepository, BookRepository, BookDtoRepository, SeriesMetadataRepository, BookLifecycle, BookAnalyzer, ContentRestrictionChecker, ContentDetector, ReadProgressRepository],
  javaName: 'org.gotson.komga.interfaces.api.CommonBookController',
  requestMapping: { produces: [MediaType.APPLICATION_JSON_VALUE] },
  handlers: {
    getBookPageRawByNumber: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/pages/{pageNumber}/raw', 'opds/v2/books/{bookId}/pages/{pageNumber}/raw'], produces: [MediaType.ALL_VALUE] },
      preAuthorize: "hasRole('PAGE_STREAMING')",
      args: [authenticationPrincipal(), webRequest(), pathVariable('bookId'), pathVariable('pageNumber', 'Int')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get raw book page', description: 'Returns the book page in raw format, without content negotiation.', tags: [OpenApiConfiguration.TagNames.BOOK_PAGES] } },
    },
    getBookEpubResource: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/resource/{*resource}', 'opds/v2/books/{bookId}/resource/{*resource}'], produces: ['*/*'] },
      args: [requestArg(), authenticationPrincipal(), pathVariable('bookId'), pathVariable('resource')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get Epub resource', description: 'Return a resource from within an Epub book.', tags: [OpenApiConfiguration.TagNames.BOOK_WEBPUB] }, securityRequirements: true },
    },
    downloadBookFile: {
      mapping: {
        method: 'GET',
        path: ['api/v1/books/{bookId}/file', 'api/v1/books/{bookId}/file/*', 'opds/v1.2/books/{bookId}/file/*', 'opds/v2/books/{bookId}/file', 'opds/v2/books/{bookId}/file/*'],
        produces: [MediaType.APPLICATION_OCTET_STREAM_VALUE],
      },
      preAuthorize: "hasRole('FILE_DOWNLOAD')",
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: OpenApiTypes.StreamingResponseBody,
      openapi: { operation: { summary: 'Download book file', description: 'Download the book file.', tags: [OpenApiConfiguration.TagNames.BOOKS] } },
    },
    getBookProgression: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/progression', 'opds/v2/books/{bookId}/progression'], produces: [MEDIATYPE_PROGRESSION_JSON_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: R2Progression },
      openapi: { operation: { summary: 'Get book progression', description: 'The Progression API is a proposed standard for OPDS 2 and Readium. It is used by the Epub Reader.', tags: [OpenApiConfiguration.TagNames.BOOK_WEBPUB] } },
    },
    updateBookProgression: {
      mapping: { method: 'PUT', path: ['api/v1/books/{bookId}/progression', 'opds/v2/books/{bookId}/progression'] },
      responseStatus: HttpStatus.NO_CONTENT,
      args: [authenticationPrincipal(), pathVariable('bookId'), requestBody({ class: R2Progression })],
      signature: 'public void org.gotson.komga.interfaces.api.CommonBookController.updateBookProgression(org.gotson.komga.infrastructure.security.KomgaPrincipal,java.lang.String,org.gotson.komga.domain.model.R2Progression)',
      openapi: { operation: { summary: 'Mark book progression', description: 'The Progression API is a proposed standard for OPDS 2 and Readium. It is used by the Epub Reader.', tags: [OpenApiConfiguration.TagNames.BOOK_WEBPUB] } },
    },
  },
})
