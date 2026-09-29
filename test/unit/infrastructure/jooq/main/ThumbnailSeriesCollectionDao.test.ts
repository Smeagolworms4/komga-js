// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ThumbnailSeriesCollectionDaoOracleTest.kt
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { ThumbnailSeriesCollection } from '../../../../../src/domain/model/ThumbnailSeriesCollection.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, oracleBytes, stable } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ThumbnailSeriesCollectionDao')

const db = new OracleDb()
const dao = db.thumbnailSeriesCollectionDao

const th = (id: string, owner = 'C1', selected = false, size = 10) =>
  new ThumbnailSeriesCollection({
    thumbnail: oracleBytes(size),
    selected,
    type: ThumbnailSeriesCollection.Type.USER_UPLOADED,
    mediaType: 'image/jpeg',
    fileSize: size,
    dimension: new Dimension({ width: size, height: size * 2 }),
    id,
    collectionId: owner,
  })

const ids = (owner: string) => dao.findAllByCollectionId(owner).map((it) => [it.id, it.selected])

func('insert', () => {
  kase('insert and read back', async () => {
    await seed(db)
    dao.insert(th('T1', undefined, true))
    return stable(dao.findByIdOrNull('T1'))
  })
  kase('second thumbnail', () => {
    dao.insert(th('T2', undefined, undefined, 3))
    return ids('C1')
  })
  kase('other owner', () => {
    dao.insert(th('T3', 'C2', true, 0))
    return ids('C2')
  })
  kase('duplicate id', () => exceptionType(() => dao.insert(th('T1'))))
  kase('unknown owner', () => exceptionType(() => dao.insert(th('T9', 'NOPE'))))
})

func('findAllByCollectionId', () => {
  kase('all fields', () => stable(dao.findAllByCollectionId('C1')))
  kase('none', () => dao.findAllByCollectionId('C3'))
  kase('unknown', () => dao.findAllByCollectionId('NOPE'))
})

func('findByIdOrNull', () => {
  kase('existing', () => stable(dao.findByIdOrNull('T3')))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
})

func('findSelectedByCollectionIdOrNull', () => {
  kase('selected', () => dao.findSelectedByCollectionIdOrNull('C1')?.id ?? null)
  kase('none', () => dao.findSelectedByCollectionIdOrNull('C3'))
})

func('toDomain', () => {
  kase('stored values', () =>
    db.rawQuery('select ID, SELECTED, TYPE, WIDTH, HEIGHT, FILE_SIZE, MEDIA_TYPE, length(THUMBNAIL) from THUMBNAIL_COLLECTION order by ID'),
  )
  kase('thumbnail bytes and dimension', () => {
    const it = dao.findByIdOrNull('T2')!
    return [it.thumbnail, it.dimension, it.fileSize, it.type]
  })
})

func('update', () => {
  kase('all fields', () => {
    dao.update(th('T2', 'C1', true, 5).copy({ mediaType: 'image/png' }))
    return stable(dao.findByIdOrNull('T2'))
  })
  kase('move to other owner', () => {
    dao.update(th('T2', 'C2', false, 5))
    return [ids('C1'), ids('C2')]
  })
  kase('missing', () => {
    dao.update(th('NOPE'))
    return dao.findByIdOrNull('NOPE')
  })
  kase('unknown owner', () => exceptionType(() => dao.update(th('T2', 'NOPE'))))
})

func('markSelected', () => {
  kase('select other', () => {
    dao.insert(th('T4', 'C1', false))
    dao.markSelected(th('T4', 'C1'))
    return [ids('C1'), ids('C2')]
  })
  kase('select in other owner', () => {
    dao.markSelected(th('T2', 'C2'))
    return [ids('C1'), ids('C2')]
  })
  kase('missing thumbnail unselects all', () => {
    dao.markSelected(th('NOPE', 'C2'))
    return ids('C2')
  })
})

func('delete', () => {
  kase('existing', () => {
    dao.delete('T1')
    return ids('C1')
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return ids('C1')
  })
})

func('deleteByCollectionId', () => {
  kase('existing', () => {
    dao.deleteByCollectionId('C1')
    return ids('C1')
  })
  kase('missing', () => {
    dao.deleteByCollectionId('NOPE')
    return ids('C2')
  })
})

func('deleteByCollectionIds', () => {
  kase('empty', () => {
    dao.deleteByCollectionIds([])
    return ids('C2')
  })
  kase('some', () => {
    dao.insert(th('T5', 'C3'))
    dao.deleteByCollectionIds(['C2', 'NOPE'])
    return [ids('C2'), ids('C3')]
  })
})
