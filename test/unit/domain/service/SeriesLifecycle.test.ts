// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/SeriesLifecycleOracleTest.kt
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { Library } from '../../../../src/domain/model/Library.js'
import { MarkSelectedPreference } from '../../../../src/domain/model/MarkSelectedPreference.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { ThumbnailSeries } from '../../../../src/domain/model/ThumbnailSeries.js'
import { URL } from '../../../../src/port/java-net.js'
import { nn } from '../../../../src/port/kotlin.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, book, date, library, scrub, series } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/SeriesLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = graph.seriesLifecycle

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'lib')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const user = new KomgaUser({ email: 'u@example.org', password: 'p', id: 'U1', createdDate: date })
const url = (rel: string) => new URL(`file:${dir()}/${rel}`)
const books = (seriesId: string) => db.bookDao.findAllBySeriesId(seriesId).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
const byKey = <T>(key: (t: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)
const s = (id: string) => nn(db.seriesDao.findByIdOrNull(id))
const sc = (v: unknown) => scrub(v, dir())
const names = (events: unknown[]) => events.map((it) => (it as object).constructor.name)

const state = (seriesId: string) =>
  attempt(dir(), () => {
    const bs = books(seriesId)
    return [
      db.seriesDao.findByIdOrNull(seriesId),
      bs.map((it) => [it.id, it.name, it.number, it.deletedDate]),
      [...db.bookMetadataDao.findAllByIds(bs.map((it) => it.id))]
        .sort(byKey((it) => it.bookId))
        .map((it) => [it.bookId, it.title, it.number, it.numberSort, it.numberLock, it.numberSortLock]),
      graph.takeTasks(),
      graph.takeEvents(),
    ]
  })

const sThumb = (
  id: string,
  seriesId: string,
  type = ThumbnailSeries.Type.USER_UPLOADED,
  selected = false,
  bytes: Uint8Array | null = oracleBytes(4),
  u: URL | null = null,
) =>
  new ThumbnailSeries({
    thumbnail: bytes,
    url: u,
    selected,
    type,
    mediaType: 'image/jpeg',
    fileSize: 4,
    dimension: new Dimension({ width: 1, height: 1 }),
    id,
    seriesId,
    createdDate: date,
  })

const thumbs = () => attempt(dir(), () => [db.rawQuery('select ID, SERIES_ID, TYPE, SELECTED, URL from THUMBNAIL_SERIES order by ID'), graph.takeEvents()])

func('createSeries', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1', url('')))
    db.libraryDao.insert(library('L2'))
    db.komgaUserDao.insert(user)
    return true
  })
  kase('new series', () =>
    sc([lifecycle.createSeries(series('S1', 'L1', url('s1'))), db.seriesMetadataDao.findById('S1'), db.bookMetadataAggregationDao.findById('S1'), graph.takeEvents()]),
  )
  kase('second series', () => sc([lifecycle.createSeries(series('S2', 'L1', url('s2'))), graph.takeEvents()]))
  kase('oneshot series with long name', () => sc(lifecycle.createSeries(series('S3', 'L1', url('s3')).copy({ name: '  Ünïcode — 漫画  ', oneshot: true }))))
  kase('duplicate id', () => exceptionType(() => lifecycle.createSeries(series('S1', 'L1'))))
  kase('unknown library', () => exceptionType(() => lifecycle.createSeries(series('S9', 'L9'))))
  kase('after errors', () => sc([db.seriesDao.findAll().map((it) => it.id), graph.takeEvents()]))
})
func('addBooks', () => {
  kase('other library', () => lifecycle.addBooks(s('S1'), [book('B0', 'S1', 'L2')]))
  kase('no book', () => {
    lifecycle.addBooks(s('S1'), [])
    return state('S1')
  })
  kase('books get series id, media and metadata', async () => {
    lifecycle.addBooks(s('S1'), [
      book('B1', 'SX', 'L1', 'Book 10', url('s1/b1.cbz')),
      book('B2', '', 'L1', 'book 2', url('s1/b2.cbz'), 7),
      book('B3', 'S1', 'L1', 'Book 1', url('s1/b3.cbz')),
      book('B4', 'S1', 'L1', '  Böök   3 ', url('s1/b4.cbz')),
      book('B5', 'S1', 'L1', 'book 2.5', url('s1/b5.cbz')),
      book('B6', 'S1', 'L1', 'Book\t02', url('s1/b6.cbz')),
    ])
    return [await state('S1'), sc(db.mediaDao.findById('B2'))]
  })
  kase('duplicate book', () => exceptionType(() => lifecycle.addBooks(s('S1'), [book('B1', 'S1', 'L1')])))
})
func('sortBooks', () => {
  kase('natural sort', () => {
    lifecycle.sortBooks(s('S1'))
    return state('S1')
  })
  kase('sorted again, nothing changes', () => {
    lifecycle.sortBooks(s('S1'))
    return state('S1')
  })
  kase('locked metadata', () => {
    const ms = new Map([...db.bookMetadataDao.findAllByIds(['B1', 'B2', 'B3'])].map((it) => [it.bookId, it]))
    db.bookMetadataDao.update([
      nn(ms.get('B1')).copy({ number: 'x', numberLock: true }),
      nn(ms.get('B2')).copy({ numberSort: 99, numberSortLock: true }),
      nn(ms.get('B3')).copy({ number: 'y', numberSort: 42, numberLock: true, numberSortLock: true }),
    ])
    db.bookDao.update(nn(db.bookDao.findByIdOrNull('B5')).copy({ name: 'Book 0' }))
    lifecycle.sortBooks(s('S1'))
    return state('S1')
  })
  kase('empty series', () => {
    lifecycle.sortBooks(s('S2'))
    return state('S2')
  })
  kase('unknown series', () => {
    lifecycle.sortBooks(series('S9', 'L1'))
    return state('S9')
  })
})
func('markReadProgressCompleted', () => {
  kase('setup media and progress', () => {
    ;['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].forEach((id, i) => {
      db.mediaDao.update(
        new Media({
          status: Media.Status.READY,
          mediaType: 'application/zip',
          pages: Array.from({ length: i + 1 }, (_, it) => new BookPage({ fileName: `p${it}.jpg`, mediaType: 'image/jpeg' })),
          bookId: id,
          createdDate: date,
        }),
      )
    })
    db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 1, completed: true, readDate: date, createdDate: date }))
    db.readProgressDao.save(new ReadProgress({ bookId: 'B2', userId: 'U1', page: 1, completed: false, readDate: date, createdDate: date }))
    return [...db.readProgressDao.findAll()].length
  })
  kase('marks unread and in progress books', () => {
    lifecycle.markReadProgressCompleted('S1', user)
    return sc([
      [...db.readProgressDao.findAllByUserId('U1')].sort(byKey((it) => it.bookId)).map((it) => [it.bookId, it.page, it.completed, it.readDate.equals(date)]),
      names(graph.takeEvents()),
    ])
  })
  kase('again', () => {
    lifecycle.markReadProgressCompleted('S1', user)
    return sc(graph.takeEvents())
  })
  kase('empty series', () => {
    lifecycle.markReadProgressCompleted('S2', user)
    return sc(graph.takeEvents())
  })
  kase('unknown series', () => {
    lifecycle.markReadProgressCompleted('S9', user)
    return sc(graph.takeEvents())
  })
})
func('deleteReadProgress', () => {
  kase('series with progress', () => {
    db.komgaUserDao.insert(new KomgaUser({ email: 'u2@example.org', password: 'p', id: 'U2', createdDate: date }))
    db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: 'U2', page: 1, completed: true, readDate: date, createdDate: date }))
    lifecycle.deleteReadProgress('S1', user)
    return sc([[...db.readProgressDao.findAll()].map((it) => [it.bookId, it.userId]), names(graph.takeEvents())])
  })
  kase('again', () => {
    lifecycle.deleteReadProgress('S1', user)
    return sc(graph.takeEvents())
  })
  kase('unknown series', () => {
    lifecycle.deleteReadProgress('S9', user)
    return sc(graph.takeEvents())
  })
})
func('addThumbnailForSeries', () => {
  kase('uploaded, IF_NONE_OR_GENERATED, none yet', () => attempt(dir(), () => lifecycle.addThumbnailForSeries(sThumb('T1', 'S1'), MarkSelectedPreference.IF_NONE_OR_GENERATED)))
  kase('state 1', () => thumbs())
  kase('uploaded, IF_NONE_OR_GENERATED, one selected', () => attempt(dir(), () => lifecycle.addThumbnailForSeries(sThumb('T2', 'S1'), MarkSelectedPreference.IF_NONE_OR_GENERATED)))
  kase('state 2', () => thumbs())
  kase('uploaded, YES', () => attempt(dir(), () => lifecycle.addThumbnailForSeries(sThumb('T3', 'S1'), MarkSelectedPreference.YES)))
  kase('uploaded, NO', () => attempt(dir(), () => lifecycle.addThumbnailForSeries(sThumb('T4', 'S1', undefined, true), MarkSelectedPreference.NO)))
  kase('state 3', () => thumbs())
  kase('sidecar with url', () => {
    mkdirSync(join(dir(), 's1'), { recursive: true })
    writeFileSync(join(dir(), 's1', 'cover.jpg'), oracleBytes(16))
    return attempt(dir(), () => lifecycle.addThumbnailForSeries(sThumb('T5', 'S1', ThumbnailSeries.Type.SIDECAR, false, null, url('s1/cover.jpg')), MarkSelectedPreference.NO))
  })
  kase('sidecar with same url replaces', () =>
    attempt(dir(), () => lifecycle.addThumbnailForSeries(sThumb('T6', 'S1', ThumbnailSeries.Type.SIDECAR, false, null, url('s1/cover.jpg')), MarkSelectedPreference.YES)),
  )
  kase('state 4', () => thumbs())
  kase('unknown series', () => exceptionType(() => lifecycle.addThumbnailForSeries(sThumb('T7', 'S9'), MarkSelectedPreference.YES)))
})
func('getThumbnailBytesByThumbnailId', () => {
  kase('bytes', () => lifecycle.getThumbnailBytesByThumbnailId('T1'))
  kase('url', () => lifecycle.getThumbnailBytesByThumbnailId('T6'))
  kase('unknown', () => lifecycle.getThumbnailBytesByThumbnailId('T9'))
})
func('getBytesFromThumbnailSeries', () => {
  kase('url file missing', () => {
    db.thumbnailSeriesDao.insert(sThumb('T8', 'S2', ThumbnailSeries.Type.SIDECAR, false, null, url('s2/missing.jpg')))
    return attempt(dir(), () => lifecycle.getThumbnailBytesByThumbnailId('T8'))
  })
  kase('no bytes nor url', () => {
    db.thumbnailSeriesDao.insert(sThumb('T9', 'S2', undefined, false, null))
    return lifecycle.getThumbnailBytesByThumbnailId('T9')
  })
})
func('getSelectedThumbnail', () => {
  kase('selected sidecar exists', () => attempt(dir(), () => lifecycle.getSelectedThumbnail('S1')))
  kase('selected sidecar deleted', () => {
    rmSync(join(dir(), 's1', 'cover.jpg'))
    return attempt(dir(), () => [lifecycle.getSelectedThumbnail('S1'), db.rawQuery("select ID, SELECTED from THUMBNAIL_SERIES where SERIES_ID = 'S1' order by ID")])
  })
  kase('nothing selected, missing sidecar removed', () =>
    attempt(dir(), () => [lifecycle.getSelectedThumbnail('S2'), db.rawQuery("select ID, SELECTED from THUMBNAIL_SERIES where SERIES_ID = 'S2' order by ID")]),
  )
  kase('unknown series', () => lifecycle.getSelectedThumbnail('S9'))
})
func('thumbnailsHouseKeeping', () => {
  kase('several selected', () => {
    db.thumbnailSeriesDao.insert(sThumb('TA', 'S3', undefined, true))
    db.thumbnailSeriesDao.insert(sThumb('TB', 'S3', undefined, true))
    db.thumbnailSeriesDao.insert(sThumb('TC', 'S3', ThumbnailSeries.Type.SIDECAR, true, null, url('s3/missing.jpg')))
    db.thumbnailSeriesDao.markSelected(sThumb('TC', 'S3'))
    return attempt(dir(), () => [lifecycle.getSelectedThumbnail('S3'), db.rawQuery("select ID, SELECTED from THUMBNAIL_SERIES where SERIES_ID = 'S3' order by ID")])
  })
})
func('getThumbnailBytes', () => {
  kase('selected series thumbnail', () => lifecycle.getThumbnailBytes('S3', 'U1'))
  kase('unknown series', () => lifecycle.getThumbnailBytes('S9', 'U1'))
  kase('series without thumbnail nor book', () => lifecycle.getThumbnailBytes('S2', 'U1'))
  for (const cover of Library.SeriesCover.entries()) {
    kase(`book cover ${cover}`, async () => {
      if (cover === Library.SeriesCover.entries()[0]) {
        db.thumbnailSeriesDao.deleteBySeriesId('S1')
        books('S1').forEach((b, i) => {
          db.thumbnailBookDao.insert(
            new ThumbnailBook({
              thumbnail: oracleBytes(i + 1),
              url: null,
              selected: true,
              type: ThumbnailBook.Type.GENERATED,
              mediaType: 'image/jpeg',
              fileSize: i + 1,
              dimension: new Dimension({ width: 1, height: 1 }),
              id: `TB${b.id}`,
              bookId: b.id,
              createdDate: date,
            }),
          )
        })
        db.readProgressDao.save(new ReadProgress({ bookId: 'B3', userId: 'U1', page: 1, completed: true, readDate: date, createdDate: date }))
        db.readProgressDao.save(new ReadProgress({ bookId: 'B5', userId: 'U1', page: 1, completed: true, readDate: date, createdDate: date }))
      }
      db.libraryDao.update(db.libraryDao.findById('L1').copy({ seriesCover: cover }))
      return [await lifecycle.getThumbnailBytes('S1', 'U1'), await lifecycle.getThumbnailBytes('S1', 'U2')]
    })
  }
  kase('all read, first unread or last', () => {
    for (const it of books('S1')) db.readProgressDao.save(new ReadProgress({ bookId: it.id, userId: 'U1', page: 1, completed: true, readDate: date, createdDate: date }))
    db.libraryDao.update(db.libraryDao.findById('L1').copy({ seriesCover: Library.SeriesCover.FIRST_UNREAD_OR_LAST }))
    return lifecycle.getThumbnailBytes('S1', 'U1')
  })
  kase('all read, first unread or first', () => {
    db.libraryDao.update(db.libraryDao.findById('L1').copy({ seriesCover: Library.SeriesCover.FIRST_UNREAD_OR_FIRST }))
    return lifecycle.getThumbnailBytes('S1', 'U1')
  })
})
func('deleteThumbnailForSeries', () => {
  kase('sidecar refused', () => attempt(dir(), () => lifecycle.deleteThumbnailForSeries(sThumb('TC', 'S3', ThumbnailSeries.Type.SIDECAR))))
  kase('uploaded', () => {
    lifecycle.deleteThumbnailForSeries(sThumb('TA', 'S3'))
    return thumbs()
  })
  kase('unknown uploaded', () => {
    lifecycle.deleteThumbnailForSeries(sThumb('TZ', 'S3'))
    return thumbs()
  })
})
func('softDeleteMany', () => {
  kase('two series', () => {
    lifecycle.softDeleteMany([s('S2'), s('S3')])
    return sc([db.seriesDao.findAll().sort(byKey((it) => it.id)).map((it) => [it.id, it.deletedDate]), graph.takeEvents()])
  })
  kase('empty', () => {
    lifecycle.softDeleteMany([])
    return sc(graph.takeEvents())
  })
})
func('deleteSeriesFiles', () => {
  kase('folder does not exist', () => {
    lifecycle.deleteSeriesFiles(s('S2'))
    return sc([s('S2').deletedDate, graph.takeEvents()])
  })
  kase('folder with books and sidecar', () => {
    const s1 = join(dir(), 's1')
    mkdirSync(s1, { recursive: true })
    for (const it of ['b1.cbz', 'b2.cbz', 'b3.cbz', 'b4.cbz', 'b5.cbz', 'b6.cbz', 'cover.jpg']) writeFileSync(join(s1, it), oracleBytes(3))
    db.thumbnailSeriesDao.insert(sThumb('TS1', 'S1', ThumbnailSeries.Type.SIDECAR, false, null, url('s1/cover.jpg')))
    return attempt(dir(), () => {
      lifecycle.deleteSeriesFiles(s('S1'))
      return [
        existsSync(s1),
        books('S1').map((it) => [it.id, it.deletedDate]),
        db.rawQuery('select TYPE, BOOK_ID, SERIES_ID from HISTORICAL_EVENT order by TYPE, BOOK_ID'),
        s('S1').deletedDate,
        names(graph.takeEvents()),
      ]
    })
  })
  kase('folder with other files is kept', () => {
    const s4 = join(dir(), 's4')
    mkdirSync(s4, { recursive: true })
    writeFileSync(join(s4, 'notes.txt'), oracleBytes(3))
    lifecycle.createSeries(series('S4', 'L1', url('s4')))
    return attempt(dir(), () => {
      lifecycle.deleteSeriesFiles(s('S4'))
      return [existsSync(s4), s('S4').deletedDate, names(graph.takeEvents())]
    })
  })
  kase('empty folder', () => {
    const s5 = join(dir(), 's5')
    mkdirSync(s5, { recursive: true })
    lifecycle.createSeries(series('S5', 'L1', url('s5')))
    return attempt(dir(), () => {
      lifecycle.deleteSeriesFiles(s('S5'))
      return [existsSync(s5), db.rawQuery("select TYPE, SERIES_ID from HISTORICAL_EVENT where SERIES_ID = 'S5'"), names(graph.takeEvents())]
    })
  })
})
func('deleteMany', () => {
  kase('series with related data', () => {
    db.readProgressDao.save(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 1, completed: true, readDate: date, createdDate: date }))
    db.seriesCollectionDao.insert(new SeriesCollection({ name: 'col', seriesIds: ['S1', 'S2'], id: 'C1', createdDate: date }))
    db.thumbnailSeriesDao.insert(sThumb('TD', 'S1'))
    lifecycle.deleteMany([s('S1'), s('S3')])
    return sc([
      db.seriesDao.findAll().map((it) => it.id).sort(),
      db.bookDao.findAll().map((it) => it.id),
      db.rawQuery('select count(*) from READ_PROGRESS'),
      db.rawQuery('select SERIES_ID from COLLECTION_SERIES'),
      db.rawQuery('select ID from THUMBNAIL_SERIES order by ID'),
      db.rawQuery('select SERIES_ID from SERIES_METADATA order by SERIES_ID'),
      db.rawQuery('select SERIES_ID from BOOK_METADATA_AGGREGATION order by SERIES_ID'),
      db.rawQuery('select count(*) from MEDIA'),
      names(graph.takeEvents()),
    ])
  })
  kase('empty', () => {
    lifecycle.deleteMany([])
    return sc(graph.takeEvents())
  })
})
