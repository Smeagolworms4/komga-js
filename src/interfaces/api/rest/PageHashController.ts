// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/PageHashController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { TaskEmitter } from '../../../application/tasks/TaskEmitter.js'
import { BookPageNumbered } from '../../../domain/model/BookPageNumbered.js'
import { PageHashKnown } from '../../../domain/model/PageHashKnown.js'
import { PageHashRepository } from '../../../domain/persistence/PageHashRepository.js'
import { PageHashLifecycle } from '../../../domain/service/PageHashLifecycle.js'
import { getMediaTypeOrDefault } from '../../../infrastructure/web/Utils.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { PageableAsQueryParam } from '../../../infrastructure/openapi/PageableAnnotations.js'
import { registerClass } from '../../../port/jackson.js'
import { JsonTypes } from '../../../port/jackson-mapper.js'
import { IllegalArgumentException, groupBy } from '../../../port/kotlin.js'
import { type Page, PageImpl, Pageable } from '../../../port/spring-data.js'
import { HttpStatus, MediaType, ResponseEntity, ResponseStatusException, pageable, pathVariable, requestBody, requestParam, restController, withParameter } from '../../../port/spring-web.js'
import { PageHashCreationDto } from './dto/PageHashCreationDto.js'
import { PageHashKnownDto, toDto as pageHashKnownToDto } from './dto/PageHashKnownDto.js'
import { PageHashMatchDto, toDto as pageHashMatchToDto } from './dto/PageHashMatchDto.js'
import { PageHashUnknownDto, toDto as pageHashUnknownToDto } from './dto/PageHashUnknownDto.js'

export class PageHashController {
  constructor(
    private readonly pageHashRepository: PageHashRepository,
    private readonly pageHashLifecycle: PageHashLifecycle,
    private readonly taskEmitter: TaskEmitter,
  ) {}

  getKnownPageHashes(actions: PageHashKnown.Action[] | null, page: Pageable): Page<PageHashKnownDto> {
    return this.pageHashRepository.findAllKnown(actions, page).map((it) => pageHashKnownToDto(it))
  }

  getKnownPageHashThumbnail(pageHash: string): Uint8Array {
    return this.pageHashRepository.getKnownThumbnail(pageHash) ?? (() => { throw new ResponseStatusException(HttpStatus.NOT_FOUND) })()
  }

  getUnknownPageHashes(page: Pageable): Page<PageHashUnknownDto> {
    return this.pageHashRepository.findAllUnknown(page).map((it) => pageHashUnknownToDto(it))
  }

  getPageHashMatches(pageHash: string, page: Pageable): Page<PageHashMatchDto> {
    return this.pageHashRepository.findMatchesByHash(pageHash, page).map((it) => pageHashMatchToDto(it))
  }

