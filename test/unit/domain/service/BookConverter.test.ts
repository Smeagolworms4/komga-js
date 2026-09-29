// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/BookConverterOracleTest.kt
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Book } from '../../../../src/domain/model/Book.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { URL } from '../../../../src/port/java-net.js'
import { urlToPath } from '../../../../src/port/java.js'
import { nn } from '../../../../src/port/kotlin.js'
import { OracleDb } from '../../db.js'
import { t } from '../../infrastructure/mediacontainer/oracleZip.js'
import { fixture, komgaRes } from '../../infrastructure/mediacontainer/samples.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, date, library, metadata, resource, series, zipFile } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/BookConverter')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const converter = graph.bookConverter

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'lib')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const png = resource('barcode/komga.png')
const pathOf = (u: URL) => urlToPath(u)

async function addBook(id: string, path: string, libraryId = 'L1'): Promise<Book> {
  const scanned = nn(graph.fileSystemScanner.scanFile(path)).copy({ id, seriesId: `S${libraryId}`, libraryId, createdDate: date, lastModifiedDate: date })
  db.bookDao.insert(scanned)
  db.bookMetadataDao.insert(metadata(scanned))
  db.mediaDao.insert((await graph.bookAnalyzer.analyze(scanned, true)).copy({ createdDate: date }))
  return scanned
}
const copy = (from: string, name: string) => {
  const to = join(dir(), name)
  copyFileSync(from, to)
  return to
}
const b = (id: string) => nn(db.bookDao.findByIdOrNull(id))

const state = (id: string) =>
  attempt(dir(), () => {
    const bk = db.bookDao.findByIdOrNull(id)
    const m = db.mediaDao.findByIdOrNull(id)
    return [
      bk !== null ? [bk.name, bk.url, bk.fileLastModified, bk.number, bk.seriesId, bk.libraryId] : null,
      m !== null ? [m.status, m.mediaType, m.pageCount, m.pages.map((p) => [p.fileName, p.mediaType, p.fileHash, p.dimension]), m.files.map((f) => f.fileName)] : null,
      readdirSync(dir()).sort(),
      db.rawQuery('select TYPE, BOOK_ID, SERIES_ID from HISTORICAL_EVENT order by TYPE, BOOK_ID'),
      graph.takeEvents().map((e) => (e as object).constructor.name),
    ]
  })

