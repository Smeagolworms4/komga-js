// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/search/LuceneAsyncCommitterOracleTest.kt
import { Duration, Instant } from '@js-joda/core'
import { LuceneAsyncCommitter } from '../../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import { toDocument } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { MultiLingualAnalyzer } from '../../../../src/infrastructure/search/MultiLingualAnalyzer.js'
import { Term } from '../../../../src/port/lucene/document.js'
import { DirectoryReader, IndexWriter, IndexWriterConfig } from '../../../../src/port/lucene/index.js'
import { SearcherFactory, SearcherManager, TermQuery } from '../../../../src/port/lucene/search.js'
import type { ScheduledFuture, TaskScheduler } from '../../../../src/port/lucene/TaskScheduler.js'
import { ByteBuffersDirectory } from '../../../../src/port/lucene/store.js'
import { oracle } from '../../oracle.js'
import { books } from './searchSamples.js'

const { func, kase } = oracle('infrastructure/search/LuceneAsyncCommitter')

/** Planificateur qui enregistre les tâches ; leurs futures sont terminées une fois `done` positionné */
class Scheduler {
  readonly tasks: [() => void, Instant][] = []
  done = false
  readonly scheduler = {
    schedule: (task: () => void, startTime: Instant): ScheduledFuture => {
      this.tasks.push([task, startTime])
      return { isDone: () => this.done } as unknown as ScheduledFuture
    },
  } as unknown as TaskScheduler
}

func('commitAndMaybeRefresh', () => {
  for (const delay of [Duration.ofSeconds(2), Duration.ZERO, Duration.ofMinutes(5)]) {
    kase(`delay ${delay}`, () => {
      const directory = new ByteBuffersDirectory()
      const writer = new IndexWriter(directory, new IndexWriterConfig(new MultiLingualAnalyzer()))
      const manager = new SearcherManager(writer, new SearcherFactory())
      const s = new Scheduler()
      const committer = new LuceneAsyncCommitter(writer, manager, s.scheduler, delay)
      const query = new TermQuery(new Term('type', 'book'))
      const count = () => manager.acquire().search(query, 100).scoreDocs.length
      const out: unknown[] = []
      const start = Instant.now()
      writer.addDocuments(books.map(toDocument))
      committer.commitAndMaybeRefresh()
      committer.commitAndMaybeRefresh()
      committer.commitAndMaybeRefresh()
      const end = Instant.now()
      // planifiée à maintenant + délai
      out.push([s.tasks.length, !s.tasks[0]![1].isBefore(start.plus(delay)) && !s.tasks[0]![1].isAfter(end.plus(delay))])
      out.push([DirectoryReader.indexExists(directory), count()])
      s.tasks[0]![0]()
      out.push([DirectoryReader.indexExists(directory), count()])
      committer.commitAndMaybeRefresh()
      out.push(s.tasks.length)
      s.done = true
      committer.commitAndMaybeRefresh()
      committer.commitAndMaybeRefresh()
      out.push(s.tasks.length)
      writer.deleteDocuments(new Term('book_id', 'B1'))
      s.tasks[s.tasks.length - 1]![0]()
      out.push(count())
      return out
    })
  }
})