  // PORT: async (PageHashLifecycle.getPage)
  async getUnknownPageHashThumbnail(pageHash: string, resize: number | null = null): Promise<ResponseEntity<Uint8Array>> {
    const it = await this.pageHashLifecycle.getPage(pageHash, { resizeTo: resize })
    if (it === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    return ResponseEntity.ok().contentType(getMediaTypeOrDefault(it.mediaType)).body(it.bytes)
  }

  // PORT: async (PageHashLifecycle.createOrUpdate)
  async createOrUpdateKnownPageHash(pageHash: PageHashCreationDto): Promise<void> {
    try {
      await this.pageHashLifecycle.createOrUpdate(
        new PageHashKnown({
          hash: pageHash.hash,
          size: pageHash.size,
          action: pageHash.action,
        }),
      )
    } catch (e) {
      if (e instanceof IllegalArgumentException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      throw e
    }
  }

  deleteDuplicatePagesByPageHash(pageHash: string): void {
    // PORT: groupBy(keySelector, valueTransform)
    const toRemove = new Map(
      [...groupBy(this.pageHashRepository.findMatchesByHash(pageHash, Pageable.unpaged()), (it) => it.bookId)].map(([bookId, matches]) => [
        bookId,
        matches.map(
          (it) =>
            new BookPageNumbered({
              fileName: it.fileName,
              mediaType: it.mediaType,
              fileHash: pageHash,
              fileSize: it.fileSize,
              pageNumber: it.pageNumber,
            }),
        ),
      ]),
    )

    this.taskEmitter.removeDuplicatePages(toRemove)
  }

  deleteSingleMatchByPageHash(pageHash: string, matchDto: PageHashMatchDto): void {
    const toRemove: [string, BookPageNumbered[]] = [
      matchDto.bookId,
      [
        new BookPageNumbered({
          fileName: matchDto.fileName,
          mediaType: matchDto.mediaType,
          fileHash: pageHash,
          fileSize: matchDto.fileSize,
          pageNumber: matchDto.pageNumber,
        }),
      ],
    ]

    this.taskEmitter.removeDuplicatePages(toRemove[0], toRemove[1])
  }
}

// PORT: nom qualifié de l'enum converti (messages d'erreur de conversion de Spring)
registerClass('org.gotson.komga.domain.model.PageHashKnown$Action', PageHashKnown.Action as never)

// @RestController
restController(PageHashController, {
  inject: [PageHashRepository, PageHashLifecycle, TaskEmitter],
  javaName: 'org.gotson.komga.interfaces.api.rest.PageHashController',
  requestMapping: { path: ['api/v1/page-hashes'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  preAuthorize: "hasRole('ADMIN')",
  openapi: { tags: [OpenApiConfiguration.TagNames.DUPLICATE_PAGES] },
  handlers: {
    getKnownPageHashes: {
      mapping: { method: 'GET' },
      args: [requestParam('action', { nullable: { list: { enum: PageHashKnown.Action } } }, { required: false, nullable: true }), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: PageHashKnownDto }] },
      openapi: { operation: { summary: 'List known duplicates' }, parameters: [...PageableAsQueryParam] },
    },
    getKnownPageHashThumbnail: {
      mapping: { method: 'GET', path: ['/{pageHash}/thumbnail'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [pathVariable('pageHash')],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get known duplicate image thumbnail' }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    getUnknownPageHashes: {
      mapping: { method: 'GET', path: ['/unknown'] },
      args: [withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: PageHashUnknownDto }] },
      openapi: { operation: { summary: 'List unknown duplicates' }, parameters: [...PageableAsQueryParam] },
    },
    getPageHashMatches: {
      mapping: { method: 'GET', path: ['{pageHash}'] },
      args: [pathVariable('pageHash'), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: PageHashMatchDto }] },
      openapi: { operation: { summary: 'List duplicate matches' }, parameters: [...PageableAsQueryParam] },
    },
    getUnknownPageHashThumbnail: {
      mapping: { method: 'GET', path: ['unknown/{pageHash}/thumbnail'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [pathVariable('pageHash'), requestParam('resize', { nullable: 'Int' }, { nullable: true, hasDefault: true })],
      returns: JsonTypes.ByteArray,
      openapi: { operation: { summary: 'Get unknown duplicate image thumbnail' }, responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }] },
    },
    createOrUpdateKnownPageHash: {
      mapping: { method: 'PUT' },
      responseStatus: HttpStatus.ACCEPTED,
      args: [requestBody({ class: PageHashCreationDto }, { valid: true })],
      openapi: { operation: { summary: 'Mark duplicate page as known' } },
      signature: 'public void org.gotson.komga.interfaces.api.rest.PageHashController.createOrUpdateKnownPageHash(org.gotson.komga.interfaces.api.rest.dto.PageHashCreationDto)',
    },
    deleteDuplicatePagesByPageHash: {
      mapping: { method: 'POST', path: ['{pageHash}/delete-all'] },
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('pageHash')],
      openapi: { operation: { summary: 'Delete all duplicate pages by hash' } },
    },
    deleteSingleMatchByPageHash: {
      mapping: { method: 'POST', path: ['{pageHash}/delete-match'] },
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('pageHash'), requestBody({ class: PageHashMatchDto })],
      openapi: { operation: { summary: 'Delete specific duplicate page' } },
      signature: 'public void org.gotson.komga.interfaces.api.rest.PageHashController.deleteSingleMatchByPageHash(java.lang.String,org.gotson.komga.interfaces.api.rest.dto.PageHashMatchDto)',
    },
  },
})
