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
import { SearchCondition } from '../../src/domain/model/SearchCondition.js'
import { SearchOperator } from '../../src/domain/model/SearchOperator.js'
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
import { OpenApiTypes, openApiSchema } from '../../src/port/swagger-annotations.js'
import { toJsonValue } from '../../src/port/swagger-models.js'
import { ConstraintViolationException } from '../../src/port/validation-engine.js'
import { Email, NotBlank } from '../../src/port/validation.js'

const REFERENCE = '../komga-src/komga/docs/openapi.json'
const TagNames = OpenApiConfiguration.TagNames

// ---------------------------------------------------------------------------
// @Schema des interfaces scellées de recherche (domain/model/SearchCondition.kt, SearchOperator.kt)
// ---------------------------------------------------------------------------

const C = SearchCondition
openApiSchema(C.Series, {
  name: 'SearchConditionSeries',
  oneOf: [C.AnyOfSeries, C.AllOfSeries, C.LibraryId, C.CollectionId, C.Deleted, C.Complete, C.OneShot, C.Title, C.TitleSort, C.ReleaseDate, C.Tag, C.SharingLabel, C.Publisher, C.Language, C.Genre, C.AgeRating, C.ReadStatus, C.SeriesStatus, C.Author],
})
openApiSchema(C.Book, {
  name: 'SearchConditionBook',
  oneOf: [C.AnyOfBook, C.AllOfBook, C.LibraryId, C.ReadListId, C.SeriesId, C.Deleted, C.OneShot, C.Title, C.ReleaseDate, C.Tag, C.NumberSort, C.ReadStatus, C.MediaStatus, C.MediaProfile, C.Author, C.Poster],
})
for (const [cls, name] of [
  [C.AnyOfSeries, 'AnyOfSeries'],
  [C.AllOfSeries, 'AllOfSeries'],
  [C.CollectionId, 'CollectionId'],
  [C.Complete, 'Complete'],
  [C.TitleSort, 'TitleSort'],
  [C.SharingLabel, 'SharingLabel'],
  [C.Publisher, 'Publisher'],
  [C.Language, 'Language'],
  [C.Genre, 'Genre'],
  [C.AgeRating, 'AgeRating'],
  [C.SeriesStatus, 'SeriesStatus'],
  [C.AnyOfBook, 'AnyOfBook'],
  [C.AllOfBook, 'AllOfBook'],
  [C.LibraryId, 'LibraryId'],
  [C.ReadListId, 'ReadListId'],
  [C.SeriesId, 'SeriesId'],
  [C.Deleted, 'Deleted'],
  [C.OneShot, 'OneShot'],
  [C.Title, 'Title'],
  [C.ReleaseDate, 'ReleaseDate'],
  [C.Tag, 'Tag'],
  [C.NumberSort, 'NumberSort'],
  [C.ReadStatus, 'ReadStatus'],
  [C.MediaStatus, 'MediaStatus'],
  [C.MediaProfile, 'MediaProfile'],
  [C.Author, 'Author'],
  [C.Poster, 'Poster'],
] as const)
  openApiSchema(cls, { name: `SearchCondition${name}` })

const O = SearchOperator
const op = (name: string, oneOf: object[], mapping: [string, object][]) =>
  ({ name, discriminatorProperty: 'operator', oneOf, discriminatorMapping: mapping.map(([value, schema]) => ({ value, schema })) }) as const
