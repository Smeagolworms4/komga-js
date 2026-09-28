// Tests de la génération OpenAPI (port/springdoc.ts) : des contrôleurs de test reprennent les déclarations
// (mapping, arguments, annotations OpenAPI) d'opérations réelles de Komga, et le document généré est comparé
// au document de référence de Komga (komga-src/komga/docs/openapi.json, profil generate-openapi).
// Ce fichier n'a pas de jumeau Kotlin.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EntityNotFoundException } from '../../src/domain/model/Exceptions.js'
import { BookSearch } from '../../src/domain/model/BookSearch.js'
import { SeriesSearch } from '../../src/domain/model/SeriesSearch.js'
import { SeriesDto } from '../../src/interfaces/api/rest/dto/SeriesDto.js'
import { InheritanceFlattenerConfiguration } from '../../src/infrastructure/openapi/InheritanceFlattenerConfiguration.js'
import { OpenApiConfiguration } from '../../src/infrastructure/openapi/OpenApiConfiguration.js'
import { PageableAsQueryParam } from '../../src/infrastructure/openapi/PageableAnnotations.js'
import { BookDto } from '../../src/interfaces/api/rest/dto/BookDto.js'
import { LibraryCreationDto } from '../../src/interfaces/api/rest/dto/LibraryCreationDto.js'
import { LibraryDto } from '../../src/interfaces/api/rest/dto/LibraryDto.js'
import { ReadProgressUpdateDto } from '../../src/interfaces/api/rest/dto/ReadProgressUpdateDto.js'
import { ThumbnailSeriesDto } from '../../src/interfaces/api/rest/dto/ThumbnailSeriesDto.js'
import { UserDto } from '../../src/interfaces/api/rest/dto/UserDto.js'
import { ValidationErrorResponse } from '../../src/interfaces/api/rest/ErrorHandlingControllerAdvice.js'
import { jsonProperties } from '../../src/port/jackson-mapper.js'
import { DataClass } from '../../src/port/kotlin.js'
import { MultipartFile } from '../../src/port/servlet.js'
import type { Environment } from '../../src/port/spring.js'
import { PageImpl } from '../../src/port/spring-data.js'
import {
  HttpStatus,
  MethodArgumentNotValidException,
  authenticationPrincipal,
  controllerAdvice,
  pageable,
  pathVariable,
  requestBody,
  requestHeader,
  requestParam,
  restController,
  withConstraints,
  withParameter,
} from '../../src/port/spring-web.js'
import { OpenApiGenerator } from '../../src/port/springdoc.js'
import { OpenApiTypes } from '../../src/port/swagger-annotations.js'
import { toJsonValue } from '../../src/port/swagger-models.js'
import { ConstraintViolationException } from '../../src/port/validation-engine.js'
import { Email, NotBlank } from '../../src/port/validation.js'

const REFERENCE = 'test/port/fixtures/komga-openapi.json'
const TagNames = OpenApiConfiguration.TagNames

// Les @Schema des interfaces scellées de recherche (domain/model/SearchCondition.ts, SearchOperator.ts) et les types
// Jackson exacts de BookSearch, SeriesSearch et SearchCondition sont déclarés dans les fichiers portés.

// ---------------------------------------------------------------------------
// Contrôleurs de test (déclarations de Komga)
// ---------------------------------------------------------------------------

class TestAdvice {}
controllerAdvice(TestAdvice, {
  exceptionHandlers: {
    onConstraintValidationException: { exceptions: [ConstraintViolationException], responseStatus: HttpStatus.BAD_REQUEST, returns: { class: ValidationErrorResponse } },
    onMethodArgumentNotValidException: { exceptions: [MethodArgumentNotValidException], responseStatus: HttpStatus.BAD_REQUEST, returns: { class: ValidationErrorResponse } },
    handleEntityNotFound: { exceptions: [EntityNotFoundException], responseStatus: HttpStatus.NOT_FOUND, args: [] },
  },
})

class ClaimStatus extends DataClass<{ isClaimed: boolean }> {}
jsonProperties(ClaimStatus, { isClaimed: 'Boolean' })

