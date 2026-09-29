// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/KoboDtoDaoOracleTest.kt
import { BookProjection } from '../../../../../src/domain/model/BookProjection.js'
import { MediaExtensionEpub } from '../../../../../src/domain/model/MediaExtension.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { books, media, seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/KoboDtoDao')

const db = new OracleDb()
const dao = db.koboDtoDao

const find = (...ids: string[]) => dao.findBookMetadataByIds(ids).sort((a, b) => (a.entitlementId < b.entitlementId ? -1 : a.entitlementId > b.entitlementId ? 1 : 0))

func('findBookMetadataByIds', () => {
  kase('empty database', () => dao.findBookMetadataByIds(['B1']))
  kase('series book with thumbnail and authors', async () => {
    await seed(db)
    return find('B1')
  })
  kase('several books', () => find('B6', 'B2', 'B4', 'NOPE'))
  kase('book without release date nor publisher', () => find('B5', 'B9'))
  kase('oneshot fixed layout kepub with projections', () => {
    db.mediaDao.update(media.find((it) => it.bookId === 'B10')!.copy({ extension: new MediaExtensionEpub({ isFixedLayout: true }), epubIsKepub: true }))
    db.bookProjectionDao.save(new BookProjection({ bookId: 'B10', profile: 'kepub', fileSize: 650 }))
    db.bookProjectionDao.save(new BookProjection({ bookId: 'B10', profile: 'epub3', fileSize: 710 }))
    return find('B10')
  })
  kase('epub not fixed layout', () => {
    db.mediaDao.update(media.find((it) => it.bookId === 'B11')!.copy({ mediaType: 'application/epub+zip', extension: new MediaExtensionEpub() }))
    return find('B11').map((it) => [it.isPrePaginated, it.isKepub, it.language, it.extraFileSizes])
  })
  kase('empty ids', () => dao.findBookMetadataByIds([]))
  kase('all books', () => find(...books.map((it) => it.id)).map((it) => [it.entitlementId, it.series?.name ?? null, it.language, it.coverImageId]))
})
