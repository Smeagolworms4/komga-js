// @port-of komga/src/main/kotlin/org/gotson/komga/application/scheduler/LibraryScanScheduler.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Duration } from '@js-joda/core'
import { TaskEmitter } from '../tasks/TaskEmitter.js'
import { Library } from '../../domain/model/Library.js'
import { IllegalArgumentException } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'
import { FixedRateTask, type ScheduledTask, type ScheduledTaskHolder, ScheduledTaskRegistrar, TaskScheduler } from '../../port/spring-scheduling.js'

const logger = KotlinLogging.logger('org.gotson.komga.application.scheduler.LibraryScanScheduler')

export class LibraryScanScheduler implements ScheduledTaskHolder {
  // map the libraryId to the scan scheduled task
  private readonly registry = new Map<string, ScheduledTask>()

  private readonly registrar: ScheduledTaskRegistrar

  constructor(
    taskScheduler: TaskScheduler,
    private readonly taskEmitter: TaskEmitter,
  ) {
    this.registrar = new ScheduledTaskRegistrar()
    this.registrar.setTaskScheduler(taskScheduler)
  }

  scheduleScan(library: Library): void {
    const removed = this.registry.get(library.id) ?? null
    this.registry.delete(library.id)
    removed?.cancel(false)
    if (library.scanInterval !== Library.ScanInterval.DISABLED) {
      const it = this.registrar.scheduleFixedRateTask(
        new FixedRateTask(
          () => {
            logger.info(() => `Periodic scan for library: ${library.name}`)
            this.taskEmitter.scanLibrary(library.id)
          },
          toDuration(library.scanInterval),
          toDuration(library.scanInterval),
        ),
      )
      if (it !== null) this.registry.set(library.id, it)
    }
  }

  // the '/actuator/scheduledtasks' endpoint will pick up any ScheduledTaskHolder and display its tasks
  getScheduledTasks(): Set<ScheduledTask> {
    return new Set(this.registry.values())
  }
}

// @Service
component(LibraryScanScheduler, { inject: [TaskScheduler, TaskEmitter] })

function toDuration(self: Library.ScanInterval): Duration {
  switch (self) {
    case Library.ScanInterval.DISABLED:
      throw new IllegalArgumentException('Cannot convert DISABLED to Duration')
    case Library.ScanInterval.HOURLY:
      return Duration.ofHours(1)
    case Library.ScanInterval.EVERY_6H:
      return Duration.ofHours(6)
    case Library.ScanInterval.EVERY_12H:
      return Duration.ofHours(12)
    case Library.ScanInterval.DAILY:
      return Duration.ofDays(1)
    case Library.ScanInterval.WEEKLY:
      return Duration.ofDays(7)
  }
  throw new IllegalArgumentException(String(self))
}
