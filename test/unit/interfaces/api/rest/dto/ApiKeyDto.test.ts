// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/ApiKeyDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { ApiKey } from '../../../../../../src/domain/model/ApiKey.js'
import { redacted, toDto } from '../../../../../../src/interfaces/api/rest/dto/ApiKeyDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/ApiKeyDto')

const key = new ApiKey({
  id: 'K1',
  userId: 'U1',
  key: 'secretkey',
  comment: 'my key',
  createdDate: LocalDateTime.of(2021, 6, 15, 12, 30, 45, 123000000),
  lastModifiedDate: LocalDateTime.of(2022, 1, 1, 0, 0),
})

func('toDto', () => {
  kase('summer, lastModified is createdDate', () => toDto(key))
  kase('winter', () => toDto(key.copy({ createdDate: LocalDateTime.of(2021, 1, 15, 0, 0) })))
  kase('dst gap', () => toDto(key.copy({ createdDate: LocalDateTime.of(2021, 3, 28, 2, 30) })))
  kase('dst overlap', () => toDto(key.copy({ createdDate: LocalDateTime.of(2021, 10, 31, 2, 30) })))
  kase('json', () => json(toDto(key)))
})
func('redacted', () => {
  kase('key replaced', () => redacted(toDto(key)))
  kase('empty key', () => redacted(toDto(key.copy({ key: '' }))))
  kase('json', () => json(redacted(toDto(key))))
})
