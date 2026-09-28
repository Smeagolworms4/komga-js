// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/BookLifecycleOracleTest.kt
import { ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Book } from '../../../../src/domain/model/Book.js'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { MarkSelectedPreference } from '../../../../src/domain/model/MarkSelectedPreference.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { MediaExtensionEpub } from '../../../../src/domain/model/MediaExtension.js'
import { R2Device } from '../../../../src/domain/model/R2Device.js'
import { R2Locator } from '../../../../src/domain/model/R2Locator.js'
import { R2Progression } from '../../../../src/domain/model/R2Progression.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import type { TypedBytes } from '../../../../src/domain/model/TypedBytes.js'
import { ImageType } from '../../../../src/infrastructure/image/ImageType.js'
import { sortedMapOf } from '../../../../src/port/extra-metadata.js'
import { URL } from '../../../../src/port/java-net.js'
import { nn } from '../../../../src/port/kotlin.js'
import { OracleDb } from '../../db.js'
import { digest, fixture, komgaRes } from '../../infrastructure/mediacontainer/samples.js'
import { t } from '../../infrastructure/mediacontainer/oracleZip.js'
import { exceptionType, oracle, oracleBytes, stable, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, book, date, library, metadata, resource, series, zipFile } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/BookLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = graph.bookLifecycle

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
const user = new KomgaUser({ email: 'u@example.org', password: 'p', id: 'U1', createdDate: date })

const url = (rel: string) => new URL(`file:${dir()}/${rel}`)
const copy = (from: string, name: string) => {
  const to = join(dir(), name)
  copyFileSync(from, to)
  return new URL(`file:${to}`)
}
const b = (id: string) => nn(db.bookDao.findByIdOrNull(id))
const byKey = <T>(key: (t: T) => string) => (x: T, y: T) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0)

function addBook(id: string, u: URL, libraryId = 'L1', seriesId = 'S1'): Book {
  const bk = book(id, seriesId, libraryId, undefined, u)
  db.bookDao.insert(bk)
  db.mediaDao.insert(new Media({ bookId: id, createdDate: date }))
  db.bookMetadataDao.insert(metadata(bk))
  return bk
}

function media(id: string) {
  const m = db.mediaDao.findById(id)
  const ext = db.mediaDao.findExtensionByIdOrNull(id)
  return [
    m.status,
    m.mediaType,
    m.pageCount,
    m.pages,
    m.files,
    m.comment,
    m.epubDivinaCompatible,
    m.epubIsKepub,
    ext instanceof MediaExtensionEpub ? [ext.isFixedLayout, ext.positions.length, ext.toc.length] : null,
  ]
}

const typed = (x: TypedBytes | null) => (x !== null ? [digest(x.bytes), x.mediaType] : null)
const image = async (x: TypedBytes | null) => (x !== null ? [await graph.describeImage(x.bytes), x.mediaType] : null)

const thumbs = (bookId: string) =>
  [...db.thumbnailBookDao.findAllByBookId(bookId)]
    .sort(byKey((it) => it.id))
    .map((it) => [it.id, it.type, it.selected, it.mediaType, it.dimension, it.url, it.type === ThumbnailBook.Type.GENERATED ? null : it.thumbnail])

const events = () => graph.takeEvents().map((it) => (it as object).constructor.name)

const bThumb = (
  id: string,
  bookId: string,
  type = ThumbnailBook.Type.USER_UPLOADED,
  selected = false,
  bytes: Uint8Array | null = oracleBytes(4),
  u: URL | null = null,
  dimension = new Dimension({ width: 1, height: 1 }),
) => new ThumbnailBook({ thumbnail: bytes, url: u, selected, type, mediaType: 'image/jpeg', fileSize: 4, dimension, id, bookId, createdDate: date })

const utc = (y: number, m: number, d: number, h = 0) => ZonedDateTime.of(y, m, d, h, 0, 0, 0, ZoneOffset.UTC)

const progression = (href: string, position: number | null = null, prog: number | null = null, modified = utc(2021, 1, 1, 10), koboSpan: string | null = null) =>
  new R2Progression({
    modified,
    device: new R2Device({ id: 'dev', name: 'Device' }),
    locator: new R2Locator({ href, type: 'application/xhtml+xml', locations: new R2Locator.Location({ progression: prog, position }), koboSpan }),
  })

