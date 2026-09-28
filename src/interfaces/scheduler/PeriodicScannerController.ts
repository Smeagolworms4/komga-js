// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/scheduler/PeriodicScannerController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LibraryScanScheduler } from '../../application/scheduler/LibraryScanScheduler.js'
import { TaskEmitter } from '../../application/tasks/TaskEmitter.js'
import { LibraryRepository } from '../../domain/persistence/LibraryRepository.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationReadyEvent, component } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.scheduler.PeriodicScannerController')

export class PeriodicScannerController {
  constructor(
    private readonly taskEmitter: TaskEmitter,
    private readonly libraryRepository: LibraryRepository,
    private readonly libraryScanScheduler: LibraryScanScheduler,
  ) {}

  scanOnStartup(): void {
    this.libraryRepository
      .findAll()
      .filter((it) => it.scanOnStartup)
      .forEach((it) => {
        logger.info(() => `Scan on startup for library: ${it.name}`)
        this.taskEmitter.scanLibrary(it.id)
      })
  }

  scheduleScans(): void {
    this.libraryRepository.findAll().forEach((it) => this.libraryScanScheduler.scheduleScan(it))
  }
}

// @Profile("!test") @Component
component(PeriodicScannerController, {
  profile: '!test',
  inject: [TaskEmitter, LibraryRepository, LibraryScanScheduler],
  eventListeners: [
    // @EventListener(classes = [ApplicationReadyEvent::class])
    { method: 'scanOnStartup', events: [ApplicationReadyEvent] },
    // @EventListener(classes = [ApplicationReadyEvent::class])
    { method: 'scheduleScans', events: [ApplicationReadyEvent] },
  ],
})
