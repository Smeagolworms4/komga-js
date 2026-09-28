// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/ContentRestrictionCheckerOracleTest.kt
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import type { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { ThumbnailSeries } from '../../../../src/domain/model/ThumbnailSeries.js'
import { ContentRestrictionChecker } from '../../../../src/interfaces/api/ContentRestrictionChecker.js'
import { URL } from '../../../../src/port/java-net.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { admin, limited, restricted, setup } from '../data.js'

const { func, kase } = oracle('interfaces/api/ContentRestrictionChecker')

const db = new OracleDb()
const checker = new ContentRestrictionChecker(db.seriesMetadataDao, db.bookDao, db.thumbnailBookDao, db.seriesDao, db.thumbnailSeriesDao)
const users = [admin, limited, restricted]

const each = (ids: string[], check: (u: KomgaUser, id: string) => void) =>
  users.map((u) =>
    ids.map((id) => {
      try {
        check(u, id)
        return 'ok'
      } catch (e) {
        // PORT: message absent (null) côté Kotlin = message vide côté TS
        return (e as Error).message || null
      }
    }),
  )

const books = ['B1', 'B4', 'B6', 'BX']
const series = ['S1', 'S2', 'S3', 'SX']
const thumb = { url: new URL('file:/t.jpg'), mediaType: 'image/jpeg', fileSize: 1, dimension: new Dimension({ width: 1, height: 1 }) }

func('checkContentRestrictionBook@30', () => {
  kase('setup', () => {
    setup(db)
    db.thumbnailBookDao.insert(new ThumbnailBook({ ...thumb, type: ThumbnailBook.Type.SIDECAR, id: 'TB1', bookId: 'B1' }))
    db.thumbnailBookDao.insert(new ThumbnailBook({ ...thumb, type: ThumbnailBook.Type.SIDECAR, id: 'TB4', bookId: 'B4' }))
    db.thumbnailSeriesDao.insert(new ThumbnailSeries({ ...thumb, type: ThumbnailSeries.Type.SIDECAR, id: 'TS1', seriesId: 'S1' }))
    db.thumbnailSeriesDao.insert(new ThumbnailSeries({ ...thumb, type: ThumbnailSeries.Type.SIDECAR, id: 'TS2', seriesId: 'S2' }))
  })
  kase('book dto', () => each(books.slice(0, -1), (u, id) => checker.checkContentRestrictionBook(u, db.bookDtoDao.findByIdOrNull(id, u.id)!)))
})

func('checkContentRestrictionBook@47', () => {
  kase('book', () => each(books.slice(0, -1), (u, id) => checker.checkContentRestrictionBook(u, db.bookDao.findByIdOrNull(id)!)))
})

func('checkContentRestrictionBook@64', () => {
  kase('book id', () => each(books, (u, id) => checker.checkContentRestrictionBook(u, id)))
})

func('checkContentRestrictionBookThumbnail', () => {
  kase('thumbnail id', () => each(['TB1', 'TB4', 'TX'], (u, id) => checker.checkContentRestrictionBookThumbnail(u, id)))
})

func('checkContentRestrictionSeries@108', () => {
  kase('series dto', () => each(series.slice(0, -1), (u, id) => checker.checkContentRestrictionSeries(u, db.seriesDtoDao.findByIdOrNull(id, u.id)!)))
})

func('checkContentRestrictionSeries@121', () => {
  kase('series id', () => each(series, (u, id) => checker.checkContentRestrictionSeries(u, id)))
})

func('checkContentRestrictionSeriesThumbnail', () => {
  kase('thumbnail id', () => each(['TS1', 'TS2', 'TX'], (u, id) => checker.checkContentRestrictionSeriesThumbnail(u, id)))
})
