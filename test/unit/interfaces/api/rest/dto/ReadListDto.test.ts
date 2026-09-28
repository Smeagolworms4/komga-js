// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/ReadListDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { ReadList } from '../../../../../../src/domain/model/ReadList.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/ReadListDto.js'
import { sortedMapOf } from '../../../../../../src/port/extra-metadata.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/ReadListDto')

const rl = new ReadList({
  name: 'RL',
  summary: 'sum',
  ordered: false,
  bookIds: sortedMapOf<number, string>([3, 'B3'], [1, 'B1'], [2, 'B2']),
  id: 'R1',
  createdDate: LocalDateTime.of(2020, 5, 5, 5, 5, 5),
  lastModifiedDate: LocalDateTime.of(2020, 11, 5, 5, 5, 5),
  filtered: true,
})

func('toDto', () => {
  kase('book ids in key order', () => toDto(rl))
  kase('empty', () => toDto(rl.copy({ bookIds: sortedMapOf() })))
  kase('sparse keys', () => toDto(rl.copy({ bookIds: sortedMapOf<number, string>([10, 'A'], [-1, 'Z'], [5, 'M']) })))
  kase('json', () => json(toDto(rl)))
})