const progress = (bookId: string) => {
  const it = db.readProgressDao.findByBookIdAndUserIdOrNull(bookId, 'U1')
  return stable(it !== null ? [it.page, it.completed, it.readDate, it.deviceId, it.deviceName, it.locator] : null)
}

func('analyzeAndPersist', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1', url('')))
    db.libraryDao.insert(library('L2').copy({ hashFiles: false, analyzeDimensions: false }))
    db.seriesDao.insert(series('S1', 'L1', url('')))
    db.seriesDao.insert(series('S2', 'L2'))
    db.komgaUserDao.insert(user)
    addBook('B1', zipFile(dir(), 'b1.cbz', [['p1.png', png], ['p2.jpg', jpg], t('info.txt', 'hello'), ['dir/', null]]))
    addBook('B2', copy(fixture('epub/divina.epub'), 'divina.epub'))
    addBook('B3', copy(fixture('epub/reflow.epub'), 'reflow.epub'))
    addBook('B4', copy(komgaRes('pdf/komga.pdf'), 'komga.pdf'))
    addBook('B5', url('missing.cbz'))
    writeFileSync(join(dir(), 'garbage.cbz'), oracleBytes(100))
    addBook('B6', url('garbage.cbz'))
    addBook('B7', zipFile(dir(), 'b7.cbz', [t('a.txt', 'a')]))
    addBook('B8', zipFile(dir(), 'b8.cbz', [['p1.png', png]]), 'L2', 'S2')
    return db.bookDao.count()
  })
  for (const id of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']) {
    kase(`book ${id}`, () => attempt(dir(), () => [lifecycle.analyzeAndPersist(b(id)), media(id), events()]))
  }
  kase('outdated with other page count adjusts progress', () => {
    db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 5, completed: false, readDate: date, createdDate: date }))
    db.komgaUserDao.insert(new KomgaUser({ email: 'u2@example.org', password: 'p', id: 'U2', createdDate: date }))
    db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: 'U2', page: 5, completed: true, readDate: date, createdDate: date }))
    db.mediaDao.update(db.mediaDao.findById('B1').copy({ status: Media.Status.OUTDATED, pageCount: 5 }))
    return attempt(dir(), () => [
      lifecycle.analyzeAndPersist(b('B1')),
      [...db.readProgressDao.findAllByBookId('B1')].sort(byKey((it) => it.userId)).map((it) => [it.userId, it.page, it.completed]),
    ])
  })
  kase('outdated with same page count keeps progress', () => {
    db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 2, completed: false, readDate: date, createdDate: date }))
    db.mediaDao.update(db.mediaDao.findById('B1').copy({ status: Media.Status.OUTDATED }))
    return attempt(dir(), () => [
      lifecycle.analyzeAndPersist(b('B1')),
      [...db.readProgressDao.findAllByBookId('B1')].sort(byKey((it) => it.userId)).map((it) => [it.userId, it.page, it.completed]),
    ])
  })
  kase('unknown library', () => exceptionType(() => lifecycle.analyzeAndPersist(b('B1').copy({ libraryId: 'L9' }))))
})
func('hashAndPersist', () => {
  kase('hashing enabled', () => {
    lifecycle.hashAndPersist(b('B1'))
    return b('B1').fileHash
  })
  kase('already hashed', () => {
    db.bookDao.update(b('B2').copy({ fileHash: 'existing' }))
    lifecycle.hashAndPersist(b('B2'))
    return b('B2').fileHash
  })
  kase('hashing disabled', () => {
    lifecycle.hashAndPersist(b('B8'))
    return b('B8').fileHash
  })
  kase('missing file', () => attempt(dir(), () => lifecycle.hashAndPersist(b('B5'))))
})
func('hashKoreaderAndPersist', () => {
  kase('hashing disabled', () => {
    lifecycle.hashKoreaderAndPersist(b('B1'))
    return b('B1').fileHashKoreader
  })
  kase('hashing enabled', () => {
    db.libraryDao.update(db.libraryDao.findById('L1').copy({ hashKoreader: true }))
    return ['B1', 'B4'].map((it) => {
      lifecycle.hashKoreaderAndPersist(b(it))
      return b(it).fileHashKoreader
    })
  })
  kase('already hashed', () => {
    db.bookDao.update(b('B2').copy({ fileHashKoreader: 'existing' }))
    lifecycle.hashKoreaderAndPersist(b('B2'))
    return b('B2').fileHashKoreader
  })
  kase('missing file', () => attempt(dir(), () => lifecycle.hashKoreaderAndPersist(b('B5'))))
})
func('hashPagesAndPersist', () => {
  kase('hashing disabled', async () => {
    await lifecycle.hashPagesAndPersist(b('B1'))
    return media('B1')
  })
  kase('hashing enabled', async () => {
    db.libraryDao.update(db.libraryDao.findById('L1').copy({ hashPages: true }))
    await lifecycle.hashPagesAndPersist(b('B1'))
    return media('B1')
  })
  kase('epub divina', async () => {
    await lifecycle.hashPagesAndPersist(b('B2'))
    return media('B2')
  })
  kase('media not ready', () => attempt(dir(), () => lifecycle.hashPagesAndPersist(b('B5'))))
})
func('generateThumbnailAndPersist', () => {
  for (const id of ['B1', 'B2', 'B3', 'B4', 'B5', 'B7']) {
    kase(`book ${id}`, () =>
      attempt(dir(), async () => {
        await lifecycle.generateThumbnailAndPersist(b(id))
        return [thumbs(id), events()]
      }),
    )
  }
  kase('again replaces the generated one', async () => {
    const before = [...db.thumbnailBookDao.findAllByBookId('B1')].map((it) => it.id)
    await lifecycle.generateThumbnailAndPersist(b('B1'))
    const after = [...db.thumbnailBookDao.findAllByBookId('B1')]
    if (after.length !== 1) throw new Error(`single: ${after.length}`)
    return [after.length, after.every((it) => !before.includes(it.id)), nn(after[0]).selected]
  })
})
func('addThumbnailForBook', () => {
  kase('uploaded, IF_NONE_OR_GENERATED, generated selected', () =>
    attempt(dir(), () => [lifecycle.addThumbnailForBook(bThumb('T1', 'B1'), MarkSelectedPreference.IF_NONE_OR_GENERATED), thumbs('B1'), events()]),
  )
  kase('uploaded, IF_NONE_OR_GENERATED, uploaded selected', () =>
    attempt(dir(), () => [lifecycle.addThumbnailForBook(bThumb('T2', 'B1'), MarkSelectedPreference.IF_NONE_OR_GENERATED), thumbs('B1'), events()]),
  )
  kase('uploaded, NO', () => attempt(dir(), () => [lifecycle.addThumbnailForBook(bThumb('T3', 'B1', undefined, true), MarkSelectedPreference.NO), thumbs('B1')]))
  kase('uploaded, YES', () => attempt(dir(), () => [lifecycle.addThumbnailForBook(bThumb('T4', 'B1'), MarkSelectedPreference.YES), thumbs('B1')]))
  kase('sidecar', () => {
    writeFileSync(join(dir(), 'b1-cover.jpg'), oracleBytes(12))
    return attempt(dir(), () => [
      lifecycle.addThumbnailForBook(bThumb('T5', 'B1', ThumbnailBook.Type.SIDECAR, false, null, url('b1-cover.jpg')), MarkSelectedPreference.NO),
      thumbs('B1'),
    ])
  })
  kase('sidecar same url replaces', () =>
    attempt(dir(), () => [
      lifecycle.addThumbnailForBook(bThumb('T6', 'B1', ThumbnailBook.Type.SIDECAR, false, null, url('b1-cover.jpg')), MarkSelectedPreference.YES),
      thumbs('B1'),
    ]),
  )
  kase('generated replaces generated, not selected', () =>
    attempt(dir(), () => [lifecycle.addThumbnailForBook(bThumb('T7', 'B1', ThumbnailBook.Type.GENERATED), MarkSelectedPreference.IF_NONE_OR_GENERATED), thumbs('B1')]),
  )
  kase('generated on book without thumbnail', () =>
    attempt(dir(), () => [
      lifecycle.addThumbnailForBook(
        bThumb('T8', 'B6', ThumbnailBook.Type.GENERATED, false, undefined, null, new Dimension({ width: 100, height: 100 })),
        MarkSelectedPreference.IF_NONE_OR_GENERATED,
      ),
      thumbs('B6'),
    ]),
  )
  kase('unknown book', () => exceptionType(() => lifecycle.addThumbnailForBook(bThumb('T9', 'B9'), MarkSelectedPreference.YES)))
})
func('getThumbnail', () => {
  kase('selected sidecar exists', () => attempt(dir(), () => lifecycle.getThumbnail('B1')))
  kase('selected sidecar deleted', () => {
    rmSync(join(dir(), 'b1-cover.jpg'))
    return attempt(dir(), () => [lifecycle.getThumbnail('B1'), thumbs('B1')])
  })
  kase('no thumbnail', () => lifecycle.getThumbnail('B5'))
})
func('thumbnailsHouseKeeping', () => {
  kase('several selected', () => {
    db.thumbnailBookDao.insert(bThumb('TA', 'B5', undefined, true))
    db.thumbnailBookDao.insert(bThumb('TB', 'B5', undefined, true))
    db.thumbnailBookDao.insert(bThumb('TC', 'B5', ThumbnailBook.Type.SIDECAR, true, null, url('gone.jpg')))
    db.thumbnailBookDao.markSelected(bThumb('TC', 'B5'))
    return attempt(dir(), () => [lifecycle.getThumbnail('B5'), thumbs('B5')])
  })
  kase('none selected', () => {
    db.thumbnailBookDao.insert(bThumb('TD', 'B7'))
    db.thumbnailBookDao.insert(bThumb('TE', 'B7'))
    return attempt(dir(), () => [lifecycle.getThumbnail('B7'), thumbs('B7')])
  })
})
func('getThumbnailBytes', () => {
  kase('uploaded bytes', async () => typed(await lifecycle.getThumbnailBytes('B1')))
  kase('uploaded bytes resized, not an image', async () => typed(await lifecycle.getThumbnailBytes('B1', 100)))
  kase('generated resized', async () => image(await lifecycle.getThumbnailBytes('B2', 50)))
  kase('sidecar url', async () => {
    writeFileSync(join(dir(), 'b3-cover.jpg'), png)
    db.thumbnailBookDao.insert(bThumb('TF', 'B3', ThumbnailBook.Type.SIDECAR, false, null, url('b3-cover.jpg')))
    db.thumbnailBookDao.markSelected(bThumb('TF', 'B3'))
    return typed(await lifecycle.getThumbnailBytes('B3'))
  })
  kase('no thumbnail', () => lifecycle.getThumbnailBytes('B6X'))
  kase('neither bytes nor url', async () => {
    db.thumbnailBookDao.insert(bThumb('TG', 'B8', undefined, true, null))
    return typed(await lifecycle.getThumbnailBytes('B8'))
  })
})
func('getThumbnailBytesOriginal', () => {
  kase('generated gives the poster', () => attempt(dir(), async () => typed(await lifecycle.getThumbnailBytesOriginal('B2'))))
  kase('generated pdf poster', () => attempt(dir(), async () => image(await lifecycle.getThumbnailBytesOriginal('B4'))))
  kase('uploaded', async () => typed(await lifecycle.getThumbnailBytesOriginal('B1')))
  kase('sidecar', async () => typed(await lifecycle.getThumbnailBytesOriginal('B3')))
  kase('no thumbnail', () => lifecycle.getThumbnailBytesOriginal('B9'))
})
func('getThumbnailBytesByThumbnailId', () => {
  kase('uploaded', () => typed(lifecycle.getThumbnailBytesByThumbnailId('T4')))
  kase('sidecar', () => typed(lifecycle.getThumbnailBytesByThumbnailId('TF')))
  kase('unknown', () => lifecycle.getThumbnailBytesByThumbnailId('TZ'))
})
func('getBytesFromThumbnailBook', () => {
  kase('url file missing', () => attempt(dir(), () => lifecycle.getThumbnailBytesByThumbnailId('TC')))
  kase('neither bytes nor url', () => lifecycle.getThumbnailBytesByThumbnailId('TG'))
})
func('deleteThumbnailForBook', () => {
  kase('generated refused', () => attempt(dir(), () => lifecycle.deleteThumbnailForBook(bThumb('T7', 'B1', ThumbnailBook.Type.GENERATED))))
  kase('selected uploaded', () => {
    lifecycle.deleteThumbnailForBook(bThumb('T4', 'B1'))
    return attempt(dir(), () => [thumbs('B1'), events()])
  })
  kase('unknown uploaded', () => {
    lifecycle.deleteThumbnailForBook(bThumb('TZ', 'B1'))
    return attempt(dir(), () => [thumbs('B1'), events()])
  })
})
func('findBookThumbnailsToRegenerate', () => {
  kase('bigger only', () => [...lifecycle.findBookThumbnailsToRegenerate(true)].sort())
  kase('all', () => [...lifecycle.findBookThumbnailsToRegenerate(false)].sort())
})
func('getBookPage', () => {
  kase('png page', () => attempt(dir(), async () => typed(await lifecycle.getBookPage(b('B1'), 1))))
  kase('jpeg page', () => attempt(dir(), async () => typed(await lifecycle.getBookPage(b('B1'), 2))))
  kase('page 0', () => exceptionType(() => lifecycle.getBookPage(b('B1'), 0)))
  kase('page after last', () => exceptionType(() => lifecycle.getBookPage(b('B1'), 3)))
  kase('convert png to jpeg', () => attempt(dir(), async () => image(await lifecycle.getBookPage(b('B1'), 1, { convertTo: ImageType.JPEG }))))
  kase('convert png to png', () => attempt(dir(), async () => typed(await lifecycle.getBookPage(b('B1'), 1, { convertTo: ImageType.PNG }))))
  kase('convert jpeg to png', () => attempt(dir(), async () => image(await lifecycle.getBookPage(b('B1'), 2, { convertTo: ImageType.PNG }))))
  kase('resize', () => attempt(dir(), async () => image(await lifecycle.getBookPage(b('B1'), 2, { resizeTo: 100 }))))
  kase('resize and convert', () => attempt(dir(), async () => image(await lifecycle.getBookPage(b('B1'), 1, { convertTo: ImageType.PNG, resizeTo: 64 }))))
  kase('unsupported read format', () => {
    db.mediaDao.update(
      db.mediaDao
        .findById('B8')
        .copy({ status: Media.Status.READY, pages: [new BookPage({ fileName: 'p1.png', mediaType: 'image/x-unknown' })], mediaType: 'application/zip' }),
    )
    return exceptionType(() => lifecycle.getBookPage(b('B8'), 1, { convertTo: ImageType.JPEG }))
  })
  kase('unsupported read format, no conversion', () => attempt(dir(), async () => typed(await lifecycle.getBookPage(b('B8'), 1))))
  kase('epub divina page', () => attempt(dir(), async () => typed(await lifecycle.getBookPage(b('B2'), 2))))
  kase('epub not divina', () => exceptionType(() => lifecycle.getBookPage(b('B3'), 1)))
  kase('pdf page', () => attempt(dir(), async () => image(await lifecycle.getBookPage(b('B4'), 1))))
  kase('pdf page resized', () => attempt(dir(), async () => image(await lifecycle.getBookPage(b('B4'), 1, { resizeTo: 80 }))))
  kase('media not ready', () => exceptionType(() => lifecycle.getBookPage(b('B5'), 1)))
  kase('missing file', () => {
    db.mediaDao.update(
      db.mediaDao
        .findById('B5')
        .copy({ status: Media.Status.READY, mediaType: 'application/zip', pages: [new BookPage({ fileName: 'p1.png', mediaType: 'image/png' })] }),
    )
    return attempt(dir(), () => lifecycle.getBookPage(b('B5'), 1))
  })
})
func('markReadProgress', () => {
  kase('divina page', () => {
    lifecycle.markReadProgress(b('B1'), user, 1)
    return [progress('B1'), events()]
  })
  kase('last page completes', () => {
    lifecycle.markReadProgress(b('B1'), user, 2)
    return [progress('B1'), events()]
  })
  kase('page 0', () => lifecycle.markReadProgress(b('B1'), user, 0))
  kase('page after last', () => lifecycle.markReadProgress(b('B1'), user, 3))
  kase('epub divina', () => {
    lifecycle.markReadProgress(b('B2'), user, 2)
    return [progress('B2'), events()]
  })
  kase('epub not divina', () => lifecycle.markReadProgress(b('B3'), user, 1))
  kase('epub divina without extension', () => {
    db.mediaDao.update(db.mediaDao.findById('B2').copy({ extension: null }))
    return lifecycle.markReadProgress(b('B2'), user, 1)
  })
  kase('pdf', () => {
    lifecycle.markReadProgress(b('B4'), user, 1)
    return [progress('B4'), events()]
  })
  kase('unknown user', () => exceptionType(() => lifecycle.markReadProgress(b('B1'), user.copy({ id: 'U9' }), 1)))
})
func('markReadProgressCompleted', () => {
  kase('divina', () => {
    lifecycle.markReadProgressCompleted('B1', user)
    return [progress('B1'), events()]
  })
  kase('media with 0 page', () => {
    lifecycle.markReadProgressCompleted('B7', user)
    return [progress('B7'), events()]
  })
  kase('unknown book', () => exceptionType(() => lifecycle.markReadProgressCompleted('B9', user)))
})
func('deleteReadProgress', () => {
  kase('existing', () => {
    lifecycle.deleteReadProgress(b('B1'), user)
    return [progress('B1'), events()]
  })
  kase('none', () => {
    lifecycle.deleteReadProgress(b('B1'), user)
    return events()
  })
})
func('markProgression', () => {
  kase('setup', () => {
    lifecycle.analyzeAndPersist(b('B2'))
    events()
    return (db.mediaDao.findExtensionByIdOrNull('B3') as MediaExtensionEpub).positions.map((it) => [
      it.href,
      it.locations?.position ?? null,
      it.locations?.progression ?? null,
      it.locations?.totalProgression ?? null,
    ])
  })
  kase('divina position', () => {
    lifecycle.markProgression(b('B1'), user, progression('p1.png', 2))
    return [progress('B1'), events()]
  })
  kase('older progression refused', () => lifecycle.markProgression(b('B1'), user, progression('p1.png', 1, null, utc(2019, 1, 1))))
  kase('same date refused', () => lifecycle.markProgression(b('B1'), user, progression('p1.png', 1)))
  kase('divina position out of range', () => lifecycle.markProgression(b('B1'), user, progression('p1.png', 3, null, utc(2021, 2, 1))))
  kase('divina without position', () => lifecycle.markProgression(b('B1'), user, progression('p1.png', null, null, utc(2021, 2, 1))))
  kase('pdf position', () => {
    lifecycle.markProgression(b('B4'), user, progression('', 1, null, ZonedDateTime.of(2021, 2, 1, 0, 0, 0, 0, ZoneOffset.ofHours(5))))
    return [progress('B4'), events()]
  })
  kase('media without profile', () => lifecycle.markProgression(b('B6'), user, progression('', 1)))
  kase('epub unknown resource', () => lifecycle.markProgression(b('B3'), user, progression('nope.xhtml', null, 0)))
  kase('epub without progression', () => lifecycle.markProgression(b('B3'), user, progression('OPS/c1.xhtml')))
  kase('epub exact progression', () => {
    lifecycle.markProgression(b('B3'), user, progression('OPS/c1.xhtml#frag', null, 0, undefined, 'kobo.1.1'))
    return [progress('B3'), events()]
  })
  kase('epub progression between positions', () => {
    lifecycle.markProgression(b('B3'), user, progression('OPS/c1.xhtml', null, 0.6, utc(2021, 3, 1)))
    return progress('B3')
  })
  kase('epub progression after last position', () => lifecycle.markProgression(b('B3'), user, progression('OPS/c1.xhtml', null, 1, utc(2021, 4, 1))))
  kase('epub encoded href', () => {
    lifecycle.markProgression(b('B3'), user, progression('c2%2Exhtml', null, 0, utc(2021, 5, 1)))
    return progress('B3')
  })
  kase('epub fixed layout single position', () => {
    lifecycle.markProgression(b('B2'), user, progression('OEBPS/Text/page2.xhtml', null, 0.5))
    return [progress('B2'), events()]
  })
  kase('epub without extension', () => {
    db.mediaDao.update(db.mediaDao.findById('B3').copy({ extension: null }))
    return lifecycle.markProgression(b('B3'), user, progression('OPS/c1.xhtml', null, 0, utc(2021, 6, 1)))
  })
})
func('deleteOne', () => {
  kase('with related data', () => {
    db.readListDao.insert(new ReadList({ name: 'rl', bookIds: sortedMapOf<number, string>([1, 'B7'], [2, 'B6']), id: 'RL1', createdDate: date }))
    db.readProgressDao.save(new ReadProgress({ bookId: 'B7', userId: 'U1', page: 1, completed: true, readDate: date, createdDate: date }))
    lifecycle.deleteOne(b('B7'))
    return [
      db.bookDao.findByIdOrNull('B7'),
      nn(db.readListDao.findByIdOrNull('RL1', SearchContext.empty())).bookIds,
      db.rawQuery("select count(*) from THUMBNAIL_BOOK where BOOK_ID = 'B7'"),
      db.rawQuery("select count(*) from MEDIA where BOOK_ID = 'B7'"),
      db.rawQuery("select count(*) from BOOK_METADATA where BOOK_ID = 'B7'"),
      db.rawQuery("select count(*) from READ_PROGRESS where BOOK_ID = 'B7'"),
      events(),
    ]
  })
  kase('unknown book', () => {
    lifecycle.deleteOne(book('B9', 'S1', 'L1'))
    return events()
  })
})
func('softDeleteMany', () => {
  kase('two books', () => {
    lifecycle.softDeleteMany([b('B6'), b('B8')])
    return stable([db.bookDao.findAll().sort(byKey((it) => it.id)).map((it) => [it.id, it.deletedDate]), events()])
  })
  kase('empty', () => {
    lifecycle.softDeleteMany([])
    return events()
  })
})
func('deleteMany', () => {
  kase('two books', () => {
    lifecycle.deleteMany([b('B6'), b('B8')])
    return [db.bookDao.findAll().map((it) => it.id).sort(), db.readListDao.findByIdOrNull('RL1', SearchContext.empty())?.bookIds ?? null, events()]
  })
  kase('empty', () => {
    lifecycle.deleteMany([])
    return events()
  })
})
func('deleteBookFiles', () => {
  kase('missing file', () => {
    lifecycle.deleteBookFiles(b('B5'))
    return [b('B5').deletedDate, events()]
  })
  kase('file with sidecar, folder kept', () => {
    writeFileSync(join(dir(), 'b1-side.jpg'), oracleBytes(5))
    db.thumbnailBookDao.insert(bThumb('TS', 'B1', ThumbnailBook.Type.SIDECAR, false, null, url('b1-side.jpg')))
    return attempt(dir(), () => {
      lifecycle.deleteBookFiles(b('B1'))
      return [
        existsSync(join(dir(), 'b1.cbz')),
        existsSync(join(dir(), 'b1-side.jpg')),
        b('B1').deletedDate !== null,
        db.rawQuery('select TYPE, BOOK_ID, SERIES_ID from HISTORICAL_EVENT order by TYPE'),
        events(),
      ]
    })
  })
  kase('last file removes folder', () => {
    const sub = join(dir(), 'sub')
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(sub, 'x.cbz'), oracleBytes(5))
    addBook('BX', url('sub/x.cbz'))
    return attempt(dir(), () => {
      lifecycle.deleteBookFiles(b('BX'))
      return [existsSync(sub), db.rawQuery('select TYPE, BOOK_ID, SERIES_ID from HISTORICAL_EVENT order by TYPE, BOOK_ID'), events()]
    })
  })
})
