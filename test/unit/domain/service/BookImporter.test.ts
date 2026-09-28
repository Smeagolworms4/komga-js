// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/BookImporterOracleTest.kt
import { lstatSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CopyMode } from '../../../../src/domain/model/CopyMode.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { Series } from '../../../../src/domain/model/Series.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { BookImporter } from '../../../../src/domain/service/BookImporter.js'
import { sortedMapOf } from '../../../../src/port/extra-metadata.js'
import { URL, pathToUrl } from '../../../../src/port/java-net.js'
import { urlToPath } from '../../../../src/port/java.js'
import { nn } from '../../../../src/port/kotlin.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, date, library, resource, series, zipFile } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/BookImporter')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const importer = new BookImporter(
  graph.bookLifecycle,
  graph.fileSystemScanner,
  graph.seriesLifecycle,
  db.bookDao,
  db.mediaDao,
  db.bookMetadataDao,
  db.thumbnailBookDao,
  db.readProgressDao,
  db.readListDao,
  db.libraryDao,
  db.sidecarDao,
  graph.publisher,
  graph.taskEmitter,
  db.historicalEventDao,
  db.seriesDao,
)

const mk = (p: string) => {
  mkdirSync(p, { recursive: true })
  return p
}
const lib = () => mk(join(tempDir(), 'lib'))
const src = () => mk(join(tempDir(), 'import'))
const png = resource('barcode/komga.png')
const pathOf = (u: URL) => urlToPath(u)
const source = (name: string) => pathOf(zipFile(src(), name, [['p1.png', png]]))
const s = (id: string) => nn(db.seriesDao.findByIdOrNull(id))
const booksOf = (seriesId: string) => db.bookDao.findAllBySeriesId(seriesId)

function listing(p: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    out.push(relative(p, d))
    if (lstatSync(d).isDirectory()) for (const e of readdirSync(d)) walk(join(d, e))
  }
  walk(p)
  return out.sort()
}

const run = (block: () => unknown) => attempt(tempDir(), block)

const state = (seriesId: string) =>
  attempt(tempDir(), () => [
    [...booksOf(seriesId)].sort((a, b) => a.number - b.number).map((it) => [it.name, it.url, it.number, it.oneshot, it.libraryId]),
    listing(lib()),
    listing(src()),
    [...db.sidecarDao.findAll()].map((it) => [it.url, it.parentUrl, it.libraryId]).sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0)),
    db.rawQuery('select TYPE, BOOK_ID, SERIES_ID from HISTORICAL_EVENT order by rowid'),
    graph.takeTasks(),
    graph.takeEvents(),
  ])