class ClaimController {}
restController(ClaimController, {
  requestMapping: { path: ['api/v1/claim'], produces: ['application/json'] },
  validated: true,
  openapi: { tags: [TagNames.CLAIM], securityRequirements: true },
  handlers: {
    getClaimStatus: {
      mapping: { method: 'GET' },
      returns: { class: ClaimStatus },
      openapi: { operation: { summary: 'Retrieve claim status', description: 'Check whether this server has already been claimed.' } },
    },
    claimServer: {
      mapping: { method: 'POST' },
      args: [
        withConstraints(requestHeader('X-Komga-Email'), 'email', [Email({ regexp: '.+@.+\\..+' })]),
        withConstraints(requestHeader('X-Komga-Password'), 'password', [NotBlank()]),
      ],
      returns: { class: UserDto },
      openapi: { operation: { summary: 'Claim server', description: 'Creates an admin user with the provided credentials.' } },
    },
  },
})

class FontsController {}
restController(FontsController, {
  requestMapping: { path: ['api/v1/fonts'], produces: ['application/json'] },
  openapi: { tags: [TagNames.BOOK_FONTS] },
  handlers: {
    getFontFile: {
      mapping: { method: 'GET', path: ['resource/{fontFamily}/{fontFile}'] },
      args: [pathVariable('fontFamily'), pathVariable('fontFile')],
      returns: OpenApiTypes.Resource,
      openapi: { operation: { summary: 'Download font file' }, securityRequirements: true },
    },
    getFontFamilyAsCss: {
      mapping: { method: 'GET', path: ['resource/{fontFamily}/css'], produces: ['text/css'] },
      args: [pathVariable('fontFamily')],
      returns: OpenApiTypes.Resource,
      openapi: {
        operation: { summary: 'Download CSS file', description: 'Download a CSS file with the @font-face block for the font family. This is used by the Epub Reader to change fonts.' },
        securityRequirements: true,
      },
    },
  },
})

class BookController {}
restController(BookController, {
  requestMapping: { produces: ['application/json'] },
  handlers: {
    getBooks: {
      mapping: { method: 'POST', path: ['api/v1/books/list'], produces: ['application/json'] },
      args: [authenticationPrincipal(), requestBody({ class: BookSearch }), requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: BookDto }] },
      openapi: { operation: { summary: 'List books', tags: [TagNames.BOOKS] }, parameters: [...PageableAsQueryParam] },
    },
    getBookById: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}'], produces: ['application/json'] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: { class: BookDto },
      openapi: { operation: { summary: 'Get book details', tags: [TagNames.BOOKS] }, throws: [EntityNotFoundException] },
    },
    markBookReadProgress: {
      mapping: { method: 'PATCH', path: ['api/v1/books/{bookId}/read-progress'], produces: ['application/json'] },
      args: [pathVariable('bookId'), withParameter(requestBody({ class: ReadProgressUpdateDto }, { valid: true }), {
          description:
            'page can be omitted if completed is set to true. completed can be omitted, and will be set accordingly depending on the page passed and the total number of pages in the book.',
        }), authenticationPrincipal()],
      responseStatus: HttpStatus.NO_CONTENT,
      openapi: { operation: { summary: "Mark book's read progress", description: 'Mark book as read and/or change page progress.', tags: [TagNames.BOOKS] } },
    },
    deleteBookReadProgress: {
      mapping: { method: 'DELETE', path: ['api/v1/books/{bookId}/read-progress'], produces: ['application/json'] },
      args: [pathVariable('bookId'), authenticationPrincipal()],
      responseStatus: HttpStatus.NO_CONTENT,
      openapi: { operation: { summary: 'Mark book as unread', description: 'Mark book as unread', tags: [TagNames.BOOKS] } },
    },
    downloadBookFile: {
      mapping: { method: 'GET', path: ['api/v1/books/{bookId}/file', 'api/v1/books/{bookId}/file/*'], produces: ['application/octet-stream'] },
      preAuthorize: "hasRole('FILE_DOWNLOAD')",
      args: [authenticationPrincipal(), pathVariable('bookId')],
      returns: OpenApiTypes.StreamingResponseBody,
      openapi: { operation: { summary: 'Download book file', description: 'Download the book file.', tags: [TagNames.BOOKS] } },
    },
  },
})

class SeriesController {}
restController(SeriesController, {
  requestMapping: { path: ['api'], produces: ['application/json'] },
  handlers: {
    getSeries: {
      mapping: { method: 'POST', path: ['v1/series/list'] },
      args: [authenticationPrincipal(), requestBody({ class: SeriesSearch }), requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: SeriesDto }] },
      openapi: { operation: { summary: 'List series', tags: [TagNames.SERIES] }, parameters: [...PageableAsQueryParam] },
    },
    addUserUploadedSeriesThumbnail: {
      mapping: { method: 'POST', path: ['v1/series/{seriesId}/thumbnails'], consumes: ['multipart/form-data'] },
      preAuthorize: "hasRole('ADMIN')",
      args: [pathVariable('seriesId'), requestParam('file', { class: MultipartFile }), requestParam('selected', 'Boolean', { hasDefault: true })],
      returns: { class: ThumbnailSeriesDto },
      openapi: { operation: { summary: 'Add series poster', tags: [TagNames.SERIES_POSTER] } },
    },
  },
})

