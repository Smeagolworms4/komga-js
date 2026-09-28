// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/PageHashLifecycleOracleTest.kt
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { PageHashKnown } from '../../../../src/domain/model/PageHashKnown.js'
import type { TypedBytes } from '../../../../src/domain/model/TypedBytes.js'
import { PageHashLifecycle } from '../../../../src/domain/service/PageHashLifecycle.js'
import { URL } from '../../../../src/port/java-net.js'
import { OracleDb } from '../../db.js'
import { oracle, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, book, date, library, metadata, resource, series, zipFile } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/PageHashLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = new PageHashLifecycle(db.pageHashDao, db.mediaDao, graph.bookLifecycle, db.bookDao, db.properties)

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'books')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const png = resource('barcode/komga.png')

function addBook(id: string, seriesId: string, libraryId: string, hashes: string[], status = Media.Status.READY, mediaType = 'application/zip', url: URL | null = null) {
  const u = url ?? zipFile(dir(), `${id}.cbz`, hashes.map((_, i) => [`p${i}.png`, png]))
  const b = book(id, seriesId, libraryId, undefined, u)
  db.bookDao.insert(b)
  db.bookMetadataDao.insert(metadata(b))
  db.mediaDao.insert(
    new Media({
      status,
      mediaType,
      pages: hashes.map((h, i) => new BookPage({ fileName: `p${i}.png`, mediaType: 'image/png', fileHash: h, fileSize: png.length })),
      bookId: id,
      createdDate: date,
    }),
  )
}

const lib = (id: string, hashPages: boolean) => db.libraryDao.findById(id).copy({ hashPages })
const typed = (t: TypedBytes | null) => (t !== null ? [t.bytes.length, t.mediaType] : null)

func('getBookIdsWithMissingPageHash', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1'))
    db.libraryDao.insert(library('L2').copy({ hashPages: true }))
    db.seriesDao.insert(series('S1', 'L1'))
    db.seriesDao.insert(series('S2', 'L2'))
    addBook('B1', 'S1', 'L1', ['H1', ''])
    addBook('B2', 'S2', 'L2', ['', ''])
    addBook('B3', 'S2', 'L2', ['H1', 'H2'])
    addBook('B4', 'S2', 'L2', ['', ''], undefined, 'application/epub+zip')
    addBook('B5', 'S2', 'L2', ['', ''], Media.Status.UNKNOWN)
    addBook('B6', 'S2', 'L2', [])
    addBook('B7', 'S2', 'L2', ['H3', 'H3', 'H3', 'H3', 'H3', 'H3', '', ''])
    addBook('B8', 'S2', 'L2', ['H3', 'H3', 'H3', 'H3', 'H3', '', '', ''])
    addBook('B9', 'S2', 'L2', ['H2'], undefined, undefined, new URL(`file:${dir()}/missing.cbz`))
    return db.bookDao.count()
  })
  kase('hash pages disabled', () => lifecycle.getBookIdsWithMissingPageHash(lib('L1', false)))
  kase('hash pages enabled', () => [...lifecycle.getBookIdsWithMissingPageHash(lib('L2', true))].sort())
  kase('enabled on library L1', () => [...lifecycle.getBookIdsWithMissingPageHash(lib('L1', true))].sort())
  kase('disabled on library L2', () => lifecycle.getBookIdsWithMissingPageHash(lib('L2', false)))
  kase('unknown library', () => lifecycle.getBookIdsWithMissingPageHash(library('L9').copy({ hashPages: true })))
})
func('getPage', () => {
  kase('unknown hash', () => lifecycle.getPage('NOPE'))
  kase('known hash, original', () => attempt(dir(), async () => typed(await lifecycle.getPage('H1'))))
  kase('known hash, resized', () =>
    attempt(dir(), async () => {
      const it = await lifecycle.getPage('H2', { resizeTo: 50 })
      return it !== null ? [it.mediaType, await graph.describeImage(it.bytes)] : null
    }),
  )
  kase('hash of several pages', () => attempt(dir(), async () => typed(await lifecycle.getPage('H3', { resizeTo: null }))))
  kase('empty hash', () => attempt(dir(), async () => typed(await lifecycle.getPage(''))))
})
func('createOrUpdate', () => {
  kase('new hash with matches', () =>
    attempt(dir(), async () => {
      await lifecycle.createOrUpdate(new PageHashKnown({ hash: 'H1', size: 3108, action: PageHashKnown.Action.IGNORE, createdDate: date }))
      return [db.pageHashDao.findKnown('H1'), await graph.describeImage(db.pageHashDao.getKnownThumbnail('H1'))]
    }),
  )
  kase('new hash without match', () =>
    attempt(dir(), async () => {
      await lifecycle.createOrUpdate(new PageHashKnown({ hash: 'HX', size: null, action: PageHashKnown.Action.DELETE_MANUAL, createdDate: date }))
      return [db.pageHashDao.findKnown('HX'), db.pageHashDao.getKnownThumbnail('HX')]
    }),
  )
  kase('existing hash, action updated, size ignored', () =>
    attempt(dir(), async () => {
      await lifecycle.createOrUpdate(new PageHashKnown({ hash: 'H1', size: 1, action: PageHashKnown.Action.DELETE_AUTO, deleteCount: 5, createdDate: date }))
      return [db.pageHashDao.findKnown('H1'), await graph.describeImage(db.pageHashDao.getKnownThumbnail('H1'))]
    }),
  )
  kase('new hash, book file missing', () =>
    attempt(dir(), async () => {
      for (const id of ['B3', 'B9']) {
        const it = db.mediaDao.findById(id)
        db.mediaDao.update(it.copy({ pages: it.pages.map((p) => p.copy({ fileHash: 'H9' })) }))
      }
      await lifecycle.createOrUpdate(new PageHashKnown({ hash: 'H9', size: 3108, action: PageHashKnown.Action.DELETE_AUTO, createdDate: date }))
      return db.pageHashDao.findKnown('H9')
    }),
  )
  kase('new hash H3 delete auto', () =>
    attempt(dir(), async () => {
      await lifecycle.createOrUpdate(new PageHashKnown({ hash: 'H3', size: 3108, action: PageHashKnown.Action.DELETE_AUTO, createdDate: date }))
      return db.pageHashDao.findKnown('H3')
    }),
  )
})
func('getBookPagesToDeleteAutomatically', () => {
  kase('library L1', () => lifecycle.getBookPagesToDeleteAutomatically(lib('L1', false)))
  kase('library L2', () => lifecycle.getBookPagesToDeleteAutomatically(lib('L2', true)))
  kase('unknown library', () => lifecycle.getBookPagesToDeleteAutomatically(library('L9')))
})
