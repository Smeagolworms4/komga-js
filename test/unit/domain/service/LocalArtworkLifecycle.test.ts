// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/LocalArtworkLifecycleOracleTest.kt
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { LocalArtworkLifecycle } from '../../../../src/domain/service/LocalArtworkLifecycle.js'
import { URL } from '../../../../src/port/java-net.js'
import { nn } from '../../../../src/port/kotlin.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, book, date, library, resource, series } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/LocalArtworkLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = new LocalArtworkLifecycle(db.libraryDao, graph.bookLifecycle, graph.seriesLifecycle, graph.localArtworkProvider)

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'lib')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const png = resource('barcode/komga.png')
const url = (rel: string) => new URL(`file:${dir()}/${rel}`)
const byUrl = <T extends { url: URL | null }>(a: T, b: T) => (String(a.url) < String(b.url) ? -1 : String(a.url) > String(b.url) ? 1 : 0)
const names = () => graph.takeEvents().map((e) => (e as object).constructor.name)

const bookState = (id: string) =>
  attempt(dir(), () => [
    [...db.thumbnailBookDao.findAllByBookId(id)].sort(byUrl).map((it) => [it.type, it.selected, it.url, it.mediaType, it.fileSize, it.dimension]),
    names(),
  ])
const seriesState = (id: string) =>
  attempt(dir(), () => [
    [...db.thumbnailSeriesDao.findAllBySeriesId(id)].sort(byUrl).map((it) => [it.type, it.selected, it.url, it.mediaType, it.fileSize, it.dimension]),
    names(),
  ])
const b = (id: string) => nn(db.bookDao.findByIdOrNull(id))
const s = (id: string) => nn(db.seriesDao.findByIdOrNull(id))
const uploaded = () =>
  new ThumbnailBook({
    thumbnail: oracleBytes(4),
    url: null,
    selected: true,
    type: ThumbnailBook.Type.USER_UPLOADED,
    mediaType: 'image/jpeg',
    fileSize: 4,
    dimension: new Dimension({ width: 1, height: 1 }),
    id: 'TU',
    bookId: 'B2',
    createdDate: date,
  })

func('refreshLocalArtwork@20', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1', url('')))
    db.libraryDao.insert(library('L2', url('')).copy({ importLocalArtwork: false }))
    const s1 = join(dir(), 's1')
    const s2 = join(dir(), 's2')
    mkdirSync(s1, { recursive: true })
    mkdirSync(s2, { recursive: true })
    writeFileSync(join(s1, 'cover.png'), png)
    writeFileSync(join(s1, 'notes.txt'), png)
    writeFileSync(join(s1, 'b1.png'), png)
    writeFileSync(join(s1, 'B2-1.PNG'), png)
    writeFileSync(join(s1, 'b3.jpg'), oracleBytes(10))
    writeFileSync(join(s1, 'b10.png'), png)
    writeFileSync(join(s2, 'folder.png'), png)
    db.seriesDao.insert(series('S1', 'L1', url('s1')))
    db.seriesDao.insert(series('S2', 'L2', url('s2')))
    db.seriesDao.insert(series('S3', 'L1', url('s2')).copy({ oneshot: true }))
    for (const it of ['b1', 'b2', 'b3', 'b4']) db.bookDao.insert(book(it.toUpperCase(), 'S1', 'L1', undefined, url(`s1/${it}.cbz`)))
    db.bookDao.insert(book('B5', 'S2', 'L2', undefined, url('s2/folder.cbz')))
    return true
  })
  kase('exact name', () => {
    lifecycle.refreshLocalArtwork(b('B1'))
    return bookState('B1')
  })
  kase('again, same url replaced', () => {
    lifecycle.refreshLocalArtwork(b('B1'))
    return bookState('B1')
  })
  kase('numbered, other case', () => {
    lifecycle.refreshLocalArtwork(b('B2'))
    return bookState('B2')
  })
  kase('not an image', () => {
    lifecycle.refreshLocalArtwork(b('B3'))
    return bookState('B3')
  })
  kase('no sidecar', () => {
    lifecycle.refreshLocalArtwork(b('B4'))
    return bookState('B4')
  })
  kase('selected uploaded thumbnail kept', () => {
    db.thumbnailBookDao.insert(uploaded())
    db.thumbnailBookDao.markSelected(uploaded())
    lifecycle.refreshLocalArtwork(b('B2'))
    return bookState('B2')
  })
  kase('library import disabled', () => {
    lifecycle.refreshLocalArtwork(b('B5'))
    return bookState('B5')
  })
  kase('unknown library', () => exceptionType(() => lifecycle.refreshLocalArtwork(b('B1').copy({ libraryId: 'L9' }))))
  kase('missing folder', () => attempt(dir(), () => lifecycle.refreshLocalArtwork(book('B9', 'S1', 'L1', undefined, url('nope/b9.cbz')))))
})
func('refreshLocalArtwork@32', () => {
  kase('cover file', () => {
    lifecycle.refreshLocalArtwork(s('S1'))
    return seriesState('S1')
  })
  kase('again', () => {
    lifecycle.refreshLocalArtwork(s('S1'))
    return seriesState('S1')
  })
  kase('library import disabled', () => {
    lifecycle.refreshLocalArtwork(s('S2'))
    return seriesState('S2')
  })
  kase('oneshot', () => {
    lifecycle.refreshLocalArtwork(s('S3'))
    return seriesState('S3')
  })
  kase('missing folder', () => attempt(dir(), () => lifecycle.refreshLocalArtwork(series('S9', 'L1', url('nope')))))
})