func('getConvertibleBooks', () => {
  kase('setup', async () => {
    db.libraryDao.insert(library('L1', new URL(`file:${dir()}`)).copy({ convertToCbz: true, repairExtensions: true }))
    db.libraryDao.insert(library('L2', new URL(`file:${dir()}`)))
    db.seriesDao.insert(series('SL1', 'L1', new URL(`file:${dir()}`)))
    db.seriesDao.insert(series('SL2', 'L2', new URL(`file:${dir()}`)))
    await addBook('R4', copy(komgaRes('archives/rar4.rar'), 'rar4.cbr'))
    await addBook('R5', copy(komgaRes('archives/rar5.rar'), 'rar5.rar'))
    await addBook('RX', copy(komgaRes('archives/rar4.rar'), 'exists.cbr'))
    writeFileSync(join(dir(), 'exists.cbz'), oracleBytes(3))
    await addBook('RE', copy(komgaRes('archives/rar4-encrypted.rar'), 'encrypted.cbr'))
    await addBook('RL2', copy(komgaRes('archives/rar5.rar'), 'other.cbr'), 'L2')
    await addBook('Z1', pathOf(zipFile(dir(), 'zip.cbz', [['p1.png', png], t('ComicInfo.xml', '<ComicInfo/>')])))
    await addBook('ZR', pathOf(zipFile(dir(), 'zipped.cbr', [['p1.png', png]])))
    await addBook('PE', copy(fixture('pdf/komga.pdf'), 'doc.epub'))
    await addBook('EZ', pathOf(zipFile(dir(), 'ep.epub', [['p1.png', png]])))
    await addBook('EP', copy(fixture('epub/reflow.epub'), 'reflow.zip'))
    await addBook('OK', copy(fixture('pdf/komga.pdf'), 'good.pdf'))
    return db.rawQuery('select BOOK_ID, STATUS, MEDIA_TYPE from MEDIA order by BOOK_ID')
  })
  kase('enabled', () => converter.getConvertibleBooks(db.libraryDao.findById('L1')).map((it) => it.id).sort())
  kase('disabled', () => converter.getConvertibleBooks(db.libraryDao.findById('L2')))
  kase('enabled on L2', () => converter.getConvertibleBooks(db.libraryDao.findById('L2').copy({ convertToCbz: true })).map((it) => it.id))
  kase('unknown library', () => converter.getConvertibleBooks(library('L9').copy({ convertToCbz: true })))
})
func('getMismatchedExtensionBooks', () => {
  kase('library L1', () => converter.getMismatchedExtensionBooks(db.libraryDao.findById('L1')).map((it) => it.id).sort())
  kase('library L2', () => converter.getMismatchedExtensionBooks(db.libraryDao.findById('L2')).map((it) => it.id))
})
func('convertToCbz', () => {
  kase('disabled library', async () => {
    await converter.convertToCbz(b('RL2'))
    return state('RL2')
  })
  kase('rar4', async () => {
    await attempt(dir(), () => converter.convertToCbz(b('R4')))
    return state('R4')
  })
  kase('rar5 with hashes', async () => {
    const m = db.mediaDao.findById('R5')
    db.mediaDao.update(m.copy({ pages: m.pages.map((p, i) => p.copy({ fileHash: `H${i}` })) }))
    await attempt(dir(), () => converter.convertToCbz(b('R5')))
    return state('R5')
  })
  kase('destination exists', () => attempt(dir(), () => converter.convertToCbz(b('RX'))))
  kase('not convertible', () => attempt(dir(), () => converter.convertToCbz(b('Z1'))))
  kase('changed on disk', async () => {
    await converter.convertToCbz(b('RE').copy({ fileLastModified: date }))
    return state('RE')
  })
  kase('encrypted, not ready', () => attempt(dir(), () => converter.convertToCbz(b('RE'))))
  kase('file not found', () => attempt(dir(), () => converter.convertToCbz(b('R4').copy({ url: new URL(`file:${dir()}/gone.cbr`) }))))
  kase('unknown library', () => exceptionType(() => converter.convertToCbz(b('R4').copy({ libraryId: 'L9' }))))
  kase('failed conversion is remembered', async () => {
    db.mediaDao.update(db.mediaDao.findById('RE').copy({ status: Media.Status.READY }))
    const a = await attempt(dir(), () => converter.convertToCbz(b('RE')))
    const s = await state('RE')
    return [a, s, await attempt(dir(), () => converter.convertToCbz(b('RE')))]
  })
})
func('repairExtension', () => {
  kase('disabled library', () => {
    converter.repairExtension(b('RL2'))
    return state('RL2')
  })
  kase('zip named cbr', async () => {
    await attempt(dir(), () => converter.repairExtension(b('ZR')))
    return state('ZR')
  })
  kase('pdf named epub', async () => {
    await attempt(dir(), () => converter.repairExtension(b('PE')))
    return state('PE')
  })
  kase('epub detected as zip is skipped', async () => {
    await attempt(dir(), () => converter.repairExtension(b('EZ')))
    return [await state('EZ'), await attempt(dir(), () => converter.repairExtension(b('EZ')))]
  })
  kase('epub named zip', async () => {
    await attempt(dir(), () => converter.repairExtension(b('EP')))
    return state('EP')
  })
  kase('extension already correct', async () => [
    await attempt(dir(), () => converter.repairExtension(b('OK'))),
    await state('OK'),
    await attempt(dir(), () => converter.repairExtension(b('OK'))),
  ])
  kase('unsupported media type', () => {
    db.mediaDao.update(db.mediaDao.findById('Z1').copy({ mediaType: 'image/png' }))
    return attempt(dir(), () => converter.repairExtension(b('Z1')))
  })
  kase('file not found', () => attempt(dir(), () => converter.repairExtension(b('R4').copy({ url: new URL(`file:${dir()}/gone.cbr`) }))))
  kase('destination exists', async () => {
    writeFileSync(join(dir(), 'clash.cbz'), oracleBytes(3))
    await addBook('CL', pathOf(zipFile(dir(), 'clash.cbr', [['p1.png', png]])))
    return attempt(dir(), () => converter.repairExtension(b('CL')))
  })
  kase('unknown library', () => exceptionType(() => converter.repairExtension(b('ZR').copy({ libraryId: 'L9' }))))
})
