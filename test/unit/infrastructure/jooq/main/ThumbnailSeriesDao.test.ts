// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ThumbnailSeriesDaoOracleTest.kt
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { ThumbnailSeries } from '../../../../../src/domain/model/ThumbnailSeries.js'
import { URL } from '../../../../../src/port/java-net.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, oracleBytes, stable } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ThumbnailSeriesDao')

const db = new OracleDb()
const dao = db.thumbnailSeriesDao

const th = (id: string, owner = 'S1', selected = false, size = 10, type: ThumbnailSeries.Type = ThumbnailSeries.Type.USER_UPLOADED) =>
  new ThumbnailSeries({
    thumbnail: type === ThumbnailSeries.Type.SIDECAR ? null : oracleBytes(size),
    url: type === ThumbnailSeries.Type.SIDECAR ? new URL(`file:/lib1/Batman/cover%20${id}.jpg`) : null,
    selected,
    type,
    mediaType: 'image/jpeg',
    fileSize: size,
    dimension: new Dimension({ width: size, height: size * 2 }),
    id,
    seriesId: owner,
  })

const ids = (owner: string) => dao.findAllBySeriesId(owner).map((it) => [it.id, it.selected])

func('insert', () => {
  kase('insert and read back', () => {
    seed(db)
    dao.insert(th('T1', undefined, true))
    return stable(dao.findByIdOrNull('T1'))
  })
  kase('sidecar with url', () => {
    dao.insert(th('T2', undefined, undefined, 3, ThumbnailSeries.Type.SIDECAR))
    return stable(dao.findByIdOrNull('T2'))
  })
  kase('other owner', () => {
    dao.insert(th('T3', 'S3', true, 0))
    return ids('S3')
  })
  kase('duplicate id', () => exceptionType(() => dao.insert(th('T1'))))
  kase('unknown owner', () => exceptionType(() => dao.insert(th('T9', 'NOPE'))))
})

func('findAllBySeriesId', () => {
  kase('all fields', () => stable(dao.findAllBySeriesId('S1')))
  kase('none', () => dao.findAllBySeriesId('S2'))
})

func('findAllBySeriesIdIdAndType', () => {
  kase('sidecar', () => dao.findAllBySeriesIdIdAndType('S1', ThumbnailSeries.Type.SIDECAR).map((it) => it.id))
  kase('user uploaded', () => dao.findAllBySeriesIdIdAndType('S1', ThumbnailSeries.Type.USER_UPLOADED).map((it) => it.id))
  kase('none', () => dao.findAllBySeriesIdIdAndType('S3', ThumbnailSeries.Type.SIDECAR))
})

func('findByIdOrNull', () => {
  kase('missing', () => dao.findByIdOrNull('NOPE'))
})

func('getLibraryIdOrNull', () => {
  kase('existing', () => [dao.getLibraryIdOrNull('T1'), dao.getLibraryIdOrNull('T3')])
  kase('missing', () => dao.getLibraryIdOrNull('NOPE'))
})

func('getSeriesIdOrNull', () => {
  kase('existing', () => [dao.getSeriesIdOrNull('T2'), dao.getSeriesIdOrNull('T3')])
  kase('missing', () => dao.getSeriesIdOrNull('NOPE'))
})

func('findSelectedBySeriesIdOrNull', () => {
  kase('selected', () => dao.findSelectedBySeriesIdOrNull('S1')?.id ?? null)
  kase('none', () => dao.findSelectedBySeriesIdOrNull('S2'))
})

func('toDomain', () => {
  kase('stored values', () =>
    db.rawQuery('select ID, SERIES_ID, URL, SELECTED, TYPE, WIDTH, HEIGHT, FILE_SIZE, MEDIA_TYPE, length(THUMBNAIL) from THUMBNAIL_SERIES order by ID'),
  )
  kase('url', () => dao.findByIdOrNull('T2')!.url)
})

func('update', () => {
  kase('all fields', () => {
    dao.update(th('T2', 'S1', true, 5).copy({ mediaType: 'image/png' }))
    return stable(dao.findByIdOrNull('T2'))
  })
  kase('move to other owner and back to sidecar', () => {
    dao.update(th('T2', 'S3', false, 5, ThumbnailSeries.Type.SIDECAR))
    return [ids('S1'), ids('S3'), dao.findByIdOrNull('T2')!.url]
  })
  kase('missing', () => {
    dao.update(th('NOPE'))
    return dao.findByIdOrNull('NOPE')
  })
  kase('unknown owner', () => exceptionType(() => dao.update(th('T2', 'NOPE'))))
})

func('markSelected', () => {
  kase('select other', () => {
    dao.insert(th('T4', 'S1', false))
    dao.markSelected(th('T4', 'S1'))
    return [ids('S1'), ids('S3')]
  })
  kase('select in other owner', () => {
    dao.markSelected(th('T2', 'S3'))
    return [ids('S1'), ids('S3')]
  })
  kase('missing thumbnail unselects all', () => {
    dao.markSelected(th('NOPE', 'S3'))
    return ids('S3')
  })
})

func('delete', () => {
  kase('existing', () => {
    dao.delete('T1')
    return ids('S1')
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return ids('S1')
  })
})

func('deleteBySeriesId', () => {
  kase('existing', () => {
    dao.deleteBySeriesId('S1')
    return ids('S1')
  })
  kase('missing', () => {
    dao.deleteBySeriesId('NOPE')
    return ids('S3')
  })
})

func('deleteBySeriesIds', () => {
  kase('empty', () => {
    dao.deleteBySeriesIds([])
    return ids('S3')
  })
  kase('some with large list', () => {
    dao.insert(th('T5', 'S6'))
    dao.insert(th('T6', 'S2'))
    dao.deleteBySeriesIds([...Array.from({ length: 1500 }, (_, i) => `X${i + 1}`), 'S3', 'S6'])
    return [ids('S3'), ids('S6'), ids('S2')]
  })
})
