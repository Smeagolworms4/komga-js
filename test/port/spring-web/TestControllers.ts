// Support de test : contrôleurs de test reproduisant les déclarations Spring (mêmes chemins, paramètres,
// annotations) d'endpoints réels de Komga, pour les tests différentiels du DispatcherServlet
// (réponses comparées à celles du Komga JVM, fixtures/reference.json). Ce fichier n'a pas de jumeau Kotlin.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { EntityNotFoundException } from '../../../src/domain/model/Exceptions.js'
import { ReadStatus } from '../../../src/domain/model/ReadStatus.js'
import { SeriesMetadata } from '../../../src/domain/model/SeriesMetadata.js'
import { LibraryCreationDto } from '../../../src/interfaces/api/rest/dto/LibraryCreationDto.js'
import { registerClass } from '../../../src/port/jackson.js'
import { resourcesDir } from '../../../src/port/resources.js'
import { type Filter, type FilterChain, FilterRegistrationBean, type HttpServletRequest, type HttpServletResponse, MaxUploadSizeExceededException, MultipartFile } from '../../../src/port/servlet.js'
import { configuration } from '../../../src/port/spring.js'
import type { Pageable } from '../../../src/port/spring-data.js'
import { PageImpl } from '../../../src/port/spring-data.js'
import {
  HttpStatus,
  MethodArgumentNotValidException,
  ResponseEntity,
  ResponseStatusException,
  authenticationPrincipal,
  contentDisposition,
  controllerAdvice,
  exceptionArg,
  pageable,
  pathVariable,
  requestBody,
  requestHeader,
  requestParam,
  restController,
  webRequest,
  withConstraints,
} from '../../../src/port/spring-web.js'
import { ByteArrayResource, FileSystemResource } from '../../../src/port/spring-core-io.js'
import { CorsFilter } from '../../../src/port/spring-web-cors.js'
import { type ProblemDetail } from '../../../src/port/spring-web-dispatcher.js'
import { ConstraintViolationException } from '../../../src/port/validation-engine.js'
import { Email, NotBlank } from '../../../src/port/validation.js'

registerClass('org.gotson.komga.domain.model.ReadStatus', ReadStatus as never)
registerClass('org.gotson.komga.domain.model.SeriesMetadata$Status', SeriesMetadata.Status as never)

// ---------------------------------------------------------------------------
// Sécurité simulée (CorsFilter + HeaderWriterFilter de Spring Security), le temps que la sécurité soit portée
// ---------------------------------------------------------------------------

const STATIC = /^\/(index\.html|index-next\.html|favicon.*|css\/|fonts\/|img\/|js\/|assets\/|manifest\.json|layers\.css|mstile|apple-touch|android-chrome)/

export class FakeSecurityFilter implements Filter {
  private readonly cors = new CorsFilter({ getCorsConfiguration: () => null })

  async doFilter(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain): Promise<void> {
    const isStatic = STATIC.test(request.servletPath)
    let written = false
    const writeHeaders = () => {
      if (written || isStatic) return
      written = true
      response.setHeader('X-Content-Type-Options', 'nosniff')
      response.setHeader('X-XSS-Protection', '0')
      response.setHeader('X-Frame-Options', 'SAMEORIGIN')
    }
    response.beforeCommit.push(writeHeaders)
    try {
      await this.cors.doFilter(request, response, chain)
    } finally {
      if (!response.isCommitted) writeHeaders()
    }
  }
}

export class FakeSecurityConfiguration {
  fakeSecurityFilter(): FilterRegistrationBean {
    return new FilterRegistrationBean(new FakeSecurityFilter(), -100, ['/*'], 'springSecurityFilterChain')
  }
}
configuration(FakeSecurityConfiguration, { beans: [{ method: 'fakeSecurityFilter', type: FilterRegistrationBean }] })

// ---------------------------------------------------------------------------
// ErrorHandlingControllerAdvice (interfaces/api/rest) : mêmes @ExceptionHandler
// ---------------------------------------------------------------------------

export class TestErrorHandlingControllerAdvice {
  onConstraintValidationException(e: ConstraintViolationException): unknown {
    return { violations: [...e.constraintViolations].map((it) => ({ fieldName: it.propertyPath, message: it.message })) }
  }

  onMethodArgumentNotValidException(e: MethodArgumentNotValidException): unknown {
    return { violations: e.bindingResult.fieldErrors.map((it) => ({ fieldName: it.field, message: it.defaultMessage })) }
  }

  handleEntityNotFound(): void {}

  handleMaxUploadSizeExceededException(e: MaxUploadSizeExceededException): ProblemDetail {
    return e.body
  }
}

