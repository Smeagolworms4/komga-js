// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/LibraryContentLifecycleOracleTest.kt
import { lstatSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import { ThumbnailSeries } from '../../../../src/domain/model/ThumbnailSeries.js'
import { LibraryContentLifecycle } from '../../../../src/domain/service/LibraryContentLifecycle.js'
import { sortedMapOf } from '../../../../src/port/extra-metadata.js'
import { URL } from '../../../../src/port/java-net.js'
import { nn } from '../../../../src/port/kotlin.js'
import { OracleDb } from '../../db.js'
import { zipBytes } from '../../infrastructure/mediacontainer/oracleZip.js'
import { oracle, oracleBytes, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, date, library, resource } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/LibraryContentLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = new LibraryContentLifecycle(
  graph.fileSystemScanner,
  db.seriesDao,
  db.bookDao,
  db.libraryDao,
  graph.bookLifecycle,
  db.mediaDao,
  graph.seriesLifecycle,
  graph.seriesCollectionLifecycle,
  graph.readListLifecycle,
  db.sidecarDao,
  graph.settings,
  graph.taskEmitter,
  graph.transactionTemplate,
  graph.hasher,
  db.bookMetadataDao,
  db.seriesMetadataDao,
  db.readListDao,
  db.readProgressDao,
  db.seriesCollectionDao,
  db.thumbnailBookDao,
  graph.publisher,
  db.thumbnailSeriesDao,
)

const root = () => {
  const p = join(tempDir(), 'lib')
  mkdirSync(p, { recursive: true })
  return p
}
const r = (rel: string) => join(root(), rel)
const png = resource('barcode/komga.png')
const t1 = new Date('2030-01-02T03:04:05Z')
const t2 = new Date('2031-06-07T08:09:10Z')

function cbz(rel: string, n: number, time = t1) {
  const p = r(rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(
    p,
    zipBytes([
      ['p1.png', png],
      ['n.txt', oracleBytes(n)],
    ]),
  )
  utimesSync(p, time, time)
}
function side(rel: string, time = t1) {
  const p = r(rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, png)
  utimesSync(p, time, time)
}
function walk(d: string, out: string[] = []): string[] {
  out.push(d)
  if (lstatSync(d).isDirectory()) for (const e of readdirSync(d)) walk(join(d, e), out)
  return out
}
function touchDirs(time = t1) {
  for (const d of walk(root())
    .filter((it) => lstatSync(it).isDirectory())
    .sort()
    .reverse())
    utimesSync(d, time, time)
}
const lib = () => db.libraryDao.findById('L1')
const byUrl = <T extends { url: URL }>(a: T, b: T) => (String(a.url) < String(b.url) ? -1 : String(a.url) > String(b.url) ? 1 : 0)
const book = (name: string) => nn(db.bookDao.findAll().find((it) => it.name === name))

const state = () =>
  attempt(tempDir(), () => {
    const series = db.seriesDao.findAll().sort(byUrl)
    return [
      series.map((s) => [
        s.name,
        s.url,
        s.fileLastModified,
        s.deletedDate !== null,
        s.bookCount,
        db.seriesMetadataDao.findById(s.id).title,
        db.bookDao
          .findAllBySeriesId(s.id)
          .sort(byUrl)
          .map((b) => [b.name, b.url, b.number, b.fileSize, b.fileHash, b.deletedDate !== null, db.mediaDao.findById(b.id).status, db.bookMetadataDao.findById(b.id).title]),
      ]),
      [...db.sidecarDao.findAll()]
        .map((it) => [it.url, it.parentUrl, it.lastModifiedTime])
        .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0)),
      graph
        .takeTasks()
        .map((it) => it.split('(')[0])
        .sort(),
      // triés : séries et livres sont traités dans l'ordre brut de readdir, qui dépend du système de fichiers (graine de hachage ext4)
      graph
        .takeEvents()
        .map((e) => (e as object).constructor.name)
        .sort(),
      lib().unavailableDate !== null,
    ]
  })

const scan = (scanDeep = false) => attempt(tempDir(), () => lifecycle.scanRootFolder(lib(), { scanDeep }))
// blocs exécutés l'un après l'autre (scanRootFolder est asynchrone)
const both = async (...xs: (() => Promise<unknown>)[]) => {
  const out: unknown[] = []
  for (const x of xs) out.push(await x())
  return out
}

