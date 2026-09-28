// Jeu de données réaliste partagé par les oracles des DAO (N-Z et Dto), miroir exact de
// komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/NzDaoSeed.kt (branche unit-oracles).
// Ids et dates fixes ; les dates posées par la base (CREATED_DATE, LAST_MODIFIED_DATE) sont écrasées par des valeurs fixes.
import { Duration, LocalDate, LocalDateTime, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { AgeRestriction, AllowExclude } from '../../../../../src/domain/model/AgeRestriction.js'
import { AlternateTitle } from '../../../../../src/domain/model/AlternateTitle.js'
import { Author } from '../../../../../src/domain/model/Author.js'
import { Book } from '../../../../../src/domain/model/Book.js'
import { BookMetadata } from '../../../../../src/domain/model/BookMetadata.js'
import { BookMetadataAggregation } from '../../../../../src/domain/model/BookMetadataAggregation.js'
import { BookPage } from '../../../../../src/domain/model/BookPage.js'
import { ContentRestrictions } from '../../../../../src/domain/model/ContentRestrictions.js'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { Library } from '../../../../../src/domain/model/Library.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { MediaProfile } from '../../../../../src/domain/model/MediaProfile.js'
import { ReadList } from '../../../../../src/domain/model/ReadList.js'
import { ReadProgress } from '../../../../../src/domain/model/ReadProgress.js'
import { ReadStatus } from '../../../../../src/domain/model/ReadStatus.js'
import { SearchCondition as SC } from '../../../../../src/domain/model/SearchCondition.js'
import { SearchOperator as SO } from '../../../../../src/domain/model/SearchOperator.js'
import { Series } from '../../../../../src/domain/model/Series.js'
import { SeriesCollection } from '../../../../../src/domain/model/SeriesCollection.js'
import { SeriesMetadata } from '../../../../../src/domain/model/SeriesMetadata.js'
import { ThumbnailBook } from '../../../../../src/domain/model/ThumbnailBook.js'
import { UserRoles } from '../../../../../src/domain/model/UserRoles.js'
import { WebLink } from '../../../../../src/domain/model/WebLink.js'
import { SearchIndexLifecycle } from '../../../../../src/infrastructure/search/SearchIndexLifecycle.js'
import { sortedMapOf } from '../../../../../src/port/extra-metadata.js'
import { URI, URL } from '../../../../../src/port/java-net.js'
import type { OracleDb } from '../../../db.js'

export const dt = (month: number, day: number, hour = 0) => LocalDateTime.of(2020, month, day, hour, 0)

export const u1 = new KomgaUser({ email: 'admin@example.org', password: 'p', roles: new Set([UserRoles.ADMIN]), id: 'U1', createdDate: dt(1, 1) })
export const u2 = new KomgaUser({
  email: 'kid@example.org',
  password: 'p',
  sharedLibrariesIds: new Set(['L1', 'L2']),
  sharedAllLibraries: false,
  restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }) }),
  id: 'U2',
  createdDate: dt(1, 1),
})
export const u3 = new KomgaUser({
  email: 'noadult@example.org',
  password: 'p',
  sharedLibrariesIds: new Set(['L2']),
  sharedAllLibraries: false,
  restrictions: new ContentRestrictions({ labelsExclude: new Set(['adult']) }),
  id: 'U3',
  createdDate: dt(1, 1),
})
export const u4 = new KomgaUser({
  email: 'teen@example.org',
  password: 'p',
  restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 16, restriction: AllowExclude.EXCLUDE }), labelsAllow: new Set(['kids']) }),
  id: 'U4',
  createdDate: dt(1, 1),
})

const libDir = (lib: string) => (lib === 'L1' ? 'lib1' : 'lib2')

function series(id: string, lib: string, name: string, { deleted = false, oneshot = false } = {}): Series {
  return new Series({
    name,
    url: new URL(`file:/${libDir(lib)}/${name.replaceAll(' ', '%20')}`),
    fileLastModified: dt(2, 1),
    id,
    libraryId: lib,
    deletedDate: deleted ? dt(6, 1) : null,
    oneshot,
    createdDate: dt(1, 1),
  })
}

export const allSeries = [
  series('S1', 'L1', 'Batman'),
  series('S2', 'L1', 'Élan'),
  series('S3', 'L2', 'Naruto'),
  series('S4', 'L2', 'zorro', { deleted: true }),
  series('S5', 'L1', 'Æon Flux', { oneshot: true }),
  series('S6', 'L2', 'Ångström'),
]

