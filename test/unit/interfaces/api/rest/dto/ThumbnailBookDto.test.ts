// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/ThumbnailBookDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Dimension } from '../../../../../../src/domain/model/Dimension.js'
import { ThumbnailBook } from '../../../../../../src/domain/model/ThumbnailBook.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/ThumbnailBookDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/ThumbnailBookDto')

const t = new ThumbnailBook({
  thumbnail: new Uint8Array([1, 2, 3]),
  selected: true,
  type: ThumbnailBook.Type.GENERATED,
  mediaType: 'image/jpeg',
  fileSize: 12345,
  dimension: new Dimension({ width: 300, height: 400 }),
  id: 'T1',
  bookId: 'X1',
  createdDate: LocalDateTime.of(2020, 1, 1, 0, 0),
})

func('toDto', () => {
  kase('GENERATED', () => toDto(t))
  kase('SIDECAR, not selected', () => toDto(t.copy({ type: ThumbnailBook.Type.SIDECAR, selected: false, dimension: new Dimension({ width: 0, height: 0 }) })))
  kase('json', () => json(toDto(t)))
})
