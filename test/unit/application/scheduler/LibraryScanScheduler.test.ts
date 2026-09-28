// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/scheduler/LibraryScanSchedulerOracleTest.kt
import type { Duration, Instant } from '@js-joda/core'
import { LibraryScanScheduler } from '../../../../src/application/scheduler/LibraryScanScheduler.js'
import { TaskEmitter } from '../../../../src/application/tasks/TaskEmitter.js'
import { Library } from '../../../../src/domain/model/Library.js'
import type { BookConverter } from '../../../../src/domain/service/BookConverter.js'
import { URL } from '../../../../src/port/java-net.js'
import { UnsupportedOperationException } from '../../../../src/port/kotlin.js'
import { type FixedRateTask, type Runnable, type ScheduledFuture, TaskScheduler } from '../../../../src/port/spring-scheduling.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('application/scheduler/LibraryScanScheduler')

/** Enregistre les annulations (même faux que le test Kotlin) */
class FakeFuture implements ScheduledFuture {
  cancelled = false
  constructor(
    readonly name: string,
    readonly log: string[],
  ) {}
  cancel(mayInterruptIfRunning: boolean): boolean {
    this.log.push(`cancel ${this.name} ${mayInterruptIfRunning}`)
    this.cancelled = true
    return true
  }
  isCancelled(): boolean {
    return this.cancelled
  }
  isDone(): boolean {
    return this.cancelled
  }
}

/** Enregistre les planifications à intervalle fixe, n'exécute rien (même faux que le test Kotlin) */
class FakeScheduler extends TaskScheduler {
  readonly log: string[] = []
  readonly runnables: Runnable[] = []
  scheduleAtFixedRate(task: Runnable, _startTime: Instant | Duration, period?: Duration): ScheduledFuture {
    this.runnables.push(task)
    const name = `#${this.runnables.length}`
    this.log.push(`schedule ${name} ${period}`)
    return new FakeFuture(name, this.log)
  }
  schedule(): ScheduledFuture {
    throw new UnsupportedOperationException()
  }
  scheduleWithFixedDelay(): ScheduledFuture {
    throw new UnsupportedOperationException()
  }
}

const db = new OracleDb()
const scheduler = new FakeScheduler()
const emitter = new TaskEmitter(db.bookDao, {} as BookConverter, db.tasksDao, new (class extends ApplicationEventPublisher {
  publishEvent(): void {}
})())
const libraryScanScheduler = new LibraryScanScheduler(scheduler, emitter)

const lib = (id: string, interval: Library.ScanInterval) => new Library({ name: `lib ${id}`, root: new URL(`file:/lib/${id}`), scanInterval: interval, id })
const tasks = () => [...libraryScanScheduler.getScheduledTasks()].map((it) => (it.task as FixedRateTask).intervalDuration)

func('scheduleScan', () => {
  kase('every 6h', () => {
    libraryScanScheduler.scheduleScan(lib('L1', Library.ScanInterval.EVERY_6H))
    return [...scheduler.log]
  })
  kase('reschedule cancels the previous task', () => {
    libraryScanScheduler.scheduleScan(lib('L1', Library.ScanInterval.DAILY))
    return [...scheduler.log]
  })
  kase('other library', () => {
    libraryScanScheduler.scheduleScan(lib('L2', Library.ScanInterval.HOURLY))
    return [[...scheduler.log], tasks().sort((a, b) => a.compareTo(b))]
  })
  kase('disabled cancels and removes', () => {
    libraryScanScheduler.scheduleScan(lib('L1', Library.ScanInterval.DISABLED))
    return [[...scheduler.log], tasks()]
  })
  kase('disabled unknown library', () => {
    libraryScanScheduler.scheduleScan(lib('L9', Library.ScanInterval.DISABLED))
    return scheduler.log.length
  })
  kase('scheduled runnable emits a scan task', async () => {
    await (scheduler.runnables.at(-1) as Runnable)()
    return db.tasksDao.findAll().map((it) => it.toString())
  })
  kase('cancelled runnable still runs when invoked', async () => {
    await (scheduler.runnables[0] as Runnable)()
    return db.tasksDao.count()
  })
})
func('getScheduledTasks', () => {
  kase('current tasks', () => tasks())
  kase('new set each call', () => libraryScanScheduler.getScheduledTasks() !== libraryScanScheduler.getScheduledTasks())
})
func('toDuration', () => {
  for (const interval of Library.ScanInterval.entries().filter((it) => it !== Library.ScanInterval.DISABLED)) {
    kase(interval.name, () => {
      libraryScanScheduler.scheduleScan(lib('D', interval))
      return scheduler.log.at(-1)
    })
  }
})
