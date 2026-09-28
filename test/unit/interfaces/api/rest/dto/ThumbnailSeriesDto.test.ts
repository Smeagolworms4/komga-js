// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/ThumbnailSeriesDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Dimension } from '../../../../../../src/domain/model/Dimension.js'
import { ThumbnailSeries } from '../../../../../../src/domain/model/ThumbnailSeries.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/ThumbnailSeriesDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/ThumbnailSeriesDto')

const t = new ThumbnailSeries({
  thumbnail: new Uint8Array([1, 2, 3]),
  selected: true,
  type: ThumbnailSeries.Type.SIDECAR,
  mediaType: 'image/jpeg',
  fileSize: 12345,
  dimension: new Dimension({ width: 300, height: 400 }),
  id: 'T1',
  seriesId: 'X1',
  createdDate: LocalDateTime.of(2020, 1, 1, 0, 0),
})

func('toDto', () => {
  kase('SIDECAR', () => toDto(t))
  kase('USER_UPLOADED, not selected', () => toDto(t.copy({ type: ThumbnailSeries.Type.USER_UPLOADED, selected: false, dimension: new Dimension({ width: 0, height: 0 }) })))
  kase('json', () => json(toDto(t)))
})
