// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/kosync/KoreaderSyncControllerOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { MediaExtensionEpub } from '../../../../../src/domain/model/MediaExtension.js'
import { R2Locator } from '../../../../../src/domain/model/R2Locator.js'
import { ReadProgress } from '../../../../../src/domain/model/ReadProgress.js'
import { KomgaPrincipal } from '../../../../../src/infrastructure/security/KomgaPrincipal.js'
import { KoreaderSyncController } from '../../../../../src/interfaces/api/kosync/KoreaderSyncController.js'
import { DocumentProgressDto } from '../../../../../src/interfaces/api/kosync/dto/DocumentProgressDto.js'
import { OracleDb } from '../../../db.js'
import { oracle, stable, tempDir } from '../../../oracle.js'
import { mapper, stableText } from '../../../web-oracle.js'
import { admin as adminUser, limited as limitedUser, realBooks, setup } from '../../data.js'
import { InterfacesServices } from '../../services.js'

const { func, kase } = oracle('interfaces/api/kosync/KoreaderSyncController')

const db = new OracleDb()
const services = new InterfacesServices(db)
let instance: KoreaderSyncController | null = null
const controller = () => (instance ??= new KoreaderSyncController(db.bookDao, db.mediaDao, db.readProgressDao, services.bookLifecycle))
const admin = new KomgaPrincipal(adminUser)
const limited = new KomgaPrincipal(limitedUser)
const date = LocalDateTime.of(2020, 1, 2, 3, 4, 5)
const f32 = Math.fround

const json = (v: unknown) => stableText(mapper().writeValueAsString(v))

async function attempt(block: () => unknown): Promise<unknown> {
  try {
    return await block()
  } catch (e) {
    return [(e as Error).name, (e as Error).message]
  }
}

const hash = (bookId: string, h: string) => db.bookDao.update(db.bookDao.findByIdOrNull(bookId)!.copy({ fileHashKoreader: h }))

/**
 * la progression enregistrée juste avant est antidatée : markProgression exige une date strictement postérieure et
 * `now()` n'a que la milliseconde côté JS (deux mises à jour dans la même milliseconde seraient « plus anciennes »)
 */
const update = (document: string, progress: string, percentage = 0.5, principal: KomgaPrincipal = admin) =>
  attempt(() => {
    db.dsl.execute("update READ_PROGRESS set READ_DATE = '2020-01-01 00:00:00' where READ_DATE >= '2025'")
    return controller().updateProgress(principal, new DocumentProgressDto({ document, percentage: f32(percentage), progress, device: 'KOReader dev', deviceId: 'dev-id' }))
  })

const progress = (bookId: string) => stable(db.readProgressDao.findByBookIdAndUserIdOrNull(bookId, 'U1'))

const loc = (href: string, progression: number, position: number, totalProgression: number) =>
  new R2Locator({ href, type: 'application/xhtml+xml', locations: new R2Locator.Location({ progression: f32(progression), position, totalProgression: f32(totalProgression) }) })

func('registerUser', () => {
  kase('setup', () => {
    setup(db)
    realBooks(db, tempDir())
    hash('B7', 'hash-cbz')
    hash('B8', 'hash-epub')
    hash('B5', 'hash-pdf')
    hash('B1', 'dup')
    hash('B2', 'dup')
    hash('B4', 'hash-noext')
  })
  kase('forbidden', () => attempt(() => controller().registerUser()))
})

func('authorize', () => {
  kase('ok', () => json(controller().authorize()))
})

