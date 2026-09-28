// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/LibraryController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { HIGH_PRIORITY, HIGHEST_PRIORITY } from '../../../application/tasks/Task.js'
import { TaskEmitter } from '../../../application/tasks/TaskEmitter.js'
import { DirectoryNotFoundException, DuplicateNameException, PathContainedInPath } from '../../../domain/model/Exceptions.js'
import { Library } from '../../../domain/model/Library.js'
import { SearchCondition } from '../../../domain/model/SearchCondition.js'
import { SearchContext } from '../../../domain/model/SearchContext.js'
import { SearchOperator } from '../../../domain/model/SearchOperator.js'
import { BookRepository } from '../../../domain/persistence/BookRepository.js'
import { LibraryRepository } from '../../../domain/persistence/LibraryRepository.js'
import { SeriesRepository } from '../../../domain/persistence/SeriesRepository.js'
import { LibraryLifecycle } from '../../../domain/service/LibraryLifecycle.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { filePathToUrl } from '../../../infrastructure/web/Utils.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { FileNotFoundException } from '../../../port/java-io.js'
import { isBlank, nn, sortedBy } from '../../../port/kotlin.js'
import { Pageable } from '../../../port/spring-data.js'
import { HttpStatus, MediaType, ResponseStatusException, authenticationPrincipal, pathVariable, requestBody, requestParam, restController, withParameter } from '../../../port/spring-web.js'
import { LibraryCreationDto } from './dto/LibraryCreationDto.js'
import { LibraryDto, toDto } from './dto/LibraryDto.js'
import { LibraryUpdateDto } from './dto/LibraryUpdateDto.js'
import { toDomain as scanIntervalToDomain } from './dto/ScanIntervalDto.js'
import { toDomain as seriesCoverToDomain } from './dto/SeriesCoverDto.js'

// @Tag(name = OpenApiConfiguration.TagNames.LIBRARIES)
export class LibraryController {
  constructor(
    private readonly taskEmitter: TaskEmitter,
    private readonly libraryLifecycle: LibraryLifecycle,
    private readonly libraryRepository: LibraryRepository,
    private readonly bookRepository: BookRepository,
    private readonly seriesRepository: SeriesRepository,
  ) {}

  // @Operation(summary = "List all libraries", description = "The libraries are filtered based on the current user's permissions")
  getLibraries(principal: KomgaPrincipal): LibraryDto[] {
    return sortedBy(principal.user.canAccessAllLibraries() ? this.libraryRepository.findAll() : this.libraryRepository.findAllByIds(principal.user.sharedLibrariesIds), (it) =>
      it.name.toLowerCase(),
    ).map((it) => toDto(it, principal.user.isAdmin))
  }

