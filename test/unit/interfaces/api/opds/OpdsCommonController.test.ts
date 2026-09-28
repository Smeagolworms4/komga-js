// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/opds/OpdsCommonControllerOracleTest.kt
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { ThumbnailBook } from '../../../../../src/domain/model/ThumbnailBook.js'
import { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { OpdsCommonController } from '../../../../../src/interfaces/api/opds/OpdsCommonController.js'
import { OracleDb } from '../../../db.js'
import { oracle, tempDir } from '../../../oracle.js'
import { admin, limited, realBooks, restricted, setup } from '../../data.js'
import { thumbnails } from '../../opds-support.js'
import { InterfacesServices } from '../../services.js'

const { func, kase } = oracle('interfaces/api/opds/OpdsCommonController')

const db = new OracleDb()
const services = new InterfacesServices(db)
let instance: OpdsCommonController | null = null
const controller = () => (instance ??= new OpdsCommonController(services.contentRestrictionChecker, services.bookLifecycle, services.imageConverter))

async function attempt(block: () => unknown): Promise<unknown> {
  try {
    return await block()
  } catch (e) {
    return [(e as Error).name, (e as Error).message]
  }
}

func('getBookThumbnail', () => {
  kase('setup', () => {
    setup(db)
    realBooks(db, tempDir())
    thumbnails(db)
  })
  kase('jpeg thumbnail', () => attempt(() => controller().getBookThumbnail(new KomgaPrincipal(admin), 'B7')))
  kase('png thumbnail converted', () => {
    db.thumbnailBookDao.insert(
      new ThumbnailBook({
        thumbnail: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAH0lEQVR4nGP4z8DwHwwZ/v9n4BKR+69hZPPfLSDqPwCJ2wq6OEinjgAAAABJRU5ErkJggg==', 'base64'),
        type: ThumbnailBook.Type.USER_UPLOADED,
        mediaType: 'image/png',
        fileSize: 1,
        dimension: new Dimension({ width: 3, height: 2 }),
        selected: true,
        id: 'TB8',
        bookId: 'B8',
      }),
    )
    return attempt(async () => {
      const it = await controller().getBookThumbnail(new KomgaPrincipal(admin), 'B8')
      return [it.length > 0, it[0], it[1]]
    })
  })
  kase('no thumbnail', () => attempt(() => controller().getBookThumbnail(new KomgaPrincipal(admin), 'B1')))
  kase('restricted', () => attempt(() => controller().getBookThumbnail(new KomgaPrincipal(restricted), 'B4')))
  kase('unknown book', () => attempt(() => controller().getBookThumbnail(new KomgaPrincipal(limited), 'BX')))
})
