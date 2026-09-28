// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/kobo/dto/PeriodDtoOracleTest.kt
import { ZoneId, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import '@js-joda/timezone'
import { toPeriodDto } from '../../../../../../src/interfaces/api/kobo/dto/PeriodDto.js'
import { oracle } from '../../../../oracle.js'
import { mapper } from '../../../../web-oracle.js'

const { func, kase } = oracle('interfaces/api/kobo/dto/PeriodDto')

func('toPeriodDto', () => {
  kase('utc', () => mapper().writeValueAsString(toPeriodDto(ZonedDateTime.of(2020, 1, 2, 3, 4, 5, 0, ZoneOffset.UTC))))
  kase('nanos', () => mapper().writeValueAsString(toPeriodDto(ZonedDateTime.of(2020, 1, 2, 3, 4, 5, 123456789, ZoneOffset.UTC))))
  kase('offset', () => mapper().writeValueAsString(toPeriodDto(ZonedDateTime.of(2020, 6, 2, 3, 4, 5, 0, ZoneOffset.ofHours(-5)))))
  kase('region', () => mapper().writeValueAsString(toPeriodDto(ZonedDateTime.of(2020, 6, 2, 3, 4, 5, 0, ZoneId.of('Europe/Paris')))))
})