  // @Operation(summary = "Get details for a single library")
  getLibraryById(principal: KomgaPrincipal, libraryId: string): LibraryDto {
    const it = this.libraryRepository.findByIdOrNull(libraryId)
    if (it === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    if (!principal.user.canAccessLibrary(it)) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
    return toDto(it, principal.user.isAdmin)
  }

  // @Operation(summary = "Create a library")
  addLibrary(principal: KomgaPrincipal, library: LibraryCreationDto): LibraryDto {
    try {
      return toDto(
        this.libraryLifecycle.addLibrary(
          new Library({
            name: library.name,
            root: filePathToUrl(library.root),
            importComicInfoBook: library.importComicInfoBook,
            importComicInfoSeries: library.importComicInfoSeries,
            importComicInfoCollection: library.importComicInfoCollection,
            importComicInfoReadList: library.importComicInfoReadList,
            importComicInfoSeriesAppendVolume: library.importComicInfoSeriesAppendVolume,
            importEpubBook: library.importEpubBook,
            importEpubSeries: library.importEpubSeries,
            importMylarSeries: library.importMylarSeries,
            importLocalArtwork: library.importLocalArtwork,
            importBarcodeIsbn: library.importBarcodeIsbn,
            scanForceModifiedTime: library.scanForceModifiedTime,
            scanInterval: scanIntervalToDomain(library.scanInterval),
            scanOnStartup: library.scanOnStartup,
            scanCbx: library.scanCbx,
            scanPdf: library.scanPdf,
            scanEpub: library.scanEpub,
            scanDirectoryExclusions: library.scanDirectoryExclusions,
            repairExtensions: library.repairExtensions,
            convertToCbz: library.convertToCbz,
            emptyTrashAfterScan: library.emptyTrashAfterScan,
            seriesCover: seriesCoverToDomain(library.seriesCover),
            hashFiles: library.hashFiles,
            hashPages: library.hashPages,
            hashKoreader: library.hashKoreader,
            analyzeDimensions: library.analyzeDimensions,
            oneshotsDirectory: library.oneshotsDirectory !== null ? ifBlankNull(library.oneshotsDirectory) : null,
          }),
        ),
        principal.user.isAdmin,
      )
    } catch (e) {
      if (e instanceof FileNotFoundException || e instanceof DirectoryNotFoundException || e instanceof DuplicateNameException || e instanceof PathContainedInPath)
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      else throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  /** @deprecated Use PATCH /v1/libraries/{libraryId} instead */
  // @Operation(summary = "Update a library", description = "Use PATCH /api/v1/libraries/{libraryId} instead. Deprecated since 1.3.0.", tags = [OpenApiConfiguration.TagNames.DEPRECATED])
  updateLibraryByIdDeprecated(libraryId: string, library: LibraryUpdateDto): void {
    this.updateLibraryById(libraryId, library)
  }

  // @Operation(summary = "Update a library", description = "You can omit fields you don't want to update")
  updateLibraryById(libraryId: string, library: LibraryUpdateDto): void {
    const existing = this.libraryRepository.findByIdOrNull(libraryId)
    if (existing === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    // with(library)
    const toUpdate = existing.copy({
      id: libraryId,
      name: library.name ?? existing.name,
      root: (library.root !== null ? filePathToUrl(nn(library.root)) : null) ?? existing.root,
      importComicInfoBook: library.importComicInfoBook ?? existing.importComicInfoBook,
      importComicInfoSeries: library.importComicInfoSeries ?? existing.importComicInfoSeries,
      importComicInfoCollection: library.importComicInfoCollection ?? existing.importComicInfoCollection,
      importComicInfoReadList: library.importComicInfoReadList ?? existing.importComicInfoReadList,
      importComicInfoSeriesAppendVolume: library.importComicInfoSeriesAppendVolume ?? existing.importComicInfoSeriesAppendVolume,
      importEpubBook: library.importEpubBook ?? existing.importEpubBook,
      importEpubSeries: library.importEpubSeries ?? existing.importEpubSeries,
      importMylarSeries: library.importMylarSeries ?? existing.importMylarSeries,
      importLocalArtwork: library.importLocalArtwork ?? existing.importLocalArtwork,
      importBarcodeIsbn: library.importBarcodeIsbn ?? existing.importBarcodeIsbn,
      scanForceModifiedTime: library.scanForceModifiedTime ?? existing.scanForceModifiedTime,
      scanInterval: (library.scanInterval !== null ? scanIntervalToDomain(library.scanInterval) : null) ?? existing.scanInterval,
      scanOnStartup: library.scanOnStartup ?? existing.scanOnStartup,
      scanCbx: library.scanCbx ?? existing.scanCbx,
      scanPdf: library.scanPdf ?? existing.scanPdf,
      scanEpub: library.scanEpub ?? existing.scanEpub,
      scanDirectoryExclusions: library.isSet('scanDirectoryExclusions') ? (library.scanDirectoryExclusions ?? new Set()) : existing.scanDirectoryExclusions,
      repairExtensions: library.repairExtensions ?? existing.repairExtensions,
      convertToCbz: library.convertToCbz ?? existing.convertToCbz,
      emptyTrashAfterScan: library.emptyTrashAfterScan ?? existing.emptyTrashAfterScan,
      seriesCover: (library.seriesCover !== null ? seriesCoverToDomain(library.seriesCover) : null) ?? existing.seriesCover,
      hashFiles: library.hashFiles ?? existing.hashFiles,
      hashPages: library.hashPages ?? existing.hashPages,
      hashKoreader: library.hashKoreader ?? existing.hashKoreader,
      analyzeDimensions: library.analyzeDimensions ?? existing.analyzeDimensions,
      oneshotsDirectory: library.isSet('oneshotsDirectory') ? (library.oneshotsDirectory !== null ? ifBlankNull(library.oneshotsDirectory) : null) : existing.oneshotsDirectory,
    })
    try {
      this.libraryLifecycle.updateLibrary(toUpdate)
    } catch (e) {
      if (e instanceof FileNotFoundException || e instanceof DirectoryNotFoundException || e instanceof DuplicateNameException || e instanceof PathContainedInPath)
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
      else throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  // @Operation(summary = "Delete a library")
  deleteLibraryById(libraryId: string): void {
    const it = this.libraryRepository.findByIdOrNull(libraryId)
    if (it === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.libraryLifecycle.deleteLibrary(it)
  }

  // @Operation(summary = "Scan a library")
  libraryScan(libraryId: string, deep: boolean = false): void {
    const library = this.libraryRepository.findByIdOrNull(libraryId)
    if (library === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.taskEmitter.scanLibrary(library.id, { scanDeep: deep, priority: HIGHEST_PRIORITY })
  }

  // @Operation(summary = "Analyze a library")
  libraryAnalyze(libraryId: string): void {
    const books = this.bookRepository.findAll(new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: libraryId }) }), SearchContext.empty(), Pageable.unpaged()).content
    this.taskEmitter.analyzeBook(books, { priority: HIGH_PRIORITY })
  }

  // @Operation(summary = "Refresh metadata for a library")
  libraryRefreshMetadata(libraryId: string): void {
    const books = this.bookRepository.findAll(new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: libraryId }) }), SearchContext.empty(), Pageable.unpaged()).content
    this.taskEmitter.refreshBookMetadata(books, { priority: HIGH_PRIORITY })
    this.taskEmitter.refreshBookLocalArtwork(books, { priority: HIGH_PRIORITY })
    this.taskEmitter.refreshSeriesLocalArtwork(this.seriesRepository.findAllIdsByLibraryId(libraryId), { priority: HIGH_PRIORITY })
  }

