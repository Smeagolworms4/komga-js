// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/scheduler/SearchIndexControllerOracleTest.kt
import { DEFAULT_PRIORITY } from '../../../../src/application/tasks/Task.js'
import type { TaskEmitter } from '../../../../src/application/tasks/TaskEmitter.js'
import type { LuceneEntity } from '../../../../src/infrastructure/search/LuceneEntity.js'
import type { LuceneHelper } from '../../../../src/infrastructure/search/LuceneHelper.js'
import { SearchIndexController } from '../../../../src/interfaces/scheduler/SearchIndexController.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('interfaces/scheduler/SearchIndexController')

const calls: unknown[][] = []
// PORT: faux TaskEmitter / LuceneHelper (mockk côté Kotlin)
const taskEmitter = {
  rebuildIndex({ priority = DEFAULT_PRIORITY, entities = null }: { priority?: number; entities?: ReadonlySet<LuceneEntity> | null } = {}) {
    calls.push(['rebuildIndex', priority, entities])
  },
  upgradeIndex({ priority = DEFAULT_PRIORITY }: { priority?: number } = {}) {
    calls.push(['upgradeIndex', priority])
  },
} as unknown as TaskEmitter

function run(exists: boolean, version: number): unknown[][] {
  const lucene = { indexExists: () => exists, getIndexVersion: () => version } as unknown as LuceneHelper
  calls.length = 0
  new SearchIndexController(lucene, taskEmitter).createIndexIfNoneExist()
  return [...calls]
}

func('createIndexIfNoneExist', () => {
  kase('no index', () => run(false, 0))
  for (const v of [0, 1, 5, 6, 7, 8, 9, 10]) kase(`version ${v}`, () => run(true, v))
})
