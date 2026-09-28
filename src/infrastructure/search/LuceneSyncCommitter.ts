// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/search/LuceneSyncCommitter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { IndexWriter } from '../../port/lucene/index.js'
import { SearcherManager } from '../../port/lucene/search.js'
import { component } from '../../port/spring.js'
import { LuceneCommitter } from './LuceneCommitter.js'

export class LuceneSyncCommitter extends LuceneCommitter {
  constructor(
    private readonly indexWriter: IndexWriter,
    private readonly searcherManager: SearcherManager,
  ) {
    super()
  }

  commitAndMaybeRefresh(): void {
    this.indexWriter.commit()
    this.searcherManager.maybeRefreshBlocking()
  }
}

// @Profile("test") @Component
component(LuceneSyncCommitter, { inject: [IndexWriter, SearcherManager], profile: 'test' })
