// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/PageHashKnownDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { PageHashKnown } from '../../../../../../src/domain/model/PageHashKnown.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/PageHashKnownDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/PageHashKnownDto')

const p = new PageHashKnown({
  hash: 'abc',
  size: 1234,
  action: PageHashKnown.Action.DELETE_AUTO,
  deleteCount: 3,
  matchCount: 7,
  createdDate: LocalDateTime.of(2021, 8, 1, 12, 0),
  lastModifiedDate: LocalDateTime.of(2021, 12, 1, 12, 0),
})

func('toDto', () => {
  kase('all fields', () => toDto(p))
  kase('null size, ignore', () => toDto(new PageHashKnown({ hash: 'h', size: null, action: PageHashKnown.Action.IGNORE, createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) })))
  kase('json', () => json(toDto(p)))
})