func('scanRootFolder', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1', new URL(`file:${root()}`)))
    db.komgaUserDao.insert(new KomgaUser({ email: 'u@example.org', password: 'p', id: 'U1', createdDate: date }))
    cbz('s1/a.cbz', 1)
    cbz('s1/b.cbz', 2)
    side('s1/cover.jpg')
    side('s1/a.jpg')
    cbz('s2/c.cbz', 3)
    touchDirs()
    return true
  })
  kase('first scan', async () => [await scan(), await state()])
  kase('unchanged', async () => [await scan(), await state()])
  kase('unchanged, deep', async () => [await scan(true), await state()])
  kase('book modified, book added, series emptied', async () => {
    cbz('s1/b.cbz', 20, t2)
    cbz('s1/d.cbz', 4)
    unlinkSync(r('s2/c.cbz'))
    side('s1/cover.jpg', t2)
    unlinkSync(r('s1/a.jpg'))
    touchDirs(t2)
    return [await scan(), await state()]
  })
  kase('book modified, same size and hash', async () => {
    const b = book('b')
    db.bookDao.update(b.copy({ fileHash: await graph.hasher.computeHash(b.path) }))
    utimesSync(r('s1/b.cbz'), t1, t1)
    return [await scan(true), await state()]
  })
  kase('book modified, same size, other hash', async () => {
    db.bookDao.update(book('b').copy({ fileHash: 'not the hash' }))
    utimesSync(r('s1/b.cbz'), t2, t2)
    return [await scan(true), await state()]
  })
  kase('series folder renamed, restored', async () => {
    for (const it of db.bookDao.findAll().filter((it) => it.deletedDate === null)) db.bookDao.update(it.copy({ fileHash: await graph.hasher.computeHash(it.path) }))
    const s1 = nn(db.seriesDao.findAll().find((it) => it.name === 's1'))
    db.seriesMetadataDao.update(db.seriesMetadataDao.findById(s1.id).copy({ title: 'Locked title', titleLock: true, summary: 'kept' }))
    db.seriesCollectionDao.insert(new SeriesCollection({ name: 'col', seriesIds: [s1.id], id: 'C1', createdDate: date }))
    db.thumbnailSeriesDao.insert(
      new ThumbnailSeries({
        thumbnail: oracleBytes(3),
        url: null,
        selected: true,
        type: ThumbnailSeries.Type.USER_UPLOADED,
        mediaType: 'image/jpeg',
        fileSize: 3,
        dimension: new Dimension({ width: 1, height: 1 }),
        id: 'TS',
        seriesId: s1.id,
        createdDate: date,
      }),
    )
    const a = book('a')
    db.readProgressDao.save(new ReadProgress({ bookId: a.id, userId: 'U1', page: 1, completed: false, readDate: date, createdDate: date }))
    db.readListDao.insert(new ReadList({ name: 'rl', bookIds: sortedMapOf<number, string>([1, a.id]), id: 'RL', createdDate: date }))
    db.bookMetadataDao.update(db.bookMetadataDao.findById(a.id).copy({ title: 'Locked book', titleLock: true }))
    renameSync(r('s1'), r('s1 moved'))
    touchDirs(t2)
    return both(
      () => scan(),
      () => state(),
      () => attempt(tempDir(), () => {
        const moved = nn(db.seriesDao.findAll().find((it) => it.name === 's1 moved'))
        const m = db.seriesMetadataDao.findById(moved.id)
        return [
          [m.title, m.summary],
          nn(db.seriesCollectionDao.findByIdOrNull('C1', SearchContext.empty())).seriesIds.map((it) => it === moved.id),
          [...db.thumbnailSeriesDao.findAllBySeriesId(moved.id)].map((it) => it.id),
          [...db.readProgressDao.findAll()].map((it) => db.bookDao.findByIdOrNull(it.bookId)?.name ?? null),
          [...nn(db.readListDao.findByIdOrNull('RL', SearchContext.empty())).bookIds.values()].map((it) => db.bookDao.findByIdOrNull(it)?.name ?? null),
        ]
      }),
    )
  })
  kase('book renamed, restored', async () => {
    renameSync(r('s1 moved/d.cbz'), r('s1 moved/d2.cbz'))
    touchDirs(t1)
    return [await scan(), await state()]
  })
  kase('root missing', async () => {
    renameSync(root(), join(tempDir(), 'lib-away'))
    const res = [await attempt(tempDir(), () => lifecycle.scanRootFolder(db.libraryDao.findById('L1')))]
    rmSync(join(tempDir(), 'lib'), { recursive: true, force: true })
    return res.concat([await state()])
  })
  kase('root back', async () => {
    rmSync(join(tempDir(), 'lib'), { recursive: true, force: true })
    renameSync(join(tempDir(), 'lib-away'), join(tempDir(), 'lib'))
    return [await scan(), await state()]
  })
  kase('new series with same books as deleted one is not restored without hashes', async () => {
    cbz('s3/e.cbz', 5)
    touchDirs(t2)
    return [await scan(), await state()]
  })
})
func('tryRestoreSeries', () => {
  kase('deleted series without hash', async () => {
    renameSync(r('s3'), r('s3b'))
    touchDirs(t1)
    return [await scan(), await state()]
  })
})
func('tryRestoreBooks', () => {
  kase('moved to other series', async () => {
    renameSync(r('s1 moved/d2.cbz'), r('s3b/d2.cbz'))
    touchDirs(t2)
    return [await scan(), await state()]
  })
})
func('emptyTrash', () => {
  kase('deleted series and books', () => {
    lifecycle.emptyTrash(lib())
    return state()
  })
  kase('nothing to delete', () => {
    lifecycle.emptyTrash(lib())
    return state()
  })
  kase('empty trash after scan', async () => {
    db.libraryDao.update(lib().copy({ emptyTrashAfterScan: true }))
    unlinkSync(r('s3b/e.cbz'))
    touchDirs(t1)
    return [await scan(), await state()]
  })
})
func('cleanupEmptySets', () => {
  kase('empty collections and read lists deleted', async () => {
    db.seriesCollectionDao.insert(new SeriesCollection({ name: 'empty col', id: 'C2', createdDate: date }))
    db.readListDao.insert(new ReadList({ name: 'empty rl', id: 'RL2', createdDate: date }))
    db.libraryDao.update(lib().copy({ emptyTrashAfterScan: false }))
    return [await scan(), await state(), db.rawQuery('select ID from COLLECTION order by ID'), db.rawQuery('select ID from READLIST order by ID')]
  })
  kase('root emptied', async () => {
    for (const p of walk(root()).sort().reverse()) if (p !== root()) rmSync(p, { recursive: true, force: true })
    touchDirs(t2)
    return [await scan(), await state()]
  })
})