export const bookCounts = new Map([
  ['S1', 3],
  ['S2', 2],
  ['S3', 3],
  ['S4', 1],
  ['S5', 1],
  ['S6', 1],
])

export const seriesMetadata = [
  new SeriesMetadata({
    status: SeriesMetadata.Status.ONGOING,
    title: 'Batman',
    summary: 'The dark knight',
    readingDirection: SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT,
    publisher: 'DC Comics',
    ageRating: 12,
    language: 'en',
    genres: new Set(['Superhero', 'Action']),
    tags: new Set(['dark', 'hero']),
    totalBookCount: 3,
    sharingLabels: new Set(['kids']),
    links: [new WebLink({ label: 'wiki', url: new URI('https://en.wikipedia.org/wiki/Batman') })],
    alternateTitles: [new AlternateTitle({ label: 'fr', title: "L'homme chauve-souris" })],
    titleLock: true,
    seriesId: 'S1',
  }),
  new SeriesMetadata({
    status: SeriesMetadata.Status.ENDED,
    title: 'Élan vital',
    titleSort: 'Elan vital',
    publisher: 'Dupuis',
    language: 'fr',
    genres: new Set(['drama']),
    tags: new Set(['hero']),
    totalBookCount: 2,
    seriesId: 'S2',
  }),
  new SeriesMetadata({
    status: SeriesMetadata.Status.ONGOING,
    title: 'ナルト',
    titleSort: 'Naruto',
    readingDirection: SeriesMetadata.ReadingDirection.RIGHT_TO_LEFT,
    publisher: 'Shueisha',
    ageRating: 16,
    language: 'ja',
    genres: new Set(['action', 'shonen']),
    tags: new Set(['ninja']),
    totalBookCount: 72,
    sharingLabels: new Set(['adult']),
    alternateTitles: [new AlternateTitle({ label: 'en', title: 'Naruto' }), new AlternateTitle({ label: 'romaji', title: 'Naruto' })],
    seriesId: 'S3',
  }),
  new SeriesMetadata({
    status: SeriesMetadata.Status.ABANDONED,
    title: 'zorro',
    publisher: 'dc comics',
    ageRating: 7,
    language: 'es',
    seriesId: 'S4',
  }),
  new SeriesMetadata({
    status: SeriesMetadata.Status.ENDED,
    title: 'Æon Flux',
    titleSort: 'Aeon Flux',
    ageRating: 18,
    language: 'en',
    totalBookCount: 1,
    sharingLabels: new Set(['adult']),
    seriesId: 'S5',
  }),
  new SeriesMetadata({
    status: SeriesMetadata.Status.HIATUS,
    title: 'Ångström',
    titleSort: 'Angstrom',
    publisher: 'Kōdansha',
    ageRating: 18,
    language: 'sv',
    genres: new Set(['science']),
    sharingLabels: new Set(['adult', 'kids']),
    seriesId: 'S6',
  }),
]

function book(
  id: string,
  seriesId: string,
  lib: string,
  name: string,
  number: number,
  size: number,
  hash: string,
  { deleted = false, oneshot = false } = {},
): Book {
  return new Book({
    name,
    url: new URL(`file:/${libDir(lib)}/${seriesId}/${name.replaceAll(' ', '%20')}.cbz`),
    fileLastModified: dt(2, 2),
    fileSize: size,
    fileHash: hash,
    fileHashKoreader: hash === '' ? '' : `K${hash}`,
    number,
    id,
    seriesId,
    libraryId: lib,
    deletedDate: deleted ? dt(6, 2) : null,
    oneshot,
    createdDate: dt(1, 1),
  })
}

export const books = [
  book('B1', 'S1', 'L1', 'Batman 001', 1, 1000, 'H1'),
  book('B2', 'S1', 'L1', 'Batman 002', 2, 2000, 'H2'),
  book('B3', 'S1', 'L1', 'Batman 003', 3, 1000, 'H1'),
  book('B4', 'S2', 'L1', 'Élan 1', 1, 500, ''),
  book('B5', 'S2', 'L1', 'Élan 2', 2, 600, 'H5'),
  book('B6', 'S3', 'L2', 'Naruto 1', 1, 3000, 'H6'),
  book('B7', 'S3', 'L2', 'Naruto 1.5', 2, 3100, 'H7'),
  book('B8', 'S3', 'L2', 'Naruto 2', 3, 3200, 'H8', { deleted: true }),
  book('B9', 'S4', 'L2', 'zorro 1', 1, 100, 'H9'),
  book('B10', 'S5', 'L1', 'Æon Flux', 1, 700, 'H10', { oneshot: true }),
  book('B11', 'S6', 'L2', 'Ångström 1', 1, 800, 'H11'),
]

