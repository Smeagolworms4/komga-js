// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/UtilsOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Media } from '../../../../src/domain/model/Media.js'
import { getBookLastModified, setNotModified } from '../../../../src/interfaces/api/Utils.js'
import { ResponseEntity } from '../../../../src/port/spring-web.js'
import { oracle } from '../../oracle.js'
import { describeEntity } from '../../web-oracle.js'

const { func, kase } = oracle('interfaces/api/Utils')

const media = (date: LocalDateTime) => new Media({ createdDate: date, lastModifiedDate: date })

const dates = [
  LocalDateTime.of(2020, 1, 2, 3, 4, 5),
  LocalDateTime.of(2020, 1, 2, 3, 4, 5, 678_000_000),
  LocalDateTime.of(2020, 1, 2, 3, 4, 5, 999_999_999),
  LocalDateTime.of(1970, 1, 1, 0, 0),
  LocalDateTime.of(1969, 12, 31, 23, 59, 59, 500_000_000),
  LocalDateTime.of(2021, 3, 28, 2, 30),
  LocalDateTime.of(9999, 12, 31, 23, 59, 59),
]

func('getBookLastModified', () => {
  for (const it of dates) kase(`${it}`, () => getBookLastModified(media(it)))
})

func('setNotModified', () => {
  for (const it of dates) kase(`${it}`, () => describeEntity(setNotModified(ResponseEntity.ok(), media(it)).build()))
})
