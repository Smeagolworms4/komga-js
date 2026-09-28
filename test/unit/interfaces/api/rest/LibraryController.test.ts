// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/LibraryControllerOracleTest.kt
import { DirectoryNotFoundException, DuplicateNameException, PathContainedInPath } from '../../../../../src/domain/model/Exceptions.js'
import { Library } from '../../../../../src/domain/model/Library.js'
import type { LibraryLifecycle } from '../../../../../src/domain/service/LibraryLifecycle.js'
import { LibraryController } from '../../../../../src/interfaces/api/rest/LibraryController.js'
import { LibraryCreationDto } from '../../../../../src/interfaces/api/rest/dto/LibraryCreationDto.js'
import { LibraryUpdateDto } from '../../../../../src/interfaces/api/rest/dto/LibraryUpdateDto.js'
import { FileNotFoundException } from '../../../../../src/port/java-io.js'
import { URL } from '../../../../../src/port/java-net.js'
import { IllegalStateException } from '../../../../../src/port/kotlin.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { Calls, FIXED, principal, read, taskEmitter, tasks } from './rest-oracle.js'
import * as samples from './rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/LibraryController')

const db = new OracleDb()
const calls = new Calls()

/** Enregistre les appels ; échoue selon la racine de la bibliothèque (même faux côté Kotlin) */
const fail = (library: Library) => {
  const root = library.root.toString()
  if (root.endsWith('/dup')) throw new DuplicateNameException('Library name already exists', 'ERR_1015')
  if (root.endsWith('/missing')) throw new DirectoryNotFoundException('Library root folder does not exist', 'ERR_1016')
  if (root.endsWith('/nofile')) throw new FileNotFoundException('no file')
  if (root.endsWith('/contained')) throw new PathContainedInPath('Library path is a child of another', 'ERR_1017')
  if (root.endsWith('/boom')) throw new IllegalStateException('boom')
}
const lifecycle = {
  addLibrary: (l: Library) => {
    calls.add('addLibrary', l)
    fail(l)
    return l
  },
  updateLibrary: (l: Library) => {
    calls.add('updateLibrary', l)
    fail(l)
  },
  deleteLibrary: (l: Library) => calls.add('deleteLibrary', l.id),
} as unknown as LibraryLifecycle

const c = new LibraryController(taskEmitter(db, calls), lifecycle, db.libraryDao, db.bookDao, db.seriesDao)
const admin = principal(samples.admin)
const all = principal(samples.all)
const l1 = principal(samples.l1Only)
const create = (src: string) => read<LibraryCreationDto>(src, { class: LibraryCreationDto })
const update = (src: string) => read<LibraryUpdateDto>(src, { class: LibraryUpdateDto })
const take = <T>(v: T) => {
  calls.take()
  return v
}