controllerAdvice(TestErrorHandlingControllerAdvice, {
  exceptionHandlers: {
    onConstraintValidationException: { exceptions: [ConstraintViolationException], responseStatus: HttpStatus.BAD_REQUEST },
    onMethodArgumentNotValidException: { exceptions: [MethodArgumentNotValidException], responseStatus: HttpStatus.BAD_REQUEST },
    handleEntityNotFound: { exceptions: [EntityNotFoundException], responseStatus: HttpStatus.NOT_FOUND, args: [] },
    handleMaxUploadSizeExceededException: { exceptions: [MaxUploadSizeExceededException], args: [exceptionArg()] },
  },
})

// ---------------------------------------------------------------------------
// ClaimController
// ---------------------------------------------------------------------------

export class TestClaimController {
  getClaimStatus(): unknown {
    return { isClaimed: true }
  }

  claimServer(_email: string, _password: string): unknown {
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'This server has already been claimed')
  }
}

restController(TestClaimController, {
  javaName: 'org.gotson.komga.interfaces.api.rest.ClaimController',
  requestMapping: { path: ['api/v1/claim'], produces: ['application/json'] },
  validated: true,
  handlers: {
    getClaimStatus: { mapping: { method: 'GET' } },
    claimServer: {
      mapping: { method: 'POST' },
      args: [
        withConstraints(requestHeader('X-Komga-Email'), 'email', [Email({ regexp: '.+@.+\\..+' })]),
        withConstraints(requestHeader('X-Komga-Password'), 'password', [NotBlank()]),
      ],
    },
  },
})

// ---------------------------------------------------------------------------
// SeriesController / BookController (conversion des paramètres, Pageable)
// ---------------------------------------------------------------------------

function sortJson(sort: { isEmpty(): boolean; isSorted: boolean; isUnsorted: boolean }): unknown {
  return { empty: sort.isEmpty(), sorted: sort.isSorted, unsorted: sort.isUnsorted }
}

/** Sérialisation Jackson de PageImpl (getters) */
export function pageJson(page: PageImpl<unknown>): unknown {
  const p = page.pageable
  return {
    content: page.content,
    pageable: { pageNumber: p.pageNumber, pageSize: p.pageSize, sort: sortJson(p.sort), offset: p.offset, paged: p.isPaged, unpaged: p.isUnpaged },
    last: page.isLast,
    totalElements: page.totalElements,
    totalPages: page.totalPages,
    size: page.size,
    number: page.number,
    sort: sortJson(page.sort),
    first: page.isFirst,
    numberOfElements: page.numberOfElements,
    empty: page.isEmpty(),
  }
}

export class TestSeriesController {
  getAllSeries(
    _principal: unknown,
    _deleted: boolean | null,
    _oneshot: boolean | null,
    _unpaged: boolean = false,
    _readStatus: ReadStatus[] | null,
    _status: SeriesMetadata.Status[] | null,
    page: Pageable,
  ): unknown {
    return pageJson(new PageImpl<unknown>([], page, 0))
  }

  addUserUploadedSeriesThumbnail(_seriesId: string, _file: MultipartFile, _selected: boolean = true): unknown {
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }
}

restController(TestSeriesController, {
  javaName: 'org.gotson.komga.interfaces.api.rest.SeriesController',
  requestMapping: { path: ['api'], produces: ['application/json'] },
  handlers: {
    getAllSeries: {
      mapping: { method: 'GET', path: ['v1/series'] },
      args: [
        authenticationPrincipal(),
        requestParam('deleted', { nullable: 'Boolean' }, { required: false, nullable: true }),
        requestParam('oneshot', { nullable: 'Boolean' }, { required: false, nullable: true }),
        requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }),
        requestParam('read_status', { nullable: { list: { enum: ReadStatus } } }, { required: false, nullable: true }),
        requestParam('status', { nullable: { list: { enum: SeriesMetadata.Status } } }, { required: false, nullable: true }),
        pageable(),
      ],
    },
    addUserUploadedSeriesThumbnail: {
      mapping: { method: 'POST', path: ['v1/series/{seriesId}/thumbnails'], consumes: ['multipart/form-data'] },
      args: [pathVariable('seriesId'), requestParam('file', { class: MultipartFile }), requestParam('selected', 'Boolean', { hasDefault: true })],
    },
  },
})

export class TestBookController {
  getOneBook(_principal: unknown, _bookId: string): unknown {
    throw new EntityNotFoundException('Book not found')
  }

  getBookPageByNumber(_principal: unknown, _request: unknown, _bookId: string, _pageNumber: number, _convertTo: string | null): unknown {
    throw new EntityNotFoundException('Book not found')
  }
}