const author = (name: string, role: string) => new Author({ name, role })

function meta(
  id: string,
  title: string,
  number: string,
  numberSort: number,
  release: LocalDate | null,
  authors: Author[] = [],
  tags: Set<string> = new Set(),
  isbn = '',
): BookMetadata {
  return new BookMetadata({ title, summary: `Summary of ${title}`, number, numberSort, releaseDate: release, authors, tags, isbn, bookId: id })
}

export const bookMetadata = [
  meta('B1', 'Year One', '1', 1, LocalDate.of(1987, 2, 1), [author('Frank Miller', 'writer'), author('David Mazzucchelli', 'penciller')], new Set(['classic']), '9781401207526'),
  meta('B2', 'Year Two', '2', 2, LocalDate.of(1987, 3, 1), [author('Frank Miller', 'writer')]),
  meta('B3', 'The Killing Joke', '3', 3, LocalDate.of(1988, 3, 29), [author('Alan Moore', 'writer'), author('Brian Bolland', 'penciller')], new Set(['classic', 'joker'])),
  meta('B4', 'Début', '1', 1, LocalDate.of(2001, 1, 1), [author('Émile Zola', 'writer')]),
  meta('B5', 'Fin', '2', 2, null),
  meta('B6', 'うずまきナルト', '1', 1, LocalDate.of(1999, 9, 21), [author('Masashi Kishimoto', 'writer')]),
  meta('B7', 'Special', '1.5', 1.5, LocalDate.of(2000, 1, 1), [author('Masashi Kishimoto', 'writer')], new Set(['special'])),
  meta('B8', 'Deleted', '2', 2, LocalDate.of(2000, 3, 3)),
  meta('B9', 'Zorro', '01', 1, LocalDate.of(1950, 6, 1)),
  meta('B10', 'Æon Flux', '1', 1, LocalDate.of(1995, 1, 1), [author('Peter Chung', 'writer')]),
  meta('B11', 'Ångström', '1', 1, LocalDate.of(2010, 10, 10), [], new Set(['science'])),
]

function pages(n: number, hashPrefix: string): BookPage[] {
  return Array.from(
    { length: n },
    (_, i) =>
      new BookPage({
        fileName: `p${i + 1}.jpg`,
        mediaType: 'image/jpeg',
        dimension: new Dimension({ width: 800, height: 1200 }),
        fileHash: hashPrefix === '' ? '' : `${hashPrefix}${i + 1}`,
        fileSize: 100 + i + 1,
      }),
  )
}

export const media = [
  new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: pages(3, 'PH'), bookId: 'B1' }),
  new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: pages(2, 'PX'), bookId: 'B2' }),
  new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: pages(3, 'PH'), bookId: 'B3' }),
  new Media({ status: Media.Status.READY, mediaType: 'application/x-rar-compressed; version=4', pages: pages(1, ''), bookId: 'B4' }),
  new Media({ status: Media.Status.ERROR, mediaType: null, pages: [], comment: 'ERR_1001', bookId: 'B5' }),
  new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: pages(4, 'PH'), bookId: 'B6' }),
  new Media({ status: Media.Status.READY, mediaType: 'application/pdf', pages: pages(2, 'PQ'), bookId: 'B7' }),
  new Media({ status: Media.Status.OUTDATED, mediaType: 'application/zip', pages: pages(1, ''), bookId: 'B8' }),
  new Media({ status: Media.Status.UNKNOWN, bookId: 'B9' }),
  new Media({ status: Media.Status.READY, mediaType: 'application/epub+zip', pages: pages(2, ''), bookId: 'B10' }),
  new Media({ status: Media.Status.UNSUPPORTED, mediaType: 'application/x-7z-compressed', comment: 'ERR_1002', bookId: 'B11' }),
]

function agg(authors: Author[], tags: string[], releaseDate: LocalDate, summary: string, summaryNumber: string, seriesId: string) {
  return new BookMetadataAggregation({ authors, tags: new Set(tags), releaseDate, summary, summaryNumber, seriesId })
}

