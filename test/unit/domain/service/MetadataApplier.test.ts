// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/MetadataApplierOracleTest.kt
import { LocalDate } from '@js-joda/core'
import { Author } from '../../../../src/domain/model/Author.js'
import { BookMetadata } from '../../../../src/domain/model/BookMetadata.js'
import { BookMetadataPatch } from '../../../../src/domain/model/BookMetadataPatch.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { SeriesMetadataPatch } from '../../../../src/domain/model/SeriesMetadataPatch.js'
import { WebLink } from '../../../../src/domain/model/WebLink.js'
import { MetadataApplier } from '../../../../src/domain/service/MetadataApplier.js'
import { URI } from '../../../../src/port/java-net.js'
import { oracle } from '../../oracle.js'
import { date } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/MetadataApplier')

const applier = new MetadataApplier()

const book = new BookMetadata({
  title: 'title',
  summary: 'summary',
  number: '1',
  numberSort: 1,
  releaseDate: LocalDate.of(2000, 1, 1),
  authors: [new Author({ name: 'a', role: 'writer' })],
  tags: new Set(['t']),
  isbn: '9780000000002',
  links: [new WebLink({ label: 'l', url: new URI('https://example.org') })],
  bookId: 'B',
  createdDate: date,
})

const bookLocked = book.copy({
  titleLock: true,
  summaryLock: true,
  numberLock: true,
  numberSortLock: true,
  releaseDateLock: true,
  authorsLock: true,
  tagsLock: true,
  isbnLock: true,
  linksLock: true,
})

const fullBookPatch = new BookMetadataPatch({
  title: 'new title',
  summary: '',
  number: '2',
  numberSort: 2.5,
  releaseDate: LocalDate.of(2010, 2, 3),
  authors: [],
  isbn: '',
  links: [new WebLink({ label: 'x', url: new URI('https://x.org') })],
  tags: new Set(),
  readLists: [new BookMetadataPatch.ReadListEntry({ name: 'rl', number: 1 })],
})

const series = new SeriesMetadata({
  status: SeriesMetadata.Status.ONGOING,
  title: 'title',
  titleSort: 'sort',
  summary: 'summary',
  readingDirection: SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT,
  publisher: 'pub',
  ageRating: 12,
  language: 'en',
  genres: new Set(['g']),
  tags: new Set(['t']),
  totalBookCount: 5,
  seriesId: 'S',
  createdDate: date,
})

const seriesLocked = series.copy({
  statusLock: true,
  titleLock: true,
  titleSortLock: true,
  summaryLock: true,
  readingDirectionLock: true,
  publisherLock: true,
  ageRatingLock: true,
  languageLock: true,
  genresLock: true,
  totalBookCountLock: true,
})

const fullSeriesPatch = new SeriesMetadataPatch({
  title: 'new',
  titleSort: 'new sort',
  status: SeriesMetadata.Status.ENDED,
  summary: '',
  readingDirection: SeriesMetadata.ReadingDirection.WEBTOON,
  publisher: '',
  ageRating: 0,
  language: 'fr',
  genres: new Set(),
  totalBookCount: 0,
  collections: new Set(['c']),
})

const emptySeriesPatch = new SeriesMetadataPatch({
  title: null,
  titleSort: null,
  status: null,
  summary: null,
  readingDirection: null,
  publisher: null,
  ageRating: null,
  language: null,
  genres: null,
  totalBookCount: null,
  collections: new Set(),
})

func('apply@21', () => {
  kase('empty patch', () => applier.apply(new BookMetadataPatch({}), book))
  kase('full patch', () => applier.apply(fullBookPatch, book))
  kase('full patch, all locked', () => applier.apply(fullBookPatch, bookLocked))
  kase('title only', () => applier.apply(new BookMetadataPatch({ title: 't2' }), book))
  kase('title locked, summary unlocked', () => applier.apply(new BookMetadataPatch({ title: 't2', summary: 's2' }), book.copy({ titleLock: true })))
  kase('tags locked', () => applier.apply(new BookMetadataPatch({ tags: new Set(['x']) }), book.copy({ tagsLock: true })))
  kase('authors unlocked', () => applier.apply(new BookMetadataPatch({ authors: [new Author({ name: 'b', role: 'penciller' })] }), book.copy({ tagsLock: true })))
})
func('apply@39', () => {
  kase('empty patch', () => applier.apply(emptySeriesPatch, series))
  kase('full patch', () => applier.apply(fullSeriesPatch, series))
  kase('full patch, all locked', () => applier.apply(fullSeriesPatch, seriesLocked))
  kase('status only', () => applier.apply(emptySeriesPatch.copy({ status: SeriesMetadata.Status.HIATUS }), series))
  kase('title locked, titleSort unlocked', () => applier.apply(emptySeriesPatch.copy({ title: 'x', titleSort: 'y' }), series.copy({ titleLock: true })))
  kase('null fields reset nothing', () => applier.apply(emptySeriesPatch, series.copy({ readingDirection: null, ageRating: null, totalBookCount: null })))
})
func('getIfNotLocked', () => {
  kase('patched value, unlocked', () => applier.apply(new BookMetadataPatch({ isbn: '123' }), book).isbn)
  kase('patched value, locked', () => applier.apply(new BookMetadataPatch({ isbn: '123' }), book.copy({ isbnLock: true })).isbn)
  kase('null patch, unlocked', () => applier.apply(new BookMetadataPatch({ isbn: null }), book).isbn)
  kase('null patch, locked', () => applier.apply(new BookMetadataPatch({}), book.copy({ isbnLock: true })).isbn)
  kase('nullable field patched', () => applier.apply(emptySeriesPatch.copy({ ageRating: 18 }), series.copy({ ageRating: null })).ageRating)
})
