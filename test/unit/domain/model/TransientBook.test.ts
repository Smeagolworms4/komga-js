// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/TransientBookOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../src/domain/model/Book.js'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { TransientBook, toBookWithMedia } from '../../../../src/domain/model/TransientBook.js'
import { URL } from '../../../../src/port/java-net.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/TransientBook')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)
const book = new Book({ name: 'b.cbz', url: new URL('file:/lib/b.cbz'), fileLastModified: date, fileSize: 10, id: 'B1', seriesId: 'S1', libraryId: 'L1', createdDate: date })
const media = new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: [new BookPage({ fileName: '1.jpg', mediaType: 'image/jpeg' })], bookId: 'B1', createdDate: date })

func('toBookWithMedia', () => {
  kase('defaults', () => toBookWithMedia(new TransientBook({ book, media })))
  kase('metadata ignored', () => toBookWithMedia(new TransientBook({ book, media, metadata: new TransientBook.Metadata({ number: 1.5, seriesId: 'S9' }) })))
  kase('same instances', () => {
    const bwm = toBookWithMedia(new TransientBook({ book, media }))
    return [bwm.book === book, bwm.media === media]
  })
  kase('empty media', () => toBookWithMedia(new TransientBook({ book, media: new Media({ bookId: 'B1', createdDate: date }) })).media)
})
