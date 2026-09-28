// Petite bibliothèque des oracles de contrôleurs, écrite par les vrais DAO : miroir de
// komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/RestSamples.kt (ids et dates fixes).
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { AgeRestriction, AllowExclude } from '../../../../../src/domain/model/AgeRestriction.js'
import { Author } from '../../../../../src/domain/model/Author.js'
import { Book } from '../../../../../src/domain/model/Book.js'
import { BookMetadata } from '../../../../../src/domain/model/BookMetadata.js'
import { BookMetadataAggregation } from '../../../../../src/domain/model/BookMetadataAggregation.js'
import { BookPage } from '../../../../../src/domain/model/BookPage.js'
import { ContentRestrictions } from '../../../../../src/domain/model/ContentRestrictions.js'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { Library } from '../../../../../src/domain/model/Library.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { ReadList } from '../../../../../src/domain/model/ReadList.js'
import { ReadProgress } from '../../../../../src/domain/model/ReadProgress.js'
import { Series } from '../../../../../src/domain/model/Series.js'
import { SeriesCollection } from '../../../../../src/domain/model/SeriesCollection.js'
import { SeriesMetadata } from '../../../../../src/domain/model/SeriesMetadata.js'
import { UserRoles } from '../../../../../src/domain/model/UserRoles.js'
import { WebLink } from '../../../../../src/domain/model/WebLink.js'
import { sortedMapOf } from '../../../../../src/port/extra-metadata.js'
import { URI, URL } from '../../../../../src/port/java-net.js'
import { kFloat } from '../../../../../src/port/kotlin.js'
import type { OracleDb } from '../../../db.js'
import { fixNow, sql, user } from './rest-oracle.js'

const d = (y: number, m: number, day: number) => LocalDateTime.of(y, m, day, 10, 0, 0)

export const admin = user('ADMIN', { roles: new Set([UserRoles.ADMIN, UserRoles.FILE_DOWNLOAD, UserRoles.PAGE_STREAMING]) })
export const all = user('ALL', { roles: new Set([UserRoles.FILE_DOWNLOAD, UserRoles.PAGE_STREAMING]) })
export const l1Only = user('L1ONLY', { sharedAllLibraries: false, sharedLibrariesIds: new Set(['L1']) })
export const kids = user('KIDS', {
  restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }) }),
})
export const noAdult = user('NOADULT', { restrictions: new ContentRestrictions({ labelsExclude: new Set(['adult']) }) })
export const users = [admin, all, l1Only, kids, noAdult]

export const l1 = new Library({ name: 'Comics', root: new URL('file:/lib1'), id: 'L1', createdDate: d(2020, 1, 1) })
export const l2 = new Library({ name: 'Manga', root: new URL('file:/lib2'), id: 'L2', createdDate: d(2020, 1, 2) })

export const s1 = new Series({ name: 'Alpha', url: new URL('file:/lib1/Alpha'), fileLastModified: d(2020, 2, 1), id: 'S1', libraryId: 'L1', createdDate: d(2020, 2, 1) })
export const s2 = new Series({ name: 'beta', url: new URL('file:/lib1/beta'), fileLastModified: d(2020, 2, 2), id: 'S2', libraryId: 'L1', createdDate: d(2020, 2, 2) })
export const s3 = new Series({
  name: 'Oneshot',
  url: new URL('file:/lib2/Oneshot.cbz'),
  fileLastModified: d(2020, 2, 3),
  id: 'S3',
  libraryId: 'L2',
  oneshot: true,
  createdDate: d(2020, 2, 3),
})

const book = (id: string, series: Series, number: number, name: string) =>
  new Book({
    name,
    url: new URL(`${series.url.toString()}/${name}.cbz`),
    fileLastModified: d(2020, 3, number),
    fileSize: 1000 * number,
    fileHash: `hash${id}`,
    number,
    id,
    seriesId: series.id,
    libraryId: series.libraryId,
    oneshot: series.oneshot,
    createdDate: d(2020, 3, number + 10),
  })

export const b1 = book('B1', s1, 1, 'Alpha-1')
export const b2 = book('B2', s1, 2, 'Alpha-2')
export const b3 = book('B3', s2, 1, 'beta-1')
export const b4 = book('B4', s3, 1, 'Oneshot')
export const books = [b1, b2, b3, b4]

const media = (b: Book) =>
  new Media({
    status: Media.Status.READY,
    mediaType: 'application/zip',
    pages: [1, 2, 3].map(
      (it) => new BookPage({ fileName: `p${it}.jpg`, mediaType: 'image/jpeg', dimension: new Dimension({ width: 800, height: 1200 }), fileHash: `ph${it}`, fileSize: 100 * it }),
    ),
    bookId: b.id,
    createdDate: b.createdDate,
  })

const bookMetadata = (b: Book, release: LocalDate | null, tags: Set<string>) =>
  new BookMetadata({
    title: `${b.name} title`,
    summary: `summary ${b.id}`,
    number: String(b.number),
    numberSort: kFloat(b.number),
    releaseDate: release,
    authors: [new Author({ name: `Author ${b.seriesId}`, role: 'writer' }), new Author({ name: `Pen ${b.id}`, role: 'penciller' })],
    tags,
    isbn: '',
    links: [new WebLink({ label: 'home', url: new URI(`https://example.org/${b.id}`) })],
    bookId: b.id,
    createdDate: b.createdDate,
  })

