// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/kobo/dto/TagDtoOracleTest.kt
import { ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { SyncPoint } from '../../../../../../src/domain/model/SyncPoint.js'
import { TagItemDto } from '../../../../../../src/interfaces/api/kobo/dto/TagItemDto.js'
import { toWrappedTagDto } from '../../../../../../src/interfaces/api/kobo/dto/TagDto.js'
import { oracle } from '../../../../oracle.js'
import { mapper } from '../../../../web-oracle.js'

const { func, kase } = oracle('interfaces/api/kobo/dto/TagDto')

const readList = new SyncPoint.ReadList({
  syncPointId: 'SP1',
  readListId: 'R1',
  readListName: 'My "list" é',
  createdDate: ZonedDateTime.of(2020, 1, 2, 3, 4, 5, 0, ZoneOffset.UTC),
  lastModifiedDate: ZonedDateTime.of(2021, 1, 2, 3, 4, 5, 999000000, ZoneOffset.UTC),
  synced: false,
})

func('toWrappedTagDto', () => {
  kase('no items', () => mapper().writeValueAsString(toWrappedTagDto(readList)))
  kase('empty items', () => mapper().writeValueAsString(toWrappedTagDto(readList, { items: [] })))
  kase('items', () => mapper().writeValueAsString(toWrappedTagDto(readList, { items: [new TagItemDto({ revisionId: 'B1' }), new TagItemDto({ revisionId: 'B2' })] })))
  kase('on deck', () =>
    mapper().writeValueAsString(toWrappedTagDto(readList.copy({ readListId: SyncPoint.ReadList.ON_DECK_ID, readListName: 'On Deck' }), { items: [new TagItemDto({ revisionId: 'B3' })] })),
  )
})
