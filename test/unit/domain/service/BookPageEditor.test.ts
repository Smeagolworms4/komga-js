// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/BookPageEditorOracleTest.kt
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Book } from '../../../../src/domain/model/Book.js'
import { BookPageNumbered } from '../../../../src/domain/model/BookPageNumbered.js'
import { BookWithMedia } from '../../../../src/domain/model/BookWithMedia.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { PageHashKnown } from '../../../../src/domain/model/PageHashKnown.js'
import { BookPageEditor } from '../../../../src/domain/service/BookPageEditor.js'
import { URL } from '../../../../src/port/java-net.js'
import { urlToPath } from '../../../../src/port/java.js'
import { nn } from '../../../../src/port/kotlin.js'
import { OracleDb } from '../../db.js'
import { t } from '../../infrastructure/mediacontainer/oracleZip.js'
import { komgaRes } from '../../infrastructure/mediacontainer/samples.js'
import { oracle, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, date, library, metadata, resource, series, zipFile } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/BookPageEditor')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const editor = new BookPageEditor(
  graph.bookAnalyzer,
  graph.fileSystemScanner,
  db.bookDao,
  db.mediaDao,
  db.libraryDao,
  db.pageHashDao,
  graph.transactionTemplate,
  graph.publisher,
  db.historicalEventDao,
)

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'lib')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const png = resource('barcode/komga.png')
const jpg = resource('barcode/page_384.jpg')
const pathOf = (u: URL) => urlToPath(u)

async function addBook(id: string, path: string): Promise<Book> {
  const scanned = nn(graph.fileSystemScanner.scanFile(path)).copy({ id, seriesId: 'S1', libraryId: 'L1', createdDate: date, lastModifiedDate: date })
  db.bookDao.insert(scanned)
  db.bookMetadataDao.insert(metadata(scanned))
  const media = graph.bookAnalyzer.analyze(scanned, true)
  db.mediaDao.insert((await graph.bookAnalyzer.hashPages(new BookWithMedia({ book: scanned, media }))).copy({ createdDate: date }))
  return scanned
}
const b = (id: string) => nn(db.bookDao.findByIdOrNull(id))
const pages = (id: string) =>
  db.mediaDao
    .findById(id)
    .pages.map((p, i) => new BookPageNumbered({ fileName: p.fileName, mediaType: p.mediaType, dimension: p.dimension, fileHash: p.fileHash, fileSize: p.fileSize, pageNumber: i + 1 }))
const renumber = (p: BookPageNumbered, patch: { fileHash?: string; pageNumber?: number }) =>
  new BookPageNumbered({
    fileName: p.fileName,
    mediaType: p.mediaType,
    dimension: p.dimension,
    fileHash: patch.fileHash ?? p.fileHash,
    fileSize: p.fileSize,
    pageNumber: patch.pageNumber ?? p.pageNumber,
  })

const state = (id: string) =>
  attempt(dir(), () => {
    const m = db.mediaDao.findById(id)
    const bk = b(id)
    return [
      [bk.name, bk.url, bk.fileLastModified],
      [m.status, m.mediaType, m.pageCount, m.pages.map((p) => [p.fileName, p.mediaType, p.fileHash]), m.files.map((f) => f.fileName)],
      readdirSync(dir()).sort(),
      db.rawQuery('select TYPE, BOOK_ID, SERIES_ID from HISTORICAL_EVENT order by TYPE, BOOK_ID'),
      db.rawQuery('select HASH, ACTION, DELETE_COUNT from PAGE_HASH order by HASH'),
      graph.takeEvents().map((e) => (e as object).constructor.name),
    ]
  })

func('removeHashedPages', () => {
  kase('setup', async () => {
    db.libraryDao.insert(library('L1', new URL(`file:${dir()}`)))
    db.seriesDao.insert(series('S1', 'L1', new URL(`file:${dir()}`)))
    await addBook('Z1', pathOf(zipFile(dir(), 'z1.cbz', [['p1.png', png], ['p2.jpg', jpg], ['p3.png', png], t('ComicInfo.xml', '<ComicInfo/>')])))
    await addBook('Z2', pathOf(zipFile(dir(), 'z2.cbz', [['a.png', png], ['b.jpg', jpg]])))
    await addBook('Z3', pathOf(zipFile(dir(), 'z3.cbz', [['a.png', png], ['b.jpg', jpg]])))
    copyFileSync(komgaRes('archives/rar4.rar'), join(dir(), 'rar4.cbr'))
    await addBook('R4', join(dir(), 'rar4.cbr'))
    db.pageHashDao.insert(new PageHashKnown({ hash: nn(pages('Z1')[0]).fileHash, size: null, action: PageHashKnown.Action.DELETE_AUTO, deleteCount: 2, createdDate: date }), null)
    return pages('Z1').map((it) => [it.fileName, it.fileHash, it.pageNumber])
  })
  kase('remove middle page', async () => [
    await attempt(dir(), () => editor.removeHashedPages(b('Z1'), pages('Z1').filter((it) => it.pageNumber === 2))),
    await state('Z1'),
  ])
  kase('remove first page', async () => [
    await attempt(dir(), () => editor.removeHashedPages(b('Z1'), pages('Z1').filter((it) => it.pageNumber === 1))),
    await state('Z1'),
  ])
  kase('nothing to remove', async () => [await attempt(dir(), () => editor.removeHashedPages(b('Z2'), [])), await state('Z2')])
  kase('page not matching', async () => [
    await attempt(dir(), () => editor.removeHashedPages(b('Z2'), pages('Z2').map((it) => renumber(it, { pageNumber: it.pageNumber + 1 })))),
    await state('Z2'),
  ])
  kase('page with other hash', async () => [
    await attempt(dir(), () => editor.removeHashedPages(b('Z2'), pages('Z2').slice(0, 1).map((it) => renumber(it, { fileHash: 'other' })))),
    await state('Z2'),
  ])
  kase('all pages', async () => [
    await attempt(dir(), () => editor.removeHashedPages(b('Z3'), pages('Z3'))),
    await state('Z3'),
    await attempt(dir(), () => editor.removeHashedPages(b('Z3'), [])),
  ])
  kase('not a zip', () => attempt(dir(), () => editor.removeHashedPages(b('R4'), [])))
  kase('changed on disk', () => attempt(dir(), () => editor.removeHashedPages(b('Z2').copy({ fileLastModified: date }), pages('Z2').slice(0, 1))))
  kase('file not found', () => attempt(dir(), () => editor.removeHashedPages(b('Z2').copy({ url: new URL(`file:${dir()}/gone.cbz`) }), [])))
  kase('media not ready', () => {
    db.mediaDao.update(db.mediaDao.findById('Z2').copy({ status: Media.Status.OUTDATED }))
    return attempt(dir(), () => editor.removeHashedPages(b('Z2'), []))
  })
})
