// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/search/LuceneConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Analyzer } from '../../port/lucene/analysis.js'
import { IndexWriter, IndexWriterConfig } from '../../port/lucene/index.js'
import { SearcherFactory, SearcherManager } from '../../port/lucene/search.js'
import { ByteBuffersDirectory, Directory, FSDirectory, SingleInstanceLockFactory } from '../../port/lucene/store.js'
import { configuration } from '../../port/spring.js'
import { KomgaProperties } from '../configuration/KomgaProperties.js'
import { MultiLingualAnalyzer } from './MultiLingualAnalyzer.js'
import { MultiLingualNGramAnalyzer } from './MultiLingualNGramAnalyzer.js'

export class LuceneConfiguration {
  constructor(private readonly komgaProperties: KomgaProperties) {}

  indexAnalyzer() {
    const it = this.komgaProperties.lucene.indexAnalyzer
    return new MultiLingualNGramAnalyzer(it.minGram, it.maxGram, it.preserveOriginal)
  }

  searchAnalyzer() {
    return new MultiLingualAnalyzer()
  }

  memoryDirectory(): Directory {
    return new ByteBuffersDirectory()
  }

  diskDirectory(): Directory {
    // PORT: Paths.get(...) -> chemin tel quel
    return FSDirectory.open(this.komgaProperties.lucene.dataDirectory, new SingleInstanceLockFactory())
  }

  indexWriter(directory: Directory, indexAnalyzer: Analyzer): IndexWriter {
    return new IndexWriter(directory, new IndexWriterConfig(indexAnalyzer))
  }

  searcherManager(indexWriter: IndexWriter) {
    return new SearcherManager(indexWriter, new SearcherFactory())
  }
}

// @Configuration
// PORT: injection par nom de paramètre (indexAnalyzer) -> qualificateur explicite
configuration(LuceneConfiguration, {
  inject: [KomgaProperties],
  beans: [
    { method: 'indexAnalyzer', type: MultiLingualNGramAnalyzer },
    { method: 'searchAnalyzer', type: MultiLingualAnalyzer },
    { method: 'memoryDirectory', type: Directory, profile: 'test' },
    { method: 'diskDirectory', type: Directory, profile: '!test' },
    { method: 'indexWriter', type: IndexWriter, inject: [Directory, { type: Analyzer, qualifier: 'indexAnalyzer' }] },
    { method: 'searcherManager', type: SearcherManager, inject: [IndexWriter] },
  ],
})
