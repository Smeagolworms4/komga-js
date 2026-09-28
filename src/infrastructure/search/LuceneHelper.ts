// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/search/LuceneHelper.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { isNullOrBlank } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { Analyzer } from '../../port/lucene/analysis.js'
import { Document, Field, StringField, Term } from '../../port/lucene/document.js'
import { DirectoryReader, IndexUpgrader, IndexWriter, IndexWriterConfig } from '../../port/lucene/index.js'
import { MultiFieldQueryParser, ParseException, QueryParser } from '../../port/lucene/queryparser.js'
import { BooleanClause, BooleanQuery, SearcherManager, TermQuery } from '../../port/lucene/search.js'
import { Directory } from '../../port/lucene/store.js'
import { component } from '../../port/spring.js'
import { LuceneCommitter } from './LuceneCommitter.js'
import { LuceneEntity } from './LuceneEntity.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.search.LuceneHelper')

const MAX_RESULTS = 1000

export class LuceneHelper {
  constructor(
    private readonly directory: Directory,
    private readonly searchAnalyzer: Analyzer,
    private readonly indexAnalyzer: Analyzer,
    private readonly indexWriter: IndexWriter,
    private readonly searcherManager: SearcherManager,
    private readonly luceneCommitter: LuceneCommitter,
  ) {}

  indexExists(): boolean {
    return DirectoryReader.indexExists(this.directory)
  }

  setIndexVersion(version: number): void {
    const doc = new Document()
    doc.add(new StringField('index_version', String(version), Field.Store.YES))
    doc.add(new StringField('type', 'index_version', Field.Store.NO))
    this.updateDocument(new Term('type', 'index_version'), doc)
    logger.info(() => `Lucene index version: ${this.getIndexVersion()}`)
  }

  getIndexVersion(): number {
    const searcher = this.searcherManager.acquire()
    const topDocs = searcher.search(new TermQuery(new Term('type', 'index_version')), 1)
    const first = topDocs.scoreDocs.map((it) => searcher.storedFields().document(it.doc).get('index_version'))[0] ?? null
    // String.toIntOrNull()
    const n = first !== null && /^[+-]?\d+$/.test(first) ? Number(first) : null
    return n !== null && n >= -2147483648 && n <= 2147483647 ? n : 1
  }

  searchEntitiesIds(searchTerm: string | null, entity: LuceneEntity): string[] | null {
    if (!isNullOrBlank(searchTerm)) {
      try {
        const fieldsQuery = (() => {
          const it = new MultiFieldQueryParser(entity.defaultFields, this.searchAnalyzer)
          it.setDefaultOperator(QueryParser.Operator.AND)
          return it
        })().parse(`${searchTerm} *:*`)

        const typeQuery = new TermQuery(new Term(LuceneEntity.TYPE, entity.type))

        const booleanQuery = new BooleanQuery.Builder().add(fieldsQuery, BooleanClause.Occur.MUST).add(typeQuery, BooleanClause.Occur.MUST).build()

        const searcher = this.searcherManager.acquire()
        const topDocs = searcher.search(booleanQuery, MAX_RESULTS)
        // PORT: Document[...] renvoie String? ; la valeur stockée est toujours présente
        return topDocs.scoreDocs.map((it) => searcher.storedFields().document(it.doc).get(entity.id) as string)
      } catch (e) {
        if (e instanceof ParseException) {
          return []
        }
        logger.error(e as Error, () => 'Error fetching entities from index')
        return []
      }
    } else {
      return null
    }
  }

  upgradeIndex(): void {
    new IndexUpgrader(this.directory, new IndexWriterConfig(this.indexAnalyzer), true).upgrade()
    logger.info(() => 'Lucene index upgraded')
  }

  addDocument(doc: Document): void {
    this.indexWriter.addDocument(doc)
    this.luceneCommitter.commitAndMaybeRefresh()
  }

  addDocuments(docs: Iterable<Document>): void {
    this.indexWriter.addDocuments(docs)
    this.luceneCommitter.commitAndMaybeRefresh()
  }

  updateDocument(term: Term, doc: Document): void {
    this.indexWriter.updateDocument(term, doc)
    this.luceneCommitter.commitAndMaybeRefresh()
  }

  deleteDocuments(term: Term): void {
    this.indexWriter.deleteDocuments(term)
    this.luceneCommitter.commitAndMaybeRefresh()
  }
}

// @Component
// PORT: injection par nom de paramètre (searchAnalyzer, indexAnalyzer) -> qualificateurs explicites
component(LuceneHelper, {
  inject: [Directory, { type: Analyzer, qualifier: 'searchAnalyzer' }, { type: Analyzer, qualifier: 'indexAnalyzer' }, IndexWriter, SearcherManager, LuceneCommitter],
  // PORT: un seul index (en mémoire, journal sur disque) dans le thread principal ; les tâches du worker l'appellent
  // dans ce thread (port/task-worker.ts)
  taskWorker: 'callMain',
})