export const aggregations = [
  agg([author('Frank Miller', 'writer'), author('Alan Moore', 'writer'), author('David Mazzucchelli', 'penciller')], ['classic', 'joker'], LocalDate.of(1987, 2, 1), 'Batman summary', '1', 'S1'),
  agg([author('Émile Zola', 'writer')], [], LocalDate.of(2001, 1, 1), '', '', 'S2'),
  agg([author('Masashi Kishimoto', 'writer')], ['special'], LocalDate.of(1999, 9, 21), '', '', 'S3'),
  agg([], [], LocalDate.of(1950, 6, 1), '', '', 'S4'),
  agg([author('Peter Chung', 'writer')], [], LocalDate.of(1995, 1, 1), '', '', 'S5'),
  agg([], ['science'], LocalDate.of(2010, 10, 10), '', '', 'S6'),
]

const rp = (bookId: string, userId: string, page: number, completed: boolean, readDate: LocalDateTime, deviceId = '', deviceName = '') =>
  new ReadProgress({ bookId, userId, page, completed, readDate, deviceId, deviceName })

export const readProgress = [
  rp('B1', 'U1', 3, true, LocalDateTime.of(2021, 1, 1, 10, 0)),
  rp('B2', 'U1', 1, false, LocalDateTime.of(2021, 1, 2, 10, 0), 'dev1', 'Kobo'),
  rp('B6', 'U1', 4, true, LocalDateTime.of(2021, 1, 3, 10, 0)),
  rp('B7', 'U1', 2, true, LocalDateTime.of(2021, 1, 4, 10, 0)),
  rp('B4', 'U1', 1, false, LocalDateTime.of(2021, 1, 5, 10, 0)),
  rp('B1', 'U2', 2, false, LocalDateTime.of(2021, 2, 1, 10, 0)),
  rp('B4', 'U2', 1, true, LocalDateTime.of(2021, 2, 2, 10, 0)),
  rp('B11', 'U1', 1, true, LocalDateTime.of(2021, 1, 6, 10, 0)),
]

export const collections = [
  new SeriesCollection({ name: 'Heroes', ordered: false, seriesIds: ['S1', 'S3', 'S2'], id: 'C1' }),
  new SeriesCollection({ name: 'Ordered Æ', ordered: true, seriesIds: ['S6', 'S1'], id: 'C2' }),
  new SeriesCollection({ name: 'empty', id: 'C3' }),
]

export const readLists = [
  new ReadList({
    name: 'Reading order',
    summary: 'The canonical order',
    ordered: true,
    bookIds: sortedMapOf<number, string>([1, 'B3'], [2, 'B1'], [3, 'B6']),
    id: 'RL1',
  }),
  new ReadList({ name: 'Unordered', ordered: false, bookIds: sortedMapOf<number, string>([0, 'B7'], [1, 'B4'], [2, 'B11'], [3, 'B5']), id: 'RL2' }),
  new ReadList({ name: 'Empty list', id: 'RL3' }),
]

const bytes = (n: number, f: (i: number) => number) => Uint8Array.from({ length: n }, (_, i) => f(i))

export const thumbnails = [
  new ThumbnailBook({
    thumbnail: bytes(4, (i) => i),
    url: null,
    selected: true,
    type: ThumbnailBook.Type.GENERATED,
    mediaType: 'image/jpeg',
    fileSize: 4,
    dimension: new Dimension({ width: 300, height: 400 }),
    id: 'TB1',
    bookId: 'B1',
  }),
  new ThumbnailBook({
    thumbnail: null,
    url: new URL('file:/lib1/S1/cover.jpg'),
    selected: false,
    type: ThumbnailBook.Type.SIDECAR,
    mediaType: 'image/jpeg',
    fileSize: 1234,
    dimension: new Dimension({ width: 1000, height: 1500 }),
    id: 'TB2',
    bookId: 'B1',
  }),
  new ThumbnailBook({
    thumbnail: bytes(2, () => 9),
    url: null,
    selected: true,
    type: ThumbnailBook.Type.USER_UPLOADED,
    mediaType: 'image/png',
    fileSize: 2,
    dimension: new Dimension({ width: 100, height: 100 }),
    id: 'TB3',
    bookId: 'B6',
  }),
  new ThumbnailBook({
    thumbnail: bytes(2, () => 8),
    url: null,
    selected: false,
    type: ThumbnailBook.Type.GENERATED,
    mediaType: 'image/jpeg',
    fileSize: 2,
    dimension: new Dimension({ width: 200, height: 250 }),
    id: 'TB4',
    bookId: 'B6',
  }),
]

