// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/CommonBookControllerOracleTest.kt
import { Writable } from 'node:stream'
import { ZoneOffset, ZonedDateTime } from '@js-joda/core'
import type { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { R2Device } from '../../../../src/domain/model/R2Device.js'
import { R2Locator } from '../../../../src/domain/model/R2Locator.js'
import { R2Progression } from '../../../../src/domain/model/R2Progression.js'
import { KomgaPrincipal } from '../../../../src/infrastructure/security/KomgaPrincipal.js'
import type { CommonBookController } from '../../../../src/interfaces/api/CommonBookController.js'
import { ParsedMediaType } from '../../../../src/port/media-type.js'
import type { ResponseEntity } from '../../../../src/port/spring-web.js'
import { ServletWebRequest } from '../../../../src/port/spring-web-filter.js'
import { OracleDb } from '../../db.js'
import { oracle, stable, tempDir } from '../../oracle.js'
import { describeEntity, mapper, stableText, request, withRequest } from '../../web-oracle.js'
import { admin as adminUser, limited as limitedUser, realBooks, restricted as restrictedUser, setup } from '../data.js'
import { InterfacesServices } from '../services.js'

const { func, kase } = oracle('interfaces/api/CommonBookController')

const db = new OracleDb()
const services = new InterfacesServices(db)
const controller = (): CommonBookController => services.commonBookController
const admin = new KomgaPrincipal(adminUser)
const limited = new KomgaPrincipal(limitedUser)
const restricted = new KomgaPrincipal(restrictedUser)

const json = (v: unknown): string => stableText(mapper().writeValueAsString(v))

const web = <T>(block: () => T): Promise<T> => withRequest(request({ uri: '/api/v1/books', host: 'localhost', port: 25600 }), block)

async function describe(e: ResponseEntity<unknown> | Promise<ResponseEntity<unknown>>): Promise<unknown[]> {
  const entity = await e
  const d = describeEntity(entity)
  const body = entity.body
  if (typeof body === 'function') {
    const chunks: Buffer[] = []
    const out = new Writable({
      write(chunk: Buffer, _enc, cb) {
        chunks.push(Buffer.from(chunk))
        cb()
      },
    })
    await (body as (o: Writable) => unknown)(out)
    return [...d.slice(0, 2), new Uint8Array(Buffer.concat(chunks))]
  }
  return d
}

const lastModified = () => 'Thu, 02 Jan 2020 03:04:05 GMT'

function page(
  bookId: string,
  p: number,
  { convert = null, principal = admin, accept = null, headers = [] }: { convert?: string | null; principal?: KomgaPrincipal; accept?: string | null; headers?: [string, string][] } = {},
) {
  return describe(
    controller().getBookPageInternal(
      bookId,
      p,
      convert,
      new ServletWebRequest(request({ uri: `/api/v1/books/${bookId}/pages/${p}`, headers })),
      principal,
      accept === null ? null : ParsedMediaType.parseList(accept),
    ),
  )
}

const convertedPage = async (bookId: string, p: number, convert: string) => (await page(bookId, p, { convert })).slice(0, 2)

const progression = (position: number | null, href = 'p', prog: number | null = null, date = ZonedDateTime.of(2021, 5, 6, 7, 8, 9, 0, ZoneOffset.UTC)) =>
  new R2Progression({
    modified: date,
    device: new R2Device({ id: 'dev1', name: 'My Device' }),
    locator: new R2Locator({ href, type: 'image/png', locations: new R2Locator.Location({ position, progression: prog }) }),
  })

const progress = (bookId: string, user: KomgaUser = adminUser) => stable(db.readProgressDao.findByBookIdAndUserIdOrNull(bookId, user.id))

func('getWebPubManifestInternal', () => {
  kase('setup', () => {
    setup(db)
    realBooks(db, tempDir())
  })
  for (const id of ['B1', 'B4', 'B5', 'B6', 'BX']) kase(id, () => web(() => json(controller().getWebPubManifestInternal(admin, id, services.webPubGenerator))))
  kase('unknown media type', () => {
    db.mediaDao.update(db.mediaDao.findById('B3').copy({ mediaType: 'text/plain' }))
    return web(() => json(controller().getWebPubManifestInternal(admin, 'B3', services.webPubGenerator)))
  })
  kase('opds generator', () => web(() => json(controller().getWebPubManifestInternal(admin, 'B2', services.opdsGenerator))))
})

func('getWebPubManifestEpubInternal', () => {
  kase('epub', () => web(() => json(controller().getWebPubManifestEpubInternal(admin, 'B4', services.webPubGenerator))))
  kase('not epub', () => web(() => json(controller().getWebPubManifestEpubInternal(admin, 'B1', services.webPubGenerator))))
  kase('restricted', () => web(() => json(controller().getWebPubManifestEpubInternal(restricted, 'B4', services.webPubGenerator))))
  kase('limited: other library', () => web(() => json(controller().getWebPubManifestEpubInternal(limited, 'B4', services.webPubGenerator))))
  kase('unknown', () => web(() => json(controller().getWebPubManifestEpubInternal(admin, 'BX', services.webPubGenerator))))
})

func('getWebPubManifestPdfInternal', () => {
  kase('pdf', () => web(() => json(controller().getWebPubManifestPdfInternal(admin, 'B5', services.webPubGenerator))))
  kase('not pdf', () => web(() => json(controller().getWebPubManifestPdfInternal(admin, 'B4', services.webPubGenerator))))
  kase('limited', () => web(() => json(controller().getWebPubManifestPdfInternal(limited, 'B5', services.webPubGenerator))))
  kase('unknown', () => web(() => json(controller().getWebPubManifestPdfInternal(admin, 'BX', services.webPubGenerator))))
})

func('getWebPubManifestDivinaInternal', () => {
  kase('divina', () => web(() => json(controller().getWebPubManifestDivinaInternal(admin, 'B7', services.webPubGenerator))))
  kase('pdf as divina', () => web(() => json(controller().getWebPubManifestDivinaInternal(admin, 'B5', services.webPubGenerator))))
  kase('limited, allowed', () => web(() => json(controller().getWebPubManifestDivinaInternal(limited, 'B2', services.webPubGenerator))))
  kase('unknown', () => web(() => json(controller().getWebPubManifestDivinaInternal(admin, 'BX', services.webPubGenerator))))
})

func('getBookPageInternal', () => {
  kase('page 1', () => page('B7', 1))
  kase('page 2', () => page('B7', 2))
  kase('page 3', () => page('B7', 3))
  kase('page 0', () => page('B7', 0))
  kase('page 4', () => page('B7', 4))
  kase('invalid conversion', () => page('B7', 1, { convert: 'webp' }))
  kase('empty conversion', () => page('B7', 1, { convert: '' }))
  kase('convert same format', () => page('B7', 2, { convert: 'JPEG' }))
  kase('convert png to jpeg', () => convertedPage('B7', 1, 'jpeg'))
  kase('convert jpeg to png', () => convertedPage('B7', 2, 'png'))
  kase('not modified', () => page('B7', 1, { headers: [['If-Modified-Since', lastModified()]] }))
  kase('modified since earlier', async () => (await page('B7', 1, { headers: [['If-Modified-Since', 'Wed, 01 Jan 2020 00:00:00 GMT']] })).slice(0, 2))
  kase('missing file', () => page('B1', 1))
  kase('unknown book', () => page('BX', 1))
  kase('restricted', () => page('B7', 1, { principal: restricted }))
  kase('limited other library', () => page('B4', 1, { principal: limited }))
  kase('pdf accept pdf: raw, missing file', () => page('B5', 1, { accept: 'application/pdf' }))
  kase('pdf accept image first', () => page('B5', 1, { accept: 'image/jpeg, application/pdf;q=0.5' }))
  kase('accept pdf on cbz', () => page('B7', 1, { accept: 'application/pdf' }))
})

func('getBookPageRawByNumber', () => {
  kase('page 1', () => describe(controller().getBookPageRawByNumber(admin, new ServletWebRequest(request()), 'B7', 1)))
  kase('page 9', () => describe(controller().getBookPageRawByNumber(admin, new ServletWebRequest(request()), 'B7', 9)))
  kase('not modified', () => describe(controller().getBookPageRawByNumber(admin, new ServletWebRequest(request({ headers: [['If-Modified-Since', lastModified()]] })), 'B7', 1)))
  kase('unknown', () => describe(controller().getBookPageRawByNumber(admin, new ServletWebRequest(request()), 'BX', 1)))
  kase('restricted', () => describe(controller().getBookPageRawByNumber(restricted, new ServletWebRequest(request()), 'B7', 1)))
})

func('getBookPageRawInternal', () => {
  kase('page 3', () => describe(controller().getBookPageRawInternal(db.bookDao.findByIdOrNull('B7')!, db.mediaDao.findById('B7'), 3)))
  kase('page -1', () => describe(controller().getBookPageRawInternal(db.bookDao.findByIdOrNull('B7')!, db.mediaDao.findById('B7'), -1)))
  kase('epub', () => describe(controller().getBookPageRawInternal(db.bookDao.findByIdOrNull('B8')!, db.mediaDao.findById('B8'), 1)))
  kase('missing file', () => describe(controller().getBookPageRawInternal(db.bookDao.findByIdOrNull('B2')!, db.mediaDao.findById('B2'), 1)))
})

func('getBookEpubResource', () => {
  const res = (resource: string, principal: KomgaPrincipal | null = admin, bookId = 'B8', headers: [string, string][] = []) =>
    describe(controller().getBookEpubResource(request({ headers }), principal, bookId, resource))
  kase('page', () => res('/OEBPS/ch 1.xhtml'))
  kase('asset without leading slash', () => res('OEBPS/style.css'))
  kase('font anonymous', () => res('/OEBPS/fonts/f.woff2', null))
  kase('css anonymous', () => res('/OEBPS/style.css', null))
  kase('not in media files', () => res('/OEBPS/other.css'))
  kase('in media files but not in archive', () => res('/OEBPS/missing.css'))
  kase('not epub', () => res('/p1.png', admin, 'B7'))
  kase('unknown book', () => res('/x.css', admin, 'BX'))
  kase('not modified', () => res('/OEBPS/style.css', admin, 'B8', [['If-Modified-Since', lastModified()]]))
  kase('restricted', () => res('/OEBPS/style.css', new KomgaPrincipal(restrictedUser)))
})

func('downloadBookFile', () => {
  kase('cbz', () => describe(controller().downloadBookFile(admin, 'B7')))
  kase('unknown', () => describe(controller().downloadBookFile(admin, 'BX')))
})

func('getBookFileInternal', () => {
  kase('epub', () => describe(controller().getBookFileInternal(admin, 'B8')))
  kase('missing file', () => describe(controller().getBookFileInternal(admin, 'B1')))
  kase('restricted', () => describe(controller().getBookFileInternal(restricted, 'B7')))
  kase('limited other library', () => describe(controller().getBookFileInternal(limited, 'B4')))
})

func('getBookProgression', () => {
  kase('in progress', async () => {
    const it = await describe(controller().getBookProgression(admin, 'B2'))
    return [it[0], it[1], json(it[2])]
  })
  kase('completed', async () => {
    const it = await describe(controller().getBookProgression(admin, 'B1'))
    return [it[0], it[1], json(it[2])]
  })
  kase('no progress', () => describe(controller().getBookProgression(admin, 'B3')))
  kase('unknown', () => describe(controller().getBookProgression(admin, 'BX')))
  kase('limited', () => describe(controller().getBookProgression(limited, 'B5')))
})

func('updateBookProgression', () => {
  kase('divina page 2', () => {
    controller().updateBookProgression(admin, 'B7', progression(2))
    return progress('B7')
  })
  kase('older than existing', () => controller().updateBookProgression(admin, 'B7', progression(3, 'p', null, ZonedDateTime.of(2019, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC))))
  kase('last page completes', () => {
    controller().updateBookProgression(admin, 'B7', progression(3, 'p', null, ZonedDateTime.of(2022, 1, 1, 0, 0, 0, 0, ZoneOffset.ofHours(2))))
    return progress('B7')
  })
  kase('page out of range', () => controller().updateBookProgression(admin, 'B3', progression(9)))
  kase('no position', () => controller().updateBookProgression(admin, 'B3', progression(null)))
  kase('epub resource not found', () => controller().updateBookProgression(admin, 'B8', progression(null, 'OEBPS/nope.xhtml', 0.5)))
  kase('epub no progression', () => controller().updateBookProgression(admin, 'B8', progression(null, 'OEBPS/ch%201.xhtml#x')))
  kase('epub without extension', () => controller().updateBookProgression(admin, 'B8', progression(null, 'OEBPS/ch%201.xhtml#x', 0.5)))
  kase('restricted', () => controller().updateBookProgression(restricted, 'B7', progression(1)))
  kase('unknown', () => controller().updateBookProgression(admin, 'BX', progression(1)))
  kase('events', () => services.drainEvents())
})
