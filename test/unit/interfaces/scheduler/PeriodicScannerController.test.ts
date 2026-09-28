// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/scheduler/PeriodicScannerControllerOracleTest.kt
import type { LibraryScanScheduler } from '../../../../src/application/scheduler/LibraryScanScheduler.js'
import { DEFAULT_PRIORITY } from '../../../../src/application/tasks/Task.js'
import type { TaskEmitter } from '../../../../src/application/tasks/TaskEmitter.js'
import { Library } from '../../../../src/domain/model/Library.js'
import { PeriodicScannerController } from '../../../../src/interfaces/scheduler/PeriodicScannerController.js'
import { URL } from '../../../../src/port/java-net.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('interfaces/scheduler/PeriodicScannerController')

const db = new OracleDb()
const calls: unknown[][] = []
// PORT: faux TaskEmitter / LibraryScanScheduler (mockk côté Kotlin) qui enregistrent les appels
const taskEmitter = {
  scanLibrary(libraryId: string, { scanDeep = false, priority = DEFAULT_PRIORITY }: { scanDeep?: boolean; priority?: number } = {}) {
    calls.push(['scanLibrary', libraryId, scanDeep, priority])
  },
} as unknown as TaskEmitter
const scheduler = {
  scheduleScan(library: Library) {
    calls.push(['scheduleScan', library.id, library.scanInterval])
  },
} as unknown as LibraryScanScheduler
const controller = new PeriodicScannerController(taskEmitter, db.libraryDao, scheduler)

function run(block: () => void): unknown[][] {
  calls.length = 0
  block()
  return [...calls]
}

func('scanOnStartup', () => {
  kase('no library', () => run(() => controller.scanOnStartup()))
  kase('libraries', () => {
    db.libraryDao.insert(new Library({ name: 'A', root: new URL('file:/a'), id: 'L1', scanOnStartup: true }))
    db.libraryDao.insert(new Library({ name: 'B', root: new URL('file:/b'), id: 'L2', scanOnStartup: false, scanInterval: Library.ScanInterval.DISABLED }))
    db.libraryDao.insert(new Library({ name: 'C', root: new URL('file:/c'), id: 'L3', scanOnStartup: true, scanInterval: Library.ScanInterval.WEEKLY }))
    return run(() => controller.scanOnStartup())
  })
})

func('scheduleScans', () => {
  kase('all libraries', () => run(() => controller.scheduleScans()))
})