/** Insère tout le jeu de données, fixe les dates de la base et indexe tout dans Lucene */
export function seed(db: OracleDb, lucene = false): void {
  db.libraryDao.insert(new Library({ name: 'Comics', root: new URL('file:/lib1'), id: 'L1' }))
  db.libraryDao.insert(new Library({ name: 'Mangas', root: new URL('file:/lib2'), id: 'L2' }))
  for (const u of [u1, u2, u3, u4]) db.komgaUserDao.insert(u)
  for (const s of allSeries) {
    db.seriesDao.insert(s)
    db.seriesDao.update(s.copy({ bookCount: bookCounts.get(s.id)! }), { updateModifiedTime: false })
  }
  for (const m of seriesMetadata) db.seriesMetadataDao.insert(m)
  for (const a of aggregations) db.bookMetadataAggregationDao.insert(a)
  db.bookDao.insert(books)
  db.bookMetadataDao.insert(bookMetadata)
  db.mediaDao.insert(media)
  db.readProgressDao.save(readProgress)
  for (const c of collections) db.seriesCollectionDao.insert(c)
  for (const r of readLists) db.readListDao.insert(r)
  for (const t of thumbnails) db.thumbnailBookDao.insert(t)
  fixDates(db)
  if (lucene) {
    new SearchIndexLifecycle(db.seriesCollectionDao, db.readListDao, db.bookDtoDao, db.seriesDtoDao, db.lucene).rebuildIndex()
  }
}

const tables = [
  'LIBRARY',
  '"USER"',
  'SERIES',
  'SERIES_METADATA',
  'BOOK_METADATA_AGGREGATION',
  'BOOK',
  'BOOK_METADATA',
  'MEDIA',
  'READ_PROGRESS',
  'COLLECTION',
  'READLIST',
  'THUMBNAIL_BOOK',
]

/** Dates fixes à la place des valeurs par défaut de la base */
export function fixDates(db: OracleDb): void {
  for (const t of tables) db.dsl.execute(`update ${t} set CREATED_DATE = '2020-01-01 08:00:00', LAST_MODIFIED_DATE = '2020-01-01 08:00:00'`)
  db.dsl.execute("update READ_PROGRESS_SERIES set LAST_MODIFIED_DATE = '2020-01-01 08:00:00'")
  const seriesDates: [string, number][] = [
    ['S1', 5],
    ['S2', 3],
    ['S3', 6],
    ['S4', 1],
    ['S5', 4],
    ['S6', 2],
  ]
  for (const [id, day] of seriesDates) {
    const modified = id === 'S2' || id === 'S3' ? `2020-05-0${day} 12:00:00` : `2020-01-0${day} 12:00:00`
    db.dsl.execute(`update SERIES set CREATED_DATE = '2020-01-0${day} 12:00:00', LAST_MODIFIED_DATE = '${modified}' where ID = '${id}'`)
  }
  books.forEach((b, i) => {
    const day = ((i * 7) % 11) + 10
    db.dsl.execute(`update BOOK set CREATED_DATE = '2020-02-${day} 12:00:00', LAST_MODIFIED_DATE = '2020-03-${day} 12:00:00' where ID = '${b.id}'`)
  })
  readProgress.forEach((r, i) => {
    db.dsl.execute(
      `update READ_PROGRESS set CREATED_DATE = '2021-03-1${i} 09:00:00', LAST_MODIFIED_DATE = '2021-04-1${i} 09:00:00' where BOOK_ID = '${r.bookId}' and USER_ID = '${r.userId}'`,
    )
  })
  db.dsl.execute("update COLLECTION set LAST_MODIFIED_DATE = '2020-07-01 00:00:00' where ID = 'C2'")
  db.dsl.execute("update READLIST set LAST_MODIFIED_DATE = '2020-07-01 00:00:00' where ID = 'RL2'")
}

const zdt = (year: number, offset = 0) => ZonedDateTime.of(year, 1, 1, 0, 0, 0, 0, ZoneOffset.ofHours(offset))
const is = <T>(value: T) => new SO.Is({ value })
const isNot = <T>(value: T) => new SO.IsNot({ value })

