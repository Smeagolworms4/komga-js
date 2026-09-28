// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/scheduler/SearchIndexController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { HIGHEST_PRIORITY } from '../../application/tasks/Task.js'
import { TaskEmitter } from '../../application/tasks/TaskEmitter.js'
import { LuceneEntity } from '../../infrastructure/search/LuceneEntity.js'
import { LuceneHelper } from '../../infrastructure/search/LuceneHelper.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationReadyEvent, component } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.scheduler.SearchIndexController')

export class SearchIndexController {
  constructor(
    private readonly luceneHelper: LuceneHelper,
    private readonly taskEmitter: TaskEmitter,
  ) {}

  createIndexIfNoneExist(): void {
    if (!this.luceneHelper.indexExists()) {
      logger.info(() => 'Lucene index not found, trigger rebuild')
      this.taskEmitter.rebuildIndex({ priority: HIGHEST_PRIORITY })
    } else {
      const indexVersion = this.luceneHelper.getIndexVersion()
      logger.info(() => `Lucene index version: ${indexVersion}`)
      if (indexVersion < 6) {
        this.taskEmitter.upgradeIndex({ priority: HIGHEST_PRIORITY }) // upgrade index to Lucene 9.x
        this.taskEmitter.rebuildIndex({ priority: HIGHEST_PRIORITY, entities: new Set([LuceneEntity.Series]) })
      } else if (indexVersion < 8) this.taskEmitter.rebuildIndex({ priority: HIGHEST_PRIORITY, entities: new Set([LuceneEntity.Series]) })
    }
  }
}

// @Profile("!test") @Component
component(SearchIndexController, {
  profile: '!test',
  inject: [LuceneHelper, TaskEmitter],
  eventListeners: [{ method: 'createIndexIfNoneExist', events: [ApplicationReadyEvent] }],
})
