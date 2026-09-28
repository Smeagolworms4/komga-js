// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/LibraryLifecycleOracleTest.kt
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../../../../src/domain/model/Library.js'
import { Sidecar } from '../../../../src/domain/model/Sidecar.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { URL } from '../../../../src/port/java-net.js'
import { OracleDb } from '../../db.js'
import { oracle, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, book, date, library, series } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/LibraryLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = new LibraryLifecycle(
  db.libraryDao,
  graph.seriesLifecycle,
  db.seriesDao,
  db.sidecarDao,
  graph.taskEmitter,
  graph.publisher,
  graph.transactionTemplate,
  graph.libraryScanScheduler,
)

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'libraries')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const url = (rel: string) => new URL(`file:${dir()}/${rel}`)
const lib = (id: string, rel: string) => library(id, url(rel))
const current = (id: string) => db.libraryDao.findById(id)

/** Changements de `block` : bibliothèque, tâches, planifications, événements */
const run = (id: string | null, block: () => unknown) =>
  attempt(dir(), async () => {
    const r = await block()
    return [r, id !== null ? db.libraryDao.findByIdOrNull(id) : null, graph.takeTasks(), graph.scheduler.log.splice(0), graph.takeEvents()]
  })

func('addLibrary', () => {
  kase('setup', () => {
    for (const it of ['lib1/sub', 'lib2', 'other', 'a b', 'lib10']) mkdirSync(join(dir(), it), { recursive: true })
    writeFileSync(join(dir(), 'file.txt'), 'x')
    return true
  })
  kase('missing root', () => run('L0', () => lifecycle.addLibrary(lib('L0', 'missing'))))
  kase('root is a file', () => run('L0', () => lifecycle.addLibrary(lib('L0', 'file.txt'))))
  kase('first library', () => run('L1', () => lifecycle.addLibrary(lib('L1', 'lib1'))))
  kase('duplicate name', () => run('L2', () => lifecycle.addLibrary(lib('L2', 'lib2').copy({ name: 'lib L1' }))))
  kase('same name other case', () => run('L2', () => lifecycle.addLibrary(lib('L2', 'lib2').copy({ name: 'LIB L1' }))))
  kase('child of existing', () => run('L3', () => lifecycle.addLibrary(lib('L3', 'lib1/sub'))))
  kase('same path as existing', () => run('L3', () => lifecycle.addLibrary(lib('L3', 'lib1'))))
  kase('sibling with common prefix', () => run('L10', () => lifecycle.addLibrary(lib('L10', 'lib10'))))
  kase('parent of existing', () => run('L4', () => lifecycle.addLibrary(lib('L4', ''))))
  kase('path with space', () => run('L5', () => lifecycle.addLibrary(lib('L5', 'a%20b'))))
  kase('duplicate id', () => run('L1', () => lifecycle.addLibrary(lib('L1', 'other'))))
})
func('checkLibraryValidity', () => {
  kase('update to missing root', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ root: url('missing') }))))
  kase('update to own path', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ name: 'renamed' }))))
  kase('update into other library', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ root: url('lib10/x') }))))
  kase('update name to other library name', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ name: 'lib L10' }))))
})
func('updateLibrary', () => {
  kase('unknown library', () => run(null, () => lifecycle.updateLibrary(lib('L9', 'other'))))
  kase('no change', () => run('L1', () => lifecycle.updateLibrary(current('L1'))))
  kase('scan interval', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ scanInterval: Library.ScanInterval.DAILY }))))
  kase('scan interval disabled', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ scanInterval: Library.ScanInterval.DISABLED }))))
  kase('hash files off then on', async () => {
    db.seriesDao.insert(series('S1', 'L1'))
    db.bookDao.insert(book('B1', 'S1', 'L1'))
    db.bookDao.insert(book('B2', 'S1', 'L1').copy({ fileHash: 'abc', fileHashKoreader: 'def' }))
    return [
      await run('L1', () => lifecycle.updateLibrary(current('L1').copy({ hashFiles: false }))),
      await run('L1', () => lifecycle.updateLibrary(current('L1').copy({ hashFiles: true }))),
    ]
  })
  kase('hash koreader on', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ hashKoreader: true }))))
  kase('hash koreader on again', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ hashKoreader: true }))))
  kase('hash pages on', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ hashPages: true }))))
  kase('repair extensions on', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ repairExtensions: true }))))
  kase('convert to cbz on', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ convertToCbz: true }))))
  kase('all off', () =>
    run('L1', () => lifecycle.updateLibrary(current('L1').copy({ hashFiles: false, hashKoreader: false, hashPages: false, repairExtensions: false, convertToCbz: false }))),
  )
  kase('everything at once', () =>
    run('L1', () =>
      lifecycle.updateLibrary(
        current('L1').copy({
          root: url('other'),
          scanInterval: Library.ScanInterval.WEEKLY,
          hashFiles: true,
          hashKoreader: true,
          hashPages: true,
          repairExtensions: true,
          convertToCbz: true,
        }),
      ),
    ),
  )
  kase('import flags do not rescan', () =>
    run('L1', () => lifecycle.updateLibrary(current('L1').copy({ importComicInfoBook: false, importEpubSeries: false, emptyTrashAfterScan: true }))),
  )
})
func('checkLibraryShouldRescan', () => {
  kase('root', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ root: url('lib1') }))))
  kase('oneshots directory', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ oneshotsDirectory: '_oneshots' }))))
  kase('oneshots directory to null', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ oneshotsDirectory: null }))))
  kase('scan cbx', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ scanCbx: false }))))
  kase('scan pdf', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ scanPdf: false }))))
  kase('scan epub', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ scanEpub: false }))))
  kase('force modified time', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ scanForceModifiedTime: true }))))
  kase('directory exclusions', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ scanDirectoryExclusions: new Set(['x']) }))))
  kase('directory exclusions same set other order', () => {
    lifecycle.updateLibrary(current('L1').copy({ scanDirectoryExclusions: new Set(['a', 'b']) }))
    graph.takeTasks()
    graph.takeEvents()
    return run('L1', () => lifecycle.updateLibrary(current('L1').copy({ scanDirectoryExclusions: new Set(['b', 'a']) })))
  })
  kase('scan on startup does not rescan', () => run('L1', () => lifecycle.updateLibrary(current('L1').copy({ scanOnStartup: true }))))
})
func('deleteLibrary', () => {
  kase('with series, books and sidecars', () => {
    db.seriesDao.insert(series('S2', 'L1'))
    db.bookDao.insert(book('B3', 'S2', 'L1'))
    db.sidecarDao.save(
      'L1',
      new Sidecar({ url: url('lib1/cover.jpg'), parentUrl: url('lib1'), lastModifiedTime: date, type: Sidecar.Type.ARTWORK, source: Sidecar.Source.SERIES }),
    )
    return run('L1', () => {
      lifecycle.deleteLibrary(current('L1'))
      return [db.seriesDao.findAll().map((it) => it.id), db.bookDao.findAll().map((it) => it.id), db.sidecarDao.findAll().map((it) => it.url)]
    })
  })
  kase('unknown library', () => run(null, () => lifecycle.deleteLibrary(lib('L9', 'x'))))
  kase('remaining', () => db.libraryDao.findAll().map((it) => it.id).sort())
})
