// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/PageHashUnknownDtoOracleTest.kt
import { PageHashUnknown } from '../../../../../../src/domain/model/PageHashUnknown.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/PageHashUnknownDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/PageHashUnknownDto')

func('toDto', () => {
  kase('all fields', () => toDto(new PageHashUnknown({ hash: 'abc', size: 99, matchCount: 4 })))
  kase('defaults', () => toDto(new PageHashUnknown({ hash: 'abc' })))
  kase('json', () => json(toDto(new PageHashUnknown({ hash: 'abc', size: 5000000000, matchCount: 1 }))))
})
