// Données partagées des tests à oracle de search, miroir de `SearchSamples` côté Kotlin
// (komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/search/SearchSamples.kt, branche unit-oracles).
import { readFileSync } from 'node:fs'
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import { LuceneEntity } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { LuceneHelper } from '../../../../src/infrastructure/search/LuceneHelper.js'
import { LuceneSyncCommitter } from '../../../../src/infrastructure/search/LuceneSyncCommitter.js'
import { MultiLingualAnalyzer } from '../../../../src/infrastructure/search/MultiLingualAnalyzer.js'
import { MultiLingualNGramAnalyzer } from '../../../../src/infrastructure/search/MultiLingualNGramAnalyzer.js'
import { AlternateTitleDto } from '../../../../src/interfaces/api/rest/dto/AlternateTitleDto.js'
import { AuthorDto } from '../../../../src/interfaces/api/rest/dto/AuthorDto.js'
import { BookDto, BookMetadataDto, MediaDto } from '../../../../src/interfaces/api/rest/dto/BookDto.js'
import { BookMetadataAggregationDto, SeriesDto, SeriesMetadataDto } from '../../../../src/interfaces/api/rest/dto/SeriesDto.js'
import type { Analyzer } from '../../../../src/port/lucene/analysis.js'
import { type Document, Field } from '../../../../src/port/lucene/document.js'
import { IndexWriter, IndexWriterConfig } from '../../../../src/port/lucene/index.js'
import { SearcherFactory, SearcherManager } from '../../../../src/port/lucene/search.js'
import { ByteBuffersDirectory, type Directory } from '../../../../src/port/lucene/store.js'

type BookJson = {
  id: string
  seriesId: string
  title: string
  isbn: string
  tags: string[]
  authors: [string, string][]
  releaseDate: string | null
  status: string
  deleted: boolean
  oneshot: boolean
}
type SeriesJson = {
  id: string
  title: string
  titleSort: string
  alternateTitles: [string, string][]
  publisher: string
  status: string
  readingDirection: string
  ageRating: number | null
  language: string
  tags: string[]
  booksTags: string[]
  genres: string[]
  sharingLabels: string[]
  totalBookCount: number | null
  booksCount: number
  authors: [string, string][]
  releaseDate: string | null
  deleted: boolean
  oneshot: boolean
}
type Corpus = {
  texts: string[]
  queries: (string | null)[]
  books: BookJson[]
  series: SeriesJson[]
  collections: [string, string][]
  readLists: [string, string][]
}

const corpus = JSON.parse(readFileSync(new URL('./search-corpus.json', import.meta.url), 'utf8')) as Corpus

const date = LocalDateTime.of(2020, 1, 1, 0, 0)

const authors = (a: [string, string][]) => a.map(([name, role]) => new AuthorDto({ name, role }))
const localDate = (d: string | null) => (d !== null ? LocalDate.parse(d) : null)

/** Entrées des analyseurs */
export const texts = corpus.texts

/** Termes de recherche (null compris) */
export const queries = corpus.queries

export const books: BookDto[] = corpus.books.map(
  (it) =>
    new BookDto({
      id: it.id,
      seriesId: it.seriesId,
      seriesTitle: '',
      libraryId: 'LIBRARY',
      name: it.title,
      url: `file:/komga/${it.id}.cbz`,
      number: 1,
      created: date,
      lastModified: date,
      fileLastModified: date,
      sizeBytes: 0,
      media: new MediaDto({ status: it.status, mediaType: 'application/zip', pagesCount: 1, comment: '', epubDivinaCompatible: false, epubIsKepub: false }),
      metadata: new BookMetadataDto({
        title: it.title,
        titleLock: false,
        summary: '',
        summaryLock: false,
        number: '1',
        numberLock: false,
        numberSort: 1,
        numberSortLock: false,
        releaseDate: localDate(it.releaseDate),
        releaseDateLock: false,
        authors: authors(it.authors),
        authorsLock: false,
        tags: new Set(it.tags),
        tagsLock: false,
        isbn: it.isbn,
        isbnLock: false,
        links: [],
        linksLock: false,
        created: date,
        lastModified: date,
      }),
      deleted: it.deleted,
      fileHash: '',
      oneshot: it.oneshot,
    }),
)