class LibraryController {}
restController(LibraryController, {
  requestMapping: { path: ['api/v1/libraries'], produces: ['application/json'] },
  openapi: { tags: [TagNames.LIBRARIES] },
  handlers: {
    libraryScan: {
      mapping: { method: 'POST', path: ['{libraryId}/scan'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('libraryId'), requestParam('deep', 'Boolean', { required: false, hasDefault: true })],
      openapi: { operation: { summary: 'Scan a library' } },
    },
    addLibrary: {
      mapping: { method: 'POST' },
      preAuthorize: "hasRole('ADMIN')",
      args: [authenticationPrincipal(), requestBody({ class: LibraryCreationDto }, { valid: true })],
      returns: { class: LibraryDto },
      openapi: { operation: { summary: 'Create a library' } },
    },
  },
})

// ---------------------------------------------------------------------------

function generate(): Record<string, unknown> {
  const env = { activeProfiles: ['generate-openapi'] } as unknown as Environment
  const config = new OpenApiConfiguration('1.27.1', env)
  const generator = new OpenApiGenerator(config.openApi(), [config.roleDescriptionCustomizer()], [new InheritanceFlattenerConfiguration().flattenInheritedSchemasCustomizer()])
  return toJsonValue(generator.generate(null)) as Record<string, unknown>
}

const hasReference = existsSync(REFERENCE)


describe.skipIf(!hasReference)('springdoc', () => {
  const reference = hasReference ? (JSON.parse(readFileSync(REFERENCE, 'utf8')) as Record<string, any>) : {}
  const doc = generate() as Record<string, any>

  it('generates the same root objects as Komga', () => {
    expect(Object.keys(doc)).toEqual(Object.keys(reference))
    for (const k of ['openapi', 'info', 'externalDocs', 'servers', 'security', 'tags', 'x-tagGroups']) expect(doc[k], k).toEqual(reference[k])
    expect(doc.components.securitySchemes).toEqual(reference.components.securitySchemes)
  })

  it('serializes the root keys in the same order as Komga', () => {
    expect(JSON.stringify(doc.info)).toEqual(JSON.stringify(reference.info))
    expect(JSON.stringify(doc.servers)).toEqual(JSON.stringify(reference.servers))
    expect(JSON.stringify(doc.paths['/actuator/info'])).toEqual(JSON.stringify(reference.paths['/actuator/info']))
  })

  it('generates the paths declared in the OpenAPI bean', () => {
    expect(doc.paths['/api/logout']).toEqual(reference.paths['/api/logout'])
    expect(doc.paths['/actuator/info']).toEqual(reference.paths['/actuator/info'])
  })

  it('generates the same operations as Komga', () => {
    const ops: [string, string][] = [
      ['/api/v1/claim', 'get'],
      ['/api/v1/claim', 'post'],
      ['/api/v1/fonts/resource/{fontFamily}/{fontFile}', 'get'],
      ['/api/v1/fonts/resource/{fontFamily}/css', 'get'],
      ['/api/v1/books/list', 'post'],
      ['/api/v1/books/{bookId}', 'get'],
      ['/api/v1/books/{bookId}/read-progress', 'patch'],
      ['/api/v1/books/{bookId}/read-progress', 'delete'],
      ['/api/v1/books/{bookId}/file', 'get'],
      ['/api/v1/books/{bookId}/file/*', 'get'],
      ['/api/v1/series/{seriesId}/thumbnails', 'post'],
      ['/api/v1/series/list', 'post'],
      ['/api/v1/libraries/{libraryId}/scan', 'post'],
      ['/api/v1/libraries', 'post'],
    ]
    for (const [path, method] of ops) expect(doc.paths[path]?.[method], `${method} ${path}`).toEqual(reference.paths[path][method])
  })

  it('generates the same component schemas as Komga', () => {
    const schemas = doc.components.schemas as Record<string, unknown>
    expect(Object.keys(schemas).length).toBeGreaterThan(50)
    for (const [name, schema] of Object.entries(schemas)) expect(schema, name).toEqual(reference.components.schemas[name])
  })
})