/** Conditions de recherche de séries (SeriesDao, SeriesDtoDao, SeriesSearchHelper), même liste que NzDaoSeed.kt */
export const seriesConditions: [string, SC.Series | null][] = [
  ['no condition', null],
  ['library is', new SC.LibraryId({ operator: is('L1') })],
  ['library is not', new SC.LibraryId({ operator: isNot('L1') })],
  ['deleted', new SC.Deleted({ operator: SO.IsTrue })],
  ['not deleted', new SC.Deleted({ operator: SO.IsFalse })],
  ['oneshot', new SC.OneShot({ operator: SO.IsTrue })],
  ['not oneshot', new SC.OneShot({ operator: SO.IsFalse })],
  ['complete', new SC.Complete({ operator: SO.IsTrue })],
  ['not complete', new SC.Complete({ operator: SO.IsFalse })],
  ['title contains without accent', new SC.Title({ operator: new SO.Contains({ value: 'elan' }) })],
  ['title contains with accent', new SC.Title({ operator: new SO.Contains({ value: 'ÅNG' }) })],
  ['title contains japanese', new SC.Title({ operator: new SO.Contains({ value: 'ルト' }) })],
  ['title begins with', new SC.Title({ operator: new SO.BeginsWith({ value: 'bat' }) })],
  ['title does not begin with', new SC.Title({ operator: new SO.DoesNotBeginWith({ value: 'Æ' }) })],
  ['title ends with', new SC.Title({ operator: new SO.EndsWith({ value: 'FLUX' }) })],
  ['title does not end with', new SC.Title({ operator: new SO.DoesNotEndWith({ value: 'm' }) })],
  ['title does not contain', new SC.Title({ operator: new SO.DoesNotContain({ value: 'a' }) })],
  ['title contains percent', new SC.Title({ operator: new SO.Contains({ value: '%' }) })],
  ['title contains underscore', new SC.Title({ operator: new SO.Contains({ value: '_' }) })],
  ['title is ignoring case', new SC.Title({ operator: is('batman') })],
  ['title is ignoring accents', new SC.Title({ operator: is('elan vital') })],
  ['title is not', new SC.Title({ operator: isNot('ZORRO') })],
  ['title sort begins with', new SC.TitleSort({ operator: new SO.BeginsWith({ value: 'a' }) })],
  ['title sort is', new SC.TitleSort({ operator: is('naruto') })],
  ['publisher is ignoring case', new SC.Publisher({ operator: is('DC COMICS') })],
  ['publisher is not', new SC.Publisher({ operator: isNot('dc comics') })],
  ['publisher is with accent', new SC.Publisher({ operator: is('kodansha') })],
  ['language is', new SC.Language({ operator: is('EN') })],
  ['language is not', new SC.Language({ operator: isNot('en') })],
  ['genre is', new SC.Genre({ operator: is('ACTION') })],
  ['genre is not', new SC.Genre({ operator: isNot('action') })],
  ['genre is null', new SC.Genre({ operator: new SO.IsNullT() })],
  ['genre is not null', new SC.Genre({ operator: new SO.IsNotNullT() })],
  ['tag is from books', new SC.Tag({ operator: is('Joker') })],
  ['tag is from series', new SC.Tag({ operator: is('hero') })],
  ['tag is not', new SC.Tag({ operator: isNot('hero') })],
  ['tag is null', new SC.Tag({ operator: new SO.IsNullT() })],
  ['tag is not null', new SC.Tag({ operator: new SO.IsNotNullT() })],
  ['sharing label is', new SC.SharingLabel({ operator: is('ADULT') })],
  ['sharing label is not', new SC.SharingLabel({ operator: isNot('kids') })],
  ['sharing label is null', new SC.SharingLabel({ operator: new SO.IsNullT() })],
  ['sharing label is not null', new SC.SharingLabel({ operator: new SO.IsNotNullT() })],
  ['age rating greater than', new SC.AgeRating({ operator: new SO.GreaterThan({ value: 16 }) })],
  ['age rating less than', new SC.AgeRating({ operator: new SO.LessThan({ value: 12 }) })],
  ['age rating is', new SC.AgeRating({ operator: is(18) })],
  ['age rating is not', new SC.AgeRating({ operator: isNot(18) })],
  ['age rating is null', new SC.AgeRating({ operator: new SO.IsNullT() })],
  ['age rating is not null', new SC.AgeRating({ operator: new SO.IsNotNullT() })],
  ['release date before', new SC.ReleaseDate({ operator: new SO.Before({ dateTime: zdt(1996, 5) }) })],
  ['release date after', new SC.ReleaseDate({ operator: new SO.After({ dateTime: zdt(1999, -10) }) })],
  ['release date in the last', new SC.ReleaseDate({ operator: new SO.IsInTheLast({ duration: Duration.ofDays(20000) }) })],
  ['release date not in the last', new SC.ReleaseDate({ operator: new SO.IsNotInTheLast({ duration: Duration.ofDays(20000) }) })],
  ['release date is null', new SC.ReleaseDate({ operator: SO.IsNull })],
  ['release date is not null', new SC.ReleaseDate({ operator: SO.IsNotNull })],
  ['read status is read', new SC.ReadStatus({ operator: is(ReadStatus.READ) })],
  ['read status is unread', new SC.ReadStatus({ operator: is(ReadStatus.UNREAD) })],
  ['read status is in progress', new SC.ReadStatus({ operator: is(ReadStatus.IN_PROGRESS) })],
  ['read status is not read', new SC.ReadStatus({ operator: isNot(ReadStatus.READ) })],
  ['read status is not unread', new SC.ReadStatus({ operator: isNot(ReadStatus.UNREAD) })],
  ['read status is not in progress', new SC.ReadStatus({ operator: isNot(ReadStatus.IN_PROGRESS) })],
  ['collection is', new SC.CollectionId({ operator: is('C1') })],
  ['collection is not', new SC.CollectionId({ operator: isNot('C1') })],
  ['series status is', new SC.SeriesStatus({ operator: is(SeriesMetadata.Status.ENDED) })],
  ['series status is not', new SC.SeriesStatus({ operator: isNot(SeriesMetadata.Status.ONGOING) })],
  ['author name', new SC.Author({ operator: is(new SC.AuthorMatch({ name: 'frank MILLER' })) })],
  ['author role', new SC.Author({ operator: is(new SC.AuthorMatch({ role: 'Writer' })) })],
  ['author name and role', new SC.Author({ operator: is(new SC.AuthorMatch({ name: 'david mazzucchelli', role: 'writer' })) })],
  ['author empty match', new SC.Author({ operator: is(new SC.AuthorMatch()) })],
  ['author is not', new SC.Author({ operator: isNot(new SC.AuthorMatch({ name: 'Peter Chung' })) })],
  ['author is not empty match', new SC.Author({ operator: isNot(new SC.AuthorMatch()) })],
  ['any of', SC.AnyOfSeries.of(new SC.LibraryId({ operator: is('L2') }), new SC.OneShot({ operator: SO.IsTrue }))],
  [
    'all of',
    SC.AllOfSeries.of(
      new SC.LibraryId({ operator: is('L2') }),
      new SC.Deleted({ operator: SO.IsFalse }),
      new SC.AgeRating({ operator: new SO.GreaterThan({ value: 17 }) }),
    ),
  ],
  [
    'nested',
    SC.AllOfSeries.of(
      SC.AnyOfSeries.of(new SC.Genre({ operator: is('action') }), new SC.Tag({ operator: is('science') })),
      new SC.Deleted({ operator: SO.IsFalse }),
      SC.AnyOfSeries.of(new SC.CollectionId({ operator: is('C2') }), new SC.ReadStatus({ operator: is(ReadStatus.IN_PROGRESS) })),
    ),
  ],
  ['empty any of', new SC.AnyOfSeries({ conditions: [] })],
  ['empty all of', new SC.AllOfSeries({ conditions: [] })],
]

