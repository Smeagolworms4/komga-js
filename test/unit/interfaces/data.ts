// Miroir de InterfacesData (oracle/interfaces/InterfacesData.kt) : jeu de données partagé des oracles de la couche web.
import { statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { AgeRestriction } from '../../../src/domain/model/AgeRestriction.js'
import { AllowExclude } from '../../../src/domain/model/AgeRestriction.js'
import { Author } from '../../../src/domain/model/Author.js'
import { Book } from '../../../src/domain/model/Book.js'
import { BookMetadata } from '../../../src/domain/model/BookMetadata.js'
import { BookMetadataAggregation } from '../../../src/domain/model/BookMetadataAggregation.js'
import { BookPage } from '../../../src/domain/model/BookPage.js'
import { ContentRestrictions } from '../../../src/domain/model/ContentRestrictions.js'
import { Dimension } from '../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { Library } from '../../../src/domain/model/Library.js'
import { Media } from '../../../src/domain/model/Media.js'
import { MediaFile } from '../../../src/domain/model/MediaFile.js'
import { ReadList } from '../../../src/domain/model/ReadList.js'
import { ReadProgress } from '../../../src/domain/model/ReadProgress.js'
import { Series } from '../../../src/domain/model/Series.js'
import { SeriesCollection } from '../../../src/domain/model/SeriesCollection.js'
import { SeriesMetadata } from '../../../src/domain/model/SeriesMetadata.js'
import { UserRoles } from '../../../src/domain/model/UserRoles.js'
import { WebLink } from '../../../src/domain/model/WebLink.js'
import { sortedMapOf } from '../../../src/port/extra-metadata.js'
import { URI, URL, pathToUrl } from '../../../src/port/java-net.js'
import type { OracleDb } from '../db.js'

export const date = LocalDateTime.of(2020, 1, 2, 3, 4, 5)

export const admin = new KomgaUser({ email: 'admin@example.org', password: 'pw', roles: new Set(UserRoles.entries()), id: 'U1', createdDate: date })
export const limited = new KomgaUser({
  email: 'limited@example.org',
  password: 'pw',
  roles: new Set([UserRoles.PAGE_STREAMING, UserRoles.KOBO_SYNC]),
  sharedAllLibraries: false,
  sharedLibrariesIds: new Set(['L1']),
  id: 'U2',
  createdDate: date,
})
export const restricted = new KomgaUser({
  email: 'kid@example.org',
  password: 'pw',
  roles: new Set([UserRoles.FILE_DOWNLOAD, UserRoles.PAGE_STREAMING]),
  restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 13, restriction: AllowExclude.ALLOW_ONLY }) }),
  id: 'U3',
  createdDate: date,
})

const pages = (n: number, type = 'image/jpeg') =>
  Array.from({ length: n }, (_, i) => new BookPage({ fileName: `p${i + 1}.jpg`, mediaType: type, dimension: new Dimension({ width: 800, height: 1200 }), fileSize: 1000 * (i + 1) }))

let currentDb: OracleDb

function series(
  id: string,
  libraryId: string,
  title: string,
  url: string,
  {
    oneshot = false,
    publisher = '',
    ageRating = null,
    sharingLabels = new Set<string>(),
    language = '',
    genres = new Set<string>(),
    tags = new Set<string>(),
    summary = '',
  }: { oneshot?: boolean; publisher?: string; ageRating?: number | null; sharingLabels?: Set<string>; language?: string; genres?: Set<string>; tags?: Set<string>; summary?: string } = {},
): void {
  currentDb.seriesDao.insert(new Series({ name: title, url: new URL(url), fileLastModified: date, id, libraryId, oneshot, createdDate: date }))
  currentDb.seriesMetadataDao.insert(
    new SeriesMetadata({
      title,
      summary,
      publisher,
      ageRating,
      language,
      genres,
      tags,
      sharingLabels,
      links: [new WebLink({ label: 'Site', url: new URI(`https://example.org/${id}`) })],
      seriesId: id,
      createdDate: date,
    }),
  )
  currentDb.bookMetadataAggregationDao.insert(new BookMetadataAggregation({ seriesId: id, createdDate: date }))
}

function book(
  id: string,
  seriesId: string,
  libraryId: string,
  name: string,
  url: string,
  number: number,
  mediaType: string,
  bookPages: BookPage[],
  {
    releaseDate = null,
    authors = [],
    isbn = '',
    oneshot = false,
    kepub = false,
  }: { releaseDate?: LocalDate | null; authors?: Author[]; isbn?: string; oneshot?: boolean; kepub?: boolean } = {},
): void {
  currentDb.bookDao.insert(
    new Book({ name, url: new URL(url), fileLastModified: date, fileSize: 1_000_000 * number + 123, fileHash: `hash${id}`, number, id, seriesId, libraryId, oneshot, createdDate: date }),
  )
  currentDb.mediaDao.insert(
    new Media({ status: Media.Status.READY, mediaType, pages: bookPages, pageCount: bookPages.length === 0 ? 12 : bookPages.length, bookId: id, epubIsKepub: kepub, createdDate: date }),
  )
  currentDb.bookMetadataDao.insert(
    new BookMetadata({ title: name, summary: `Summary of ${name}`, number: `${number}`, numberSort: number, releaseDate, authors, isbn, bookId: id, createdDate: date }),
  )
}

