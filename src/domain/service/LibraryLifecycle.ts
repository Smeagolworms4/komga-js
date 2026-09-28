// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/LibraryLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LibraryScanScheduler } from '../../application/scheduler/LibraryScanScheduler.js'
import { LOWEST_PRIORITY } from '../../application/tasks/Task.js'
import { TaskEmitter } from '../../application/tasks/TaskEmitter.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { DirectoryNotFoundException, DuplicateNameException, PathContainedInPath } from '../model/Exceptions.js'
import type { Library } from '../model/Library.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { SeriesRepository } from '../persistence/SeriesRepository.js'
import { SidecarRepository } from '../persistence/SidecarRepository.js'
import { FileNotFoundException } from '../../port/java-io.js'
import { filesExists, filesIsDirectory, pathStartsWith } from '../../port/java.js'
import { eq, first } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { TransactionTemplate } from '../../port/spring-tx.js'
import { SeriesLifecycle } from './SeriesLifecycle.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.LibraryLifecycle')

export class LibraryLifecycle {
  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly seriesLifecycle: SeriesLifecycle,
    private readonly seriesRepository: SeriesRepository,
    private readonly sidecarRepository: SidecarRepository,
    private readonly taskEmitter: TaskEmitter,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly transactionTemplate: TransactionTemplate,
    private readonly libraryScanScheduler: LibraryScanScheduler,
  ) {}

  // @Throws(FileNotFoundException, DirectoryNotFoundException, DuplicateNameException, PathContainedInPath)
  addLibrary(library: Library): Library {
    logger.info(() => `Adding new library: ${library.name} with root folder: ${library.root}`)

    const existing = this.libraryRepository.findAll()
    this.checkLibraryValidity(library, existing)

    this.libraryRepository.insert(library)
    this.taskEmitter.scanLibrary(library.id)

    this.eventPublisher.publishEvent(new DomainEvent.LibraryAdded({ library: library }))

    return this.libraryRepository.findById(library.id)
  }

  updateLibrary(toUpdate: Library): void {
    logger.info(() => `Updating library: ${toUpdate.id}`)

    const libraries = this.libraryRepository.findAll()
    const otherLibraries = libraries.filter((it) => it.id !== toUpdate.id)
    const current = first(libraries, (it) => it.id === toUpdate.id)
    this.checkLibraryValidity(toUpdate, otherLibraries)

    this.libraryRepository.update(toUpdate)

    if (current.scanInterval !== toUpdate.scanInterval) this.libraryScanScheduler.scheduleScan(toUpdate)

    if (this.checkLibraryShouldRescan(current, toUpdate)) this.taskEmitter.scanLibrary(toUpdate.id)

    if (toUpdate.hashFiles && !current.hashFiles) this.taskEmitter.hashBooksWithoutHash(toUpdate)
    if (toUpdate.hashKoreader && !current.hashKoreader) this.taskEmitter.hashBooksWithoutHashKoreader(toUpdate)
    if (toUpdate.hashPages && !current.hashPages) this.taskEmitter.findBooksWithMissingPageHash(toUpdate, { priority: LOWEST_PRIORITY })
    if (toUpdate.repairExtensions && !current.repairExtensions) this.taskEmitter.repairExtensions(toUpdate, { priority: LOWEST_PRIORITY })
    if (toUpdate.convertToCbz && !current.convertToCbz) this.taskEmitter.findBooksToConvert(toUpdate, { priority: LOWEST_PRIORITY })

    this.eventPublisher.publishEvent(new DomainEvent.LibraryUpdated({ library: toUpdate }))
  }

  private checkLibraryShouldRescan(existing: Library, updated: Library): boolean {
    if (!eq(existing.root, updated.root)) return true
    if (existing.oneshotsDirectory !== updated.oneshotsDirectory) return true
    if (existing.scanCbx !== updated.scanCbx) return true
    if (existing.scanPdf !== updated.scanPdf) return true
    if (existing.scanEpub !== updated.scanEpub) return true
    if (existing.scanForceModifiedTime !== updated.scanForceModifiedTime) return true
    if (!eq(existing.scanDirectoryExclusions, updated.scanDirectoryExclusions)) return true
    return false
  }

  private checkLibraryValidity(library: Library, existing: Iterable<Library>): void {
    if (!filesExists(library.path)) throw new FileNotFoundException(`Library root folder does not exist: ${library.root}`)

    if (!filesIsDirectory(library.path)) throw new DirectoryNotFoundException(`Library root folder is not a folder: ${library.root}`)

    if ([...existing].map((it) => it.name).includes(library.name)) throw new DuplicateNameException('Library name already exists')

    for (const it of existing) {
      if (pathStartsWith(library.path, it.path)) throw new PathContainedInPath(`Library path ${library.path} is a child of existing library ${it.name}: ${it.path}`)
      if (pathStartsWith(it.path, library.path)) throw new PathContainedInPath(`Library path ${library.path} is a parent of existing library ${it.name}: ${it.path}`)
    }
  }

  deleteLibrary(library: Library): void {
    logger.info(() => `Deleting library: ${library}`)

    const series = this.seriesRepository.findAllByLibraryId(library.id)
    this.transactionTemplate.executeWithoutResult(() => {
      this.seriesLifecycle.deleteMany(series)
      this.sidecarRepository.deleteByLibraryId(library.id)

      this.libraryRepository.delete(library.id)
    })

    this.eventPublisher.publishEvent(new DomainEvent.LibraryDeleted({ library: library }))
  }
}

// @Service
component(LibraryLifecycle, {
  inject: [LibraryRepository, SeriesLifecycle, SeriesRepository, SidecarRepository, TaskEmitter, ApplicationEventPublisher, TransactionTemplate, LibraryScanScheduler],
})