func('getLibraries', () => {
  kase('empty', () => c.getLibraries(admin))
  kase('admin sees roots, sorted by lowercase name', () => {
    samples.seed(db)
    db.libraryDao.insert(new Library({ name: 'apple', root: new URL('file:/lib3'), id: 'L3', createdDate: FIXED }))
    return c.getLibraries(admin)
  })
  kase('user without root', () => c.getLibraries(all))
  kase('restricted user', () => c.getLibraries(l1))
})
func('getLibraryById', () => {
  kase('admin', () => c.getLibraryById(admin, 'L1'))
  kase('user', () => c.getLibraryById(all, 'L2'))
  kase('restricted, allowed', () => c.getLibraryById(l1, 'L1'))
  kase('restricted, forbidden', () => c.getLibraryById(l1, 'L2'))
  kase('not found', () => c.getLibraryById(admin, 'LX'))
})
func('addLibrary', () => {
  kase('defaults', () => [stable(c.addLibrary(admin, create('{"name":"New","root":"/data/new"}'))), calls.take()])
  kase('all fields, non admin result', () => [
    stable(
      c.addLibrary(
        all,
        create(`{"name":"Full","root":"/data/My Comics/é","importComicInfoBook":false,"importComicInfoSeries":false,"importComicInfoCollection":false,
"importComicInfoReadList":false,"importComicInfoSeriesAppendVolume":false,"importEpubBook":false,"importEpubSeries":false,"importMylarSeries":false,
"importLocalArtwork":false,"importBarcodeIsbn":false,"scanForceModifiedTime":true,"scanInterval":"DAILY","scanOnStartup":true,"scanCbx":false,
"scanPdf":false,"scanEpub":false,"scanDirectoryExclusions":["#recycle"],"repairExtensions":true,"convertToCbz":true,"emptyTrashAfterScan":true,
"seriesCover":"LAST","hashFiles":false,"hashPages":true,"hashKoreader":true,"analyzeDimensions":false,"oneshotsDirectory":"_one"}`),
      ),
    ),
    calls.take(),
  ])
  kase('blank oneshots directory', () => take(stable(c.addLibrary(admin, create('{"name":"B","root":"/b","oneshotsDirectory":"  "}')))))
  kase('duplicate', () => take(c.addLibrary(admin, create('{"name":"D","root":"/x/dup"}'))))
  kase('directory not found', () => take(c.addLibrary(admin, create('{"name":"D","root":"/x/missing"}'))))
  kase('file not found', () => take(c.addLibrary(admin, create('{"name":"D","root":"/x/nofile"}'))))
  kase('contained', () => take(c.addLibrary(admin, create('{"name":"D","root":"/x/contained"}'))))
  kase('other error', async () => [await exceptionType(() => c.addLibrary(admin, create('{"name":"D","root":"/x/boom"}'))), calls.take()])
})
func('updateLibraryByIdDeprecated', () => {
  kase('empty patch keeps everything', () => {
    c.updateLibraryByIdDeprecated('L1', update('{}'))
    return calls.take()
  })
  kase('patch', () => {
    c.updateLibraryByIdDeprecated(
      'L1',
      update('{"name":"Renamed","root":"/new/root","scanInterval":"WEEKLY","seriesCover":"FIRST_UNREAD_OR_FIRST","hashPages":true,"scanDirectoryExclusions":["a"],"oneshotsDirectory":"os"}'),
    )
    return calls.take()
  })
  kase('null exclusions and oneshots', () => {
    c.updateLibraryByIdDeprecated('L1', update('{"scanDirectoryExclusions":null,"oneshotsDirectory":null}'))
    return calls.take()
  })
  kase('blank oneshots', () => {
    c.updateLibraryByIdDeprecated('L1', update('{"oneshotsDirectory":" "}'))
    return calls.take()
  })
  kase('not found', () => [c.updateLibraryByIdDeprecated('LX', update('{}')), calls.take()])
  kase('duplicate', () => take(c.updateLibraryByIdDeprecated('L1', update('{"root":"/x/dup"}'))))
  kase('other error', async () => [await exceptionType(() => c.updateLibraryByIdDeprecated('L1', update('{"root":"/x/boom"}'))), calls.take()])
})
func('deleteLibraryById', () => {
  kase('existing', () => {
    c.deleteLibraryById('L2')
    return calls.take()
  })
  kase('not found', () => c.deleteLibraryById('LX'))
})
func('libraryScan', () => {
  kase('default', () => {
    c.libraryScan('L1')
    return [tasks(db), calls.take()]
  })
  kase('deep', () => {
    c.libraryScan('L1', true)
    return tasks(db)
  })
  kase('not found', async () => [await exceptionType(() => c.libraryScan('LX')), tasks(db)])
})
func('libraryAnalyze', () => {
  kase('L1', () => {
    c.libraryAnalyze('L1')
    return [tasks(db), calls.take()]
  })
  kase('unknown library: no book', () => {
    c.libraryAnalyze('LX')
    return [tasks(db), calls.take()]
  })
})
func('libraryRefreshMetadata', () => {
  kase('L1', () => {
    c.libraryRefreshMetadata('L1')
    return [tasks(db), calls.take()]
  })
  kase('L2', () => {
    c.libraryRefreshMetadata('L2')
    return tasks(db)
  })
  kase('unknown', () => {
    c.libraryRefreshMetadata('LX')
    return [tasks(db), calls.take()]
  })
})
func('libraryEmptyTrash', () => {
  kase('L1', () => {
    c.libraryEmptyTrash('L1')
    return [tasks(db), calls.take()]
  })
  kase('not found', async () => [await exceptionType(() => c.libraryEmptyTrash('LX')), tasks(db)])
})
