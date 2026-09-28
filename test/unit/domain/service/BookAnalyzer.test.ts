// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/BookAnalyzerOracleTest.kt
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { BookWithMedia } from '../../../../src/domain/model/BookWithMedia.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { MediaExtensionEpub } from '../../../../src/domain/model/MediaExtension.js'
import type { TypedBytes } from '../../../../src/domain/model/TypedBytes.js'
import { URL } from '../../../../src/port/java-net.js'
import { nn } from '../../../../src/port/kotlin.js'
import { OracleDb } from '../../db.js'
import { t } from '../../infrastructure/mediacontainer/oracleZip.js'
import { digest, fixture, komgaRes } from '../../infrastructure/mediacontainer/samples.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, book, resource, zipFile } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/BookAnalyzer')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const analyzer = graph.bookAnalyzer

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'books')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const png = resource('barcode/komga.png')
const jpg = resource('barcode/page_384.jpg')
const bk = (id: string, url: URL) => book(id, 'S1', 'L1', undefined, url)
const fileUrl = (p: string) => new URL(`file:${p}`)
const write = (name: string, content: Uint8Array) => {
  const p = join(dir(), name)
  writeFileSync(p, content)
  return fileUrl(p)
}

let filesCache: [string, URL][] | null = null
const files = () =>
  (filesCache ??= [
    ['cbz', zipFile(dir(), 'b1.cbz', [['p1.png', png], ['p2.jpg', jpg], t('info.txt', 'hello'), ['dir/', null], ['zz.png', png]])],
    ['cbz without image', zipFile(dir(), 'noimage.cbz', [t('a.txt', 'a')])],
    ['cbz with unknown entry', zipFile(dir(), 'unknown.cbz', [['p1.png', png], ['blob', oracleBytes(0)]])],
    ['empty zip', zipFile(dir(), 'empty.cbz', [])],
    ['garbage cbz', write('garbage.cbz', oracleBytes(100))],
    ['text as epub', write('text.epub', Buffer.from('hello'))],
    ['zip as epub', fileUrl(komgaRes('archives/zip-as-epub.epub'))],
    ['missing', new URL(`file:${dir()}/missing.cbz`)],
    ['zip.zip', fileUrl(komgaRes('archives/zip.zip'))],
    ['rar4', fileUrl(komgaRes('archives/rar4.rar'))],
    ['rar5', fileUrl(komgaRes('archives/rar5.rar'))],
    ['rar4 encrypted', fileUrl(komgaRes('archives/rar4-encrypted.rar'))],
    ['7zip', fileUrl(komgaRes('archives/7zip.7z'))],
    ['epub3', fileUrl(komgaRes('archives/epub3.epub'))],
    ['divina epub', fileUrl(fixture('epub/divina.epub'))],
    ['reflow epub', fileUrl(fixture('epub/reflow.epub'))],
    ['kepub', fileUrl(fixture('epub/kepub.epub'))],
    ['missing opf epub', fileUrl(fixture('epub/missing-opf.epub'))],
    ['pdf', fileUrl(fixture('pdf/komga.pdf'))],
    ['encrypted pdf', fileUrl(fixture('pdf/enc-user.pdf'))],
    ['not a pdf', fileUrl(fixture('pdf/not-a-pdf.pdf'))],
    ['rar with dirs', fileUrl(fixture('rar/r4-dirs.rar'))],
  ])

const labels = [
  'cbz',
  'cbz without image',
  'cbz with unknown entry',
  'empty zip',
  'garbage cbz',
  'text as epub',
  'zip as epub',
  'missing',
  'zip.zip',
  'rar4',
  'rar5',
  'rar4 encrypted',
  '7zip',
  'epub3',
  'divina epub',
  'reflow epub',
  'kepub',
  'missing opf epub',
  'pdf',
  'encrypted pdf',
  'not a pdf',
  'rar with dirs',
]

const analyzed = new Map<string, BookWithMedia>()

function med(m: Media) {
  const ext = m.extension
  return [
    m.status,
    m.mediaType,
    m.pageCount,
    m.pages,
    m.files,
    m.comment,
    m.bookId,
    m.epubDivinaCompatible,
    m.epubIsKepub,
    ext instanceof MediaExtensionEpub ? [ext.isFixedLayout, ext.positions.length, ext.toc.length, ext.landmarks.length, ext.pageList.length] : null,
  ]
}

const typed = (x: TypedBytes | null) => (x !== null ? [digest(x.bytes), x.mediaType] : null)

