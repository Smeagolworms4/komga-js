// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ThumbnailBookDaoOracleTest.kt
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { ThumbnailBook } from '../../../../../src/domain/model/ThumbnailBook.js'
import { URL } from '../../../../../src/port/java-net.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, oracleBytes, stable } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ThumbnailBookDao')

const db = new OracleDb()
const dao = db.thumbnailBookDao

const th = (id: string, owner = 'B2', selected = false, size = 10, type: ThumbnailBook.Type = ThumbnailBook.Type.GENERATED) =>
  new ThumbnailBook({
    thumbnail: type === ThumbnailBook.Type.SIDECAR ? null : oracleBytes(size),
    url: type === ThumbnailBook.Type.SIDECAR ? new URL(`file:/lib1/S1/cover%20${id}.jpg`) : null,
    selected,
    type,
    mediaType: 'image/jpeg',
    fileSize: size,
    dimension: new Dimension({ width: size, height: size * 2 }),
    id,
    bookId: owner,
  })

const ids = (owner: string) => dao.findAllByBookId(owner).map((it) => [it.id, it.selected])
const sorted = (l: string[]) => [...l].sort()

func('findAllByBookId', () => {
  kase('seeded thumbnails', async () => {
    await seed(db)
    return dao.findAllByBookId('B1')
  })
  kase('none', () => dao.findAllByBookId('B2'))
  kase('unknown', () => dao.findAllByBookId('NOPE'))
})

func('insert', () => {
  kase('insert and read back', () => {
    dao.insert(th('T1', undefined, true))
    return stable(dao.findByIdOrNull('T1'))
  })
  kase('sidecar with url', () => {
    dao.insert(th('T2', undefined, undefined, 3, ThumbnailBook.Type.SIDECAR))
    return stable(dao.findByIdOrNull('T2'))
  })
  kase('user uploaded', () => {
    dao.insert(th('T3', undefined, undefined, 700, ThumbnailBook.Type.USER_UPLOADED))
    return ids('B2')
  })
  kase('duplicate id', () => exceptionType(() => dao.insert(th('T1'))))
  kase('unknown owner', () => exceptionType(() => dao.insert(th('T9', 'NOPE'))))
})

func('findAllByBookIdAndType', () => {
  kase('one type', () => dao.findAllByBookIdAndType('B2', new Set([ThumbnailBook.Type.SIDECAR])).map((it) => it.id))
  kase('two types', () => dao.findAllByBookIdAndType('B2', new Set([ThumbnailBook.Type.GENERATED, ThumbnailBook.Type.USER_UPLOADED])).map((it) => it.id))
  kase('empty set', () => dao.findAllByBookIdAndType('B2', new Set()))
  kase('no match', () => dao.findAllByBookIdAndType('B6', new Set([ThumbnailBook.Type.SIDECAR])))
})

func('findByIdOrNull', () => {
  kase('seeded', () => dao.findByIdOrNull('TB2'))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
})

func('findSelectedByBookIdOrNull', () => {
  kase('selected', () => dao.findSelectedByBookIdOrNull('B2')?.id ?? null)
  kase('none', () => dao.findSelectedByBookIdOrNull('B3'))
})

func('findAllBookIdsByThumbnailTypeAndDimensionSmallerThan', () => {
  kase('generated smaller than 300', () => sorted(dao.findAllBookIdsByThumbnailTypeAndDimensionSmallerThan(ThumbnailBook.Type.GENERATED, 300)))
  kase('generated smaller than 401', () => sorted(dao.findAllBookIdsByThumbnailTypeAndDimensionSmallerThan(ThumbnailBook.Type.GENERATED, 401)))
  kase('sidecar', () => sorted(dao.findAllBookIdsByThumbnailTypeAndDimensionSmallerThan(ThumbnailBook.Type.SIDECAR, 10000)))
  kase('zero', () => dao.findAllBookIdsByThumbnailTypeAndDimensionSmallerThan(ThumbnailBook.Type.USER_UPLOADED, 0))
})

func('existsById', () => {
  kase('existing', () => [dao.existsById('T1'), dao.existsById('TB4')])
  kase('missing', () => dao.existsById('NOPE'))
})

func('getLibraryIdOrNull', () => {
  kase('existing', () => [dao.getLibraryIdOrNull('T1'), dao.getLibraryIdOrNull('TB3')])
  kase('missing', () => dao.getLibraryIdOrNull('NOPE'))
})

func('getSeriesIdOrNull', () => {
  kase('existing', () => [dao.getSeriesIdOrNull('T2'), dao.getSeriesIdOrNull('TB3')])
  kase('missing', () => dao.getSeriesIdOrNull('NOPE'))
})

func('toDomain', () => {
  kase('stored values', () =>
    db.rawQuery(
      'select ID, BOOK_ID, URL, SELECTED, TYPE, WIDTH, HEIGHT, FILE_SIZE, MEDIA_TYPE, length(THUMBNAIL) from THUMBNAIL_BOOK order by ID',
    ),
  )
  kase('dates are not converted', () => {
    const it = dao.findByIdOrNull('TB1')!
    return [it.createdDate, it.lastModifiedDate]
  })
})

func('update', () => {
  kase('all fields', () => {
    dao.update(th('T2', 'B2', true, 5).copy({ mediaType: 'image/png' }))
    return stable(dao.findByIdOrNull('T2'))
  })
  kase('move to other owner as sidecar', () => {
    dao.update(th('T2', 'B3', false, 5, ThumbnailBook.Type.SIDECAR))
    return [ids('B2'), ids('B3'), dao.findByIdOrNull('T2')!.url]
  })
  kase('missing', () => {
    dao.update(th('NOPE'))
    return dao.findByIdOrNull('NOPE')
  })
  kase('unknown owner', () => exceptionType(() => dao.update(th('T2', 'NOPE'))))
})

func('markSelected', () => {
  kase('select other', () => {
    dao.markSelected(th('T3', 'B2'))
    return [ids('B2'), ids('B1')]
  })
  kase('select seeded', () => {
    dao.markSelected(th('TB2', 'B1'))
    return ids('B1')
  })
  kase('missing thumbnail unselects all', () => {
    dao.markSelected(th('NOPE', 'B6'))
    return ids('B6')
  })
})

func('delete', () => {
  kase('existing', () => {
    dao.delete('T1')
    return ids('B2')
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return ids('B2')
  })
})

func('deleteByBookIdAndType', () => {
  kase('matching type', () => {
    dao.deleteByBookIdAndType('B1', ThumbnailBook.Type.SIDECAR)
    return ids('B1')
  })
  kase('other type', () => {
    dao.deleteByBookIdAndType('B2', ThumbnailBook.Type.SIDECAR)
    return ids('B2')
  })
})

func('deleteByBookId', () => {
  kase('existing', () => {
    dao.deleteByBookId('B2')
    return ids('B2')
  })
  kase('missing', () => {
    dao.deleteByBookId('NOPE')
    return ids('B6')
  })
})

func('deleteByBookIds', () => {
  kase('empty', () => {
    dao.deleteByBookIds([])
    return ids('B6')
  })
  kase('some with large list', () => {
    dao.insert(th('T5', 'B11'))
    dao.deleteByBookIds([...Array.from({ length: 1500 }, (_, i) => `X${i + 1}`), 'B6', 'B3'])
    return [ids('B6'), ids('B3'), ids('B11'), ids('B1')]
  })
})