openApiSchema(O.Equality, op('SearchOperatorEquality', [O.Is, O.IsNot], [['is', O.Is], ['isNot', O.IsNot]]))
openApiSchema(
  O.EqualityNullable,
  op('SearchOperatorEqualityNullable', [O.Is, O.IsNot, O.IsNullT, O.IsNotNullT], [['is', O.Is], ['isNot', O.IsNot], ['isNull', O.IsNullT], ['isNotNull', O.IsNotNullT]]),
)
openApiSchema(
  O.StringOp,
  op(
    'SearchOperatorString',
    [O.BeginsWith, O.DoesNotBeginWith, O.Contains, O.DoesNotContain, O.EndsWith, O.DoesNotEndWith, O.Is, O.IsNot],
    [['beginsWith', O.BeginsWith], ['doesNotBeginWith', O.DoesNotBeginWith], ['contains', O.Contains], ['doesNotContain', O.DoesNotContain], ['endsWith', O.EndsWith], ['doesNotEndWith', O.DoesNotEndWith], ['is', O.Is], ['isNot', O.IsNot]],
  ),
)
openApiSchema(O.Numeric, op('SearchOperatorNumericT', [O.GreaterThan, O.LessThan, O.Is, O.IsNot], [['greaterThan', O.GreaterThan], ['lessThan', O.LessThan], ['is', O.Is], ['isNot', O.IsNot]]))
openApiSchema(
  O.NumericNullable,
  op(
    'SearchOperatorNumericNullable',
    [O.GreaterThan, O.LessThan, O.IsNullT, O.IsNotNullT, O.Is, O.IsNot],
    [['greaterThan', O.GreaterThan], ['lessThan', O.LessThan], ['isNull', O.IsNullT], ['isNotNull', O.IsNotNullT], ['is', O.Is], ['isNot', O.IsNot]],
  ),
)
openApiSchema(
  O.Date,
  op(
    'SearchOperatorDate',
    [O.Before, O.After, O.IsInTheLast, O.IsNotInTheLast, O.IsNull, O.IsNotNull],
    [['before', O.Before], ['after', O.After], ['isInTheLast', O.IsInTheLast], ['isNotInTheLast', O.IsNotInTheLast], ['isNull', O.IsNull], ['isNotNull', O.IsNotNull]],
  ),
)
openApiSchema(O.Boolean, op('SearchOperatorBoolean', [O.IsTrue, O.IsFalse], [['isTrue', O.IsTrue], ['isFalse', O.IsFalse]]))
for (const [cls, name] of [
  [O.Is, 'Is'],
  [O.IsNot, 'IsNot'],
  [O.Contains, 'Contains'],
  [O.DoesNotContain, 'DoesNotContain'],
  [O.BeginsWith, 'BeginsWith'],
  [O.DoesNotBeginWith, 'DoesNotBeginWith'],
  [O.EndsWith, 'EndsWith'],
  [O.DoesNotEndWith, 'DoesNotEndWith'],
  [O.GreaterThan, 'GreaterThan'],
  [O.LessThan, 'LessThan'],
  [O.Before, 'Before'],
  [O.After, 'After'],
  [O.IsInTheLast, 'IsInTheLast'],
  [O.IsNotInTheLast, 'IsNotInTheLast'],
  [O.IsTrue, 'IsTrue'],
  [O.IsFalse, 'IsFalse'],
  [O.IsNull, 'IsNull'],
  [O.IsNotNull, 'IsNotNull'],
  [O.IsNullT, 'IsNullT'],
  [O.IsNotNullT, 'IsNotNullT'],
] as const)
  openApiSchema(cls, { name: `SearchOperator${name}` })
openApiSchema(O.IsNullT, { supertypes: [O.NumericNullable, O.EqualityNullable] })
openApiSchema(O.IsNotNullT, { supertypes: [O.NumericNullable, O.EqualityNullable] })

// Corrections de métadonnées Jackson des fichiers portés, à reporter dans ces fichiers (types Kotlin exacts) :
// - domain/model/BookSearch.ts, SeriesSearch.ts : propriétés `T?` -> { nullable }
// - domain/model/SearchCondition.ts : NumberSort = Numeric<Float>, AgeRating = NumericNullable<Int>
jsonProperties(BookSearch, { condition: { nullable: { class: SearchCondition.Book } }, fullTextSearch: { nullable: 'String' } })
jsonProperties(SeriesSearch, { condition: { nullable: { class: SearchCondition.Series } }, fullTextSearch: { nullable: 'String' } })
jsonProperties(SearchCondition.NumberSort, { operator: { class: SearchOperator.Numeric, args: ['Float'] } })
jsonProperties(SearchCondition.AgeRating, { operator: { class: SearchOperator.NumericNullable, args: ['Int'] } })

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
