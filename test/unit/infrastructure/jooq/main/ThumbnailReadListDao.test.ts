// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ThumbnailReadListDaoOracleTest.kt
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { ThumbnailReadList } from '../../../../../src/domain/model/ThumbnailReadList.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, oracleBytes, stable } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ThumbnailReadListDao')

const db = new OracleDb()
const dao = db.thumbnailReadListDao

const th = (id: string, owner = 'RL1', selected = false, size = 10) =>
  new ThumbnailReadList({
    thumbnail: oracleBytes(size),
    selected,
    type: ThumbnailReadList.Type.USER_UPLOADED,
    mediaType: 'image/jpeg',
    fileSize: size,
    dimension: new Dimension({ width: size, height: size * 2 }),
    id,
    readListId: owner,
  })

const ids = (owner: string) => dao.findAllByReadListId(owner).map((it) => [it.id, it.selected])

func('insert', () => {
  kase('insert and read back', async () => {
    await seed(db)
    dao.insert(th('T1', undefined, true))
    return stable(dao.findByIdOrNull('T1'))
  })
  kase('second thumbnail', () => {
    dao.insert(th('T2', undefined, undefined, 3))
    return ids('RL1')
  })
  kase('other owner', () => {
    dao.insert(th('T3', 'RL2', true, 0))
    return ids('RL2')
  })
  kase('duplicate id', () => exceptionType(() => dao.insert(th('T1'))))
  kase('unknown owner', () => exceptionType(() => dao.insert(th('T9', 'NOPE'))))
})

func('findAllByReadListId', () => {
  kase('all fields', () => stable(dao.findAllByReadListId('RL1')))
  kase('none', () => dao.findAllByReadListId('RL3'))
  kase('unknown', () => dao.findAllByReadListId('NOPE'))
})

func('findByIdOrNull', () => {
  kase('existing', () => stable(dao.findByIdOrNull('T3')))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
})

func('findSelectedByReadListIdOrNull', () => {
  kase('selected', () => dao.findSelectedByReadListIdOrNull('RL1')?.id ?? null)
  kase('none', () => dao.findSelectedByReadListIdOrNull('RL3'))
})

func('toDomain', () => {
  kase('stored values', () =>
    db.rawQuery('select ID, SELECTED, TYPE, WIDTH, HEIGHT, FILE_SIZE, MEDIA_TYPE, length(THUMBNAIL) from THUMBNAIL_READLIST order by ID'),
  )
  kase('thumbnail bytes and dimension', () => {
    const it = dao.findByIdOrNull('T2')!
    return [it.thumbnail, it.dimension, it.fileSize, it.type]
  })
})

func('update', () => {
  kase('all fields', () => {
    dao.update(th('T2', 'RL1', true, 5).copy({ mediaType: 'image/png' }))
    return stable(dao.findByIdOrNull('T2'))
  })
  kase('move to other owner', () => {
    dao.update(th('T2', 'RL2', false, 5))
    return [ids('RL1'), ids('RL2')]
  })
  kase('missing', () => {
    dao.update(th('NOPE'))
    return dao.findByIdOrNull('NOPE')
  })
  kase('unknown owner', () => exceptionType(() => dao.update(th('T2', 'NOPE'))))
})

func('markSelected', () => {
  kase('select other', () => {
    dao.insert(th('T4', 'RL1', false))
    dao.markSelected(th('T4', 'RL1'))
    return [ids('RL1'), ids('RL2')]
  })
  kase('select in other owner', () => {
    dao.markSelected(th('T2', 'RL2'))
    return [ids('RL1'), ids('RL2')]
  })
  kase('missing thumbnail unselects all', () => {
    dao.markSelected(th('NOPE', 'RL2'))
    return ids('RL2')
  })
})

func('delete', () => {
  kase('existing', () => {
    dao.delete('T1')
    return ids('RL1')
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return ids('RL1')
  })
})

func('deleteByReadListId', () => {
  kase('existing', () => {
    dao.deleteByReadListId('RL1')
    return ids('RL1')
  })
  kase('missing', () => {
    dao.deleteByReadListId('NOPE')
    return ids('RL2')
  })
})

func('deleteByReadListIds', () => {
  kase('empty', () => {
    dao.deleteByReadListIds([])
    return ids('RL2')
  })
  kase('some', () => {
    dao.insert(th('T5', 'RL3'))
    dao.deleteByReadListIds(['RL2', 'NOPE'])
    return [ids('RL2'), ids('RL3')]
  })
})
