// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/BookMetadataLifecycleOracleTest.kt
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { BookMetadataPatchCapability } from '../../../../src/domain/model/BookMetadataPatch.js'
import type { Library } from '../../../../src/domain/model/Library.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { URL } from '../../../../src/port/java-net.js'
import { nn } from '../../../../src/port/kotlin.js'
import { Pageable } from '../../../../src/port/spring-data.js'
import { OracleDb } from '../../db.js'
import { t } from '../../infrastructure/mediacontainer/oracleZip.js'
import { fixture } from '../../infrastructure/mediacontainer/samples.js'
import { exceptionType, oracle, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, book, date, library, metadata, resource, series, zipFile } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/BookMetadataLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = graph.bookMetadataLifecycle

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'books')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const png = resource('barcode/komga.png')
const comicInfo = (body: string) => t('ComicInfo.xml', `<?xml version="1.0"?><ComicInfo>${body}</ComicInfo>`)
const full =
  '<Title>The title</Title><Series>Batman</Series><Number>3</Number><Summary>sum</Summary><Year>2020</Year><Month>5</Month>' +
  '<Writer>John Doe, Jane</Writer><Penciller>Pen</Penciller><Tags>b, A,</Tags><GTIN>9780306406157</GTIN>' +
  '<StoryArc>Arc A, Arc B, </StoryArc><StoryArcNumber>2, x, 4</StoryArcNumber><AlternateSeries>Alt</AlternateSeries><AlternateNumber>7</AlternateNumber>' +
  '<Web>https://example.org/a not-a-uri https://komga.org</Web>'
const all = () => new Set(BookMetadataPatchCapability.entries())

function addBook(id: string, url: URL) {
  const bk = book(id, 'S1', 'L1', undefined, url)
  db.bookDao.insert(bk)
  db.mediaDao.insert(new Media({ bookId: id, createdDate: date }))
  db.bookMetadataDao.insert(metadata(bk))
  graph.bookLifecycle.analyzeAndPersist(bk)
}
const b = (id: string) => nn(db.bookDao.findByIdOrNull(id))

const state = (id: string) =>
  attempt(dir(), () => {
    const it = db.bookMetadataDao.findById(id)
    return [
      [it.title, it.summary, it.number, it.numberSort, it.releaseDate, it.authors, it.tags, it.isbn, it.links],
      db.readListDao.findAll(SearchContext.empty(), Pageable.unpaged()).content.map((r) => [r.name, r.bookIds]),
      graph.takeEvents().map((e) => (e as object).constructor.name),
    ]
  })
const lib = (block: (l: Library) => Library) => db.libraryDao.update(block(db.libraryDao.findById('L1')))

func('refreshMetadata', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1', new URL(`file:${dir()}`)))
    db.seriesDao.insert(series('S1', 'L1'))
    addBook('B1', zipFile(dir(), 'b1.cbz', [['p1.png', png], comicInfo(full)]))
    addBook('B2', zipFile(dir(), 'b2.cbz', [['p1.png', png], comicInfo('<Title>  </Title><Number>1.5</Number><StoryArc>Arc A</StoryArc>')]))
    addBook('B3', zipFile(dir(), 'b3.cbz', [['p1.png', png]]))
    copyFileSync(fixture('epub/reflow.epub'), join(dir(), 'reflow.epub'))
    addBook('B4', new URL(`file:${join(dir(), 'reflow.epub')}`))
    addBook('B5', zipFile(dir(), 'b5.cbz', [['p1.png', png], t('ComicInfo.xml', '<not xml')]))
    graph.takeEvents()
    return db.mediaDao.findById('B1').files
  })
  kase('defaults, all capabilities', async () => {
    await lifecycle.refreshMetadata(b('B1'), all())
    return state('B1')
  })
  kase('again, read list already contains the book', async () => {
    await lifecycle.refreshMetadata(b('B1'), all())
    return state('B1')
  })
  kase('read list numbers taken', async () => {
    await lifecycle.refreshMetadata(b('B2'), all())
    return state('B2')
  })
  kase('no comic info', async () => {
    await lifecycle.refreshMetadata(b('B3'), all())
    return state('B3')
  })
  kase('epub', async () => {
    await lifecycle.refreshMetadata(b('B4'), all())
    return state('B4')
  })
  kase('invalid comic info', async () => {
    await lifecycle.refreshMetadata(b('B5'), all())
    return state('B5')
  })
  kase('unsupported capabilities only', async () => {
    db.bookMetadataDao.update(metadata(b('B1')))
    await lifecycle.refreshMetadata(b('B1'), new Set([BookMetadataPatchCapability.THUMBNAILS]))
    return state('B1')
  })
  kase('no capability', async () => {
    await lifecycle.refreshMetadata(b('B1'), new Set())
    return state('B1')
  })
  kase('title only applies the whole patch', async () => {
    await lifecycle.refreshMetadata(b('B1'), new Set([BookMetadataPatchCapability.TITLE]))
    return state('B1')
  })
  kase('locked fields', async () => {
    db.bookMetadataDao.update(metadata(b('B1')).copy({ title: 'locked', titleLock: true, tagsLock: true, authorsLock: true }))
    await lifecycle.refreshMetadata(b('B1'), all())
    return state('B1')
  })
  kase('book import disabled, read lists enabled', async () => {
    db.bookMetadataDao.update(metadata(b('B1')))
    lib((it) => it.copy({ importComicInfoBook: false, importEpubBook: false, importBarcodeIsbn: false }))
    await lifecycle.refreshMetadata(b('B2'), all())
    return [await state('B1'), await state('B2')]
  })
  kase('everything disabled', async () => {
    lib((it) => it.copy({ importComicInfoReadList: false }))
    await lifecycle.refreshMetadata(b('B1'), all())
    return state('B1')
  })
  kase('isbn barcode only', async () => {
    lib((it) => it.copy({ importBarcodeIsbn: true }))
    await lifecycle.refreshMetadata(b('B1'), new Set([BookMetadataPatchCapability.ISBN]))
    return state('B1')
  })
  kase('unknown library', () => exceptionType(() => lifecycle.refreshMetadata(b('B1').copy({ libraryId: 'L9' }), all())))
  kase('unknown book media', () => exceptionType(() => lifecycle.refreshMetadata(book('B9', 'S1', 'L1'), all())))
})
func('handlePatchForBookMetadata', () => {
  kase('patch applied', async () => {
    lib((it) => it.copy({ importComicInfoBook: true }))
    await lifecycle.refreshMetadata(b('B2'), new Set([BookMetadataPatchCapability.NUMBER]))
    return state('B2')
  })
  kase('null patch leaves metadata', async () => {
    await lifecycle.refreshMetadata(b('B3'), new Set([BookMetadataPatchCapability.NUMBER]))
    return state('B3')
  })
})