const seriesMetadata = (
  series: Series,
  title: string,
  age: number | null,
  labels: Set<string>,
  genres: Set<string>,
  tags: Set<string>,
  language: string,
  publisher: string,
) =>
  new SeriesMetadata({
    title,
    ageRating: age,
    sharingLabels: labels,
    genres,
    tags,
    language,
    publisher,
    seriesId: series.id,
    createdDate: series.createdDate,
  })

export const c1 = new SeriesCollection({ name: 'Coll One', ordered: true, seriesIds: ['S2', 'S1'], id: 'C1', createdDate: d(2020, 4, 1) })
export const c2 = new SeriesCollection({ name: 'coll two', seriesIds: ['S3'], id: 'C2', createdDate: d(2020, 4, 2) })
export const r1 = new ReadList({ name: 'Read One', summary: 'rl', bookIds: sortedMapOf<number, string>([0, 'B3'], [1, 'B1']), id: 'R1', createdDate: d(2020, 5, 1) })
export const r2 = new ReadList({ name: 'read two', ordered: false, bookIds: sortedMapOf<number, string>([0, 'B4']), id: 'R2', createdDate: d(2020, 5, 2) })

export function seed(db: OracleDb): void {
  db.libraryDao.insert(l1)
  db.libraryDao.insert(l2)
  for (const it of users) db.komgaUserDao.insert(it)
  for (const it of [s1, s2, s3]) db.seriesDao.insert(it)
  db.seriesMetadataDao.insert(seriesMetadata(s1, 'Alpha', 10, new Set(['kids']), new Set(['action', 'drama']), new Set(['t1']), 'en', 'Pub1'))
  db.seriesMetadataDao.insert(seriesMetadata(s2, 'beta', 16, new Set(['adult']), new Set(['drama']), new Set(['t2']), 'fr', 'Pub2'))
  db.seriesMetadataDao.insert(seriesMetadata(s3, 'Oneshot', null, new Set(), new Set(), new Set(), 'ja', ''))
  for (const it of books) {
    db.bookDao.insert(it)
    db.mediaDao.insert(media(it))
  }
  db.bookMetadataDao.insert(bookMetadata(b1, LocalDate.of(2019, 1, 1), new Set(['bt1'])))
  db.bookMetadataDao.insert(bookMetadata(b2, LocalDate.of(2020, 6, 15), new Set(['bt2'])))
  db.bookMetadataDao.insert(bookMetadata(b3, LocalDate.of(2018, 12, 31), new Set()))
  db.bookMetadataDao.insert(bookMetadata(b4, null, new Set(['bt1', 'bt4'])))
  for (const [s, r] of [
    [s1, LocalDate.of(2019, 1, 1)],
    [s2, LocalDate.of(2018, 12, 31)],
    [s3, null],
  ] as [Series, LocalDate | null][]) {
    db.bookMetadataAggregationDao.insert(
      new BookMetadataAggregation({
        authors: [new Author({ name: `Author ${s.id}`, role: 'writer' })],
        tags: new Set(['bt1']),
        releaseDate: r,
        seriesId: s.id,
        createdDate: s.createdDate,
      }),
    )
  }
  for (const u of [admin, all]) {
    db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: u.id, page: 3, completed: true, readDate: d(2021, 1, 1), createdDate: d(2021, 1, 1) }))
    db.readProgressDao.save(new ReadProgress({ bookId: 'B2', userId: u.id, page: 1, completed: false, readDate: d(2021, 1, 2), createdDate: d(2021, 1, 2) }))
  }
  db.seriesCollectionDao.insert(c1)
  db.seriesCollectionDao.insert(c2)
  db.readListDao.insert(r1)
  db.readListDao.insert(r2)
  fixNow(db)
  sql(
    db,
    "update SERIES set CREATED_DATE = '2020-02-01 10:00:00', LAST_MODIFIED_DATE = '2020-06-03 10:00:00' where ID = 'S1'",
    "update SERIES set CREATED_DATE = '2020-02-03 10:00:00', LAST_MODIFIED_DATE = '2020-06-01 10:00:00' where ID = 'S2'",
    "update SERIES set CREATED_DATE = '2020-02-02 10:00:00', LAST_MODIFIED_DATE = '2020-06-02 10:00:00' where ID = 'S3'",
    "update BOOK set CREATED_DATE = '2020-03-11 10:00:00', LAST_MODIFIED_DATE = '2020-04-04 10:00:00' where ID = 'B1'",
    "update BOOK set CREATED_DATE = '2020-03-12 10:00:00', LAST_MODIFIED_DATE = '2020-04-02 10:00:00' where ID = 'B2'",
    "update BOOK set CREATED_DATE = '2020-03-13 10:00:00', LAST_MODIFIED_DATE = '2020-04-03 10:00:00' where ID = 'B3'",
    "update BOOK set CREATED_DATE = '2020-03-14 10:00:00', LAST_MODIFIED_DATE = '2020-04-01 10:00:00' where ID = 'B4'",
    "update COLLECTION set LAST_MODIFIED_DATE = '2020-07-01 00:00:00' where ID = 'C2'",
    "update READLIST set LAST_MODIFIED_DATE = '2020-07-01 00:00:00' where ID = 'R2'",
  )
}
