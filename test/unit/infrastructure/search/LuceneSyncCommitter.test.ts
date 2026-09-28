// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/search/LuceneSyncCommitterOracleTest.kt
import { toDocument } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { LuceneSyncCommitter } from '../../../../src/infrastructure/search/LuceneSyncCommitter.js'
import { MultiLingualAnalyzer } from '../../../../src/infrastructure/search/MultiLingualAnalyzer.js'
import { Term } from '../../../../src/port/lucene/document.js'
import { DirectoryReader, IndexWriter, IndexWriterConfig } from '../../../../src/port/lucene/index.js'
import { SearcherFactory, SearcherManager, TermQuery } from '../../../../src/port/lucene/search.js'
import { ByteBuffersDirectory } from '../../../../src/port/lucene/store.js'
import { oracle } from '../../oracle.js'
import { series } from './searchSamples.js'

const { func, kase } = oracle('infrastructure/search/LuceneSyncCommitter')

func('commitAndMaybeRefresh', () => {
  kase('documents visible after commit', () => {
    const directory = new ByteBuffersDirectory()
    const writer = new IndexWriter(directory, new IndexWriterConfig(new MultiLingualAnalyzer()))
    const manager = new SearcherManager(writer, new SearcherFactory())
    const committer = new LuceneSyncCommitter(writer, manager)
    const query = new TermQuery(new Term('type', 'series'))
    const count = () => manager.acquire().search(query, 100).scoreDocs.length
    const out: unknown[] = [DirectoryReader.indexExists(directory), count()]
    writer.addDocuments(series.map(toDocument))
    out.push([DirectoryReader.indexExists(directory), count()])
    committer.commitAndMaybeRefresh()
    out.push([DirectoryReader.indexExists(directory), count()])
    writer.deleteDocuments(new Term('series_id', 'S1'))
    out.push(count())
    committer.commitAndMaybeRefresh()
    out.push(count())
    committer.commitAndMaybeRefresh()
    out.push(count())
    return out
  })
  kase('nothing to commit', () => {
    const directory = new ByteBuffersDirectory()
    const writer = new IndexWriter(directory, new IndexWriterConfig(new MultiLingualAnalyzer()))
    new LuceneSyncCommitter(writer, new SearcherManager(writer, new SearcherFactory())).commitAndMaybeRefresh()
    return DirectoryReader.indexExists(directory)
  })
})
