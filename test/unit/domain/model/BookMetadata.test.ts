// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/BookMetadataOracleTest.kt
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { Author } from '../../../../src/domain/model/Author.js'
import { BookMetadata } from '../../../../src/domain/model/BookMetadata.js'
import { WebLink } from '../../../../src/domain/model/WebLink.js'
import { URI } from '../../../../src/port/java-net.js'
import { eq, kFloat } from '../../../../src/port/kotlin.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/BookMetadata')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)
const minimal = new BookMetadata({ title: ' T ', number: ' 1 ', numberSort: 1, bookId: 'B1', createdDate: date })
const full = new BookMetadata({
  title: ' Été ',
  summary: ' summary\n',
  number: ' 1.5 ',
  numberSort: 1.5,
  releaseDate: LocalDate.of(2021, 2, 28),
  authors: [new Author({ name: ' John ', role: 'WRITER' }), new Author({ name: 'Jane', role: 'penciller' })],
  tags: new Set(['TAG', 'tag ', ' ', 'Other']),
  isbn: '9781234567897',
  links: [new WebLink({ label: 'Site', url: new URI('https://example.org/a?b=c') })],
  titleLock: true,
  summaryLock: true,
  numberLock: true,
  numberSortLock: true,
  releaseDateLock: true,
  authorsLock: true,
  tagsLock: true,
  isbnLock: true,
  linksLock: true,
  bookId: 'B2',
  createdDate: LocalDateTime.of(2021, 1, 2, 3, 4, 5, 6),
  lastModifiedDate: LocalDateTime.of(2022, 1, 2, 3, 4),
})

func('<init>', () => {
  kase('minimal', () => minimal)
  kase('full', () => full)
  kase('float number sort', () =>
    [0.1, -0, 1e10, NaN, Infinity, 3.3333333].map((it) => new BookMetadata({ title: '', number: '', numberSort: it, createdDate: date }).numberSort),
  )
})
func('copy', () => {
  kase('no change', () => full.copy())
  kase('renormalizes values', () => full.copy({ title: '  New ', summary: ' s ', number: ' 2 ', tags: new Set(['Y', 'y', '']) }))
  kase('nullables', () => full.copy({ releaseDate: null }))
  kase('authors copied', () => {
    const it = full.copy().authors
    return [eq(it, full.authors), it === full.authors]
  })
  kase('lists and locks', () =>
    minimal.copy({ authors: [], links: [new WebLink({ label: 'a', url: new URI('file:/x') })], isbn: '', titleLock: true, linksLock: true, bookId: '' }),
  )
  kase('number sort', () => minimal.copy({ numberSort: 0.3 }).numberSort)
  kase('dates', () => minimal.copy({ createdDate: LocalDateTime.of(2019, 1, 1, 0, 0), lastModifiedDate: LocalDateTime.of(2018, 1, 1, 0, 0) }))
})
func('toString', () => {
  kase('minimal', () => minimal.toString())
  kase('full', () => full.toString())
  kase('number sorts', () => [0, 0.1, 1e10, 1.0e-5, 123456.79, -2.5, NaN].map((it) => minimal.copy({ numberSort: kFloat(it) }).toString().split(',')[0]))
  kase('quotes', () => new BookMetadata({ title: "it's", number: "'", numberSort: 0, isbn: "'", createdDate: date }).toString())
})