func('getProgress', () => {
  kase('unknown hash', () => attempt(() => controller().getProgress(admin, 'nope')))
  kase('duplicate hash', () => attempt(() => controller().getProgress(admin, 'dup')))
  kase('no progress', () => attempt(() => controller().getProgress(admin, 'hash-cbz')))
  kase('divina progress', () => {
    db.readProgressDao.save(new ReadProgress({ bookId: 'B7', userId: 'U1', page: 2, completed: false, readDate: date, deviceId: 'd1', deviceName: 'Device 1', createdDate: date }))
    return attempt(() => json(controller().getProgress(admin, 'hash-cbz')))
  })
  kase('divina progress with locator', () => {
    db.readProgressDao.save(
      new ReadProgress({
        bookId: 'B7',
        userId: 'U1',
        page: 3,
        completed: true,
        readDate: date,
        deviceId: 'd1',
        deviceName: 'Device 1',
        locator: new R2Locator({ href: '', type: '', locations: new R2Locator.Location({ totalProgression: f32(0.75) }) }),
        createdDate: date,
      }),
    )
    return attempt(() => json(controller().getProgress(admin, 'hash-cbz')))
  })
  kase('pdf, page only', () => {
    db.readProgressDao.save(new ReadProgress({ bookId: 'B5', userId: 'U1', page: 1, completed: false, readDate: date, createdDate: date }))
    return attempt(() => json(controller().getProgress(admin, 'hash-pdf')))
  })
  kase('epub without extension', () => {
    db.readProgressDao.save(
      new ReadProgress({ bookId: 'B4', userId: 'U1', page: 1, completed: false, readDate: date, locator: new R2Locator({ href: 'OEBPS/a.xhtml', type: 'application/xhtml+xml' }), createdDate: date }),
    )
    return attempt(() => controller().getProgress(admin, 'hash-noext'))
  })
  kase('epub', () => {
    db.mediaDao.update(
      db.mediaDao.findById('B8').copy({
        extension: new MediaExtensionEpub({
          positions: [loc('OEBPS/cover.xhtml', 0, 1, 0), loc('OEBPS/ch 1.xhtml', 0, 2, 0.3), loc('OEBPS/ch 1.xhtml', 0.5, 3, 0.6), loc('OEBPS/ch2.xhtml', 0, 4, 0.9)],
        }),
      }),
    )
    db.readProgressDao.save(
      new ReadProgress({
        bookId: 'B8',
        userId: 'U1',
        page: 1,
        completed: false,
        readDate: date,
        locator: new R2Locator({ href: 'OEBPS/ch 1.xhtml', type: 'application/xhtml+xml', locations: new R2Locator.Location({ totalProgression: f32(0.3) }) }),
        createdDate: date,
      }),
    )
    return attempt(() => json(controller().getProgress(admin, 'hash-epub')))
  })
  kase('epub, unknown href', () => {
    db.readProgressDao.save(
      new ReadProgress({ bookId: 'B8', userId: 'U1', page: 1, completed: false, readDate: date, locator: new R2Locator({ href: 'OEBPS/none.xhtml', type: 'application/xhtml+xml' }), createdDate: date }),
    )
    return attempt(() => json(controller().getProgress(admin, 'hash-epub')))
  })
  kase('other user', () => attempt(() => controller().getProgress(limited, 'hash-epub')))
})

func('updateProgress', () => {
  kase('unknown hash', () => update('nope', '1'))
  kase('duplicate hash', () => update('dup', '1'))
  kase('divina page', async () => {
    await update('hash-cbz', '2', 0.66)
    return progress('B7')
  })
  kase('divina invalid page', () => update('hash-cbz', 'abc'))
  kase('divina page out of range', () => update('hash-cbz', '9'))
  kase('epub doc fragment', async () => {
    await update('hash-epub', '/body/DocFragment[2]/body/div/p[1]/text().0', 0.3)
    return progress('B8')
  })
  kase('epub doc fragment lower case', async () => [await update('hash-epub', '/body/docfragment[3].0', 0.95), progress('B8')])
  kase('epub toc fragment', async () => [await update('hash-epub', '#_doc_fragment_1_ c37', 0.31), progress('B8')])
  kase('epub index out of range', () => update('hash-epub', '/body/DocFragment[9].0'))
  kase('epub unparseable', () => update('hash-epub', 'garbage'))
  kase('epub without extension', () => update('hash-noext', '/body/DocFragment[1].0'))
  kase('events', () => services.drainEvents())
})
