// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/kobo/dto/BookEntitlementDtoOracleTest.kt
import { ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { SyncPoint } from '../../../../../../src/domain/model/SyncPoint.js'
import { toBookEntitlementDto } from '../../../../../../src/interfaces/api/kobo/dto/BookEntitlementDto.js'
import { oracle } from '../../../../oracle.js'
import { mapper, stableText } from '../../../../web-oracle.js'

const { func, kase } = oracle('interfaces/api/kobo/dto/BookEntitlementDto')

const date = ZonedDateTime.of(2020, 1, 2, 3, 4, 5, 0, ZoneOffset.UTC)
const book = new SyncPoint.Book({
  syncPointId: 'SP1',
  bookId: 'B1',
  createdDate: date,
  lastModifiedDate: date.plusDays(1),
  fileLastModified: date.plusDays(2),
  fileSize: 1234,
  fileHash: 'hash',
  metadataLastModifiedDate: date.plusDays(3),
  thumbnailId: 'T1',
  synced: false,
})

func('toBookEntitlementDto', () => {
  kase('not removed', () => stableText(mapper().writeValueAsString(toBookEntitlementDto(book, false))))
  kase('removed', () => stableText(mapper().writeValueAsString(toBookEntitlementDto(book.copy({ thumbnailId: null, synced: true }), true))))
})
