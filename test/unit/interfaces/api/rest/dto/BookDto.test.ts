// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/BookDtoOracleTest.kt
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { AuthorDto } from '../../../../../../src/interfaces/api/rest/dto/AuthorDto.js'
import { BookDto, BookMetadataDto, MediaDto, ReadProgressDto, restrictUrl } from '../../../../../../src/interfaces/api/rest/dto/BookDto.js'
import { WebLinkDto } from '../../../../../../src/interfaces/api/rest/dto/WebLinkDto.js'
import { kFloat } from '../../../../../../src/port/kotlin.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/BookDto')

const d = LocalDateTime.of(2020, 3, 4, 5, 6, 7)

const book = (url: string, sizeBytes = 1536) =>
  new BookDto({
    id: 'B1',
    seriesId: 'S1',
    seriesTitle: 'Series',
    libraryId: 'L1',
    name: 'Book',
    url,
    number: 1,
    created: d,
    lastModified: d,
    fileLastModified: d,
    sizeBytes,
    media: new MediaDto({ status: 'READY', mediaType: 'application/zip', pagesCount: 10, comment: '', epubDivinaCompatible: false, epubIsKepub: false }),
    metadata: new BookMetadataDto({
      title: 'Title',
      titleLock: false,
      summary: 'Summary',
      summaryLock: true,
      number: '1',
      numberLock: false,
      numberSort: kFloat(1.5),
      numberSortLock: false,
      releaseDate: LocalDate.of(2020, 1, 1),
      releaseDateLock: false,
      authors: [new AuthorDto({ name: 'a', role: 'writer' })],
      authorsLock: false,
      tags: new Set(['t2', 't1']),
      tagsLock: false,
      isbn: '9781234567897',
      isbnLock: false,
      links: [new WebLinkDto({ label: 'l', url: 'https://l' })],
      linksLock: false,
      created: d,
      lastModified: d,
    }),
    readProgress: new ReadProgressDto({ page: 3, completed: false, readDate: d, created: d, lastModified: d, deviceId: 'dev', deviceName: 'Device' }),
    deleted: false,
    fileHash: 'hash',
    oneshot: false,
  })

func('restrictUrl', () => {
  kase('not restricted', () => restrictUrl(book('/data/lib/series/book.cbz'), false))
  kase('restricted', () => restrictUrl(book('/data/lib/series/book.cbz'), true).url)
  kase('restricted windows path', () => restrictUrl(book('C:\\data\\lib\\book.cbz'), true).url)
  kase('restricted no directory', () => restrictUrl(book('book.cbz'), true).url)
  kase('restricted trailing slash', () => restrictUrl(book('/data/lib/'), true).url)
  kase('restricted empty', () => restrictUrl(book(''), true).url)
  kase('size formats', () => [0, 1, 1023, 1024, 1536, 1048576, 123456789, 1099511627776].map((it) => book('x', it).size))
  kase('json', () => json(restrictUrl(book('/a/b.cbz'), true)))
})
