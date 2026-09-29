// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/TransientBooksController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import { CodedException, MediaNotReadyException } from '../../../domain/model/Exceptions.js'
import { MediaProfile } from '../../../domain/model/MediaProfile.js'
import type { TransientBook } from '../../../domain/model/TransientBook.js'
import { TransientBookRepository } from '../../../domain/persistence/TransientBookRepository.js'
import { BookAnalyzer } from '../../../domain/service/BookAnalyzer.js'
import { TransientBookLifecycle } from '../../../domain/service/TransientBookLifecycle.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { getMediaTypeOrDefault, toFilePath } from '../../../infrastructure/web/Utils.js'
import { BinaryByteUnit } from '../../../port/byteunits.js'
import { registerClass } from '../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../port/jackson-mapper.js'
import { NoSuchFileException as NioNoSuchFileException } from '../../../port/java-nio-file.js'
import { DataClass, IndexOutOfBoundsException, kFloat, sortedBy } from '../../../port/kotlin.js'
import { NoSuchFileException } from '../../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../../port/logging.js'
import { HttpStatus, MediaType, ResponseEntity, ResponseStatusException, pathVariable, requestBody, restController, webRequest } from '../../../port/spring-web.js'
import type { ServletWebRequest } from '../../../port/spring-web-filter.js'
import { getBookLastModified, setNotModified } from '../Utils.js'
import { PageDto } from './dto/PageDto.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.api.rest.TransientBooksController')

export class TransientBooksController {
  constructor(
    private readonly transientBookLifecycle: TransientBookLifecycle,
    private readonly transientBookRepository: TransientBookRepository,
    private readonly bookAnalyzer: BookAnalyzer,
  ) {}

  // PORT: async (TransientBookLifecycle.scanAndPersist)
  async scanTransientBooks(request: ScanRequestDto): Promise<TransientBookDto[]> {
    try {
      return sortedBy(await this.transientBookLifecycle.scanAndPersist(request.path), (it) => it.book.path).map((it) => this.toDto(it))
    } catch (e) {
      if (e instanceof CodedException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.code)
      throw e
    }
  }

  // PORT: async (TransientBookLifecycle.analyzeAndPersist)
  async analyzeTransientBook(id: string): Promise<TransientBookDto> {
    const it = this.transientBookRepository.findByIdOrNull(id)
    if (it === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    return this.toDto(await this.transientBookLifecycle.analyzeAndPersist(it))
  }

  // PORT: async (TransientBookLifecycle.getBookPage)
  async getPageByTransientBookId(id: string, pageNumber: number, request: ServletWebRequest): Promise<ResponseEntity<Uint8Array>> {
    const it = this.transientBookRepository.findByIdOrNull(id)
    if (it === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (request.checkNotModified(getBookLastModified(it.media))) {
      return setNotModified(ResponseEntity.status(HttpStatus.NOT_MODIFIED), it.media).body(new Uint8Array(0))
    }

    try {
      const pageContent = await this.transientBookLifecycle.getBookPage(it, pageNumber)

      return setNotModified(ResponseEntity.ok().contentType(getMediaTypeOrDefault(pageContent.mediaType)), it.media).body(pageContent.bytes)
    } catch (ex) {
      if (ex instanceof IndexOutOfBoundsException) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'Page number does not exist')
      } else if (ex instanceof MediaNotReadyException) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'Book analysis failed')
      } else if (ex instanceof NoSuchFileException || ex instanceof NioNoSuchFileException) {
        // PORT: java.nio.file.NoSuchFileException existe en deux classes de support (port/kotlin-io-path, port/java-nio-file)
        logger.warn(ex, () => 'File not found}')
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, 'File not found, it may have moved')
      }
      throw ex
    }
  }

  // PORT: fonction d'extension privée TransientBook.toDto -> méthode privée
  private toDto(self: TransientBook): TransientBookDto {
    const media = self.media
    const pages = media.profile === MediaProfile.PDF ? this.bookAnalyzer.getPdfPagesDynamic(media) : media.pages
    return new TransientBookDto({
      id: self.book.id,
      name: self.book.name,
      url: toFilePath(self.book.url),
      fileLastModified: self.book.fileLastModified,
      sizeBytes: self.book.fileSize,
      status: media.status.toString(),
      mediaType: media.mediaType ?? '',
      pages: pages.map(
        (bookPage, index) =>
          new PageDto({
            number: index + 1,
            fileName: bookPage.fileName,
            mediaType: bookPage.mediaType,
            width: bookPage.dimension?.width ?? null,
            height: bookPage.dimension?.height ?? null,
            sizeBytes: bookPage.fileSize,
          }),
      ),
      files: media.files.map((it) => it.fileName),
      comment: media.comment ?? '',
      number: self.metadata.number,
      seriesId: self.metadata.seriesId,
    })
  }
}