restController(TestBookController, {
  javaName: 'org.gotson.komga.interfaces.api.rest.BookController',
  handlers: {
    getOneBook: { mapping: { method: 'GET', path: ['api/v1/books/{bookId}'], produces: ['application/json'] }, args: [authenticationPrincipal(), pathVariable('bookId')] },
    getBookPageByNumber: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/pages/{pageNumber}'], produces: ['*/*'] },
      args: [authenticationPrincipal(), webRequest(), pathVariable('bookId'), pathVariable('pageNumber', 'Int'), requestParam('convert', { nullable: 'String' }, { required: false, nullable: true })],
    },
  },
})

// ---------------------------------------------------------------------------
// FontsController (Resource, requêtes Range)
// ---------------------------------------------------------------------------

export class TestFontsController {
  private readonly fonts: Map<string, FileSystemResource[]>

  constructor() {
    const dir = join(resourcesDir(), 'embeddedFonts')
    this.fonts = new Map(readdirSync(dir).map((family) => [family, readdirSync(join(dir, family)).sort().map((f) => new FileSystemResource(join(dir, family, f)))]))
  }

  getFonts(): Set<string> {
    return new Set(this.fonts.keys())
  }

  getFontFile(fontFamily: string, fontFile: string): ResponseEntity<FileSystemResource> {
    const resources = this.fonts.get(fontFamily)
    if (resources === undefined) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const resource = resources.find((it) => it.filename === fontFile)
    if (resource === undefined) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const mediaType = `font/${(resource.filename as string).split('.').pop()?.toLowerCase()}`
    return ResponseEntity.ok()
      .headersFrom((it) => it.setContentDisposition(contentDisposition('attachment', fontFile)))
      .contentType(mediaType)
      .body(resource)
  }

  getFontFamilyAsCss(fontFamily: string): ResponseEntity<ByteArrayResource> {
    const files = this.fonts.get(fontFamily)
    if (files === undefined) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const groups = new Map<string, FileSystemResource[]>()
    for (const f of files) {
      const name = f.filename as string
      const key = `${name.toLowerCase().includes('italic') ? 'italic' : 'normal'}|${name.toLowerCase().includes('bold') ? 'bold' : 'normal'}`
      groups.set(key, [...(groups.get(key) ?? []), f])
    }
    const css = [...groups]
      .map(([key, resources]) => {
        const [style, weight] = key.split('|')
        const srcBlock = `${resources
          .map((r) => {
            const ext = (r.filename as string).split('.').pop()?.toLowerCase() as string
            const format = ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : ext
            return `url('${r.filename}') format('${format}')`
          })
          .join(',')};`
        return `@font-face {\n    font-family: '${fontFamily}';\n    src: ${srcBlock}\n    font-weight: ${weight};\n    font-style: ${style};\n}\n`
      })
      .join('\n')
    return ResponseEntity.ok()
      .headersFrom((it) => it.setContentDisposition(contentDisposition('attachment', `${fontFamily}.css`)))
      .body(new ByteArrayResource(Buffer.from(css)))
  }
}

restController(TestFontsController, {
  javaName: 'org.gotson.komga.interfaces.api.rest.FontsController',
  requestMapping: { path: ['api/v1/fonts'], produces: ['application/json'] },
  handlers: {
    getFonts: { mapping: { method: 'GET', path: ['families'] } },
    getFontFile: { mapping: { method: 'GET', path: ['resource/{fontFamily}/{fontFile}'] }, args: [pathVariable('fontFamily'), pathVariable('fontFile')] },
    getFontFamilyAsCss: { mapping: { method: 'GET', path: ['resource/{fontFamily}/css'], produces: ['text/css'] }, args: [pathVariable('fontFamily')] },
  },
})

// ---------------------------------------------------------------------------
// LibraryController (@Valid @RequestBody) / FileSystemController
// ---------------------------------------------------------------------------

export class TestLibraryController {
  addLibrary(_principal: unknown, _library: LibraryCreationDto): unknown {
    throw new Error('unexpected')
  }
}

restController(TestLibraryController, {
  javaName: 'org.gotson.komga.interfaces.api.rest.LibraryController',
  requestMapping: { path: ['api/v1/libraries'], produces: ['application/json'] },
  handlers: {
    addLibrary: {
      mapping: { method: 'POST' },
      args: [authenticationPrincipal(), requestBody({ class: LibraryCreationDto }, { valid: true })],
      signature:
        'public org.gotson.komga.interfaces.api.rest.dto.LibraryDto org.gotson.komga.interfaces.api.rest.LibraryController.addLibrary(org.gotson.komga.infrastructure.security.KomgaPrincipal,org.gotson.komga.interfaces.api.rest.dto.LibraryCreationDto)',
    },
  },
})

class InvalidPathException extends Error {}

export class TestFileSystemController {
  getDirectoryListing(request: Map<string, unknown> | null): unknown {
    const path = String(request?.get('path') ?? '')
    if (path.includes('\u0000')) throw new InvalidPathException(`Nul character not allowed: ${path}`)
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'Path does not exist')
  }
}

restController(TestFileSystemController, {
  javaName: 'org.gotson.komga.interfaces.api.rest.FileSystemController',
  requestMapping: { path: ['api/v1/filesystem'], produces: ['application/json'] },
  handlers: {
    getDirectoryListing: { mapping: { method: 'POST' }, args: [requestBody('Any', { required: false })] },
  },
})