/** Conditions de recherche de livres (BookDtoDao, BookSearchHelper), même liste que NzDaoSeed.kt */
export const bookConditions: [string, SC.Book | null][] = [
  ['no condition', null],
  ['library is', new SC.LibraryId({ operator: is('L2') })],
  ['library is not', new SC.LibraryId({ operator: isNot('L2') })],
  ['series is', new SC.SeriesId({ operator: is('S1') })],
  ['series is not', new SC.SeriesId({ operator: isNot('S1') })],
  ['read list is', new SC.ReadListId({ operator: is('RL1') })],
  ['read list is not', new SC.ReadListId({ operator: isNot('RL1') })],
  ['title contains', new SC.Title({ operator: new SO.Contains({ value: 'YEAR' }) })],
  ['title is', new SC.Title({ operator: is('the killing joke') })],
  ['title begins with without accent', new SC.Title({ operator: new SO.BeginsWith({ value: 'debut' }) })],
  ['title does not contain', new SC.Title({ operator: new SO.DoesNotContain({ value: 'e' }) })],
  ['deleted', new SC.Deleted({ operator: SO.IsTrue })],
  ['not deleted', new SC.Deleted({ operator: SO.IsFalse })],
  ['oneshot', new SC.OneShot({ operator: SO.IsTrue })],
  ['not oneshot', new SC.OneShot({ operator: SO.IsFalse })],
  ['release date before', new SC.ReleaseDate({ operator: new SO.Before({ dateTime: zdt(1990) }) })],
  ['release date after', new SC.ReleaseDate({ operator: new SO.After({ dateTime: zdt(2000, 2) }) })],
  ['release date is null', new SC.ReleaseDate({ operator: SO.IsNull })],
  ['release date is not null', new SC.ReleaseDate({ operator: SO.IsNotNull })],
  ['number sort greater than', new SC.NumberSort({ operator: new SO.GreaterThan({ value: 1.5 }) })],
  ['number sort less than', new SC.NumberSort({ operator: new SO.LessThan({ value: 1 }) })],
  ['number sort is', new SC.NumberSort({ operator: is(1.5) })],
  ['number sort is not', new SC.NumberSort({ operator: isNot(1) })],
  ['tag is', new SC.Tag({ operator: is('CLASSIC') })],
  ['tag is not', new SC.Tag({ operator: isNot('classic') })],
  ['tag is null', new SC.Tag({ operator: new SO.IsNullT() })],
  ['tag is not null', new SC.Tag({ operator: new SO.IsNotNullT() })],
  ['read status is read', new SC.ReadStatus({ operator: is(ReadStatus.READ) })],
  ['read status is unread', new SC.ReadStatus({ operator: is(ReadStatus.UNREAD) })],
  ['read status is in progress', new SC.ReadStatus({ operator: is(ReadStatus.IN_PROGRESS) })],
  ['read status is not read', new SC.ReadStatus({ operator: isNot(ReadStatus.READ) })],
  ['read status is not unread', new SC.ReadStatus({ operator: isNot(ReadStatus.UNREAD) })],
  ['read status is not in progress', new SC.ReadStatus({ operator: isNot(ReadStatus.IN_PROGRESS) })],
  ['media status is', new SC.MediaStatus({ operator: is(Media.Status.READY) })],
  ['media status is not', new SC.MediaStatus({ operator: isNot(Media.Status.READY) })],
  ['media profile divina', new SC.MediaProfile({ operator: is(MediaProfile.DIVINA) })],
  ['media profile pdf', new SC.MediaProfile({ operator: is(MediaProfile.PDF) })],
  ['media profile epub', new SC.MediaProfile({ operator: is(MediaProfile.EPUB) })],
  ['media profile is not divina', new SC.MediaProfile({ operator: isNot(MediaProfile.DIVINA) })],
  ['author name', new SC.Author({ operator: is(new SC.AuthorMatch({ name: 'FRANK miller' })) })],
  ['author role', new SC.Author({ operator: is(new SC.AuthorMatch({ role: 'penciller' })) })],
  ['author name and role', new SC.Author({ operator: is(new SC.AuthorMatch({ name: 'emile zola', role: 'WRITER' })) })],
  ['author empty match', new SC.Author({ operator: is(new SC.AuthorMatch()) })],
  ['author is not', new SC.Author({ operator: isNot(new SC.AuthorMatch({ name: 'Masashi Kishimoto' })) })],
  ['poster generated', new SC.Poster({ operator: is(new SC.PosterMatch({ type: SC.PosterMatch.Type.GENERATED })) })],
  ['poster selected', new SC.Poster({ operator: is(new SC.PosterMatch({ selected: true })) })],
  ['poster sidecar not selected', new SC.Poster({ operator: is(new SC.PosterMatch({ type: SC.PosterMatch.Type.SIDECAR, selected: false })) })],
  ['poster is not user uploaded', new SC.Poster({ operator: isNot(new SC.PosterMatch({ type: SC.PosterMatch.Type.USER_UPLOADED })) })],
  ['poster empty match', new SC.Poster({ operator: is(new SC.PosterMatch()) })],
  ['any of', SC.AnyOfBook.of(new SC.SeriesId({ operator: is('S2') }), new SC.OneShot({ operator: SO.IsTrue }))],
  ['all of', SC.AllOfBook.of(new SC.LibraryId({ operator: is('L1') }), new SC.MediaStatus({ operator: is(Media.Status.READY) }))],
  [
    'nested',
    SC.AllOfBook.of(
      SC.AnyOfBook.of(new SC.Tag({ operator: is('classic') }), new SC.ReadListId({ operator: is('RL2') })),
      new SC.Deleted({ operator: SO.IsFalse }),
    ),
  ],
  ['empty any of', new SC.AnyOfBook({ conditions: [] })],
  ['empty all of', new SC.AllOfBook({ conditions: [] })],
]