type ScanRequestDtoParams = {
  path: string
}

export class ScanRequestDto extends DataClass<ScanRequestDtoParams> {
  readonly path: string

  constructor({ path }: ScanRequestDtoParams) {
    super()
    this.path = path
  }
}

jsonProperties(ScanRequestDto, { path: 'String' }, [], { required: ['path'] })
registerClass('org.gotson.komga.interfaces.api.rest.ScanRequestDto', ScanRequestDto)

type TransientBookDtoParams = {
  id: string
  name: string
  url: string
  fileLastModified: LocalDateTime
  sizeBytes: number
  size?: string
  status: string
  mediaType: string
  pages: PageDto[]
  files: string[]
  comment: string
  number: number | null
  seriesId: string | null
}

export class TransientBookDto extends DataClass<TransientBookDtoParams> {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly fileLastModified: LocalDateTime
  readonly sizeBytes: number
  readonly size: string
  readonly status: string
  readonly mediaType: string
  readonly pages: PageDto[]
  readonly files: string[]
  readonly comment: string
  readonly number: number | null // PORT: Float
  readonly seriesId: string | null

  constructor({ id, name, url, fileLastModified, sizeBytes, size = BinaryByteUnit.format(sizeBytes), status, mediaType, pages, files, comment, number, seriesId }: TransientBookDtoParams) {
    super()
    this.id = id
    this.name = name
    this.url = url
    this.fileLastModified = fileLastModified
    this.sizeBytes = sizeBytes
    this.size = size
    this.status = status
    this.mediaType = mediaType
    this.pages = pages
    this.files = files
    this.comment = comment
    this.number = kFloat(number)
    this.seriesId = seriesId
  }
}

jsonProperties(
  TransientBookDto,
  {
    id: 'String',
    name: 'String',
    url: 'String',
    fileLastModified: JsonTypes.LocalDateTime,
    sizeBytes: 'Long',
    size: 'String',
    status: 'String',
    mediaType: 'String',
    pages: { list: { class: PageDto } },
    files: { list: 'String' },
    comment: 'String',
    number: { nullable: 'Float' },
    seriesId: { nullable: 'String' },
  },
  [],
  { required: ['id', 'name', 'url', 'fileLastModified', 'sizeBytes', 'status', 'mediaType', 'pages', 'files', 'comment'] },
)

// @RestController
// PORT: déclaration placée en fin de fichier (ScanRequestDto doit être défini avant usage)
restController(TransientBooksController, {
  inject: [TransientBookLifecycle, TransientBookRepository, BookAnalyzer],
  javaName: 'org.gotson.komga.interfaces.api.rest.TransientBooksController',
  requestMapping: { path: ['api/v1/transient-books'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  preAuthorize: "hasRole('ADMIN')",
  openapi: { tags: [OpenApiConfiguration.TagNames.BOOK_IMPORT] },
  handlers: {
    scanTransientBooks: {
      mapping: { method: 'POST' },
      args: [requestBody({ class: ScanRequestDto })],
      returns: { list: { class: TransientBookDto } },
      openapi: { operation: { summary: 'Scan folder for transient books', description: 'Scan provided folder for transient books.' } },
      signature:
        'public java.util.List<org.gotson.komga.interfaces.api.rest.TransientBookDto> org.gotson.komga.interfaces.api.rest.TransientBooksController.scanTransientBooks(org.gotson.komga.interfaces.api.rest.ScanRequestDto)',
    },
    analyzeTransientBook: {
      mapping: { method: 'POST', path: ['{id}/analyze'] },
      args: [pathVariable('id')],
      returns: { class: TransientBookDto },
      openapi: { operation: { summary: 'Analyze transient book' } },
    },
    getPageByTransientBookId: {
      mapping: { method: 'GET', path: ['{id}/pages/{pageNumber}'], produces: [MediaType.ALL_VALUE] },
      args: [pathVariable('id'), pathVariable('pageNumber', 'Int'), webRequest()],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get transient book page' } },
    },
  },
})