function populate(db: OracleDb): void {

  db.libraryDao.insert(new Library({ name: 'Comics', root: new URL('file:/data/comics'), id: 'L1', createdDate: date }))
  db.libraryDao.insert(new Library({ name: 'Mangä & Co', root: new URL('file:/data/manga%20co'), id: 'L2', createdDate: date }))
  db.komgaUserDao.insert(admin)
  db.komgaUserDao.insert(limited)
  db.komgaUserDao.insert(restricted)

  series('S1', 'L1', 'Batman', 'file:/data/comics/Batman', { publisher: 'DC Comics', genres: new Set(['super hero']), tags: new Set(['dark']) })
  series('S2', 'L2', 'One Piece', 'file:/data/manga%20co/One%20Piece', { publisher: 'Shueisha', ageRating: 16, sharingLabels: new Set(['adult']), language: 'ja' })
  series('S3', 'L1', 'Tom & Jerry <Special>', 'file:/data/comics/Tom%20&%20Jerry.epub', { oneshot: true, summary: 'Cat "and" mouse' })

  book('B1', 'S1', 'L1', 'Batman 001', 'file:/data/comics/Batman/Batman%20001.cbz', 1, 'application/zip', pages(3), {
    releaseDate: LocalDate.of(2019, 5, 1),
    authors: [new Author({ name: 'Bob Kane', role: 'writer' }), new Author({ name: 'Bill Finger', role: 'penciller' })],
  })
  book('B2', 'S1', 'L1', 'Batman 002', 'file:/data/comics/Batman/Batman%20002.cbz', 2, 'application/zip', pages(5, 'image/png'), { releaseDate: LocalDate.of(2019, 6, 1) })
  book('B3', 'S1', 'L1', 'Batman 003', 'file:/data/comics/Batman/Batman%20003.cbz', 3, 'application/zip', pages(2, 'image/webp'))
  book('B4', 'S2', 'L2', 'One Piece v01', 'file:/data/manga%20co/One%20Piece/One%20Piece%20v01.epub', 1, 'application/epub+zip', [], { isbn: '9781569319017' })
  book('B5', 'S2', 'L2', 'One Piece v02', 'file:/data/manga%20co/One%20Piece/One%20Piece%20v02.pdf', 2, 'application/pdf', pages(4))
  book('B6', 'S3', 'L1', 'Tom & Jerry <Special>', 'file:/data/comics/Tom%20&%20Jerry.epub', 1, 'application/epub+zip', [], { oneshot: true, kepub: true })

  db.seriesCollectionDao.insert(new SeriesCollection({ name: 'Heroes', seriesIds: ['S1', 'S3'], id: 'C1', createdDate: date }))
  db.readListDao.insert(new ReadList({ name: 'Arc', summary: 'An arc', bookIds: sortedMapOf<number, string>([1, 'B2'], [2, 'B4']), id: 'R1', createdDate: date }))

  db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 3, completed: true, readDate: date.plusDays(1), createdDate: date }))
  db.readProgressDao.save(new ReadProgress({ bookId: 'B2', userId: 'U1', page: 3, completed: false, readDate: date.plusDays(2), createdDate: date }))
}

/** CBZ avec les pages p1.png, p2.jpg, p3.gif (2x3 pixels) */
export const CBZ = 'UEsDBBQAAAAAAAAAIVDFuI0CTAAAAEwAAAAGAAAAcDEucG5niVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAE0lEQVR4nGP8z8DAwMDAxIBMAQAUQAEF3SN5DgAAAABJRU5ErkJgglBLAwQUAAAAAAAAACFQt9lnaXkCAAB5AgAABgAAAHAyLmpwZ//Y/+AAEEpGSUYAAQEAAAEAAQAA/9sAQwAIBgYHBgUIBwcHCQkICgwUDQwLCwwZEhMPFB0aHx4dGhwcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzQy/9sAQwEJCQkMCwwYDQ0YMiEcITIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy/8AAEQgAAwACAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A1qKKK/ND8gP/2VBLAwQUAAAAAAAAACFQtMA2wS0AAAAtAAAABgAAAHAzLmdpZkdJRjg3YQIAAwCBAAAAAP8AAAAAAAAAAAAsAAAAAAIAAwAACAYAAQgcGBAAO1BLAQIUAxQAAAAAAAAAIVDFuI0CTAAAAEwAAAAGAAAAAAAAAAAAAACAAQAAAABwMS5wbmdQSwECFAMUAAAAAAAAACFQt9lnaXkCAAB5AgAABgAAAAAAAAAAAAAAgAFwAAAAcDIuanBnUEsBAhQDFAAAAAAAAAAhULTANsEtAAAALQAAAAYAAAAAAAAAAAAAAIABDQMAAHAzLmdpZlBLBQYAAAAAAwADAJwAAABeAwAAAAA='

