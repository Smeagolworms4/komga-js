// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/CollectionDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { SeriesCollection } from '../../../../../../src/domain/model/SeriesCollection.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/CollectionDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/CollectionDto')

const c = new SeriesCollection({
  name: 'Coll',
  ordered: true,
  seriesIds: ['S2', 'S1', 'S3'],
  id: 'C1',
  createdDate: LocalDateTime.of(2020, 5, 5, 5, 5, 5),
  lastModifiedDate: LocalDateTime.of(2020, 11, 5, 5, 5, 5, 5000000),
  filtered: true,
})

func('toDto', () => {
  kase('all fields', () => toDto(c))
  kase('empty', () => toDto(c.copy({ seriesIds: [], ordered: false, filtered: false })))
  kase('json', () => json(toDto(c)))
})
