// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/koreader/KoreaderProgressConverterOracleTest.kt
import { BookWithMedia } from '../../../../src/domain/model/BookWithMedia.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { MediaExtensionEpub } from '../../../../src/domain/model/MediaExtension.js'
import { R2Locator } from '../../../../src/domain/model/R2Locator.js'
import { KoreaderProgressConverter } from '../../../../src/infrastructure/koreader/KoreaderProgressConverter.js'
import { DocumentProgressDto } from '../../../../src/interfaces/api/kosync/dto/DocumentProgressDto.js'
import { OracleDb } from '../../db.js'
import { setup } from '../../interfaces/data.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/koreader/KoreaderProgressConverter')

const db = new OracleDb()
const converter = new KoreaderProgressConverter(db.mediaDao)
const f32 = Math.fround

function attempt(block: () => unknown): unknown {
  try {
    return block()
  } catch (e) {
    return [(e as Error).name, (e as Error).message]
  }
}

/** the R2Progression without its `modified` date (now) */
const convert = (bookId: string, progress: string, percentage = 0.5, media: Media | null = null) =>
  attempt(() => {
    const book = db.bookDao.findByIdOrNull(bookId)!
    const it = converter.convertKoreaderProgressToR2(
      new DocumentProgressDto({ document: 'doc', percentage: f32(percentage), progress, device: 'KOReader dev', deviceId: 'dev-id' }),
      new BookWithMedia({ book, media: media ?? db.mediaDao.findById(bookId) }),
    )
    return it === null ? null : [it.device, it.locator]
  })

const loc = (href: string, progression: number, position: number, totalProgression: number) =>
  new R2Locator({ href, type: 'application/xhtml+xml', locations: new R2Locator.Location({ progression: f32(progression), position, totalProgression: f32(totalProgression) }) })

func('convertKoreaderProgressToR2', () => {
  kase('setup', () => {
    setup(db)
    db.mediaDao.update(
      db.mediaDao.findById('B6').copy({
        extension: new MediaExtensionEpub({
          positions: [loc('OEBPS/cover.xhtml', 0, 1, 0), loc('OEBPS/ch 1.xhtml', 0, 2, 0.3), loc('OEBPS/ch 1.xhtml', 0.5, 3, 0.6), loc('OEBPS/ch2.xhtml', 0, 4, 0.9)],
        }),
      }),
    )
  })
  kase('divina page', () => convert('B1', '2', 0.66))
  kase('divina invalid page', () => convert('B1', 'abc'))
  kase('divina negative page', () => convert('B2', '-3', 0.1))
  kase('pdf page', () => convert('B5', '4', 1))
  kase('epub doc fragment', () => convert('B6', '/body/DocFragment[2]/body/div/p[1]/text().0', 0.3))
  kase('epub doc fragment without brackets', () => convert('B6', '/body/DocFragment/body/p', 0.01))
  kase('epub toc fragment', () => convert('B6', '#_doc_fragment_2_ c37', 0.95))
  kase('epub index out of range', () => convert('B6', '/body/DocFragment[9].0'))
  kase('epub unparseable', () => convert('B6', 'garbage'))
  kase('epub without extension', () => convert('B4', '/body/DocFragment[1].0'))
  kase('no profile', () => convert('B1', '1', 0.5, new Media({ status: Media.Status.READY, mediaType: 'application/octet-stream', bookId: 'B1' })))
  kase('unknown media', () => convert('B1', '1', 0.5, new Media({ bookId: 'B1' })))
})