  // @Operation(summary = "Empty trash for a library")
  libraryEmptyTrash(libraryId: string): void {
    const library = this.libraryRepository.findByIdOrNull(libraryId)
    if (library === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.taskEmitter.emptyTrash(library.id, { priority: HIGH_PRIORITY })
  }
}

// PORT: `ifBlank { null }`
function ifBlankNull(s: string): string | null {
  return isBlank(s) ? null : s
}

const SIGNATURE_PREFIX = 'org.gotson.komga.interfaces.api.rest.LibraryController'

// @RestController
restController(LibraryController, {
  inject: [TaskEmitter, LibraryLifecycle, LibraryRepository, BookRepository, SeriesRepository],
  javaName: SIGNATURE_PREFIX,
  requestMapping: { path: ['api/v1/libraries'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.LIBRARIES] },
  handlers: {
    getLibraries: {
      mapping: { method: 'GET' },
      args: [authenticationPrincipal()],
      returns: { list: { class: LibraryDto } },
      openapi: { operation: { summary: 'List all libraries', description: "The libraries are filtered based on the current user's permissions" } },
    },
    getLibraryById: {
      mapping: { method: 'GET', path: ['{libraryId}'] },
      args: [authenticationPrincipal(), pathVariable('libraryId')],
      returns: { class: LibraryDto },
      openapi: { operation: { summary: 'Get details for a single library' } },
    },
    addLibrary: {
      mapping: { method: 'POST' },
      preAuthorize: "hasRole('ADMIN')",
      args: [authenticationPrincipal(), requestBody({ class: LibraryCreationDto }, { valid: true })],
      returns: { class: LibraryDto },
      openapi: { operation: { summary: 'Create a library' } },
      signature: `public org.gotson.komga.interfaces.api.rest.dto.LibraryDto ${SIGNATURE_PREFIX}.addLibrary(org.gotson.komga.infrastructure.security.KomgaPrincipal,org.gotson.komga.interfaces.api.rest.dto.LibraryCreationDto)`,
    },
    updateLibraryByIdDeprecated: {
      mapping: { method: 'PUT', path: ['/{libraryId}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [pathVariable('libraryId'), requestBody({ class: LibraryUpdateDto }, { valid: true })],
      openapi: {
        operation: { summary: 'Update a library', description: 'Use PATCH /api/v1/libraries/{libraryId} instead. Deprecated since 1.3.0.', tags: [OpenApiConfiguration.TagNames.DEPRECATED] },
        deprecated: true,
      },
      signature: `public void ${SIGNATURE_PREFIX}.updateLibraryByIdDeprecated(java.lang.String,org.gotson.komga.interfaces.api.rest.dto.LibraryUpdateDto)`,
    },
    updateLibraryById: {
      mapping: { method: 'PATCH', path: ['/{libraryId}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [
        pathVariable('libraryId'),
        withParameter(requestBody({ class: LibraryUpdateDto }, { valid: true }), { description: "Fields to update. You can omit fields you don't want to update." }),
      ],
      openapi: { operation: { summary: 'Update a library', description: "You can omit fields you don't want to update" } },
      signature: `public void ${SIGNATURE_PREFIX}.updateLibraryById(java.lang.String,org.gotson.komga.interfaces.api.rest.dto.LibraryUpdateDto)`,
    },
    deleteLibraryById: {
      mapping: { method: 'DELETE', path: ['/{libraryId}'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      args: [pathVariable('libraryId')],
      openapi: { operation: { summary: 'Delete a library' } },
    },
    libraryScan: {
      mapping: { method: 'POST', path: ['{libraryId}/scan'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('libraryId'), requestParam('deep', 'Boolean', { required: false, hasDefault: true })],
      openapi: { operation: { summary: 'Scan a library' } },
    },
    libraryAnalyze: {
      mapping: { method: 'POST', path: ['{libraryId}/analyze'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('libraryId')],
      openapi: { operation: { summary: 'Analyze a library' } },
    },
    libraryRefreshMetadata: {
      mapping: { method: 'POST', path: ['{libraryId}/metadata/refresh'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('libraryId')],
      openapi: { operation: { summary: 'Refresh metadata for a library' } },
    },
    libraryEmptyTrash: {
      mapping: { method: 'POST', path: ['{libraryId}/empty-trash'] },
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.ACCEPTED,
      args: [pathVariable('libraryId')],
      openapi: { operation: { summary: 'Empty trash for a library' } },
    },
  },
})
