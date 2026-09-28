// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/ThumbnailSeriesCollectionDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Dimension } from '../../../../../../src/domain/model/Dimension.js'
import { ThumbnailSeriesCollection } from '../../../../../../src/domain/model/ThumbnailSeriesCollection.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/ThumbnailSeriesCollectionDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/ThumbnailSeriesCollectionDto')

const t = new ThumbnailSeriesCollection({
  thumbnail: new Uint8Array([1, 2, 3]),
  selected: true,
  type: ThumbnailSeriesCollection.Type.USER_UPLOADED,
  mediaType: 'image/jpeg',
  fileSize: 12345,
  dimension: new Dimension({ width: 300, height: 400 }),
  id: 'T1',
  collectionId: 'X1',
  createdDate: LocalDateTime.of(2020, 1, 1, 0, 0),
})

func('toDto', () => {
  kase('USER_UPLOADED', () => toDto(t))
  kase('USER_UPLOADED, not selected', () => toDto(t.copy({ type: ThumbnailSeriesCollection.Type.USER_UPLOADED, selected: false, dimension: new Dimension({ width: 0, height: 0 }) })))
  kase('json', () => json(toDto(t)))
})