func('importBook', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1', new URL(`file:${lib()}`)))
    mk(join(lib(), 's1'))
    mk(join(lib(), '_oneshots'))
    graph.seriesLifecycle.createSeries(series('S1', 'L1', new URL(`file:${lib()}/s1`)))
    graph.seriesLifecycle.createSeries(series('S2', 'L1', new URL(`file:${lib()}/s2`)))
    graph.takeEvents()
    return true
  })
  kase('missing source', () => run(() => importer.importBook(join(src(), 'nope.cbz'), s('S1'), CopyMode.COPY)))
  kase('missing source events', () => state('S1'))
  kase('source inside a library', async () => {
    const inLib = pathOf(zipFile(lib(), 'inlib.cbz', [['p1.png', png]]))
    const res = [await run(() => importer.importBook(inLib, s('S1'), CopyMode.COPY)), await state('S1')]
    unlinkSync(inLib)
    return res
  })
  kase('oneshot without upgrade id', () => run(() => importer.importBook(source('os.cbz'), s('S1').copy({ oneshot: true }), CopyMode.COPY)))
  kase('copy', async () => {
    source('book 1.cbz')
    writeFileSync(join(src(), 'book 1.jpg'), png)
    writeFileSync(join(src(), 'book 1-2.png'), png)
    writeFileSync(join(src(), 'other.png'), png)
    return [
      await run(() => {
        const it = importer.importBook(join(src(), 'book 1.cbz'), s('S1'), CopyMode.COPY)
        return [it.name, it.url, it.fileSize, it.oneshot]
      }),
      await state('S1'),
    ]
  })
  kase('destination exists', async () => [await run(() => importer.importBook(join(src(), 'book 1.cbz'), s('S1'), CopyMode.COPY)), await state('S1')])
  kase('move with destination name', async () => {
    source('orig.cbz')
    writeFileSync(join(src(), 'ORIG.jpg'), png)
    return [await run(() => importer.importBook(join(src(), 'orig.cbz'), s('S1'), CopyMode.MOVE, { destinationName: 'Renamed Book' }).name), await state('S1')]
  })
  kase('hardlink', async () => {
    source('linked.cbz')
    const r = await run(() => importer.importBook(join(src(), 'linked.cbz'), s('S1'), CopyMode.HARDLINK).name)
    const st = await state('S1')
    const a = statSync(join(src(), 'linked.cbz'))
    const b = statSync(join(lib(), 's1/linked.cbz'))
    return [r, st, a.ino === b.ino && a.dev === b.dev]
  })
  kase('series folder missing', async () => [await run(() => importer.importBook(source('nofolder.cbz'), s('S2'), CopyMode.COPY)), await state('S2')])
  kase('upgrade book of other series', () => {
    const id = nn(booksOf('S1').find((it) => it.name === 'book 1')).id
    return exceptionType(() => importer.importBook(source('up.cbz'), s('S2'), CopyMode.COPY, { upgradeBookId: id }))
  })
  kase('upgrade unknown book', async () => [
    await run(() => importer.importBook(source('unknown.cbz'), s('S1'), CopyMode.COPY, { upgradeBookId: 'NOPE' }).name),
    await state('S1'),
  ])
  kase('upgrade with same file name', async () => {
    const old = nn(booksOf('S1').find((it) => it.name === 'book 1'))
    db.komgaUserDao.insert(new KomgaUser({ email: 'u@example.org', password: 'p', id: 'U1', createdDate: date }))
    db.readProgressDao.save(new ReadProgress({ bookId: old.id, userId: 'U1', page: 1, completed: false, readDate: date, createdDate: date }))
    db.readListDao.insert(
      new ReadList({
        name: 'rl',
        bookIds: sortedMapOf<number, string>([3, old.id], [5, nn(booksOf('S1').find((it) => it.name === 'linked')).id]),
        id: 'RL',
        createdDate: date,
      }),
    )
    db.thumbnailBookDao.insert(
      new ThumbnailBook({
        thumbnail: oracleBytes(3),
        url: null,
        selected: true,
        type: ThumbnailBook.Type.USER_UPLOADED,
        mediaType: 'image/jpeg',
        fileSize: 3,
        dimension: new Dimension({ width: 1, height: 1 }),
        id: 'TU',
        bookId: old.id,
        createdDate: date,
      }),
    )
    db.bookMetadataDao.update(db.bookMetadataDao.findById(old.id).copy({ title: 'Kept title', titleLock: true }))
    const newSrc = mk(join(tempDir(), 'import2'))
    zipFile(newSrc, 'book 1.cbz', [
      ['p1.png', png],
      ['p2.png', png],
    ])
    return [
      await run(() => {
        const nb = importer.importBook(join(newSrc, 'book 1.cbz'), s('S1'), CopyMode.MOVE, { upgradeBookId: old.id })
        return [
          db.mediaDao.findById(nb.id).status,
          db.bookMetadataDao.findById(nb.id).title,
          [...db.readProgressDao.findAllByBookId(nb.id)].map((it) => it.userId),
          [...nn(db.readListDao.findByIdOrNull('RL', SearchContext.empty())).bookIds].map(([k, v]) => [k, v === nb.id]),
          [...db.thumbnailBookDao.findAllByBookId(nb.id)].map((it) => it.id),
          db.bookDao.findByIdOrNull(old.id),
        ]
      }),
      await state('S1'),
    ]
  })
  kase('upgrade with other file name', async () => {
    const old = nn(booksOf('S1').find((it) => it.name === 'linked'))
    return [await run(() => importer.importBook(source('better.cbz'), s('S1'), CopyMode.COPY, { upgradeBookId: old.id }).name), await state('S1')]
  })
  kase('oneshot upgrade', async () => {
    const osFile = pathOf(zipFile(join(lib(), '_oneshots'), 'one.cbz', [['p1.png', png]]))
    const os = new Series({ name: 'one', url: pathToUrl(osFile), fileLastModified: date, libraryId: 'L1', oneshot: true, id: 'OS', createdDate: date })
    graph.seriesLifecycle.createSeries(os)
    graph.seriesLifecycle.addBooks(os, [nn(graph.fileSystemScanner.scanFile(osFile)).copy({ libraryId: 'L1', oneshot: true, id: 'OSB' })])
    graph.takeEvents()
    graph.takeTasks()
    return [
      await run(() => {
        const it = importer.importBook(source('one v2.cbz'), s('OS'), CopyMode.COPY, { upgradeBookId: 'OSB' })
        return [it.name, it.url, it.oneshot]
      }),
      await state('OS'),
      await attempt(tempDir(), () => [s('OS').url, s('OS').oneshot]),
    ]
  })
})
