// Données partagées des tests à oracle de metadata, miroir de `MetadataSamples` côté Kotlin
// (komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/MetadataSamples.kt, branche unit-oracles).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../src/domain/model/Book.js'
import { Library } from '../../../../src/domain/model/Library.js'
import { URL } from '../../../../src/port/java-net.js'

/** Fixtures de metadata (src/test/resources/oracle/metadata côté Kotlin) */
export function fixture(p: string): string {
  return fileURLToPath(new globalThis.URL(`../../../infrastructure/metadata/fixtures/${p}`, import.meta.url))
}

export const date = LocalDateTime.of(2020, 1, 1, 0, 0)

export function book(url: URL = new URL('file:/komga/book.cbz')): Book {
  return new Book({ name: 'book', url, fileLastModified: date, id: 'BOOK', seriesId: 'SERIES', libraryId: 'LIBRARY', createdDate: date })
}

/** ComicInfo.xml et listes de lecture ComicRack : id, classe, contenu */
export const xmlCases: [number, string, Uint8Array][] = (
  JSON.parse(readFileSync(fixture('xml-cases.json'), 'utf8')) as { id: number; cls: string; b64: string }[]
).map((it) => [it.id, it.cls, Uint8Array.from(Buffer.from(it.b64, 'base64'))])

/** Documents OPF */
export const epubCases = JSON.parse(readFileSync(fixture('epub-cases.json'), 'utf8')) as string[]

/** Documents series.json */
export const mylarCases = JSON.parse(readFileSync(fixture('mylar-cases.json'), 'utf8')) as string[]

type Flags = Partial<
  Record<
    | 'importComicInfoBook'
    | 'importComicInfoSeries'
    | 'importComicInfoCollection'
    | 'importComicInfoReadList'
    | 'importEpubBook'
    | 'importEpubSeries'
    | 'importMylarSeries'
    | 'importLocalArtwork'
    | 'importBarcodeIsbn',
    boolean
  >
>

function lib(name: string, flags: Flags = {}): [string, Library] {
  return [
    name,
    new Library({
      name,
      root: new URL('file:/komga/library'),
      importComicInfoBook: false,
      importComicInfoSeries: false,
      importComicInfoCollection: false,
      importComicInfoReadList: false,
      importEpubBook: false,
      importEpubSeries: false,
      importMylarSeries: false,
      importLocalArtwork: false,
      importBarcodeIsbn: false,
      ...flags,
      id: 'LIBRARY',
      createdDate: date,
    }),
  ]
}

/** Bibliothèques avec tous les drapeaux d'import, aucun, ou un seul */
export const libraries: [string, Library][] = [
  ['all', new Library({ name: 'all', root: new URL('file:/komga/library'), id: 'LIBRARY', createdDate: date })],
  lib('none'),
  lib('importComicInfoBook', { importComicInfoBook: true }),
  lib('importComicInfoSeries', { importComicInfoSeries: true }),
  lib('importComicInfoCollection', { importComicInfoCollection: true }),
  lib('importComicInfoReadList', { importComicInfoReadList: true }),
  lib('importEpubBook', { importEpubBook: true }),
  lib('importEpubSeries', { importEpubSeries: true }),
  lib('importMylarSeries', { importMylarSeries: true }),
  lib('importLocalArtwork', { importLocalArtwork: true }),
  lib('importBarcodeIsbn', { importBarcodeIsbn: true }),
]
