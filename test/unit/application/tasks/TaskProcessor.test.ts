// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/tasks/TaskProcessorOracleTest.kt
import { afterAll } from 'vitest'
import { Task } from '../../../../src/application/tasks/Task.js'
import type { TaskHandler } from '../../../../src/application/tasks/TaskHandler.js'
import { TaskProcessor } from '../../../../src/application/tasks/TaskProcessor.js'
import { KomgaSettingsProvider } from '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { ThreadPoolTaskExecutorBuilder } from '../../../../src/port/spring-scheduling.js'
import { OracleDb, exec, query } from '../../db.js'
import { oracle } from '../../oracle.js'

// Le TaskHandler est un faux (le même côté Kotlin) qui note les tâches traitées et leur propriétaire à ce moment
const { func, kase } = oracle('application/tasks/TaskProcessor')

const db = new OracleDb()
const dao = db.tasksDao
const log: string[] = []
const events: string[] = []
const settings = new KomgaSettingsProvider(db.serverSettingsDao, { publishEvent: (it: unknown) => events.push((it as object).constructor.name) })

const handler = {
  handleTask: async (t: Task) => {
    const owner = (query(db.tasksDataSource.getConnection(), `select OWNER from TASK where ID = '${t.uniqueId}'`)[0] ?? [null])[0] ?? null
    log.push(`${t} by ${owner}`)
  },
} as unknown as TaskHandler

const processors: TaskProcessor[] = []
afterAll(() => processors.forEach((it) => it.executor.destroy()))

function processor(): TaskProcessor {
  const p = new TaskProcessor(dao, handler, settings, new ThreadPoolTaskExecutorBuilder())
  processors.push(p)
  return p
}

const q = (sql: string) => query(db.tasksDataSource.getConnection(), sql)

/** dates de modification fixes, dans l'ordre des ids */
const dated = (...ids: string[]) =>
  ids.forEach((id, i) => exec(db.tasksDataSource.getConnection(), `update TASK set LAST_MODIFIED_DATE = '2020-01-01 00:00:0${i}' where ID = '${id}'`))

/** attend que la file soit traitée */
async function drain(p: TaskProcessor): Promise<void> {
  const end = Date.now() + 10_000
  while (Date.now() < end && (dao.count() > 0 || p.executor.activeCount > 0)) await new Promise((r) => setTimeout(r, 5))
}

function queue(): void {
  dao.save([
    new Task.HashBook({ bookId: 'B1', priority: 0 }),
    new Task.AnalyzeBook({ bookId: 'B2', priority: 4, groupId: 'S1' }),
    new Task.AnalyzeBook({ bookId: 'B3', priority: 4, groupId: 'S1' }),
    new Task.RefreshSeriesMetadata({ seriesId: 'S2', priority: 6 }),
    new Task.UpgradeIndex({ priority: 8 }),
    new Task.DeleteBook({ bookId: 'B4', priority: 4 }),
  ])
  dated('HASH_BOOK_B1', 'ANALYZE_BOOK_B3', 'ANALYZE_BOOK_B2', 'REFRESH_SERIES_METADATA_S2', 'UPGRADE_INDEX', 'DELETE_BOOK_B4')
}

const before = (s: string) => s.slice(0, s.indexOf(' by '))

func('afterPropertiesSet', () => {
  kase('not processing before', () => processor().processTasks)
  kase('disowns unfinished tasks', () => {
    dao.save([new Task.HashBook({ bookId: 'B1' }), new Task.HashBook({ bookId: 'B2' }), new Task.HashBook({ bookId: 'B3' })])
    exec(db.tasksDataSource.getConnection(), "update TASK set OWNER = 'old' where ID <> 'HASH_BOOK_B3'")
    const p = processor()
    p.afterPropertiesSet()
    return [p.processTasks, q('select ID, OWNER from TASK order by ID')]
  })
  kase('nothing to disown', () => {
    const p = processor()
    p.afterPropertiesSet()
    const r = p.processTasks
    dao.deleteAll()
    return r
  })
})

func('taskPoolSizeChanged', () => {
  kase('initial pool size', () => processor().executor.corePoolSize)
  kase('follows the setting', () => {
    const p = processor()
    settings.taskPoolSize = 3
    p.taskPoolSizeChanged()
    return [p.executor.corePoolSize, events]
  })
  kase('back to one', () => {
    const p = processor()
    const b = p.executor.corePoolSize
    settings.taskPoolSize = 1
    p.taskPoolSizeChanged()
    return [b, p.executor.corePoolSize]
  })
})

func('processAvailableTask', () => {
  kase('not processing', () => {
    queue()
    const p = processor()
    p.processAvailableTask()
    const r = [[...log], dao.count(), p.executor.activeCount]
    dao.deleteAll()
    return r
  })
  kase('one thread, by priority', async () => {
    log.length = 0
    queue()
    const p = processor()
    p.processTasks = true
    p.processAvailableTask()
    await drain(p)
    return [[...log], dao.count()]
  })
})

func('takeAndProcess', () => {
  kase('empty queue', async () => {
    log.length = 0
    const p = processor()
    p.processTasks = true
    p.processAvailableTask()
    await drain(p)
    return [[...log], dao.count()]
  })
  kase('task added while processing', async () => {
    log.length = 0
    dao.save(new Task.DeleteSeries({ seriesId: 'S1', priority: 1 }))
    const p = processor()
    p.processTasks = true
    p.processAvailableTask()
    dao.save(new Task.DeleteSeries({ seriesId: 'S2', priority: 1 }))
    p.processAvailableTask()
    await drain(p)
    return [log.map(before).sort(), dao.count()]
  })
})