/** contenu zippé façon EPUB : mimetype, OEBPS/ch 1.xhtml, OEBPS/style.css, OEBPS/fonts/f.woff2 */
export const EPUB = 'UEsDBBQAAAAAAAAAIVBvYassFAAAABQAAAAIAAAAbWltZXR5cGVhcHBsaWNhdGlvbi9lcHViK3ppcFBLAwQUAAAAAAAAACFQ033h4CYAAAAmAAAAEAAAAE9FQlBTL2NoIDEueGh0bWw8aHRtbD48Ym9keT5DaGFwdGVyIDEgw6k8L2JvZHk+PC9odG1sPlBLAwQUAAAAAAAAACFQvaRMAw8AAAAPAAAADwAAAE9FQlBTL3N0eWxlLmNzc2JvZHl7Y29sb3I6cmVkfVBLAwQUAAAAAAAAACFQT9JweggAAAAIAAAAEwAAAE9FQlBTL2ZvbnRzL2Yud29mZjJGT05UREFUQVBLAQIUAxQAAAAAAAAAIVBvYassFAAAABQAAAAIAAAAAAAAAAAAAACAAQAAAABtaW1ldHlwZVBLAQIUAxQAAAAAAAAAIVDTfeHgJgAAACYAAAAQAAAAAAAAAAAAAACAAToAAABPRUJQUy9jaCAxLnhodG1sUEsBAhQDFAAAAAAAAAAhUL2kTAMPAAAADwAAAA8AAAAAAAAAAAAAAIABjgAAAE9FQlBTL3N0eWxlLmNzc1BLAQIUAxQAAAAAAAAAIVBP0nB6CAAAAAgAAAATAAAAAAAAAAAAAACAAcoAAABPRUJQUy9mb250cy9mLndvZmYyUEsFBgAAAAAEAAQA8gAAAAMBAAAAAA=='

/** écrit real.cbz et real.epub dans `dir` et ajoute les livres B7 (CBZ) et B8 (EPUB) à S1, avec leurs médias */
export function realBooks(db: OracleDb, dir: string): void {
  const cbz = join(dir, 'real.cbz')
  writeFileSync(cbz, Buffer.from(CBZ, 'base64'))
  const epub = join(dir, 'real.epub')
  writeFileSync(epub, Buffer.from(EPUB, 'base64'))
  db.bookDao.insert(new Book({ name: 'real', url: pathToUrl(cbz), fileLastModified: date, fileSize: statSync(cbz).size, number: 7, id: 'B7', seriesId: 'S1', libraryId: 'L1', createdDate: date }))
  db.bookDao.insert(new Book({ name: 'real epub', url: pathToUrl(epub), fileLastModified: date, fileSize: statSync(epub).size, number: 8, id: 'B8', seriesId: 'S1', libraryId: 'L1', createdDate: date }))
  const dim = new Dimension({ width: 2, height: 3 })
  db.mediaDao.insert(
    new Media({
      status: Media.Status.READY,
      mediaType: 'application/zip',
      pages: [
        new BookPage({ fileName: 'p1.png', mediaType: 'image/png', dimension: dim }),
        new BookPage({ fileName: 'p2.jpg', mediaType: 'image/jpeg', dimension: dim }),
        new BookPage({ fileName: 'p3.gif', mediaType: 'image/gif', dimension: dim }),
      ],
      bookId: 'B7',
      createdDate: date,
    }),
  )
  db.mediaDao.insert(
    new Media({
      status: Media.Status.READY,
      mediaType: 'application/epub+zip',
      files: [
        new MediaFile({ fileName: 'OEBPS/ch 1.xhtml', mediaType: 'application/xhtml+xml', subType: MediaFile.SubType.EPUB_PAGE }),
        new MediaFile({ fileName: 'OEBPS/style.css', mediaType: 'text/css', subType: MediaFile.SubType.EPUB_ASSET }),
        new MediaFile({ fileName: 'OEBPS/fonts/f.woff2', mediaType: 'font/woff2', subType: MediaFile.SubType.EPUB_ASSET }),
        new MediaFile({ fileName: 'OEBPS/missing.css', mediaType: 'text/css', subType: MediaFile.SubType.EPUB_ASSET }),
      ],
      pageCount: 1,
      bookId: 'B8',
      createdDate: date,
    }),
  )
  db.bookMetadataDao.insert(new BookMetadata({ title: 'real', number: '7', numberSort: 7, bookId: 'B7', createdDate: date }))
  db.bookMetadataDao.insert(new BookMetadata({ title: 'real epub', number: '8', numberSort: 8, bookId: 'B8', createdDate: date }))
}

/** remplit `db` (à appeler dans un cas) */
export function setup(db: OracleDb): void {
  currentDb = db
  populate(db)
}
