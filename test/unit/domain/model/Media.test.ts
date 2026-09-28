// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/MediaOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { MediaExtensionEpub } from '../../../../src/domain/model/MediaExtension.js'
import { MediaFile } from '../../../../src/domain/model/MediaFile.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/Media')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)

func('toString', () => {
  kase('defaults', () => new Media({ createdDate: date }).toString())
  kase('full', () =>
    new Media({
      status: Media.Status.READY,
      mediaType: 'application/epub+zip',
      pages: [new BookPage({ fileName: '1.jpg', mediaType: 'image/jpeg' })],
      pageCount: 7,
      files: [new MediaFile({ fileName: 'a.css' })],
      comment: "ERR_1000 'quoted'",
      extension: new MediaExtensionEpub({ isFixedLayout: true }),
      bookId: 'B1',
      epubDivinaCompatible: true,
      epubIsKepub: true,
      createdDate: LocalDateTime.of(2021, 2, 3, 4, 5, 6, 7),
      lastModifiedDate: LocalDateTime.of(2021, 2, 3, 4, 5),
    }).toString(),
  )
  kase('unicode comment', () => new Media({ status: Media.Status.ERROR, comment: 'échec 漫画', bookId: '', createdDate: date }).toString())
  kase('empty strings', () => new Media({ status: Media.Status.OUTDATED, mediaType: '', comment: '', createdDate: date }).toString())
})
