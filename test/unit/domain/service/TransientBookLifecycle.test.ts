// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/TransientBookLifecycleOracleTest.kt
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Media } from '../../../../src/domain/model/Media.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { TransientBook } from '../../../../src/domain/model/TransientBook.js'
import { TransientBookLifecycle } from '../../../../src/domain/service/TransientBookLifecycle.js'
import { TransientBookCache } from '../../../../src/infrastructure/cache/TransientBookCache.js'
import { ImageType } from '../../../../src/infrastructure/image/ImageType.js'
import { URL } from '../../../../src/port/java-net.js'
import { nn } from '../../../../src/port/kotlin.js'
import { OracleDb } from '../../db.js'
import { t } from '../../infrastructure/mediacontainer/oracleZip.js'
import { digest, fixture } from '../../infrastructure/mediacontainer/samples.js'
import { oracle, oracleBytes, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, book, date, library, resource, series, zipFile } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/TransientBookLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const cache = new TransientBookCache()
const lifecycle = new TransientBookLifecycle(
  cache,
  graph.bookAnalyzer,
  graph.fileSystemScanner,
  db.libraryDao,
  ImageType.JPEG,
  db.seriesDao,
  [graph.comicInfoProvider, graph.epubMetadataProvider],
  [graph.isbnBarcodeProvider, graph.comicInfoProvider, graph.epubMetadataProvider],
)

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'root')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const png = resource('barcode/komga.png')
const comicInfo = (body: string) => t('ComicInfo.xml', `<?xml version="1.0"?><ComicInfo>${body}</ComicInfo>`)
const scanned = new Map<string, TransientBook>()
const tb = (name: string) => nn(scanned.get(name))
const brief = (x: TransientBook) => [x.book.name, x.book.url, x.book.fileSize, x.media.status, x.media.mediaType, x.media.pageCount, x.metadata]
const byFirst = (a: unknown[], b: unknown[]) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0)
const mkdir = (p: string) => {
  mkdirSync(p, { recursive: true })
  return p
}

func('scanAndPersist', () => {
  kase('setup', () => {
    const lib = mkdir(join(dir(), 'library'))
    db.libraryDao.insert(library('L1', new URL(`file:${lib}`)))
    db.seriesDao.insert(series('S1', 'L1'))
    db.seriesMetadataDao.insert(new SeriesMetadata({ title: 'Batman', seriesId: 'S1', createdDate: date }))
    db.seriesDao.insert(series('S2', 'L1'))
    db.seriesMetadataDao.insert(new SeriesMetadata({ title: 'Batman Beyond', seriesId: 'S2', createdDate: date }))
    db.seriesDao.insert(series('S3', 'L1'))
    db.seriesMetadataDao.insert(new SeriesMetadata({ title: 'Superman (2016)', seriesId: 'S3', createdDate: date }))
    const imp = mkdir(join(dir(), 'import'))
    zipFile(imp, 'batman.cbz', [['p1.png', png], comicInfo('<Series>Batman</Series><Number>3</Number>')])
    zipFile(imp, 'bat.cbz', [['p1.png', png], comicInfo('<Series>Beyond</Series><Number>2.5</Number>')])
    zipFile(imp, 'superman.cbz', [['p1.png', png], comicInfo('<Series>Superman</Series><Volume>2016</Volume><Number>x</Number>')])
    zipFile(imp, 'blank.cbz', [['p1.png', png], comicInfo('<Series> </Series>')])
    zipFile(imp, 'nometa.cbz', [['p1.png', png]])
    writeFileSync(join(imp, 'notes.txt'), oracleBytes(3))
    copyFileSync(fixture('pdf/komga.pdf'), join(imp, 'doc.pdf'))
    copyFileSync(fixture('epub/reflow.epub'), join(imp, 'reflow.epub'))
    zipFile(mkdir(join(imp, 'sub')), 'deep.cbz', [['p1.png', png]])
    zipFile(lib, 'inlib.cbz', [['p1.png', png]])
    return true
  })
  kase('folder outside libraries', () =>
    attempt(dir(), () => {
      const list = lifecycle.scanAndPersist(join(dir(), 'import'))
      for (const it of list) scanned.set(it.book.name, it)
      return list.map(brief).sort(byFirst)
    }),
  )
  kase('persisted in cache', () =>
    attempt(dir(), () =>
      [...scanned.values()]
        .map((it) => {
          const x = cache.findByIdOrNull(it.book.id)
          return x !== null ? brief(x) : null
        })
        .sort((a, b) => byFirst(a ?? [], b ?? [])),
    ),
  )
  kase('library folder', () => attempt(dir(), () => lifecycle.scanAndPersist(join(dir(), 'library'))))
  kase('library subfolder', () => attempt(dir(), () => lifecycle.scanAndPersist(join(dir(), 'library/sub'))))
  kase('parent of library', () => attempt(dir(), () => lifecycle.scanAndPersist(dir()).map(brief).sort(byFirst)))
  kase('missing folder', () => attempt(dir(), () => lifecycle.scanAndPersist(join(dir(), 'nope'))))
  kase('relative path', () => attempt(dir(), () => lifecycle.scanAndPersist('does/not/exist')))
})
func('analyzeAndPersist', () => {
  for (const name of ['batman', 'bat', 'superman', 'blank', 'nometa', 'doc', 'reflow', 'deep']) {
    kase(name, () =>
      attempt(dir(), async () => {
        const updated = await lifecycle.analyzeAndPersist(tb(name))
        scanned.set(name, updated)
        return [brief(updated), cache.findByIdOrNull(updated.book.id)?.metadata ?? null]
      }),
    )
  }
})
func('getMetadata', () => {
  kase('comic info series exact', () => lifecycle.getMetadata(tb('batman')))
  kase('contains search', () => lifecycle.getMetadata(tb('bat')))
  kase('append volume title', () => lifecycle.getMetadata(tb('superman')))
  kase('blank series', () => lifecycle.getMetadata(tb('blank')))
  kase('no metadata', () => lifecycle.getMetadata(tb('nometa')))
  kase('epub', () => lifecycle.getMetadata(tb('reflow')))
  kase('not analyzed', () =>
    attempt(dir(), () =>
      lifecycle.getMetadata(new TransientBook({ book: book('X', '', '', undefined, new URL(`file:${dir()}/import/batman.cbz`)), media: new Media() })),
    ),
  )
})
func('getBookPage', () => {
  kase('zip page', () =>
    attempt(dir(), () => {
      const it = lifecycle.getBookPage(tb('batman'), 1)
      return [digest(it.bytes), it.mediaType]
    }),
  )
  kase('page 2', () => attempt(dir(), () => lifecycle.getBookPage(tb('batman'), 2)))
  kase('pdf page', () =>
    attempt(dir(), async () => {
      const it = lifecycle.getBookPage(tb('doc'), 1)
      return [await graph.describeImage(it.bytes), it.mediaType]
    }),
  )
  kase('epub reflow', () => attempt(dir(), () => lifecycle.getBookPage(tb('reflow'), 1)))
  kase('not analyzed', () => attempt(dir(), () => lifecycle.getBookPage(new TransientBook({ book: book('X', '', ''), media: new Media() }), 1)))
})
