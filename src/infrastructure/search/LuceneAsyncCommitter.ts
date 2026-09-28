// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/search/LuceneAsyncCommitter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type Duration, ZonedDateTime } from '@js-joda/core'
import { IndexWriter } from '../../port/lucene/index.js'
import { SearcherManager } from '../../port/lucene/search.js'
import { type ScheduledFuture, TaskScheduler } from '../../port/lucene/TaskScheduler.js'
import { component } from '../../port/spring.js'
import { KomgaProperties } from '../configuration/KomgaProperties.js'
import { LuceneCommitter } from './LuceneCommitter.js'

export class LuceneAsyncCommitter extends LuceneCommitter {
  // @Volatile
  private commitFuture: ScheduledFuture | null = null

  private readonly commitRunnable = () => {
    this.indexWriter.commit()
    this.searcherManager.maybeRefresh()
  }

  constructor(
    private readonly indexWriter: IndexWriter,
    private readonly searcherManager: SearcherManager,
    private readonly taskScheduler: TaskScheduler,
    private readonly commitDelay: Duration,
  ) {
    super()
  }

  commitAndMaybeRefresh(): void {
    if (this.commitFuture === null || this.commitFuture.isDone()) this.commitFuture = this.taskScheduler.schedule(this.commitRunnable, ZonedDateTime.now().plus(this.commitDelay).toInstant())
  }
}

// @Profile("!test") @Component
component(LuceneAsyncCommitter, {
  inject: [IndexWriter, SearcherManager, TaskScheduler, { expression: (ctx) => ctx.getBean(KomgaProperties).lucene.commitDelay }],
  profile: '!test',
})