export const series: SeriesDto[] = corpus.series.map(
  (it) =>
    new SeriesDto({
      id: it.id,
      libraryId: 'LIBRARY',
      name: it.title,
      url: `file:/komga/${it.id}`,
      created: date,
      lastModified: date,
      fileLastModified: date,
      booksCount: it.booksCount,
      booksReadCount: 0,
      booksUnreadCount: 0,
      booksInProgressCount: 0,
      metadata: new SeriesMetadataDto({
        status: it.status,
        statusLock: false,
        title: it.title,
        titleLock: false,
        titleSort: it.titleSort,
        titleSortLock: false,
        summary: '',
        summaryLock: false,
        readingDirection: it.readingDirection,
        readingDirectionLock: false,
        publisher: it.publisher,
        publisherLock: false,
        ageRating: it.ageRating,
        ageRatingLock: false,
        language: it.language,
        languageLock: false,
        genres: new Set(it.genres),
        genresLock: false,
        tags: new Set(it.tags),
        tagsLock: false,
        totalBookCount: it.totalBookCount,
        totalBookCountLock: false,
        sharingLabels: new Set(it.sharingLabels),
        sharingLabelsLock: false,
        links: [],
        linksLock: false,
        alternateTitles: it.alternateTitles.map(([label, title]) => new AlternateTitleDto({ label, title })),
        alternateTitlesLock: false,
        created: date,
        lastModified: date,
      }),
      booksMetadata: new BookMetadataAggregationDto({
        authors: authors(it.authors),
        tags: new Set(it.booksTags),
        releaseDate: localDate(it.releaseDate),
        summary: '',
        summaryNumber: '',
        created: date,
        lastModified: date,
      }),
      deleted: it.deleted,
      oneshot: it.oneshot,
    }),
)

export const collections: SeriesCollection[] = corpus.collections.map(([id, name]) => new SeriesCollection({ name, id, createdDate: date }))

export const readLists: ReadList[] = corpus.readLists.map(([id, name]) => new ReadList({ name, id, createdDate: date }))

/** Jetons de `text` : terme, positions, incrément et longueur de position, type ; puis position finale et incrément */
export function tokens(analyzer: Analyzer, text: string, field = 'title'): unknown[] {
  const ts = analyzer.tokenStream(field, text)
  try {
    const a = ts.attributes
    const out: unknown[] = []
    ts.reset()
    while (ts.incrementToken()) out.push([a.termAtt.toString(), a.startOffset, a.endOffset, a.positionIncrement, a.positionLength, a.type])
    ts.end()
    out.push(['end', a.endOffset, a.positionIncrement])
    return out
  } finally {
    ts.close()
  }
}

/** Champs d'un document : nom, valeur, stocké, découpé */
export function fields(doc: Document): unknown[] {
  return doc.getFields().map((it) => [it.name, it.stringValue(), it.store === Field.Store.YES, it.tokenized])
}

/** Ordre de `String.compareTo` (unités UTF-16) */
function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export class Index {
  readonly indexAnalyzer = new MultiLingualNGramAnalyzer(3, 10, true)
  readonly searchAnalyzer = new MultiLingualAnalyzer()
  readonly writer: IndexWriter
  readonly searcherManager: SearcherManager
  readonly helper: LuceneHelper

  constructor(readonly directory: Directory = new ByteBuffersDirectory()) {
    this.writer = new IndexWriter(directory, new IndexWriterConfig(this.indexAnalyzer))
    this.searcherManager = new SearcherManager(this.writer, new SearcherFactory())
    this.helper = new LuceneHelper(directory, this.searchAnalyzer, this.indexAnalyzer, this.writer, this.searcherManager, new LuceneSyncCommitter(this.writer, this.searcherManager))
  }

  /** Résultats de chaque requête, pour `entities` */
  searchAll(entities: LuceneEntity[] = LuceneEntity.entries()): unknown[] {
    return entities.map((entity) => [entity, queries.map((q) => this.helper.searchEntitiesIds(q, entity))])
  }

  /**
   * Résultats de chaque requête en ids triés, pour un index contenant des documents supprimés : Lucene les compte dans
   * les statistiques BM25 jusqu'à la fusion de leur segment, l'ordre de pertinence dépend donc des fusions (PORTING.md)
   */
  searchAllSorted(entities: LuceneEntity[] = LuceneEntity.entries()): unknown[] {
    return entities.map((entity) => [entity, queries.map((q) => this.helper.searchEntitiesIds(q, entity)?.sort(compareUtf16) ?? null)])
  }
}