/** Chemins dépendant de la machine : répertoire temporaire, fixtures des conteneurs, ressources de test de Komga */
const replacements = (): [string, string][] => [
  [dir(), '<tmp>'],
  [fixture('').replace(/\/$/, ''), '<fixtures>'],
  [komgaRes('').replace(/\/$/, ''), '<resources>'],
]
const run = (block: () => unknown) => attempt(replacements(), block)
const ready = (label: string) => nn(analyzed.get(label))
const withMedia = (b: BookWithMedia, m: Partial<ConstructorParameters<typeof Media>[0]>) => b.copy({ media: b.media.copy(m) })
const noProfile = (m: Media) => new BookWithMedia({ book: bk('X', new URL('file:/x')), media: m })

func('analyze', () => {
  for (const label of labels) {
    for (const dims of [true, false]) {
      kase(`${label}, dimensions ${dims}`, () =>
        run(() => {
          const url = nn(files().find(([l]) => l === label))[1]
          const m = analyzer.analyze(bk(`B-${label}`, url), dims)
          if (dims) analyzed.set(label, new BookWithMedia({ book: bk(`B-${label}`, url), media: m }))
          return med(m)
        }),
      )
    }
  }
})
func('analyzeDivina', () => {
  kase('pages and files', () => med(ready('cbz').media))
  kase('unknown entries', () => med(ready('cbz with unknown entry').media))
})
func('analyzeEpub', () => {
  kase('reflow', () => med(ready('reflow epub').media))
  kase('divina', () => med(ready('divina epub').media))
})
func('analyzePdf', () => {
  kase('komga.pdf', () => med(ready('pdf').media))
})
func('generateThumbnail', () => {
  for (const label of ['cbz', 'zip.zip', 'rar4', 'divina epub', 'reflow epub', 'epub3', 'pdf', 'missing', 'empty zip']) {
    kase(label, () =>
      run(async () => {
        const it = await analyzer.generateThumbnail(ready(label))
        return [it.type, it.mediaType, it.dimension, it.bookId, it.selected, await graph.describeImage(it.thumbnail)]
      }),
    )
  }
  kase('no cover', () =>
    run(async () => {
      const it = await analyzer.generateThumbnail(withMedia(ready('reflow epub'), { epubDivinaCompatible: false }))
      return [it.type, it.mediaType, it.dimension, it.bookId, it.selected, await graph.describeImage(it.thumbnail)]
    }),
  )
})
func('getPoster@267', () => {
  for (const label of ['cbz', 'zip.zip', 'rar4', 'rar5', 'divina epub', 'reflow epub', 'epub3', 'kepub', '7zip', 'missing']) {
    kase(label, () => run(() => typed(analyzer.getPoster(ready(label)))))
  }
  kase('pdf', () =>
    run(async () => {
      const it = analyzer.getPoster(ready('pdf'))
      return it !== null ? [await graph.describeImage(it.bytes), it.mediaType] : null
    }),
  )
  kase('media without profile', () => analyzer.getPoster(noProfile(new Media({ status: Media.Status.READY }))))
})
func('getPoster@275', () => {
  kase('first page of zip', () => run(() => typed(analyzer.getPoster(ready('cbz')))))
  kase('divina without pages', () => run(() => analyzer.getPoster(withMedia(ready('cbz'), { pages: [] }))))
  kase('first page missing in archive', () =>
    run(() => analyzer.getPoster(withMedia(ready('cbz'), { pages: [new BookPage({ fileName: 'nope.png', mediaType: 'image/png' })] }))),
  )
})
func('getPageContent', () => {
  kase('zip page 1', () => run(() => digest(analyzer.getPageContent(ready('cbz'), 1))))
  kase('zip page 3', () => run(() => digest(analyzer.getPageContent(ready('cbz'), 3))))
  kase('zip page 0', () => run(() => analyzer.getPageContent(ready('cbz'), 0)))
  kase('zip page 4', () => run(() => analyzer.getPageContent(ready('cbz'), 4)))
  kase('rar page', () => run(() => digest(analyzer.getPageContent(ready('rar5'), 1))))
  kase('epub divina page', () => run(() => digest(analyzer.getPageContent(ready('divina epub'), 3))))
  kase('epub reflow', () => run(() => analyzer.getPageContent(ready('reflow epub'), 1)))
  kase('pdf page', () => run(() => graph.describeImage(analyzer.getPageContent(ready('pdf'), 1))))
  kase('not ready', () => run(() => analyzer.getPageContent(ready('missing'), 1)))
  kase('no profile', () => run(() => analyzer.getPageContent(noProfile(new Media({ status: Media.Status.READY, pageCount: 1 })), 1)))
  kase('entry missing', () =>
    run(() =>
      exceptionType(() => analyzer.getPageContent(withMedia(ready('cbz'), { pages: [new BookPage({ fileName: 'nope.png', mediaType: 'image/png' })] }), 1)),
    ),
  )
})
func('getPageContentRaw', () => {
  kase('pdf page 1', () =>
    run(() => {
      const it = analyzer.getPageContentRaw(ready('pdf'), 1)
      return [it.mediaType, Buffer.from(it.bytes.subarray(0, 5)).toString('latin1')]
    }),
  )
  kase('pdf page 0', () => run(() => analyzer.getPageContentRaw(ready('pdf'), 0)))
  kase('pdf page after last', () => run(() => analyzer.getPageContentRaw(ready('pdf'), 99)))
  kase('zip', () => run(() => analyzer.getPageContentRaw(ready('cbz'), 1)))
  kase('pdf not ready', () => run(() => analyzer.getPageContentRaw(withMedia(ready('pdf'), { status: Media.Status.OUTDATED }), 1)))
})
func('getFileContent', () => {
  kase('zip file', () => run(() => Buffer.from(analyzer.getFileContent(ready('cbz'), 'info.txt')).toString('utf8')))
  kase('zip page file', () => run(() => digest(analyzer.getFileContent(ready('cbz'), 'p1.png'))))
  kase('zip missing entry', () => run(() => exceptionType(() => analyzer.getFileContent(ready('cbz'), 'nope'))))
  kase('epub file', () => run(() => digest(analyzer.getFileContent(ready('reflow epub'), 'OPS/c1.xhtml'))))
  kase('epub missing entry', () => run(() => exceptionType(() => analyzer.getFileContent(ready('reflow epub'), 'nope'))))
  kase('pdf', () => run(() => analyzer.getFileContent(ready('pdf'), 'x')))
  kase('not ready', () => run(() => analyzer.getFileContent(ready('missing'), 'x')))
  kase('no profile', () => run(() => analyzer.getFileContent(noProfile(new Media({ status: Media.Status.READY })), 'x')))
})
func('hashPages', () => {
  kase('few pages', () => run(async () => (await analyzer.hashPages(ready('cbz'))).pages))
  kase('many pages, first and last hashed', () =>
    run(async () => {
      const url = zipFile(
        dir(),
        'many.cbz',
        Array.from({ length: 8 }, (_, i) => [`p${i + 1}.png`, png]),
      )
      const m = analyzer.analyze(bk('BM', url), false)
      return (await analyzer.hashPages(new BookWithMedia({ book: bk('BM', url), media: m }))).pages.map((it) => [it.fileName, it.fileHash])
    }),
  )
  kase('already hashed pages kept', () =>
    run(async () => (await analyzer.hashPages(withMedia(ready('cbz'), { pages: ready('cbz').media.pages.map((p) => p.copy({ fileHash: 'KEEP' })) }))).pages.map((it) => it.fileHash)),
  )
  kase('epub divina', () => run(async () => (await analyzer.hashPages(ready('divina epub'))).pages.map((it) => it.fileHash)))
  kase('not ready', () => run(() => analyzer.hashPages(ready('missing'))))
  kase('no pages', () => run(async () => (await analyzer.hashPages(ready('reflow epub'))).pages))
})
func('hashPage', () => {
  kase('png', () => analyzer.hashPage(new BookPage({ fileName: 'p', mediaType: 'image/png' }), png))
  kase('jpeg is re-encoded', () => analyzer.hashPage(new BookPage({ fileName: 'p', mediaType: 'image/jpeg' }), jpg))
  kase('jpeg bytes as png', () => analyzer.hashPage(new BookPage({ fileName: 'p', mediaType: 'image/png' }), jpg))
  kase('empty', () => analyzer.hashPage(new BookPage({ fileName: 'p', mediaType: 'image/gif' }), new Uint8Array(0)))
  kase('not a jpeg', () => exceptionType(() => analyzer.hashPage(new BookPage({ fileName: 'p', mediaType: 'image/jpeg' }), png)))
})
func('getPdfPagesDynamic', () => {
  kase('pdf', () => analyzer.getPdfPagesDynamic(ready('pdf').media))
  kase('pdf without dimensions', () => analyzer.getPdfPagesDynamic(ready('pdf').media.copy({ pages: ready('pdf').media.pages.map((p) => p.copy({ dimension: null })) })))
  kase('pdf synthetic dimensions', () =>
    analyzer.getPdfPagesDynamic(
      new Media({
        status: Media.Status.READY,
        mediaType: 'application/pdf',
        pages: [
          new BookPage({ fileName: '1', mediaType: '', dimension: new Dimension({ width: 595, height: 842 }) }),
          new BookPage({ fileName: '2', mediaType: '', dimension: new Dimension({ width: 0, height: 0 }) }),
          new BookPage({ fileName: '3', mediaType: '', dimension: new Dimension({ width: 10000, height: 5 }) }),
        ],
      }),
    ),
  )
  kase('zip', () => analyzer.getPdfPagesDynamic(ready('cbz').media))
})
