// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/AuthenticationActivityDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { AuthenticationActivity } from '../../../../../../src/domain/model/AuthenticationActivity.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/AuthenticationActivityDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/AuthenticationActivityDto')

const full = new AuthenticationActivity({
  userId: 'U1',
  email: 'a@b.c',
  apiKeyId: 'K1',
  apiKeyComment: 'comment',
  ip: '127.0.0.1',
  userAgent: 'agent',
  success: false,
  error: 'Bad credentials',
  dateTime: LocalDateTime.of(2021, 7, 1, 10, 20, 30, 999999999),
  source: 'Password',
})

func('toDto', () => {
  kase('all fields', () => toDto(full))
  kase('nulls', () => toDto(new AuthenticationActivity({ success: true, dateTime: LocalDateTime.of(2020, 12, 31, 23, 59, 59) })))
  kase('dst gap', () => toDto(full.copy({ dateTime: LocalDateTime.of(2021, 3, 28, 2, 0) })))
  kase('json all fields', () => json(toDto(full)))
  kase('json nulls', () => json(toDto(new AuthenticationActivity({ success: true, dateTime: LocalDateTime.of(2020, 1, 1, 0, 0, 0, 500) }))))
})
